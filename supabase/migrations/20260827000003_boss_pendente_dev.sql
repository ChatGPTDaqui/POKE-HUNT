-- PH-201: espelho de 20260827000002_boss_pendente_public.sql pro schema dev.
alter table dev.game_sessions
  add column boss_uid uuid null,
  add column boss_species_id text null,
  add column boss_iv_hp smallint null,
  add column boss_iv_atk_fis smallint null,
  add column boss_iv_atk_esp smallint null,
  add column boss_iv_def smallint null,
  add column boss_iv_def_esp smallint null,
  add column boss_iv_speed smallint null,
  add column boss_hp_atual integer null;
