-- Copia dado de public pra dev, respeitando ordem de FK.
-- Usa jsonb_populate_record em vez de "select *" porque os enums foram
-- clonados como tipos novos em dev (dev.element_type != public.element_type,
-- mesmo nome, OID diferente) -- o round-trip por texto ignora esse mismatch.
-- species tem FK auto-referente (evolucao) -- trigger desligado soh nesse insert
-- pra nao exigir ordem topologica dentro da propria tabela.
begin;

create or replace function pg_temp.copy_table(src regclass, dst regclass) returns void as $$
declare
  dst_type text := dst::text;
begin
  execute format(
    'insert into %s select (jsonb_populate_record(null::%s, to_jsonb(t))).* from %s t',
    dst, dst, src
  );
end;
$$ language plpgsql;

-- limpa dev antes de repopular (idempotente, evita duplicata de roda anterior parcial)
truncate
  dev.spawn_tiers, dev.moves, dev.maps, dev.locations, dev.items,
  dev.species, dev.species_moves, dev.map_encounters, dev.location_encounters, dev.fishing_encounters,
  dev.players, dev.admins, dev.admin_actions,
  dev.pokemon_instances, dev.player_items, dev.player_pokedex, dev.player_auto_catch_rules,
  dev.hall_da_fama, dev.game_sessions, dev.market_orders, dev.market_listings, dev.market_trades,
  dev.market_deliveries, dev.chat_messages, dev.mail_messages, dev.friendships, dev.market_offers
  restart identity cascade;

-- tier 0: catalogo sem dependencia
select pg_temp.copy_table('public.spawn_tiers', 'dev.spawn_tiers');
select pg_temp.copy_table('public.moves', 'dev.moves');
select pg_temp.copy_table('public.maps', 'dev.maps');
select pg_temp.copy_table('public.locations', 'dev.locations');
select pg_temp.copy_table('public.items', 'dev.items');

-- species: auto-referente, desliga checagem de FK da sessao soh pro copy
set local session_replication_role = replica;
select pg_temp.copy_table('public.species', 'dev.species');
set local session_replication_role = default;

-- tier 2: depende de species/catalogo
select pg_temp.copy_table('public.species_moves', 'dev.species_moves');
select pg_temp.copy_table('public.map_encounters', 'dev.map_encounters');
select pg_temp.copy_table('public.location_encounters', 'dev.location_encounters');
select pg_temp.copy_table('public.fishing_encounters', 'dev.fishing_encounters');

-- players ja copiado antes (idempotente com on conflict)
select pg_temp.copy_table('public.players', 'dev.players');

-- admins/admin_actions ligados a auth.users, nao a players
select pg_temp.copy_table('public.admins', 'dev.admins');
select pg_temp.copy_table('public.admin_actions', 'dev.admin_actions');

-- tier 4: dados de jogador (dependem de players + species/items)
select pg_temp.copy_table('public.pokemon_instances', 'dev.pokemon_instances');
select pg_temp.copy_table('public.player_items', 'dev.player_items');
select pg_temp.copy_table('public.player_pokedex', 'dev.player_pokedex');
select pg_temp.copy_table('public.player_auto_catch_rules', 'dev.player_auto_catch_rules');
select pg_temp.copy_table('public.hall_da_fama', 'dev.hall_da_fama');
select pg_temp.copy_table('public.game_sessions', 'dev.game_sessions');
select pg_temp.copy_table('public.market_orders', 'dev.market_orders');
select pg_temp.copy_table('public.market_listings', 'dev.market_listings');
select pg_temp.copy_table('public.market_trades', 'dev.market_trades');
select pg_temp.copy_table('public.market_deliveries', 'dev.market_deliveries');
select pg_temp.copy_table('public.chat_messages', 'dev.chat_messages');
select pg_temp.copy_table('public.mail_messages', 'dev.mail_messages');
select pg_temp.copy_table('public.friendships', 'dev.friendships');

-- tier 5
select pg_temp.copy_table('public.market_offers', 'dev.market_offers');

commit;
