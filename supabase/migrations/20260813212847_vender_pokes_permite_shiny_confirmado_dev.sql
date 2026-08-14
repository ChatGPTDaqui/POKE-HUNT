-- Mesmo fix de public.vender_pokes, aplicado em dev tambem pra nao reabrir
-- divergencia -- o bug nasceu identico nos dois schemas, nao era drift.
create or replace function dev.vender_pokes(p_poke_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = dev
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
      and coalesce(pi.locked, false) = false
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
