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

### Quem decide a sala: o servidor, e só ele

**A simulação do cliente é predição, e predição não pode sortear sub-bioma.** As duas
simulações (cliente e servidor) têm sequência de sorteio própria — é o que `core/rng.ts`
garante e o que a autoridade exige. Enquanto as duas sorteavam, elas sorteavam **salas
diferentes para o mesmo índice**, e o resultado era visível: o cliente aplicava o palpite dele
(com overlay), o flush seguinte trazia o do servidor, e `definirSala` escrevia direto no
estado. Log real, uma hunt de teste, 90 segundos:

```
14:53:13  Sala 2/10 Obra           predição local, com aviso na tela
14:53:15  Sala 1/10 Usina 0/30     flush: VOLTOU para a sala anterior
14:53:20  Sala 2/10 Laboratorio    outro sub-bioma, sem aviso nenhum
14:53:45  Sala 2/10 Obra           e de volta para o palpite local
```

Pior que o vai-e-vem: escrever `sala` direto **não troca a cena**. Arte de fundo, grade de
colisão, ponto de nascimento e inimigos em campo só mudam dentro de
`aplicarTransicaoDeSala` — então o HUD anunciava "Laboratorio" enquanto o canvas desenhava e
colidia como "Usina", por minutos.

Como funciona desde 2026-08-19:

- `world.salaSobAutoridade` (ligado por `controller.enterMap` quando há sessão no servidor)
  faz `registrarAbate` **contar o abate e parar aí** — sem sorteio, sem `salaPendente`. Sem
  servidor (jogo local) e **na própria simulação do servidor** o flag é `false`, e o sorteio
  local continua sendo o de sempre.
- `reconciliarSalaDaAutoridade(world, sala)` é a única porta da sala que vem do flush. Mesma
  sala → só atualiza o contador (e **nunca para trás**: entre o início da janela e a resposta
  o jogador continuou matando). Sala diferente → vira `salaPendente` e arma a contagem
  regressiva, entrando pela mesma transição da regra local. Sala **anterior** → ignorada, por
  `(ciclo, índice)`; aceitar mandava o jogador de volta para a sala 1 com aviso de área nova.
- O cliente **pede o flush na hora** em que a quota fecha (`autoridade.ts#observarQuotaDeSala`),
  em vez de esperar o intervalo de 30s. Se o servidor ainda não fechou a quota dele (as duas
  contagens de abate são independentes), a resposta traz a mesma sala e o pedido repete a cada
  5s até ele fechar.

O preço assumido: a troca de sala passa a custar uma ida ao servidor.

**E ele é MUITO maior que os 3s da contagem regressiva — este parágrafo dizia o contrário até
2026-09-01.** A frase antiga era "a contagem regressiva de 3s existia antes e cobre esse tempo
(pior caso medido da Edge Function: 1593ms)": ela media a LATÊNCIA de uma chamada, não a espera
do jogador. Medido de verdade em `scripts/harness/troca-de-sala-sob-autoridade.mjs` (as duas
pontas com o protocolo real, 48 trocas em 8 sementes): **mediana de 33,0s com a barra em 30/30,
p90 de 33,0s e pior caso de 243s**. Zero travamentos — a sala sempre chega.

O piso de ~30s é o intervalo de flush, e ele não sai com um `await` mais rápido: o cliente já
pede a liquidação no instante em que a quota fecha (`observarQuotaDeSala`), mas nesse instante o
servidor tipicamente ainda não fechou a dele — a resposta útil vem um intervalo depois, e
insistir antes disso é PH-273 (janela curta não paga nem a caminhada até o alvo). A cauda de
243s é o protetor do servidor levando várias janelas para cair.

O que o jogador NÃO perde nessa espera: o respawn de mob comum volta assim que o protetor é
resolvido, então ouro e XP continuam entrando. O que congela é o contador da sala. Desde PH-386
o chip de sala diz "Preparando a próxima área..." nesse estado, que era o único dos quatro
estados de 30/30 sem nada na tela.

Para encurtar a espera de verdade seria preciso tirar o handicap estrutural do servidor: ele
reconstrói o mundo a cada janela e o POKE volta ao ponto de entrada, então **cada janela paga a
caminhada de novo** e ele fecha a quota sistematicamente depois do cliente. Persistir a posição
entre janelas resolveria — e mexeria em quantos abates cabem numa janela, ou seja, em
balanceamento de farm. Decisão do dono, não ajuste de protocolo.

