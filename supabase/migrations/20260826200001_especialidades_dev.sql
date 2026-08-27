-- PH-198 — gemeo dev de `20260826200000_especialidades_public.sql`.
-- Mesma logica, so com o schema trocado (public. -> dev., search_path =
-- public -> search_path = dev, public). Ver o arquivo public pro raciocinio
-- completo (por que TEXT+check em vez do enum `element_type`, por que a Stone
-- existente e o material, por que o advisory lock).
begin;

create table dev.player_especialidades (
  user_id uuid not null references dev.players(user_id) on delete cascade,
  tipo text not null check (tipo in (
    'NORMAL','FIRE','WATER','ELECTRIC','GRASS','ICE','FIGHTING','POISON',
    'GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL','FAIRY'
  )),
  dano_nivel smallint not null default 0 check (dano_nivel between 0 and 5),
  defesa_nivel smallint not null default 0 check (defesa_nivel between 0 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, tipo)
);

alter table dev.player_especialidades enable row level security;

create policy "own rows all" on dev.player_especialidades for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "admin reads all" on dev.player_especialidades for select to authenticated
  using ((select dev.is_admin()));

grant select, insert, update, delete on dev.player_especialidades to authenticated;
grant select, insert, update, delete on dev.player_especialidades to service_role;

create function dev.subir_nivel_especialidade(p_tipo text, p_trilha text)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_nivel_atual int;
  v_stone_qtd_por_nivel int[] := array[15, 35, 70, 130, 220];
  v_gold_por_nivel bigint[] := array[500, 1500, 4000, 10000, 25000];
  v_stone_qtd int;
  v_gold bigint;
  v_stone_id text;
  v_stone_atual int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_trilha not in ('dano', 'defesa') then
    raise exception 'trilha invalida' using errcode = 'P0001';
  end if;
  if p_tipo not in (
    'NORMAL','FIRE','WATER','ELECTRIC','GRASS','ICE','FIGHTING','POISON',
    'GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL','FAIRY'
  ) then
    raise exception 'tipo invalido' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  insert into dev.player_especialidades (user_id, tipo) values (v_user_id, p_tipo)
    on conflict (user_id, tipo) do nothing;

  select case p_trilha when 'dano' then dano_nivel else defesa_nivel end into v_nivel_atual
    from dev.player_especialidades where user_id = v_user_id and tipo = p_tipo;

  if v_nivel_atual >= 5 then
    raise exception 'Especialidade ja esta no nivel maximo.' using errcode = 'P0001';
  end if;

  v_stone_qtd := v_stone_qtd_por_nivel[v_nivel_atual + 1];
  v_gold := v_gold_por_nivel[v_nivel_atual + 1];
  v_stone_id := 'stone_' || lower(p_tipo);

  select quantity into v_stone_atual from dev.player_items
    where user_id = v_user_id and item_id = v_stone_id;
  if coalesce(v_stone_atual, 0) < v_stone_qtd then
    raise exception 'Stones insuficientes.' using errcode = 'P0001';
  end if;

  update dev.players set gold = gold - v_gold
    where user_id = v_user_id and gold >= v_gold;
  if not found then
    raise exception 'Ouro insuficiente.' using errcode = 'P0001';
  end if;

  update dev.player_items set quantity = quantity - v_stone_qtd, updated_at = now()
    where user_id = v_user_id and item_id = v_stone_id;

  update dev.player_especialidades set
    dano_nivel = case when p_trilha = 'dano' then dano_nivel + 1 else dano_nivel end,
    defesa_nivel = case when p_trilha = 'defesa' then defesa_nivel + 1 else defesa_nivel end,
    updated_at = now()
    where user_id = v_user_id and tipo = p_tipo;

  return jsonb_build_object(
    'ok', true,
    'mensagem', format('Especialidade %s (%s) subiu para o nivel %s.', p_tipo, p_trilha, v_nivel_atual + 1)
  );
end;
$$;

revoke all on function dev.subir_nivel_especialidade(text, text) from public;
revoke execute on function dev.subir_nivel_especialidade(text, text) from anon;
grant execute on function dev.subir_nivel_especialidade(text, text) to authenticated;

commit;
