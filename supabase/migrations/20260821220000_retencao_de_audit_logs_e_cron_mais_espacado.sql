-- Retencao de `audit_logs` + log-puller menos frequente
-- ---------------------------------------------------------------------------
-- Este e o UNICO custo de Supabase que existe com zero jogador online, e ele
-- tinha os dois problemas somados:
--
--  1. `audit_logs` nascia sem purge nenhum (conferido em 20260815010000,
--     20260815010200 e 20260815010400). Contra os 500 MB do plano Free, uma
--     tabela que so cresce e a que domina o banco no longo prazo — o catalogo e
--     grande, mas finito.
--  2. O cron `log-puller` rodava de 5 em 5 minutos: 288 invocacoes de Edge
--     Function por dia, 8.640 por mes, independente de atividade. E cada
--     invocacao escreve em `audit_logs`, realimentando o item 1.
--
-- RETENCAO DE 30 DIAS, e por `ocorrido_em` (nao `criado_em`): retencao e uma
-- pergunta sobre QUANDO o evento aconteceu, nao sobre quando o puller o
-- ingeriu. `ocorrido_em desc` tambem e o unico dos dois com indice, entao o
-- delete usa indice em vez de varrer a tabela.
--
-- POR QUE O DELETE E EM LOTE: sem o `limit`, um primeiro purge numa tabela que
-- acumulou meses viraria uma transacao gigante — e o cron do Postgres nao tem
-- timeout proprio, ele simplesmente segura a conexao. Em lote de 10 mil, o job
-- roda de hora em hora e a fila drena sozinha; em regime, cada execucao apaga
-- pouca coisa e sai.
--
-- O log-puller vai de 5 pra 30 minutos. Log de auditoria nao tem consumidor com
-- requisito de latencia: quem investiga incidente pode disparar a funcao a mao.
-- `unschedule` antes de `schedule` porque nome de job e unico e o historico
-- desta area ja mordeu uma vez — a migracao de projeto de 2026-08-20 reagendou
-- o job com a URL antiga e ele passou um dia batendo num projeto morto, em
-- silencio (ver 20260821200000).

-- `if exists` no unschedule: em banco novo o job ainda nao existe, e
-- `cron.unschedule` de nome inexistente LANCA — derrubaria a migration inteira.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'log-puller') then
    perform cron.unschedule('log-puller');
  end if;
  if exists (select 1 from cron.job where jobname = 'audit-logs-purge') then
    perform cron.unschedule('audit-logs-purge');
  end if;
end
$$;

select cron.schedule(
  'log-puller',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://uogmhqbyjgafjujbqdty.supabase.co/functions/v1/log-puller',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'log_puller_service_role_key'
        limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'audit-logs-purge',
  '23 * * * *',
  $$
  delete from public.audit_logs
  where id in (
    select id from public.audit_logs
    where ocorrido_em < now() - interval '30 days'
    order by ocorrido_em
    limit 10000
  );
  $$
);
