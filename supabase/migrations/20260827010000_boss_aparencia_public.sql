-- PH-202/204: reconstruir o boss fielmente entre janelas de flush exige mais
-- que uid/species/ivs/hp (PH-201) — rarity/isShiny/nature/trait sao SORTEADOS
-- por createPokeInstance e nao tem parametro pra "recriar sem rolar de novo"
-- em todos os casos (shiny e trait sempre consomem RNG). Sem persistir isso,
-- cada reconstrucao de mundo (a cada flush, ~30s) sortearia um boss com
-- aparencia/stats DIFERENTES e desalinharia o RNG entre client e servidor.
--
-- boss_level: nao e re-derivavel com seguranca. A regra "nivel = teto da
-- janela/sala" so bate com o boss original enquanto ninguem mudar essa regra
-- — um boss ja em campo, persistido sem o proprio nivel, mudaria de nivel
-- sozinho no meio da luta se a regra for rebalanceada depois (achado do
-- pente fino, 26/08).
alter table public.game_sessions
  add column boss_level integer null,
  add column boss_encounter_id text null,
  add column boss_rarity text null,
  add column boss_is_shiny boolean null,
  add column boss_nature text null,
  add column boss_trait text null;
