-- Porte de dev.* pra public.* das migrations RPC-everything (2026-08-11/12).
-- Achado no pente-fino pre-merge (PH-6 branch): a leva inteira de RPC de
-- Mercado/Economia/Progressao/Chat/Correio/Ranking so existia em dev --
-- producao (schema public) nunca recebeu essas funcoes/views/policies.
-- Mesma logica de dev, so com o schema trocado (dev. -> public.,
-- search_path = dev, public -> search_path = public). Tabelas de public
-- ja tinham as mesmas colunas de dev antes deste porte -- so faltava a
-- camada de RPC/view/policy por cima.

-- ============ origem: 20260811203333_rls_leitura_publica_dev.sql ============
-- Projecao segura de players pra ranking/nomes de treinador — nunca gold/diamonds.
create view public.treinadores_publico as
  select user_id, trainer_name, trainer_level, trainer_exp from public.players;
grant select on public.treinadores_publico to authenticated;

-- pokemon_instances: linha inteira publica, mesmo raciocinio do ranking.ts original
-- ("nao guarda nada privado alem do user_id, que ja e devolvido").
create policy "pokemon leitura publica" on public.pokemon_instances
  for select to authenticated using (true);

-- hall_da_fama: sem dado sensivel.
create policy "hall leitura publica" on public.hall_da_fama
  for select to authenticated using (true);
grant select on public.hall_da_fama to authenticated;

-- game_sessions: so a propria (perfil precisa somar simulated_seconds).
create policy "sessao leitura propria" on public.game_sessions
  for select to authenticated using (auth.uid() = user_id);
grant select on public.game_sessions to authenticated;

-- market_listings: navegacao publica de ativos + historico proprio de qualquer status.
create policy "anuncio leitura publica ativos" on public.market_listings
  for select to authenticated using (status = 'ativo');
create policy "anuncio leitura propria" on public.market_listings
  for select to authenticated using (seller_id = auth.uid());
grant select on public.market_listings to authenticated;

-- market_orders: livro de ofertas publico (so ativas) + historico proprio de qualquer status.
create policy "ordem leitura publica ativas" on public.market_orders
  for select to authenticated using (status = 'ativa');
create policy "ordem leitura propria" on public.market_orders
  for select to authenticated using (user_id = auth.uid());
grant select on public.market_orders to authenticated;

-- market_trades: so participante, nao e navegavel publicamente.
create policy "trade leitura propria" on public.market_trades
  for select to authenticated using (buyer_id = auth.uid() or seller_id = auth.uid());
grant select on public.market_trades to authenticated;

