# 06 — Mundo, hunts e spawn

## Como uma hunt é montada

Três camadas empilhadas, cada uma resolvendo um problema que a anterior não resolvia:

```
1. TIPO ELEMENTAL define o BIOMA        (scripts/sync-planilha.js#TYPE_BIOME_PLAN)
2. REGIÃO separa o elenco               (src/data/regions.ts)
3. FORÇA define em que ZONA cada um cabe (src/data/spawnStrength.ts)
```

O resultado final é montado em `src/data/huntSpawnOverrides.ts`, em runtime.

## Camada 1 — um tipo elemental, um bioma

Antes, sete biomas "empacotados" de 2 a 3 tipos cada (`Sombrio` = GHOST + DARK + POISON) eram
rotacionados por `BIOME_ORDER[(seed*2) % 7]`, e cada faixa de 10 níveis só testava contra os
dois biomas sorteados para ela.

**Duas falhas somadas, e a segunda apagava espécies do jogo:**

1. `allSpeciesKeys` (a lista final de espécies sincronizadas) vinha das hunts **depois** do
   corte por bioma. Espécie cujo bioma não batesse com a única faixa em que estava listada
   não ficava só sem spawn — **desaparecia inteira**. Medido: DRATINI, DRAGONAIR e DRAGONITE
   não existiam em `pokes.generated`; só 137 das ~226 espécies esperadas estavam
   sincronizadas.
2. Tipo populoso empacotado com tipo raro fazia o preenchimento esgotar as vagas no maior
   antes do menor: `Mistico` sempre enchia com PSYCHIC (13 espécies, Pokedex baixo) antes de
   DRAGON (3 espécies, Pokedex alto) ganhar uma vaga.

Hoje: `TYPE_BIOME_PLAN` é uma **tabela explícita e auditável**, não rotação por aritmética
modular — que era a causa raiz.

Os 17 tipos reais deste dataset Gen 2 (não existe Fada/Fairy, que é da Gen 6; a lista de "18
tipos" do pedido original foi conferida contra a planilha e ajustada, sem inventar tabela de
tipos para tipo inexistente):

| Grupo | Biomas |
|---|---|
| Natureza | Floresta (GRASS), Bosque (BUG), Costa + Profundezas (WATER, ×2), Geleira (ICE) |
| Físico | Planície (NORMAL), Dojo (FIGHTING), Penhascos (FLYING), Deserto (GROUND), Caverna (ROCK), Fábrica (STEEL) |
| Místico | Vulcânico (FIRE), Usina (ELECTRIC), Torre Mística (PSYCHIC), Cemitério (GHOST), Covil Sombrio (DARK), Pântano (POISON), Ruínas Ancestrais (DRAGON) |

WATER ganhou a vaga extra (Costa cedo, Profundezas no fim) por ser disparado o tipo mais
populoso do elenco com arte (40 espécies). As duas metades saem por `baseExp` ascendente, não
aleatório.

### Tipo com poucos membros ganha reforço por tipagem dupla

`MIN_TYPE_POOL = 4`. Abaixo disso, o pool é reforçado com espécies cuja tipagem
**secundária** bate o tipo (Magnemite e Scizor reforçam Fábrica/STEEL sendo ELECTRIC/BUG
primário).

Caso extremo: **FLYING não tem nenhuma espécie com tipo primário Voador neste dataset.** É
fato real — nenhum Pokémon de Gen 1/2 tem Flying como tipo 1. Penhascos existe inteiramente
via tipagem secundária (Pidgey, Zubat, Charizard, Dodrio…), com 31 candidatos cortados em 16
por `TYPE2_FALLBACK_CAP`.

A duplicação (mesma espécie na hunt do tipo primário e numa de reforço do secundário) é
intencional e é a única forma de Penhascos, Fábrica e Ruínas Ancestrais terem população que
valha a visita.

### População vem do elenco real, não de listas escritas por faixa

