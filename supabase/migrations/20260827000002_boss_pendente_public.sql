-- PH-201: estado de boss pendente em game_sessions. Nullable — sem boss ativo = tudo
-- null. Mesmo padrao de coluna-por-IV que pokemon_instances ja usa (iv_hp, iv_atk_fis,
-- ...), nao jsonb, pra manter consistencia com o resto do schema.
alter table public.game_sessions
  add column boss_uid uuid null,
  add column boss_species_id text null,
  add column boss_iv_hp smallint null,
  add column boss_iv_atk_fis smallint null,
  add column boss_iv_atk_esp smallint null,
  add column boss_iv_def smallint null,
  add column boss_iv_def_esp smallint null,
  add column boss_iv_speed smallint null,
  add column boss_hp_atual integer null;