Por que **não** fazer os dois sorteios coincidirem: seria preciso o cliente conhecer a semente
da sessão, e com ela ele calcula as 10 salas na abertura — o reroll grátis que a decisão
"sorteio no avanço, não plano antecipado" (acima) existe para impedir.

### Hunts sem sistema de salas

`temSalas(mapId)` = `POOL_POR_SALA[mapId] != null`. Ficam de fora **15 das 87**: a hunt inicial
(e o espelho Pesadelo dela), as 11 BOSS, o Campeão Lance e o treino — elenco curado à mão,
lendário único ou fixture de teste, sala não faz sentido para nenhuma.

As outras 72 (36 hunts de bioma × faixa + os 36 espelhos do Modo Pesadelo) passam pelas 10
salas. **O Modo Pesadelo entrou nessa conta em 2026-08-19** — ver a seção dele abaixo.

## Guardian e Lord — protetor da sala

Adicionado 2026-08-27 (PH-223→230), em rename de nomenclatura no PH-236 (28/08). **Não
confundir com "hunts BOSS" da seção seguinte** — são sistemas diferentes que só coincidem no
nome em português ("boss"); ver `CLAUDE.md` para a lista dos três sistemas de boss do projeto.

Toda sala 1-9 pede um **Guardian** ao fechar a quota de 30 abates; a sala 10 (última do
ciclo) pede um **Lord**. `protetorDaSala(sala)` (`src/engine/systems/salaSystem.ts`, antes
`bossDaSala`) decide qual, olhando só bioma + índice — pura, não sorteia nada. A entidade em si
(espécie do pool da própria sala, IV 20-31 por stat em vez do 0-31 padrão, raridade normal —
pode rolar legendary/mythic) é criada por `criarEntidadeDoProtetor` (`simulation.ts`, antes
`criarEntidadeDoBoss`). Avançar de sala fica bloqueado até derrotar OU capturar o protetor —
captura sempre possível, com multiplicador de chance reduzido.

Vencer o Lord (não o Guardian) avança `bioma_progress` da faixa — só se o bioma resolvido for
exatamente o próximo esperado em `ORDEM_DOS_BIOMAS` (`data/biomas.ts`). `abrirSessao`
(`authority/src/appSessao.ts`) valida esse progresso no servidor antes de liberar a hunt —
gate não é só cosmético no menu.

Ativo nos 12 biomas desde PH-225 (antes, só o piloto ígneo). Persistência entre janelas de
flush: `authority/src/progresso.ts` (tabela `sala_protetor` a partir do PH-241 — antes,
colunas `boss_*` em `game_sessions`) guarda o protetor vivo pra não resortear a cada
reconstrução de mundo.

**Bug conhecido, aberto** (PH-230): sob autoridade remota (`world.salaSobAutoridade`, ver
seção anterior), resolver o protetor não arma a transição de sala localmente — o servidor é
quem decide. Existe um caminho de loop onde a mesma sala volta a pedir protetor no tick
seguinte antes do flush confirmar a sala nova. Detalhe em `docs/13-divergencias-conhecidas.md`.

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
- **O círculo amarelo é DETECTADO**, não declarado. Não há campo `spawn` no manifesto: se a
  referência tem um blob contíguo de tinta amarela chapada acima de 1200px, ele é o spawn;
  senão, nasce no centroide da área rosa. Blob e nunca o centroide de todo pixel amarelo —
  várias artes têm amarelo incidental (flor, lâmpada, lava) e a média cai num ponto que não
  existe.

  `isYellow` é **estrito** (`r≥235 && g≥215 && b≤45 && |r−g|≤45`) porque a tinta é chapada e
  sempre a mesma, (254,242,0). O teste frouxo anterior (`r>180 && g>180 && b<100`) via areia,
  luz de poste e lava: em `fairy-cave` o "amarelo" cobria quase a imagem inteira, e o maior
  blob ainda ser o círculo era sorte. Medido nas 29 referências com o teste estrito: quem tem
  círculo tem **um** blob de 2144 a 4512px e o segundo maior fica em 0–16px. Duas ordens de
  grandeza de separação — é o que permite detectar em vez de cadastrar.

  **Para dar círculo a mais uma arte:** pintar o círculo (≈60px de diâmetro) na referência e
  rodar o script. Não há nada a cadastrar.