`buildTypeRoster()` varre a aba inteira de espécies (National Dex #1-251) e inclui **toda**
espécie com arte real (`assets/battle-sprites/{id}/`) que não seja lendária (BOSS-only) nem
um dos 3 iniciais base (Charmander, Squirtle, Bulbasaur seguem exclusivos da tela de escolha
— só as formas **evoluídas** viram POKE selvagem).

Isso substituiu listas manuais por faixa, em que cada espécie aparecia numa faixa só, sem
fallback se aquela faixa não desse match de bioma — o que causou o bug do Dragão.

`reportTypeCoverage()` roda no fim do sync e imprime, por tipo, quantas espécies primárias
existem contra quantas spawnam, avisando se alguma ficar sem hunt. Troca "espero que a
rotação cubra tudo" por checagem real a cada sync.

## Camada 2 — região

Pedido: "apenas Pokémon de Johto nas hunts de Johto; o mesmo vale para Kanto".

**Filtrar o array esvaziava hunts.** Medido antes de mexer: filtrar pelo rótulo `continent`
existente deixaria **3 hunts vazias e ~100 espécies sem lugar nenhum**, porque o dado real
não coopera:

- Johto não tem **nenhuma** espécie POISON nem DRAGON primária, e tem 1 FIGHTING e 1 GHOST.
- Kanto não tem **nenhuma** DARK nem STEEL primária — os dois tipos só existem a partir da
  Gen 2.

Solução: **cada bioma existe nas duas regiões.** A hunt original mantém id, nome e nível e
fica com a região do rótulo; a região oposta ganha uma hunt irmã (`${id}_${regiao}`, mesmo
bioma, mesma faixa).

Resultado: nenhuma hunt vazia, **zero espécie órfã**. Única combinação descartada:
Kanto + DARK, que não existe.

`src/data/regions.ts` extrai o número da Pokedex de `species.description` ("Pokedex Nº4"),
que o sync já emite — em vez de uma segunda tabela de 226 linhas que divergiria no primeiro
sync. **Estoura** se alguma espécie não casar: uma espécie sem número viraria "Johto" em
silêncio.

`NON_WILD_SPECIES` = porygon, porygon2, eevee (cassino e presente). Lista explícita e curta:
derivar de `spawn-tiers.json#origem === 'regra'` pegaria as 94 sem encontro selvagem real e
esvaziaria metade das hunts.

`HUNT_BIOME` tem 18 linhas escritas à mão porque **o tipo do bioma não viaja no dado
gerado** — ele vive em `TYPE_BIOME_PLAN` no sync e some na emissão. Hunt gerada sem entrada
aqui **estoura no boot**, o que é o comportamento certo.

**Consequência assumida:** cada região passa a ter escada completa de nível. O portão do
Campeão Lance continua valendo — ele libera o continente Kanto inteiro, ou seja, metade do
elenco.

## Camada 3 — força define a zona

Sem um eixo de força, toda espécie de tipo GRASS — do Bellsprout ao Venusaur — caía na mesma
hunt de Lv 1-10, porque Floresta é a zona de GRASS. Medido antes:

| Hunt | Faixa | Tinha |
|---|---|---|
| Johto Zona 0 · Bosque | Lv 1-10 | Scizor (500), Heracross (500) |
| Kanto Zona 0 · Bosque | Lv 1-10 | Scyther (500), Pinsir (500) |
| Johto/Kanto Zona 0 · Floresta | Lv 1-10 | Meganium / Venusaur (525) |
| Kanto Zona 1 · Costa | Lv 11-20 | Gyarados (540), Lapras (535), Blastoise (530) |
| **Johto Zona 2 · Caverna** | **Lv 21-30** | **Tyranitar (600)** |

"Tirar o Scizor da lista" não resolve: sem um segundo eixo, ele ou fica no começo ou some do
jogo.

`zonaMinimaDaEspecie(speciesId)` = máximo entre a faixa de BST e um piso por estágio de
evolução.

| BST mínimo | Zona | Faixa | Exemplos |
|---|---|---|---|
| 525 | 7 | Lv 71-80 | Tyranitar, Dragonite, Snorlax, Venusaur |
| 475 | 5 | Lv 51-60 | Scizor, Heracross, Gengar, Machamp |
| 425 | 3 | Lv 31-40 | primeiro degrau acima de 30 |
| 350 | 1 | Lv 11-20 | — |
| 0 | 0 | Lv 1-10 | — |

Os cortes saem da distribuição real do elenco (226 espécies): 300-349 é a moda (49), 450-499
vem atrás (41), e só 14 passam de 550. São os degraus onde a população muda de patamar, não
números redondos.

`PISO_POR_ESTAGIO = [0, 0, 1, 2]` — 3ª evolução nunca abaixo da zona 2. Existe porque BST
sozinho deixa passar forma final fraca: Butterfree e Beedrill (395) são 3ªs evoluções e
cairiam na Zona 1 junto com o Caterpie que virou eles.

`ZONA_MINIMA_DOS_FORTES = 3` — exportado para o teste, para não repetir o corte em dois
lugares.

### A hunt nova nasce sozinha

`huntSpawnOverrides` agrupa o pool por `max(zona do bioma, zona mínima da espécie)` e emite
uma hunt por balde. **"Johto Zona 5 · Bosque" existe porque Scizor e Heracross precisam de
casa** — ninguém escreveu essa hunt. Resultado: 36 → 69 hunts normais, e o bioma continua
sendo o do tipo primário (Scizor não virou POKE de Floresta).

Três regras que não são arbitrárias:

1. **A zona base do bioma sempre sai como hunt própria**, mesmo com pool pequeno. É ela que
   carrega o id histórico (`lv_1_10_bosque`), e esse id aparece em `unlocked_maps` e em
   `game_sessions.map_id`. As zonas novas ganham sufixo (`_z5`), nunca o contrário.
2. **Balde magro (< `MIN_POOL_ZONA_AVANCADA` = 3) é fundido com o de cima**, subindo o nível
   de quem foi absorvido — nunca descendo. `zonaMinimaDaEspecie` é um **piso**: descer
   devolveria para a hunt cedo exatamente quem foi tirado de lá. Sem essa fusão davam 78
   hunts, várias com uma espécie só.
3. **A sobra do topo vira hunt própria mesmo com uma espécie.** Fundir para baixo apagaria a
   hunt cedo do bioma. Uma hunt de um POKE só (Tyranitar na Zona 7 da Caverna) é conteúdo
   legítimo: é o dado real de Johto ter poucas espécies ROCK.

## Zonas: o nome mentia sobre o nível

**Bug real e grave.** Medido no dado gerado, antes:

| Nome | Spawnava |
|---|---|
| "Zona Nivel 1-10 (Floresta)" | Lv 2-12 |
| "Zona Nivel 11-20 (Planicie)" | Lv 10-18 |
| **"Zona Nivel 31-40 (Vulcanico)"** | **Lv 15-51** |

O nome vinha do bracket nominal do sync (agrupamento por nível médio) e o `levelRange` vinha
do min/max real das espécies agrupadas — dois números de origens diferentes que ninguém
cruzava.

Corrigido fixando a faixa **primeiro** e derivando tudo dela: `ZONA_POR_HUNT` (tabela
explícita, ao lado de `HUNT_BIOME`) declara o número de cada hunt, a faixa é
`[n × 10 + 1, n × 10 + 10]` (`NIVEIS_POR_ZONA` = 10), e nome, cartão e spawn saem da mesma
fonte. Nome final: `Johto Zona 3 · Vulcânico`.

**Consequência assumida:** nove zonas contíguas de dez níveis cobrem Lv 1-90, então o teto
das hunts normais é Lv 90. Conteúdo acima disso vive no Modo Pesadelo e nas hunts BOSS.

## A hunt inicial

`STARTER_HUNT_ID` = `route_46`, elenco curado à mão, fora do sistema de biomas.

`STARTER_HUNT_SPECIES` = `sentret`, `hoothoot`, `rattata` — os três NORMAL.

**Rattata é de Kanto e a hunt é de Johto.** É a única exceção deliberada à regra de região,
nomeada no pedido. O teste de região exclui a hunt inicial explicitamente.

`STARTER_LEVEL_WEIGHTS`: 80% Lv1 / 20% Lv2. Uniforme daria 50/50.

O cartão da hunt não lista espécie, então um sync futuro poderia devolver Ledyba para lá sem
ninguém notar — por isso o elenco exato é trancado por teste.

## Nível ponderado

`HuntEncounter.levelWeights?: { level, weight }[]`. `spawnEnemyAt` usa `weightedPick` quando
presente, senão o `randInt` uniforme. Único uso hoje: a hunt inicial.

## Spawn ponderado por raridade de encontro

`encounter.weight` é o peso do **tier de spawn**, derivado da chance real de encontro
selvagem da Gen 1/2 — ver [02](02-dados-e-catalogo.md#tier-de-spawn-por-que-o-peso-deixou-de-ser-catchrate).

`spawnEnemyAt` sorteia do `enemyPool` com `weightedPick`, não uniforme. O menu de hunts usa o
mesmo peso para mostrar a porcentagem real, não `1 / poolSize`.

Constantes de posicionamento: `SPAWN_MIN_DISTANCE` = 250 (do jogador), `SPAWN_MARGIN` = 60,
`SPAWN_POINT_MAX_ATTEMPTS` = 40.

## Terceiras evoluções em 0,2%

`SHARE_TERCEIRA_EVOLUCAO = 0.002` em `huntSpawnOverrides`.

A conta sai do peso dos **outros**, não de um número absoluto (`weightedPick` usa
`peso / soma`): com N espécies fixadas em `s` cada e soma `S` no resto,
`w = s × S / (1 - N × s)`.

"3ª evolução" sai de `SPECIES`, **não** de `SPECIES_DATA` (`data/evolutionStage.ts`): as 9
cadeias de evolução por troca não existem na planilha, são costuradas em tempo de load.
Contando pelo dado cru, Alakazam, Machamp, Gengar, Steelix, Scizor, Kingdra, Golem, Politoed
e Porygon2 apareceriam como forma **base**.

### `LIMITE_ZONA_DE_FINAIS = 0.5`

A regra dos 0,2% foi criada quando forma final era sempre minoria num pool misturado. Com as
zonas por força isso deixou de valer: "Johto Zona 7 · Costa" tem Politoed, Feraligatr, Kingdra
e Octillery — fixar três em 0,2% dava **99,4% para o Octillery**. A zona criada para abrigar
as formas finais viraria uma fazenda de Octillery.

Com metade ou mais do pool em formas finais, a hunt **é** uma zona de finais e quem manda é o
tier de encontro real. O espírito do pedido ("forma final tem que ser rara") continua valendo
onde ela é a exceção.

Hunts BOSS ficam de fora: lá o elenco **é** a luta, e 0,2% por Dragonite significaria 99,8%
de nada aparecer.

## Modo Pesadelo e hunts BOSS

`src/data/nightmareMaps.ts`, gerado em **runtime** — fora do pipeline de sync, portanto
seguro contra o próximo `planilha:aplicar`. **Totalmente grátis**, sem gate nem custo.

`buildNightmareMirror(maps, encounters)` clona as hunts normais (exceto as BOSS) com
`id: nightmare_${id}`, nome + " (Pesadelo)", `continent: 'nightmare'`, e nível deslocado por
`shiftLevel(level) = max(level + 100, 150)`.

O piso de 150 existe porque a hunt mais fraca (Lv 1-2) só chegaria a Lv 102 com o offset.

**Bug irmão, achado pelo teste:** o espelho deslocava `minLevel`/`maxLevel` mas **não** os
`levelWeights` — que são o sorteio de nível de fato quando existem. O Pesadelo da hunt
inicial anunciava Lv 150 e spawnava nível 1 e 2: a hunt mais difícil do começo era a mais
fácil dele.

`buildNightmareMirror` recebe os mapas por parâmetro. Antes tirava de `MAPS_DATA` cru, o que
congelaria a composição misturada antiga **e** deixaria as hunts novas sem espelho.

`BOSS_MAPS_DATA` / `BOSS_ENCOUNTERS_DATA` são exportados separados: BOSS e Lance não dependem
das hunts normais.

Hunts BOSS: 11 (uma por lendário), `maxEnemies: 1`, `noRespawn: true`, encontro fixo em
nível 300. O respawn do mundo respeita `!world.mapDef.noRespawn` — o BOSS spawna uma vez por
visita e volta ao reentrar (`world.enemies` nunca é persistido; sem estado novo).

`noRespawn` também é o que marca "sem rede de segurança" para o `autoSystem` — ver
[05](05-regras-de-negocio.md#automação).

## Desbloqueio de hunt

A regra real é **"hunt sem custo nasce liberada; hunt com custo exige ter pago"**, não "tem
que estar na coluna `unlocked_maps`".

A diferença importa: Modo Pesadelo e BOSS são runtime e nunca entraram na tabela `maps`,
logo nunca apareceriam naquela coluna. Checar só a coluna trancava o Modo Pesadelo inteiro
em silêncio.

Nenhum mapa real tem `unlockCost` hoje (a antiga "Câmara dos Lendários" paga em ouro foi
removida; lendários são BOSS-only). `unlockMap` continua existindo para o dia em que um mapa
pago voltar.

## Geometria e visual da hunt

- `bounds` 2800×1800, `playerSpawn` no centro (1400, 900). Valores escritos à mão no sync,
  não vindos da planilha.
- Limite caminhável circular (ver [03](03-motor-de-simulacao.md#movimento-movementsystemts)).
- Fundo: `drawImage` único centrado no mapa, **não** `createPattern('repeat')`. A imagem é
  uma cena única detalhada, não uma textura feita para repetir sem costura. Com o mapa
  dobrado, o círculo passou a tocar a borda dos bounds, e o wrap do pattern aparecia como
  risca escura cortando o mapa em zoom out. A imagem escalada já é maior que o mapa nas duas
  dimensões, então um desenho cobre tudo. Só em zoom out extremo a câmera vê além dela,
  caindo num preenchimento liso da cor de tema do bioma.
- O ícone da hunt no menu usa `colorForType()` sobre o tipo elemental dominante (ponderado
  pelo peso real), não as 3 cores fixas de tema. Nenhum dicionário de cores novo foi criado:
  `data/typeColors.ts` já cobria os 17 tipos.
- Lista de hunts ordenada por `levelRange[0]`, desempate por teto e nome. A ordem anterior
  era a de inserção em `MAPS`, agrupada por bioma — a lista pulava de Lv 1-10 para Lv 71-80 e
  voltava.

## Invariantes trancados por teste

`src/data/hunts.test.ts`, 23 casos. Essas falhas são **silenciosas** — uma espécie sem hunt
continua no Bestiário e com sprite, só nunca aparece. Foi assim que o Dratini sumiu por uma
leva inteira.

- Nenhuma hunt vazia
- Todo encontro aponta para espécie real
- **Zero espécie órfã**
- Hunt de uma região só com POKE daquela região (hunt inicial excluída)
- Nenhum POKE de cassino spawnando
- Elenco e distribuição 80/20 da hunt inicial
- Faixa estrita por encontro **e** por `levelWeights`
- Zonas de 10 níveis com o número do nome batendo com a faixa
- Todo peso de spawn positivo, com soma > 0
- Soma das chances de cada hunt fechando 100%
- Nenhuma espécie forte em hunt que termina antes do Lv 30
- Toda espécie respeitando a própria zona mínima
