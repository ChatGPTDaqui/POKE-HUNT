-- Par `_dev` do 20260821230000.
--
-- As tabelas de `dev` JA estao publicadas desde 20260812001015 — este arquivo
-- existe por duas razoes:
--
--  1. O gate de CI (`supabase-check.yml`) reprova migration que mexe em um
--     schema sem mexer no par. A convencao vale mesmo quando um dos lados e
--     no-op.
--  2. Banco NOVO (clone, ambiente de outro dev) roda as duas migrations em
--     ordem e nao ha garantia de que a de 2026-08-12 tenha sido aplicada com o
--     schema `dev` existindo — a guarda abaixo torna o estado final o mesmo nos
--     dois caminhos.
--
-- Mesma guarda de idempotencia do par: `add table` de tabela ja publicada
-- LANCA.
do $mig$
begin
  if not exists (select 1 from pg_namespace where nspname = 'dev') then
    raise notice 'schema dev ausente — nada a publicar';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'dev' and tablename = 'chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table dev.chat_messages';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'dev' and tablename = 'mail_messages'
  ) then
    execute 'alter publication supabase_realtime add table dev.mail_messages';
  end if;
end
$mig$;
