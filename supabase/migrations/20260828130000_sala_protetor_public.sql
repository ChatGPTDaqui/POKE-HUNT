-- PH-241/236: as 15 colunas `boss_*` de `game_sessions` (PH-201/202/204)
-- migram pra tabela dedicada `sala_protetor` — decisao explicita do usuario:
-- zero coluna com nome de boss em qualquer lugar do schema, depois do rename
-- Guardian/Lord no motor (PH-237).
--
-- Por que tabela nova, e nao so renomear as colunas: o PATCH cru que hoje
-- grava `game_sessions` inteira num golpe so (authority/src/progresso.ts,
-- `atualizar(...)`) e atomico so PORQUE e uma linha, uma tabela. Separar o
-- protetor pra tabela propria exige que a escrita passe a ser uma FUNCAO
-- (abaixo) que faz update+upsert na MESMA transacao — nao dois PATCH soltos,
-- que abririam uma janela onde game_sessions e sala_protetor divergem se o
-- segundo falhar.
--
-- session_id como PRIMARY KEY (nao uma coluna id propria + unique constraint
-- separada): expressa "no maximo um protetor por sessao" da forma mais direta,
-- e e o que faz o PostgREST tratar o embedded select (`select=*,sala_protetor(*)`,
-- authority/src/appSessao.ts#sessaoAberta) como objeto UNICO em vez de array.
create table public.sala_protetor (
  session_id uuid primary key references public.game_sessions(id) on delete cascade,
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
  -- Guardian (salas 1-9) ou Lord (sala 10) — nao vinha de lugar nenhum antes:
  -- `ProtetorPendente` (engine/types.ts) nunca guardou o proprio tipo, so a
  -- aparencia/stats. Escrito a cada flush via `protetorDaSala(world.sala)`
  -- re-derivado (puro, sem RNG — seguro reavaliar; a sala fica travada
  -- enquanto o protetor existe, entao o tipo nao muda debaixo dele).
  tipo text not null check (tipo in ('guardian', 'lord'))
);

comment on table public.sala_protetor is
  'PH-241/236: protetor (Guardian/Lord) pendente da sala atual de uma game_session. Linha ausente == sem protetor ativo (sala nao pede, ou ja foi resolvido) — mesma semantica do antigo boss_uid null.';

alter table public.sala_protetor enable row level security;

-- Mesmo padrao de game_sessions (a tabela-mae): o jogador LE (a UI mostra o
-- protetor em campo), nunca escreve — so o servidor, via service_role na
-- funcao abaixo (que bypassa RLS). session_id nao e o INDICE natural de
-- posse (a tabela nao tem user_id proprio) — join com game_sessions.user_id.
create policy "jogador le o protetor da propria sessao" on public.sala_protetor
  for select to authenticated using (
    exists (
      select 1 from public.game_sessions gs
      where gs.id = sala_protetor.session_id and gs.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- FUNCAO DE FLUSH: substitui o PATCH cru em game_sessions (progresso.ts:1196)
-- ---------------------------------------------------------------------------
-- Concorrencia: NENHUM lock novo aqui. O claim atomico em `aplicarFlush`
-- (`last_flush_at=eq.<valor lido>` no filtro do PATCH de claim, ver
-- progresso.ts:954-959) ja serializa flushes concorrentes do MESMO jogador
-- ANTES da simulacao rodar — por quando esta funcao e chamada, so um flush
-- por sessao esta em voo.
--
-- p_protetor null = sala sem protetor pendente (resolvido, ou nao pede) ->
-- DELETE. Nao-null -> upsert. Nunca deixa linha "fantasma" de protetor de
-- sessao ja resolvida.
create or replace function public.gravar_flush_de_sessao(
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
set search_path to 'public'
as $function$
begin
  -- Defesa em profundidade alem do grant (abaixo): mesmo que um dia o grant
  -- seja concedido por engano a outra role, a funcao se recusa sozinha.
  if auth.role() <> 'service_role' then
    raise exception 'nao autorizado' using errcode = '42501';
  end if;

  update public.game_sessions set
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
    delete from public.sala_protetor where session_id = p_session_id;
  else
    insert into public.sala_protetor (
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

-- Revoga das 3 de uma vez (PUBLIC, anon, authenticated) — a licao do
-- `gravar_progresso` (20260822130000 + 20260822130100 em duas migrations
-- separadas, porque `revoke ... from public` sozinho NAO alcanca o grant
-- explicito e NOMEADO que `alter default privileges` da a anon/authenticated
-- na criacao de toda funcao nova neste projeto). Uma migration so, aqui.
revoke execute on function public.gravar_flush_de_sessao(
  uuid, numeric, bigint, bigint, uuid, integer, boolean, integer, text, integer, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.gravar_flush_de_sessao(
  uuid, numeric, bigint, bigint, uuid, integer, boolean, integer, text, integer, integer, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- Colunas antigas saem de game_sessions. So depois da funcao acima existir —
-- a ordem dentro do arquivo nao garante atomicidade entre CREATE FUNCTION e
-- DROP COLUMN (cada statement e a propria transacao implicita no Postgres,
-- mas `supabase db push` aplica o arquivo inteiro numa unica transacao de
-- migration), e mante-las nulas ate aqui evita a funcao nova tentar gravar
-- num schema que ainda nao tem sala_protetor caso a ordem fosse invertida.
alter table public.game_sessions
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
