-- O golpe desligado a mao (duplo clique no slot) passa a ser PERSISTIDO.
--
-- BUG REAL, e a metade mais funda dele: `pokemon_instances` nunca teve coluna
-- pra `disabledAbilities`. O campo existe no POKE em memoria e o combate o
-- respeita (`combatSystem#pickAbility` filtra por ele), mas `pokeToRow` nao o
-- gravava e `rowToPoke` nao o lia — entao a escolha do jogador morria no
-- primeiro carregamento, mesmo quando a acao chegava ao servidor.
--
-- Sem esta coluna, ligar a acao `alternarHabilidade` na tela consertaria so o
-- sintoma de curto prazo (o estado voltando sozinho em 30s) e a configuracao
-- continuaria sumindo a cada login.
--
-- `jsonb` e nao `text[]` porque a forma em memoria e um MAPA
-- (`{ [abilityId]: true }`), nao uma lista: gravar como array exigiria
-- converter nos dois sentidos e abriria espaco pra duplicata.
alter table public.pokemon_instances
  add column if not exists disabled_abilities jsonb not null default '{}'::jsonb;
