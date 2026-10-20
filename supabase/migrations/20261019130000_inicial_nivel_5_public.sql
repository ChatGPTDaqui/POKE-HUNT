-- Inicial nasce no nivel 5 (pedido do dono, 19/10/2026). Sem o Ataque Basico o
-- Lv 1 ficava com um golpe de dano so e desmaiava na Rota 46. Capturados
-- continuam nascendo no nivel do encontro. EXP 176 = pokeExpForLevel(5,
-- MEDIUM_SLOW), a curva dos tres iniciais (travado por teste em
-- src/engine/starterNivel5.test.ts). Espelha STARTER_LEVEL em simulation.ts.
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
  select * into v_stats from public._calcular_stats(v_species, 5, 23, 23, 23, 23, 23, 23, 'comum', false);
  select trainer_name into v_nome_treinador from public.players where user_id = v_user_id;

  insert into public.pokemon_instances (
    user_id, species_id, location, team_slot, level, exp, hp, is_shiny, rarity, locked,
    iv_hp, iv_atk_fis, iv_atk_esp, iv_def, iv_def_esp, iv_speed,
    stat_hp, stat_atk_fis, stat_atk_esp, stat_def, stat_def_esp, stat_speed,
    unlocked_abilities, original_trainer, origem
  ) values (
    v_user_id, p_species_id, 'team', 0, 5, 176, v_stats.stat_hp, false, 'comum', false,
    23, 23, 23, 23, 23, 23,
    v_stats.stat_hp, v_stats.stat_atk_fis, v_stats.stat_atk_esp, v_stats.stat_def, v_stats.stat_def_esp, v_stats.stat_speed,
    (select coalesce(array_agg(move_id), '{}') from public.species_moves where species_id = p_species_id and level_req <= 5),
    v_nome_treinador, 'inicial'
  );

  update public.players set active_team_index = 0 where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('%s entrou na sua equipe!', v_species.name));
end;
$function$;
