-- PH-529: PvP ranqueado (fila por MMR/PDL) e time dedicado ao PvP.
--
-- Aditiva, nao mexe no fluxo amistoso existente (abrir_pvp/aceitar_pvp/
-- registrar_resultado_pvp continuam como estao). pvp_sessao/pvp_historico so
-- ganham colunas novas, nulas pro fluxo antigo.
--
-- Resolucao de partida ranqueada (e, depois, amistosa com time completo) e
-- SERVER-SIDE via edge function de servico (service_role) chamando
-- `aplicar_resultado_pvp` — nunca o cliente reportando o proprio veredito
-- (esse e o modelo antigo de `registrar_resultado_pvp`, aceitavel pra duelo
-- social sem stakes, inaceitavel com MMR em jogo).

create table if not exists public.pvp_time (
  user_id uuid primary key references public.players(user_id) on delete cascade,
  pokemon_ids uuid[] not null default '{}',
  atualizado_em timestamptz not null default now()
);

alter table public.pvp_time enable row level security;
drop policy if exists "pvp_time leitura do dono" on public.pvp_time;
create policy "pvp_time leitura do dono" on public.pvp_time
  for select to authenticated
  using (user_id = auth.uid());
grant select on public.pvp_time to authenticated;
grant select, insert, update on public.pvp_time to service_role;

create table if not exists public.pvp_rank (
  user_id uuid primary key references public.players(user_id) on delete cascade,
  mmr integer not null default 1000,
  partidas integer not null default 0,
  pdl integer not null default 0,
  divisao text not null default 'bronze_1',
  vitorias integer not null default 0,
  derrotas integer not null default 0,
  partidas_hoje integer not null default 0,
  reset_em timestamptz not null default now()
);

alter table public.pvp_rank enable row level security;
drop policy if exists "pvp_rank leitura do dono" on public.pvp_rank;
create policy "pvp_rank leitura do dono" on public.pvp_rank
  for select to authenticated
  using (user_id = auth.uid());
grant select on public.pvp_rank to authenticated;
grant select, insert, update on public.pvp_rank to service_role;

create table if not exists public.pvp_fila (
  user_id uuid primary key references public.players(user_id) on delete cascade,
  mmr integer not null,
  entrou_em timestamptz not null default now()
);

alter table public.pvp_fila enable row level security;
drop policy if exists "pvp_fila leitura do dono" on public.pvp_fila;
create policy "pvp_fila leitura do dono" on public.pvp_fila
  for select to authenticated
  using (user_id = auth.uid());
grant select on public.pvp_fila to authenticated;
grant select, insert, update, delete on public.pvp_fila to service_role;

alter table public.pvp_sessao
  add column if not exists modo text not null default 'amistoso' check (modo in ('amistoso', 'ranqueado')),
  add column if not exists anfitriao_time jsonb,
  add column if not exists convidado_time jsonb;

alter table public.pvp_historico
  add column if not exists modo text not null default 'amistoso' check (modo in ('amistoso', 'ranqueado')),
  add column if not exists pdl_delta_anfitriao integer,
  add column if not exists pdl_delta_convidado integer;

-- Instante do proximo reset diario global (03:00 UTC = 00:00 America/Sao_Paulo).
-- Horario escolhido pra virar meia-noite do publico majoritario (BR) sem cair
-- em pico de uso de nenhum fuso; fixo em UTC, nao depende do fuso do client.
-- Vira o padrao de reset diario pra qualquer mecanica futura do jogo, nao so PvP.
create or replace function public.pvp_proximo_reset(p_ref timestamptz default now())
returns timestamptz
language sql
stable
as $function$
  select case
    when p_ref < (date_trunc('day', p_ref at time zone 'utc') at time zone 'utc') + interval '3 hours'
      then (date_trunc('day', p_ref at time zone 'utc') at time zone 'utc') + interval '3 hours'
    else (date_trunc('day', p_ref at time zone 'utc') at time zone 'utc') + interval '1 day 3 hours'
  end
$function$;

-- Garante a linha de rank do jogador e aplica o reset diario se ja passou da
-- hora. Chamada interna (nao exposta direto) por quem precisa do rank atual.
create or replace function public.pvp_garantir_rank(p_user uuid)
returns public.pvp_rank
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_r public.pvp_rank;
begin
  insert into public.pvp_rank (user_id, reset_em)
  values (p_user, public.pvp_proximo_reset())
  on conflict (user_id) do nothing;

  select * into v_r from public.pvp_rank where user_id = p_user for update;

  if v_r.reset_em <= now() then
    update public.pvp_rank
       set partidas_hoje = 0, reset_em = public.pvp_proximo_reset()
     where user_id = p_user
     returning * into v_r;
  end if;

  return v_r;
end
$function$;

create or replace function public.meu_rank_pvp()
returns public.pvp_rank
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
begin
  if v_eu is null then raise exception 'sem sessao autenticada'; end if;
  return public.pvp_garantir_rank(v_eu);
end
$function$;

