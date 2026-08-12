
-- ===== criar_ordem_mercado: cria ordem de compra/venda de item + casamento inline =====
create or replace function dev.criar_ordem_mercado(p_item_id text, p_side text, p_unit_price int, p_quantity int)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item dev.items;
  v_ordem_id uuid;
  v_gold_retido int;
  v_candidata record;
  v_restante int;
  v_retido int;
  v_executado int := 0;
  v_gasto_total bigint := 0;
  v_recebido_total bigint := 0;
  v_qtd int;
  v_valor bigint;
  v_novo_restante_outra int;
  v_troco bigint;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;
  if p_side not in ('compra','venda') then raise exception 'side deve ser "compra" ou "venda"'; end if;
  if p_unit_price is null or p_unit_price <= 0 or p_unit_price > 100000000 then raise exception 'unitPrice invalido'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 then raise exception 'quantity invalido'; end if;

  select * into v_item from dev.items where id = p_item_id;
  if v_item is null then raise exception 'item desconhecido'; end if;

  if p_side = 'venda' then
    if exists(select 1 from dev.player_items where user_id=v_user_id and item_id=p_item_id and locked) then
      raise exception 'Este item esta travado — destrave antes de anunciar.';
    end if;
    update dev.player_items set quantity = quantity - p_quantity, updated_at = now()
      where user_id = v_user_id and item_id = p_item_id and quantity >= p_quantity;
    if not found then raise exception 'Voce nao tem essa quantidade.'; end if;
    v_gold_retido := 0;
  else
    v_gold_retido := p_unit_price * p_quantity;
    update dev.players set gold = gold - v_gold_retido where user_id = v_user_id and gold >= v_gold_retido;
    if not found then raise exception 'Ouro insuficiente.'; end if;
  end if;

  insert into dev.market_orders (user_id, item_id, side, unit_price, quantity, remaining, gold_retido)
  values (v_user_id, p_item_id, p_side, p_unit_price, p_quantity, p_quantity, v_gold_retido)
  returning id into v_ordem_id;

  v_restante := p_quantity;
  v_retido := v_gold_retido;

  for v_candidata in
    select * from dev.market_orders
    where item_id = p_item_id
      and side = case when p_side='compra' then 'venda' else 'compra' end
      and status = 'ativa'
      and user_id != v_user_id
      and (case when p_side='compra' then unit_price <= p_unit_price else unit_price >= p_unit_price end)
    order by (case when p_side='compra' then unit_price else -unit_price end) asc, created_at asc
    limit 40
    for update skip locked
  loop
    exit when v_restante <= 0;
    v_qtd := least(v_restante, v_candidata.remaining);
    continue when v_qtd <= 0;
    v_valor := v_candidata.unit_price::bigint * v_qtd;
    v_novo_restante_outra := v_candidata.remaining - v_qtd;

    update dev.market_orders set
      remaining = v_novo_restante_outra,
      status = case when v_novo_restante_outra = 0 then 'concluida' else 'ativa' end,
      closed_at = case when v_novo_restante_outra = 0 then now() else null end,
      gold_retido = case when side = 'compra' then greatest(0, gold_retido - v_valor) else gold_retido end
    where id = v_candidata.id;

    if p_side = 'compra' then
      insert into dev.player_items (user_id, item_id, quantity) values (v_user_id, p_item_id, v_qtd)
        on conflict (user_id, item_id) do update set quantity = dev.player_items.quantity + v_qtd, updated_at = now();
      v_troco := (p_unit_price - v_candidata.unit_price)::bigint * v_qtd;
      if v_troco > 0 then
        update dev.players set gold = gold + v_troco where user_id = v_user_id;
      end if;
      v_retido := greatest(0, v_retido - p_unit_price * v_qtd);
      v_gasto_total := v_gasto_total + v_valor;
      update dev.players set gold = gold + v_valor where user_id = v_candidata.user_id;
    else
      update dev.players set gold = gold + v_valor where user_id = v_user_id;
      v_recebido_total := v_recebido_total + v_valor;
      insert into dev.player_items (user_id, item_id, quantity) values (v_candidata.user_id, p_item_id, v_qtd)
        on conflict (user_id, item_id) do update set quantity = dev.player_items.quantity + v_qtd, updated_at = now();
    end if;

    insert into dev.market_trades (kind, item_id, quantity, unit_price, currency, buyer_id, seller_id)
    values ('item', p_item_id, v_qtd, v_candidata.unit_price, 'gold',
      case when p_side='compra' then v_user_id else v_candidata.user_id end,
      case when p_side='compra' then v_candidata.user_id else v_user_id end);

    v_restante := v_restante - v_qtd;
    v_executado := v_executado + v_qtd;
  end loop;

  update dev.market_orders set
    remaining = v_restante,
    gold_retido = case when p_side='compra' then v_retido else 0 end,
    status = case when v_restante = 0 then 'concluida' else 'ativa' end,
    closed_at = case when v_restante = 0 then now() else null end
  where id = v_ordem_id;

  return jsonb_build_object('ok', true, 'ordemId', v_ordem_id, 'executado', v_executado, 'gastoTotal', v_gasto_total, 'recebidoTotal', v_recebido_total);
