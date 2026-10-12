-- Limpeza de banco (12/10/2026). Um arquivo so porque as duas partes valem para
-- o projeto inteiro: o historico do pg_cron e global, e a sobrecarga existe
-- igual nos dois schemas (removida explicitamente em `public` e em `dev`).
begin;

-- 1. HISTORICO DO PG_CRON SEM LIMITE.
--
-- `cron.job_run_details` guarda uma linha por execucao de cada job e nunca
-- apaga nada. Com 16 jobs (alguns a cada 5 minutos) ela chegou a 60.864 linhas
-- e 14 MB em 53 dias, e e a maior tabela do banco. Sete dias bastam pra
-- investigar um job que falhou.
--
-- Dentro de um DO condicionado ao pg_cron: o banco descartavel do check de
-- schema (scripts/ci/schema-sandbox.sh) nao tem a extensao, e o projeto tem.
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'cron-historico-purge',
      '37 4 * * *',
      $delete from cron.job_run_details where end_time < now() - interval '7 days'$
    );
  end if;
end
$do$;

-- 2. SOBRECARGA ANTIGA DE gravar_flush_de_sessao.
--
-- A migration 20260830040000 (sequence_hp) criou a versao de 13 argumentos com
-- `p_sequence_hp` mas deixou a de 12 no banco. O servidor de sessoes sempre
-- manda `p_sequence_hp` (authority/src/progresso.ts), entao a de 12 nao tem
-- chamador — e duas sobrecargas com quase a mesma assinatura deixam o PostgREST
-- escolher por nome de argumento, o que vira ambiguidade no dia em que um
-- argumento ficar opcional.
drop function if exists public.gravar_flush_de_sessao(uuid, numeric, bigint, bigint, uuid, integer, boolean, integer, text, integer, integer, jsonb);
drop function if exists dev.gravar_flush_de_sessao(uuid, numeric, bigint, bigint, uuid, integer, boolean, integer, text, integer, integer, jsonb);

commit;
