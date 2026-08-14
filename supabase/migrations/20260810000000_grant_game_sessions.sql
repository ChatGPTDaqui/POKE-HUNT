-- FIX: game_sessions (20260807003000) nunca recebeu GRANT. RLS + policy de
-- select pro dono cobrem authenticated, mas sem GRANT de tabela a policy nunca
-- roda. E service_role (BYPASSRLS) tambem precisa de GRANT proprio -- BYPASSRLS
-- nao substitui privilegio de tabela (mesmo erro ja corrigido nas demais
-- tabelas em initial_schema.sql secao 8). Sem isto toda leitura/escrita do
-- servidor de autoridade em game_sessions morre com 42501.
grant select on game_sessions to authenticated;
grant select, insert, update, delete on game_sessions to service_role;
