-- PH-202/204: espelho de 20260827010000_boss_aparencia_public.sql pro schema dev.
alter table dev.game_sessions
  add column boss_level integer null,
  add column boss_encounter_id text null,
  add column boss_rarity text null,
  add column boss_is_shiny boolean null,
  add column boss_nature text null,
  add column boss_trait text null;
