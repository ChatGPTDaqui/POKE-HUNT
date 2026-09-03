-- PH-447 (schema public): reescreve `players.unlocked_continents` pro
-- vocabulario de hoje — acrescenta 'biomas', descarta as faixas e 'johto',
-- preserva 'nightmare'.
--
-- O QUE ESTA MIGRATION CONSERTA. A PH-434 renomeou o grupo de gate que nasce
-- aberto: `GRUPOS_INICIAIS` era ['faixa1','faixa2'] e virou ['biomas'], e toda
-- hunt passou a declarar `continent = 'biomas'`. Nenhuma migration acompanhou a
-- coluna. Medido em producao em 02/09, depois da promocao do redesenho:
--
--   ["faixa1","faixa2"]                            5 linhas
--   ["faixa1","faixa2","faixa3","nightmare"]       3 linhas
--
-- Nenhuma das 8 continha 'biomas'. O gate de continente pergunta exatamente
-- isso — `unlocked_continents @> grupo` — nas duas pontas (o servidor em
-- authority/src/appSessao.ts, o cliente em features/hunt/HuntMenu.tsx), e
-- reprovou TODAS: a Rota 46 inicial, que nunca teve gate nenhum, e o estagio 1
-- de todos os 12 biomas. O jogo inteiro respondeu "Derrote o Campeao Lance
-- antes de acessar Mundo", com deploy verde e 2977 testes passando.
--
-- ELA NAO E A CORRECAO SOZINHA, E ISSO E DE PROPOSITO. O conserto de verdade e
-- no codigo: `grupoLiberado` (src/data/biomas.ts) passou a liberar o grupo
-- inicial POR DEFINICAO, em vez de perguntar se a coluna o contem — porque o
-- grupo que nasce aberto nunca pode estar fechado, e amarrar essa resposta a
-- uma coluna escrita por saves antigos e o que produziu o incidente. Esta
-- migration existe pelo outro motivo: sem ela as 8 linhas ficam com dado morto
-- ('faixa1' e amigos, que nenhuma hunt usa mais) ate o proximo flush de cada
-- jogador, e "ate o proximo flush" pode ser nunca pra quem parou de jogar.
--
-- ESPELHA A TRADUCAO DO CLIENTE, `traduzirGruposLiberados` em
-- src/data/biomas.ts, regra por regra:
--
--   'kanto'                    -> o que o Lance libera hoje ('nightmare')
--   'johto', 'faixa1..3'       -> descartados
--   'nightmare'                -> preservado (foi conquistado)
--   GRUPOS_INICIAIS ('biomas') -> entra SEMPRE
--
-- POR QUE 'kanto' VIRA 'nightmare' E 'faixa3' NAO. Os dois eram concedidos
-- juntos pela vitoria sobre o Lance, entao quem tem 'faixa3' ja tem
-- 'nightmare' na lista e o Pesadelo sobrevive por conta propria. Traduzir
-- 'faixa3' daria o Pesadelo de graca a quem nunca venceu o Lance — o mesmo bug
-- que a migration 20260814140000 e a nota de GRUPOS_LEGADOS descrevem. 'kanto'
-- e diferente: ele era o unico marcador daquela conquista no esquema mais
-- antigo, e descartar apagaria o premio.
--
-- IDEMPOTENTE. O `where` so casa linha que ainda precisa de conserto (sem
-- 'biomas', ou com algum grupo legado). Ao fim desta migration nenhuma linha
-- casa, e rodar de novo nao acha nada. Rodar sobre linha ja limpa tambem seria
-- seguro: a expressao devolveria a mesma lista.
update public.players p
set unlocked_continents = (
  select array_agg(distinct g order by g)
  from unnest(
    -- 'biomas' entra sempre; o resto vem da linha, com 'kanto' ja traduzido.
    array['biomas']::text[]
    || array(
      select case when c = 'kanto' then 'nightmare' else c end
      from unnest(coalesce(p.unlocked_continents, array[]::text[])) as c
      where c not in ('johto', 'faixa1', 'faixa2', 'faixa3')
    )
  ) as g
)
where p.unlocked_continents is null
   or not (p.unlocked_continents @> array['biomas']::text[])
   or p.unlocked_continents && array['johto', 'kanto', 'faixa1', 'faixa2', 'faixa3']::text[];
