# 06 — Mundo, hunts e spawn

> **Este documento foi reescrito por inteiro.** A versão anterior descrevia um desenho de
> hunts — "1 tipo elemental = 1 bioma" × 9 zonas de 10 níveis × recorte por região
> (Johto/Kanto) — que o próprio código já chama de "o desenho antigo" e que foi **substituído**
> pelo sistema de biomas/sub-biomas/salas abaixo. Manter aquela versão como se fosse atual
> seria pior que não ter documento nenhum: alguém tomaria decisão de balanceamento em cima de
> uma arquitetura que não roda mais. Ver [13](13-divergencias-conhecidas.md) para o registro
> dessa classe de erro ("sistema inteiro faltando/trocado", não só constante desatualizada).

## Como uma hunt é montada hoje

Tudo em `src/data/huntSpawnOverrides.ts`, `biomas.ts` e `spawnStrength.ts`, em runtime:

```
1. BIOMA (12) agrupa sub-biomas tematicamente     (data/biomas.ts)
2. FAIXA (3) recorta a faixa de nível              (data/biomas.ts#FAIXAS)
3. FORÇA decide em que faixa cada espécie cabe     (data/spawnStrength.ts)
4. SALA sorteia qual sub-bioma está ativo agora    (engine/systems/salaSystem.ts)
```

12 biomas × 3 faixas = **36 hunts**, mais a inicial (`route_46`), mais o espelho do Modo
Pesadelo (mesma composição, nível +100), mais as 11 hunts BOSS + a do Campeão Lance (elenco
próprio, fora do pipeline de biomas).

### O que isto substituiu, e por quê

Antes eram **69 hunts**: 1 tipo elemental = 1 bioma (`scripts/sync-planilha.js#TYPE_BIOME_PLAN`)
× 9 zonas de 10 níveis (`zonaMinimaDaEspecie` como eixo de força *entre* zonas) × recorte por
região. Duas partes desse desenho não sobreviveram ao elenco real (209 espécies alocadas nos
12 biomas atuais):

- **O recorte por região esvaziava hunt.** 12 dos 33 sub-biomas de então ficariam com menos de
  3 espécies numa das duas regiões — Praia e Dojo sem **nenhuma** espécie de Johto, Floresta
  Nevada sem **nenhuma** de Kanto.
- **A escada de 9 zonas não sobrevivia ao elenco.** Medido: a zona 2 ficava **vazia** em 11 dos
  12 biomas. Nove degraus sobre esse dado produziam hunts de uma espécie só.

`src/data/regions.ts` (`regionOfSpecies`) continua existindo, mas só serve o filtro de
Continente do Bestiário/Pokedex — **não separa mais hunt nenhuma**. Uma hunt de bioma hoje
mistura Johto e Kanto livremente.

## Camada 1 — bioma e sub-bioma

`src/data/biomas.ts#BIOMAS`: 12 biomas, cada um com 1 a 4 sub-biomas. Cada sub-bioma carrega:

| Campo | Para quê |
|---|---|
| `peso` | Chance relativa de uma sala cair nele, dentro do bioma (10 = corriqueiro, 3 = raro) |
| `loot` | Um de 4 perfis (`LOOT`): `basico`, `civilizado`, `remoto`, `profundo` — antes toda hunt dropava exatamente `potion 15% / poke_ball 10%`, hoje o loot diz algo sobre o lugar |
| `bg` | Fundo próprio, só quando difere do bioma-pai (ausente = herda) |

`quem aparece` em cada sub-bioma vem de `data/generated/subBiomas.generated.ts`, derivado das
pools do PokeRogue (`npm run subbiomas:gerar`) — **dado gerado**, não escrito à mão; só o
agrupamento temático, peso e loot são decisão de design.

Pedras (`data/stones.ts`) ficam fora do loot por sub-bioma: caem por um roll universal de 20%
por abate, tipo primário do inimigo (`economySystem.ts#awardKillLoot`), não por hunt.

## Camada 2 — faixa

