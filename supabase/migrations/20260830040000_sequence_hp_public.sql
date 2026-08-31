-- PH-307: o HP do POKE da sequencia (Campeao Lance) precisa atravessar a janela
-- do flush.
--
-- O QUE ESTAVA ACONTECENDO
-- ---------------------------------------------------------------------------
-- O servidor reconstroi o mundo a cada janela (~30s) e `spawnSequenceEnemy`
-- cria o membro da sequencia SEMPRE com HP cheio. Todo dano acumulado na janela
-- anterior era descartado na borda: quem precisasse de mais de uma janela pra
-- derrubar um membro nunca o derrubava, e mesmo quem ganhava ficava atras do
-- cliente — que simula continuamente e nao perde nada nas bordas.
--
-- Medido em producao em 30/08: as duas sessoes de `boss_lance` chegaram ao
-- indice 5 (o ultimo dos 6) com `sequence_cleared = false`, `hall_da_fama`
-- vazia e ninguem com `faixa3`. O cliente anunciava a vitoria, o servidor nunca
-- concordava, e o estado seguinte apagava a liberacao.
--
-- E a mesma correcao que PH-217 fez pro protetor da sala (`sala_protetor.
-- hp_atual`), aplicada ao unico outro inimigo que atravessa janela.
--
-- SEMANTICA DA COLUNA — tres valores, tres significados:
--   null  = nao ha informacao (sessao nova). O membro nasce com HP cheio.
--   > 0   = luta em andamento. O membro nasce com esse HP.
--   0     = o membro do indice atual JA CAIU e a sequencia ainda nao avancou.
--           O mundo nasce SEM ele, e o tick seguinte avanca o indice (ou fecha
--           a sequencia, se era o ultimo). Sem isto, um membro morto na borda
--           da janela ressuscitava inteiro e tinha que ser derrotado de novo.
alter table public.game_sessions add column if not exists sequence_hp integer;

comment on column public.game_sessions.sequence_hp is
  'PH-307: HP do membro da sequencia (Lance) em campo. null = sem info (nasce cheio); >0 = luta em andamento; 0 = ja caiu, aguardando o avanco do indice.';

-- SOBRECARGA, e nao substituicao. A versao de 12 parametros continua existindo
-- de proposito: entre `db push` e a publicacao da Edge Function ha uma janela de
-- segundos em que o bundle ANTIGO ainda esta no ar, e derrubar a assinatura que
-- ele chama transformaria essa janela em flush 502 — progresso nao gravado. Com
-- as duas assinaturas vivas nao ha ambiguidade: a antiga tem 12 parametros
-- obrigatorios, a nova tem 13, e o PostgREST resolve pela presenca de
-- `p_sequence_hp`. A de 12 sai numa migration futura, depois do deploy.
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
  p_protetor jsonb,
  p_sequence_hp integer
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
    sequence_hp = p_sequence_hp,
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

-- Revoga das 3 de uma vez (PUBLIC, anon, authenticated) — mesma licao do
-- `gravar_progresso`: `revoke ... from public` sozinho NAO alcanca o grant
-- explicito e NOMEADO que `alter default privileges` da a anon/authenticated na
-- criacao de toda funcao nova neste projeto.
revoke execute on function public.gravar_flush_de_sessao(
  uuid, numeric, bigint, bigint, uuid, integer, boolean, integer, text, integer, integer, jsonb, integer
) from public, anon, authenticated;
grant execute on function public.gravar_flush_de_sessao(
  uuid, numeric, bigint, bigint, uuid, integer, boolean, integer, text, integer, integer, jsonb, integer
) to service_role;
