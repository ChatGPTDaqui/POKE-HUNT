-- A sessao passa a guardar o ESTADO ATUAL do sorteio, nao so a semente de origem.
--
-- O bug que isto corrige: `aplicarFlush` fazia `createRng(sessao.seed)` a cada
-- flush. Como a semente e imutavel e o cliente liquida de 30 em 30 segundos, TODO
-- flush recomecava a mesma sequencia do zero — mesmos inimigos, mesmos niveis,
-- mesmos IVs, mesma raridade, mesmo shiny. O jogador recebia a mesma especie
-- repetida indefinidamente (foi assim que apareceu: "varias copias iguais de uma
-- vez"), e na pratica o jogo inteiro era um loop de 30 segundos.
--
-- `seed` continua existindo e continua IMUTAVEL de proposito: ela e a origem
-- auditavel da sessao ("esta partida nasceu desta semente"). `rng_state` e onde
-- a sequencia esta agora. Misturar as duas na mesma coluna economizaria um
-- campo e perderia a capacidade de reproduzir a sessao desde o comeco.
alter table game_sessions
  -- Mesmo motivo de `seed` ser int8: o estado e um inteiro de 32 bits COM SINAL
  -- no motor (mulberry32, `state | 0`) e o Postgres nao tem uint32.
  add column rng_state bigint not null default 0,
  -- Contador de sorteios. So diagnostico — permite ver quantos numeros uma
  -- sessao ja consumiu sem ter que re-simular.
  add column rng_draws bigint not null default 0;

-- Sessoes que ja existem nunca avancaram o estado (era esse o bug). Comecar do
-- proprio seed as deixa exatamente onde a versao antiga as deixava, e dali em
-- diante a sequencia passa a avancar de verdade.
update game_sessions set rng_state = seed;

alter table game_sessions alter column rng_state drop default;
