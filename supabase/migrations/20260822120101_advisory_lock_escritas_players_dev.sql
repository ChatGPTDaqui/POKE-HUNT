-- PH-67: advisory lock por usuario nas RPCs que escrevem players (dev).
-- Espelho exato da migration irma em public — ver aquela pro raciocinio
-- completo (motivo do lock, e por que 4 RPCs de mercado + 2 wipes + 1
-- evoluir_poke ficam de fora deste escopo).

-- dev.cancelar_oferta
CREATE OR REPLACE FUNCTION dev.cancelar_oferta(p_oferta_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_oferta dev.market_offers;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
$function$;
-- dev.cancelar_ordem_mercado
CREATE OR REPLACE FUNCTION dev.cancelar_ordem_mercado(p_ordem_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_ordem dev.market_orders;
  v_item_nome text;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
$function$;
-- dev.comprar_item
CREATE OR REPLACE FUNCTION dev.comprar_item(p_item_id text, p_qtd integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_item dev.items;
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

  select * into v_item from dev.items where id = p_item_id;
  if v_item is null or v_item.buy_price_atual is null then
    raise exception 'Item desconhecido.' using errcode = 'P0001';
  end if;

  v_custo := v_item.buy_price_atual::bigint * p_qtd;

  update dev.players set gold = gold - v_custo
    where user_id = v_user_id and gold >= v_custo;
  if not found then
    raise exception 'Ouro insuficiente.' using errcode = 'P0001';
  end if;

  insert into dev.player_items (user_id, item_id, quantity)
  values (v_user_id, p_item_id, p_qtd)
  on conflict (user_id, item_id) do update
    set quantity = dev.player_items.quantity + excluded.quantity, updated_at = now();

  return jsonb_build_object('ok', true, 'mensagem', format('Comprou %s x%s por %s de ouro.', v_item.name, p_qtd, v_custo));
end;
$function$;
-- dev.configurar_auto
CREATE OR REPLACE FUNCTION dev.configurar_auto(p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev'
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
    update dev.players set auto_toggles = auto_toggles || (p_patch->'toggles') where user_id = v_user_id;
  end if;

  if p_patch ? 'catchConfig' then
    if not (p_patch->'catchConfig' ? 'ballId' and p_patch->'catchConfig' ? 'shinyBallId') then
      raise exception 'catchConfig invalido' using errcode = 'P0001';
    end if;
    update dev.players set auto_catch_config = jsonb_build_object(
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
    update dev.players set auto_pot_rules = p_patch->'potRules' where user_id = v_user_id;
  end if;

  if p_patch ? 'catchRules' then
    if jsonb_typeof(p_patch->'catchRules') != 'array' or jsonb_array_length(p_patch->'catchRules') > 20 then
      raise exception 'catchRules: no maximo 20 regras' using errcode = 'P0001';
    end if;
    delete from dev.player_auto_catch_rules where user_id = v_user_id;
    insert into dev.player_auto_catch_rules (user_id, species_id, ball_item_id)
    select v_user_id, r->>'speciesId', r->>'ballItemId'
    from jsonb_array_elements(p_patch->'catchRules') r
    where coalesce(r->>'speciesId', '') != '' and coalesce(r->>'ballItemId', '') != '';
  end if;

  -- Os 6 itens reais de cura de status (data/items.ts, kind 'status_heal').
  -- Lista fechada em vez de aceitar qualquer chave: sem isso o jogador
  -- gravaria lixo arbitrario num JSONB sem limite de tamanho.
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
    update dev.players set auto_status_config = auto_status_config || (p_patch->'statusItems') where user_id = v_user_id;
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
    update dev.players set auto_sell_config = jsonb_build_object(
      'ligado', coalesce((p_patch->'sellConfig'->>'ligado')::boolean, false),
      'raridades', p_patch->'sellConfig'->'raridades'
    ) where user_id = v_user_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;
-- dev.definir_ativo
CREATE OR REPLACE FUNCTION dev.definir_ativo(p_poke_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
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

  select team_slot into v_old_slot from dev.pokemon_instances
    where id = p_poke_id and user_id = v_user_id and location = 'team';
  if v_old_slot is null then
    raise exception 'indice fora da equipe' using errcode = 'P0001';
  end if;

  set constraints dev.one_pokemon_per_team_slot deferred;

  update dev.pokemon_instances set team_slot = team_slot + 1
    where user_id = v_user_id and location = 'team' and team_slot < v_old_slot;
  update dev.pokemon_instances set team_slot = 0, updated_at = now() where id = p_poke_id;
  update dev.players set active_team_index = 0 where user_id = v_user_id;

  return jsonb_build_object('ok', true);
end;
$function$;
-- dev.definir_nome_do_treinador
CREATE OR REPLACE FUNCTION dev.definir_nome_do_treinador(p_nome text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
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

  select exists(select 1 from dev.pokemon_instances where user_id = v_user_id) into v_tem_poke;
  if v_tem_poke then
    raise exception 'O nome do treinador so pode ser escolhido antes do primeiro POKE.' using errcode = 'P0001';
  end if;

  begin
    update dev.players set trainer_name = v_nome where user_id = v_user_id;
  exception when unique_violation then
    raise exception 'Esse nome ja esta em uso.' using errcode = 'P0001';
  end;

  return jsonb_build_object('ok', true, 'mensagem', format('Bem-vindo, %s!', v_nome));
end;
$function$;
-- dev.desbloquear_hunt
CREATE OR REPLACE FUNCTION dev.desbloquear_hunt(p_map_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_mapa dev.maps;
  v_ja_tem boolean;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select * into v_mapa from dev.maps where id = p_map_id;
  if v_mapa is null then
    raise exception 'hunt desconhecida' using errcode = 'P0001';
  end if;

  select p_map_id = any(unlocked_maps) into v_ja_tem from dev.players where user_id = v_user_id;
  if v_ja_tem then
    return jsonb_build_object('ok', true, 'mensagem', format('%s desbloqueada!', v_mapa.name));
  end if;

  if v_mapa.unlock_cost is not null then
    update dev.players set gold = gold - v_mapa.unlock_cost, unlocked_maps = array_append(unlocked_maps, p_map_id)
      where user_id = v_user_id and gold >= v_mapa.unlock_cost;
    if not found then
      raise exception 'Recursos insuficientes.' using errcode = 'P0001';
    end if;
  else
    update dev.players set unlocked_maps = array_append(unlocked_maps, p_map_id) where user_id = v_user_id;
  end if;

  return jsonb_build_object('ok', true, 'mensagem', format('%s desbloqueada!', v_mapa.name));
end;
$function$;
-- dev.escolher_starter
CREATE OR REPLACE FUNCTION dev.escolher_starter(p_species_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_ja_tem boolean;
  v_species dev.species;
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

  select exists(select 1 from dev.pokemon_instances where user_id = v_user_id) into v_ja_tem;
  if v_ja_tem then
    raise exception 'voce ja tem um POKE' using errcode = 'P0001';
  end if;

  select * into v_species from dev.species where id = p_species_id;
  select * into v_stats from dev._calcular_stats(v_species, 1, 23, 23, 23, 23, 23, 23, 'comum', false);
  select trainer_name into v_nome_treinador from dev.players where user_id = v_user_id;

  insert into dev.pokemon_instances (
    user_id, species_id, location, team_slot, level, exp, hp, is_shiny, rarity, locked,
    iv_hp, iv_atk_fis, iv_atk_esp, iv_def, iv_def_esp, iv_speed,
    stat_hp, stat_atk_fis, stat_atk_esp, stat_def, stat_def_esp, stat_speed,
    unlocked_abilities, original_trainer
  ) values (
    v_user_id, p_species_id, 'team', 0, 1, 0, v_stats.stat_hp, false, 'comum', false,
    23, 23, 23, 23, 23, 23,
    v_stats.stat_hp, v_stats.stat_atk_fis, v_stats.stat_atk_esp, v_stats.stat_def, v_stats.stat_def_esp, v_stats.stat_speed,
    (select coalesce(array_agg(move_id), '{}') from dev.species_moves where species_id = p_species_id and level_req <= 1),
    v_nome_treinador
  );

  update dev.players set active_team_index = 0 where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('%s entrou na sua equipe!', v_species.name));
end;
$function$;
-- dev.ofertar_no_anuncio
CREATE OR REPLACE FUNCTION dev.ofertar_no_anuncio(p_anuncio_id uuid, p_valor bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_anuncio dev.market_listings;
  v_nome text;
begin
  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));
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
$function$;
-- dev.reiniciar_jogo
CREATE OR REPLACE FUNCTION dev.reiniciar_jogo()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
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

  for v_anuncio in select id from dev.market_listings where seller_id = v_user_id and status = 'ativo' loop
    perform dev.recusar_ofertas_pendentes(v_anuncio.id, 'Conta resetada pelo vendedor — oferta devolvida');
  end loop;

  update dev.market_offers set status = 'cancelada', resolved_at = now()
  where buyer_id = v_user_id and status = 'pendente';

  delete from dev.market_listings where seller_id = v_user_id;
  delete from dev.pokemon_instances where user_id = v_user_id and location = 'market';
  delete from dev.market_orders where user_id = v_user_id;
  delete from dev.market_deliveries where user_id = v_user_id;
  delete from dev.game_sessions where user_id = v_user_id;

  update dev.players set
    trainer_level = 1, trainer_exp = 0, gold = 1000, diamonds = 0,
    active_team_index = 0, current_map_id = null,
    unlocked_maps = '{}', unlocked_continents = array['faixa1','faixa2'],
    perf_stats = '{"gold":0,"xp":0,"mobs":0,"shinys":0,"captures":0,"items":0,"since":0}'::jsonb
  where user_id = v_user_id;
  delete from dev.pokemon_instances where user_id = v_user_id;
  delete from dev.player_items where user_id = v_user_id;
  delete from dev.player_pokedex where user_id = v_user_id;
  delete from dev.player_auto_catch_rules where user_id = v_user_id;

  insert into dev.player_items (user_id, item_id, quantity)
  select v_user_id, c.item_id, c.quantity
  from dev.concessao_inicial_de_itens() c;
end;
$function$;
-- dev.tirar_da_equipe
CREATE OR REPLACE FUNCTION dev.tirar_da_equipe(p_poke_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
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

  select count(*) into v_team_count from dev.pokemon_instances where user_id = v_user_id and location = 'team';
  if v_team_count <= 1 then
    raise exception 'voce precisa manter ao menos 1 POKE na equipe' using errcode = 'P0001';
  end if;

  select team_slot, s.name into v_old_slot, v_nome
    from dev.pokemon_instances pi join dev.species s on s.id = pi.species_id
    where pi.id = p_poke_id and pi.user_id = v_user_id and pi.location = 'team';
  if v_old_slot is null then
    raise exception 'POKE nao esta na equipe' using errcode = 'P0001';
  end if;

  update dev.pokemon_instances set location = 'bag', team_slot = null, updated_at = now() where id = p_poke_id;
  update dev.pokemon_instances set team_slot = team_slot - 1
    where user_id = v_user_id and location = 'team' and team_slot > v_old_slot;
  update dev.players set active_team_index = case
      when active_team_index > v_old_slot then active_team_index - 1
      when active_team_index = v_old_slot then least(active_team_index, v_team_count - 2)
      else active_team_index
    end
    where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('%s foi para a mochila.', coalesce(v_nome, 'POKE')));
end;
$function$;
-- dev.vender_item
CREATE OR REPLACE FUNCTION dev.vender_item(p_item_id text, p_qtd integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_item dev.items;
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

  select * into v_item from dev.items where id = p_item_id;
  if v_item is null then
    raise exception 'Item desconhecido.' using errcode = 'P0001';
  end if;

  select quantity, locked into v_atual, v_locked from dev.player_items
    where user_id = v_user_id and item_id = p_item_id;

  if coalesce(v_locked, false) then
    raise exception 'Este item esta travado — destrave antes de vender.' using errcode = 'P0001';
  end if;
  if v_atual is null or v_atual < p_qtd then
    raise exception 'Voce nao tem itens suficientes.' using errcode = 'P0001';
  end if;

  update dev.player_items set quantity = quantity - p_qtd, updated_at = now()
    where user_id = v_user_id and item_id = p_item_id;

  v_ganho := v_item.sell_price::bigint * p_qtd;
  update dev.players set gold = gold + v_ganho where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('Vendeu %s x%s por %s de ouro.', v_item.name, p_qtd, v_ganho));
end;
$function$;
-- dev.vender_poke
CREATE OR REPLACE FUNCTION dev.vender_poke(p_poke_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_poke dev.pokemon_instances;
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
$function$;
-- dev.vender_pokes
CREATE OR REPLACE FUNCTION dev.vender_pokes(p_poke_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev'
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
    from dev.pokemon_instances pi
    join dev.species s on s.id = pi.species_id
    where pi.id = any(p_poke_ids) and pi.user_id = v_user_id and pi.location = 'bag'
      and coalesce(pi.locked, false) = false
    for update of pi
  loop
    v_total_gold := v_total_gold + dev._valor_venda_poke(v_row.level, v_row.base_exp, v_row.rarity::text);
    v_count := v_count + 1;
    delete from dev.pokemon_instances where id = v_row.id;
  end loop;

  update dev.players set gold = gold + v_total_gold where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('Vendeu %s POKEs por %s de ouro.', v_count, v_total_gold));
end;
$function$;
-- dev.vender_todos_itens
CREATE OR REPLACE FUNCTION dev.vender_todos_itens()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'dev', 'public'
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
    from dev.player_items pi
    join dev.items i on i.id = pi.item_id
    where pi.user_id = v_user_id and pi.quantity > 0 and coalesce(pi.locked, false) = false
    for update of pi
  )
  select coalesce(sum(quantity * sell_price), 0), coalesce(sum(quantity), 0)
    into v_total_gold, v_item_count
  from alvo;

  update dev.player_items set quantity = 0, updated_at = now()
    where user_id = v_user_id and quantity > 0 and coalesce(locked, false) = false;

  update dev.players set gold = gold + v_total_gold where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('Vendeu %s itens por %s de ouro.', v_item_count, v_total_gold));
end;
$function$;