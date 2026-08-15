-- Aposenta o design antigo (dedup por assinatura) -- substituido por
-- audit_logs (migration 20260815010000). Nada mais chama reportar_erro: os
-- 3 pontos de captura do client (errorToastReporting, globalErrorHandlers,
-- ErrorBoundary) ja foram redirecionados pra registrar_evento_auditoria.
-- DROP explicito, decisao do usuario -- perde as linhas antigas de proposito.
drop function if exists dev.reportar_erro(text, text, text, jsonb);
drop table if exists dev.error_logs;

drop function if exists public.reportar_erro(text, text, text, jsonb);
drop table if exists public.error_logs;
