-- Helper interno: valor de venda de POKE. MIN_POKEMON_SELL_VALUE(1000) e o
-- multiplicador por raridade sao hardcode TS-only (nunca vieram de formulas,
-- ver src/economySystem.ts e src/data/rarity.ts). POKEMON_SELL_DIVISOR lido
-- ao vivo de dev.formulas (esse sim e configuravel pela planilha).
create function dev._valor_venda_poke(p_level int, p_base_exp int, p_rarity text)
returns bigint
language plpgsql
stable
security definer
set search_path = dev, public
as $$
declare
  v_divisor numeric;
  v_mult numeric;
  v_base bigint;
begin
  select expression::numeric into v_divisor from dev.formulas where key = 'POKEMON_SELL_DIVISOR';
  v_mult := case p_rarity
    when 'incomum' then 3 when 'raro' then 10 when 'ultra' then 40
    when 'legendary' then 150 when 'mythic' then 600 else 1 end;
  v_base := greatest(1, floor(greatest(1, floor(p_level * p_base_exp / v_divisor)) * v_mult));
  return 1000 + v_base;
end;
$$;
revoke all on function dev._valor_venda_poke(int, int, text) from public;
revoke all on function dev._valor_venda_poke(int, int, text) from authenticated;

-- Porta acoes.ts#venderTodosItens.
create function dev.vender_todos_itens()
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_total_gold bigint;
  v_item_count bigint;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  select coalesce(sum(pi.quantity * i.sell_price), 0), coalesce(sum(pi.quantity), 0)
    into v_total_gold, v_item_count
  from dev.player_items pi
  join dev.items i on i.id = pi.item_id
  where pi.user_id = v_user_id and pi.quantity > 0 and coalesce(pi.locked, false) = false
  for update of pi;

  update dev.player_items set quantity = 0, updated_at = now()
    where user_id = v_user_id and quantity > 0 and coalesce(locked, false) = false;

  update dev.players set gold = gold + v_total_gold where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('Vendeu %s itens por %s de ouro.', v_item_count, v_total_gold));
end;
$$;
revoke all on function dev.vender_todos_itens() from public;
grant execute on function dev.vender_todos_itens() to authenticated;

-- Porta acoes.ts#venderPoke.
create function dev.vender_poke(p_poke_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_poke dev.pokemon_instances;
  v_base_exp int;
  v_valor bigint;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  select * into v_poke from dev.pokemon_instances
    where id = p_poke_id and user_id = v_user_id and location = 'bag';
  if v_poke is null then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;
  if v_poke.locked then
    raise exception 'Este item esta travado — destrave antes de vender.' using errcode = 'P0001';
  end if;

  select base_exp into v_base_exp from dev.species where id = v_poke.species_id;
  v_valor := dev._valor_venda_poke(v_poke.level, v_base_exp, v_poke.rarity::text);

  delete from dev.pokemon_instances where id = p_poke_id;
  update dev.players set gold = gold + v_valor where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('Vendido por %s de ouro.', v_valor));
end;
$$;
revoke all on function dev.vender_poke(uuid) from public;
grant execute on function dev.vender_poke(uuid) to authenticated;

-- Porta acoes.ts#venderPokes. Travados e shiny sao SEMPRE pulados mesmo se o
-- id foi passado (defesa em profundidade, PH-24) -- filtro no WHERE, nao erro.
create function dev.vender_pokes(p_poke_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_total_gold bigint := 0;
  v_count int := 0;
  v_row record;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_poke_ids is null or array_length(p_poke_ids, 1) is null then
    raise exception 'nenhum POKE informado' using errcode = 'P0001';
  end if;

  for v_row in
    select pi.id, pi.level, pi.rarity, s.base_exp
    from dev.pokemon_instances pi
    join dev.species s on s.id = pi.species_id
    where pi.id = any(p_poke_ids) and pi.user_id = v_user_id and pi.location = 'bag'
      and coalesce(pi.locked, false) = false and coalesce(pi.is_shiny, false) = false
    for update of pi
  loop
    v_total_gold := v_total_gold + dev._valor_venda_poke(v_row.level, v_row.base_exp, v_row.rarity::text);
    v_count := v_count + 1;
    delete from dev.pokemon_instances where id = v_row.id;
  end loop;

  update dev.players set gold = gold + v_total_gold where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('Vendeu %s POKEs por %s de ouro.', v_count, v_total_gold));
end;
$$;
revoke all on function dev.vender_pokes(uuid[]) from public;
grant execute on function dev.vender_pokes(uuid[]) to authenticated;

-- Porta acoes.ts#curarEquipe.
create function dev.curar_equipe()
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  update dev.pokemon_instances set hp = stat_hp, updated_at = now()
    where user_id = v_user_id and location = 'team';
  return jsonb_build_object('ok', true, 'mensagem', 'Equipe curada!');
end;
$$;
revoke all on function dev.curar_equipe() from public;
grant execute on function dev.curar_equipe() to authenticated;