-- Salva o time dedicado ao PvP (ate 6 POKEs do proprio jogador). Nao exige
-- nivel/golpes aqui: a checagem de "pronto pra ranqueado" e feita na hora de
-- entrar na fila, pra o jogador poder montar o time aos poucos.
create or replace function public.salvar_time_pvp(p_pokemon_ids uuid[])
returns public.pvp_time
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_ids uuid[];
  v_t public.pvp_time;
begin
  if v_eu is null then raise exception 'sem sessao autenticada'; end if;
  if array_length(p_pokemon_ids, 1) is not null and array_length(p_pokemon_ids, 1) > 6 then
    raise exception 'Time de PvP aceita no maximo 6 POKEs.';
  end if;

  select array_agg(distinct id) into v_ids
    from unnest(p_pokemon_ids) as id
    where exists (select 1 from public.pokemon_instances pi where pi.id = id and pi.user_id = v_eu);

  if coalesce(array_length(v_ids, 1), 0) <> coalesce(array_length(p_pokemon_ids, 1), 0) then
    raise exception 'Um dos POKEs informados nao pertence a voce ou esta repetido.';
  end if;

  insert into public.pvp_time (user_id, pokemon_ids, atualizado_em)
  values (v_eu, coalesce(p_pokemon_ids, '{}'), now())
  on conflict (user_id) do update
    set pokemon_ids = excluded.pokemon_ids, atualizado_em = now()
  returning * into v_t;
  return v_t;
end
$function$;

-- Time de PvP como snapshot jsonb (mesmo formato de anfitriao_poke/convidado_poke,
-- so que array), pra guardar junto da sessao/historico igual o fluxo amistoso
-- ja faz — o registro fica auditavel mesmo se o POKE mudar depois.
create or replace function public.pvp_snapshot_time(p_user uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(to_jsonb(pi) - 'user_id' order by ord), '[]'::jsonb)
  from public.pvp_time t
  cross join lateral unnest(t.pokemon_ids) with ordinality as u(pokemon_id, ord)
  join public.pokemon_instances pi on pi.id = u.pokemon_id
  where t.user_id = p_user;
$function$;

