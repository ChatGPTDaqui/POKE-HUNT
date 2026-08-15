-- Agenda o log-puller a cada 5 minutos via pg_cron + pg_net. A service_role
-- key NAO entra aqui em texto puro (isso vazaria pra sempre no historico de
-- git da migration, mesma licao do incidente de 13/08 -- ver _Architecture.md)
-- -- ela e lida em runtime de dentro do Vault (supabase_vault, ja habilitado
-- no projeto). Passo manual necessario ANTES desse cron rodar de verdade:
--   select vault.create_secret('<service_role key aqui>', 'log_puller_service_role_key');
-- rodado uma vez via SQL Editor do Dashboard (nunca via migration versionada).
select cron.schedule(
  'log-puller',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://cffbihbmhiuudahsgjsn.supabase.co/functions/v1/log-puller',
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