end;
$$;
revoke all on function dev.criar_ordem_mercado(text, text, int, int) from public;
grant execute on function dev.criar_ordem_mercado(text, text, int, int) to authenticated;

-- ===== cancelar_ordem_mercado =====
create or replace function dev.cancelar_ordem_mercado(p_ordem_id uuid)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ordem dev.market_orders;
  v_item_nome text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  update dev.market_orders set status='cancelada', closed_at=now()
    where id = p_ordem_id and user_id = v_user_id and status = 'ativa'
    returning * into v_ordem;
  if v_ordem is null then raise exception 'ordem nao encontrada ou ja encerrada'; end if;

  if v_ordem.side = 'venda' then
    insert into dev.player_items (user_id, item_id, quantity) values (v_user_id, v_ordem.item_id, v_ordem.remaining)
      on conflict (user_id, item_id) do update set quantity = dev.player_items.quantity + v_ordem.remaining, updated_at = now();
    select name into v_item_nome from dev.items where id = v_ordem.item_id;
    return jsonb_build_object('ok', true, 'mensagem', format('Ordem cancelada — %sx %s de volta na mochila.', v_ordem.remaining, coalesce(v_item_nome, v_ordem.item_id)));
  else
    update dev.players set gold = gold + v_ordem.gold_retido where user_id = v_user_id;
    return jsonb_build_object('ok', true, 'mensagem', format('Ordem cancelada — %s de ouro devolvido.', v_ordem.gold_retido));
  end if;
end;
$$;
revoke all on function dev.cancelar_ordem_mercado(uuid) from public;
grant execute on function dev.cancelar_ordem_mercado(uuid) to authenticated;

-- ===== anunciar_poke =====
create or replace function dev.anunciar_poke(p_poke_id uuid, p_price int, p_currency text, p_apenas_oferta boolean)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_poke dev.pokemon_instances;
  v_currency text := case when p_currency = 'diamond' then 'diamond' else 'gold' end;
  v_price int := case when p_apenas_oferta then null else p_price end;
  v_iv_percent int;
  v_nome text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;
  if not p_apenas_oferta and (p_price is null or p_price <= 0 or p_price > 100000000) then
    raise exception 'price invalido';
  end if;

  update dev.pokemon_instances set location='market', team_slot=null, updated_at=now()
    where id = p_poke_id and user_id = v_user_id and location = 'bag' and coalesce(locked,false) = false
    returning * into v_poke;
  if v_poke is null then
    raise exception 'POKE indisponivel — precisa estar na mochila e destravado.';
  end if;

  v_iv_percent := round((v_poke.iv_hp + v_poke.iv_atk_fis + v_poke.iv_atk_esp + v_poke.iv_def + v_poke.iv_def_esp + v_poke.iv_speed) / (31.0*6) * 100);

  insert into dev.market_listings (seller_id, poke_uid, price, apenas_oferta, currency, species_id, level, rarity, is_shiny, iv_percent)
  values (v_user_id, p_poke_id, v_price, p_apenas_oferta, v_currency, v_poke.species_id, v_poke.level, v_poke.rarity, v_poke.is_shiny, v_iv_percent);

  select name into v_nome from dev.species where id = v_poke.species_id;
  return jsonb_build_object('ok', true, 'mensagem',
    case when p_apenas_oferta then format('%s anunciado para receber lances.', coalesce(v_nome, v_poke.species_id))
    else format('%s anunciado por %s %s.', coalesce(v_nome, v_poke.species_id), v_price, case when v_currency='gold' then 'de ouro' else 'diamante(s)' end) end);
end;
$$;
revoke all on function dev.anunciar_poke(uuid, int, text, boolean) from public;
grant execute on function dev.anunciar_poke(uuid, int, text, boolean) to authenticated;

