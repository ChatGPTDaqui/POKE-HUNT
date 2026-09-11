-- PH-512: PvP amistoso com convite, aceite e historico.
create table if not exists public.pvp_sessao (
  id uuid primary key default gen_random_uuid(),
  anfitriao_id uuid not null references public.players(user_id) on delete cascade,
  convidado_id uuid not null references public.players(user_id) on delete cascade,
  estado text not null default 'convidada'
    check (estado in ('convidada', 'aberta', 'concluida', 'cancelada', 'expirada')),
  criada_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '15 minutes',
  encerrada_por uuid references public.players(user_id) on delete set null,
  encerrada_em timestamptz,
  vencedor_id uuid references public.players(user_id) on delete set null,
  anfitriao_poke jsonb,
  convidado_poke jsonb,
  anfitriao_pokemon_id uuid,
  convidado_pokemon_id uuid,
  anfitriao_reporte uuid references public.players(user_id) on delete set null,
  convidado_reporte uuid references public.players(user_id) on delete set null,
  constraint pvp_sessao_lados_distintos check (anfitriao_id <> convidado_id)
);

create unique index if not exists pvp_sessao_anfitriao_viva
  on public.pvp_sessao (anfitriao_id)
  where estado in ('convidada', 'aberta');
create unique index if not exists pvp_sessao_convidado_viva
  on public.pvp_sessao (convidado_id)
  where estado in ('convidada', 'aberta');
create index if not exists pvp_sessao_viva_expira
  on public.pvp_sessao (expira_em)
  where estado in ('convidada', 'aberta');

create table if not exists public.pvp_historico (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null,
  anfitriao_id uuid not null references public.players(user_id) on delete cascade,
  convidado_id uuid not null references public.players(user_id) on delete cascade,
  vencedor_id uuid references public.players(user_id) on delete set null,
  encerrada_em timestamptz not null default now()
);

create index if not exists pvp_historico_anfitriao_em on public.pvp_historico (anfitriao_id, encerrada_em desc);
create index if not exists pvp_historico_convidado_em on public.pvp_historico (convidado_id, encerrada_em desc);

alter table public.pvp_sessao enable row level security;
alter table public.pvp_historico enable row level security;

drop policy if exists "pvp leitura dos participantes" on public.pvp_sessao;
create policy "pvp leitura dos participantes" on public.pvp_sessao
  for select to authenticated
  using (anfitriao_id = auth.uid() or convidado_id = auth.uid());

drop policy if exists "pvp historico dos participantes" on public.pvp_historico;
create policy "pvp historico dos participantes" on public.pvp_historico
  for select to authenticated
  using (anfitriao_id = auth.uid() or convidado_id = auth.uid());

grant select on public.pvp_sessao to authenticated;
grant select on public.pvp_historico to authenticated;
grant select, insert, update on public.pvp_sessao to service_role;
grant select, insert on public.pvp_historico to service_role;

