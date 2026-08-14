-- Passo 1 da migracao RPC-everything (ver _Architecture.md, poke-hunt):
-- a formula nova de farm offline (flush_sessao, futuro passo #14) projeta
-- ouro/xp/captura/item a partir da taxa medida em perf_stats. Captura e item
-- nunca foram rastreados aqui -- so gold/xp/mobs/shinys.
alter table players
  alter column perf_stats set default '{"gold":0,"xp":0,"mobs":0,"shinys":0,"captures":0,"items":0,"since":0}';

update players
  set perf_stats = perf_stats || '{"captures":0,"items":0}'::jsonb
  where not (perf_stats ? 'captures') or not (perf_stats ? 'items');
