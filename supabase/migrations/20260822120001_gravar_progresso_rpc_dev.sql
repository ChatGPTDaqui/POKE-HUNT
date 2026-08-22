-- PH-67: 409 esporadico em escritas concorrentes de players.
--
-- `gravarEstado` (authority/src/progresso.ts) fazia o CAS de
-- `players.updated_at` via PATCH cru no REST, fora de qualquer funcao —
-- travar as RPCs de acao (comprar/vender/configurar_auto/etc) com
-- `pg_advisory_xact_lock` nao serializa contra esse PATCH: o lock e de
-- transacao, e o PATCH cru abre a propria transacao HTTP, nunca pede o
-- mesmo lock. Esta RPC substitui o PATCH: mesmo CAS de antes, agora
-- dentro de uma funcao que pega o advisory lock por usuario primeiro —
-- assim ela e as RPCs de acao (proxima migration) disputam o MESMO lock e
-- ficam realmente serializadas, em vez de correndo em paralelo.
--
-- Retorna jsonb em vez de levantar excecao no CAS que falha: o cliente
-- (authority/src/progresso.ts) ja trata isso via `gravada.length === 0`
-- hoje, so troca a fonte do sinal de `{ok:false}` no corpo pra `.length`
-- do array do PATCH — mesma logica de retry, chamada diferente.
create or replace function dev.gravar_progresso(p_patch jsonb, p_updated_at_esperado timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'dev'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_novo_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) != 'object' then
    raise exception 'patch invalido' using errcode = 'P0001';
  end if;

  -- Mesmo lock que as RPCs de acao tomam (ver migration seguinte) — e o que
  -- de fato serializa flush contra comprar/vender/etc no mesmo usuario.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  update dev.players set
    trainer_name = p_patch->>'trainer_name',
    trainer_level = (p_patch->>'trainer_level')::int,
    trainer_exp = (p_patch->>'trainer_exp')::bigint,
    gold = (p_patch->>'gold')::bigint,
    diamonds = (p_patch->>'diamonds')::int,
    active_team_index = (p_patch->>'active_team_index')::smallint,
    current_map_id = p_patch->>'current_map_id',
    unlocked_maps = (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_patch->'unlocked_maps') x),
    unlocked_continents = (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_patch->'unlocked_continents') x),
    auto_toggles = p_patch->'auto_toggles',
    auto_pot_rules = p_patch->'auto_pot_rules',
    auto_catch_config = p_patch->'auto_catch_config',
    auto_sell_config = p_patch->'auto_sell_config',
    auto_status_config = p_patch->'auto_status_config',
    perf_stats = p_patch->'perf_stats'
  where user_id = v_user_id and updated_at = p_updated_at_esperado
  returning updated_at into v_novo_updated_at;

  if v_novo_updated_at is null then
    -- CAS falhou: ou o snapshot lido pelo cliente ja estava velho (outra
    -- escrita colidiu antes deste lock), ou o `updated_at` esperado nunca
    -- existiu (jogador sem linha). `gravarEstado` ja tratava as duas coisas
    -- como "conflito, tenta de novo" antes desta migration — mesmo
    -- comportamento, so a origem do sinal mudou de PATCH pra RPC.
    return jsonb_build_object('ok', false, 'conflito', true);
  end if;

  return jsonb_build_object('ok', true, 'updatedAt', v_novo_updated_at);
end;
$function$;

grant execute on function dev.gravar_progresso(jsonb, timestamptz) to authenticated;
