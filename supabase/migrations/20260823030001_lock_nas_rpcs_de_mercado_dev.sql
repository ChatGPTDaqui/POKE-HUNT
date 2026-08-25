-- PH-67 — as 4 RPCs de Mercado passam a pegar o advisory lock por usuario.
--
-- Gemeo dev de `20260823030000_lock_nas_rpcs_de_mercado_public.sql`.
--
-- Fecha o ultimo buraco da varredura do PH-67: de 48 RPCs vigentes que dao
-- `update <schema>.players`, estas 4 eram as unicas que ainda nao
-- serializavam contra o flush do proprio jogador.
--
-- ===========================================================================
-- POR QUE SO O CALLER, E NAO AS DUAS PONTAS
-- ===========================================================================
-- Estas 4 mexem no ouro de DOIS jogadores: quem age e a contraparte. A ideia
-- obvia seria travar os dois, em ordem deterministica por uuid pra duas
-- compras cruzadas nao se deadlockarem. Nao e o certo aqui, por dois motivos.
--
-- 1. O incremento na contraparte nao precisa de lock. `update players set
--    gold = gold + X where user_id = Y` e atomico: o Postgres pega lock da
--    linha e o read-modify-write acontece dentro do proprio UPDATE. Ele nunca
--    perde valor numa corrida. O 409 que o PH-67 existe pra matar vem do CAS
--    do FLUSH (`where updated_at = <esperado>`), que e outra coisa — e quem
--    faz esse CAS e o dono da sessao, nao a contraparte.
--
-- 2. Em `criar_ordem_mercado`, travar a contraparte seria ativamente pior. O
--    loop de casamento usa `for update skip locked`, que PULA ordem travada
--    por outra transacao em vez de esperar. Advisory lock nao pula: bloqueia.
--    Somar um ao outro traria de volta a espera e o risco de deadlock que o
--    `skip locked` foi escolhido pra evitar.
--
-- Entao o lock aqui e o mesmo das outras 15: o do usuario que executa a acao,
-- logo depois da checagem de autenticacao e antes de qualquer leitura ou
-- escrita. A contraparte continua protegida pelo lock de linha do Postgres.
--
-- `recusar_ofertas_pendentes` e chamada de dentro de `responder_oferta`.
-- Advisory lock e reentrante na mesma transacao, entao pegar o mesmo lock duas
-- vezes nao custa nada nem trava.

begin;

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

  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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

  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

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

  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

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

create or replace function dev.recusar_ofertas_pendentes(p_anuncio_id uuid, p_motivo text, p_exceto uuid default null)
returns int
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_caller uuid := auth.uid();
  v_dono uuid;
  v_row record;
  v_count int := 0;
begin
  select seller_id into v_dono from dev.market_listings where id = p_anuncio_id;
  if v_dono is null then
    raise exception 'anuncio nao encontrado' using errcode = 'P0001';
  end if;
  -- Chamada acontece de dois jeitos: (a) o proprio dono via cancelar_anuncio/
  -- responder_oferta (auth.uid() = seller_id), ou (b) internamente por
  -- reiniciar_jogo, que roda como o vendedor mas nao muda auth.uid() (SECURITY
  -- DEFINER nao troca auth.uid(), so privilegio de tabela) -- entao o mesmo
  -- check cobre os dois casos, sem parametro extra de identidade.
  if v_caller is null or v_caller != v_dono then
    raise exception 'apenas o dono do anuncio pode recusar ofertas' using errcode = '42501';
  end if;

  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_caller::text));

  for v_row in
    select * from dev.market_offers
    where listing_id = p_anuncio_id and status = 'pendente' and (p_exceto is null or id != p_exceto)
    for update
  loop
    update dev.market_offers set status = 'recusada', resolved_at = now() where id = v_row.id;
    if v_row.currency = 'gold' then
      update dev.players set gold = gold + v_row.valor where user_id = v_row.buyer_id;
    else
      update dev.players set diamonds = diamonds + v_row.valor where user_id = v_row.buyer_id;
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

commit;
