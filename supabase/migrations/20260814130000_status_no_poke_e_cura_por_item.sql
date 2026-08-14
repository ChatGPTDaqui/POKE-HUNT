-- Leva B: o status vira dado persistido, e o item de cura passa a funcionar.
--
-- Tudo em dobro (public + dev), como as outras: os dois schemas sao clones.

-- ---------------------------------------------------------------------------
-- 1. O status no POKE
-- ---------------------------------------------------------------------------
-- DUAS COLUNAS, e nao um jsonb: `status` e um conjunto fechado de 6 valores e
-- `status_turns` e um inteiro. Como jsonb os dois ficariam sem validacao
-- nenhuma do lado do Postgres, e um erro de grafia ('poisoned' em vez de
-- 'poison') so apareceria como um status que nunca cura.
--
-- Enum nao, CHECK sim: adicionar valor a enum e ALTER TYPE (que nem cabe na
-- mesma transacao do uso, ver 20260814120000), e esta lista tende a crescer
-- quando trap/leech-seed/flinch forem implementados.
--
-- SO O NAO-VOLATIL mora aqui. Confusao e volatil: nos jogos ela some quando o
-- POKE sai de campo, e o analogo neste jogo e a entidade de combate, que nao e
-- gravada.
--
-- `status_turns` NULL com `status` preenchido = status permanente (veneno,
-- queimadura, paralisia, congelamento). So sono tem contador.
alter table public.pokemon_instances
  add column if not exists status text,
  add column if not exists status_turns int;
alter table dev.pokemon_instances
  add column if not exists status text,
  add column if not exists status_turns int;

alter table public.pokemon_instances drop constraint if exists status_valido;
alter table public.pokemon_instances add constraint status_valido check (
  status is null or status in ('poison','burn','paralysis','sleep','freeze')
);
alter table public.pokemon_instances drop constraint if exists status_turns_precisa_de_status;
alter table public.pokemon_instances add constraint status_turns_precisa_de_status check (
  status_turns is null or (status is not null and status_turns > 0)
);

alter table dev.pokemon_instances drop constraint if exists status_valido;
alter table dev.pokemon_instances add constraint status_valido check (
  status is null or status in ('poison','burn','paralysis','sleep','freeze')
);
alter table dev.pokemon_instances drop constraint if exists status_turns_precisa_de_status;
alter table dev.pokemon_instances add constraint status_turns_precisa_de_status check (
  status_turns is null or (status is not null and status_turns > 0)
);

