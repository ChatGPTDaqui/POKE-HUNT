-- PH-492: `configurar_auto` passa a aceitar o toggle `avancarDeEstagio`.
--
-- O DEFEITO QUE ISTO CORRIGE ESTEVE EM PRODUCAO DESDE 02/09, e ele nao era
-- "uma opcao nao salva": a RPC valida os toggles por lista branca e o `raise`
-- derruba a TRANSACAO INTEIRA. Como o cliente manda `autoToggles` cru num
-- batch unico (data/remote/autoridade.ts#sincronizarAuto), a presenca da chave
-- nova fazia o batch inteiro falhar — e NENHUMA configuracao de auto era
-- gravada: os seis toggles, bola padrao e shiny, regras de pocao, regras de
-- captura por especie, itens de cura de status e a auto-venda.
--
-- Confirmado por chamada real contra o schema `dev` antes de escrever isto:
--   avancarDeEstagio sozinho    -> 400 P0001 "toggle desconhecido"
--   autoPot sozinho (controle)  -> 200 {"ok": true}
--   o batch que o cliente manda -> 400 P0001
--
-- O erro era silencioso: `sincronizarAuto` termina em `.catch(reportarErro)`,
-- sem refetch e sem travar a tela. O jogador via a config funcionar na sessao
-- (o motor local le o store) e voltar ao antigo no F5.
--
-- E A MESMA ARMADILHA PELA SEGUNDA VEZ. A migration de 26/08 ja a documentou,
-- e a de 28/08 a repetiu por escrito ao acrescentar `lureConfig`. A PH-428
-- (02/09) levou o toggle novo pro cliente E pro bundle da Edge e deixou a
-- migration pra tras. Meia entrega.
--
-- A CORRECAO ESTRUTURAL NAO E ESTE ARQUIVO, e sim o teste que a PH-492 traz
-- junto: a lista branca daqui e as chaves de `autoToggles` sao a MESMA regra
-- escrita em duas linguagens, e ate agora nada as amarrava.
--
-- Unica mudanca de comportamento: a chave a mais na lista branca. O resto da
-- funcao e reproduzido igual porque `CREATE OR REPLACE` exige o corpo inteiro.

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
      if v_key not in ('autoPot', 'autoCatch', 'autoRevive', 'autoStatus', 'avancoManualDeSala', 'avancarDeEstagio') then
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
    update public.players set auto_lure_config = jsonb_build_object(
      'ligado', coalesce((p_patch->'lureConfig'->>'ligado')::boolean, false),
      'quantidade', v_lure_quantidade
    ) where user_id = v_user_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;
