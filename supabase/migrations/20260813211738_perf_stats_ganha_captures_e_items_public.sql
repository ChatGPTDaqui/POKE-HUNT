-- Porta pra public a migration 20260811201846 (so tinha rodado em dev).
alter table public.players
  alter column perf_stats set default '{"gold":0,"xp":0,"mobs":0,"shinys":0,"captures":0,"items":0,"since":0}';

update public.players
  set perf_stats = perf_stats || '{"captures":0,"items":0}'::jsonb
  where not (perf_stats ? 'captures') or not (perf_stats ? 'items');