`src/data/biomas.ts#FAIXAS`, 3 faixas fechadas de nível, teto Lv 90:

| Faixa | Níveis | `zonaMaxima` |
|---|---|---|
| I | 1–30 | 2 |
| II | 31–60 | 5 |
| III | 61–90 | 8 |

Acima de Lv 90 é Modo Pesadelo (+100, piso 150) e hunts BOSS (Lv 300) — nunca faixa normal.

`FAIXAS_INICIAIS = ['faixa1', 'faixa2']` nascem abertas. `GRUPOS_DO_LANCE = ['faixa3',
'nightmare']` são liberados de uma vez ao derrotar o Campeão Lance (`boss_lance`, time Lv
55–65 — exatamente o fim da faixa II).

`GRUPOS_LEGADOS` (`Set(['johto', 'kanto', 'nightmare'])`) — grupos do desenho por-região
antigo. Save/linha de `players.unlocked_continents` que ainda os carrega é traduzido na
carga, nunca propagado: `'kanto'` vira o que o Lance libera hoje, os outros dois somem. Manter
`'nightmare'` sem tradução daria de graça o conteúdo que virou gate do Lance.

## Camada 3 — força define a zona mínima dentro da faixa

Sem um eixo de força **dentro** de cada bioma, toda espécie de um tipo caía junto — do
Bellsprout ao Venusaur na mesma faixa de Mata. `src/data/spawnStrength.ts#zonaMinimaDaEspecie`
é esse eixo: não move a espécie de bioma (quebraria a coerência temática), diz a partir de que
**zona interna** ela pode nascer.

| BST mínimo | Zona | Exemplos |
|---|---|---|
| 525 | 7 | Tyranitar, Dragonite, Snorlax, Venusaur |
| 475 | 5 | Scizor, Heracross, Gengar, Machamp |
| 425 | 3 | primeiro degrau acima de Lv 30 |
| 350 | 1 | — |
| 0 | 0 | — |

Cortes tirados da distribuição real do elenco (226 espécies): 300–349 é a moda (49), 450–499
vem logo atrás (41), só 14 passam de 550 — não são números redondos, são os degraus onde a
população muda de patamar. `ZONA_MINIMA_DOS_FORTES = 3` (exportada para o teste, `especieForte`)
é o piso pedido explicitamente: BST ≥ 425 nunca aparece antes de Lv 30.

`PISO_POR_ESTAGIO = [0, 0, 1, 2]` (indexado por `evolutionStage`) — BST sozinho deixa passar
forma final fraca: Butterfree e Beedrill (395) são 3ªs evoluções e cairiam na zona 1, junto
com o Caterpie que virou eles.

Uma espécie só entra na hunt cuja faixa alcança a `zonaMaxima` necessária —
`trechosDaLinha()` filtra por `zonaMinimaDaEspecie(atual) <= faixa.zonaMaxima`.

## Uma linha evolutiva, estágios em faixas disjuntas

Uma faixa cobre 30 níveis. Jogar a linha evolutiva inteira dentro dela produzia absurdo:
medido, **228 pares espécie × hunt** em que a espécie já deveria ter evoluído (Caterpie, que
evolui no nível 7, nascendo Lv 60 na faixa I).

Corrigido: cada **estágio** entra só na sub-faixa de nível em que ele é o estágio correto, e
essas sub-faixas não se sobrepõem (`huntSpawnOverrides.ts#trechosDaLinha`):

```
linha Caterpie na faixa I  (Lv 1-30):  Caterpie 1-6 | Metapod 7-9 | Butterfree 10-30
linha Pidgey   na faixa II (Lv 31-60): Pidgeotto 31-35 | Pidgeot 36-60
```

`nivelDeTroca(speciesId)` decide o corte: evolução por nível usa `species.evolvesAtLevel`
normal; as 9 evoluções **especiais** (ex-troca: Kadabra→Alakazam, Onix→Steelix…, ver
[05](05-regras-de-negocio.md)) carregam `evolvesAtLevel = 80` — a regra do JOGADOR (Nível 80 +
20 Pedras), sem sentido para o selvagem. Para essas, o gatilho selvagem é a própria
**força**: a forma evoluída aparece a partir da primeira faixa cuja `zonaMaxima` alcança
`zonaMinimaDaEspecie(alvo)`.

