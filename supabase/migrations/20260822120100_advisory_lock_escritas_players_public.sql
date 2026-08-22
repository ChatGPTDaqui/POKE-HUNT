-- PH-67: advisory lock por usuario nas RPCs que escrevem players (public).
--
-- pg_advisory_xact_lock(hashtext(user_id)) logo no inicio de cada funcao,
-- ANTES de qualquer leitura/escrita. Lock de transacao: libera sozinho no
-- commit/rollback, sem tabela nova, sem mudanca de assinatura. Mesmo lock
-- que gravar_progresso (migration anterior) toma — sao essas duas familias
-- de escrita (RPC de acao vs flush) que colidiam e geravam
-- CONFLITO_ESCRITA_JOGADOR (409) em producao.
--
-- Escopo: so as 15 RPCs que escrevem players SO do proprio v_user_id (auth.
-- uid() do chamador). Fora do escopo, deliberadamente:
--
--   - wipe_todos_os_saves / wipe_inventario_e_economia: admin, `where true`
--     em TODOS os jogadores, sem user_id nenhum — lock por usuario nao se
--     aplica a uma operacao global.
--   - evoluir_poke: nao escreve players (so pokemon_instances/player_items).
--   - comprar_anuncio, responder_oferta, recusar_ofertas_pendentes,
--     criar_ordem_mercado: escrevem players de OUTRO(S) usuario(s) tambem
--     (comprador+vendedor, ou N contrapartes no motor de casamento de
--     ordens) — travar so o chamador nao protege a contraparte, e travar
--     todos exige descobrir quem vai ser tocado ANTES de escrever (hoje e
--     descoberto em runtime, no meio da funcao) pra travar em ordem
--     deterministica sem criar deadlock novo. Redesenho maior, fora deste
--     PH — achado registrado, nao resolvido aqui.
--

