create or replace function dev.vender_todos_itens()
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

  with alvo as (
    select pi.item_id, pi.quantity, i.sell_price
    from dev.player_items pi
    join dev.items i on i.id = pi.item_id
    where pi.user_id = v_user_id and pi.quantity > 0 and coalesce(pi.locked, false) = false
    for update of pi
  )
  select coalesce(sum(quantity * sell_price), 0), coalesce(sum(quantity), 0)
    into v_total_gold, v_item_count
  from alvo;

  update dev.player_items set quantity = 0, updated_at = now()
    where user_id = v_user_id and quantity > 0 and coalesce(locked, false) = false;

  update dev.players set gold = gold + v_total_gold where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('Vendeu %s itens por %s de ouro.', v_item_count, v_total_gold));
end;
$$;
