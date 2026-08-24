-- PH-89 — o calculo de stats do SERVIDOR passa a conhecer a natureza.
--
-- Gemeo dev de `20260823020000_nature_no_calculo_do_servidor_public.sql`.
--
-- O DEFEITO
--
-- Existem duas implementacoes do calculo de stats: `computeStatsAtLevel`
-- (motor TS, em data/pokes.ts) e `_calcular_stats` (SQL). So a primeira
-- conhecia natureza. Como `evoluir_poke` usa a segunda, evoluir RECALCULAVA
-- os stats sem o efeito da natureza — e a natureza continuava gravada na
-- linha, entao a ficha mostrava uma natureza que os numeros nao refletiam.
--
-- Medido ao vivo em 2026-08-22 (schema dev): Charmander nivel 16, raro,
-- natureza `lonely` (+atk fisico / -defesa), evoluido para Charmeleon.
--
--                      hp  atkFis  atkEsp   def  defEsp  speed
--   banco               66     36      42     35     35     46
--   motor COM natureza  66     40      42     32     35     46   <- correto
--   motor SEM natureza  66     36      42     35     35     46   <- o que saiu
--
-- Perdeu +4 de ataque fisico e ganhou +3 de defesa que a natureza deveria ter
-- tirado. Permanente: nada recalcula depois.
--
-- A ORDEM DOS MULTIPLICADORES, copiada de data/pokes.ts#computeStatsAtLevel:
--
--   formula base -> NATUREZA -> shiny -> raridade
--
-- Com um unico arredondamento no fim. O SQL ja arredondava so no fim, entao
-- basta somar o fator de natureza ao produto — multiplicacao em `numeric` e
-- exata, entao a posicao dele entre os outros dois nao muda o resultado.
--
-- A natureza NUNCA alcanca HP. Quem garante isso aqui e a lista de 5
-- atributos de `_mult_natureza`, que nao inclui hp — mesmo papel do
-- `NATURE_STATS` do TS.

begin;

-- ===========================================================================
-- 1. O multiplicador de natureza
-- ===========================================================================
-- A matriz 5x5 e montada como no TS (data/natures.ts) em vez de listar as 25
-- naturezas a mao: linha = atributo que sobe, coluna = o que desce, diagonal =
-- neutra. Escrever as 25 abriria espaco pra erro de digitacao que so
-- apareceria num stat especifico de uma natureza especifica.
create or replace function dev._mult_natureza(p_nature text, p_stat text)
returns numeric
language plpgsql
immutable
set search_path = dev, public
as $fn$
declare
  -- Mesma ordem canonica do NATURE_STATS do TS, com os nomes de coluna daqui.
  v_stats text[] := array['atk_fis', 'def', 'speed', 'atk_esp', 'def_esp'];
  v_nomes text[] := array[
    'hardy', 'lonely', 'brave', 'adamant', 'naughty',
    'bold', 'docile', 'relaxed', 'impish', 'lax',
    'timid', 'hasty', 'serious', 'jolly', 'naive',
    'modest', 'mild', 'quiet', 'bashful', 'rash',
    'calm', 'gentle', 'sassy', 'careful', 'quirky'
  ];
  v_pos int;
  v_linha int;
  v_coluna int;
begin
  -- Natureza ausente e HP saem antes de qualquer conta.
  if p_nature is null or p_stat = 'hp' then
    return 1;
  end if;

  v_pos := array_position(v_nomes, lower(trim(p_nature)));
  -- Natureza desconhecida nao altera nada. Preferivel a lancar: um save com
  -- valor inesperado deve render stats sem bonus, nao uma evolucao que falha.
  if v_pos is null then
    return 1;
  end if;

  v_linha := ((v_pos - 1) / 5) + 1;
  v_coluna := ((v_pos - 1) % 5) + 1;
  if v_linha = v_coluna then
    return 1; -- as 5 neutras
  end if;
  if v_stats[v_linha] = p_stat then
    return 1.1;
  end if;
  if v_stats[v_coluna] = p_stat then
    return 0.9;
  end if;
  return 1;
end;
$fn$;

revoke all on function dev._mult_natureza(text, text) from public;
revoke all on function dev._mult_natureza(text, text) from anon;
revoke all on function dev._mult_natureza(text, text) from authenticated;

