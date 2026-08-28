-- PH-235: LURE — reunir de 1 a 4 selvagens antes de o POKE parar pra lutar.
--
-- Duas mudancas, e as duas precisam andar juntas:
--
-- 1. Coluna `auto_lure_config` em players. O SERVIDOR resimula a janela de
--    flush com o MESMO motor do cliente (authority/src/progresso.ts), e o lure
--    muda pra onde o jogador anda — sem a config do lado dele, o servidor
--    mataria 1 a 1 enquanto o cliente mostra 4 de uma vez, e a barra de XP
--    "voltaria" a cada flush (mesma familia do PH-171).
--
-- 2. `configurar_auto` passa a aceitar a chave `lureConfig`. A RPC tem
--    validacao por chave conhecida e ABORTA A TRANSACAO INTEIRA numa chave que
--    ela nao espera (mesma armadilha documentada em 20260826180000): sem este
--    CREATE OR REPLACE, o cliente novo manda `lureConfig` no batch e NENHUM dos
--    outros campos de automacao e salvo tambem.
--
-- `quantidade` e validada AQUI, e nao so no cliente: limite de negocio que
-- existe so no cliente neste projeto ja virou 502 (ver CLAUDE.md). Os numeros 1
-- e 4 repetem LURE_QUANTIDADE_MIN/MAX de src/stores/gameStateDefaults.ts — nao
-- ha como um SQL importar TS, entao a duplicacao e nomeada de proposito nos dois
-- lados.
--
-- Gravada por SUBSTITUICAO (jsonb_build_object) e nao por merge `||`, pelo mesmo
-- motivo de `auto_sell_config`: a config e uma escolha completa de duas chaves,
-- e um merge nao consegue expressar "desliga" de forma inequivoca.

alter table dev.players
  add column if not exists auto_lure_config jsonb not null
  default '{"ligado": false, "quantidade": 2}'::jsonb;

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
  v_lure_quantidade int;
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

  -- LURE (PH-235). `jsonb_typeof(... ->'quantidade') = 'number'` ANTES do cast:
  -- um `::int` direto sobre texto lixo estoura como erro de cast (22P02) em vez
  -- da mensagem de negocio, e a transacao inteira do batch cai com ela.
  if p_patch ? 'lureConfig' then
    if jsonb_typeof(p_patch->'lureConfig') != 'object' then
      raise exception 'lureConfig invalido' using errcode = 'P0001';
    end if;
    if jsonb_typeof(p_patch->'lureConfig'->'quantidade') != 'number' then
      raise exception 'lureConfig.quantidade precisa ser numero' using errcode = 'P0001';
    end if;
    v_lure_quantidade := (p_patch->'lureConfig'->>'quantidade')::int;
    if v_lure_quantidade < 1 or v_lure_quantidade > 4 then
      raise exception 'lureConfig.quantidade deve ficar entre 1 e 4 (recebido %)', v_lure_quantidade
        using errcode = 'P0001';
    end if;
    update dev.players set auto_lure_config = jsonb_build_object(
      'ligado', coalesce((p_patch->'lureConfig'->>'ligado')::boolean, false),
      'quantidade', v_lure_quantidade
    ) where user_id = v_user_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;