`PINK_CELL_RATIO = 0.3` — quanto de uma célula (40px de mundo = 50px de imagem) precisa estar
pintada para ela ser andável. Era 0.5 e isso **cortava a malha das artes urbanas**: rua de
cidade tem cerca de uma célula de largura, qualquer estreitamento caía abaixo da maioria, e a
poda por desconexão apagava tudo do outro lado do corte (medido: `town-night` perdia 224
células, `metropolis` 116). Em 0.3 os dois vão a zero e 0.2 não conserta mais nada.

**A pintura só vale no recorte que vira mundo.** A arte é ~2048², mas os bounds são 1400x900 em
paisagem: só `x[149..1899] y[462..1587]` da imagem aparece. O que for pintado de walk-block fora
disso é descartado em silêncio.

**O círculo de spawn NÃO é descartado — é projetado.** Os 10 círculos da leva 2026-08-18 caíram
de 30 a 370px fora dessa janela (a maioria no rodapé, dois na lateral), porque quem pinta olha a
imagem inteira e não tem como adivinhar onde a faixa visível termina. Descartá-los, como a
primeira versão fazia, jogava fora a única informação que o círculo carrega: **a intenção de
onde**. Um círculo no canto inferior direito quer dizer "nasce no canto inferior direito", e o
centroide rosa manda para o meio do mapa.

O ponto é levado (clamp) para dentro do retângulo do mundo, recuado uma célula das bordas, e o
snap para a célula andável mais próxima decide o ponto final. `spawnOrigem` no arquivo gerado
registra qual dos três casos ocorreu (`amarelo`, `amarelo-projetado`, `centroide-rosa`) — sem
esse campo, um círculo que a detecção deixasse de enxergar viraria centroide em silêncio.

`node scripts/conferir-walk-block.mjs` gera **duas** imagens por arte:
`_conferencia/<arte>.png` é a janela recortada com a grade por cima (para conferir o que já foi
pintado), e `_conferencia/gabarito/<arte>.png` é a referência inteira com tudo fora da janela
escurecido e a moldura em ciano — é onde se vê, antes de pintar, o que chega à tela.

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

**Segundo bug real da mesma família, corrigido em 2026-08-19: o espelho não copiava as
salas.** `buildNightmareMirror` clonava mapa e encontros e parava aí, então as 36 hunts do
Pesadelo nasciam fora de `POOL_POR_SALA` e `temSalas()` respondia `false` para todas elas.
Consequência: metade do conteúdo de bioma do jogo rodava como **arena única** — sem sub-bioma,
sem chip de sala, sem aviso de nova área, sem janela de nível por sala, e com o pool inteiro da
hunt spawnando de uma vez (em vez do pool do sub-bioma da sala). A hunt normal e o espelho dela
diferiam num `nightmare_` de id e em toda a mecânica de progressão dentro da hunt.

O espelho agora recebe `POOL_POR_SALA` por parâmetro e devolve `porSala` com as **mesmas
chaves de sub-bioma** da origem (mesmo bioma, mesma arte, mesmo body-block pintado — o que muda
é o nível dos encontros), com cada id de encontro trocado pelo par espelhado. Encontro da
origem sem par no espelho é filtrado: id fantasma no pool faria o spawn pedir um encontro que
não existe. `hunts.test.ts` trava, por espelho: mesmas chaves de sala que a origem, pool
não-vazio, todo id existente em `ENCOUNTERS` e contido no `enemyPool` da própria hunt.

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

## Camada ambiente: vida no cenário (`src/render/ambiente.ts`)

Partículas decorativas desenhadas **entre o fundo e as entidades** — folha caindo, ondulação de
água, faísca subindo, poeira, neve, areia soprando, fiapo urbano e gotejo que respinga no chão.
Entrou no PH-96, ganhou máscara de água no PH-113, forma por preset no PH-115, brilho de lava no
PH-195 e a passada de escala/silhueta/gota no PH-232.

### O preset é por ARTE, não por bioma

