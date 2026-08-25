-- RE-DATADA DE 20260821220000/01 PARA 20260823000000/01 EM 2026-08-23 (PH-88).
-- O conteudo e de 21/08 e nao mudou; so o timestamp do arquivo mudou.
--
-- Motivo: estas duas nunca chegaram a ser registradas no banco, enquanto as
-- migrations de 22/08 (timestamp maior) foram aplicadas fora do workflow. Dai
-- em diante `supabase db push` passou a recusar TODO deploy da dev com
-- "Found local migration files to be inserted before the last migration on
-- remote database", e nenhuma migration nova chegava mais ao banco — o merge
-- ficava verde e so o workflow de deploy, que ninguem olha, ficava vermelho.
--
-- Re-datar faz o push normal aplica-las em ordem, sem `--include-all` fixo no
-- workflow (que trocaria uma falha ruidosa por aplicacao silenciosa fora de
-- ordem) e sem `migration repair --status reverted` (que marcaria como
-- revertida migration de fato aplicada). Seguro aqui porque as duas so fazem
-- `cron.unschedule` condicional + `cron.schedule`: idempotentes, e sem
-- dependencia de nada criado em 22/08 (`audit_logs` existe desde 15/08).
--
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
