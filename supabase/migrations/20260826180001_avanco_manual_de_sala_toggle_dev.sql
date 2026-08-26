-- PH-177: novo toggle `avancoManualDeSala` em auto_toggles. Espelho de
-- 20260826180000_avanco_manual_de_sala_toggle_public.sql pro schema dev.
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
      if v_key not in ('autoPot', 'autoCatch', 'autoRevive', 'autoStatus', 'avancoManualDeSala') then
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