`PRESET_POR_ARTE` mapeia caminho de imagem → preset (`folha`, `selva`, `agua`, `brasa`, `poeira`,
`caverna`, `neve`, `areia`, `cidade`, `nenhum`). Mesma razão do wall-block ser propriedade do
desenho: quem decide o que aparece na tela é a imagem. Sub-bioma sem arte própria mostra a do bioma
e herda o ambiente dela; hunt sem sistema de salas (Pesadelo, BOSS, Lance, treino) também, sem
cadastrar nada.

`selva` e `caverna` (PH-232) são os dois presets **úmidos**: a mesma partícula do vizinho seco
(`folha` e `poeira`) mais uma população de gotejo. A divisão é estreita de propósito — `jungle` é o
único mapa de vegetação fechada do acervo, e `fairy-cave`/`abyss` são as únicas grutas fechadas.
Ruína a céu aberto, templo, dojo e covil de dragão continuam secos: pingo ali seria goteira sem
telhado.

A tabela é **explícita** de propósito — um `includes('cave')` classificaria `cave-volcanic` como
caverna e daria poeira a um mapa de lava. Arte que não esteja lá cai em `nenhum` e fica parada.
`ambiente.test.ts` itera `COLISAO_POR_ARTE` (a lista canônica de artes jogáveis) e reprova arte
nova sem preset: sem esse teste, a próxima arte a entrar ficaria parada em silêncio.

### A escala é medida contra o POKE, não contra a tela (PH-232)

`src/render/escalaDoMundo.ts` guarda a única régua que estas camadas têm: `ALTURA_DE_POKE = 40`
unidades de mundo, o quadro de sprite mais comum do acervo (360 dos 1.266 registros de
`battleSpriteAnims.ts`; `scaleForSpecies` devolve 1, então o quadro do arquivo **é** o tamanho na
tela). Todo raio de receita é declarado em `emPoke(fração)`.

Isso existe porque até o PH-232 os tamanhos eram números soltos, sem nada com que compará-los, e
todos caíram na mesma faixa: poeira de caverna com 24% da altura de um Pokémon, floco de neve com
30%, risco de chuva com 145% de comprimento por 5,2 unidades de espessura. O sintoma relatado foi
"os efeitos parecem pólen" — o mesmo enxame de bolinhas em quase todo bioma.

Os tetos, trancados por `proporcaoDasParticulas.test.ts`:

- **Corpo de ambiente**: 12% da altura de um POKE (4,8 unidades de diâmetro).
- **Corpo de clima**: 18%. Mais folgado de propósito — granizo e areia *tiram HP*, e um evento que
  mexe no combate tem que ser mais evidente que a decoração fixa do bioma. O mesmo teste afirma
  que o granizo é maior que a maior partícula decorativa.
- **Rastro** (risco de areia, de chuva): fora do teto de corpo, porque borrão de movimento pode ser
  mais comprido que o grão que o produziu. A trava dele é outra: comprimento ≥ 6 × espessura. O
  risco de areia antigo tinha 4,4 de comprimento por até 5,0 de espessura — mais grosso que longo,
  ou seja, uma bolha.
- **Banco de névoa**: fora dos dois. Ele não é corpo, é volume; alpha baixo com raio grande é o
  único jeito de produzir volume.

O contrapeso de encolher é a **quantidade**: poeira foi de 26 para 62 partículas, cidade de 18 para
40. Custa mais laço e menos pixel, e o que incomodava era área coberta, não contagem.

Há também um piso, e ele foi medido na bancada: risco de chuva com 0,5 unidade de espessura
(0,75px no zoom padrão) **sumiu por completo** sobre a floresta. Abaixo de ~1,3px de tela o traço
não sobrevive ao antialias. Encolher demais é tão errado quanto o problema original.

### Cada preset tem silhueta própria, não só cor (PH-115, refeito no PH-232)

Até o PH-115 tudo era o mesmo círculo cheio, variando cor e tamanho. O PH-115 resolveu metade —
folha virou elipse que tomba, neve ganhou profundidade, areia virou risco — e **quatro presets
ficaram no default**: água sem máscara, poeira, cidade e brasa continuaram desenhando o mesmo
`ctx.arc`, ou seja, quatro dos nove biomas com a mesma bolinha.