**Bug real achado por isso**: `zonaMinimaDaEspecie('scyther') === zonaMinimaDaEspecie('scizor')
=== 5`, então o gatilho de troca caía exatamente em Lv 31 — a faixa de Scyther virava `[1, 30]`,
vazia bem onde ele deveria aparecer. Corrigido: a forma evoluída (ex-troca) fica pelo menos
**uma faixa acima** da origem (`Math.max(zonaMinimaDaEspecie(alvo), zonaMinimaDaEspecie(origem)
+ 1)`), nunca na mesma.

Duas consequências que são o ponto, não efeito colateral:

- Nenhum nível absurdo, em nenhuma faixa.
- O peso de spawn continua sendo o `spawn_tier` real do Gen 1/2 do **próprio estágio**. A
  alternativa (auto-evoluir no spawn, como o PokeRogue faz) faria o Gyarados herdar o peso
  `muito_comum` do Magikarp — ver [02](02-dados-e-catalogo.md#tier-de-spawn-por-que-o-peso-deixou-de-ser-catchrate).

## A hunt vira salas

Uma hunt não é mais um único mapa fixo: é percorrida em **`SALAS_POR_HUNT` = 10 salas**
(`biomas.ts`), cada uma um sub-bioma sorteado (com reposição, ponderado por `peso`) do bioma
daquela hunt — `engine/systems/salaSystem.ts#sortearSala`.

### Por que quota de abates, e não "zerar o campo"

O servidor é a autoridade e simula por **janelas**: a cada flush (~30s) reconstrói o mundo do
zero com `buildMapWorld` (ver [04](04-autoridade-do-servidor.md)). O inimigo em campo **não**
sobrevive de uma janela para outra — um contador sobrevive. "Limpar a sala" como "zerar o campo"
seria uma condição que o servidor nunca observaria inteira, e a hunt travaria na sala 1 para
sempre.

`ABATES_POR_SALA = 30` fecha a quota (`registrarAbate`, chamado do **único** ponto de abate do
motor — vale igual no combate ao vivo, no catch-up de aba oculta e no farm offline).

### Sorteio no avanço, não plano antecipado

A próxima sala é sorteada **quando a quota fecha**, não como um plano de 10 salas na abertura
da hunt. Um plano teria que ser mandado (o jogador leria "sala 7 é a boa" e faria reroll
grátis saindo/entrando) ou escondido (o cliente não teria o que mostrar). Sorteando no
avanço, o futuro simplesmente não existe para ser espiado — o único estado a persistir é a
sala **atual** (`ProgressoDaSessao#sala`, atravessa reconstrução de janela como
`sequenceIndex` do Lance).

O anti-reroll que sobra é o custo: sair da hunt fecha a sessão, e voltar recomeça no ciclo 1,
sala 1.

### Transição com contagem regressiva — "Entrando em nova área"

Fechar a quota **não troca de sala na hora**. `registrarAbate` sorteia a próxima sala de
imediato (o "carregamento" adiantado — mundo estático, sem I/O real, mas resolve o RNG e
decide pool/loot da sala seguinte enquanto o overlay cobre a tela) e arma
`world.salaCountdownRemaining = SALA_TRANSITION_COUNTDOWN` (3s). `stepWorld` congela
movimento/combate enquanto ela conta — mesmo padrão do `countdownRemaining` de intro do
Campeão Lance, só disparado no **meio** da hunt em vez de na entrada.

Ao zerar, `aplicarTransicaoDeSala` troca `world.sala` para a pendente, reavalia
`mapDefParaSala` (mapa/colisão da nova sala) e **zera** `enemies`/`effects`/`pendingHits` —
"área nova do zero" é literal, não um filtro do que sobrou da sala anterior. `stepWorld`
então faz o spawn inicial da sala nova no mesmo tick em que a contagem chega a zero.
`SalaCountdownModal` (componente React) cobre o campo com "Entrando em nova área..." e a
contagem 3-2-1 enquanto isso corre.

Sem o congelamento, um inimigo que sobrasse da sala anterior (`maxEnemies > 1`) continuaria em
campo com espécie fora do pool novo até morrer por conta própria — era assim antes desta leva
(filtro por `permitidas.has(speciesId)` em vez de reset total).

### Loot e janela de nível por sala

- **Loot ativo**: o perfil (`LOOT[sub.loot]`) do sub-bioma da sala atual; sem sala (hunt sem
  sistema de salas), o da hunt inteira (`lootAtivo`).
- **Janela de nível**: `janelaDaSala(faixa.niveis, sala.indice)` divide a faixa (30 níveis) em
  10 degraus — sala 1 na base, sala 10 no topo. **Bug real que isto corrige**: sem janela, a
  primeira sala de uma faixa de 30 níveis já podia jogar um POKE Lv 30 contra quem acabou de
  sair do Hospital. Medido no motor headless: um Charmander Lv 25 morreu em 4 abates em 30
  minutos de simulação; com a janela, fez 114 abates e chegou à sala 10. Dá à mecânica de
  salas um segundo papel além da variedade de sub-bioma: a hunt afunda conforme o jogador
  avança.

### Hunts sem sistema de salas

`temSalas(mapId)` = `POOL_POR_SALA[mapId] != null`. A hunt inicial, as 11 BOSS e a do Campeão
Lance ficam de fora — elenco curado à mão ou lendário único, sala não faz sentido para
nenhuma delas.

## Wall-block pela ARTE de fundo (colisão pintada à mão)

`src/data/maps.ts#mapDefParaSala` escolhe a grade de colisão pela **imagem que está na tela**,
não pela chave do sub-bioma. A imagem sai de `maps.ts#backgroundParaSala` — sub-bioma com arte
própria manda, senão vale a arte da hunt (que é a do bioma) —, a mesma função que o renderer
usa para desenhar.

**Por que pela arte** (mudou em 2026-08-18; antes era `SUB_BIOMA_COLLISION[chave]`): toda hunt
fora do sistema de salas — Modo Pesadelo, as 11 BOSS, o Campeão Lance, o treino — não tem
`sala`, então não casava com chave nenhuma e rodava **sem wall-block**, atravessando as mesmas
paredes que a hunt normal respeita. Não dava erro; parecia só "o Pesadelo não tem wall block".
A `route_46` escapava por um `if (mapId === STARTER_HUNT_ID)` escrito à mão, que saiu junto: ela
mostra `forest.jpg` e herda a grade dessa arte como qualquer outro. A regra agora é uma só —
**quem mostra a imagem herda o walk-block dela** — e conteúdo novo entra sem cadastro paralelo.
Trancado por `src/data/walkBlock.test.ts`.

Fonte: `scripts/build-sub-bioma-collision.js`, 29 referências pintadas à mão
(`scripts/body-block-refs/*.png`, fora de `assets/` **de propósito** — mantém a imagem-referência
fora do bundle de produção, que só copia tudo sob `assets/`, ver `scripts/copiar-assets.mjs`).
Dois modos de leitura e duas fontes de spawn, por entrada do manifesto:

- **`vermelho_bloqueia`** (só `abismo.png`, o desenho mais antigo): vermelho = parede,
  qualquer outra cor = andável.
- **`rosa_anda`** (as outras 28): pintura lilás/rosa é o **único** lugar andável/spawnável —
  tudo o resto bloqueia. Convenção invertida da anterior; ambas coexistem via um campo `modo`
  por entrada, para não arriscar quebrar `abismo.png` (já testada) só por unificar convenção.
- **`spawn: 'amarelo'`** usa o **maior blob contíguo** de amarelo (círculo pintado pelo
  usuário); `'centroide-rosa'` nasce no meio da própria área rosa. Blob, e nunca o centroide de
  todo pixel amarelo: várias artes têm amarelo incidental (flor, lâmpada, lava) e a média cai
  num ponto que não existe.

`PINK_CELL_RATIO = 0.3` — quanto de uma célula (40px de mundo = 50px de imagem) precisa estar
pintada para ela ser andável. Era 0.5 e isso **cortava a malha das artes urbanas**: rua de
cidade tem cerca de uma célula de largura, qualquer estreitamento caía abaixo da maioria, e a
poda por desconexão apagava tudo do outro lado do corte (medido: `town-night` perdia 224
células, `metropolis` 116). Em 0.3 os dois vão a zero e 0.2 não conserta mais nada.

**A pintura só vale no recorte que vira mundo.** A arte é ~2048², mas os bounds são 1400x900 em
paisagem: só `x[149..1899] y[462..1587]` da imagem aparece. O que for pintado fora disso é
descartado em silêncio — inclusive o círculo amarelo de spawn, caso em que o script avisa e cai
no centroide rosa. `node scripts/conferir-walk-block.mjs` gera, por arte, a referência recortada
nessa janela com a grade por cima, que é o único jeito de ver desalinhamento sem entrar no jogo.

A grade resultante (`COLISAO_POR_ARTE[caminho da arte]`, gerada) tem `colisaoDefineLimite: true` — o
retângulo INTEIRO da grade é o limite real (a pintura já é a fronteira), então
`mapWalkRadius` devolve o raio que inscreve o retângulo inteiro (nunca corta a grade), ao
contrário do círculo inscrito na menor dimensão que toda outra hunt usa. Fora da grade conta
como bloqueado (não o comportamento leniente das grades antigas por-hunt) — sem isso, spawn
ou wander podia levar entidade (inclusive o jogador) para fora da área pintada, gerando
perseguição impossível.

`isCellBlocked`/`nearestOpenPoint` (`maps.ts`) são compartilhados por: construção inicial do
mundo (`buildMapWorld`, snap se o `playerSpawn` cair em célula bloqueada), e troca de sala em
andamento (`salaSystem.ts#aplicarTransicaoDeSala`, mesmo snap para jogador **e** inimigos —
sem isso, uma entidade podia herdar uma célula cercada por 8 vizinhos também bloqueados e
ficar presa, já que nem A* nem `slideToward` escapam de "começar dentro da parede").

Sem referência pintada hoje: só `dojo.png`. Toda outra sala mostra alguma arte que tem grade,
seja a própria ou a do bioma — a lista de exceção fica explícita em `walkBlock.test.ts`, para
uma arte nova não entrar de carona no "ainda faltam algumas".

## Spawn: distância média e cone de visão

Pedido explícito: POKE selvagem só nasce a **média distância** e dentro do **cone de visão**
do jogador — a direção para onde ele está virado (`player.facing`, mantido pelo
`movementSystem`) — para dar a sensação de "explorar" o mapa em vez de tudo aparecer ao redor
de onde o jogador já está parado.

`engine/simulation.ts#randomSpawnPoint`: sorteia um ângulo dentro de
`±SPAWN_CONE_HALF_ANGLE` (~55°, cone total ~110°) a partir de `facing`, e uma distância entre
`SPAWN_CONE_MIN_DISTANCE` (250) e `SPAWN_CONE_MAX_DISTANCE` (550) — nunca colado no jogador,
nem no fim do mapa. Até `SPAWN_POINT_MAX_ATTEMPTS` tentativas descartando pontos fora do raio
caminhável ou em célula bloqueada.

**Fallback, não substituição**: sem tentativa bem-sucedida (corredor de body-block estreito
demais para caber a faixa/ângulo pedidos), ou sem jogador ainda disponível, cai no sorteio
antigo (`randomSpawnPointFullMap`, raio do mapa inteiro, sem depender de para onde o jogador
olha) — um mapa apertado deixar de spawnar qualquer inimigo seria pior que nascer fora do
cone.

## Raio de AOE = raio de agressão selvagem

`src/data/huntTypes.ts#WILD_AGGRO_RADIUS = 175` — o raio em que um POKE selvagem nota e vem
para cima do jogador (`engine/entity.ts#createEnemyEntity`,
`AGGRO_RADIUS_MULTIPLIER = 1`, sem boost). Hardcoded como `aggroRadius: 175` nos 3 pontos que
constroem `HuntEncounter` (`huntSpawnOverrides.ts`, `nightmareMaps.ts` × 2) — `WILD_AGGRO_RADIUS`
existe para `data/abilities.ts#AOE_RADIUS` ter uma fonte compartilhada em vez de reescrever o
mesmo número mágico uma 4ª vez, não porque os 3 pontos o importam hoje.

Pedido explícito: raio de golpe AOE = raio de agressão do selvagem. `AOE_RADIUS =
WILD_AGGRO_RADIUS` — ver [03](03-motor-de-simulacao.md#combate-combatsystemts) para o resto
do pipeline de dano.

## Modo Pesadelo e hunts BOSS

`src/data/nightmareMaps.ts`, gerado em **runtime** — fora do pipeline de sync, seguro contra
o próximo `npm run planilha:aplicar`. **Totalmente grátis**, sem gate nem custo.

`buildNightmareMirror(maps, encounters)` recebe as 37 hunts normais **já montadas** (bioma ×
faixa + inicial) e clona cada uma com `id: nightmare_${id}`, `continent: 'nightmare'`, nível
deslocado por `shiftLevel(level) = max(level + 100, NIGHTMARE_MIN_LEVEL)` (piso 150 — a hunt
mais fraca, Lv 1–2, só chegaria a Lv 102 com o offset plano). Recebe por parâmetro em vez de
ler dado bruto: espelhar o dado errado congelaria composição antiga.

**Bug real, achado por teste**: o espelho deslocava `minLevel`/`maxLevel` mas não os
`levelWeights` (o sorteio de nível de fato, quando existem — `spawnEnemyAt` os prefere ao
`randInt`). O Pesadelo da hunt inicial anunciava Lv 150 e spawnava POKE de nível 1 e 2 — a hunt
mais difícil do início do jogo era a mais fácil dele. `hunts.test.ts` trava faixa por
encontro **e** por `levelWeights`.

Hunts BOSS: 11 (uma por lendário, `data/legendaries.ts#LEGENDARY_SPECIES_IDS`), `maxEnemies:
1`, `noRespawn: true`, nível fixo 300, sem loot. `noRespawn` também é o que marca "sem rede de
segurança" para o `autoSystem` — ver [05](05-regras-de-negocio.md#automação).

Campeão Lance (`boss_lance`) é a exceção estrutural: **sequência** ordenada de 6 POKE
(`sequence`, não pool aleatório), `autoSwitchTeamOnFaint` (o próximo membro da equipe do
jogador entra sozinho ao desmaiar, em vez do modal de derrota padrão), `noCatch: true`,
`keepCorpses: true` (POKE derrotado fica em campo como "corpo"), `startCountdown: 5` (contagem
antes do 1º POKE dele nascer). Vitória contra a sequência inteira dispara
`unlocksContinentOnClear: GRUPOS_DO_LANCE` — as duas coisas de uma vez, faixa III e Modo
Pesadelo.

## Desbloqueio de hunt

A regra real é **"hunt sem custo nasce liberada; hunt com custo exige ter pago"** — não "está
na coluna `unlocked_maps`". Nenhum mapa hoje tem `unlockCost` (a antiga "Câmara dos Lendários"
paga em ouro foi removida). A diferença importa porque Modo Pesadelo e BOSS são runtime e
nunca entraram na tabela `maps` — checar só a coluna trancaria o Modo Pesadelo inteiro em
silêncio.

## Geometria e visual da hunt

- `GEOMETRIA` (`biomas.ts`): `bounds` 1400×900, `playerSpawn` no centro (700, 450),
  `maxEnemies: 6`, `respawnDelay: 6`. Valores conferidos contra o `maps.generated.ts` antigo
  antes da migração — nunca vieram da planilha, são conceito nosso de idle-game.
- `MAX_INIMIGOS_HUNT_INICIAL = 1`: a hunt inicial usa **menos** inimigos em campo que qualquer
  outra. Medido contra o servidor publicado, com conta nova de verdade (não o motor
  headless — os dois discordaram por quase 6×): 6 inimigos matava o POKE Lv 1 (12 HP) no
  primeiro minuto quase sempre; 1 inimigo, zero mortes em 10 contas de teste. Ver o comentário
  completo em `biomas.ts` para a tabela de medição.
- Limite caminhável circular por padrão (`mapWalkRadius`, ver
  [03](03-motor-de-simulacao.md#movimento-movementsystemts)); retangular-pintado nas salas com
  wall-block (ver acima).
- Fundo: `drawImage` único centrado no mapa, não `createPattern('repeat')` — a arte é uma cena
  única, não uma textura para repetir sem costura.
- Ícone da hunt no menu usa `colorForType()` sobre o tipo elemental dominante do bioma
  (ponderado pelo peso real), não cor fixa de tema.
- Lista de hunts ordenada por `levelRange[0]`, desempate por teto e nome.

## Terceiras evoluções em 0,2% — ainda vale, com um limite novo

`SHARE_TERCEIRA_EVOLUCAO = 0.002` em `huntSpawnOverrides.ts`. A conta sai do peso dos
**outros** (`weightedPick` usa `peso / soma`): com `N` espécies fixadas em `s` cada e soma `S`
no resto, `w = s × S / (1 - N × s)`.

`LIMITE_ZONA_DE_FINAIS = 0.5`: quando metade ou mais do pool de uma hunt já é forma final
(comum nas faixas altas, onde várias linhas evolutivas terminam ao mesmo tempo), a regra dos
0,2% **não se aplica** — fixar três finais em 0,2% cada dava 99,4% de chance para um só dos
outros. Nesse caso quem manda é o tier de encontro real do Gen 1/2. Hunts BOSS ficam de fora
inteiramente: lá o elenco **é** a luta.

## Invariantes trancados por teste

`src/data/hunts.test.ts`. Toda falha aqui é silenciosa — uma espécie sem hunt continua no
Bestiário, com sprite e moveset, só nunca aparece. Foi assim que a linha do Dratini sumiu do
jogo por uma leva inteira sem ninguém notar.

- Existe uma hunt por bioma × faixa, mais a inicial
- Todo sub-bioma declarado em `biomas.ts` tem elenco gerado, e vice-versa
- **Nenhuma sala fica com pool vazio em nenhuma faixa** (mais forte que "alcançável em alguma
  faixa" — toda sala de toda faixa precisa ter pool)
- Peso de sala de todo sub-bioma é positivo
- Gate esperado: faixa1/faixa2 abertas, faixa3 e Pesadelo só pelo Lance
- Nenhuma hunt sem espécie; todo encontro aponta para espécie e hunt reais
- Toda espécie selvagem tem pelo menos uma hunt onde spawna; lendário só em BOSS
- Porygon/Porygon2/Eevee nunca spawnam
- Todo encontro respeita estritamente a faixa da própria hunt (min/max **e** `levelWeights`)
- As 3 faixas são contíguas; nome da hunt bate com a faixa
- Nenhum encontro põe POKE num nível em que já deveria ter evoluído
- Estágios da mesma linha não se sobrepõem dentro de uma hunt
- Nenhum POKE forte (`especieForte`) em hunt que termina antes do Lv 30
- Toda espécie respeita a própria zona mínima
- Todo peso de spawn positivo, toda hunt (e todo pool de sala) soma mais que zero
- Nenhuma espécie passa de 35% de uma hunt com 5+ espécies
- As chances mostradas no cartão da hunt somam 100% (soma sobre `P(sala) × P(espécie | sala)`)
- `enemyPool` da hunt é exatamente a união dos pools de sala
- Hunt inicial: só Sentret/Hoothoot/Rattata (todos NORMAL), 80/20 Lv1/Lv2, fora do sistema de
  salas, menos inimigos em campo que qualquer outra hunt
