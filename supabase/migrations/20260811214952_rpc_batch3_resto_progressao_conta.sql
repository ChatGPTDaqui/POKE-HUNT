-- Helpers de stat (formula real Gen2, hoje em formulas.STAT_FORMULA/HP_FORMULA
-- -- expressao com variavel, generated column/lookup simples nao serve, shape
-- replicado aqui igual foi feito pro desconto de item).
create function dev._calcular_stat(p_base int, p_level int, p_iv int, p_is_hp boolean)
returns int
language sql immutable
set search_path = dev, public
as $$
  select case when p_is_hp
    then floor((2*p_base+p_iv)*p_level::numeric/100) + p_level + 10
    else floor((2*p_base+p_iv)*p_level::numeric/100) + 5
  end::int
$$;
revoke all on function dev._calcular_stat(int, int, int, boolean) from public;
revoke all on function dev._calcular_stat(int, int, int, boolean) from authenticated;

create function dev._calcular_stats(
  p_species dev.species, p_level int,
  p_iv_hp int, p_iv_atk_fis int, p_iv_atk_esp int, p_iv_def int, p_iv_def_esp int, p_iv_speed int,
  p_rarity text, p_is_shiny boolean
) returns table(stat_hp int, stat_atk_fis int, stat_atk_esp int, stat_def int, stat_def_esp int, stat_speed int)
language plpgsql immutable
set search_path = dev, public
as $$
declare
  v_shiny_mult numeric := case when p_is_shiny then 1.5 else 1 end;
  v_rarity_mult numeric := case p_rarity
    when 'incomum' then 1.15 when 'raro' then 1.35 when 'ultra' then 1.7
    when 'legendary' then 2.2 when 'mythic' then 3 else 1 end;
begin
  return query select
    greatest(1, round(dev._calcular_stat(p_species.base_hp, p_level, p_iv_hp, true) * v_shiny_mult * v_rarity_mult))::int,
    greatest(1, round(dev._calcular_stat(p_species.base_atk_fis, p_level, p_iv_atk_fis, false) * v_shiny_mult * v_rarity_mult))::int,
    greatest(1, round(dev._calcular_stat(p_species.base_atk_esp, p_level, p_iv_atk_esp, false) * v_shiny_mult * v_rarity_mult))::int,
    greatest(1, round(dev._calcular_stat(p_species.base_def, p_level, p_iv_def, false) * v_shiny_mult * v_rarity_mult))::int,
    greatest(1, round(dev._calcular_stat(p_species.base_def_esp, p_level, p_iv_def_esp, false) * v_shiny_mult * v_rarity_mult))::int,
    greatest(1, round(dev._calcular_stat(p_species.base_speed, p_level, p_iv_speed, false) * v_shiny_mult * v_rarity_mult))::int;
end;
$$;
revoke all on function dev._calcular_stats(dev.species, int, int, int, int, int, int, int, text, boolean) from public;
revoke all on function dev._calcular_stats(dev.species, int, int, int, int, int, int, int, text, boolean) from authenticated;

-- Porta acoes.ts#escolherStarter.
create function dev.escolher_starter(p_species_id text)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ja_tem boolean;
  v_species dev.species;
  v_stats record;
  v_nome_treinador text;
begin
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
$$;
revoke all on function dev.escolher_starter(text) from public;
grant execute on function dev.escolher_starter(text) to authenticated;

-- Porta acoes.ts#definirNomeDoTreinador.
create function dev.definir_nome_do_treinador(p_nome text)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tem_poke boolean;
  v_nome text := trim(p_nome);
begin
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
$$;
revoke all on function dev.definir_nome_do_treinador(text) from public;
grant execute on function dev.definir_nome_do_treinador(text) to authenticated;

