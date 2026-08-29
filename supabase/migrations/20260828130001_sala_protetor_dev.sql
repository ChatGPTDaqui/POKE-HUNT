-- PH-241/236: espelho de 20260828130000_sala_protetor_public.sql pro schema dev.
create table dev.sala_protetor (
  session_id uuid primary key references dev.game_sessions(id) on delete cascade,
  uid uuid not null,
  species_id text not null,
  encounter_id text not null,
  level integer not null,
  iv_hp smallint not null,
  iv_atk_fis smallint not null,
  iv_atk_esp smallint not null,
  iv_def smallint not null,
  iv_def_esp smallint not null,
  iv_speed smallint not null,
  rarity text not null,
  is_shiny boolean not null,
  nature text null,
  trait text null,
  hp_atual integer not null,
  tipo text not null check (tipo in ('guardian', 'lord'))
);

comment on table dev.sala_protetor is
  'PH-241/236: protetor (Guardian/Lord) pendente da sala atual de uma game_session. Linha ausente == sem protetor ativo (sala nao pede, ou ja foi resolvido) — mesma semantica do antigo boss_uid null.';

alter table dev.sala_protetor enable row level security;

create policy "jogador le o protetor da propria sessao" on dev.sala_protetor
  for select to authenticated using (
    exists (
      select 1 from dev.game_sessions gs
      where gs.id = sala_protetor.session_id and gs.user_id = auth.uid()
    )
  );

create or replace function dev.gravar_flush_de_sessao(
  p_session_id uuid,
  p_simulated_seconds numeric,
  p_rng_state bigint,
  p_rng_draws bigint,
  p_poke_uid uuid,
  p_sequence_index integer,
  p_sequence_cleared boolean,
  p_sala_indice integer,
  p_sala_chave text,
  p_sala_abates integer,
  p_ciclos integer,
  p_protetor jsonb
)
returns void
language plpgsql
security definer
set search_path to 'dev'
as $function$
begin
  if auth.role() <> 'service_role' then
    raise exception 'nao autorizado' using errcode = '42501';
  end if;

  update dev.game_sessions set
    simulated_seconds = p_simulated_seconds,
    rng_state = p_rng_state,
    rng_draws = p_rng_draws,
    poke_uid = p_poke_uid,
    sequence_index = p_sequence_index,
    sequence_cleared = p_sequence_cleared,
    sala_indice = p_sala_indice,
    sala_chave = p_sala_chave,
    sala_abates = p_sala_abates,
    ciclos = p_ciclos
  where id = p_session_id;

  if p_protetor is null then
    delete from dev.sala_protetor where session_id = p_session_id;
  else
    insert into dev.sala_protetor (
      session_id, uid, species_id, encounter_id, level,
      iv_hp, iv_atk_fis, iv_atk_esp, iv_def, iv_def_esp, iv_speed,
      rarity, is_shiny, nature, trait, hp_atual, tipo
    ) values (
      p_session_id,
      (p_protetor->>'uid')::uuid,
      p_protetor->>'speciesId',
      p_protetor->>'encounterId',
      (p_protetor->>'level')::integer,
      (p_protetor->'ivs'->>'hp')::smallint,
      (p_protetor->'ivs'->>'atkFis')::smallint,
      (p_protetor->'ivs'->>'atkEsp')::smallint,
      (p_protetor->'ivs'->>'def')::smallint,
      (p_protetor->'ivs'->>'defEsp')::smallint,
      (p_protetor->'ivs'->>'speed')::smallint,
      p_protetor->>'rarity',
      (p_protetor->>'isShiny')::boolean,
      p_protetor->>'nature',
      p_protetor->>'trait',
      (p_protetor->>'hpAtual')::integer,
      p_protetor->>'tipo'
    )
    on conflict (session_id) do update set
      uid = excluded.uid, species_id = excluded.species_id, encounter_id = excluded.encounter_id,
      level = excluded.level,
      iv_hp = excluded.iv_hp, iv_atk_fis = excluded.iv_atk_fis, iv_atk_esp = excluded.iv_atk_esp,
      iv_def = excluded.iv_def, iv_def_esp = excluded.iv_def_esp, iv_speed = excluded.iv_speed,
      rarity = excluded.rarity, is_shiny = excluded.is_shiny, nature = excluded.nature,
      trait = excluded.trait, hp_atual = excluded.hp_atual, tipo = excluded.tipo;
  end if;
end;
$function$;

revoke execute on function dev.gravar_flush_de_sessao(
  uuid, numeric, bigint, bigint, uuid, integer, boolean, integer, text, integer, integer, jsonb
) from public, anon, authenticated;
grant execute on function dev.gravar_flush_de_sessao(
  uuid, numeric, bigint, bigint, uuid, integer, boolean, integer, text, integer, integer, jsonb
) to service_role;

alter table dev.game_sessions
  drop column boss_uid,
  drop column boss_species_id,
  drop column boss_encounter_id,
  drop column boss_level,
  drop column boss_iv_hp,
  drop column boss_iv_atk_fis,
  drop column boss_iv_atk_esp,
  drop column boss_iv_def,
  drop column boss_iv_def_esp,
  drop column boss_iv_speed,
  drop column boss_rarity,
  drop column boss_is_shiny,
  drop column boss_nature,
  drop column boss_trait,
  drop column boss_hp_atual;