Hoje a forma é um campo obrigatório (`Receita.forma`), sem default silencioso onde cair:

| forma | quem usa | o que emite |
|---|---|---|
| `folha` | folha, selva | elipse achatada que **tomba** no próprio eixo |
| `grao` | poeira, caverna, neve | ponto cheio — e só eles |
| `fiapo` | cidade | fibra **dobrada** (dois segmentos) rolando devagar |
| `risco` | areia | um segmento na direção do vento, comprimento ∝ velocidade |
| `faisca` | brasa | rastro curto + núcleo que pulsa de tamanho |
| `cintilo` | água | cruz de quatro pontas desiguais com núcleo quente |
| `anel` | água **com máscara** | elipse vazada que abre e desmancha (PH-113) |

`silhuetaPorPreset.test.ts` roda cada preset, agrupa as chamadas de canvas por caminho e reprova se
dois dos quatro ex-círculos voltarem a emitir a mesma assinatura. `poeira` continua sendo um ponto
puro **de propósito** (um grão de poeira *é* um ponto) e é o único com essa licença; o que o separa
da neve é escala, e o teste de proporção exige pelo menos 1,5x de diferença.

### Gota que cai e bate no chão (`src/render/gotas.ts`, PH-232)

Até o PH-232 nenhuma partícula do jogo tinha fim: toda uma delas atravessava a janela e renascia na
borda oposta. Sem contato com o solo, a partícula flutua em espaço de tela e o olho não tem contra
o que aferir o tamanho dela — é por isso que "deixar tudo menor" sozinho não resolveria a queixa, e
por que a chuva do PH-141 virava papel de parede depois de trinta segundos.

`gotas.ts` é uma implementação só, usada por duas camadas com números diferentes: a chuva de
`climaVisual.ts` e o gotejo de `selva`/`caverna` em `ambiente.ts`. Escrever duas vezes significaria
corrigir duas vezes o mesmo bug de reciclagem.

**Onde fica o "chão", já que não existe um.** A câmera é de cima com inclinação e o fundo é uma
imagem sem metadado de profundidade. Mas nessa projeção *todo* pixel do fundo é chão: a cena
inteira é o solo visto de cima. Então cada gota sorteia um `yChao` dentro da janela ao nascer e
desaparece ali. Não é aproximação preguiçosa — numa vista de cima, chuva cai sobre a área inteira,
não sobre uma reta na base da tela. `gotaBateNoChao.test.ts` reprova se os respingos se
concentrarem em menos de 50% da altura da janela.

Detalhes que não são cosméticos:

- O ponto de impacto é o **máximo** entre "um trecho à frente da gota" e "dentro da janela". Só o
  primeiro faria a gota reciclada (que nasce acima do topo) respingar fora da tela — falha
  silenciosa, o efeito só pareceria mais fraco. Só o segundo faria metade das gotas nascer já
  passada do próprio impacto e respingar todas juntas no primeiro quadro.
- `fracaoQuePousa` < 1 na chuva (0,55). Com 1,0 o chão inteiro pisca ao mesmo tempo e vira ruído.
- O respingo tem **alpha próprio** (`alphaDoRespingo`), maior que o da gota: ele apaga com o
  quadrado do tempo restante, então o alpha médio ao longo da vida é um terço do de pico.
- Pool de respingos de **tamanho fixo**, com rodízio ao encher. Em chuva forte nascem ~80 impactos
  por segundo; alocar um objeto por impacto poria o coletor de lixo para trabalhar a 60 quadros por
  segundo. Trancado por teste (200 gotas numa janela baixa, o pool não cresce).
- `origemFixa` (só o gotejo): a gota volta sempre ao mesmo ponto do mundo, com espera entre uma e
  outra. É o que separa "está chovendo" de "está pingando" — pingo de estalactite cai do mesmo
  lugar dezenas de vezes.

**Granizo ficou de fora**, e é escolha, não esquecimento: ele já tem rastro e quina para se
distinguir, e dois climas respingando ao mesmo tempo no bioma de gelo apagaria a diferença entre o
que machuca e o que não machuca.

### O vento é um só, para a cena inteira (`src/render/vento.ts`, PH-233)

Antes do PH-233 havia **três osciladores de vento** rodando ao mesmo tempo:

- `intensidadeDoVento` (PH-188), boa e calibrada, dirigindo **só** os presets `folha` e `selva`;
- uma senoide própria da areia de clima, `1 + sin(fase * 0.5) * 0.45`, sem relação nenhuma com a
  anterior;
- inclinação **fixa** na receita de todo o resto — a chuva caía sempre no mesmo ângulo, chovesse o
  que chovesse.

Numa floresta com chuva, isso dava folha entrando em rajada enquanto a chuva continuava reta. Cada
camada parecia um protetor de tela próprio rodando por cima do outro.

**O relógio é absoluto, e é isso que faz a unificação existir de verdade.** As duas camadas têm,
cada uma, o próprio acumulador de fase (`ambiente.faseGlobal`, `climaVisual.fase`) com o próprio
`ultimoInstante`. Se as duas apenas passassem a chamar a mesma função, chamariam com fases
diferentes — o mesmo bug com uma indireção a mais. Por isso `sincronizarVento(agora)` **atribui**
`fase = agora / 1000` em vez de somar. Daí saem quatro propriedades, todas desejadas:

- a ordem de chamada entre as camadas não importa;
- chamar duas vezes no mesmo quadro não adianta o vento (idempotente);
- camada que entra depois (o clima aparece no meio da luta) nasce na fase certa, não do zero;
- aba em segundo plano que volta com minutos de atraso pega o vento na fase nova. Isso é seguro
  aqui e **não** seria numa partícula: posição integrada com delta gigante teleporta, mas uma
  oscilação limitada em [0,1] só continua de outro ponto do ciclo.

Cada receita declara `empuxoDoVento` — quantas unidades de mundo por segundo o vento a empurra no
pico da rajada. **Não há default**: quem não declara não é empurrado, e a ausência do campo é a
declaração. Fora, por omissão deliberada: `caverna` e `poeira` (ruína, templo, dojo, covil) são
lugar fechado, e sopro dentro de uma gruta selada é pior que a incoerência que a issue veio
corrigir; a `agua` é reflexo de superfície, e reflexo não voa.

A direção é a mesma para tudo e não há eixo Y: o acervo inteiro já sopra para a **direita** (folha
em `PI/2+0.35`, areia em `0.1`, chuva em `+0.26`). Direção variável não acrescentaria nada que o
olho leia e obrigaria a re-calibrar nove receitas.

No clima, o empuxo entra numa velocidade **efetiva por quadro** (`vxEfetivo`/`vyEfetivo`), nunca em
`vx`/`vy` — aquelas são o estado permanente sorteado no nascimento, e somar vento nelas acumularia
vento sobre vento até a chuva sair de lado e nunca voltar. É a velocidade efetiva que
`desenharParticula` lê, e é por isso que a chuva **inclina** na rajada: o risco é traçado na
direção do deslocamento real.

Medido na bancada, correlação entre a intensidade do vento e a deriva horizontal de cada camada ao
longo de 60 instantes: **folha 0,999 · chuva 0,992 · areia de clima 0,999 · caverna 0** (amplitude
zero). `ventoCompartilhado.test.ts` tranca os dois lados — quem sopra e quem não pode soprar.

### A bancada visual (`scripts/harness/efeitos-do-mapa.html`)

`npm run dev` e abrir `/scripts/harness/efeitos-do-mapa.html`: os nove presets e os seis climas
lado a lado, sobre a arte real de cada bioma, na escala do jogo, com um POKE de tamanho real e uma
barra de 40 unidades em cada painel. Nenhum teste de unidade responde "isso está bom" — ela
responde.

A barra **"vento da cena"** no topo mostra a intensidade corrente (PH-233). Quando ela sobe, todos
os painéis que têm vento inclinam juntos; os fechados não se mexem. Rajada é efeito de *tempo* —
num quadro parado ela não aparece, então é preciso olhar a barra e a tela ao mesmo tempo.

Cada painel importa `ambiente.ts?painel=N` / `climaVisual.ts?painel=N`. A query é necessária: as
duas camadas guardam estado em variável de módulo (uma cena por vez, o que está certo no jogo), e
com uma instância só cada painel veria "a arte mudou" e repovoaria a cada quadro — quinze telas de
ruído parado. O Vite indexa módulo por URL completa, query inclusa.

