-- FIX: mais duas tabelas criadas sem GRANT (mesmo defeito de
-- 20260810000000_grant_game_sessions.sql).
--
-- spawn_tiers (20260806233000): catalogo publico como species/moves/etc, mas
-- ficou de fora do bloco de GRANT da secao 8 do initial_schema.sql -- essa
-- tabela nasceu depois. generate-catalog.js le com service_role e client le
-- com anon/authenticated; sem GRANT os dois morrem com 42501.
grant select on spawn_tiers to anon, authenticated;
grant select, insert, update, delete on spawn_tiers to service_role;

-- market_offers (20260809160000): mesma postura das outras tabelas de mercado
-- (20260808201000) -- RLS ligada, zero policy, so service_role toca. Migration
-- que criou a tabela esqueceu o GRANT que as demais do mercado tem.
grant select, insert, update, delete on public.market_offers to service_role;