-- ===== comprar_anuncio =====
create or replace function dev.comprar_anuncio(p_anuncio_id uuid)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_anuncio dev.market_listings;
  v_nome text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  select * into v_anuncio from dev.market_listings where id = p_anuncio_id for update;
  if v_anuncio is null or v_anuncio.status != 'ativo' then
    raise exception 'Este anuncio nao esta mais disponivel.';
  end if;
  if v_anuncio.seller_id = v_user_id then
    raise exception 'Voce nao pode comprar o proprio anuncio.';
  end if;
  if v_anuncio.apenas_oferta or v_anuncio.price is null then
    raise exception 'Este anuncio so aceita lances — envie uma oferta.';
  end if;

  if v_anuncio.currency = 'gold' then
    update dev.players set gold = gold - v_anuncio.price where user_id = v_user_id and gold >= v_anuncio.price;
  else
    update dev.players set diamonds = diamonds - v_anuncio.price where user_id = v_user_id and diamonds >= v_anuncio.price;
  end if;
  if not found then
    raise exception '%', case when v_anuncio.currency='gold' then 'Ouro insuficiente.' else 'Diamantes insuficientes.' end;
  end if;

  update dev.market_listings set status='vendido', sold_at=now(), buyer_id=v_user_id where id = p_anuncio_id;
  update dev.pokemon_instances set user_id=v_user_id, location='bag', team_slot=null, updated_at=now() where id = v_anuncio.poke_uid;

  if v_anuncio.currency = 'gold' then
    update dev.players set gold = gold + v_anuncio.price where user_id = v_anuncio.seller_id;
  else
    update dev.players set diamonds = diamonds + v_anuncio.price where user_id = v_anuncio.seller_id;
  end if;

  insert into dev.market_trades (kind, species_id, quantity, unit_price, currency, buyer_id, seller_id)
  values ('poke', v_anuncio.species_id, 1, v_anuncio.price, v_anuncio.currency, v_user_id, v_anuncio.seller_id);

  select name into v_nome from dev.species where id = v_anuncio.species_id;
  return jsonb_build_object('ok', true, 'mensagem', format('%s comprado! Ele esta na sua mochila.', coalesce(v_nome, v_anuncio.species_id)));
end;
$$;
revoke all on function dev.comprar_anuncio(uuid) from public;
grant execute on function dev.comprar_anuncio(uuid) to authenticated;

-- ===== ofertar_no_anuncio =====
create or replace function dev.ofertar_no_anuncio(p_anuncio_id uuid, p_valor bigint)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_anuncio dev.market_listings;
  v_nome text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;
  if p_valor is null or p_valor <= 0 or p_valor > 100000000 then raise exception 'valor invalido'; end if;

  select * into v_anuncio from dev.market_listings where id = p_anuncio_id;
  if v_anuncio is null or v_anuncio.status != 'ativo' then
    raise exception 'Este anuncio nao esta mais disponivel.';
  end if;
  if not v_anuncio.apenas_oferta then
    raise exception 'Este anuncio tem preco fixo — use Comprar.';
  end if;
  if v_anuncio.seller_id = v_user_id then
    raise exception 'Voce nao pode ofertar no proprio anuncio.';
  end if;

  if v_anuncio.currency = 'gold' then
    update dev.players set gold = gold - p_valor where user_id = v_user_id and gold >= p_valor;
  else
    update dev.players set diamonds = diamonds - p_valor where user_id = v_user_id and diamonds >= p_valor;
  end if;
  if not found then
    raise exception '%', case when v_anuncio.currency='gold' then 'Ouro insuficiente.' else 'Diamantes insuficientes.' end;
  end if;

  begin
    insert into dev.market_offers (listing_id, buyer_id, valor, currency)
    values (p_anuncio_id, v_user_id, p_valor, v_anuncio.currency);
  exception when unique_violation then
    raise exception 'Voce ja tem um lance pendente neste anuncio — cancele antes de enviar outro.';
  end;

  select name into v_nome from dev.species where id = v_anuncio.species_id;
  return jsonb_build_object('ok', true, 'mensagem', format('Oferta de %s enviada por %s. O valor fica retido ate o vendedor responder.', p_valor, coalesce(v_nome, v_anuncio.species_id)));
end;
$$;
revoke all on function dev.ofertar_no_anuncio(uuid, bigint) from public;
grant execute on function dev.ofertar_no_anuncio(uuid, bigint) to authenticated;

-- ===== cancelar_oferta =====
create or replace function dev.cancelar_oferta(p_oferta_id uuid)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_oferta dev.market_offers;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  update dev.market_offers set status='cancelada', resolved_at=now()
    where id = p_oferta_id and buyer_id = v_user_id and status = 'pendente'
    returning * into v_oferta;
  if v_oferta is null then raise exception 'oferta nao encontrada ou ja respondida'; end if;

  if v_oferta.currency = 'gold' then
    update dev.players set gold = gold + v_oferta.valor where user_id = v_user_id;
  else
    update dev.players set diamonds = diamonds + v_oferta.valor where user_id = v_user_id;
  end if;

  return jsonb_build_object('ok', true, 'mensagem', format('Oferta cancelada — %s devolvido(s).', v_oferta.valor));