**O vento é a exceção, e errar nela é fácil:** ele tem que ser importado **sem** query. Com
`?painel=N` a bancada leria um vento paralelo parado na fase 0, e o medidor mostraria uma linha reta
enquanto a cena inteira sopra. Foi exatamente o que aconteceu na primeira medição de correlação.

### Água: ondulação recortada por máscara pintada (PH-113)

O preset de água nasceu o mais discreto de todos porque **não sabia onde a água estava** — o
brilho passava por cima da terra também. A máscara levanta essa restrição:

- `scripts/agua-refs/<arte>.png` é a arte com **azul puro** (R<60, G<60, B>200) marcando água.
  Azul *puro* e não "azulado": o azul das artes é dessaturado e tem verde significativo (o mar de
  `sea` fica em ~(60,150,190)), então a própria água desenhada nunca conta como tinta.
- `node scripts/build-agua-mask.js` gera `src/data/generated/aguaMask.generated.ts` (grade por
  arte, célula de 20 unidades — a mesma da colisão). `--debug` escreve o overlay de conferência em
  `scripts/agua-debug/`, e **ele não é luxo**: porcentagem de células marcadas não diz se a máscara
  está certa, "17% de swamp" pode ser a água ou a copa das árvores.
- Componente conexo com menos de 25 células cai (sujeira de tinta em copa de árvore). O corte saiu
  de contar os componentes das cinco máscaras, e há sobreposição real: a sujeira de `lake`
  (22 células) é maior que dois fragmentos de água de verdade de `swamp` (19 e 9).
- `beach` é a única gerada por script próprio (`scripts/pintar-ref-beach.js`): naquela arte o mar
  separa por cor com margem grande (h 177-186, s 0,69-0,81, contra areia h=42 e palmeiral h=40), e
  as duas poças entram por geometria porque poça (h=73) cai em cima do palmeiral no espaço de cor.

**Não tente derivar a máscara da cor da arte no geral.** Foi medido e fechado no PH-113: água e
vegetação ocupam o mesmo ponto em matiz, saturação, luminância *e* variância neste acervo. Não há
plano separador — não é questão de calibrar melhor.

Com máscara, a partícula de água vira **anel** achatado que abre e desmancha. O anel cresce depois
de nascer, e o recorte do laço de desenho testa só o **centro** da partícula — por isso ele nasce
com folga de uma célula da margem e tem teto de raio em 0,8 célula. Sem as duas defesas, o traço
abre por cima da areia e nenhum teste de posição pega.

Arte de água **sem** referência pintada não muda em nada: mesmo brilho discreto, mesmas
partículas. O reforço é condicional à máscara, e é o que impede a areia de ondular.

### A regra dura: esta camada não encosta na simulação

Nada aqui pode tocar `world.rng` nem escrever no `WorldState`. Aquele gerador é autoritativo e
compartilhado com o resim do servidor: uma única chamada de sorteio a mais no cliente desloca a
sequência inteira e o flush passa a divergir do que o jogador viu (a classe de bug do PH-37), sem
dar erro nenhum — só faz o jogo mentir.

Então a camada tem gerador próprio (LCG local semeado pela URL da arte), vive só naquele módulo, e
o único estado dela é um array de partículas que morre na troca de arte. `ambiente.test.ts` tranca
isso estaticamente: nenhum import de `@/engine/*`, nenhuma menção a `world.rng`, nenhum
`Math.random`.

Desde o PH-232 a mesma varredura cobre `climaVisual.ts` e `gotas.ts`. O guard olhava um arquivo só,
e por isso passou despercebido por seis issues que `climaVisual.ts` **chamava `Math.random` direto**
na reciclagem por borda, apesar do cabeçalho dele dizer "sorteio local, igual `ambiente.ts`". Não
dessincronizava o servidor (não passa pelo `Rng` do mundo), mas fazia a camada ser diferente entre
sessões e entre jogadores sem motivo. `climaVisual.ts` continua com uma exceção legítima e nomeada:
ele importa o *tipo* `ClimaTipo` de `@/engine/types`, que é como ele sabe qual clima desenhar.

O ajuste "Vida no cenário" (`uiStore.vidaNoCenario`) desligado zera as partículas em vez de só
parar de desenhá-las.

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