-- Time pronto pra ranqueado: 6/6, todos nivel >= 80, todos com os 4 golpes
-- ativos preenchidos. Validado aqui (server), nao so no client.
create or replace function public.pvp_time_pronto_ranqueado(p_user uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(array_length(t.pokemon_ids, 1), 0) = 6
     and not exists (
       select 1 from unnest(t.pokemon_ids) as pid
       join public.pokemon_instances pi on pi.id = pid
       where pi.user_id <> p_user
          or pi.level < 80
          or coalesce(array_length(pi.active_abilities, 1), 0) < 4
     )
  from public.pvp_time t
  where t.user_id = p_user;
$function$;

create or replace function public.entrar_fila_ranqueada()
returns public.pvp_rank
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_rank public.pvp_rank;
begin
  if v_eu is null then raise exception 'sem sessao autenticada'; end if;

  if exists (
    select 1 from public.pvp_sessao
     where estado in ('convidada', 'aberta')
       and (anfitriao_id = v_eu or convidado_id = v_eu)
  ) then
    raise exception 'Voce ja esta em um duelo PvP.';
  end if;

  if not coalesce(public.pvp_time_pronto_ranqueado(v_eu), false) then
    raise exception 'Seu time de PvP precisa de 6 POKEs, todos nivel 80+ com os 4 golpes escolhidos.';
  end if;

  v_rank := public.pvp_garantir_rank(v_eu);
  if v_rank.partidas_hoje >= 5 then
    raise exception 'Limite de 5 partidas ranqueadas hoje atingido. Volta amanha.';
  end if;

  insert into public.pvp_fila (user_id, mmr, entrou_em)
  values (v_eu, v_rank.mmr, now())
  on conflict (user_id) do update set mmr = excluded.mmr;

  return v_rank;
end
$function$;

create or replace function public.sair_da_fila_ranqueada()
returns void
language sql
security definer
set search_path to 'public'
as $function$
  delete from public.pvp_fila where user_id = auth.uid();
$function$;

-- Pareamento atomico: cada chamada tenta casar o proprio jogador com alguem
-- na fila dentro de uma faixa de MMR que expande com o tempo de espera.
-- `for update skip locked` no candidato evita duas chamadas concorrentes
-- pegarem o mesmo par. Cliente faz polling desta funcao (nao ha cron).
create or replace function public.tentar_parear_ranqueado()
returns public.pvp_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_eu_fila public.pvp_fila;
  v_alvo public.pvp_fila;
  v_janela integer;
  v_s public.pvp_sessao;
begin
  if v_eu is null then raise exception 'sem sessao autenticada'; end if;

  select * into v_eu_fila from public.pvp_fila where user_id = v_eu;
  if not found then raise exception 'Voce nao esta na fila ranqueada.'; end if;

  v_janela := least(300, 50 + floor(extract(epoch from (now() - v_eu_fila.entrou_em)) / 10) * 25);

  select * into v_alvo
    from public.pvp_fila
   where user_id <> v_eu
     and abs(mmr - v_eu_fila.mmr) <= v_janela
   order by entrou_em asc
   limit 1
   for update skip locked;

  if not found then
    return null;
  end if;

  delete from public.pvp_fila where user_id in (v_eu, v_alvo.user_id);

  insert into public.pvp_sessao (
    anfitriao_id, convidado_id, estado, modo,
    anfitriao_time, convidado_time,
    anfitriao_pokemon_id, convidado_pokemon_id
  )
  values (
    v_eu, v_alvo.user_id, 'aberta', 'ranqueado',
    public.pvp_snapshot_time(v_eu), public.pvp_snapshot_time(v_alvo.user_id),
    null, null
  )
  returning * into v_s;

  update public.pvp_rank set partidas_hoje = partidas_hoje + 1 where user_id in (v_eu, v_alvo.user_id);

  return v_s;
end
$function$;

-- So o service_role chama (edge function de resolucao), nunca o client direto:
-- e aqui que o resultado computado no servidor (Elo/PDL ja calculados pela
-- edge function a partir do pvpSimulator) e persistido de forma atomica.
-- Recebe os valores FINAIS ja calculados (Elo/PDL/divisao) pela edge function
-- (fonte unica da matematica, ver authority/src/pvpElo.ts) — esta funcao so
-- persiste de forma atomica, sem reimplementar a conta em plpgsql.
create or replace function public.aplicar_resultado_pvp(
  p_sessao_id uuid,
  p_vencedor_id uuid,
  p_eventos jsonb,
  p_mmr_anfitriao integer,
  p_pdl_anfitriao integer,
  p_divisao_anfitriao text,
  p_mmr_convidado integer,
  p_pdl_convidado integer,
  p_divisao_convidado text,
  p_pdl_delta_anfitriao integer,
  p_pdl_delta_convidado integer
)
returns public.pvp_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_s public.pvp_sessao;
begin
  select * into v_s from public.pvp_sessao where id = p_sessao_id for update;
  if not found then raise exception 'PvP nao encontrado.'; end if;
  if v_s.estado <> 'aberta' then return v_s; end if;
  if p_vencedor_id is not null and p_vencedor_id not in (v_s.anfitriao_id, v_s.convidado_id) then
    raise exception 'Vencedor invalido para este PvP.';
  end if;

  update public.pvp_sessao
     set estado = 'concluida', vencedor_id = p_vencedor_id, encerrada_em = now()
   where id = p_sessao_id
   returning * into v_s;

  insert into public.pvp_historico (
    sessao_id, anfitriao_id, convidado_id, vencedor_id, encerrada_em, modo,
    pdl_delta_anfitriao, pdl_delta_convidado
  )
  values (
    v_s.id, v_s.anfitriao_id, v_s.convidado_id, v_s.vencedor_id, v_s.encerrada_em, v_s.modo,
    p_pdl_delta_anfitriao, p_pdl_delta_convidado
  )
  on conflict do nothing;

  if v_s.modo = 'ranqueado' then
    update public.pvp_rank
       set mmr = p_mmr_anfitriao,
           pdl = p_pdl_anfitriao,
           divisao = p_divisao_anfitriao,
           partidas = partidas + 1,
           vitorias = vitorias + case when v_s.vencedor_id = v_s.anfitriao_id then 1 else 0 end,
           derrotas = derrotas + case when v_s.vencedor_id = v_s.convidado_id then 1 else 0 end
     where user_id = v_s.anfitriao_id;

    update public.pvp_rank
       set mmr = p_mmr_convidado,
           pdl = p_pdl_convidado,
           divisao = p_divisao_convidado,
           partidas = partidas + 1,
           vitorias = vitorias + case when v_s.vencedor_id = v_s.convidado_id then 1 else 0 end,
           derrotas = derrotas + case when v_s.vencedor_id = v_s.anfitriao_id then 1 else 0 end
     where user_id = v_s.convidado_id;
  end if;

  return v_s;
end
$function$;

grant execute on function public.meu_rank_pvp() to authenticated;
grant execute on function public.salvar_time_pvp(uuid[]) to authenticated;
grant execute on function public.entrar_fila_ranqueada() to authenticated;
grant execute on function public.sair_da_fila_ranqueada() to authenticated;
grant execute on function public.tentar_parear_ranqueado() to authenticated;
revoke execute on function public.pvp_garantir_rank(uuid) from public;
revoke execute on function public.pvp_snapshot_time(uuid) from public;
revoke execute on function public.pvp_time_pronto_ranqueado(uuid) from public;
revoke execute on function public.aplicar_resultado_pvp(uuid, uuid, jsonb, integer, integer, text, integer, integer, text, integer, integer) from public, authenticated;
grant execute on function public.aplicar_resultado_pvp(uuid, uuid, jsonb, integer, integer, text, integer, integer, text, integer, integer) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pvp_rank'
  ) then
    alter publication supabase_realtime add table public.pvp_rank;
  end if;
end $$;
