-- A check `team_slot_required` foi escrita quando `pokemon_location` so tinha
-- dois valores, e enumerou os dois:
--
--   CHECK ( (location = 'team' AND team_slot IS NOT NULL)
--        OR (location = 'bag'  AND team_slot IS NULL) )
--
-- Ou seja: ela nao diz "team precisa de slot", ela diz "location so pode ser
-- team ou bag". Adicionar 'market' ao enum passou; gravar 'market' na coluna
-- estourava a check e o servidor respondia 502 "falha ao falar com o banco" —
-- exatamente o que o smoke do Mercado pegou ao anunciar um POKE.
--
-- Reescrita pra expressar a regra que realmente importa (POKE em campo TEM
-- slot; POKE fora de campo NAO tem), sem repetir a lista de valores do enum.
-- Um valor novo de `pokemon_location` no futuro passa a valer sozinho.
alter table public.pokemon_instances drop constraint if exists team_slot_required;

alter table public.pokemon_instances
  add constraint team_slot_required check (
    case when location = 'team' then team_slot is not null else team_slot is null end
  );
