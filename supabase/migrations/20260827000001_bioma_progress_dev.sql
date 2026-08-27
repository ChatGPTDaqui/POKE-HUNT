-- PH-200: espelho de 20260827000000_bioma_progress_public.sql pro schema dev.
alter table dev.players
  add column bioma_progress jsonb not null default '{"faixa1": 0, "faixa2": 0, "faixa3": 0}'::jsonb;