-- public.cancelar_oferta
CREATE OR REPLACE FUNCTION public.cancelar_oferta(p_oferta_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_oferta public.market_offers;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
$function$;
-- public.cancelar_ordem_mercado
CREATE OR REPLACE FUNCTION public.cancelar_ordem_mercado(p_ordem_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_ordem public.market_orders;
  v_item_nome text;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
$function$;
-- public.comprar_item
CREATE OR REPLACE FUNCTION public.comprar_item(p_item_id text, p_qtd integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_item public.items;
  v_custo bigint;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
$function$;
-- public.configurar_auto
CREATE OR REPLACE FUNCTION public.configurar_auto(p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_rule jsonb;
  v_raridade text;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  if p_patch is null or jsonb_typeof(p_patch) != 'object' then
    raise exception 'patch invalido' using errcode = 'P0001';
  end if;

  if p_patch ? 'toggles' then
    for v_key in select jsonb_object_keys(p_patch->'toggles') loop
      if v_key not in ('autoPot', 'autoCatch', 'autoRevive', 'autoStatus') then
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

  if p_patch ? 'statusItems' then
    if jsonb_typeof(p_patch->'statusItems') != 'object' then
      raise exception 'statusItems invalido' using errcode = 'P0001';
    end if;
    for v_key in select jsonb_object_keys(p_patch->'statusItems') loop
      if v_key not in ('antidote', 'awakening', 'burn_heal', 'ice_heal', 'paralyze_heal', 'full_heal') then
        raise exception 'item de status desconhecido: %', v_key using errcode = 'P0001';
      end if;
      if jsonb_typeof(p_patch->'statusItems'->v_key) != 'boolean' then
        raise exception 'statusItems.%: precisa ser booleano', v_key using errcode = 'P0001';
      end if;
    end loop;
    update public.players set auto_status_config = auto_status_config || (p_patch->'statusItems') where user_id = v_user_id;
  end if;

  -- Auto-venda. Gravada por SUBSTITUICAO (jsonb_build_object), e nao por merge
  -- `||`: a lista de raridades e uma escolha completa, e um merge nunca
  -- conseguiria DESMARCAR a ultima raridade — o array vindo vazio seria
  -- ignorado e o bot continuaria vendendo.
  if p_patch ? 'sellConfig' then
    if jsonb_typeof(p_patch->'sellConfig') != 'object' then
      raise exception 'sellConfig invalido' using errcode = 'P0001';
    end if;
    if jsonb_typeof(p_patch->'sellConfig'->'raridades') != 'array' then
      raise exception 'sellConfig.raridades precisa ser lista' using errcode = 'P0001';
    end if;
    -- Whitelist explicita: o valor cai direto numa comparacao dentro da
    -- simulacao, e uma raridade inventada passaria batida (nunca casaria) em
    -- vez de virar erro na hora de configurar.
    for v_raridade in select jsonb_array_elements_text(p_patch->'sellConfig'->'raridades') loop
      if v_raridade not in ('comum', 'incomum', 'raro', 'ultra', 'legendary', 'mythic') then
        raise exception 'raridade desconhecida: %', v_raridade using errcode = 'P0001';
      end if;
    end loop;
    update public.players set auto_sell_config = jsonb_build_object(
      'ligado', coalesce((p_patch->'sellConfig'->>'ligado')::boolean, false),
      'raridades', p_patch->'sellConfig'->'raridades'
    ) where user_id = v_user_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;
-- public.definir_ativo
CREATE OR REPLACE FUNCTION public.definir_ativo(p_poke_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_old_slot smallint;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
$function$;
-- public.definir_nome_do_treinador
CREATE OR REPLACE FUNCTION public.definir_nome_do_treinador(p_nome text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_tem_poke boolean;
  v_nome text := trim(p_nome);
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
$function$;
-- public.desbloquear_hunt
CREATE OR REPLACE FUNCTION public.desbloquear_hunt(p_map_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_mapa public.maps;
  v_ja_tem boolean;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
$function$;
-- public.escolher_starter
CREATE OR REPLACE FUNCTION public.escolher_starter(p_species_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_ja_tem boolean;
  v_species public.species;
  v_stats record;
  v_nome_treinador text;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
$function$;
-- public.ofertar_no_anuncio
CREATE OR REPLACE FUNCTION public.ofertar_no_anuncio(p_anuncio_id uuid, p_valor bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_anuncio public.market_listings;
  v_nome text;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
$function$;
-- public.reiniciar_jogo
CREATE OR REPLACE FUNCTION public.reiniciar_jogo()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_anuncio record;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
    unlocked_maps = '{}', unlocked_continents = array['faixa1','faixa2'],
    perf_stats = '{"gold":0,"xp":0,"mobs":0,"shinys":0,"captures":0,"items":0,"since":0}'::jsonb
  where user_id = v_user_id;
  delete from public.pokemon_instances where user_id = v_user_id;
  delete from public.player_items where user_id = v_user_id;
  delete from public.player_pokedex where user_id = v_user_id;
  delete from public.player_auto_catch_rules where user_id = v_user_id;

  insert into public.player_items (user_id, item_id, quantity)
  select v_user_id, c.item_id, c.quantity
  from public.concessao_inicial_de_itens() c;
end;
$function$;
-- public.tirar_da_equipe
CREATE OR REPLACE FUNCTION public.tirar_da_equipe(p_poke_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_old_slot smallint;
  v_team_count int;
  v_nome text;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
$function$;
-- public.vender_item
CREATE OR REPLACE FUNCTION public.vender_item(p_item_id text, p_qtd integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_item public.items;
  v_locked boolean;
  v_atual int;
  v_ganho bigint;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
$function$;
-- public.vender_poke
CREATE OR REPLACE FUNCTION public.vender_poke(p_poke_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_poke public.pokemon_instances;
  v_base_exp int;
  v_valor bigint;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
$function$;
-- public.vender_pokes
CREATE OR REPLACE FUNCTION public.vender_pokes(p_poke_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_total_gold bigint := 0;
  v_count int := 0;
  v_row record;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
      and coalesce(pi.locked, false) = false
    for update of pi
  loop
    v_total_gold := v_total_gold + public._valor_venda_poke(v_row.level, v_row.base_exp, v_row.rarity::text);
    v_count := v_count + 1;
    delete from public.pokemon_instances where id = v_row.id;
  end loop;

  update public.players set gold = gold + v_total_gold where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('Vendeu %s POKEs por %s de ouro.', v_count, v_total_gold));
end;
$function$;
-- public.vender_todos_itens
CREATE OR REPLACE FUNCTION public.vender_todos_itens()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_total_gold bigint;
  v_item_count bigint;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
$function$;