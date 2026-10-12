-- Fase 2 do Realtime por Broadcast (fase 1: 20261012180000).
--
-- O cliente publicado em producao em 12/10/2026 (release 8.10, PR #919) ja
-- assina chat, correio, PvP e troca por Broadcast privado, e nenhum codigo
-- assina mais `postgres_changes`. Enquanto estas tabelas ficarem na publicacao
-- `supabase_realtime`, qualquer aba antiga que ainda assine postgres_changes
-- mantem o Realtime consultando o slot de replicacao por SQL
-- (`realtime.list_changes`) — a consulta mais cara do banco antes disto (4,4 M
-- chamadas, ~7,5 h de CPU em 53 dias). Tirar as tabelas da publicacao encerra
-- esse caminho de vez.
--
-- Aba aberta antes da 8.10 perde o ao vivo dessas telas ate recarregar; nenhum
-- dado se perde, as leituras continuam iguais.
--
-- `pvp_rank` estava publicada sem nenhum assinante no cliente.
--
-- Um arquivo so: a publicacao e uma so pro projeto, e as tabelas dos dois
-- schemas saem explicitamente. Cada remocao e condicionada a tabela ainda estar
-- publicada, pra a migration rodar tambem no banco descartavel do check.
begin;

do $$
declare
  alvo record;
begin
  for alvo in
    select schemaname, tablename
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname in ('public', 'dev')
      and tablename in ('chat_messages', 'mail_messages', 'pvp_sessao', 'pvp_historico', 'pvp_rank', 'troca_sessao')
  loop
    execute format('alter publication supabase_realtime drop table %I.%I', alvo.schemaname, alvo.tablename);
  end loop;
end
$$;

commit;
