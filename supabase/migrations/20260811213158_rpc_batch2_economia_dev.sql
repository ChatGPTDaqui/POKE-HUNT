-- Porta acoes.ts#comprarItem.
create function dev.comprar_item(p_item_id text, p_qtd int default 1)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item dev.items;
  v_custo bigint;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_qtd is null or p_qtd <= 0 or p_qtd > 1000000 then
    raise exception 'quantidade invalida' using errcode = 'P0001';
  end if;

  select * into v_item from dev.items where id = p_item_id;
  if v_item is null or v_item.buy_price_atual is null then
    raise exception 'Item desconhecido.' using errcode = 'P0001';
  end if;

  v_custo := v_item.buy_price_atual::bigint * p_qtd;

  update dev.players set gold = gold - v_custo
    where user_id = v_user_id and gold >= v_custo;
  if not found then
    raise exception 'Ouro insuficiente.' using errcode = 'P0001';
  end if;

  insert into dev.player_items (user_id, item_id, quantity)
  values (v_user_id, p_item_id, p_qtd)
  on conflict (user_id, item_id) do update
    set quantity = dev.player_items.quantity + excluded.quantity, updated_at = now();

  return jsonb_build_object('ok', true, 'mensagem', format('Comprou %s x%s por %s de ouro.', v_item.name, p_qtd, v_custo));
end;
$$;
revoke all on function dev.comprar_item(text, int) from public;
grant execute on function dev.comprar_item(text, int) to authenticated;

-- Porta acoes.ts#venderItem.
create function dev.vender_item(p_item_id text, p_qtd int default 1)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item dev.items;
  v_locked boolean;
  v_atual int;
  v_ganho bigint;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_qtd is null or p_qtd <= 0 or p_qtd > 1000000 then
    raise exception 'quantidade invalida' using errcode = 'P0001';
  end if;

  select * into v_item from dev.items where id = p_item_id;
  if v_item is null then
    raise exception 'Item desconhecido.' using errcode = 'P0001';
  end if;

  select quantity, locked into v_atual, v_locked from dev.player_items
    where user_id = v_user_id and item_id = p_item_id;

  if coalesce(v_locked, false) then
    raise exception 'Este item esta travado — destrave antes de vender.' using errcode = 'P0001';
  end if;
  if v_atual is null or v_atual < p_qtd then
    raise exception 'Voce nao tem itens suficientes.' using errcode = 'P0001';
  end if;

  update dev.player_items set quantity = quantity - p_qtd, updated_at = now()
    where user_id = v_user_id and item_id = p_item_id;

  v_ganho := v_item.sell_price::bigint * p_qtd;
  update dev.players set gold = gold + v_ganho where user_id = v_user_id;

  return jsonb_build_object('ok', true, 'mensagem', format('Vendeu %s x%s por %s de ouro.', v_item.name, p_qtd, v_ganho));
end;
$$;
revoke all on function dev.vender_item(text, int) from public;
grant execute on function dev.vender_item(text, int) to authenticated;

-- Porta acoes.ts#usarItem.
create function dev.usar_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item dev.items;
  v_ativo dev.pokemon_instances;
  v_active_idx smallint;
  v_novo_hp int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  select * into v_item from dev.items where id = p_item_id;
  if v_item is null then
    raise exception 'item desconhecido' using errcode = 'P0001';
  end if;

  select active_team_index into v_active_idx from dev.players where user_id = v_user_id;
  select * into v_ativo from dev.pokemon_instances
    where user_id = v_user_id and location = 'team' and team_slot = v_active_idx;
  if v_ativo is null then
    raise exception 'nenhum POKE ativo' using errcode = 'P0001';
  end if;

  if v_item.kind = 'potion' and v_item.heal_amount is not null then
    if v_ativo.hp <= 0 then
      raise exception 'POKE desmaiado — use um Revive' using errcode = 'P0001';
    end if;
    if v_ativo.hp >= v_ativo.stat_hp then
      raise exception 'O POKE ja esta com a vida cheia.' using errcode = 'P0001';
    end if;
    update dev.player_items set quantity = quantity - 1, updated_at = now()
      where user_id = v_user_id and item_id = p_item_id and quantity >= 1;
    if not found then
      raise exception 'voce nao tem esse item' using errcode = 'P0001';
    end if;
    v_novo_hp := case when v_item.heals_full then v_ativo.stat_hp
      else least(v_ativo.stat_hp, v_ativo.hp + v_item.heal_amount) end;
    update dev.pokemon_instances set hp = v_novo_hp, updated_at = now() where id = v_ativo.id;
    return jsonb_build_object('ok', true, 'mensagem', format('Usou %s.', v_item.name));
  end if;

  if v_item.kind = 'revive' and v_item.revive_hp_percent is not null then
    if v_ativo.hp > 0 then
      raise exception 'o POKE ja esta consciente' using errcode = 'P0001';
    end if;
    update dev.player_items set quantity = quantity - 1, updated_at = now()
      where user_id = v_user_id and item_id = p_item_id and quantity >= 1;
    if not found then
      raise exception 'voce nao tem esse item' using errcode = 'P0001';
    end if;
    v_novo_hp := greatest(1, round(v_ativo.stat_hp * v_item.revive_hp_percent));
    update dev.pokemon_instances set hp = v_novo_hp, updated_at = now() where id = v_ativo.id;
    return jsonb_build_object('ok', true, 'mensagem', 'POKE reanimado!');
  end if;

  raise exception 'esse item nao pode ser usado assim' using errcode = 'P0001';
end;
$$;
revoke all on function dev.usar_item(text) from public;
grant execute on function dev.usar_item(text) to authenticated;
