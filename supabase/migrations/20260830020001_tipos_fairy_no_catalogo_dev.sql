-- PH-247 (dado, espelho do schema dev): alinha `species.type1/type2` com o catalogo canonico do jogo.
--
-- O QUE ISTO CONSERTA, EM UMA FRASE: **Clefairy nunca evolui.**
--
-- `evoluir_poke` decide QUAL pedra o jogador precisa gastar assim:
--
--   v_stone_type := coalesce(v_opcao.stone_type, v_species.type1);
--
-- `species_evolution_options.stone_type` so existe pras 6 especies de evolucao
-- RAMIFICADA (Eevee, Gloom, Poliwhirl, Slowpoke, Tyrogue e o par de Gloom) —
-- 14 linhas no total. Pra todo o resto, incluindo Clefairy, o `coalesce` cai em
-- `species.type1`.
--
-- E o cliente pede outra coisa. `PokedexMenu.tsx` monta a exigencia com
-- `stoneName(species.type)`, lendo o catalogo DELE:
--
--   tela:  "Nivel 80 + 40 Pedra de Fada"     (SPECIES.clefairy.type = FAIRY)
--   RPC:   exige `stone_normal`               (species.type1 = NORMAL)
--
-- O jogador farma 40 Pedras de Fada — que a 5% por abate, do tipo do inimigo
-- abatido, sao ~800 abates — e a evolucao continua recusada, apontando pra um
-- item que a tela nunca mandou juntar. Clefairy nasce em 3 sub-biomas, entao
-- isto e alcancavel, nao teorico.
--
-- POR QUE O BANCO ESTAVA ATRASADO
--
-- Sao dois catalogos com origens diferentes. O do cliente
-- (`src/data/generated/pokes.generated.ts`) vem de `scripts/usum/catalog.json`,
-- que e Ultra Sun/Ultra Moon pela PokeAPI e ja tem o retipo de Fairy da Gen VI.
-- O do banco veio da planilha de Gen2, que e anterior ao tipo Fairy existir.
-- `npm run catalog:migrar` esta BLOQUEADO desde entao (`guarda-catalogo-gen2.js`)
-- exatamente pra a planilha nao reescrever o banco — o efeito colateral e que o
-- retipo tambem nunca chegou aqui.
--
-- AS 5 LINHAS, e sao 5 e nao 4: a PH-247 listou quatro porque comparou o banco
-- contra o catalogo do CLIENTE, e `mr__mime` nao esta no elenco do cliente (ver
-- abaixo). Contando contra `catalog.json`, que tem as 251, aparece a quinta.
--
--   clefable    NORMAL/-       -> FAIRY/-
--   clefairy    NORMAL/-       -> FAIRY/-        <- a que quebra a evolucao
--   mr__mime    PSYCHIC/-      -> PSYCHIC/FAIRY
--   togetic     NORMAL/FLYING  -> FAIRY/FLYING
--   wigglytuff  NORMAL/-       -> NORMAL/FAIRY
--
-- Varredura completa das 251 linhas contra `catalog.json`: nao ha uma sexta.
--
-- O QUE ESTA MIGRATION NAO FAZ, DE PROPOSITO: igualar a CONTAGEM (251 no banco,
-- 245 no cliente). Os dois numeros medem coisas diferentes e nao deveriam ser
-- iguais. `dev.species` e o CATALOGO — a dex 1-251 inteira, alvo de FK.
-- `SPECIES_DATA` e o ELENCO — starters + lendarios + quem aparece nas hunts,
-- fechado sob evolucao (`sync-planilha.js#syncSpeciesAndMoves`), e da 245. As 6
-- que sobram (vulpix, ninetales, chansey, blissey, mr__mime, shuckle) nao sao
-- residuo: sao especies do catalogo que nenhuma hunt sorteou. Apagar do banco
-- quebraria FK; forcar no elenco e decisao de game design, nao de correcao de
-- dado.
--
-- IDEMPOTENTE: o `where` exige o valor ANTIGO. Rodar de novo nao acha linha e
-- nao faz nada; e se alguem ja tiver corrigido a mao, tambem nao sobrescreve.
update dev.species set type1 = 'FAIRY'
  where id in ('clefairy', 'clefable') and type1 = 'NORMAL' and type2 is null;

update dev.species set type1 = 'FAIRY'
  where id = 'togetic' and type1 = 'NORMAL' and type2 = 'FLYING';

update dev.species set type2 = 'FAIRY'
  where id = 'mr__mime' and type1 = 'PSYCHIC' and type2 is null;

update dev.species set type2 = 'FAIRY'
  where id = 'wigglytuff' and type1 = 'NORMAL' and type2 is null;