-- Porta acoes.ts#evoluirPoke + progressionSystem.ts#evolvePokeInstance.
-- minLevel (anti-de-evolucao por penalidade de morte) NAO existe como coluna
-- em pokemon_instances -- gap real, registrado, so importa quando #14 (farm
-- offline/penalidade de morte) for construido.
create function dev.evoluir_poke(p_poke_id uuid)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_poke dev.pokemon_instances;
  v_species dev.species;
  v_new_species dev.species;
  v_stone_item_id text;
  v_stone_count int := 20;
  v_stone_nome text;
  v_tem_stone boolean;
  v_hp_ratio numeric;
  v_stats record;
  v_new_hp int;
  v_new_abilities text[];
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select * into v_poke from dev.pokemon_instances where id = p_poke_id and user_id = v_user_id;
  if v_poke is null then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  select * into v_species from dev.species where id = v_poke.species_id;
  if v_species.evolves_to is null or v_species.evolves_at_level is null or v_poke.level < v_species.evolves_at_level then
    raise exception 'este POKE ainda nao pode evoluir' using errcode = 'P0001';
  end if;

  if v_species.is_special_evolution then
    v_stone_item_id := 'stone_' || lower(v_species.type1::text);
    select quantity >= v_stone_count into v_tem_stone from dev.player_items
      where user_id = v_user_id and item_id = v_stone_item_id;
    if not coalesce(v_tem_stone, false) then
      select name into v_stone_nome from dev.items where id = v_stone_item_id;
      raise exception 'faltam %sx %s', v_stone_count, coalesce(v_stone_nome, v_stone_item_id) using errcode = 'P0001';
    end if;
  end if;

  select * into v_new_species from dev.species where id = v_species.evolves_to;
  v_hp_ratio := v_poke.hp::numeric / v_poke.stat_hp;
  select * into v_stats from dev._calcular_stats(v_new_species, v_poke.level,
    v_poke.iv_hp, v_poke.iv_atk_fis, v_poke.iv_atk_esp, v_poke.iv_def, v_poke.iv_def_esp, v_poke.iv_speed,
    v_poke.rarity::text, v_poke.is_shiny);
  v_new_hp := greatest(1, round(v_stats.stat_hp * v_hp_ratio));

  select array_agg(distinct move_id) into v_new_abilities
    from dev.species_moves
    where species_id = v_new_species.id and level_req <= v_poke.level
      and move_id != all(coalesce(v_poke.unlocked_abilities, '{}'));

  if v_species.is_special_evolution then
    update dev.player_items set quantity = quantity - v_stone_count, updated_at = now()
      where user_id = v_user_id and item_id = v_stone_item_id;
  end if;

  update dev.pokemon_instances set
    species_id = v_new_species.id,
    stat_hp = v_stats.stat_hp, stat_atk_fis = v_stats.stat_atk_fis, stat_atk_esp = v_stats.stat_atk_esp,
    stat_def = v_stats.stat_def, stat_def_esp = v_stats.stat_def_esp, stat_speed = v_stats.stat_speed,
    hp = v_new_hp,
    unlocked_abilities = v_poke.unlocked_abilities || coalesce(v_new_abilities, '{}'),
    updated_at = now()
  where id = p_poke_id;

  return jsonb_build_object('ok', true, 'mensagem', format('%s evoluiu para %s!', v_species.name, v_new_species.name));
end;
$$;
revoke all on function dev.evoluir_poke(uuid) from public;
grant execute on function dev.evoluir_poke(uuid) to authenticated;

-- Porta acoes.ts#definirAtivo (moveTeamIndexToFront) -- renumeracao precisa
-- de deferral do indice unico (colisao transitoria entre os 2 UPDATEs).
create function dev.definir_ativo(p_poke_id uuid)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_slot smallint;
begin
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
$$;
revoke all on function dev.definir_ativo(uuid) from public;
grant execute on function dev.definir_ativo(uuid) to authenticated;

-- Porta acoes.ts#tirarDaEquipe.
create function dev.tirar_da_equipe(p_poke_id uuid)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_slot smallint;
  v_team_count int;
  v_nome text;
