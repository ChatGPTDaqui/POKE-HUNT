-- PH-67: corrige gravar_progresso (migration 20260822120000) — nao funcionava
-- pro chamador real e tinha grant errado.
--
-- Achado 1 (funcional, bloqueante): `authority` chama TODAS as RPCs com a
-- `service_role` key (authority/src/db.ts, `cabecalhos()` — nunca forwarda o
-- JWT do jogador). `auth.uid()` depende do claim `sub` do JWT que chega no
-- Authorization header; o token de service_role nao tem `sub` de jogador
-- nenhum. Testado direto: POST /rpc/gravar_progresso com service_role key
-- devolve 403 "nao autenticado" -- a versao anterior desta RPC NUNCA
-- funcionaria pro unico chamador real dela. `authority` so testou verde
-- porque o teste unitario mocka `chamarRpc()`; so apareceu chamando a RPC de
-- verdade via REST.
--
-- Achado 2 (seguranca, o motivo de nao poder so trocar por p_user_id +
-- manter `grant ... to authenticated`): sem `auth.uid()` pra amarrar a
-- identidade, a funcao passa a confiar cegamente em `p_user_id`. Se
-- qualquer usuario autenticado pudesse chamar isso, bastaria passar o uuid
-- de OUTRO jogador pra sobrescrever a conta alheia inteira (ouro, nivel,
-- tudo) -- pior que qualquer uma das 15 RPCs da migration anterior, porque
-- aquelas so aceitam parametro validado (ex: id de item + quantidade),
-- nunca um patch livre de colunas inteiras. Fix: revoga de PUBLIC, concede
-- so pra `service_role` -- exatamente quem tem acesso a esta rota hoje (o
-- PATCH cru que esta RPC substitui so era alcancavel com a mesma chave).
--
-- `CREATE OR REPLACE` nao serve aqui: mudar a lista de parametros cria uma
-- funcao NOVA sobrecarregada, nao substitui a velha. Drop explicito.
drop function if exists public.gravar_progresso(jsonb, timestamptz);

create or replace function public.gravar_progresso(p_user_id uuid, p_patch jsonb, p_updated_at_esperado timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_novo_updated_at timestamptz;
begin
  if p_user_id is null then
    raise exception 'p_user_id obrigatorio' using errcode = 'P0001';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) != 'object' then
    raise exception 'patch invalido' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  update public.players set
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
  where user_id = p_user_id and updated_at = p_updated_at_esperado
  returning updated_at into v_novo_updated_at;

  if v_novo_updated_at is null then
    return jsonb_build_object('ok', false, 'conflito', true);
  end if;

  return jsonb_build_object('ok', true, 'updatedAt', v_novo_updated_at);
end;
$function$;

revoke execute on function public.gravar_progresso(uuid, jsonb, timestamptz) from public;
grant execute on function public.gravar_progresso(uuid, jsonb, timestamptz) to service_role;