create or replace function public.pvp_validar_poke(p_eu uuid, p_pokemon_id uuid, p_poke jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_p public.pokemon_instances;
begin
  select * into v_p from public.pokemon_instances where id = p_pokemon_id;
  if not found or v_p.user_id <> p_eu then
    raise exception 'POKE informado nao pertence a voce.';
  end if;
  if v_p.location <> 'team' then
    raise exception 'POKE precisa estar na equipe para o duelo.';
  end if;
  if p_poke->>'speciesId' is distinct from v_p.species_id
     or (p_poke->>'level')::int is distinct from v_p.level
     or (p_poke->>'isShiny')::boolean is distinct from v_p.is_shiny
     or (p_poke->'ivs'->>'hp')::int is distinct from v_p.iv_hp
     or (p_poke->'ivs'->>'atkFis')::int is distinct from v_p.iv_atk_fis
     or (p_poke->'ivs'->>'atkEsp')::int is distinct from v_p.iv_atk_esp
     or (p_poke->'ivs'->>'def')::int is distinct from v_p.iv_def
     or (p_poke->'ivs'->>'defEsp')::int is distinct from v_p.iv_def_esp
     or (p_poke->'ivs'->>'speed')::int is distinct from v_p.iv_speed
     or (p_poke->'stats'->>'hp')::int is distinct from v_p.stat_hp
     or (p_poke->'stats'->>'atkFis')::int is distinct from v_p.stat_atk_fis
     or (p_poke->'stats'->>'atkEsp')::int is distinct from v_p.stat_atk_esp
     or (p_poke->'stats'->>'def')::int is distinct from v_p.stat_def
     or (p_poke->'stats'->>'defEsp')::int is distinct from v_p.stat_def_esp
     or (p_poke->'stats'->>'speed')::int is distinct from v_p.stat_speed
  then
    raise exception 'Dados do POKE nao conferem com o servidor.';
  end if;
end
$function$;

create or replace function public.abrir_pvp(p_convidado_id uuid, p_pokemon_id uuid, p_poke jsonb)
returns public.pvp_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_s public.pvp_sessao;
begin
  if v_eu is null then raise exception 'sem sessao autenticada'; end if;
  if p_convidado_id is null or p_convidado_id = v_eu then
    raise exception 'Voce nao pode convidar voce mesmo para PvP.';
  end if;
  perform public.pvp_validar_poke(v_eu, p_pokemon_id, p_poke);

  update public.pvp_sessao
     set estado = 'expirada', encerrada_em = now()
   where estado in ('convidada', 'aberta') and expira_em <= now();

  if exists (
    select 1 from public.pvp_sessao
     where estado in ('convidada', 'aberta')
       and (anfitriao_id in (v_eu, p_convidado_id) or convidado_id in (v_eu, p_convidado_id))
  ) then
    raise exception 'Um dos treinadores ja esta em outro PvP.';
  end if;

  insert into public.pvp_sessao (anfitriao_id, convidado_id, anfitriao_poke, anfitriao_pokemon_id)
  values (v_eu, p_convidado_id, p_poke, p_pokemon_id)
  returning * into v_s;
  return v_s;
end
$function$;

create or replace function public.aceitar_pvp(p_sessao_id uuid, p_pokemon_id uuid, p_poke jsonb)
returns public.pvp_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_s public.pvp_sessao;
begin
  select * into v_s from public.pvp_sessao where id = p_sessao_id for update;
  if not found then raise exception 'Convite PvP nao encontrado.'; end if;
  if v_s.convidado_id <> v_eu then raise exception 'So o convidado pode aceitar este PvP.'; end if;
  if v_s.estado <> 'convidada' or v_s.expira_em <= now() then raise exception 'Este convite PvP expirou.'; end if;
  perform public.pvp_validar_poke(v_eu, p_pokemon_id, p_poke);

  update public.pvp_sessao
     set estado = 'aberta', convidado_poke = p_poke, convidado_pokemon_id = p_pokemon_id
   where id = p_sessao_id
   returning * into v_s;
  return v_s;
end
$function$;

create or replace function public.encerrar_pvp(p_sessao_id uuid)
returns public.pvp_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_s public.pvp_sessao;
begin
  select * into v_s from public.pvp_sessao where id = p_sessao_id for update;
  if not found then raise exception 'PvP nao encontrado.'; end if;
  if v_s.anfitriao_id <> v_eu and v_s.convidado_id <> v_eu then raise exception 'Este PvP nao e seu.'; end if;
  if v_s.estado not in ('convidada', 'aberta') then return v_s; end if;

  update public.pvp_sessao
     set estado = 'cancelada', encerrada_por = v_eu, encerrada_em = now()
   where id = p_sessao_id
   returning * into v_s;
  return v_s;
end
$function$;

-- Cada lado reporta seu proprio veredito; so grava vitoria/historico quando os
-- dois relatos batem. Divergencia (um lado mente) cancela sem vencedor em vez
-- de confiar em quem chamou a RPC primeiro.
create or replace function public.registrar_resultado_pvp(p_sessao_id uuid, p_vencedor_id uuid)
returns public.pvp_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_s public.pvp_sessao;
  v_sou_anfitriao boolean;
begin
  select * into v_s from public.pvp_sessao where id = p_sessao_id for update;
  if not found then raise exception 'PvP nao encontrado.'; end if;
  v_sou_anfitriao := (v_s.anfitriao_id = v_eu);
  if not v_sou_anfitriao and v_s.convidado_id <> v_eu then raise exception 'Este PvP nao e seu.'; end if;
  if p_vencedor_id is not null and p_vencedor_id not in (v_s.anfitriao_id, v_s.convidado_id) then
    raise exception 'Vencedor invalido para este PvP.';
  end if;
  if v_s.estado <> 'aberta' then return v_s; end if;

  if v_sou_anfitriao then
    update public.pvp_sessao set anfitriao_reporte = coalesce(p_vencedor_id, '00000000-0000-0000-0000-000000000000'::uuid)
     where id = p_sessao_id returning * into v_s;
  else
    update public.pvp_sessao set convidado_reporte = coalesce(p_vencedor_id, '00000000-0000-0000-0000-000000000000'::uuid)
     where id = p_sessao_id returning * into v_s;
  end if;

  if v_s.anfitriao_reporte is null or v_s.convidado_reporte is null then
    return v_s;
  end if;

  if v_s.anfitriao_reporte = v_s.convidado_reporte then
    update public.pvp_sessao
       set estado = 'concluida',
           vencedor_id = nullif(v_s.anfitriao_reporte, '00000000-0000-0000-0000-000000000000'::uuid),
           encerrada_em = now()
     where id = p_sessao_id
     returning * into v_s;

    insert into public.pvp_historico (sessao_id, anfitriao_id, convidado_id, vencedor_id, encerrada_em)
    values (v_s.id, v_s.anfitriao_id, v_s.convidado_id, v_s.vencedor_id, coalesce(v_s.encerrada_em, now()))
    on conflict do nothing;
  else
    update public.pvp_sessao
       set estado = 'cancelada', encerrada_em = now()
     where id = p_sessao_id
     returning * into v_s;
  end if;
  return v_s;
end
$function$;

revoke execute on function public.pvp_validar_poke(uuid, uuid, jsonb) from public;
grant execute on function public.abrir_pvp(uuid, uuid, jsonb) to authenticated;
grant execute on function public.aceitar_pvp(uuid, uuid, jsonb) to authenticated;
grant execute on function public.encerrar_pvp(uuid) to authenticated;
grant execute on function public.registrar_resultado_pvp(uuid, uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pvp_sessao'
  ) then
    alter publication supabase_realtime add table public.pvp_sessao;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pvp_historico'
  ) then
    alter publication supabase_realtime add table public.pvp_historico;
  end if;
end $$;
