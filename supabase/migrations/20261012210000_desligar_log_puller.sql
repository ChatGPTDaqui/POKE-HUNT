-- Desliga o agendamento do log-puller (pedido do dono em 12/10/2026).
--
-- O cron `log-puller` chama a Edge Function de mesmo nome a cada 30 minutos, e
-- ela responde 500 em toda execucao: 47 falhas nas 24 h medidas em 12/10, sem
-- nenhum registro novo em audit_logs com fonte='log-puller'. Cada execucao gasta
-- uma invocacao de Edge Function e uma chamada pg_net, e deixa uma linha de erro
-- no historico do pg_cron.
--
-- So o AGENDAMENTO sai. A funcao continua publicada, o codigo continua em
-- supabase/functions/log-puller e os secrets LOG_PULLER_* continuam no projeto:
-- religar e recriar o job (ver 20260823000000_retencao_de_audit_logs_e_cron_mais_espacado.sql)
-- depois de consertar a funcao.
--
-- Condicional: `cron.unschedule` de nome inexistente lanca, e o banco
-- descartavel do check de schema nao tem pg_cron.
--
-- JUNTO, CORRECAO DA 20261012171000: o job `cron-historico-purge` apagava o
-- historico do pg_cron sem `limit`, contra a regra do projeto (PH-126,
-- src/data/remote/retencaoDePurge.test.ts): o cron do Postgres nao tem timeout
-- proprio, e a primeira execucao apagaria ~60 mil linhas numa transacao so. O
-- teste nao pegou porque o comando estava entre aspas simples, e a varredura
-- dele so le `$$...$$`. Agora vai em lotes de 10 mil por dia (entram ~1.150
-- linhas/dia, entao o acumulado some em uma semana) e no formato que o teste le.
begin;

do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'log-puller') then
      perform cron.unschedule('log-puller');
    end if;
    if exists (select 1 from cron.job where jobname = 'cron-historico-purge') then
      perform cron.unschedule('cron-historico-purge');
    end if;
    perform cron.schedule('cron-historico-purge', '37 4 * * *', $$
      delete from cron.job_run_details
      where runid in (
        select runid from cron.job_run_details
        where end_time < now() - interval '7 days'
        limit 10000
      )
    $$);
  end if;
end
$do$;

commit;
