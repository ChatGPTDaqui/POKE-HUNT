-- PH-199 — gemeo dev de `20260826210000_missoes_por_tipo_public.sql`.
-- Mesma logica, so com o schema trocado (public. -> dev., search_path =
-- public -> search_path = dev, public). Ver o arquivo public pro raciocinio
-- completo (por que a cadeia e derivada de `species` em vez de gravada, por
-- que so gold como recompensa, por que o advisory lock).
begin;

create table dev.player_missoes_reivindicadas (
  user_id uuid not null references dev.players(user_id) on delete cascade,
  tipo text not null check (tipo in (
    'NORMAL','FIRE','WATER','ELECTRIC','GRASS','ICE','FIGHTING','POISON',
    'GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL','FAIRY'
  )),
  species_id text not null references dev.species(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (user_id, tipo, species_id)
);

create index player_missoes_reivindicadas_user_tipo_idx
  on dev.player_missoes_reivindicadas(user_id, tipo);

alter table dev.player_missoes_reivindicadas enable row level security;

create policy "own rows all" on dev.player_missoes_reivindicadas for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "admin reads all" on dev.player_missoes_reivindicadas for select to authenticated
  using ((select dev.is_admin()));

grant select, insert, update, delete on dev.player_missoes_reivindicadas to authenticated;
grant select, insert, update, delete on dev.player_missoes_reivindicadas to service_role;

create function dev.reivindicar_missao(p_tipo text, p_species_id text)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_posicao int;
  v_total int;
  v_reivindicadas int;
  v_abates bigint;
  v_alvo int;
  v_recompensa bigint;
  v_ja_reivindicada boolean;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_tipo not in (
    'NORMAL','FIRE','WATER','ELECTRIC','GRASS','ICE','FIGHTING','POISON',
    'GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL','FAIRY'
  ) then
    raise exception 'tipo invalido' using errcode = 'P0001';
  end if;

  select exists(
    select 1 from dev.player_missoes_reivindicadas
    where user_id = v_user_id and tipo = p_tipo and species_id = p_species_id
  ) into v_ja_reivindicada;
  if v_ja_reivindicada then
    raise exception 'Missao ja reivindicada.' using errcode = 'P0001';
  end if;

  with cadeia as (
    select id, (row_number() over (order by dex_number) - 1)::int as posicao
    from dev.species
    where type1 = p_tipo::dev.element_type or type2 = p_tipo::dev.element_type
  )
  select posicao into v_posicao from cadeia where id = p_species_id;
  if v_posicao is null then
    raise exception 'Essa especie nao pertence a cadeia desse tipo.' using errcode = 'P0001';
  end if;

  select count(*) into v_total from dev.species
    where type1 = p_tipo::dev.element_type or type2 = p_tipo::dev.element_type;

  select count(*) into v_reivindicadas from dev.player_missoes_reivindicadas
    where user_id = v_user_id and tipo = p_tipo;
  if v_reivindicadas != v_posicao then
    raise exception 'Complete a missao anterior da cadeia primeiro.' using errcode = 'P0001';
  end if;

  select coalesce(normal_kills, 0) + coalesce(shiny_kills, 0) into v_abates
    from dev.player_pokedex where user_id = v_user_id and species_id = p_species_id;
  v_alvo := 50 + v_posicao * 25;
  if coalesce(v_abates, 0) < v_alvo then
    raise exception 'Abates insuficientes para reivindicar esta missao.' using errcode = 'P0001';
  end if;

  v_recompensa := 100 + v_posicao * 50;
  if v_posicao + 1 = v_total then
    v_recompensa := v_recompensa + 5000;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  update dev.players set gold = gold + v_recompensa where user_id = v_user_id;
  if not found then
    raise exception 'jogador sem linha em players' using errcode = 'P0001';
  end if;

  insert into dev.player_missoes_reivindicadas (user_id, tipo, species_id)
  values (v_user_id, p_tipo, p_species_id);

  return jsonb_build_object(
    'ok', true,
    'mensagem', format('Missao de %s (posicao %s) reivindicada — %s de ouro.', p_tipo, v_posicao + 1, v_recompensa)
  );
end;
$$;

revoke all on function dev.reivindicar_missao(text, text) from public;
revoke execute on function dev.reivindicar_missao(text, text) from anon;
grant execute on function dev.reivindicar_missao(text, text) to authenticated;

commit;
