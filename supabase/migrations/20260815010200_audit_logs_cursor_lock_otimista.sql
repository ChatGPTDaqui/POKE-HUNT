-- Lock otimista com timeout pro log-puller: como a Edge Function e stateless
-- (sem conexao persistente), pg_advisory_lock nao serve (e escopado por sessao,
-- morre a cada request). Em vez disso, UPDATE condicional na propria linha do
-- cursor: so avanca quem conseguir marcar `processando_desde`, e uma execucao
-- travada/crashada destrava sozinha depois de 2 minutos.
alter table public.audit_logs_cursor
  add column processando_desde timestamptz;
