-- Substitui o design de error_logs/reportar_erro (dedup por assinatura) por
-- audit_logs -- SEM dedup, cada erro vira uma linha propria, pra dar trilha
-- completa (qual usuario, qual rota, em que momento exato). error_logs antigo
-- fica intocado aqui, aposentado num passo separado depois.
--
-- fonte='client': capturado pelo app na hora do erro, via registrar_evento_auditoria.
-- fonte='log-puller': puxado depois dos logs nativos do Supabase via Management
-- API, direto na tabela com service_role (nao passa pela funcao).
--
-- Aplicado em dev E public juntos, de proposito -- mesmo motivo do error_logs
-- (migração RPC-everything que ficou so em dev por meses sem ninguem notar).

create table dev.audit_logs (
  id uuid primary key default gen_random_uuid(),
  fonte text not null check (fonte in ('client', 'log-puller')),
  -- rota: pra fonte='client' e a rota de navegacao do front (ex: /hunt/123).
  -- pra fonte='log-puller' e o path do endpoint de API (ex: /rest/v1/rpc/vender_item).
  rota text,
  user_id uuid,
  nivel text not null default 'error',
  mensagem text not null,
  contexto jsonb not null default '{}',
  -- ocorrido_em: momento real do evento -- pro log-puller isso e sobrescrito
  -- com o timestamp real do log, nao o momento do insert.
  ocorrido_em timestamptz not null default now(),
  -- criado_em: momento do insert nessa tabela (auditoria da auditoria).
  criado_em timestamptz not null default now()
);

create index on dev.audit_logs (user_id);
create index on dev.audit_logs (ocorrido_em desc);

create function dev.registrar_evento_auditoria(p_rota text, p_mensagem text, p_nivel text default 'error', p_contexto jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = dev
as $$
begin
  insert into dev.audit_logs (fonte, rota, user_id, nivel, mensagem, contexto, ocorrido_em)
  values ('client', p_rota, auth.uid(), p_nivel, p_mensagem, p_contexto, now());
end;
$$;
grant execute on function dev.registrar_evento_auditoria(text, text, text, jsonb) to authenticated, anon;

alter table dev.audit_logs enable row level security;
create policy "so admin le audit_logs" on dev.audit_logs
  for select to authenticated using (exists (select 1 from dev.admins where user_id = auth.uid()));

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  fonte text not null check (fonte in ('client', 'log-puller')),
  -- rota: pra fonte='client' e a rota de navegacao do front (ex: /hunt/123).
  -- pra fonte='log-puller' e o path do endpoint de API (ex: /rest/v1/rpc/vender_item).
  rota text,
  user_id uuid,
  nivel text not null default 'error',
  mensagem text not null,
  contexto jsonb not null default '{}',
  -- ocorrido_em: momento real do evento -- pro log-puller isso e sobrescrito
  -- com o timestamp real do log, nao o momento do insert.
  ocorrido_em timestamptz not null default now(),
  -- criado_em: momento do insert nessa tabela (auditoria da auditoria).
  criado_em timestamptz not null default now()
);

create index on public.audit_logs (user_id);
create index on public.audit_logs (ocorrido_em desc);

create function public.registrar_evento_auditoria(p_rota text, p_mensagem text, p_nivel text default 'error', p_contexto jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (fonte, rota, user_id, nivel, mensagem, contexto, ocorrido_em)
  values ('client', p_rota, auth.uid(), p_nivel, p_mensagem, p_contexto, now());
end;
$$;
grant execute on function public.registrar_evento_auditoria(text, text, text, jsonb) to authenticated, anon;

alter table public.audit_logs enable row level security;
create policy "so admin le audit_logs" on public.audit_logs
  for select to authenticated using (exists (select 1 from public.admins where user_id = auth.uid()));

-- audit_logs_cursor: estado operacional unico do log-puller, so em public
-- (nao e dado de jogo, nao duplica em dev). RLS enabled, zero policies --
-- bloqueia anon/authenticated por completo, so a Edge Function via
-- service_role toca essa tabela (service_role sempre bypassa RLS).
create table public.audit_logs_cursor (
  id text primary key,
  ultimo_processado timestamptz not null
);

alter table public.audit_logs_cursor enable row level security;

insert into public.audit_logs_cursor (id, ultimo_processado)
values ('log-puller', '2026-08-15T00:00:00Z');
