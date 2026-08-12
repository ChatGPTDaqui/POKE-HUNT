
create or replace function dev.por_na_equipe(p_poke_id uuid)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_count int;
  v_species_id text;
  v_nome text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select count(*) into v_team_count from dev.pokemon_instances where user_id = v_user_id and location = 'team';
  select species_id into v_species_id from dev.pokemon_instances
    where id = p_poke_id and user_id = v_user_id and location = 'bag';

  -- PH-25: causas separadas, mensagem certa pra cada uma (antes as duas
  -- caiam no mesmo "POKE nao esta na mochila", enganoso quando a causa real
  -- era equipe cheia).
  if v_species_id is null then
    raise exception 'POKE nao esta na mochila' using errcode = 'P0001';
  end if;
  if v_team_count >= 6 then
    raise exception 'Sua equipe ja esta cheia (6 POKEs).' using errcode = 'P0001';
  end if;

  update dev.pokemon_instances set location = 'team', team_slot = v_team_count, updated_at = now()
    where id = p_poke_id;

  select name into v_nome from dev.species where id = v_species_id;
  return jsonb_build_object('ok', true, 'mensagem', format('%s entrou na equipe.', coalesce(v_nome, 'POKE')));
end;
$$;
