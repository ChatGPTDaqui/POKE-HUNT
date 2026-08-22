-- Espelho do 20260821220000 no schema `dev`.
--
-- So a RETENCAO tem espelho. O log-puller nao: ele e um job unico e global (o
-- cron vive no schema `cron`, nao por schema de dado), e a Edge Function que ele
-- chama escreve no schema que ela mesma decide — reagendar duas vezes so
-- duplicaria invocacao, que e exatamente o custo que a leva existe pra cortar.
--
-- `dev.audit_logs` cresce muito menos que a de producao, mas cresce pelo mesmo
-- mecanismo, e as duas dividem os mesmos 500 MB de banco do plano Free.
--
-- Guardado por `if exists`: ambiente novo nasce sem o schema `dev`.
do $mig$
begin
  if not exists (select 1 from pg_namespace where nspname = 'dev') then
    raise notice 'schema dev ausente — nada a espelhar';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'audit-logs-purge-dev') then
    perform cron.unschedule('audit-logs-purge-dev');
  end if;

  -- Meia hora depois do job de `public` pra os dois nao competirem pela mesma
  -- janela de conexao do pg_cron.
  perform cron.schedule(
    'audit-logs-purge-dev',
    '53 * * * *',
    $$
    delete from dev.audit_logs
    where id in (
      select id from dev.audit_logs
      where ocorrido_em < now() - interval '30 days'
      order by ocorrido_em
      limit 10000
    );
    $$
  );
end
$mig$;