begin
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
$$;
revoke all on function dev.tirar_da_equipe(uuid) from public;
grant execute on function dev.tirar_da_equipe(uuid) to authenticated;

-- Porta acoes.ts#porNaEquipe. Mensagem generica de erro (404) cobre tanto
-- "nao esta na mochila" quanto "equipe cheia" -- mesmo comportamento do
-- moveBagToTeam original (devolve null pros 2 casos, sem distinguir).
create function dev.por_na_equipe(p_poke_id uuid)
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

  if v_species_id is null or v_team_count >= 6 then
    raise exception 'POKE nao esta na mochila' using errcode = 'P0001';
  end if;

  update dev.pokemon_instances set location = 'team', team_slot = v_team_count, updated_at = now()
    where id = p_poke_id;

  select name into v_nome from dev.species where id = v_species_id;
  return jsonb_build_object('ok', true, 'mensagem', format('%s entrou na equipe.', coalesce(v_nome, 'POKE')));
end;
$$;
revoke all on function dev.por_na_equipe(uuid) from public;
grant execute on function dev.por_na_equipe(uuid) to authenticated;

-- Porta acoes.ts#desbloquearHunt.
create function dev.desbloquear_hunt(p_map_id text)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_mapa dev.maps;
  v_ja_tem boolean;
begin
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
$$;
revoke all on function dev.desbloquear_hunt(text) from public;
grant execute on function dev.desbloquear_hunt(text) to authenticated;

-- Porta acoes.ts#alternarTravaItem. Toggle nao exige posse previa do item
-- (mesmo comportamento do store original -- lockedItems e um dict solto).
create function dev.alternar_trava_item(p_item_id text)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  insert into dev.player_items (user_id, item_id, quantity, locked)
  values (v_user_id, p_item_id, 0, true)
  on conflict (user_id, item_id) do update
    set locked = not coalesce(dev.player_items.locked, false), updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function dev.alternar_trava_item(text) from public;
grant execute on function dev.alternar_trava_item(text) to authenticated;

-- Porta acoes.ts#alternarTravaPoke.
create function dev.alternar_trava_poke(p_poke_id uuid)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  update dev.pokemon_instances set locked = not coalesce(locked, false), updated_at = now()
    where id = p_poke_id and user_id = v_user_id;
  if not found then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function dev.alternar_trava_poke(uuid) from public;
grant execute on function dev.alternar_trava_poke(uuid) to authenticated;

-- Porta acoes.ts#alternarHabilidade.
create function dev.alternar_habilidade(p_poke_id uuid, p_ability_id text)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_disabled jsonb;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select disabled_abilities into v_disabled from dev.pokemon_instances
    where id = p_poke_id and user_id = v_user_id;
  if not found then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  update dev.pokemon_instances set
    disabled_abilities = case when coalesce(v_disabled, '{}'::jsonb) ? p_ability_id
      then coalesce(v_disabled, '{}'::jsonb) - p_ability_id
      else coalesce(v_disabled, '{}'::jsonb) || jsonb_build_object(p_ability_id, true)
    end,
    updated_at = now()
  where id = p_poke_id;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function dev.alternar_habilidade(uuid, text) from public;
grant execute on function dev.alternar_habilidade(uuid, text) to authenticated;

-- Porta acoes.ts#configurarAuto.
create function dev.configurar_auto(p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_rule jsonb;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  if p_patch is null or jsonb_typeof(p_patch) != 'object' then
    raise exception 'patch invalido' using errcode = 'P0001';
  end if;

  if p_patch ? 'toggles' then
    for v_key in select jsonb_object_keys(p_patch->'toggles') loop
      if v_key not in ('autoPot', 'autoCatch', 'autoRevive') then
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

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function dev.configurar_auto(jsonb) from public;
grant execute on function dev.configurar_auto(jsonb) to authenticated;
