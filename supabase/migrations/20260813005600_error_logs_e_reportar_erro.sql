-- Pagina de admin (captura de erros). Ver _Architecture.md do projeto no vault
-- pro design completo -- resumo: um choke point unico (reportar_erro) que
-- client (hook em pushToast) e servidor (catch nao-tratado da Edge Function)
-- chamam, agrupando por assinatura (md5) em vez de logar cada ocorrencia.
--
-- Aplicado em dev E public juntos, de proposito -- lição do dia (Achado 3,
-- migração RPC-everything que ficou so em dev por meses sem ninguem notar).

create table dev.error_logs (
  id uuid primary key default gen_random_uuid(),
  origem text not null,
  assinatura text not null unique,
  mensagem text not null,
  rota text,
  contexto jsonb,
  ocorrencias int not null default 1,
  primeira_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now()
);

create function dev.reportar_erro(p_origem text, p_rota text, p_mensagem text, p_contexto jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = dev
as $$
declare
  v_assinatura text := md5(p_origem || coalesce(p_rota, '') || p_mensagem);
begin
  insert into dev.error_logs (origem, assinatura, mensagem, rota, contexto)
  values (p_origem, v_assinatura, p_mensagem, p_rota, p_contexto)
  on conflict (assinatura) do update set
    ocorrencias = dev.error_logs.ocorrencias + 1,
    ultima_vez = now(),
    contexto = excluded.contexto;
end;
$$;
grant execute on function dev.reportar_erro(text, text, text, jsonb) to authenticated, anon;

alter table dev.error_logs enable row level security;
create policy "so admin le error_logs" on dev.error_logs
  for select to authenticated using (exists (select 1 from dev.admins where user_id = auth.uid()));

create table public.error_logs (
  id uuid primary key default gen_random_uuid(),
  origem text not null,
  assinatura text not null unique,
  mensagem text not null,
  rota text,
  contexto jsonb,
  ocorrencias int not null default 1,
  primeira_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now()
);

create function public.reportar_erro(p_origem text, p_rota text, p_mensagem text, p_contexto jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assinatura text := md5(p_origem || coalesce(p_rota, '') || p_mensagem);
begin
  insert into public.error_logs (origem, assinatura, mensagem, rota, contexto)
  values (p_origem, v_assinatura, p_mensagem, p_rota, p_contexto)
  on conflict (assinatura) do update set
    ocorrencias = public.error_logs.ocorrencias + 1,
    ultima_vez = now(),
    contexto = excluded.contexto;
end;
$$;
grant execute on function public.reportar_erro(text, text, text, jsonb) to authenticated, anon;

alter table public.error_logs enable row level security;
create policy "so admin le error_logs" on public.error_logs
  for select to authenticated using (exists (select 1 from public.admins where user_id = auth.uid()));
