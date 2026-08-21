-- Realtime em PRODUCAO: publica `public.chat_messages` e `public.mail_messages`
-- ---------------------------------------------------------------------------
-- A migration que ligou Realtime (20260812001015) publicou SO as tabelas de
-- `dev` — o comentario dela diz isso em voz alta ("publication nao tinha
-- NENHUMA tabela do schema dev ainda") e as duas linhas param ali. As de
-- `public` nunca entraram.
--
-- Efeito em producao, que ninguem viu porque o ambiente de teste roda em `dev`:
-- chat mundial so aparecia recarregando a tela, e o correio dependia do poll de
-- 60s de `usePendencias`. O painel de Usage confirma: Realtime Messages em 0.
--
-- O outro lado do mesmo bug e no cliente (`schema: 'dev'` escrito a mao no
-- filtro de `postgres_changes`), corrigido nesta mesma leva — os dois tinham
-- que ser consertados juntos, porque cada um sozinho continua entregando zero
-- evento.
--
-- IDEMPOTENTE de proposito: `alter publication ... add table` de uma tabela que
-- ja e membro LANCA erro, e este arquivo vai rodar em banco que ja tem as de
-- dev publicadas.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mail_messages'
  ) then
    alter publication supabase_realtime add table public.mail_messages;
  end if;
end
$$;
