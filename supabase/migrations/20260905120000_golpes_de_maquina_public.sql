-- PH-512 (schema public): `pokemon_instances.golpes_de_maquina` — os golpes que
-- ESTE POKE aprendeu por TM/HM.
--
-- ===========================================================================
-- POR QUE UMA COLUNA PROPRIA, E NAO SOMAR EM `unlocked_abilities`
-- ===========================================================================
-- Duas razoes independentes, e cada uma sozinha ja bastaria.
--
-- 1. A ORIGEM E DADO DE PRODUTO. Golpe aprendido por maquina aparece em COR
--    DIFERENTE na lista de golpes do POKE (decisao do dono, 05/09). Sem saber
--    de onde o golpe veio, nao ha o que pintar. Uma lista unica de "golpes
--    conhecidos" perde exatamente a informacao que a tela precisa.
--
-- 2. `unlocked_abilities` E DERIVADA, E REESCRITA A CADA FLUSH.
--    `playerMapper.ts#pokeToRow` grava nela o resultado de
--    `golpesAprendidosAte(especie, nivel)`, entao qualquer coisa acrescentada
--    ali some no flush seguinte. Somar o golpe de maquina naquela coluna
--    exigiria torna-la monotonica (nunca apagar), e ai um golpe que a especie
--    deixasse de aprender — por resync de catalogo — ficaria preso pra sempre,
--    sem caminho de conserto. Esta coluna e a fonte, aquela continua derivada.
--
-- ===========================================================================
-- `text[]` E NAO `jsonb`
-- ===========================================================================
-- A pergunta que o servidor faz e sempre "este id ja esta na lista?", que em
-- array e `v_move = any(...)` e em jsonb seria `? operator` com cast. Array
-- tambem torna o append idempotente barato (`array_append` guardado por
-- `where v_move <> all(coalesce(golpes_de_maquina, '{}'))`), que e o que
-- protege contra o retry sem chave de request de `executarAcaoRpc`.
--
-- `not null default '{}'`: linha antiga volta com o array vazio, entao NAO ha
-- migracao de dado a fazer e nao ha caso de `null` pra tratar no cliente. O
-- `coalesce` nas RPCs futuras e cinto de seguranca, nao necessidade.
--
-- ===========================================================================
-- SEM INDICE, DE PROPOSITO
-- ===========================================================================
-- A coluna e lida junto da linha do POKE e nunca e criterio de filtro: nao
-- existe "me traga os POKEs que sabem Earthquake". Indice aqui so custaria
-- escrita num caminho que ja e quente (`pokemon_instances` e reescrita a cada
-- flush).
--
-- ===========================================================================
-- ESTA MIGRATION VAI SOZINHA NA PR, E ISSO E O FLUXO, NAO DESCUIDO
-- ===========================================================================
-- `src/lib/database.types.ts` e gerado a partir do schema REMOTO. Enquanto esta
-- coluna nao estiver aplicada la, regenerar o arquivo reprova o proprio gate
-- (`supabase-check.yml` compara os tipos commitados contra o remoto). O caminho
-- que funciona neste projeto e o de tres passos: (1) esta PR, so migration;
-- (2) merge em `dev` aplica, e o job `tipos` reprova de proposito dizendo pra
-- rodar `npm run db:types` numa PR de chore; (3) PR curta com o arquivo, baixado
-- do artefato do proprio job. So depois disso o cliente pode SELECIONAR a
-- coluna — pedir uma coluna que nao existe faz o PostgREST recusar a leitura
-- INTEIRA do POKE, o que trocaria "golpe de maquina nao aparece" por "nenhum
-- POKE carrega".
begin;

alter table public.pokemon_instances
  add column if not exists golpes_de_maquina text[] not null default '{}';

comment on column public.pokemon_instances.golpes_de_maquina is
  'Ids de golpe que este POKE aprendeu por TM/HM (PH-512). Fonte, nao derivada: '
  'ao contrario de unlocked_abilities, que pokeToRow reescreve a cada flush a '
  'partir de (especie, nivel). Guarda a ORIGEM, que e o que permite mostrar o '
  'golpe em cor diferente na lista. So a RPC de ensinar escreve aqui.';

commit;