-- ===========================================================================
-- 2. `_calcular_stats` com natureza
-- ===========================================================================
-- Sobrecarga de 11 argumentos em vez de default no 11o: com default, a chamada
-- de 10 argumentos ficaria ambigua entre as duas assinaturas e o Postgres
-- recusaria. Sem default, ele resolve pela aridade.
--
-- A versao de 10 argumentos continua existindo para nao quebrar chamador
-- nenhum, mas passou a DELEGAR — nao ha duas contas, so dois pontos de
-- entrada. Era justamente ter duas contas que criou este bug.
create or replace function dev._calcular_stats(
  p_species dev.species, p_level int,
  p_iv_hp int, p_iv_atk_fis int, p_iv_atk_esp int, p_iv_def int, p_iv_def_esp int, p_iv_speed int,
  p_rarity text, p_is_shiny boolean, p_nature text
) returns table(stat_hp int, stat_atk_fis int, stat_atk_esp int, stat_def int, stat_def_esp int, stat_speed int)
language plpgsql immutable
set search_path = dev, public
as $fn$
declare
  v_shiny_mult numeric := case when p_is_shiny then 1.5 else 1 end;
  v_rarity_mult numeric := case p_rarity
    when 'incomum' then 1.15 when 'raro' then 1.35 when 'ultra' then 1.7
    when 'legendary' then 2.2 when 'mythic' then 3 else 1 end;
begin
  return query select
    greatest(1, round(dev._calcular_stat(p_species.base_hp, p_level, p_iv_hp, true) * dev._mult_natureza(p_nature, 'hp') * v_shiny_mult * v_rarity_mult))::int,
    greatest(1, round(dev._calcular_stat(p_species.base_atk_fis, p_level, p_iv_atk_fis, false) * dev._mult_natureza(p_nature, 'atk_fis') * v_shiny_mult * v_rarity_mult))::int,
    greatest(1, round(dev._calcular_stat(p_species.base_atk_esp, p_level, p_iv_atk_esp, false) * dev._mult_natureza(p_nature, 'atk_esp') * v_shiny_mult * v_rarity_mult))::int,
    greatest(1, round(dev._calcular_stat(p_species.base_def, p_level, p_iv_def, false) * dev._mult_natureza(p_nature, 'def') * v_shiny_mult * v_rarity_mult))::int,
    greatest(1, round(dev._calcular_stat(p_species.base_def_esp, p_level, p_iv_def_esp, false) * dev._mult_natureza(p_nature, 'def_esp') * v_shiny_mult * v_rarity_mult))::int,
    greatest(1, round(dev._calcular_stat(p_species.base_speed, p_level, p_iv_speed, false) * dev._mult_natureza(p_nature, 'speed') * v_shiny_mult * v_rarity_mult))::int;
end;
$fn$;

revoke all on function dev._calcular_stats(dev.species, int, int, int, int, int, int, int, text, boolean, text) from public;
revoke all on function dev._calcular_stats(dev.species, int, int, int, int, int, int, int, text, boolean, text) from anon;
revoke all on function dev._calcular_stats(dev.species, int, int, int, int, int, int, int, text, boolean, text) from authenticated;

-- A de 10 argumentos vira um atalho pra de 11 com natureza nula.
create or replace function dev._calcular_stats(
  p_species dev.species, p_level int,
  p_iv_hp int, p_iv_atk_fis int, p_iv_atk_esp int, p_iv_def int, p_iv_def_esp int, p_iv_speed int,
  p_rarity text, p_is_shiny boolean
) returns table(stat_hp int, stat_atk_fis int, stat_atk_esp int, stat_def int, stat_def_esp int, stat_speed int)
language sql immutable
set search_path = dev, public
as $fn$
  select * from dev._calcular_stats(
    p_species, p_level, p_iv_hp, p_iv_atk_fis, p_iv_atk_esp, p_iv_def, p_iv_def_esp, p_iv_speed,
    p_rarity, p_is_shiny, null::text
  );
$fn$;

-- ===========================================================================
-- 3. `evoluir_poke` passa a natureza do POKE
-- ===========================================================================
-- Corpo identico ao vigente, com uma unica linha alterada: a chamada de
-- `_calcular_stats` agora leva `v_poke.nature`.

create or replace function dev.evoluir_poke(p_poke_id uuid)
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
    v_poke.rarity::text, v_poke.is_shiny, v_poke.nature);
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

commit;
