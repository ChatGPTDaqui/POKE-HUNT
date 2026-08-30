-- PH-284: espelho de 20260829120000_gravar_progresso_grava_bioma_progress_public.sql
-- pro schema dev. Ver o arquivo `_public` para o diagnostico completo.
create or replace function dev.gravar_progresso(p_user_id uuid, p_patch jsonb, p_updated_at_esperado timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'dev'
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
    perf_stats = p_patch->'perf_stats',
    bioma_progress = coalesce(p_patch->'bioma_progress', bioma_progress)
  where user_id = p_user_id and updated_at = p_updated_at_esperado
  returning updated_at into v_novo_updated_at;

  if v_novo_updated_at is null then
    return jsonb_build_object('ok', false, 'conflito', true);
  end if;

  return jsonb_build_object('ok', true, 'updatedAt', v_novo_updated_at);
end;
$function$;

revoke execute on function dev.gravar_progresso(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function dev.gravar_progresso(uuid, jsonb, timestamptz) to service_role;