-- ============ origem: 20260811203756_rpc_batch1_acoes_isoladas_dev.sql ============
-- Helper interno: NAO exposto ao client (sem grant execute pra authenticated).
-- So chamavel de dentro de outra funcao SECURITY DEFINER (reiniciar_jogo aqui;
-- as RPCs de mercado do passo #15 tambem vao chamar). Opera sobre anuncio_id
-- ja validado pelo chamador -- nao recebe user_id, nao tem como ser usado
-- pra mexer em anuncio de outro sem passar por quem valida a posse antes.
create function public.recusar_ofertas_pendentes(p_anuncio_id uuid, p_motivo text, p_exceto uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oferta record;
  v_count int := 0;
begin
  for v_oferta in
    update public.market_offers
    set status = 'recusada', resolved_at = now()
    where listing_id = p_anuncio_id and status = 'pendente'
      and (p_exceto is null or id != p_exceto)
    returning buyer_id, valor, currency
  loop
    if v_oferta.currency = 'gold' then
      update public.players set gold = gold + v_oferta.valor where user_id = v_oferta.buyer_id;
    else
      update public.players set diamonds = diamonds + v_oferta.valor where user_id = v_oferta.buyer_id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Porta reiniciar.ts#limparMundoDoJogador + aplicarAcao('reiniciarJogo').
-- Ordem de delete preservada por causa das FKs (listings antes de pokemon,
-- restrict; ver comentario original).
create function public.reiniciar_jogo()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_anuncio record;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  for v_anuncio in select id from public.market_listings where seller_id = v_user_id and status = 'ativo' loop
    perform public.recusar_ofertas_pendentes(v_anuncio.id, 'Conta resetada pelo vendedor — oferta devolvida');
  end loop;

  update public.market_offers set status = 'cancelada', resolved_at = now()
  where buyer_id = v_user_id and status = 'pendente';

  delete from public.market_listings where seller_id = v_user_id;
  delete from public.pokemon_instances where user_id = v_user_id and location = 'market';
  delete from public.market_orders where user_id = v_user_id;
  delete from public.market_deliveries where user_id = v_user_id;
  delete from public.game_sessions where user_id = v_user_id;

  update public.players set
    trainer_level = 1, trainer_exp = 0, gold = 1000, diamonds = 0,
    active_team_index = 0, current_map_id = null,
    unlocked_maps = '{}', unlocked_continents = array['johto','nightmare'],
    perf_stats = '{"gold":0,"xp":0,"mobs":0,"shinys":0,"captures":0,"items":0,"since":0}'::jsonb
  where user_id = v_user_id;
  delete from public.pokemon_instances where user_id = v_user_id;
  delete from public.player_items where user_id = v_user_id;
  delete from public.player_pokedex where user_id = v_user_id;
  delete from public.player_auto_catch_rules where user_id = v_user_id;
end;
$$;
revoke all on function public.reiniciar_jogo() from public;
grant execute on function public.reiniciar_jogo() to authenticated;

-- Porta social.ts#coletarAnexo (versao PH-21, com comClaimAtomico). Numa
-- transacao real o claim+undo desaparece: se o credito falhar, a transacao
-- inteira desfaz sozinha, sem precisar de PATCH de desfazer explicito.
-- Credito vai direto em player_items (upsert), NAO por fila de entrega --
-- so e seguro por gravar_estado_jogador (#13) ter que ser incremental/diff,
-- nunca overwrite total, daqui pra frente.
create function public.coletar_anexo_correio(p_mensagem_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_msg public.mail_messages;
  v_item jsonb;
  v_item_id text;
  v_quantity int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  update public.mail_messages
    set anexo_coletado_em = now(), estado = 'lido', read_at = now()
    where id = p_mensagem_id and para_id = v_user_id
      and anexo_coletado_em is null and anexo_itens != '[]'::jsonb
    returning * into v_msg;

  if v_msg is null then
    raise exception 'Nada para coletar nesta mensagem.' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(v_msg.anexo_itens) loop
    v_item_id := v_item->>'itemId';
    v_quantity := floor(coalesce((v_item->>'quantity')::numeric, 0));
    if v_item_id is not null and v_quantity > 0 then
      insert into public.player_items (user_id, item_id, quantity)
      values (v_user_id, v_item_id, v_quantity)
      on conflict (user_id, item_id) do update
        set quantity = public.player_items.quantity + excluded.quantity, updated_at = now();
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'itens', v_msg.anexo_itens);
end;
$$;
revoke all on function public.coletar_anexo_correio(uuid) from public;
grant execute on function public.coletar_anexo_correio(uuid) to authenticated;

-- Porta social.ts#pedirAmizade.
create function public.pedir_amizade(p_nick text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_eu record;
  v_destino_id uuid;
  v_destino record;
  v_ja_amigos boolean;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_nick is null or length(trim(p_nick)) = 0 or length(p_nick) > 40 then
    raise exception 'nick invalido' using errcode = 'P0001';
  end if;

  select trainer_name into v_eu from public.players where user_id = v_user_id;
  if v_eu is null then
    raise exception 'jogador sem linha em players' using errcode = 'P0001';
  end if;
  if lower(v_eu.trainer_name) = lower(p_nick) then
    raise exception 'Voce nao pode adicionar a si mesmo.' using errcode = 'P0001';
  end if;

  v_destino_id := public.id_por_nome_de_treinador(p_nick);
  if v_destino_id is null then
    raise exception 'Nao existe treinador chamado "%".', p_nick using errcode = 'P0001';
  end if;
  select user_id, trainer_name into v_destino from public.players where user_id = v_destino_id;

  select exists(
    select 1 from public.friendships where user_id = v_user_id and amigo_id = v_destino.user_id
  ) into v_ja_amigos;
  if v_ja_amigos then
    raise exception '% ja e seu amigo.', v_destino.trainer_name using errcode = 'P0001';
  end if;

  begin
    insert into public.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo)
    values (v_destino.user_id, v_user_id, v_eu.trainer_name, 'pedido_amizade', 'Pedido de amizade',
            v_eu.trainer_name || ' quer ser seu amigo.');
  exception when unique_violation then
    raise exception 'Voce ja tem um pedido pendente com %.', v_destino.trainer_name using errcode = 'P0001';
  end;

  return jsonb_build_object('mensagem', 'Pedido enviado para ' || v_destino.trainer_name || '.');
end;
$$;
revoke all on function public.pedir_amizade(text) from public;
grant execute on function public.pedir_amizade(text) to authenticated;

-- Porta social.ts#responderPedido.
create function public.responder_pedido_amizade(p_mensagem_id uuid, p_aceitar boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_pedido public.mail_messages;
  v_eu_nome text;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  update public.mail_messages
    set estado = case when p_aceitar then 'aceito' else 'recusado' end, read_at = now()
    where id = p_mensagem_id and para_id = v_user_id and tipo = 'pedido_amizade' and estado = 'pendente'
    returning * into v_pedido;

  if v_pedido is null then
    raise exception 'pedido nao encontrado ou ja respondido' using errcode = 'P0001';
  end if;
  if not p_aceitar then
    return jsonb_build_object('mensagem', 'Pedido recusado.');
  end if;
  if v_pedido.de_id is null then
    raise exception 'Quem enviou o pedido nao existe mais.' using errcode = 'P0001';
  end if;

  insert into public.friendships (user_id, amigo_id) values
    (v_user_id, v_pedido.de_id), (v_pedido.de_id, v_user_id)
  on conflict (user_id, amigo_id) do nothing;

  select trainer_name into v_eu_nome from public.players where user_id = v_user_id;
  insert into public.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo)
  values (v_pedido.de_id, v_user_id, coalesce(v_eu_nome, 'Treinador'), 'sistema', 'Pedido aceito',
          coalesce(v_eu_nome, 'Um treinador') || ' aceitou seu pedido de amizade.');

  return jsonb_build_object('mensagem', 'Agora voce e amigo de ' || v_pedido.de_nome || '.');
end;
$$;
revoke all on function public.responder_pedido_amizade(uuid, boolean) from public;
grant execute on function public.responder_pedido_amizade(uuid, boolean) to authenticated;

-- ============ origem: 20260811203824_fecha_execute_publico_no_helper_interno.sql ============
revoke all on function public.recusar_ofertas_pendentes(uuid, text, uuid) from public;
revoke all on function public.recusar_ofertas_pendentes(uuid, text, uuid) from authenticated;

-- ============ origem: 20260811213158_rpc_batch2_economia_dev.sql ============
-- Porta acoes.ts#comprarItem.
create function public.comprar_item(p_item_id text, p_qtd int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.items;
  v_custo bigint;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_qtd is null or p_qtd <= 0 or p_qtd > 1000000 then
    raise exception 'quantidade invalida' using errcode = 'P0001';
  end if;

  select * into v_item from public.items where id = p_item_id;
  if v_item is null or v_item.buy_price_atual is null then
    raise exception 'Item desconhecido.' using errcode = 'P0001';
  end if;

  v_custo := v_item.buy_price_atual::bigint * p_qtd;

  update public.players set gold = gold - v_custo
    where user_id = v_user_id and gold >= v_custo;
  if not found then
    raise exception 'Ouro insuficiente.' using errcode = 'P0001';
  end if;

  insert into public.player_items (user_id, item_id, quantity)
  values (v_user_id, p_item_id, p_qtd)
  on conflict (user_id, item_id) do update
    set quantity = public.player_items.quantity + excluded.quantity, updated_at = now();

  return jsonb_build_object('ok', true, 'mensagem', format('Comprou %s x%s por %s de ouro.', v_item.name, p_qtd, v_custo));
end;
$$;
revoke all on function public.comprar_item(text, int) from public;
grant execute on function public.comprar_item(text, int) to authenticated;

-- Porta acoes.ts#venderItem.
create function public.vender_item(p_item_id text, p_qtd int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.items;
  v_locked boolean;
  v_atual int;
  v_ganho bigint;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_qtd is null or p_qtd <= 0 or p_qtd > 1000000 then
    raise exception 'quantidade invalida' using errcode = 'P0001';
  end if;

  select * into v_item from public.items where id = p_item_id;
  if v_item is null then
    raise exception 'Item desconhecido.' using errcode = 'P0001';
  end if;

  select quantity, locked into v_atual, v_locked from public.player_items
    where user_id = v_user_id and item_id = p_item_id;

  if coalesce(v_locked, false) then
    raise exception 'Este item esta travado — destrave antes de vender.' using errcode = 'P0001';
  end if;
  if v_atual is null or v_atual < p_qtd then
    raise exception 'Voce nao tem itens suficientes.' using errcode = 'P0001';
  end if;

  update public.player_items set quantity = quantity - p_qtd, updated_at = now()
    where user_id = v_user_id and item_id = p_item_id;

  v_ganho := v_item.sell_price::bigint * p_qtd;
  update public.players set gold = gold + v_ganho where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('Vendeu %s x%s por %s de ouro.', v_item.name, p_qtd, v_ganho));
end;
$$;
revoke all on function public.vender_item(text, int) from public;
grant execute on function public.vender_item(text, int) to authenticated;

-- Porta acoes.ts#usarItem.
create function public.usar_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.items;
  v_ativo public.pokemon_instances;
  v_active_idx smallint;
  v_novo_hp int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  select * into v_item from public.items where id = p_item_id;
  if v_item is null then
    raise exception 'item desconhecido' using errcode = 'P0001';
  end if;

  select active_team_index into v_active_idx from public.players where user_id = v_user_id;
  select * into v_ativo from public.pokemon_instances
    where user_id = v_user_id and location = 'team' and team_slot = v_active_idx;
  if v_ativo is null then
    raise exception 'nenhum POKE ativo' using errcode = 'P0001';
  end if;

  if v_item.kind = 'potion' and v_item.heal_amount is not null then
    if v_ativo.hp <= 0 then
      raise exception 'POKE desmaiado — use um Revive' using errcode = 'P0001';
    end if;
    if v_ativo.hp >= v_ativo.stat_hp then
      raise exception 'O POKE ja esta com a vida cheia.' using errcode = 'P0001';
    end if;
    update public.player_items set quantity = quantity - 1, updated_at = now()
      where user_id = v_user_id and item_id = p_item_id and quantity >= 1;
    if not found then
      raise exception 'voce nao tem esse item' using errcode = 'P0001';
    end if;
    v_novo_hp := case when v_item.heals_full then v_ativo.stat_hp
      else least(v_ativo.stat_hp, v_ativo.hp + v_item.heal_amount) end;
    update public.pokemon_instances set hp = v_novo_hp, updated_at = now() where id = v_ativo.id;
    return jsonb_build_object('ok', true, 'mensagem', format('Usou %s.', v_item.name));
  end if;

  if v_item.kind = 'revive' and v_item.revive_hp_percent is not null then
    if v_ativo.hp > 0 then
      raise exception 'o POKE ja esta consciente' using errcode = 'P0001';
    end if;
    update public.player_items set quantity = quantity - 1, updated_at = now()
      where user_id = v_user_id and item_id = p_item_id and quantity >= 1;
    if not found then
      raise exception 'voce nao tem esse item' using errcode = 'P0001';
    end if;
    v_novo_hp := greatest(1, round(v_ativo.stat_hp * v_item.revive_hp_percent));
    update public.pokemon_instances set hp = v_novo_hp, updated_at = now() where id = v_ativo.id;
    return jsonb_build_object('ok', true, 'mensagem', 'POKE reanimado!');
  end if;

  raise exception 'esse item nao pode ser usado assim' using errcode = 'P0001';
end;
$$;
revoke all on function public.usar_item(text) from public;
grant execute on function public.usar_item(text) to authenticated;

-- ============ origem: 20260811214159_rpc_fecha_gap_11_vendas_restantes.sql ============
-- Helper interno: valor de venda de POKE. MIN_POKEMON_SELL_VALUE(1000) e o
-- multiplicador por raridade sao hardcode TS-only (nunca vieram de formulas,
-- ver src/economySystem.ts e src/data/rarity.ts). POKEMON_SELL_DIVISOR lido
-- ao vivo de public.formulas (esse sim e configuravel pela planilha).
create function public._valor_venda_poke(p_level int, p_base_exp int, p_rarity text)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_divisor numeric;
  v_mult numeric;
  v_base bigint;
begin
  select expression::numeric into v_divisor from public.formulas where key = 'POKEMON_SELL_DIVISOR';
  v_mult := case p_rarity
    when 'incomum' then 3 when 'raro' then 10 when 'ultra' then 40
    when 'legendary' then 150 when 'mythic' then 600 else 1 end;
  v_base := greatest(1, floor(greatest(1, floor(p_level * p_base_exp / v_divisor)) * v_mult));
  return 1000 + v_base;
end;
$$;
revoke all on function public._valor_venda_poke(int, int, text) from public;
revoke all on function public._valor_venda_poke(int, int, text) from authenticated;

-- Porta acoes.ts#venderTodosItens.
create function public.vender_todos_itens()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_total_gold bigint;
  v_item_count bigint;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  select coalesce(sum(pi.quantity * i.sell_price), 0), coalesce(sum(pi.quantity), 0)
    into v_total_gold, v_item_count
  from public.player_items pi
  join public.items i on i.id = pi.item_id
  where pi.user_id = v_user_id and pi.quantity > 0 and coalesce(pi.locked, false) = false
  for update of pi;

  update public.player_items set quantity = 0, updated_at = now()
    where user_id = v_user_id and quantity > 0 and coalesce(locked, false) = false;

  update public.players set gold = gold + v_total_gold where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('Vendeu %s itens por %s de ouro.', v_item_count, v_total_gold));
end;
$$;
revoke all on function public.vender_todos_itens() from public;
grant execute on function public.vender_todos_itens() to authenticated;

-- Porta acoes.ts#venderPoke.
create function public.vender_poke(p_poke_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_poke public.pokemon_instances;
  v_base_exp int;
  v_valor bigint;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  select * into v_poke from public.pokemon_instances
    where id = p_poke_id and user_id = v_user_id and location = 'bag';
  if v_poke is null then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;
  if v_poke.locked then
    raise exception 'Este item esta travado — destrave antes de vender.' using errcode = 'P0001';
  end if;

  select base_exp into v_base_exp from public.species where id = v_poke.species_id;
  v_valor := public._valor_venda_poke(v_poke.level, v_base_exp, v_poke.rarity::text);

  delete from public.pokemon_instances where id = p_poke_id;
  update public.players set gold = gold + v_valor where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('Vendido por %s de ouro.', v_valor));
end;
$$;
revoke all on function public.vender_poke(uuid) from public;
grant execute on function public.vender_poke(uuid) to authenticated;

-- Porta acoes.ts#venderPokes. Travados e shiny sao SEMPRE pulados mesmo se o
-- id foi passado (defesa em profundidade, PH-24) -- filtro no WHERE, nao erro.
create function public.vender_pokes(p_poke_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_total_gold bigint := 0;
  v_count int := 0;
  v_row record;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_poke_ids is null or array_length(p_poke_ids, 1) is null then
    raise exception 'nenhum POKE informado' using errcode = 'P0001';
  end if;

  for v_row in
    select pi.id, pi.level, pi.rarity, s.base_exp
    from public.pokemon_instances pi
    join public.species s on s.id = pi.species_id
    where pi.id = any(p_poke_ids) and pi.user_id = v_user_id and pi.location = 'bag'
      and coalesce(pi.locked, false) = false and coalesce(pi.is_shiny, false) = false
    for update of pi
  loop
    v_total_gold := v_total_gold + public._valor_venda_poke(v_row.level, v_row.base_exp, v_row.rarity::text);
    v_count := v_count + 1;
    delete from public.pokemon_instances where id = v_row.id;
  end loop;

  update public.players set gold = gold + v_total_gold where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('Vendeu %s POKEs por %s de ouro.', v_count, v_total_gold));
end;
$$;
revoke all on function public.vender_pokes(uuid[]) from public;
grant execute on function public.vender_pokes(uuid[]) to authenticated;

-- Porta acoes.ts#curarEquipe.
create function public.curar_equipe()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  update public.pokemon_instances set hp = stat_hp, updated_at = now()
    where user_id = v_user_id and location = 'team';
  return jsonb_build_object('ok', true, 'mensagem', 'Equipe curada!');
end;
$$;
revoke all on function public.curar_equipe() from public;
grant execute on function public.curar_equipe() to authenticated;

-- ============ origem: 20260811214236_fix_vender_todos_itens_for_update_com_agregado.sql ============
create or replace function public.vender_todos_itens()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_total_gold bigint;
  v_item_count bigint;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  with alvo as (
    select pi.item_id, pi.quantity, i.sell_price
    from public.player_items pi
    join public.items i on i.id = pi.item_id
    where pi.user_id = v_user_id and pi.quantity > 0 and coalesce(pi.locked, false) = false
    for update of pi
  )
  select coalesce(sum(quantity * sell_price), 0), coalesce(sum(quantity), 0)
    into v_total_gold, v_item_count
  from alvo;

  update public.player_items set quantity = 0, updated_at = now()
    where user_id = v_user_id and quantity > 0 and coalesce(locked, false) = false;

  update public.players set gold = gold + v_total_gold where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('Vendeu %s itens por %s de ouro.', v_item_count, v_total_gold));
end;
$$;

-- ============ origem: 20260811214952_rpc_batch3_resto_progressao_conta.sql ============
-- Helpers de stat (formula real Gen2, hoje em formulas.STAT_FORMULA/HP_FORMULA
-- -- expressao com variavel, generated column/lookup simples nao serve, shape
-- replicado aqui igual foi feito pro desconto de item).
create function public._calcular_stat(p_base int, p_level int, p_iv int, p_is_hp boolean)
returns int
language sql immutable
set search_path = public
as $$
  select case when p_is_hp
    then floor((2*p_base+p_iv)*p_level::numeric/100) + p_level + 10
    else floor((2*p_base+p_iv)*p_level::numeric/100) + 5
  end::int
$$;
revoke all on function public._calcular_stat(int, int, int, boolean) from public;
revoke all on function public._calcular_stat(int, int, int, boolean) from authenticated;

create function public._calcular_stats(
  p_species public.species, p_level int,
  p_iv_hp int, p_iv_atk_fis int, p_iv_atk_esp int, p_iv_def int, p_iv_def_esp int, p_iv_speed int,
  p_rarity text, p_is_shiny boolean
) returns table(stat_hp int, stat_atk_fis int, stat_atk_esp int, stat_def int, stat_def_esp int, stat_speed int)
language plpgsql immutable
set search_path = public
as $$
declare
  v_shiny_mult numeric := case when p_is_shiny then 1.5 else 1 end;
  v_rarity_mult numeric := case p_rarity
    when 'incomum' then 1.15 when 'raro' then 1.35 when 'ultra' then 1.7
    when 'legendary' then 2.2 when 'mythic' then 3 else 1 end;
begin
  return query select
    greatest(1, round(public._calcular_stat(p_species.base_hp, p_level, p_iv_hp, true) * v_shiny_mult * v_rarity_mult))::int,
    greatest(1, round(public._calcular_stat(p_species.base_atk_fis, p_level, p_iv_atk_fis, false) * v_shiny_mult * v_rarity_mult))::int,
    greatest(1, round(public._calcular_stat(p_species.base_atk_esp, p_level, p_iv_atk_esp, false) * v_shiny_mult * v_rarity_mult))::int,
    greatest(1, round(public._calcular_stat(p_species.base_def, p_level, p_iv_def, false) * v_shiny_mult * v_rarity_mult))::int,
    greatest(1, round(public._calcular_stat(p_species.base_def_esp, p_level, p_iv_def_esp, false) * v_shiny_mult * v_rarity_mult))::int,
    greatest(1, round(public._calcular_stat(p_species.base_speed, p_level, p_iv_speed, false) * v_shiny_mult * v_rarity_mult))::int;
end;
$$;
revoke all on function public._calcular_stats(public.species, int, int, int, int, int, int, int, text, boolean) from public;
revoke all on function public._calcular_stats(public.species, int, int, int, int, int, int, int, text, boolean) from authenticated;

-- Porta acoes.ts#escolherStarter.
create function public.escolher_starter(p_species_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ja_tem boolean;
  v_species public.species;
  v_stats record;
  v_nome_treinador text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  if p_species_id not in ('charmander', 'squirtle', 'bulbasaur') then
    raise exception 'essa especie nao e um inicial' using errcode = 'P0001';
  end if;

  select exists(select 1 from public.pokemon_instances where user_id = v_user_id) into v_ja_tem;
  if v_ja_tem then
    raise exception 'voce ja tem um POKE' using errcode = 'P0001';
  end if;

  select * into v_species from public.species where id = p_species_id;
  select * into v_stats from public._calcular_stats(v_species, 1, 23, 23, 23, 23, 23, 23, 'comum', false);
  select trainer_name into v_nome_treinador from public.players where user_id = v_user_id;

  insert into public.pokemon_instances (
    user_id, species_id, location, team_slot, level, exp, hp, is_shiny, rarity, locked,
    iv_hp, iv_atk_fis, iv_atk_esp, iv_def, iv_def_esp, iv_speed,
    stat_hp, stat_atk_fis, stat_atk_esp, stat_def, stat_def_esp, stat_speed,
    unlocked_abilities, original_trainer
  ) values (
    v_user_id, p_species_id, 'team', 0, 1, 0, v_stats.stat_hp, false, 'comum', false,
    23, 23, 23, 23, 23, 23,
    v_stats.stat_hp, v_stats.stat_atk_fis, v_stats.stat_atk_esp, v_stats.stat_def, v_stats.stat_def_esp, v_stats.stat_speed,
    (select coalesce(array_agg(move_id), '{}') from public.species_moves where species_id = p_species_id and level_req <= 1),
    v_nome_treinador
  );

  update public.players set active_team_index = 0 where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('%s entrou na sua equipe!', v_species.name));
end;
$$;
revoke all on function public.escolher_starter(text) from public;
grant execute on function public.escolher_starter(text) to authenticated;

-- Porta acoes.ts#definirNomeDoTreinador.
create function public.definir_nome_do_treinador(p_nome text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tem_poke boolean;
  v_nome text := trim(p_nome);
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  if length(v_nome) < 3 or length(v_nome) > 16 or v_nome !~ '^[A-Za-z0-9_]+$' then
    raise exception 'O nome precisa ter de 3 a 16 caracteres, so letras, numeros e _.' using errcode = 'P0001';
  end if;

  select exists(select 1 from public.pokemon_instances where user_id = v_user_id) into v_tem_poke;
  if v_tem_poke then
    raise exception 'O nome do treinador so pode ser escolhido antes do primeiro POKE.' using errcode = 'P0001';
  end if;

  begin
    update public.players set trainer_name = v_nome where user_id = v_user_id;
  exception when unique_violation then
    raise exception 'Esse nome ja esta em uso.' using errcode = 'P0001';
  end;

  return jsonb_build_object('ok', true, 'mensagem', format('Bem-vindo, %s!', v_nome));
end;
$$;
revoke all on function public.definir_nome_do_treinador(text) from public;
grant execute on function public.definir_nome_do_treinador(text) to authenticated;

-- Porta acoes.ts#evoluirPoke + progressionSystem.ts#evolvePokeInstance.
-- minLevel (anti-de-evolucao por penalidade de morte) NAO existe como coluna
-- em pokemon_instances -- gap real, registrado, so importa quando #14 (farm
-- offline/penalidade de morte) for construido.
create function public.evoluir_poke(p_poke_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_poke public.pokemon_instances;
  v_species public.species;
  v_new_species public.species;
  v_stone_item_id text;
  v_stone_count int := 20;
  v_stone_nome text;
  v_tem_stone boolean;
  v_hp_ratio numeric;
  v_stats record;
  v_new_hp int;
  v_new_abilities text[];
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select * into v_poke from public.pokemon_instances where id = p_poke_id and user_id = v_user_id;
  if v_poke is null then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  select * into v_species from public.species where id = v_poke.species_id;
  if v_species.evolves_to is null or v_species.evolves_at_level is null or v_poke.level < v_species.evolves_at_level then
    raise exception 'este POKE ainda nao pode evoluir' using errcode = 'P0001';
  end if;

  if v_species.is_special_evolution then
    v_stone_item_id := 'stone_' || lower(v_species.type1::text);
    select quantity >= v_stone_count into v_tem_stone from public.player_items
      where user_id = v_user_id and item_id = v_stone_item_id;
    if not coalesce(v_tem_stone, false) then
      select name into v_stone_nome from public.items where id = v_stone_item_id;
      raise exception 'faltam %sx %s', v_stone_count, coalesce(v_stone_nome, v_stone_item_id) using errcode = 'P0001';
    end if;
  end if;

  select * into v_new_species from public.species where id = v_species.evolves_to;
  v_hp_ratio := v_poke.hp::numeric / v_poke.stat_hp;
  select * into v_stats from public._calcular_stats(v_new_species, v_poke.level,
    v_poke.iv_hp, v_poke.iv_atk_fis, v_poke.iv_atk_esp, v_poke.iv_def, v_poke.iv_def_esp, v_poke.iv_speed,
    v_poke.rarity::text, v_poke.is_shiny);
  v_new_hp := greatest(1, round(v_stats.stat_hp * v_hp_ratio));

  select array_agg(distinct move_id) into v_new_abilities
    from public.species_moves
    where species_id = v_new_species.id and level_req <= v_poke.level
      and move_id != all(coalesce(v_poke.unlocked_abilities, '{}'));

  if v_species.is_special_evolution then
    update public.player_items set quantity = quantity - v_stone_count, updated_at = now()
      where user_id = v_user_id and item_id = v_stone_item_id;
  end if;

  update public.pokemon_instances set
    species_id = v_new_species.id,
    stat_hp = v_stats.stat_hp, stat_atk_fis = v_stats.stat_atk_fis, stat_atk_esp = v_stats.stat_atk_esp,
    stat_def = v_stats.stat_def, stat_def_esp = v_stats.stat_def_esp, stat_speed = v_stats.stat_speed,
    hp = v_new_hp,
    unlocked_abilities = v_poke.unlocked_abilities || coalesce(v_new_abilities, '{}'),
    updated_at = now()
  where id = p_poke_id;

  return jsonb_build_object('ok', true, 'mensagem', format('%s evoluiu para %s!', v_species.name, v_new_species.name));
end;
$$;
revoke all on function public.evoluir_poke(uuid) from public;
grant execute on function public.evoluir_poke(uuid) to authenticated;

-- Porta acoes.ts#definirAtivo (moveTeamIndexToFront) -- renumeracao precisa
-- de deferral do indice unico (colisao transitoria entre os 2 UPDATEs).
create function public.definir_ativo(p_poke_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_slot smallint;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select team_slot into v_old_slot from public.pokemon_instances
    where id = p_poke_id and user_id = v_user_id and location = 'team';
  if v_old_slot is null then
    raise exception 'indice fora da equipe' using errcode = 'P0001';
  end if;

  set constraints public.one_pokemon_per_team_slot deferred;

  update public.pokemon_instances set team_slot = team_slot + 1
    where user_id = v_user_id and location = 'team' and team_slot < v_old_slot;
  update public.pokemon_instances set team_slot = 0, updated_at = now() where id = p_poke_id;
  update public.players set active_team_index = 0 where user_id = v_user_id;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.definir_ativo(uuid) from public;
grant execute on function public.definir_ativo(uuid) to authenticated;

-- Porta acoes.ts#tirarDaEquipe.
create function public.tirar_da_equipe(p_poke_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_slot smallint;
  v_team_count int;
  v_nome text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select count(*) into v_team_count from public.pokemon_instances where user_id = v_user_id and location = 'team';
  if v_team_count <= 1 then
    raise exception 'voce precisa manter ao menos 1 POKE na equipe' using errcode = 'P0001';
  end if;

  select team_slot, s.name into v_old_slot, v_nome
    from public.pokemon_instances pi join public.species s on s.id = pi.species_id
    where pi.id = p_poke_id and pi.user_id = v_user_id and pi.location = 'team';
  if v_old_slot is null then
    raise exception 'POKE nao esta na equipe' using errcode = 'P0001';
  end if;

  update public.pokemon_instances set location = 'bag', team_slot = null, updated_at = now() where id = p_poke_id;
  update public.pokemon_instances set team_slot = team_slot - 1
    where user_id = v_user_id and location = 'team' and team_slot > v_old_slot;
  update public.players set active_team_index = case
      when active_team_index > v_old_slot then active_team_index - 1
      when active_team_index = v_old_slot then least(active_team_index, v_team_count - 2)
      else active_team_index
    end
    where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('%s foi para a mochila.', coalesce(v_nome, 'POKE')));
end;
$$;
revoke all on function public.tirar_da_equipe(uuid) from public;
grant execute on function public.tirar_da_equipe(uuid) to authenticated;

-- Porta acoes.ts#porNaEquipe. Mensagem generica de erro (404) cobre tanto
-- "nao esta na mochila" quanto "equipe cheia" -- mesmo comportamento do
-- moveBagToTeam original (devolve null pros 2 casos, sem distinguir).
create function public.por_na_equipe(p_poke_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_count int;
  v_species_id text;
  v_nome text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select count(*) into v_team_count from public.pokemon_instances where user_id = v_user_id and location = 'team';
  select species_id into v_species_id from public.pokemon_instances
    where id = p_poke_id and user_id = v_user_id and location = 'bag';

  if v_species_id is null or v_team_count >= 6 then
    raise exception 'POKE nao esta na mochila' using errcode = 'P0001';
  end if;

  update public.pokemon_instances set location = 'team', team_slot = v_team_count, updated_at = now()
    where id = p_poke_id;

  select name into v_nome from public.species where id = v_species_id;
  return jsonb_build_object('ok', true, 'mensagem', format('%s entrou na equipe.', coalesce(v_nome, 'POKE')));
end;
$$;
revoke all on function public.por_na_equipe(uuid) from public;
grant execute on function public.por_na_equipe(uuid) to authenticated;

-- Porta acoes.ts#desbloquearHunt.
create function public.desbloquear_hunt(p_map_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_mapa public.maps;
  v_ja_tem boolean;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select * into v_mapa from public.maps where id = p_map_id;
  if v_mapa is null then
    raise exception 'hunt desconhecida' using errcode = 'P0001';
  end if;

  select p_map_id = any(unlocked_maps) into v_ja_tem from public.players where user_id = v_user_id;
  if v_ja_tem then
    return jsonb_build_object('ok', true, 'mensagem', format('%s desbloqueada!', v_mapa.name));
  end if;

  if v_mapa.unlock_cost is not null then
    update public.players set gold = gold - v_mapa.unlock_cost, unlocked_maps = array_append(unlocked_maps, p_map_id)
      where user_id = v_user_id and gold >= v_mapa.unlock_cost;
    if not found then
      raise exception 'Recursos insuficientes.' using errcode = 'P0001';
    end if;
  else
    update public.players set unlocked_maps = array_append(unlocked_maps, p_map_id) where user_id = v_user_id;
  end if;

  return jsonb_build_object('ok', true, 'mensagem', format('%s desbloqueada!', v_mapa.name));
end;
$$;
revoke all on function public.desbloquear_hunt(text) from public;
grant execute on function public.desbloquear_hunt(text) to authenticated;

-- Porta acoes.ts#alternarTravaItem. Toggle nao exige posse previa do item
-- (mesmo comportamento do store original -- lockedItems e um dict solto).
create function public.alternar_trava_item(p_item_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  insert into public.player_items (user_id, item_id, quantity, locked)
  values (v_user_id, p_item_id, 0, true)
  on conflict (user_id, item_id) do update
    set locked = not coalesce(public.player_items.locked, false), updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.alternar_trava_item(text) from public;
grant execute on function public.alternar_trava_item(text) to authenticated;

-- Porta acoes.ts#alternarTravaPoke.
create function public.alternar_trava_poke(p_poke_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  update public.pokemon_instances set locked = not coalesce(locked, false), updated_at = now()
    where id = p_poke_id and user_id = v_user_id;
  if not found then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.alternar_trava_poke(uuid) from public;
grant execute on function public.alternar_trava_poke(uuid) to authenticated;

-- Porta acoes.ts#alternarHabilidade.
create function public.alternar_habilidade(p_poke_id uuid, p_ability_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_disabled jsonb;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select disabled_abilities into v_disabled from public.pokemon_instances
    where id = p_poke_id and user_id = v_user_id;
  if not found then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  update public.pokemon_instances set
    disabled_abilities = case when coalesce(v_disabled, '{}'::jsonb) ? p_ability_id
      then coalesce(v_disabled, '{}'::jsonb) - p_ability_id
      else coalesce(v_disabled, '{}'::jsonb) || jsonb_build_object(p_ability_id, true)
    end,
    updated_at = now()
  where id = p_poke_id;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.alternar_habilidade(uuid, text) from public;
grant execute on function public.alternar_habilidade(uuid, text) to authenticated;

-- Porta acoes.ts#configurarAuto.
create function public.configurar_auto(p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_rule jsonb;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  if p_patch is null or jsonb_typeof(p_patch) != 'object' then
    raise exception 'patch invalido' using errcode = 'P0001';
  end if;

  if p_patch ? 'toggles' then
    for v_key in select jsonb_object_keys(p_patch->'toggles') loop
      if v_key not in ('autoPot', 'autoCatch', 'autoRevive') then
        raise exception 'toggle desconhecido: %', v_key using errcode = 'P0001';
      end if;
    end loop;
    update public.players set auto_toggles = auto_toggles || (p_patch->'toggles') where user_id = v_user_id;
  end if;

  if p_patch ? 'catchConfig' then
    if not (p_patch->'catchConfig' ? 'ballId' and p_patch->'catchConfig' ? 'shinyBallId') then
      raise exception 'catchConfig invalido' using errcode = 'P0001';
    end if;
    update public.players set auto_catch_config = jsonb_build_object(
      'ballId', p_patch->'catchConfig'->>'ballId',
      'catchShinyEnabled', coalesce((p_patch->'catchConfig'->>'catchShinyEnabled')::boolean, false),
      'shinyBallId', p_patch->'catchConfig'->>'shinyBallId'
    ) where user_id = v_user_id;
  end if;

  if p_patch ? 'potRules' then
    if jsonb_typeof(p_patch->'potRules') != 'array' or jsonb_array_length(p_patch->'potRules') > 20 then
      raise exception 'potRules: no maximo 20 regras' using errcode = 'P0001';
    end if;
    for v_rule in select * from jsonb_array_elements(p_patch->'potRules') loop
      if (v_rule->>'hpPercent')::numeric < 1 or (v_rule->>'hpPercent')::numeric > 100 then
        raise exception 'hpPercent deve ficar entre 1 e 100' using errcode = 'P0001';
      end if;
    end loop;
    update public.players set auto_pot_rules = p_patch->'potRules' where user_id = v_user_id;
  end if;

  if p_patch ? 'catchRules' then
    if jsonb_typeof(p_patch->'catchRules') != 'array' or jsonb_array_length(p_patch->'catchRules') > 20 then
      raise exception 'catchRules: no maximo 20 regras' using errcode = 'P0001';
    end if;
    delete from public.player_auto_catch_rules where user_id = v_user_id;
    insert into public.player_auto_catch_rules (user_id, species_id, ball_item_id)
    select v_user_id, r->>'speciesId', r->>'ballItemId'
    from jsonb_array_elements(p_patch->'catchRules') r
    where coalesce(r->>'speciesId', '') != '' and coalesce(r->>'ballItemId', '') != '';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.configurar_auto(jsonb) from public;
grant execute on function public.configurar_auto(jsonb) to authenticated;

-- ============ origem: 20260811230653_rpc_mercado_batch1.sql ============

-- ===== criar_ordem_mercado: cria ordem de compra/venda de item + casamento inline =====
create or replace function public.criar_ordem_mercado(p_item_id text, p_side text, p_unit_price int, p_quantity int)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.items;
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

  select * into v_item from public.items where id = p_item_id;
  if v_item is null then raise exception 'item desconhecido'; end if;

  if p_side = 'venda' then
    if exists(select 1 from public.player_items where user_id=v_user_id and item_id=p_item_id and locked) then
      raise exception 'Este item esta travado — destrave antes de anunciar.';
    end if;
    update public.player_items set quantity = quantity - p_quantity, updated_at = now()
      where user_id = v_user_id and item_id = p_item_id and quantity >= p_quantity;
    if not found then raise exception 'Voce nao tem essa quantidade.'; end if;
    v_gold_retido := 0;
  else
    v_gold_retido := p_unit_price * p_quantity;
    update public.players set gold = gold - v_gold_retido where user_id = v_user_id and gold >= v_gold_retido;
    if not found then raise exception 'Ouro insuficiente.'; end if;
  end if;

  insert into public.market_orders (user_id, item_id, side, unit_price, quantity, remaining, gold_retido)
  values (v_user_id, p_item_id, p_side, p_unit_price, p_quantity, p_quantity, v_gold_retido)
  returning id into v_ordem_id;

  v_restante := p_quantity;
  v_retido := v_gold_retido;

  for v_candidata in
    select * from public.market_orders
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

    update public.market_orders set
      remaining = v_novo_restante_outra,
      status = case when v_novo_restante_outra = 0 then 'concluida' else 'ativa' end,
      closed_at = case when v_novo_restante_outra = 0 then now() else null end,
      gold_retido = case when side = 'compra' then greatest(0, gold_retido - v_valor) else gold_retido end
    where id = v_candidata.id;

    if p_side = 'compra' then
      insert into public.player_items (user_id, item_id, quantity) values (v_user_id, p_item_id, v_qtd)
        on conflict (user_id, item_id) do update set quantity = public.player_items.quantity + v_qtd, updated_at = now();
      v_troco := (p_unit_price - v_candidata.unit_price)::bigint * v_qtd;
      if v_troco > 0 then
        update public.players set gold = gold + v_troco where user_id = v_user_id;
      end if;
      v_retido := greatest(0, v_retido - p_unit_price * v_qtd);
      v_gasto_total := v_gasto_total + v_valor;
      update public.players set gold = gold + v_valor where user_id = v_candidata.user_id;
    else
      update public.players set gold = gold + v_valor where user_id = v_user_id;
      v_recebido_total := v_recebido_total + v_valor;
      insert into public.player_items (user_id, item_id, quantity) values (v_candidata.user_id, p_item_id, v_qtd)
        on conflict (user_id, item_id) do update set quantity = public.player_items.quantity + v_qtd, updated_at = now();
    end if;

    insert into public.market_trades (kind, item_id, quantity, unit_price, currency, buyer_id, seller_id)
    values ('item', p_item_id, v_qtd, v_candidata.unit_price, 'gold',
      case when p_side='compra' then v_user_id else v_candidata.user_id end,
      case when p_side='compra' then v_candidata.user_id else v_user_id end);

    v_restante := v_restante - v_qtd;
    v_executado := v_executado + v_qtd;
  end loop;

  update public.market_orders set
    remaining = v_restante,
    gold_retido = case when p_side='compra' then v_retido else 0 end,
    status = case when v_restante = 0 then 'concluida' else 'ativa' end,
    closed_at = case when v_restante = 0 then now() else null end
  where id = v_ordem_id;

  return jsonb_build_object('ok', true, 'ordemId', v_ordem_id, 'executado', v_executado, 'gastoTotal', v_gasto_total, 'recebidoTotal', v_recebido_total);
end;
$$;
revoke all on function public.criar_ordem_mercado(text, text, int, int) from public;
grant execute on function public.criar_ordem_mercado(text, text, int, int) to authenticated;

-- ===== cancelar_ordem_mercado =====
create or replace function public.cancelar_ordem_mercado(p_ordem_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ordem public.market_orders;
  v_item_nome text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  update public.market_orders set status='cancelada', closed_at=now()
    where id = p_ordem_id and user_id = v_user_id and status = 'ativa'
    returning * into v_ordem;
  if v_ordem is null then raise exception 'ordem nao encontrada ou ja encerrada'; end if;

  if v_ordem.side = 'venda' then
    insert into public.player_items (user_id, item_id, quantity) values (v_user_id, v_ordem.item_id, v_ordem.remaining)
      on conflict (user_id, item_id) do update set quantity = public.player_items.quantity + v_ordem.remaining, updated_at = now();
    select name into v_item_nome from public.items where id = v_ordem.item_id;
    return jsonb_build_object('ok', true, 'mensagem', format('Ordem cancelada — %sx %s de volta na mochila.', v_ordem.remaining, coalesce(v_item_nome, v_ordem.item_id)));
  else
    update public.players set gold = gold + v_ordem.gold_retido where user_id = v_user_id;
    return jsonb_build_object('ok', true, 'mensagem', format('Ordem cancelada — %s de ouro devolvido.', v_ordem.gold_retido));
  end if;
end;
$$;
revoke all on function public.cancelar_ordem_mercado(uuid) from public;
grant execute on function public.cancelar_ordem_mercado(uuid) to authenticated;

-- ===== anunciar_poke =====
create or replace function public.anunciar_poke(p_poke_id uuid, p_price int, p_currency text, p_apenas_oferta boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_poke public.pokemon_instances;
  v_currency text := case when p_currency = 'diamond' then 'diamond' else 'gold' end;
  v_price int := case when p_apenas_oferta then null else p_price end;
  v_iv_percent int;
  v_nome text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;
  if not p_apenas_oferta and (p_price is null or p_price <= 0 or p_price > 100000000) then
    raise exception 'price invalido';
  end if;

  update public.pokemon_instances set location='market', team_slot=null, updated_at=now()
    where id = p_poke_id and user_id = v_user_id and location = 'bag' and coalesce(locked,false) = false
    returning * into v_poke;
  if v_poke is null then
    raise exception 'POKE indisponivel — precisa estar na mochila e destravado.';
  end if;

  v_iv_percent := round((v_poke.iv_hp + v_poke.iv_atk_fis + v_poke.iv_atk_esp + v_poke.iv_def + v_poke.iv_def_esp + v_poke.iv_speed) / (31.0*6) * 100);

  insert into public.market_listings (seller_id, poke_uid, price, apenas_oferta, currency, species_id, level, rarity, is_shiny, iv_percent)
  values (v_user_id, p_poke_id, v_price, p_apenas_oferta, v_currency, v_poke.species_id, v_poke.level, v_poke.rarity, v_poke.is_shiny, v_iv_percent);

  select name into v_nome from public.species where id = v_poke.species_id;
  return jsonb_build_object('ok', true, 'mensagem',
    case when p_apenas_oferta then format('%s anunciado para receber lances.', coalesce(v_nome, v_poke.species_id))
    else format('%s anunciado por %s %s.', coalesce(v_nome, v_poke.species_id), v_price, case when v_currency='gold' then 'de ouro' else 'diamante(s)' end) end);
end;
$$;
revoke all on function public.anunciar_poke(uuid, int, text, boolean) from public;
grant execute on function public.anunciar_poke(uuid, int, text, boolean) to authenticated;

-- ===== comprar_anuncio =====
create or replace function public.comprar_anuncio(p_anuncio_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_anuncio public.market_listings;
  v_nome text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  select * into v_anuncio from public.market_listings where id = p_anuncio_id for update;
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
    update public.players set gold = gold - v_anuncio.price where user_id = v_user_id and gold >= v_anuncio.price;
  else
    update public.players set diamonds = diamonds - v_anuncio.price where user_id = v_user_id and diamonds >= v_anuncio.price;
  end if;
  if not found then
    raise exception '%', case when v_anuncio.currency='gold' then 'Ouro insuficiente.' else 'Diamantes insuficientes.' end;
  end if;

  update public.market_listings set status='vendido', sold_at=now(), buyer_id=v_user_id where id = p_anuncio_id;
  update public.pokemon_instances set user_id=v_user_id, location='bag', team_slot=null, updated_at=now() where id = v_anuncio.poke_uid;

  if v_anuncio.currency = 'gold' then
    update public.players set gold = gold + v_anuncio.price where user_id = v_anuncio.seller_id;
  else
    update public.players set diamonds = diamonds + v_anuncio.price where user_id = v_anuncio.seller_id;
  end if;

  insert into public.market_trades (kind, species_id, quantity, unit_price, currency, buyer_id, seller_id)
  values ('poke', v_anuncio.species_id, 1, v_anuncio.price, v_anuncio.currency, v_user_id, v_anuncio.seller_id);

  select name into v_nome from public.species where id = v_anuncio.species_id;
  return jsonb_build_object('ok', true, 'mensagem', format('%s comprado! Ele esta na sua mochila.', coalesce(v_nome, v_anuncio.species_id)));
end;
$$;
revoke all on function public.comprar_anuncio(uuid) from public;
grant execute on function public.comprar_anuncio(uuid) to authenticated;

-- ===== ofertar_no_anuncio =====
create or replace function public.ofertar_no_anuncio(p_anuncio_id uuid, p_valor bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_anuncio public.market_listings;
  v_nome text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;
  if p_valor is null or p_valor <= 0 or p_valor > 100000000 then raise exception 'valor invalido'; end if;

  select * into v_anuncio from public.market_listings where id = p_anuncio_id;
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
    update public.players set gold = gold - p_valor where user_id = v_user_id and gold >= p_valor;
  else
    update public.players set diamonds = diamonds - p_valor where user_id = v_user_id and diamonds >= p_valor;
  end if;
  if not found then
    raise exception '%', case when v_anuncio.currency='gold' then 'Ouro insuficiente.' else 'Diamantes insuficientes.' end;
  end if;

  begin
    insert into public.market_offers (listing_id, buyer_id, valor, currency)
    values (p_anuncio_id, v_user_id, p_valor, v_anuncio.currency);
  exception when unique_violation then
    raise exception 'Voce ja tem um lance pendente neste anuncio — cancele antes de enviar outro.';
  end;

  select name into v_nome from public.species where id = v_anuncio.species_id;
  return jsonb_build_object('ok', true, 'mensagem', format('Oferta de %s enviada por %s. O valor fica retido ate o vendedor responder.', p_valor, coalesce(v_nome, v_anuncio.species_id)));
end;
$$;
revoke all on function public.ofertar_no_anuncio(uuid, bigint) from public;
grant execute on function public.ofertar_no_anuncio(uuid, bigint) to authenticated;

-- ===== cancelar_oferta =====
create or replace function public.cancelar_oferta(p_oferta_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_oferta public.market_offers;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  update public.market_offers set status='cancelada', resolved_at=now()
    where id = p_oferta_id and buyer_id = v_user_id and status = 'pendente'
    returning * into v_oferta;
  if v_oferta is null then raise exception 'oferta nao encontrada ou ja respondida'; end if;

  if v_oferta.currency = 'gold' then
    update public.players set gold = gold + v_oferta.valor where user_id = v_user_id;
  else
    update public.players set diamonds = diamonds + v_oferta.valor where user_id = v_user_id;
  end if;

  return jsonb_build_object('ok', true, 'mensagem', format('Oferta cancelada — %s devolvido(s).', v_oferta.valor));
end;
$$;
revoke all on function public.cancelar_oferta(uuid) from public;
grant execute on function public.cancelar_oferta(uuid) to authenticated;

-- ===== responder_oferta =====
create or replace function public.responder_oferta(p_oferta_id uuid, p_aceitar boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_oferta public.market_offers;
  v_anuncio public.market_listings;
  v_nome text;
  v_devolvidas int;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  select * into v_oferta from public.market_offers where id = p_oferta_id for update;
  if v_oferta is null or v_oferta.status != 'pendente' then
    raise exception 'Esta oferta ja foi respondida.';
  end if;

  select * into v_anuncio from public.market_listings where id = v_oferta.listing_id for update;
  if v_anuncio is null then raise exception 'anuncio nao encontrado'; end if;
  if v_anuncio.seller_id != v_user_id then raise exception 'Esta oferta nao e de um anuncio seu.'; end if;

  select name into v_nome from public.species where id = v_anuncio.species_id;

  if not p_aceitar then
    update public.market_offers set status='recusada', resolved_at=now() where id = p_oferta_id;
    if v_oferta.currency = 'gold' then
      update public.players set gold = gold + v_oferta.valor where user_id = v_oferta.buyer_id;
    else
      update public.players set diamonds = diamonds + v_oferta.valor where user_id = v_oferta.buyer_id;
    end if;
    return jsonb_build_object('ok', true, 'mensagem', 'Oferta recusada — o valor foi devolvido ao ofertante.');
  end if;

  if v_anuncio.status != 'ativo' then
    raise exception 'Este anuncio ja tinha sido encerrado.';
  end if;

  update public.market_offers set status='aceita', resolved_at=now() where id = p_oferta_id;
  update public.market_listings set status='vendido', sold_at=now(), buyer_id=v_oferta.buyer_id where id = v_anuncio.id;
  update public.pokemon_instances set user_id=v_oferta.buyer_id, location='bag', team_slot=null, updated_at=now() where id = v_anuncio.poke_uid;

  if v_oferta.currency = 'gold' then
    update public.players set gold = gold + v_oferta.valor where user_id = v_user_id;
  else
    update public.players set diamonds = diamonds + v_oferta.valor where user_id = v_user_id;
  end if;

  insert into public.market_trades (kind, species_id, quantity, unit_price, currency, buyer_id, seller_id)
  values ('poke', v_anuncio.species_id, 1, v_oferta.valor, v_oferta.currency, v_oferta.buyer_id, v_user_id);

  select public.recusar_ofertas_pendentes(v_anuncio.id, format('Outra oferta por %s foi aceita', coalesce(v_nome, v_anuncio.species_id)), p_oferta_id) into v_devolvidas;

  return jsonb_build_object('ok', true, 'mensagem',
    case when v_devolvidas > 0
      then format('Lance aceito! %s foi entregue e %s outra(s) oferta(s) foram devolvidas.', coalesce(v_nome, v_anuncio.species_id), v_devolvidas)
      else format('Lance aceito! %s foi entregue ao ofertante.', coalesce(v_nome, v_anuncio.species_id))
    end);
end;
$$;
revoke all on function public.responder_oferta(uuid, boolean) from public;
grant execute on function public.responder_oferta(uuid, boolean) to authenticated;

-- ===== cancelar_anuncio =====
create or replace function public.cancelar_anuncio(p_anuncio_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_anuncio public.market_listings;
  v_devolvidas int;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode='28000'; end if;

  update public.market_listings set status='cancelado' where id = p_anuncio_id and seller_id = v_user_id and status = 'ativo'
    returning * into v_anuncio;
  if v_anuncio is null then raise exception 'anuncio nao encontrado ou ja encerrado'; end if;

  update public.pokemon_instances set location='bag', team_slot=null, updated_at=now() where id = v_anuncio.poke_uid;

  select public.recusar_ofertas_pendentes(p_anuncio_id, 'Anuncio retirado do Mercado') into v_devolvidas;

  return jsonb_build_object('ok', true, 'mensagem',
    case when v_devolvidas > 0
      then format('Anuncio cancelado — o POKE voltou pra sua mochila e %s oferta(s) foram devolvidas.', v_devolvidas)
      else 'Anuncio cancelado — o POKE voltou pra sua mochila.'
    end);
end;
$$;
revoke all on function public.cancelar_anuncio(uuid) from public;
grant execute on function public.cancelar_anuncio(uuid) to authenticated;

-- ============ origem: 20260811233628_pente_fino_fixes_mercado_economia.sql ============

-- ===== FIX CRITICO: vender_poke duplicava ouro sob corrida (DELETE sem checar linhas afetadas) =====
create or replace function public.vender_poke(p_poke_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_poke public.pokemon_instances;
  v_base_exp int;
  v_valor bigint;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  select * into v_poke from public.pokemon_instances
    where id = p_poke_id and user_id = v_user_id and location = 'bag' and coalesce(locked, false) = false;
  if v_poke is null then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  select base_exp into v_base_exp from public.species where id = v_poke.species_id;
  v_valor := public._valor_venda_poke(v_poke.level, v_base_exp, v_poke.rarity::text);

  -- Claim atomico: so quem de fato apagar a linha credita ouro. Corrida perdida
  -- (linha ja sumiu, ex: vendida por outra chamada concorrente do mesmo request
  -- duplicado) nao credita nada, em vez de creditar 2x.
  delete from public.pokemon_instances
    where id = p_poke_id and user_id = v_user_id and location = 'bag' and coalesce(locked, false) = false;
  if not found then
    raise exception 'Este POKE ja foi vendido ou movido.' using errcode = 'P0001';
  end if;

  update public.players set gold = gold + v_valor where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('Vendido por %s de ouro.', v_valor));
end;
$$;

-- ===== FIX SERIO: alternar_habilidade gravava sem checar dono no UPDATE final =====
create or replace function public.alternar_habilidade(p_poke_id uuid, p_ability_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_disabled jsonb;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select disabled_abilities into v_disabled from public.pokemon_instances
    where id = p_poke_id and user_id = v_user_id;
  if not found then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  update public.pokemon_instances set
    disabled_abilities = case when coalesce(v_disabled, '{}'::jsonb) ? p_ability_id
      then coalesce(v_disabled, '{}'::jsonb) - p_ability_id
      else coalesce(v_disabled, '{}'::jsonb) || jsonb_build_object(p_ability_id, true)
    end,
    updated_at = now()
  where id = p_poke_id and user_id = v_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ===== Defesa em profundidade: helpers internos ganham checagem propria, nao dependem so do GRANT ausente =====
create or replace function public.wipe_inventario_e_economia()
returns table(jogadores_afetados bigint, linhas_de_item_apagadas bigint)
language plpgsql security definer set search_path = public
as $$
declare
  n_itens bigint;
  n_jogadores bigint;
begin
  if not public.is_admin() then
    raise exception 'apenas admin' using errcode = '42501';
  end if;

  with apagados as (
    delete from public.player_items where true returning 1
  )
  select count(*) into n_itens from apagados;

  with resetados as (
    update public.players
    set gold = default,
        diamonds = default,
        updated_at = now()
    where true
    returning 1
  )
  select count(*) into n_jogadores from resetados;

  insert into public.player_items (user_id, item_id, quantity)
  select p.user_id, c.item_id, c.quantity
  from public.players p
  cross join public.concessao_inicial_de_itens() c;

  return query select n_jogadores, n_itens;
end;
$$;

create or replace function public.wipe_mundo_social()
returns table(ordens bigint, anuncios bigint, negocios bigint, entregas bigint, mensagens bigint, amizades bigint, chat bigint)
language plpgsql security definer set search_path = public
as $$
declare
  n_ordens bigint; n_anuncios bigint; n_negocios bigint;
  n_entregas bigint; n_mensagens bigint; n_amizades bigint; n_chat bigint;
begin
  if not public.is_admin() then
    raise exception 'apenas admin' using errcode = '42501';
  end if;

  with x as (delete from public.market_orders where true returning 1) select count(*) into n_ordens from x;
  with x as (delete from public.market_listings where true returning 1) select count(*) into n_anuncios from x;
  with x as (delete from public.market_trades where true returning 1) select count(*) into n_negocios from x;
  with x as (delete from public.market_deliveries where true returning 1) select count(*) into n_entregas from x;
  with x as (delete from public.mail_messages where true returning 1) select count(*) into n_mensagens from x;
  with x as (delete from public.friendships where true returning 1) select count(*) into n_amizades from x;
  with x as (delete from public.chat_messages where true returning 1) select count(*) into n_chat from x;
  return query select n_ordens, n_anuncios, n_negocios, n_entregas, n_mensagens, n_amizades, n_chat;
end;
$$;

create or replace function public.wipe_todos_os_saves()
returns table(jogadores_resetados bigint, pokes_apagados bigint, sessoes_fechadas bigint)
language plpgsql security definer set search_path = public
as $$
declare
  n_pokes bigint;
  n_sessoes bigint;
  n_jogadores bigint;
begin
  if not public.is_admin() then
    raise exception 'apenas admin' using errcode = '42501';
  end if;

  with apagados as (
    delete from public.pokemon_instances where true returning 1
  )
  select count(*) into n_pokes from apagados;

  delete from public.player_items where true;
  delete from public.player_pokedex where true;
  delete from public.player_auto_catch_rules where true;

  with fechadas as (
    update public.game_sessions
    set closed_at = now()
    where closed_at is null
    returning 1
  )
  select count(*) into n_sessoes from fechadas;

  with resetados as (
    update public.players
    set trainer_level = default,
        trainer_exp = default,
        gold = default,
        diamonds = default,
        active_team_index = default,
        current_map_id = null,
        unlocked_maps = public.hunts_iniciais(),
        unlocked_continents = default,
        auto_toggles = default,
        auto_pot_rules = default,
        auto_catch_config = default,
        perf_stats = default,
        updated_at = now()
    where true
    returning 1
  )
  select count(*) into n_jogadores from resetados;

  insert into public.player_items (user_id, item_id, quantity)
  select p.user_id, c.item_id, c.quantity
  from public.players p
  cross join public.concessao_inicial_de_itens() c;

  return query select n_jogadores, n_pokes, n_sessoes;
end;
$$;

create or replace function public.recusar_ofertas_pendentes(p_anuncio_id uuid, p_motivo text, p_exceto uuid default null)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_dono uuid;
  v_row record;
  v_count int := 0;
begin
  select seller_id into v_dono from public.market_listings where id = p_anuncio_id;
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

  for v_row in
    select * from public.market_offers
    where listing_id = p_anuncio_id and status = 'pendente' and (p_exceto is null or id != p_exceto)
    for update
  loop
    update public.market_offers set status = 'recusada', resolved_at = now() where id = v_row.id;
    if v_row.currency = 'gold' then
      update public.players set gold = gold + v_row.valor where user_id = v_row.buyer_id;
    else
      update public.players set diamonds = diamonds + v_row.valor where user_id = v_row.buyer_id;
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.id_por_nome_de_treinador(nome text)
returns uuid
language sql stable security definer set search_path = public
as $$
  select case when auth.uid() is null then null::uuid
    else (select user_id from public.players where lower(trainer_name) = lower(trim(nome)) limit 1)
  end;
$$;

revoke all on function public.vender_poke(uuid) from public;
revoke all on function public.alternar_habilidade(uuid, text) from public;
revoke all on function public.wipe_inventario_e_economia() from public;
revoke all on function public.wipe_mundo_social() from public;
revoke all on function public.wipe_todos_os_saves() from public;
revoke all on function public.recusar_ofertas_pendentes(uuid, text, uuid) from public;
revoke all on function public.id_por_nome_de_treinador(text) from public;
grant execute on function public.vender_poke(uuid) to authenticated;
grant execute on function public.alternar_habilidade(uuid, text) to authenticated;

-- ============ origem: 20260811235800_mercado_rls_e_views_leitura.sql ============

-- market_offers nao tinha NENHUMA policy de SELECT -- ninguem conseguia ler
-- ofertas via client. Comprador ve as proprias; vendedor ve as recebidas nos
-- proprios anuncios.
create policy "oferta leitura propria (comprador)" on public.market_offers
  for select to authenticated using (buyer_id = auth.uid());
create policy "oferta leitura propria (vendedor)" on public.market_offers
  for select to authenticated using (
    exists (select 1 from public.market_listings l where l.id = market_offers.listing_id and l.seller_id = auth.uid())
  );

-- Negocios (trades) viram publicos, mesmo padrao ja aplicado a ordens/anuncios
-- ativos: sinal de preco de mercado e informacao publica do jogo.
create policy "trade leitura publica" on public.market_trades
  for select to authenticated using (true);

-- Resumo por item: so item com ALGUMA ordem ativa (mesmo filtro que o client
-- ja aplicava sobre a resposta do server antigo).
create view public.mercado_resumo_itens with (security_invoker = true) as
select item_id,
  max(unit_price) filter (where side = 'compra') as melhor_compra,
  min(unit_price) filter (where side = 'venda') as melhor_venda,
  coalesce(sum(remaining) filter (where side = 'venda'), 0)::int as em_venda,
  coalesce(sum(remaining) filter (where side = 'compra'), 0)::int as em_compra
from public.market_orders
where status = 'ativa' and remaining > 0
group by item_id;

-- Anuncios ativos com nome do vendedor + contagem/melhor oferta -- o que a
-- vitrine de Comprar Pokes precisa numa unica leitura.
create view public.mercado_anuncios_ativos with (security_invoker = true) as
select l.*, t.trainer_name as vendedor,
  (select count(*) from public.market_offers o where o.listing_id = l.id and o.status = 'pendente')::int as ofertas,
  (select max(valor) from public.market_offers o where o.listing_id = l.id and o.status = 'pendente') as melhor_oferta
from public.market_listings l
join public.treinadores_publico t on t.user_id = l.seller_id
where l.status = 'ativo';

-- Ofertas pendentes recebidas nos MEUS anuncios, com nome do ofertante e o
-- anuncio embutido (join feito aqui pra o client nao precisar de 2 leituras).
create view public.mercado_ofertas_recebidas with (security_invoker = true) as
select o.*, t.trainer_name as comprador, l.seller_id, l.species_id, l.level, l.is_shiny
from public.market_offers o
join public.market_listings l on l.id = o.listing_id
join public.treinadores_publico t on t.user_id = o.buyer_id
where o.status = 'pendente';

revoke all on public.mercado_resumo_itens from public;
revoke all on public.mercado_anuncios_ativos from public;
revoke all on public.mercado_ofertas_recebidas from public;
grant select on public.mercado_resumo_itens to authenticated;
grant select on public.mercado_anuncios_ativos to authenticated;
grant select on public.mercado_ofertas_recebidas to authenticated;

-- ============ origem: 20260812000600_fix_grant_market_offers_select.sql ============
grant select on public.market_offers to authenticated;

-- ============ origem: 20260812001015_chat_correio_rls_e_realtime.sql ============

-- friendships: RLS ligada, zero policy e zero grant -- ninguem lia. Cada linha
-- ja vem em par (ver responder_pedido_amizade), entao "onde user_id=eu" basta.
grant select on public.friendships to authenticated;
create policy "amizade leitura propria" on public.friendships
  for select to authenticated using (user_id = auth.uid());

-- mail_messages tinha policy de UPDATE ("marca lida propria") mas faltava o
-- GRANT base -- mesma lacuna do market_offers, RLS sozinha nao bastava.
grant update on public.mail_messages to authenticated;

-- Realtime: publication nao tinha NENHUMA tabela do schema dev ainda.
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.mail_messages;

-- ============ origem: 20260812001915_ranking_e_perfil_views_e_rpc.sql ============

-- Ranking de POKEs: todos os pokes de todos os jogadores (a policy "pokemon
-- leitura publica" ja cobre isso), com nome do dono ATUAL embutido. Client
-- escolhe o criterio via .order() na coluna certa -- sem view por criterio.
create view public.ranking_pokemon with (security_invoker = true) as
select pi.*, t.trainer_name as treinador
from public.pokemon_instances pi
join public.treinadores_publico t on t.user_id = pi.user_id;

revoke all on public.ranking_pokemon from public;
grant select on public.ranking_pokemon to authenticated;

-- Perfil: rank/total (window function sobre a view publica de treinadores),
-- tempo jogado (soma de game_sessions do proprio usuario) e data do Hall da
-- Fama -- tudo dado que precisa agregar ou contar OUTRAS linhas, RLS de
-- 'players'/'game_sessions' sozinha nao da conta (so a propria linha).
create or replace function public.meu_perfil()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_rank int;
  v_total int;
  v_segundos numeric;
  v_hall timestamptz;
  v_criado timestamptz;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select x.rank, x.total into v_rank, v_total from (
    select user_id,
      row_number() over (order by trainer_level desc, trainer_exp desc) as rank,
      count(*) over () as total
    from public.treinadores_publico
  ) x where x.user_id = v_user_id;

  select coalesce(sum(simulated_seconds), 0) into v_segundos from public.game_sessions where user_id = v_user_id;
  select conquistado_em into v_hall from public.hall_da_fama where user_id = v_user_id limit 1;
  select created_at into v_criado from public.players where user_id = v_user_id;

  return jsonb_build_object(
    'rank', coalesce(v_rank, 0),
    'totalJogadores', coalesce(v_total, 0),
    'segundosJogados', v_segundos,
    'contaCriadaEm', v_criado,
    'noHallDaFama', v_hall
  );
end;
$$;

revoke all on function public.meu_perfil() from public;
grant execute on function public.meu_perfil() to authenticated;

-- ============ origem: 20260812004640_chat_rate_limit_trigger.sql ============

create or replace function public.chat_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ultima timestamptz;
begin
  -- Serializa por user_id: SELECT...FOR UPDATE na "ultima mensagem" nao
  -- funciona aqui (trava a linha antiga, nao a nova sendo inserida -- uma
  -- segunda transacao concorrente destrava vendo a MESMA linha antiga, nao a
  -- que acabou de commitar). Advisory lock trava o USUARIO inteiro pela
  -- duracao da transacao: a segunda soh roda depois que a primeira commitou.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  select max(created_at) into v_ultima from public.chat_messages where user_id = new.user_id;
  if v_ultima is not null and now() - v_ultima < interval '1200 milliseconds' then
    raise exception 'Aguarde um instante antes de mandar outra mensagem.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists chat_rate_limit_trigger on public.chat_messages;
create trigger chat_rate_limit_trigger
  before insert on public.chat_messages
  for each row execute function public.chat_rate_limit();

-- ============ origem: 20260812005524_fix_ph20_pedido_amizade_reverso.sql ============

create or replace function public.responder_pedido_amizade(p_mensagem_id uuid, p_aceitar boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_pedido public.mail_messages;
  v_eu_nome text;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  update public.mail_messages
    set estado = case when p_aceitar then 'aceito' else 'recusado' end, read_at = now()
    where id = p_mensagem_id and para_id = v_user_id and tipo = 'pedido_amizade' and estado = 'pendente'
    returning * into v_pedido;

  if v_pedido is null then
    raise exception 'pedido nao encontrado ou ja respondido' using errcode = 'P0001';
  end if;
  if not p_aceitar then
    return jsonb_build_object('mensagem', 'Pedido recusado.');
  end if;
  if v_pedido.de_id is null then
    raise exception 'Quem enviou o pedido nao existe mais.' using errcode = 'P0001';
  end if;

  -- PH-20: se o outro lado tambem tinha um pedido pendente pra mim (direcao
  -- inversa, mandado antes de eu responder o dele), resolve junto -- sem
  -- isso ele ficava com "Aceitar/Recusar" pra alguem que ja virou amigo.
  update public.mail_messages
    set estado = 'aceito', read_at = now()
    where para_id = v_pedido.de_id and de_id = v_user_id and tipo = 'pedido_amizade' and estado = 'pendente';

  insert into public.friendships (user_id, amigo_id) values
    (v_user_id, v_pedido.de_id), (v_pedido.de_id, v_user_id)
  on conflict (user_id, amigo_id) do nothing;

  select trainer_name into v_eu_nome from public.players where user_id = v_user_id;
  insert into public.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo)
  values (v_pedido.de_id, v_user_id, coalesce(v_eu_nome, 'Treinador'), 'sistema', 'Pedido aceito',
          coalesce(v_eu_nome, 'Um treinador') || ' aceitou seu pedido de amizade.');

  return jsonb_build_object('mensagem', 'Agora voce e amigo de ' || v_pedido.de_nome || '.');
end;
$$;

-- ============ origem: 20260812010034_fix_ph22_marcar_correio_lido_rpc.sql ============

create or replace function public.marcar_correio_lido(p_mensagem_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  -- PH-22: mesma exclusao ja aplicada a pedido_amizade (nao marca lido o que
  -- ainda precisa de acao) -- estendida pra anexo de item ainda nao coletado,
  -- senao a mensagem sai da contagem `naoLidas` mas o HUD (usePendenciasDoCorreio,
  -- que soma temAnexoPendente OU pendente) continua contando, badges divergem.
  update public.mail_messages
    set estado = 'lido', read_at = now()
    where id = p_mensagem_id
      and para_id = v_user_id
      and estado = 'pendente'
      and tipo != 'pedido_amizade'
      and not (anexo_itens <> '[]'::jsonb and anexo_coletado_em is null);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.marcar_correio_lido(uuid) from public;
grant execute on function public.marcar_correio_lido(uuid) to authenticated;

-- UPDATE direto pelo client nao faz mais sentido pra essa tabela (so a RPC
-- deve escrever `estado`) -- revoga o grant de UPDATE que ativava o caminho
-- inseguro corrigido acima.
revoke update on public.mail_messages from authenticated;

-- ============ origem: 20260812010455_fix_ph25_por_na_equipe_mensagem.sql ============

create or replace function public.por_na_equipe(p_poke_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_count int;
  v_species_id text;
  v_nome text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select count(*) into v_team_count from public.pokemon_instances where user_id = v_user_id and location = 'team';
  select species_id into v_species_id from public.pokemon_instances
    where id = p_poke_id and user_id = v_user_id and location = 'bag';

  -- PH-25: causas separadas, mensagem certa pra cada uma (antes as duas
  -- caiam no mesmo "POKE nao esta na mochila", enganoso quando a causa real
  -- era equipe cheia).
  if v_species_id is null then
    raise exception 'POKE nao esta na mochila' using errcode = 'P0001';
  end if;
  if v_team_count >= 6 then
    raise exception 'Sua equipe ja esta cheia (6 POKEs).' using errcode = 'P0001';
  end if;

  update public.pokemon_instances set location = 'team', team_slot = v_team_count, updated_at = now()
    where id = p_poke_id;

  select name into v_nome from public.species where id = v_species_id;
  return jsonb_build_object('ok', true, 'mensagem', format('%s entrou na equipe.', coalesce(v_nome, 'POKE')));
end;
$$;



-- ============ origem: 20260811202726_rls_chat_e_correio_dev.sql ============
-- chat_messages: leitura publica (chat de mundo, sem dono), escrita so na propria linha
create policy "chat leitura publica" on public.chat_messages
  for select to authenticated using (true);

create policy "chat insere propria mensagem" on public.chat_messages
  for insert to authenticated with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.chat_messages m2
      where m2.user_id = auth.uid()
        and m2.created_at > now() - interval '1200 milliseconds'
    )
  );

-- mail_messages: leitura/atualizacao so das proprias mensagens.
-- anexo_coletado_em fica FORA do grant de update -- so a RPC coletar_anexo_correio
-- (passo #10 do plano) pode tocar essa coluna, senao quebra o claim atomico.
create policy "correio leitura propria" on public.mail_messages
  for select to authenticated using (para_id = auth.uid());

create policy "correio marca lida propria" on public.mail_messages
  for update to authenticated
  using (para_id = auth.uid())
  with check (para_id = auth.uid());

grant select on public.mail_messages to authenticated;
grant select, insert on public.chat_messages to authenticated;
grant update (estado, read_at) on public.mail_messages to authenticated;