end;
$$;
revoke all on function dev.cancelar_oferta(uuid) from public;
grant execute on function dev.cancelar_oferta(uuid) to authenticated;

-- ===== responder_oferta =====
create or replace function dev.responder_oferta(p_oferta_id uuid, p_aceitar boolean)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_oferta dev.market_offers;
  v_anuncio dev.market_listings;
  v_nome text;
  v_devolvidas int;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  select * into v_oferta from dev.market_offers where id = p_oferta_id for update;
  if v_oferta is null or v_oferta.status != 'pendente' then
    raise exception 'Esta oferta ja foi respondida.';
  end if;

  select * into v_anuncio from dev.market_listings where id = v_oferta.listing_id for update;
  if v_anuncio is null then raise exception 'anuncio nao encontrado'; end if;
  if v_anuncio.seller_id != v_user_id then raise exception 'Esta oferta nao e de um anuncio seu.'; end if;

  select name into v_nome from dev.species where id = v_anuncio.species_id;

  if not p_aceitar then
    update dev.market_offers set status='recusada', resolved_at=now() where id = p_oferta_id;
    if v_oferta.currency = 'gold' then
      update dev.players set gold = gold + v_oferta.valor where user_id = v_oferta.buyer_id;
    else
      update dev.players set diamonds = diamonds + v_oferta.valor where user_id = v_oferta.buyer_id;
    end if;
    return jsonb_build_object('ok', true, 'mensagem', 'Oferta recusada — o valor foi devolvido ao ofertante.');
  end if;

  if v_anuncio.status != 'ativo' then
    raise exception 'Este anuncio ja tinha sido encerrado.';
  end if;

  update dev.market_offers set status='aceita', resolved_at=now() where id = p_oferta_id;
  update dev.market_listings set status='vendido', sold_at=now(), buyer_id=v_oferta.buyer_id where id = v_anuncio.id;
  update dev.pokemon_instances set user_id=v_oferta.buyer_id, location='bag', team_slot=null, updated_at=now() where id = v_anuncio.poke_uid;

  if v_oferta.currency = 'gold' then
    update dev.players set gold = gold + v_oferta.valor where user_id = v_user_id;
  else
    update dev.players set diamonds = diamonds + v_oferta.valor where user_id = v_user_id;
  end if;

  insert into dev.market_trades (kind, species_id, quantity, unit_price, currency, buyer_id, seller_id)
  values ('poke', v_anuncio.species_id, 1, v_oferta.valor, v_oferta.currency, v_oferta.buyer_id, v_user_id);

  select dev.recusar_ofertas_pendentes(v_anuncio.id, format('Outra oferta por %s foi aceita', coalesce(v_nome, v_anuncio.species_id)), p_oferta_id) into v_devolvidas;

  return jsonb_build_object('ok', true, 'mensagem',
    case when v_devolvidas > 0
      then format('Lance aceito! %s foi entregue e %s outra(s) oferta(s) foram devolvidas.', coalesce(v_nome, v_anuncio.species_id), v_devolvidas)
      else format('Lance aceito! %s foi entregue ao ofertante.', coalesce(v_nome, v_anuncio.species_id))
    end);
end;
$$;
revoke all on function dev.responder_oferta(uuid, boolean) from public;
grant execute on function dev.responder_oferta(uuid, boolean) to authenticated;

-- ===== cancelar_anuncio =====
create or replace function dev.cancelar_anuncio(p_anuncio_id uuid)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_anuncio dev.market_listings;
  v_devolvidas int;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  update dev.market_listings set status='cancelado' where id = p_anuncio_id and seller_id = v_user_id and status = 'ativo'
    returning * into v_anuncio;
  if v_anuncio is null then raise exception 'anuncio nao encontrado ou ja encerrado'; end if;

  update dev.pokemon_instances set location='bag', team_slot=null, updated_at=now() where id = v_anuncio.poke_uid;

  select dev.recusar_ofertas_pendentes(p_anuncio_id, 'Anuncio retirado do Mercado') into v_devolvidas;

  return jsonb_build_object('ok', true, 'mensagem',
    case when v_devolvidas > 0
      then format('Anuncio cancelado — o POKE voltou pra sua mochila e %s oferta(s) foram devolvidas.', v_devolvidas)
      else 'Anuncio cancelado — o POKE voltou pra sua mochila.'
    end);
end;
$$;
revoke all on function dev.cancelar_anuncio(uuid) from public;
grant execute on function dev.cancelar_anuncio(uuid) to authenticated;
