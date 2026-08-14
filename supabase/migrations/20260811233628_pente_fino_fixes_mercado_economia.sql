
-- ===== FIX CRITICO: vender_poke duplicava ouro sob corrida (DELETE sem checar linhas afetadas) =====
create or replace function dev.vender_poke(p_poke_id uuid)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_poke dev.pokemon_instances;
  v_base_exp int;
  v_valor bigint;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  select * into v_poke from dev.pokemon_instances
    where id = p_poke_id and user_id = v_user_id and location = 'bag' and coalesce(locked, false) = false;
  if v_poke is null then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  select base_exp into v_base_exp from dev.species where id = v_poke.species_id;
  v_valor := dev._valor_venda_poke(v_poke.level, v_base_exp, v_poke.rarity::text);

  -- Claim atomico: so quem de fato apagar a linha credita ouro. Corrida perdida
  -- (linha ja sumiu, ex: vendida por outra chamada concorrente do mesmo request
  -- duplicado) nao credita nada, em vez de creditar 2x.
  delete from dev.pokemon_instances
    where id = p_poke_id and user_id = v_user_id and location = 'bag' and coalesce(locked, false) = false;
  if not found then
    raise exception 'Este POKE ja foi vendido ou movido.' using errcode = 'P0001';
  end if;

  update dev.players set gold = gold + v_valor where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('Vendido por %s de ouro.', v_valor));
end;
$$;

-- ===== FIX SERIO: alternar_habilidade gravava sem checar dono no UPDATE final =====
create or replace function dev.alternar_habilidade(p_poke_id uuid, p_ability_id text)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_disabled jsonb;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select disabled_abilities into v_disabled from dev.pokemon_instances
    where id = p_poke_id and user_id = v_user_id;
  if not found then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  update dev.pokemon_instances set
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
create or replace function dev.wipe_inventario_e_economia()
returns table(jogadores_afetados bigint, linhas_de_item_apagadas bigint)
language plpgsql security definer set search_path = dev, public
as $$
declare
  n_itens bigint;
  n_jogadores bigint;
begin
  if not dev.is_admin() then
    raise exception 'apenas admin' using errcode = '42501';
  end if;

  with apagados as (
    delete from dev.player_items where true returning 1
  )
  select count(*) into n_itens from apagados;

  with resetados as (
    update dev.players
    set gold = default,
        diamonds = default,
        updated_at = now()
    where true
    returning 1
  )
  select count(*) into n_jogadores from resetados;

  insert into dev.player_items (user_id, item_id, quantity)
  select p.user_id, c.item_id, c.quantity
  from dev.players p
  cross join dev.concessao_inicial_de_itens() c;

  return query select n_jogadores, n_itens;
end;
$$;

create or replace function dev.wipe_mundo_social()
returns table(ordens bigint, anuncios bigint, negocios bigint, entregas bigint, mensagens bigint, amizades bigint, chat bigint)
language plpgsql security definer set search_path = dev, public
as $$
declare
  n_ordens bigint; n_anuncios bigint; n_negocios bigint;
  n_entregas bigint; n_mensagens bigint; n_amizades bigint; n_chat bigint;
begin
  if not dev.is_admin() then
    raise exception 'apenas admin' using errcode = '42501';
  end if;

  with x as (delete from dev.market_orders where true returning 1) select count(*) into n_ordens from x;
  with x as (delete from dev.market_listings where true returning 1) select count(*) into n_anuncios from x;
  with x as (delete from dev.market_trades where true returning 1) select count(*) into n_negocios from x;
  with x as (delete from dev.market_deliveries where true returning 1) select count(*) into n_entregas from x;
  with x as (delete from dev.mail_messages where true returning 1) select count(*) into n_mensagens from x;
  with x as (delete from dev.friendships where true returning 1) select count(*) into n_amizades from x;
  with x as (delete from dev.chat_messages where true returning 1) select count(*) into n_chat from x;
  return query select n_ordens, n_anuncios, n_negocios, n_entregas, n_mensagens, n_amizades, n_chat;
end;
$$;

create or replace function dev.wipe_todos_os_saves()
returns table(jogadores_resetados bigint, pokes_apagados bigint, sessoes_fechadas bigint)
language plpgsql security definer set search_path = dev, public
as $$
declare
  n_pokes bigint;
  n_sessoes bigint;
  n_jogadores bigint;
begin
  if not dev.is_admin() then
    raise exception 'apenas admin' using errcode = '42501';
  end if;

  with apagados as (
    delete from dev.pokemon_instances where true returning 1
  )
  select count(*) into n_pokes from apagados;

  delete from dev.player_items where true;
  delete from dev.player_pokedex where true;
  delete from dev.player_auto_catch_rules where true;

  with fechadas as (
    update dev.game_sessions
    set closed_at = now()
    where closed_at is null
    returning 1
  )
  select count(*) into n_sessoes from fechadas;

  with resetados as (
    update dev.players
    set trainer_level = default,
        trainer_exp = default,
        gold = default,
        diamonds = default,
        active_team_index = default,
        current_map_id = null,
        unlocked_maps = dev.hunts_iniciais(),
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

  insert into dev.player_items (user_id, item_id, quantity)
  select p.user_id, c.item_id, c.quantity
  from dev.players p
  cross join dev.concessao_inicial_de_itens() c;

  return query select n_jogadores, n_pokes, n_sessoes;
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

create or replace function dev.id_por_nome_de_treinador(nome text)
returns uuid
language sql stable security definer set search_path = dev, public
as $$
  select case when auth.uid() is null then null::uuid
    else (select user_id from dev.players where lower(trainer_name) = lower(trim(nome)) limit 1)
  end;
$$;

revoke all on function dev.vender_poke(uuid) from public;
revoke all on function dev.alternar_habilidade(uuid, text) from public;
revoke all on function dev.wipe_inventario_e_economia() from public;
revoke all on function dev.wipe_mundo_social() from public;
revoke all on function dev.wipe_todos_os_saves() from public;
revoke all on function dev.recusar_ofertas_pendentes(uuid, text, uuid) from public;
revoke all on function dev.id_por_nome_de_treinador(text) from public;
grant execute on function dev.vender_poke(uuid) to authenticated;
grant execute on function dev.alternar_habilidade(uuid, text) to authenticated;