-- ---------------------------------------------------------------------------
-- 2. `usar_item` aprende a familia `status_heal`
-- ---------------------------------------------------------------------------
-- Sem este ramo, os seis itens de cura eram compraveis e inertes: a RPC caia
-- direto no 'esse item nao pode ser usado assim'.
--
-- `heals_status` e uma LISTA porque o Full Heal cura seis de uma vez — a
-- checagem e `= any(...)`, nao igualdade.
create or replace function public.usar_item(p_item_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.items;
  v_ativo public.pokemon_instances;
  v_active_idx smallint;
  v_novo_hp int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  select * into v_item from public.items where id = p_item_id;
  if v_item is null then
    raise exception 'item desconhecido' using errcode = 'P0001';
  end if;

  select active_team_index into v_active_idx from public.players where user_id = v_user_id;
  select * into v_ativo from public.pokemon_instances
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
    update public.player_items set quantity = quantity - 1, updated_at = now()
      where user_id = v_user_id and item_id = p_item_id and quantity >= 1;
    if not found then
      raise exception 'voce nao tem esse item' using errcode = 'P0001';
    end if;
    v_novo_hp := case when v_item.heals_full then v_ativo.stat_hp
      else least(v_ativo.stat_hp, v_ativo.hp + v_item.heal_amount) end;
    update public.pokemon_instances set hp = v_novo_hp, updated_at = now() where id = v_ativo.id;
    return jsonb_build_object('ok', true, 'mensagem', format('Usou %s.', v_item.name));
  end if;

  if v_item.kind = 'revive' and v_item.revive_hp_percent is not null then
    if v_ativo.hp > 0 then
      raise exception 'o POKE ja esta consciente' using errcode = 'P0001';
    end if;
    update public.player_items set quantity = quantity - 1, updated_at = now()
      where user_id = v_user_id and item_id = p_item_id and quantity >= 1;
    if not found then
      raise exception 'voce nao tem esse item' using errcode = 'P0001';
    end if;
    v_novo_hp := greatest(1, round(v_ativo.stat_hp * v_item.revive_hp_percent));
    update public.pokemon_instances set hp = v_novo_hp, updated_at = now() where id = v_ativo.id;
    return jsonb_build_object('ok', true, 'mensagem', 'POKE reanimado!');
  end if;

  if v_item.kind = 'status_heal' and v_item.heals_status is not null then
    if v_ativo.status is null then
      raise exception 'O POKE nao tem nenhum status para curar.' using errcode = 'P0001';
    end if;
    if not (v_ativo.status = any (v_item.heals_status)) then
      raise exception '% nao cura esse status.', v_item.name using errcode = 'P0001';
    end if;
    update public.player_items set quantity = quantity - 1, updated_at = now()
      where user_id = v_user_id and item_id = p_item_id and quantity >= 1;
    if not found then
      raise exception 'voce nao tem esse item' using errcode = 'P0001';
    end if;
    update public.pokemon_instances set status = null, status_turns = null, updated_at = now()
      where id = v_ativo.id;
    return jsonb_build_object('ok', true, 'mensagem', format('Usou %s.', v_item.name));
  end if;

  raise exception 'esse item nao pode ser usado assim' using errcode = 'P0001';
end;
$$;
revoke all on function public.usar_item(text) from public;
grant execute on function public.usar_item(text) to authenticated;

create or replace function dev.usar_item(p_item_id text)
returns jsonb
language plpgsql security definer set search_path = dev, public
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

  if v_item.kind = 'status_heal' and v_item.heals_status is not null then
    if v_ativo.status is null then
      raise exception 'O POKE nao tem nenhum status para curar.' using errcode = 'P0001';
    end if;
    if not (v_ativo.status = any (v_item.heals_status)) then
      raise exception '% nao cura esse status.', v_item.name using errcode = 'P0001';
    end if;
    update dev.player_items set quantity = quantity - 1, updated_at = now()
      where user_id = v_user_id and item_id = p_item_id and quantity >= 1;
    if not found then
      raise exception 'voce nao tem esse item' using errcode = 'P0001';
    end if;
    update dev.pokemon_instances set status = null, status_turns = null, updated_at = now()
      where id = v_ativo.id;
    return jsonb_build_object('ok', true, 'mensagem', format('Usou %s.', v_item.name));
  end if;

  raise exception 'esse item nao pode ser usado assim' using errcode = 'P0001';
end;
$$;
revoke all on function dev.usar_item(text) from public;
grant execute on function dev.usar_item(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. O Centro Pokemon tira o status junto com o HP
-- ---------------------------------------------------------------------------
-- Sem isto o jogador sai do Hospital com o POKE de vida cheia e ainda
-- envenenado — o estado exato que ele foi la resolver.
create or replace function public.curar_equipe()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  update public.pokemon_instances
    set hp = stat_hp, status = null, status_turns = null, updated_at = now()
    where user_id = v_user_id and location = 'team';
  return jsonb_build_object('ok', true, 'mensagem', 'Equipe curada!');
end;
$$;
revoke all on function public.curar_equipe() from public;
grant execute on function public.curar_equipe() to authenticated;

create or replace function dev.curar_equipe()
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  update dev.pokemon_instances
    set hp = stat_hp, status = null, status_turns = null, updated_at = now()
    where user_id = v_user_id and location = 'team';
  return jsonb_build_object('ok', true, 'mensagem', 'Equipe curada!');
end;
$$;
revoke all on function dev.curar_equipe() from public;
grant execute on function dev.curar_equipe() to authenticated;
