-- PH-136 -- evolucao especial passa a custar 40 pedras do tipo primario.
--
-- O QUE MUDA, E SO ISSO: `v_stone_count` de 20 pra 40. O nivel (80, vindo de
-- `species.evolves_at_level`) e a regra de tipo (`v_species.type1`, o PRIMEIRO
-- tipo quando ha dois) ficam exatamente como estavam.
--
-- POR QUE ISTO E MIGRATION, E NAO SO UMA CONSTANTE NO CLIENTE
-- ----------------------------------------------------------
-- Quem decide se a evolucao acontece e esta funcao. O
-- `SPECIAL_EVOLUTION_STONE_COUNT` do cliente so ANTECIPA a resposta pra tela
-- poder dizer "faltam N" antes de chamar. Mexer num sem o outro produz duas
-- metades discordando:
--
--   cliente 40 / servidor 20 -> quem tem 30 pedras ve "nao pode" e nunca tenta,
--                               mesmo com o servidor aceitando.
--   cliente 20 / servidor 40 -> a evolucao falha com P0001 no meio da acao.
--
-- O segundo caso e o padrao "limite de negocio so no cliente" que ja e regra
-- critica deste projeto. Por isso os dois mudam no mesmo PR.
--
-- CUSTO REAL, medido antes de aplicar: a pedra cai a 5% por abate
-- (`economySystem.ts#STONE_DROP_CHANCE`) e e do tipo do INIMIGO ABATIDO, nao do
-- POKE que vai evoluir. 40 pedras sao ~800 abates de POKE do tipo certo, contra
-- ~400 de antes. Pedra nao e vendida na Loja, entao nao ha atalho por ouro.
--
-- `create or replace` preserva os grants da funcao — nao ha revoke/grant aqui
-- de proposito.

begin;

create or replace function public.evoluir_poke(p_poke_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_poke public.pokemon_instances;
  v_species public.species;
  v_new_species public.species;
  v_stone_item_id text;
  -- PH-136: era 20.
  v_stone_count int := 40;
  v_stone_nome text;
  v_tem_stone boolean;
  v_hp_ratio numeric;
  v_stats record;
  v_new_hp int;
  v_new_abilities text[];
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select * into v_poke from public.pokemon_instances where id = p_poke_id and user_id = v_user_id;
  if v_poke is null then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  select * into v_species from public.species where id = v_poke.species_id;
  if v_species.evolves_to is null or v_species.evolves_at_level is null or v_poke.level < v_species.evolves_at_level then
    raise exception 'este POKE ainda nao pode evoluir' using errcode = 'P0001';
  end if;

  if v_species.is_special_evolution then
    v_stone_item_id := 'stone_' || lower(v_species.type1::text);
    select quantity >= v_stone_count into v_tem_stone from public.player_items
      where user_id = v_user_id and item_id = v_stone_item_id;
    if not coalesce(v_tem_stone, false) then
      select name into v_stone_nome from public.items where id = v_stone_item_id;
      -- "faltam 40x" era mentira quando o jogador tinha 39: o numero e o
      -- REQUISITO, nao o que falta. Consertado junto porque esta linha estava
      -- sendo reescrita de qualquer forma (PH-136).
      raise exception 'precisa de %sx %s', v_stone_count, coalesce(v_stone_nome, v_stone_item_id) using errcode = 'P0001';
    end if;
  end if;

  select * into v_new_species from public.species where id = v_species.evolves_to;
  v_hp_ratio := v_poke.hp::numeric / v_poke.stat_hp;
  select * into v_stats from public._calcular_stats(v_new_species, v_poke.level,
    v_poke.iv_hp, v_poke.iv_atk_fis, v_poke.iv_atk_esp, v_poke.iv_def, v_poke.iv_def_esp, v_poke.iv_speed,
    v_poke.rarity::text, v_poke.is_shiny, v_poke.nature);
  v_new_hp := greatest(1, round(v_stats.stat_hp * v_hp_ratio));

  select array_agg(distinct move_id) into v_new_abilities
    from public.species_moves
    where species_id = v_new_species.id and level_req <= v_poke.level
      and move_id != all(coalesce(v_poke.unlocked_abilities, '{}'));

  if v_species.is_special_evolution then
    update public.player_items set quantity = quantity - v_stone_count, updated_at = now()
      where user_id = v_user_id and item_id = v_stone_item_id;
  end if;

  update public.pokemon_instances set
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
