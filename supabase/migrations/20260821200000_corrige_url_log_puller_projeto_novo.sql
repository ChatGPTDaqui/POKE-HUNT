-- Migracao de projeto Supabase em 2026-08-20 (cffbihbmhiuudahsgjsn ->
-- uogmhqbyjgafjujbqdty, motivo: matar a service_role key vazada de 13/08)
-- recriou o schema via `db push`, o que reagendou este cron com a URL antiga
-- ainda hardcoded (job "log-puller" rodando a cada 5min contra o projeto
-- MORTO desde entao, silenciosamente). Reagenda com a URL certa.
--
-- Mesma regra da migration original (20260815010300): a service_role key
-- NUNCA entra aqui em texto puro. Passo manual necessario ANTES desta
-- migration fazer efeito de verdade (senao o Authorization resolve vazio):
--   select vault.create_secret('<service_role key do projeto NOVO>', 'log_puller_service_role_key');
-- rodado uma vez via SQL Editor do Dashboard ou `supabase db query --linked`
-- (nunca via migration versionada).
select cron.unschedule('log-puller');

select cron.schedule(
  'log-puller',
  '*/5 * * * *',
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
