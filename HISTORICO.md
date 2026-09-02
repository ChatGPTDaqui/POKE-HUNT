# Histórico de desenvolvimento — NOVO POKE IDLE

Diário cronológico por leva de trabalho. **Não é carregado automaticamente em contexto** —
consulte por `grep` quando precisar do porquê de uma decisão específica.

## O que este arquivo é, e o que ele não é

- **É**: o registro mais denso de decisão do projeto. Medições que custaram sessões inteiras
  (40 sementes do farm pessimista, a prova do exploit de flush concorrente, o critério de
  escolha de arte, as armadilhas de cada pipeline de dado).
- **Não é**: descrição do sistema atual. Para isso, [`docs/`](docs/README.md), escrito lendo o
  código. Para regras operacionais de agente, `CLAUDE.md`.

## Leia com data na mão

Cada leva descreve o código **como ele era naquela rodada**. Muita coisa citada aqui não existe
mais em disco. Os casos maiores, para não custar uma sessão de busca a ninguém:

| Citado no histórico | Realidade hoje |
|---|---|
| `js/`, `css/`, `index.html` vanilla, `server.js` | cortados (`docs/01-arquitetura.md#o-que-foi-cortado`) |
| `web/src/...`, `cd web` | o app é a raiz desde `70d5561`; `web/` é diretório vazio |
| `server/src/app.ts`, `acoes.ts`, `mercado.ts`, `social.ts`, `ranking.ts`, `reiniciar.ts`, `node.ts` | deletados na migração RPC-everything; hoje só `appSessao.ts` + módulos |
| `cd server && npm run dev` | **não existe**; `server/package.json` só tem `build` |
| `Planilha mestra/dados_do_jogo.xlsx` como fonte | fonte é PokeAPI/Ultra Sun; geradores antigos bloqueados |

**A lógica de negócio descrita nas levas sobreviveu** às migrações — o que mudou foi onde ela
mora. `docs/04-autoridade-do-servidor.md` e `docs/08-social-e-mercado.md` dizem onde.

## Aviso de exposição

Este arquivo **está no git** (decisão de 2026-08-17: o risco de perda total, existindo só numa
máquina, pesava mais que o de exposição). O repositório é privado. Ele documenta sem filtro os
limiares anti-abuso do servidor — claim de flush, amostra mínima do piso do farm offline, janelas
de corrida. **Se o repositório virar público, este arquivo é um mapa de ataque**, pelo mesmo
motivo que `docs/README.md` já registra para `docs/04` e `docs/07`. Dois exploits críticos reais
(leva 5.6) exploravam exatamente esses pontos.

---

## Registro original (o `CLAUDE.md` como estava até 2026-08-17)

Daqui para baixo é cópia byte-a-byte do `CLAUDE.md` anterior à higienização. O preâmbulo dele
descrevia a si mesmo como "histórico cronológico + regras operacionais"; a parte operacional
foi para o `CLAUDE.md` novo, esta é a cronológica.

Aviso do texto original que continua valendo: **quando este arquivo e `docs/` divergirem, o
código decide, e depois `docs/`** — cinco constantes daqui já estavam erradas quando `docs/`
foi escrito (lista em [`docs/13-divergencias-conhecidas.md`](docs/13-divergencias-conhecidas.md)).

## Fonte de dados: o Postgres é a verdade (a planilha virou historico)

Conteudo de jogo (especies, movesets, golpes, itens, mapas/hunts, formulas, tabela de tipos) veio de
`Planilha mestra\dados_do_jogo.xlsx` (Pokemon Crystal/Gen2 real; nomes reais por decisao explicita
do usuario, projeto pessoal/privado). **Da Fase B da migracao Supabase em diante, a fonte do build e
o Postgres**, nao o `.xlsx`.

Balanceamento: editar linha no banco (ou `npm run catalog:migrar` apos mexer na planilha, enquanto
mantida) -> `npm run catalog:gerar` -> regenera `*.generated.ts`/`.js` -> jogo reflete. Nenhum
script escreve na planilha (risco: corromper arquivo grande feito a mao com XML-writer improvisado).

**Planilha e `sync-planilha.js` ficam no repo de proposito**: curadoria de hunts vive nele (gerador
novo reusa) e ela e o lado esquerdo do diff byte-a-byte. Nao apagar nenhum dos dois.

### A prova de que trocar a fonte nao mudou o jogo

`npm run catalog:verificar` roda os dois geradores, compara os **14 arquivos gerados** (7 `.ts`
React + 7 `.js` vanilla) **byte-a-byte** — nao "equivalente": ordem das chaves, espacamento e
arredondamento tambem sao comportamento do jogo. 14/14 identicos.

Diff achou **3 lacunas reais de schema** (dado seria apagado quando o `.xlsx` sumisse); corrigidas
por migration, nenhuma detectavel por leitura de codigo:

1. **Ordem das linhas e dado.** Chaves saem na ordem da aba: por assunto/tier, nao alfabetica.
   `sort_order` entrou em `formulas`, `items`, `species_moves`, `maps`, `map_encounters`. (17 tipos
   dispensaram coluna: ordem ja vive em `web/src/data/typeColors.ts`, hand-authored, conferida
   identica.)
2. **Especie pode aprender o mesmo golpe em dois niveis.** Forma evoluida herda no nivel 1,
   reaprende no nivel real dela (QUILAVA|SMOKESCREEN 1 e 6; TYPHLOSION|EMBER 1 e 12). PK
   `(species_id, move_id)` descartava **162 linhas** em silencio.
3. **Planilha tem linha literalmente repetida** (SEAKING|TAIL_WHIP|1, 2x). Preservada de proposito:
   corrigir aqui embutiria mudanca de jogo na migracao de fonte. Efeito: nenhum no combate
   (`progressionSystem` ignora golpe repetido), so a aba "Golpes" do perfil lista 2x. Limpar deve
   ser commit proprio e visivel.

Chave final de `species_moves`: `(species_id, sort_order)` — moveset e lista ordenada, posicao =
identidade da linha; acomoda casos 2 e 3 sem coluna sintetica.

Aba "Espécies" (+ "Movesets"/"Golpes") cobre o **National Dex inteiro #1-251** (Kanto e Johto, 11
lendarios); so "Locais_Info"/"Encontros" (especie por hunt) sao Johto-only (99 locais reais;
inspecao: zero linha de Kanto ou lendario). Dai "Novo Continente"/hunt lendaria ser curado a mao,
nao derivado do Encontros: stats/movesets 100% reais, so bandas/niveis a mao (espirito de
BG_ROUTE/CAVE/TOWER e bounds/spawnPoints, ja "conceito nosso").

- `scripts/xlsx-reader.js` — leitor `.xlsx` puro-Node (unzip + parse de XML manual): Python/openpyxl
  NAO funcionam neste Windows (so Node/npm).
- `scripts/sync-planilha.js` — gerador **antigo**, do `.xlsx` (`npm run planilha:aplicar`). Dono da
  **curadoria de hunts** (especie por bioma, `TYPE_BIOME_PLAN`,
  `buildTypeRoster`/`buildTypePoolQueues`/`buildTypeDrivenHunts`) e do emissor
  (`toJsLiteral`/`emitData`). `main()` so roda chamado direto (`require.main === module`); sob
  `require()`, so exporta.
- `scripts/generate-catalog.js` — gerador **atual**, do Postgres (`npm run catalog:gerar`). Le as 8
  tabelas de catalogo (paginado: `species_moves` passa de 1000 linhas, PostgREST corta em silencio),
  monta objeto na **mesma forma de um workbook** (mesmos nomes de aba/coluna), entrega pras funcoes
  acima sem alteracao — curadoria duplicada divergiria no 1o ajuste de balanceamento. Reconstroi,
  nao recalcula: hunt inicial (Route 46) e faixas dos 9 brackets saem de `maps`/`map_encounters`, ja
  que `pickTopHunts`/`computeJohtoBrackets` dependem de `Locais_Info`/`Encontros` (no schema, nao
  populadas).
- `scripts/migrate-catalog-to-postgres.js` — inverso, planilha -> Postgres
  (`npm run catalog:migrar`): idempotente, tudo por upsert.
- `scripts/verify-catalog-diff.js` — o gate (`npm run catalog:verificar`).
- `js/core/FormulaEngine.js` — motor de expressao seguro (sem `eval`) pras formulas da aba
  "Formulas" em runtime (`DAMAGE_BASE`, `CATCH_CHANCE`, `EXP_GAIN`, curvas de crescimento, etc.).

`js/data/*.js` (sem `.generated`): wrappers finos hand-authored, so logica (stats, sellPrice,
cooldown do PP, IVs, cor/forma de sprite), nunca dado hardcoded. Nunca editar `*.generated.js` a
mao: sobrescritos a cada sync.

## Estado atual (ultima rodada concluida)

- **Especies**: 221 = 90 originais (3 iniciais fixos Charmander/Squirtle/Bulbasaur + encontraveis
  nas 61 hunts de Johto + cadeias de evolucao) + **~130 novas** do "Novo Continente"/hunt lendaria
  (roster Kanto a mao em `scripts/sync-planilha.js#KANTO_BANDS`, 11 lendarios em `LEGENDARY_BAND`).
  Stats/tipo/moveset reais (National Dex completo); golpe em nivel diferente por especie
  (`species.abilities` = `[{key, levelReq}, ...]`). **Arte real nas 90** (`assets/battle-sprites/`,
  `assets/sprites*/`, `assets/sprites-face*/`): 32 da rede (PMD Collab), ~58 (Abra, Onix, Machop,
  Larvitar, Tauros, Unown, etc.) do checkout local SpriteCollab do usuario em
  `assets/SpriteCollab-master (1)/SpriteCollab-master/`; **as ~130 de Kanto/lendarios tambem**,
  mesmo checkout, via `scripts/import-kanto-sprites.js` (separado, hand-rodado
  `node scripts/import-kanto-sprites.js`, fora do `npm run planilha:aplicar`): `Nº Pokédex` ->
  `sprite/{dex4}`/`portrait/{dex4}` de especie sem `assets/battle-sprites/{id}/`; parse manual do
  `AnimData.xml` (resolve `<CopyOf>` quando anim nao tem PNG proprio); copia
  Idle/Walk/Shoot/Charge/Sleep/Faint (+ shiny, fallback pra normal quando shiny nao tem o anim) pra
  la + portrait `Normal.png` (+ shiny) pros 4 slots de icone; **mede `footOffsetFraction`**
  (`scripts/lib/png.js`, decoder PNG puro-Node novo, sem dep externa: indexado 4/8-bit com
  PLTE+tRNS, truecolor+alpha 8/16-bit) pela linha mais baixa com pixel opaco na celula Down/frame-0,
  nao no olho (inviavel pra 130). `js/data/pokeHeights.js`: alturas reais da Pokedex pras mesmas
  (dado publico; planilha nao tem). Os 3 hand-mantidos
  (`battleSpriteAnims.js`/`spriteFootOffsets.js`/`sprites.js`) sao atualizados por merge de texto,
  nunca do zero — seguro rodar de novo.
- **Fonte de arte por especie**: PMD Sprite Collab, por National Dex de 4 digitos (procedencia
  acima; checkout local dispensa rede, reutilizavel pra especies futuras):
  - Battle sprites normais: rede `https://spriteserver.pmdcollab.org/assets/{dex4}/sprites.zip`
    (zip) ou local `sprite/{dex4}/*.png` (arquivos direto, sem subpasta; `AnimData.xml` no mesmo
    lugar). 8 linhas de direcao — **exceto `Sleep`, 1 linha so**:
    `js/render/Sprites.js#drawBattleSprite` clampa as linhas pela altura real da imagem, pra nao ler
    fora dos limites.
  - Battle sprites shiny: rede `.../{dex4}/0000/0001/sprites.zip` ou local
    `sprite/{dex4}/0000/0001/*.png`, salvos como `<Anim>-Shiny-Anim.png` (mesmas dimensoes/duracoes,
    so paleta; `js/data/battleSpriteAnims.js` serve as duas). Pidgey/Sentret nao tem `Faint` shiny
    upstream: usam o `Faint-Anim.png` normal.
  - Icones de rosto (`assets/sprites-face/`, `assets/sprites-face-shiny/`) **e** icone "grande"
    (`assets/sprites/`, `assets/sprites-shiny/` — HUD/status detalhado) pras ~58 novas: mesmo
    portrait "Normal" 40x40 (rede `raw.githubusercontent.com/.../portrait/{dex4}/Normal.png` ou
    local `portrait/{dex4}/Normal.png`; shiny em `.../0000/0001/Normal.png`) — sem "box art" pra
    essas, os 2 slots reusam o portrait. Os 32 originais mantem os crops maiores (rip do fan sheet
    48056/48064) pro icone grande; so o rosto pequeno veio do portrait PMD.
  - `js/data/spriteFootOffsets.js` e `js/data/pokeHeights.js` estendidos igual (fracao do pé, altura
    real) pras ~58 novas.
- **`BASIC_ATTACK`** — unico golpe hardcoded (fallback "Struggle"): nenhuma especie/nivel fica sem
  golpe utilizavel (ex: Hoppip so aprende dano real no nivel 10).
- **PP -> cooldown**: menos PP = mais cooldown (`cooldown = TICK_SECONDS * (20/PP)`). PP nao e
  consumivel (fora de escopo).
- **Itens**: os 13 reais da planilha (bolas, pocoes, revives, varas); Loja vende os 10 nao-vara;
  varas sincronizam, pesca nao implementada (fora de escopo). Jogo novo: 10.000 de cada um dos 10
  vendaveis + 500.000 de ouro.
- **Hunts (Johto)**: `scripts/sync-planilha.js#pickTopHunts` pega **todo** local nao-Surf com
  encontro `Periodo=='day'` (61 reais); Surf fora (pesca/surf fora de escopo). Os 61 passam por
  `groupHuntsIntoBands` antes de virar `MAPS_DATA`: o de menor `avgLevel` (Route 46) fica
  **sozinho** como hunt inicial ("Route 46 (Inicial)"), pro POKE recem-escolhido upar sem risco;
  resto em faixas de 10 (`BAND_SIZE=10`, bucket por `avgLevel`) — 5 zonas: `lv_1_10`, `lv_11_20`,
  `lv_21_30`, `lv_31_40`, `lv_41_50` ("Zona Nivel X-Y"). Zona funde `enemyPool` da faixa (especie
  repetida vira 1 entrada, min/max combinado); `bg` usa o local-ancora (menor nivel do grupo) pra
  decidir rota/caverna/torre. **Hunt inicial com nivel maximo clampado em 2**
  (`STARTER_HUNT_MAX_LEVEL`, so o teto; minimo da planilha continua) — pedido explicito: starter Lv1
  nunca cruza nada acima de Lv2 no primeiro contato.
- **Hunts (Novo Continente / Kanto)**: `scripts/sync-planilha.js#KANTO_BANDS` — 4 zonas hand-curadas
  (`kanto_lv_1_10`, `kanto_lv_11_20`, `kanto_lv_21_35`, `kanto_lv_36_55`) + `LEGENDARY_BAND`
  ("Camara dos Lendarios", Lv60-70, 11 lendarios). `bandToHunt()` converte banda -> hunt de Johto
  (`speciesLevels`/`minLevel`/`maxLevel`), pelas mesmas
  `syncSpeciesAndMoves`/`syncMapsAndEncounters`; so "qual especie em qual banda" e manual, stats
  reais. `MAPS_DATA` entry carrega `continent: 'johto'|'kanto'`; `js/ui/panels/HuntMenu.js` so
  mostra abas (`Object.values(MAPS)` por continente) com mais de um continente. **A lendaria e a
  unica com `unlockCost`** (1.000.000 de ouro; `unlockMap()`/`EconomySystem.js` existia mas nunca
  usado) — capstone. As outras (Johto + Kanto) nascem desbloqueadas (`DEFAULT_UNLOCKED_MAPS` em
  `js/state/GameState.js` = todo mapa **sem** `unlockCost`); `GameState.fromSnapshot` faz uniao com
  `unlockedMaps` salvo, nao substitui: save antigo nunca fica com zona nova "trancada" so por ela
  nao existir quando foi salvo.
- **Spawn ponderado por raridade**: `encounter.weight` (de `syncMapsAndEncounters`) = peso do **tier
  de spawn**, derivado da chance REAL de encontro selvagem do Gen1/Gen2. `main.js#spawnEnemyAt`
  sorteia do `enemyPool` com `core/Random.js#weightedPick`, nao uniforme; `HuntMenu#huntOdds` usa o
  mesmo `weight` pra % real (nao 1/poolSize). Procedencia em "Tier de spawn" abaixo — **peso NAO e
  mais `catchRate`**, que media outra coisa.
- **Painel de detalhes da hunt**: clique no corpo do card (nao no botao Entrar/Desbloquear nem no
  icone "?") expande `.hunt-detail` abaixo: especie + icone de rosto + tipo(s) + % de spawn — logica
  do tooltip de hover (`huntTooltipHtml`), so clicavel/persistente (`expandedMapId`, padrao de
  `TeamMenu.js`/`BagMenu.js`).
- **Sprites**: fallback geometrico (placeholder): cor pelo tipo primario (`js/data/typeColors.js`),
  forma por hash da chave da especie (triangulo/circulo/quadrado/losango); sumiu na pratica desde a
  arte real das 90. Em batalha, especie escala pelo tamanho oficial da Bulbapedia
  (`js/data/pokeHeights.js#scaleForSpecies`, so aumenta nunca diminui, capado em 1.6x) **vezes
  `GLOBAL_BATTLE_SCALE=1.5` fixo** (sprites PMD pequenas demais pra tela) + sombra elipse nos pes
  (`js/render/Sprites.js#drawShadow`). "Chao" (pe real do sprite no frame, `Entity.groundOffset`)
  medido por especie em `js/data/spriteFootOffsets.js`: frames PMD tem padding vazio embaixo pro
  bounce, entao NAO e `frameHeight/2` (sombra flutuava longe abaixo do pe); voadores
  (Zubat/Golbat/Butterfree) saem com fracao ~0 de proposito. **`drawBattleSprite` ancora pelo centro
  do frame**, nao pelo edge de baixo: `topY = groundY - destH*(0.5 + footFraction)`; senao o
  padding-embaixo-do-pe escala junto com `destH` e o pokemon "flutua" sobre a sombra (bug real
  corrigido; so visivel depois do `GLOBAL_BATTLE_SCALE=1.5`, que amplificou o gap).
  `visualTopOffset` (ancora HP bar/nome), mesma formula:
  `frameHeight * (scale*(0.5+footFraction) - footFraction)`. Nome+nivel (`drawNameLevelTag`) reflete
  shiny (✨ + texto roxo): canvas nao usa as classes CSS `.shiny-tag`/`.shiny-name` dos menus,
  cor/emoji vao no `fillText`.
- **HP bar de batalha**: pill 100% canvas (`js/render/Sprites.js#drawHpBar`): track escuro
  arredondado + fill colorido (verde/laranja/vermelho por %, `js/data/hpBar.js#hpBarFillColor`).
  Revertida do chrome cropado do rip DS Black2/White2 (`assets/hp-bar/frame.png` no disco, nao mais
  importado) — pedido do usuario com print da barra simples.
- **Shiny**: taxa 200x a original (`js/data/pokes.js#SHINY_CHANCE_AT_MAX_CATCH_RATE`). Capturados
  entram na mochila no **Nivel 1** (`js/systems/CaptureSystem.js`), seja qual for o nivel selvagem
  em campo. Venda de shiny exige confirmacao (`js/ui/panels/confirmModal.js`) e fica fora do "Vender
  Tudo".
- **Venda em lote com selecao** (`ShopMenu.js#renderPokemonsTab`): alem do "Vender Tudo" (ja
  existente), a aba Pokemons da Loja tem checkbox por card + "Selecionar tudo" + "Vender
  Selecionados"; `selectedPokeUids` (module-level `Set`) guarda a selecao entre re-renders. Shiny
  nunca entra (sem checkbox, só um `.checkbox-spacer` pro alinhamento) — regra de seguranca do
  "Vender Tudo"; só sai via confirm individual.
- Auto-pot/auto-catch/auto-revive comecam **ligados**. Auto-revive: delay de 3s (`AUTO_REVIVE_DELAY`
  em `js/systems/AutoSystem.js`) com modal de contagem regressiva (`#revive-modal`) antes de
  reanimar.
- Mochila: abas "Pokemons"/"Itens" ("Loot" removida — categoria nao existe nos itens reais). Clique
  num poke (mochila ou equipe) expande status completos (`PokeStatDetail.js`, compartilhado); hover
  em swatch com poke da tooltip rapida (`js/ui/panels/pokeTooltip.js`).
- Equipe (`TeamMenu.js`): poke tem "Colocar em campo" (se nao ativo) e "Retirar da equipe" (se
  `gameState.team.length > 1` — sempre sobra pelo menos 1). `controller.removeFromTeam` (`main.js`)
  devolve o poke pra mochila; removendo o ativo em campo, reatribui `activeIndex`/troca o `poke` da
  entidade `player` in-place (padrao do `setActiveTeamIndex`).
- **Chat/log flutuante** (`#chat-log`, `js/ui/panels/ChatLog.js`): abas Mundo/Comercio/Log. Todo
  `eventBus.emit('toast', {..., channel})` com `channel:'combat'` vai SO pro log (sem toast solto);
  `'trade'`/`'world'` viram toast E ficam logados.
- **Painel de performance** (`#perf-stats`, `js/systems/StatsTracker.js`): Ouro/H, XP/H, Mobs/H,
  Shinys derrotados; totais em `gameState.perfStats` (persistem no save, sobrevivem a reload). Zera
  a cada `controller.enterMap()` (trocar de hunt reinicia — pedido do usuario) e no botao "Resetar".
  Ouro/H e XP/H com k/M (`PerfStatsHUD.js#formatRate`: 10000 -> "10k", 1250000 -> "1.3M") pra caber
  em nivel alto; Mobs/H e Shinys, numero cheio.
- **Sistema de nivel do Treinador** (`gameState.trainer = {name, level, exp}`,
  `js/systems/ProgressionSystem.js#grantTrainerExp`/`trainerExpProgress`): reusa a maquina de EXP
  cumulativo dos POKE (`totalExpForLevel`) com curva fixa (`MEDIUM_SLOW`; Treinador nao tem
  `growthCurve` propria). Ganha a mesma EXP do POKE ativo por kill (`main.js#handleEnemyDefeated`);
  level-up dispara toast igual ao de POKE. HUD dedicado (`.trainer-row` em `#hud`, acima da linha do
  POKE ativo): nome/nivel/barra de EXP — layout em "HUD" abaixo.
- **Bug corrigido: evolucao tardia nao aprendia golpes de niveis anteriores**:
  `ProgressionSystem.js#evolvePokeInstance` so herdava `unlockedAbilities` do POKE pre-evolucao —
  especie evoluida aprende em niveis diferentes, entao POKE que evoluisse depois do nivel de um
  golpe novo nunca o ganhava (só os de dali pra frente, via `grantExp`). Corrigido: apos trocar
  `speciesId`/`stats`, roda o loop de desbloqueio do `grantExp` pra **todos** os golpes de
  `newSpecies.abilities` com `levelReq <= pokeInstance.level` ainda nao desbloqueados. Retorno virou
  `{ species, newAbilities }` (era só a especie), simetrico com `grantExp`.

### Bug de clique em botao dentro de painel re-renderizado a 60fps (causa raiz, corrigido)

`renderHud()`/`renderPerfStats()` recriam o container **toda vez** (`updateHud()` roda a cada frame
do loop). Botao (`.evolve-tag`/`.perf-reset-btn`) recriado via `innerHTML =` por frame: clique de
mouse (mousedown e mouseup separados por dezenas de ms) cai em **duas instancias de DOM diferentes**
e o browser descarta o `click` em silencio (heuristica que cancela clique em drag). Sintoma: botao
"nao fazia nada", mas `.click()` via JS funcionava — logica certa, DOM destruido demais. Corrigido:
`HUD.js`/`PerfStatsHUD.js` viraram DOM incremental — estrutura uma vez (`container._built`),
elementos em `container._els`, frame seguinte so atualiza texto/width/display, nunca recria nodes.
Painel novo que re-renderize a cada frame E tenha elemento clicavel segue o mesmo padrao (nao so
`innerHTML =`).

## Sistema de raridade

Mecanica nova: todo POKE (nao só as ~130 especies de Kanto/lendarios, qualquer um) tem **raridade**
— Comum/Incomum/Raro/Ultra/Legendary/Mythic — sorteada por instancia, no espirito do roll de
`isShiny` (`js/data/pokes.js#createPokeInstance`): eixo **independente** de especie/hunt. Chance de
aparição por espécie/mapa vinha de `encounter.weight`/`weightedPick` (ver "Spawn ponderado por
raridade"); raridade é 2a camada, não mexeu nisso.

- **Dado central** (`js/data/rarity.js`): `RARITIES`, tabela hardcoded (não spreadsheet-driven como
  os knobs de economia: 6 linhas, não escalar): `weight` (soma 100: 69/22.7/7/1/0.25/0.05),
  `statMultiplier` (1/1.15/1.35/1.7/2.2/3x), `sellMultiplier` (1/3/10/40/150/600x), cor pra UI.
  `rollRarity()` usa o `weightedPick` (`core/Random.js`) do spawn ponderado. `rarityOf(poke)`
  centraliza fallback pra `comum`: save anterior não tem `poke.rarity`; toda leitura passa por ela,
  POKE antigo vira Comum sem migração nenhuma.
- **Stats**: `computeStatsAtLevel(species, level, ivs, rarityKey)` ganhou 4º parâmetro opcional:
  multiplica cada stat final (fallback 1x/Comum se omitido); os 4 pontos que ja recalculavam stats
  (`createPokeInstance`, `CaptureSystem.js`, `ProgressionSystem.js#grantExp`/`evolvePokeInstance`)
  passam `rarity`/`pokeInstance.rarity` — nunca recalcula do zero como Comum.
- **Valor de venda**: `EconomySystem.js#pokemonSellValue(level, baseExp, rarityKey)`, mesmo 3º
  parâmetro: fórmula da planilha × `sellMultiplier`; os 4 call sites (`awardKillLoot`,
  `sellBagPoke`, `sellAllBagPokes`, `ShopMenu.js`) e o balanço do Farm Offline
  (`offlineFarmModal.js`) passam a raridade do POKE vendido. `summary.captures`
  (`OfflineSimSystem.js`) carrega `rarity`: valor certo pra capturado com o jogador fora.
- **UI compartilhada** (`js/ui/panels/swatchHtml.js`): 2 pontos centrais, sem duplicar por tela —
  - `swatchHtml()` (já usado por Bag/Shop/Team/Hospital): moldura 2px da cor da raridade em todo
    ícone (`border-color` inline, `rarityOf(poke).color`).
  - `pokeNameTagHtml(poke, species)` devolve `${shinyTag}${rarityTag}${nameSpan}`; o par
    `shinyTag`/`nameSpan`, duplicado em 7 arquivos (`BagMenu.js`, `ShopMenu.js`, `TeamMenu.js`,
    `HospitalScreen.js`, `pokeTooltip.js`, `PokeStatDetail.js`, `offlineFarmModal.js`), virou 1
    chamada. `.rarity-tag`: badge contornado (não preenchido como `.type-chip`: não compete com
    nome/shiny) — aparece mesmo pra Comum (não é escondida).
  - Fora do padrão swatch, também com moldura: `PokeStatDetail.js#buildProfileHero`
    (`.profile-sprite-box`) e `HUD.js` (POKE ativo, `els.iconSlot` — padrão incremental dali:
    `rarity` entrou no dataset-guard de recriar o ícone, mais `.hud-rarity-tag` ao lado do
    `.hud-shiny-tag`).
  - Nota técnica: `pokeTooltip.js` e `swatchHtml.js` importam um do outro (`pokeTooltipHtml` pro
    hover, `pokeNameTagHtml` pro título) — circular ES module, seguro: as duas só usam o import
    dentro de função, nunca no topo (nenhum acessa o valor antes do grafo carregar). Verificado sem
    erro no console.

## Segunda leva de melhorias (21 itens): mochila, background infinito, combate, Modo Pesadelo, cadeado

- **Mochila: ordenar por raridade/IV/nivel** (`BagMenu.js`): `<select>` (Raridade/IV/Nivel) + botao
  de direcao (↓/↑), module-level `bagSortKey`/`bagSortDesc`. Ordena **copia** de
  `gameState.bagPokes` (`[...bagPokes].sort(...)`), nunca a ordem real. Raridade: rank ordinal novo
  (`js/data/rarity.js#RARITY_ORDER`/`rarityRank()`, distinto do `weight`, que roda pro lado
  contrario); IV: `averageIvPercent` (ja existia); nivel: `poke.level`.
- **Background infinito** (`Sprites.js#drawMapBackground`): branch `imageReady` cobre o **viewport
  visivel da camera** (`viewport.x/y/w/h`, margem de 300px pra pan), nao `map.bounds.width/height`;
  antes, zoom out/tela larga mostrava area preta fora dos limites. `Renderer.js#renderMap` passa
  `w: this.width / this.zoom, h: this.height / this.zoom`: o `ctx` recebe o viewport **depois** de
  `scale(zoom)`+`translate(-camera)` — sem dividir, ficava menor que a area visivel com `zoom < 1`.
- **Starters previsiveis + sprite animada na selecao**: `STARTER_LEVEL` (`main.js`) virou `1` (era
  10). `createPokeInstance(speciesId, level, { ivs, rarity })` ganhou 3º parametro opcional:
  `ivs`/`rarity` pulam `rollIvs()`/`rollRarity()`; `chooseStarter` sempre passa
  `{ ivs: FIXED_STARTER_IVS (23 em cada stat, = 75% de 31), rarity: 'comum' }`. `StartScreen.js`
  troca `swatchHtml` por `gen5SpriteUrl(species.id, false)` (sprite animada do perfil): GIF anima
  sozinho, sem frame-slicing.
- **Texto de combate: cor por tipo + segue o POKE + nunca sobrepoe** (`Effect.js`, `Entity.js`,
  `CombatSystem.js`, `Sprites.js`): antes, snapshot de `targetX/targetY` no spawn (nao seguia o
  POKE) + offset fixo por tipo, a mao. Agora `Entity` tem `effectLanes` (`{id, lane}`) +
  `claimEffectLane()`/`releaseEffectLane()`: `Effect` com `owner` toma a menor raia livre acima
  dela, liberada no cleanup do `CombatSystem.js#updateCombat` (antes do filter).
  `drawDamageNumber`/`drawAbilityName`/`drawRewardText` (`Sprites.js`) compartilham
  `effectAnchor(effect)`: com `owner`, recalcula **todo frame** de
  `owner.x`/`owner.y - visualTopOffset(owner) - 30 - lane*16`. Simultaneos empilham acima do sprite
  (e do name/level tag) e seguem o POKE, sem nunca se sobrepor. `announceAbility` passa
  `color: colorForType(ability.type)`: antes nunca setado, caia no fallback cinza-azul.
- **Icones de skill menos transparentes**: gradiente do `AbilityHUD.js` trocou alphas hex `55`/`22`
  (≈33%/13%) por `e6`/`b3` (≈90%/70%) — mesmo tint por tipo, so mais solido.
- **Equipe: poke ativo sobe pro topo da lista**: `controller.setActiveTeamIndex` (`main.js`) faz
  `gameState.team.splice(index,1)` + `unshift(poke)` + `setActiveIndex(0)` antes do swap in-place do
  `player.poke` que ja existia; `TeamMenu.js` nao mudou, ja renderiza em ordem de array.
- **Botao de zoom discreto**: zoom ja existia (`Renderer.js`, Ctrl+Scroll), faltava UI. Novo
  `Renderer.js#zoomStep(direction)` (`ZOOM_STEP=0.1`, mesmo clamp `MIN_ZOOM`/`MAX_ZOOM`).
  `#zoom-control` fixo (`index.html`, top-right, abaixo do nav): botoes `−`/`+` + `%` atual, wireado
  em `main.js` (`syncZoomLabel()` no wheel e nos botoes).
- **Modo "Aura"**: IV 31 (max) num atributo da contorno neon discreto no POKE em campo — HP verde,
  Atk Fis vermelho, Atk Esp roxo, Def cinza, Def Esp azul, Velocidade amarelo
  (`js/data/auraColors.js`). `Sprites.js#drawAura` (em `drawEntity`, antes do sprite/placeholder)
  desenha "auréola" (`ctx.shadowBlur`+`strokeRect` arredondado) por stat maxado, no retangulo do
  `drawBattleSprite` (extraido pra `spriteBounds(entity)` compartilhada; fallback: circulo de
  `entity.radius` sem sprite). Multiplos maxados = camadas com `globalAlpha` 0.5, pra distinguir as
  cores sobrepostas.
- **Filtro de tipo no menu de Hunts** (`HuntMenu.js`): `<select id="hunt-type-filter">` nativo
  (print de referencia do usuario): "Todos os elementos" + os 17 tipos de
  `typeColors.js#TYPE_COLORS` (sem Fairy — nao existe nesse dataset Gen2), ordem alfabetica. Mapa
  "casa" se algum `species`/`species2` de algum encontro do `enemyPool` bate o tipo
  (`huntHasType()`, reusa `huntOdds()`) — esconde (`display:none`) os que nao batem.
- **Modo Pesadelo + hunts BOSS** (`js/data/nightmareMaps.js`, novo) — **totalmente gratis** (decisao
  do usuario, sem gate/custo): runtime, fora do `scripts/sync-planilha.js` (so transformacao
  mecanica de dado ja sincronizado, level +100; seguro contra o proximo `npm run planilha:aplicar`).
  `buildNightmareMirror()`: clona as 10 hunts normais (Johto + Kanto, **exceto** `legendary_lair`)
  com `id: nightmare_${id}`, nome + `" (Pesadelo)"`, `continent: 'nightmare'`, `minLevel`/`maxLevel`
  +100 por encontro. `buildBossHunts()`: 11 hunts `boss_<especie>` (`LEGENDARY_BAND.species`
  lowercased), `"BOSS " + species.name`, `maxEnemies:1`, `noRespawn:true` (novo), 1 encontro fixo
  nivel 300. `MAPS`/`ENCOUNTERS` (`js/data/maps.js`/`enemies.js`) mesclam
  `NIGHTMARE_MAPS_DATA`/`NIGHTMARE_ENCOUNTERS_DATA`. Respawn do `main.js#stepWorld` ganhou
  `&& !world.mapDef.noRespawn`: boss spawna 1x por visita, volta ao reentrar
  (`world.enemies`/`currentWorld` nunca persistidos; sem estado novo).
  `GameState.js#DEFAULT_UNLOCKED_MAPS`: `maps.generated.js` → `MAPS` de `data/maps.js` (merge
  nightmare/boss), senao hunt nova (sem `unlockCost`) nasceria trancada.
- **Filtro de raridade na Loja** (`ShopMenu.js`): checkboxes por raridade (cores de `RARITIES`,
  marcadas por padrao) na aba "Pokemons" — `selectedRarities` (Set module-level), `renderList()`
  ganhou `.filter(({poke}) => selectedRarities.has(rarityOf(poke).key))` junto do filtro de IV.
- **Cadeado: trancar POKE/item contra venda** (`GameState.js`, `EconomySystem.js`, `BagMenu.js`,
  `ShopMenu.js`): `poke.locked` (boolean, campo novo — save antigo nao tem a chave: `undefined` e
  falsy, padrao do `poke.rarity`) e `gameState.lockedItems` (`{itemId: true}`, plain object em vez
  de `Set` de proposito: serializa com `JSON.stringify`, `Set` viraria `{}` no save). `GameState.js`
  ganhou `toggleItemLock()`/`isItemLocked()`; `BagMenu.js`, botao 🔓/🔒 por card (Pokemons e Itens).
  `EconomySystem.js#sellBagPoke`/`#sellAllBagPokes`/`sellItem`/`#sellAllItems` recusam trancados
  (defesa em profundidade: `ShopMenu.js` tambem exclui trancado do lote — mesma regra do shiny).
- **Emojis nos nomes dos menus** (`index.html#bottom-nav`): 🧑‍🤝‍🧑 Equipe, 🎒 Mochila, 🗺️ Hunts,
  🛒 Loja, 🏥 Hospital, ⚙️ Config; 🤖 pro botao novo "Auto" (ver abaixo), pra nao colidir com a
  engrenagem do Config.
- **Sprite de ataque: duracao pelo numero de frames** (`CombatSystem.js#resolveHit`): antes,
  `duration: 0.5` fixo pra todo `attackGraphic`: sheet de 10 frames tocava mais rapido (mesmo tempo
  total) que um de 2, nunca "durava mais". Agora
  `duration = frames.length > 1 ? frames.length * ATTACK_GFX_FRAME_DURATION (0.09) : STATIC_ATTACK_GFX_DURATION (0.45)`
  — animados tocam em ritmo fixo por frame (~11fps); sem frame detectado (estaticos) mantem duracao
  proxima da antiga.
- **Hospital vira cena, nao modal** (`UIManager.js`, `main.js`): antes, "Hospital" no nav disparava
  **os dois**: `controller.returnToHospital()` (troca a cena do canvas) **e**
  `openScreen('hospital')` (modal DOM por cima, `HospitalScreen.js`, deletado). Agora o branch de
  `hospital` no `_wireNav` so faz `returnToHospital()` + `closeScreen()` +
  `_highlightNav('hospital')` — cura 100% na enfermeira do canvas (ja existia,
  `NURSE_CLICK_RADIUS=30`). Listener novo `canvas.addEventListener('mousemove', ...)`: cursor
  `pointer` sobre ela (mesmo hit-test), `default` fora — so na cena do Hospital
  (`!currentWorld.mapDef`).
- **"Auto" vira botao compacto flutuante** (`js/ui/panels/autoFloatingPanel.js`, novo): fora do
  `#bottom-nav`/`PANEL_RENDERERS`, virou `#auto-toggle-btn` (🤖) acima do `#perf-stats` (ambos no
  wrapper novo `#bottom-left-stack`, flex-column, bottom-left). Clicar abre card (`position:fixed`,
  ~280px, direto no `<body>`, **nao** passa por `UIManager.openScreen`/`#overlay-root`) reusando
  `renderAutoPanel()` sem alteracao: evita o `backdrop-filter:blur` de `#overlay-root:not(:empty)`,
  pedido explicito: ver o campo de batalha com o painel aberto. Fecha por "X" ou clique fora
  (`mousedown` no `document`, listener com `setTimeout(...,0)` pra nao fechar no mesmo clique que
  abriu).
- **Menus mais compactos** (`css/style.css#.screen.compact`, `UIManager.js#_renderScreen`): todo
  `.screen` restante (Equipe/Mochila/Hunts/Loja/Config; Hospital e Auto sairam do sistema) ganha
  classe `compact`: em vez de `inset: 36px 8px 44px 8px` quase-fullscreen, card central
  (`top/left:50%` + `translate(-50%,-50%)`, `width: min(480px, 100vw-32px)`,
  `max-height: min(78vh, 640px)`) — campo de batalha visivel nas bordas. "Cidade" (do pedido) nao
  existe como tela: leitura foi cena do Hospital, fora do escopo por nao ser mais `.screen`.
- **Bug corrigido: nav ficava preso atras do backdrop do overlay** (achado na verificacao desta
  leva, nao pedido explicitamente mas quebrava a UX de "trocar de menu direto"): `#overlay-root` e
  `inset:0` com `pointer-events:auto` com `.screen` aberta (pro click-fora-fecha); z-index dele (30)
  > `#bottom-nav`/`#zoom-control`/`#bottom-left-stack` (10), entao clique no nav com outro menu
  aberto acertava o backdrop (fechava o menu) em vez do botao (que abriria o novo): 2 cliques pra
  trocar de tela. Corrigido: os 3 subiram pra z-index 35 (acima do overlay-root, abaixo dos modais
  de verdade como `.confirm-modal-overlay`/`.level-up-splash`), sempre clicaveis mesmo com `.screen`
  por cima.

## Terceira leva: aura por silhueta, mapa 2x maior com limite circular

- **Aura por silhueta em vez de moldura quadrada** (`js/render/Sprites.js#drawAura`): antes,
  `strokeRect` arredondado no bounding-box inteiro do frame; com o padding transparente dos frames
  PMD (pro bounce), lia como "moldura", não contorno no POKE (pedido do usuario pra corrigir).
  Trocado por "shadow-cast": `currentFrameSource(entity)` (extraido de `drawBattleSprite`, agora
  compartilhado) devolve o recorte do frame atual; `drawAura` desenha esse recorte com
  `ctx.shadowColor`/`ctx.shadowBlur` (sem offset) — canvas borra a **forma real de alpha**, ignora
  as cores originais, e o halo abraca a silhueta (patas, orelhas, cauda...), não o retangulo. A
  copia que lança a sombra tem alpha reduzido e é coberta na hora pelo `drawBattleSprite` real: só o
  brilho que vaza da silhueta fica visivel. Fallback (sem sprite): circulo ao redor do
  `entity.radius`.
- **Mapa de hunt 2x maior, spawn no centro, limite caminhavel circular** (pedido do usuario):
  `bounds`/`playerSpawn` hand-authored do `scripts/sync-planilha.js` (nao vem da planilha) dobraram
  de `1400x900`/`(700,450)` pra `2800x1800`/`(1400,900)`; spawn já era o centro dos bounds, "nasce
  no meio" saiu de graça. Hunts BOSS do `js/data/nightmareMaps.js` (bounds proprios, hardcoded, fora
  do pipeline) dobraram igual. Rodado `npm run planilha:aplicar` pra regravar `maps.generated.js`
  (só leitura; os bounds não vêm dela). Novo `js/data/maps.js#mapWalkRadius(mapDef)` =
  `Math.min(bounds.width, bounds.height) / 2`: círculo inscrito na menor dimensão, centrado.
  `js/systems/MovementSystem.js`: clamp retangular (`minX/minY/maxX/maxY`) → circular
  (`clampToMapCircle`: ponto fora do raio volta pra borda), no `wanderFreely` do player (amostra
  **por área** via `sqrt(random())*radius`, não só por raio, senão concentraria no centro) e no
  `wanderStep` dos inimigos (ao redor do `spawnPoint`, clampado pro círculo se o wander empurrar pra
  fora). `main.js#randomSpawnPoint`, mesmo esquema. `moveToward` (perseguição/combate) segue sem
  clamp — não é requisito nem existia no retangular.
- **Removida a borda preta (`strokeRect`) nos limites do mapa** (`Sprites.js#drawMapBackground`) —
  pedido do usuario ("remover vestigios que indicam o fim do limite caminhavel"); o limite agora é
  só o clamp de movimento invisível, sem marcação visual nenhuma.
- **Bug real encontrado durante a verificacao desta leva: costura visivel no fundo tileado** — o
  fundo (`assets/Hunt background.png`) é "uma cena única detalhada, não uma textura pequena feita
  pra repetir sem costura" (nota já no topo do `sync-planilha.js`). Antes:
  `ctx.createPattern(img,'repeat')`, invisível porque o mapa (metade do tamanho atual) cabia numa
  cópia do tile. Dobrado o mapa, o círculo passou a tocar a borda superior (`y=0`) dos bounds — com
  zoom out (ou a margem de 300px) a câmera via o **wrap** do pattern (topo da imagem colado embaixo
  do fundo dela): risca escura cortando o mapa (achado ao vivo com o hook de debug, player na borda,
  zoom 50%; não era a borda preta antiga, já removida). Corrigido: `createPattern('repeat')` → um
  único `drawImage` centrado no mapa; a imagem (escalada por `HUNT_BG_TILE_SCALE`) já é maior que o
  mapa nas duas dimensões, um desenho cobre o círculo sem costura — só em zoom out extremo na borda
  a câmera vê além dela, caindo num preenchimento liso (`primary`, cor de tema do bioma), não preto
  ou costura.

## Quarta leva (20 itens): combate corpo-a-corpo, janelas arrastáveis, busca, layout da loja

- **Engajamento sempre corpo-a-corpo** (`CombatSystem.js#engageRangeFor`): bônus de alcance 3x pra
  golpes especiais (`SPECIAL_RANGE_MULTIPLIER`) removido — todo POKE, físico ou especial, só entra
  em combate (e só ataca) perto do alvo (raio+raio+padding), pedido do usuario ("esperar chegar
  perto pra atacar"). `hasSpecialAttack` (só existia pra esse bônus) saiu junto, sem uso.
- **Foco automático em shiny** (`MovementSystem.js#findNearestAliveShiny`): havendo shiny vivo na
  hunt, o player troca de alvo na hora (o mais perto, se houver mais de um), por cima de qualquer
  perseguição/luta em andamento — só cai pro alvo mais próximo comum sem nenhum shiny na área.
- **Textos de combate: coluna alinhada à esquerda + raia dupla pra "Super efetivo!"**
  (`Sprites.js`/`Entity.js`/`Effect.js`/`CombatSystem.js`): `textAlign` de todo texto flutuante
  (dano/golpe/recompensa) virou `'left'` (era `'center'`), ancorado num x fixo
  (`EFFECT_COLUMN_X_OFFSET`) à esquerda do POKE; antes cada texto centralizava no próprio meio
  ("-12" vs "Super efetivo!") e a coluna "bailava"; agora cresce pra direita do mesmo ponto, fila
  reta. Achei (e corrigi) bug real de sobreposição nisso: `Entity#claimEffectLane` só reservava 1
  raia de 16px, mas hit com label de efetividade desenha DUAS linhas (label ~12-14px acima do
  número) — ganhou `size` (`claimEffectLane(id, size)`) e `spawnDamageNumber` passa `laneSize: 2`
  havendo label: dobro do espaço, sem colidir com a raia de cima. "Super efetivo!"
  (`effect.effectiveness === 'super'`) usa fonte maior (`bold 13px` vs `9px` dos outros labels) —
  pedido do usuario, só não pode invadir a raia vizinha, e o `laneSize:2` garante isso.
- **Escala das sprites revertida (exceto lendários)** (`pokeHeights.js`): `GLOBAL_BATTLE_SCALE`
  (1.5x flat de uma leva anterior) voltou pra `1` — pedido do usuario pra desfazer aquele aumento.
  Só as 11 espécies lendárias (`LEGENDARY_SPECIES_IDS`, novo `js/data/legendaries.js` compartilhado
  com `nightmareMaps.js`, que já tinha essa lista duplicada localmente) mantêm
  `LEGENDARY_BATTLE_SCALE = 1.5`, imponentes nas hunts BOSS.
- **Barra de HP customizada dos lendários** (`Sprites.js#drawHpBar`): com `entity.species.id` em
  `LEGENDARY_SPECIES_IDS`, a barra sai 5x mais larga e 2x mais alta; a folga acima do sprite
  (`visualTopOffset(...) - 8 - height`) escala junto com a altura, mesma distância visual nos dois
  casos.
- **Sprite de golpe AOE do tamanho real da área de efeito**
  (`Effect.js`/`CombatSystem.js#resolveHit`/`Sprites.js#drawAttackGraphic`): `Effect` ganhou
  `worldSize` (só quando `ability.target==='aoe'`, valor = `ability.radius * 2`, o diâmetro real do
  splash); `drawAttackGraphic` usa `effect.worldSize || ATTACK_GRAPHIC_SIZE` como base — AOE aparece
  do tamanho da área que atinge, não do fixo de single-target.
- **Bug real corrigido: golpes Ghost com efeito visual quebrado**: `Shadow-Ball.png` (fallback GHOST
  do rip) é PNG indexado **sem chunk `tRNS`** — zero transparência real (chunks lidos com
  `scripts/lib/png.js`); o xadrez branco/cinza que parecia "transparência" era pixel pintado. Todo
  golpe Ghost sem golpe próprio (Spite/Curse/Lick/Destiny Bond/Night Shade, no fallback por tipo)
  desenhava caixa cinza sólida, não esfera roxa flutuante. Corrigido no browser (`javascript_tool`,
  técnica do "Segundo lote de arte de golpe"): watermark de crédito do rodapé recortado (achado por
  saturação por linha: arte roxa/saturada, watermark cinza/preto) + chroma-key nos
  cinza-claro/branco (baixa saturação, alto brilho) pra alpha=0, só a esfera roxa sobra. Salvo em
  `assets/move sprites/processed/shadow-ball-clean.png`; 11 frames da coluna direita (bola crescendo
  até estourar; a esquerda é outro efeito de partículas, não usada) curados a mão em
  `extraAttackGraphicFrames.js`, e `attackGraphics.js#TYPE_FALLBACK.GHOST` aponta pro limpo.
- **Ícones de habilidade sólidos + bordas mais grossas** (`AbilityHUD.js`/`style.css`): fundo do
  slot trocou gradiente translúcido (`${typeColor}e6/b3`) por `background: ${typeColor}` direto;
  border do `.ability-slot` 2px→4px, bolinha verde de marca AOE (`.ability-slot.aoe::after`)
  8px/borda 1px→12px/borda 2px. De brinde, corrigida tag `<div>` que nunca fechava (faltava o `>`
  antes do `<span>` do label) — inofensivo (o parser HTML absorvia), mas errado.
- **Sem desfoque do jogo atrás de menus** (`style.css`): `backdrop-filter: blur(...)` removido de
  `#overlay-root:not(:empty)` (backdrop de `.screen` aberta) e de `.confirm-modal-overlay` (usado
  por `confirmModal.js`/`PokeProfileModal.js`) — o escurecimento (`rgba(...)`) continua, só o blur
  saiu, pedido do usuario. O `blur(6px)` do `.panel` genérico ("vidro fosco" de todo painel/HUD) não
  muda — é decoração do painel, não do jogo atrás.
- **Janelas arrastáveis** (`js/ui/draggable.js`, novo): `makeDraggable(el, handle)` — no mousedown
  sobre `handle` (ignora clique em botão/input/select/link/`.no-drag`, pra não quebrar controles na
  área arrastável), congela a posição em `left/top` com `position:fixed` (funciona pra centralizados
  via `top/left/transform` e via flexbox — `.confirm-modal-overlay` usa `justify-content:center`) e
  segue o mouse até soltar. Ligado nas 5 telas principais (`UIManager.js`, nova `.screen-topbar`
  não-rolável serve de alça), `PokeProfileModal.js` (alça = arte do sprite), `offlineFarmModal.js`
  (alça = título "Bem-vindo de volta!") e `autoFloatingPanel.js` (alça = nova
  `.auto-floating-topbar`). Splashes/toasts/o modal de confirmação simples (`confirmModal.js`)
  ficaram de fora de propósito: são avisos transitórios, não "janelas".
- **Botão fechar e cabeçalho sempre fixos, rolagem/seleção preservadas**
  (`UIManager.js`/`style.css`/`TeamMenu.js`/`BagMenu.js`/`HuntMenu.js`/`ShopMenu.js`/`SettingsScreen.js`):
  `.screen` deixou de rolar por inteiro — flex-column com `overflow:hidden`, `.screen-topbar` fixo
  (botão X + alça de arrastar) e `.screen-body`, a única parte que rola. Cada painel envolve
  título/abas/filtros num `.screen-sticky-header` (`position:sticky; top:0`): gruda no topo do
  `.screen-body`, fundo sólido pra a lista não aparecer por baixo. `UIManager._scrollPositions`
  (objeto na instância, chave = nome da tela) salva `body.scrollTop` a cada scroll e restaura no
  próximo `_renderScreen()` — todo filtro/ordenação/toggle já chamava `refresh()` (=
  `_renderScreen()` do zero), então isso sozinho resolvia o scroll resetando por clique; sobrevive a
  close+reabrir (o estado mora na instância, não no DOM recriado). Seleção de aba/filtro
  (continente, tipo, raridade, IV min/max, ordenação) já sobrevivia sozinha: estado a nível de
  módulo em cada painel.
- **Busca por nome na Mochila e na Loja** (`BagMenu.js`/`ShopMenu.js`): aba Pokemons de ambos ganhou
  busca. Filtra em cima do array já renderizado (mostra/esconde via `card.style.display`, sem
  `refresh()`) — mesma técnica de `HuntMenu.js#applySearch`, necessária pra digitar sem perder o
  foco a cada tecla (um `refresh()` por tecla recria o input do zero, tirando o foco no meio da
  digitação — bug que existiria se eu tivesse ligado o typo direto no `refresh()`, como fiz numa
  primeira tentativa, corrigido antes de finalizar).
- **Loja: coluna de venda ao lado da de compra** (`ShopMenu.js`/`style.css`): aba Itens virou 2
  colunas lado a lado (`.shop-columns`/`.shop-column`, flexbox) em vez de empilhadas — Comprar à
  esquerda, Vender à direita.
- **Botão Auto 2x maior** (`style.css#auto-toggle-btn`): fonte 10px→20px, padding 5px 10px→10px
  20px.
- **Emoji da Equipe trocado** (`index.html`): 🧑‍🤝‍🧑 → ⚾ (não existe emoji Unicode de Pokébola; a
  bola de baseball foi o mais próximo em cor/forma redonda entre as opções padrão).
- **Cópia distribuível do jogo**: `C:\Users\Mark2\Documents\NOVO POKE IDLE - Distribuicao\` —
  `robocopy /E`, excluindo só o não necessário pra RODAR o jogo (nenhum dado de jogo removido):
  `.claude/` (sessão do Claude Code) e 2 fontes de importação já consumida, nunca lidas em runtime
  (grep em `js/`/`scripts/` confirma) — `assets/SpriteCollab-master (1)/` (1.6GB, usado 1x por
  `scripts/import-kanto-sprites.js`) e `assets/sprites.zip` (849MB, órfão, sem referência). 2.7GB →
  205MB sem tirar nada usado. Testado: `node server.js` na copia, porta 5174, joguei até escolher
  starter e entrar no Hospital — zero 404, zero erro de console. Ganhou `LEIA-ME.txt` com como rodar
  (`Jogar NOVO POKE IDLE.exe` ou `node server.js`) pra quem receber a pasta sem contexto.

## Quinta leva (10 itens): dificuldade das hunts BOSS, textos de combate, balanceamento, Modo Pesadelo

- **Hunts BOSS ficam sem rede de segurança**: flag
  `isBossHunt = Boolean(world.mapDef && world.mapDef.noRespawn)` em `AutoSystem.js#updateAutoHeal`;
  campo ja marcava exatamente as 11 hunts BOSS (`noRespawn: true`), sem campo novo. `true`:
  auto-pot, auto-revive e `world.reviveCountdown` (alimenta o modal) pulados por inteiro,
  **independente** de `autoPot`/`autoRevive` — morte em BOSS e definitiva. Modal de contagem ->
  `#boss-defeat-modal` (`UIManager.js`, `_updateBossDefeatModal()`), visivel com
  `world.mapDef.noRespawn && world.player.fainted`: aviso vermelho "Voce foi derrotado!" + botao
  "Volte para Hospital e nao pise mais aqui" -> `controller.returnToHospital()`. Conteudo fixo, so
  visibilidade muda: montado **uma unica vez** no construtor (innerHTML uma vez, listener no botao),
  sem rebuild por frame — dispensa o padrao incremental de DOM do HUD/perf-stats e o risco de matar
  o botao no meio do clique (ver "Bug de clique em botao..."). Ao vivo: BOSS Articuno (Lv300) vs
  POKE Lv17 cai na 1a luta, modal aparece, botao leva pro Hospital, desmaio persiste ate a
  enfermeira curar; nenhum auto-revive disparou.
- **Bug real corrigido: nome do golpe cobrindo o nome do POKE**: golpe (`drawAbilityName`, lane 0)
  nascia so 30px acima do sprite (`EFFECT_BASE_GAP`); nome do POKE (`drawNameLevelTag`) ocupa ate
  ~35px (fonte + contorno de 3px). ~4px de folga: golpe lia colado/sobreposto com os dois proximos
  no tempo. `EFFECT_BASE_GAP` `30` -> `44` em `Sprites.js`.
- **Bug real corrigido: contorno borrado em M/W/V**: `ctx.lineJoin` nunca setado, default `'miter'`;
  cantos agudos (M, W, V) geram "espinhos" alem do contorno pretendido, lendo como borrao em fonte
  pequena (9-13px monospace). `ctx.lineJoin = 'round'` em todo `strokeText` do campo de batalha
  (`drawNameLevelTag`, `drawDamageNumber`, `drawAbilityName`, `drawRewardText`, `drawNpcMarker`).
- **Hunt Analyser (painel Ouro/H, XP/H) passa a contar catch-up silencioso**: ouro/XP por kill ja
  era **identico** nos dois sistemas (Farm Offline e jogo ao vivo chamam a mesma
  `awardKillLoot`/`grantExp`), sem divergencia de formula. Divergencia real:
  `StatsTracker.recordKill` so rodava em kills `!silent`; no catch-up de aba minimizada (`main.js`'s
  `visibilitychange`) os kills aconteciam (mesmo pipeline) mas nunca entravam no painel, e
  `elapsedHours` contava tudo — Ouro/H e XP/H pareciam menores que a farmagem real sempre que o
  navegador throttlava a aba. Fix:
  `StatsTracker.js#recordBatch(gameState, {gold, xp, mobs, shinys})`, uma vez apos o
  `simulateWorldSeconds(...)` do catch-up, com o resumo agregado
  (`summary.gold`/`xp`/`kills`/`shinySeen`) do Farm Offline: dois caminhos, mesmo criterio.
- **XP -60%, Ouro +300%**: `XP_GLOBAL_MULTIPLIER` (`ProgressionSystem.js`) e
  `GOLD_GLOBAL_MULTIPLIER` (`EconomySystem.js`) ja eram knobs do "Balanceamento de economia" —
  fallback `1` -> `0.4` (XP) e `4` (ouro; +300% = 4x o total anterior). Editavel na planilha depois
  de colar as linhas na aba "Fórmulas", mesma regra de sempre.
- **Hunts de Kanto +50 níveis**: `scripts/sync-planilha.js#KANTO_BANDS` — 4 bands
  (`kanto_lv_1_10`...`kanto_lv_36_55`), `minLevel`/`maxLevel` +50 (1a zona era Lv2-12, agora
  Lv52-62), `name` renumerados: o nome embute o range antigo, ficaria incoerente com o "(Lv X-Y)"
  real no card. `LEGENDARY_BAND` (Câmara dos Lendários) recebeu o mesmo +50 (Lv60-70 → Lv110-120) —
  **decisão não pedida explicitamente, mas necessária**: senao a zona Kanto mais forte (Lv80-105)
  ficaria acima do "capstone" lendario (Lv60-70), quebrando a progressao. Regenerado via
  `npm run planilha:aplicar`.
- **Modo Pesadelo: piso de nível 150**: `js/data/nightmareMaps.js` trocou `+100` fixo por
  `shiftLevel(level) = Math.max(level + 100, 150)`; a hunt mais fraca (Route 46 Inicial, Lv2-2) so
  chegaria a Lv102 com o offset antigo. Todo nivel mirrorado (min/max de cada encontro **e** o
  `levelRange` do mapa) clampado pra nunca cair abaixo de 150. Kanto (ja +50) nao precisa do piso:
  `kanto_lv_1_10` mirrorado sai em Lv152-162 sozinho. Ao vivo: aba mostra "Route 46 (Inicial)
  (Pesadelo) (Lv 150-150)" ate "Kanto Zona Nivel 80-105 (Pesadelo) (Lv 180-205)".
- **Subtítulos removidos da lista de Hunts**: `HuntMenu.js` nao renderiza mais `map.description`
  ("Local selvagem: ...", dado continua existindo) nem o "Desbloqueado" redundante — card so com
  nome + range de nivel + botao "Entrar" (texto ja implica desbloqueado). Custo (`costLabel`) fica
  **só** com hunt trancada: ai a informacao e funcional (quanto custa desbloquear), nao decorativa —
  decisao de julgamento, ver a mensagem que acompanhou a leva.
- **Cópia distribuível resincronizada**: `robocopy` de novo sobre
  `C:\Users\Mark2\Documents\NOVO POKE IDLE - Distribuicao\`, mesmos filtros de exclusao — 32
  arquivos atualizados. Testado: `node server.js` da copia em porta separada (5175), tela de escolha
  de starter renderizando no browser sem erro de console.

## Fora de escopo (decisao explicita, nao implementar sem pedir)

**Atualizado apos a leva de combate (ver secao no fim do arquivo) — a lista antiga estava errada
em metade dos itens.** Status, alteracao de atributo (estagios), traits, clima, escudos, dano
fixo e mecanicas tipo-recoil **ja existem** (detalhe tecnico em `docs/03-motor-de-simulacao.md`,
guia de jogador na Wiki in-game, aba "Combate"/"Status"). O que continua de fato fora de escopo:

- Pesca/varas (varas sincronizam mas nao sao vendidas, pesca em si nunca implementada).
- PP como recurso consumivel — PP so entra na formula de cooldown, nunca e gasto.
- Prioridade de golpe (nenhum golpe age antes de outro por "prioridade"; a ordem sai so de
  cooldown/velocidade, ver `docs/03-motor-de-simulacao.md`) — por isso Guarda Rapida/Guarda Larga
  ficam sem essa parte da mecanica deles.
- Multi-hit (golpe que acerta 2-5 vezes numa unica investida).
- OHKO de verdade (Guilhotina/Fissura existem no catalogo mas ficam de fora de
  `isDamagingAbility`, nunca selecionaveis — o motor nao tem formula de precisao dedicada pra
  equilibrar um "sempre mata").

## Movimento e mecânica de batalha (próxima área de refino)

- `js/systems/MovementSystem.js` — estados `wander`/`chase`/`engaged`/`dead`. Player livre busca o
  inimigo vivo mais proximo (`findNearestAliveEnemy`); persegue via `aggroRadius`, gruda via
  `leashRadius` uma vez em chase/engaged; combate a `engageRange` (raio dos dois +10). Inimigo sem
  alvo da `wanderStep` em torno do proprio `spawnPoint` (raio `wanderRadius`); volta pro spawn se
  afastar demais. Player livre sem inimigo perto faz `wanderFreely` pelos limites do mapa.
- `js/systems/CombatSystem.js` — so ataca com `engagedEnemies` (parado, sem perseguicao durante o
  dano). `pickAbility` pega a habilidade pronta (fora de cooldown) de maior `power`, preferindo AOE
  se atingiria 2+ alvos (`aoeTargetCounter`); `BASIC_ATTACK` sempre candidato como fallback.
  `scaledCooldown` ajusta o cooldown (vindo do PP) pela stat de velocidade (`SPEED_REFERENCE=100`).
  `computeDamage` segue o pipeline real: `DAMAGE_BASE` -> STAB -> efetividade de tipo -> crit
  (`CRIT_CHANCE`/`CRIT_MULTIPLIER`) -> variação 85-100% (`DAMAGE_VARIATION`).
- **Dano base nos slots de habilidade** (`js/ui/panels/AbilityHUD.js`): alem do cooldown, slot
  mostra `ability.power` (o "Dano" da planilha direto — nao dano estimado contra alvo especifico,
  decisao explicita do usuario) via `.dmg-badge`, faixa fina no rodape com `z-index` acima do
  `.cooldown-overlay` (cobre o slot inteiro): visivel mesmo em cooldown.
- **Ícone de habilidade colorido por elemento + moldura por categoria + marca AOE**: fundo em
  gradiente na cor do tipo (`colorForType(ability.type)`, `js/data/typeColors.js`) + borda de 2px
  por categoria (`CATEGORY_BORDER` em `AbilityHUD.js`: cinza pra `physical`, azul pra `special`),
  ambos via `style` inline no JS (dado dinamico por golpe). Glow de "pronto" (`.ability-slot.ready`)
  virou so `box-shadow`, sem sobrescrever `border-color`: senao apagaria a cor de categoria toda vez
  que o golpe destrava. AOE (`ability.target === 'aoe'`): bolinha verde no canto superior direito
  (`.ability-slot.aoe::after`).
- **Perfil de POKE unificado** (`js/ui/panels/PokeProfileModal.js#showPokeProfileModal`): clicar num
  POKE **em qualquer lugar do jogo** (Equipe, Mochila, aba "Pokemons" da Loja, card do Hospital,
  POKE ativo no HUD) abre o mesmo modal flutuante (truque do `confirmModal.js`, direto no `<body>`,
  `z-index:100` — acima de qualquer tela aberta E do HUD). Substitui o "expandir inline na lista",
  so existente em Equipe/Mochila (`expandedUid`): experiencia unica em todo canto, ate onde nao
  havia nada clicavel (Loja, Hospital, HUD). Cabecalho fixo (`PokeStatDetail.js#buildProfileHero`,
  montado **uma unica vez** fora do corpo trocado por aba — `PokeProfileModal.js`): sprite animada
  em destaque, nome/nivel/tipos, barras finas de HP/EXP; fora do corpo trocado, nao reinicia o GIF a
  cada troca de aba. Duas abas abaixo:
  - **Status**: so numeros (`PokeStatDetail.js#buildStatDetail`) — grid de 3 colunas pros stats (Atk
    Fis/Esp, Defesa, Def Esp, Velocidade), IVs como chips compactos numa linha so
    (`HP 20 AF 15 ...`), habilidades como texto final; identidade (nome/tipo/HP/EXP) saiu pro
    cabecalho fixo, pedido explicito do usuario: sprite domina o espaco, texto ocupa o minimo.
  - **Golpes** (novo): `PokeStatDetail.js#buildMovesetTable` lista o learnset **completo** da
    especie (`species.abilities`, todo golpe que ela algum dia aprende — nao só
    `poke.unlockedAbilities`, so o que o nivel atual desbloqueou) com
    Nivel/Tipo/Categoria(Fisico-Especial)/Dano base/AOE. Golpes ja aprendidos
    (`levelReq <= poke.level`) ganham `.learned` (fundo claro, texto branco); resto esmaecido —
    serve tambem de preview de "o que vem por ai".
  - HUD (`HUD.js`) e o unico caso nao trivial: `.hud-poke` so montado **uma vez** (`buildHudDom`)
    mas o POKE ativo muda — listener le `container._gameState.activePoke` no momento do clique
    (setado toda vez em `renderHud`), sem fechar sobre o poke de quando o DOM foi construido. Clique
    em "Evoluir" (mesmo `.hud-poke`) filtrado explicitamente (`e.target.closest('.evolve-tag')`) pra
    nao abrir o modal por cima da evolucao.
- **Sprite animada gen5 no perfil** (`js/data/gen5Sprites.js#gen5SpriteUrl`): sprite do cabecalho
  vem de `assets/gen5ani/` — GIFs estilo "Pokemon Showdown" (do usuario, pasta plana, 1 arquivo por
  especie), diferentes dos battle-sprites PMD de campo (`assets/battle-sprites/`). GIF anima sozinho
  via `<img>` normal, sem `AnimData.xml`/frame-slicing. Nome do arquivo = nome da especie sem todo
  caractere fora de a-z0-9 (sem underscore/apostrofo/ponto): `farfetch_d` → `farfetchd.gif`,
  `nidoran_f` → `nidoranf.gif`, `ho_oh` → `hooh.gif`; normalize simples cobre as 221 especies atuais
  sem tabela de excecao (conferido contra o roster inteiro antes de adotar). Shiny na pasta irma
  `assets/gen5ani-shiny/` (mesmo esquema, tambem conferida contra as 221 sem excecao):
  `gen5SpriteUrl(speciesId, isShiny)` troca de pasta; nome continua roxo+✨ junto da sprite shiny de
  verdade agora. `.profile-sprite-box`: `object-fit: contain` num box fixo (132x132), toda especie
  preenche quase todo o espaco independente do tamanho nativo do GIF (varia bastante, ex. Charmander
  41x42 vs Gyarados 102x84) — upscale com `image-rendering: pixelated`, espirito do
  `GLOBAL_BATTLE_SCALE`.
- AOE marcado por chave de golpe, nao pela planilha (`AOE_ABILITY_KEYS` em `js/data/abilities.js`:
  razor_leaf/bubble/earthquake/explosion/magnitude/selfdestruct) — varias especies sincronizadas
  aprendem esses golpes, entao AOE e usado de verdade em combate. Raio em `AOE_RADIUS` (mesmo
  arquivo), dobrado numa rodada recente.
- **Sprite de golpe: procedural, não mais imagem** (`Sprites.js#drawAbilityEffect`,
  `CombatSystem.js#resolveHit`) — **substituiu por completo** as imagens rippadas antigas (rip
  DS/DSi + "segundo lote" chroma-keyed no browser). Deletados `js/data/attackGraphics.js`,
  `js/data/extraAttackGraphicFrames.js`, `js/data/attackGraphicFrames.generated.js` e
  `scripts/measure-attack-graphics.js`; imagens em `assets/move sprites/` seguem no disco, nada no
  jogo as referencia — pedido explicito do usuario, insatisfeito com o visual. Golpe que acerta gera
  `Effect` tipo `abilityEffect` (`color: colorForType(ability.type)`, mesma tabela de cor por
  elemento do nome do golpe/icone de habilidade — nenhuma cor nova inventada), 100% canvas, sem
  asset:
  - **Golpe single-target**: `drawImpactBurst` — "splash fluido": glow radial (gradiente
    `color→transparente`, `globalCompositeOperation:'lighter'` pra aditivo/luminoso) com pop-in
    rapido e fade, mais 7 particulas pequenas da mesma cor espirrando em angulos fixos (derivados do
    indice, sem RNG: animacao identica em toda a vida do efeito) que encolhem ao se afastar.
    Diametro base `IMPACT_BASE_SIZE=44`.
  - **Golpe AOE** (`ability.target==='aoe'`): `drawAoeRing` — circulo expandindo (raio 0 ate
    `ability.radius`, ease-out) na cor do tipo, preenchimento fraco (`alpha*0.25`) por baixo e anel
    brilhante por cima (`shadowBlur` pro halo), ambos desvanecendo conforme cresce — pedido
    explicito do usuario: "o tamanho da sprite é o mesmo da área de alcance do AOE". Reusa o mesmo
    `effect.worldSize = ability.radius * 2` da versao em imagem (so a forma de desenhar mudou, o
    calculo do tamanho ja estava certo).
  - `Effect.js` perdeu `imageUrl`/`frames` (sem sentido sem imagem) e ganhou `isAoe` (bool, decide
    qual desenho rodar). `CombatSystem.js` nao importa mais
    `attackGraphicUrl`/`attackGraphicFrames`; duracao agora e constante fixa por tipo
    (`IMPACT_EFFECT_DURATION=0.35s`, `AOE_EFFECT_DURATION=0.55s` — AOE precisa de mais tempo pro
    anel terminar de crescer antes de sumir), nao derivada da contagem de frames do sheet.

## Farming em segundo plano e Farm Offline

Dois sistemas distintos, mesma pipeline de simulacao headless
(`js/systems/OfflineSimSystem.js#simulateWorldSeconds`): roda `main.js#stepWorld` (funcao do tick ao
vivo, so em modo `silent`) em loop apertado, nao 1x por frame. Nao existe formula teorica separada
de estimativa: os dois rodam o combate real (movimento, engajamento, dano, crit, STAB, efetividade,
cooldown, auto-pot/revive/catch, respawn), so que sem desenhar nada e sem tocar em toast/log/save a
cada kill (inviavel pra potencialmente milhares de kills de uma vez). `main.js#handleEnemyDefeated`
e `stepWorld` aceitam `{ silent }`: XP/ouro/loot/captura roda sempre; so os `Effect`s visuais, os
toasts e o `saveGame()` por kill sao pulados quando `silent`, retornando resumo por kill que o
chamador agrega.

- **Correcao de atraso do navegador** (aba minimizada/oculta, nunca fechada): navegador throttla
  `setInterval`/`requestAnimationFrame` de aba oculta (minimizar = oculta pela Page Visibility API,
  nao so trocar de aba); `GameLoop` ja usa `setInterval` em vez de `requestAnimationFrame` de
  proposito, mas isso sozinho nao evita o throttling. `main.js` rastreia `lastLiveTickAt` (por tick
  real) + escuta `visibilitychange`; ao voltar visivel, gap desde o ultimo tick acima de
  `MIN_CATCHUP_GAP_SECONDS` (5s; abaixo = jitter normal de frame) roda `simulateWorldSeconds`
  **sobre o `currentWorld` ja existente** (mesmos inimigos/posicoes/cooldowns reais, nao reconstroi
  nada) pelo gap inteiro. **Sem limite de tempo e totalmente silencioso** (decisao explicita do
  usuario: "se a aba estiver aberta nao e farm offline, e so o navegador tendo se perdido"): sem
  toast nem modal, so os numeros sobem.
- **Farm Offline de verdade** (aba fechada, PC desligado/dormiu, etc.): `SaveManager.load()` devolve
  `{ data, savedAt }` (timestamp ja existia no payload salvo, so nao era exposto). No boot do
  `main.js`, com `currentMapId` no save (jogador numa hunt) e `Date.now() - savedAt` acima de
  `MIN_OFFLINE_GAP_SECONDS` (60s; evita disparar em todo F5 de desenvolvimento), simula sobre mundo
  novo de `buildMapWorld` (`player.poke` da simulacao = mesma referencia de `gameState.activePoke`,
  entao HP/nivel persistem sem sincronizacao extra), **limitado a `OFFLINE_FARM_MAX_HOURS`**
  (formula da planilha, default 6h, pedido explicito do usuario). Com >=1 kill, mostra
  `js/ui/panels/offlineFarmModal.js` (padrao flutuante do `confirmModal.js`): tempo fora, ouro/XP
  ganho, level-ups, capturas (icone+nome+nivel+shiny, cap de 40 exibidos + contador do resto),
  shinies avistados vs capturados, itens obtidos, consumiveis gastos, e **balanco estimado** (ganho
  = ouro + Σitens obtidos×`sellPrice` + Σpokemons capturados×`pokemonSellValue`; gasto = Σitens
  consumidos×`buyPrice`) — cada linha some com valor 0 (pedido explicito do usuario, "ocultar
  visualmente quando os dados forem 0"). POKE desmaiado sem `revive` sobrando (com `autoRevive`
  ligado; mesma condicao do revive ao vivo em `AutoSystem.js`) para a simulacao cedo
  (`stoppedEarly`) e o modal avisa, sem fingir que o tempo todo rendeu.
  `itemsGained`/`itemsConsumed` = **diff** de `gameState.items` antes/depois da simulacao inteira,
  nao soma manual por kill: captura qualquer fonte de consumo/ganho (bolas, pocoes, revives, drops
  de mapa) sem listar cada caminho a mao.
- **Nao simula HP/morte por formula teorica** — fidelidade vem de rodar o `stepWorld` real, so em
  passos mais grossos que os 1/60 do jogo ao vivo (`OFFLINE_SIM_STEP_SECONDS`, formula da planilha,
  default 0.1s) pra nao travar a aba processando ate 6h de uma vez (com o default, 6h vira no maximo
  216 mil iteracoes, roda em bem menos de 1s).

## Balanceamento de economia (planilha) — OBSOLETO, ver docs/02

As duas secoes que ficavam aqui ("Balanceamento de economia" e "Visual/HUD, referencia
pokedream.com.br") descreviam o jogo **vanilla** (`js/`, `css/`, `index.html`,
`EconomySystem.js`, `main.js`, `Sprites.js`, `UIManager.js`) — codigo que foi cortado do
repositorio (ver "O que foi cortado" em `docs/01-arquitetura.md`) e nao existe mais em disco.
Os valores tambem estavam desatualizados havia tempo (GOLD_GLOBAL_MULTIPLIER=4 no texto,
1 no codigo; XP_GLOBAL_MULTIPLIER=0.4, 0.14 no codigo — ver `docs/13-divergencias-conhecidas.md`
pra o levantamento completo). Removidas em 2026-08-16 na leva de combate, pelo mesmo motivo que
motivou a leva: um documento errado por omissao ou por decadencia e pior que documento nenhum.

**Knobs de economia editaveis pela planilha**: tabela viva em
[docs/02-dados-e-catalogo.md#knobs-de-economia-disponíveis](docs/02-dados-e-catalogo.md) — cita
simbolo (`economySystem.ts#GOLD_GLOBAL_MULTIPLIER`), nunca valor copiado, exatamente pra essa
classe de divergencia parar de acontecer.

**As decisoes em si sobreviveram a migracao pra React** (conferido no codigo, nao assumido):
contorno de texto no canvas (`render/sprites.ts#strokeText`), splash de level-up
(`components/modals/LevelUpSplash.tsx`), ouro por kill como emoji e shiny prefixado em toda
mensagem (`engine/simulation.ts`/`engine/controller.ts`). O QUE NAO EXISTE ainda e a
reescrita dessas decisoes com o porque, nos arquivos atuais — `docs/09-interface.md` cobre
escala fluida/breakpoints/janelas/tokens, mas nao este grupo especifico. Lacuna real, nao
fechada nesta rodada.

## Gotchas conhecidos

- **PostgREST corta em 1000 linhas por request, sem erro nenhum.** Ler `species_moves` (2025 linhas)
  sem paginar devolve 200 OK com 1000 linhas e um catalogo silenciosamente mutilado. `fetchAll` em
  `generate-catalog.js` pagina por `Range` e **confere o total contra o `Content-Range`** — copiar
  esse padrao em qualquer leitura nova (mesmo cuidado em `selecionarTudo` no servidor).
- **`numeric` volta como string JSON.** PostgREST preserva o texto (`"0.5"`), porque o tipo nao cabe
  num double sem risco de perda. Sem converter, `capture_rate` viraria a string `"1.5"` no arquivo
  gerado e todo multiplicador do type chart sairia com aspas. Ver `num()` em `generate-catalog.js`.
- **Ler estado do jogo React via `import()` no browser instancia um SEGUNDO modulo.** Vite serve
  modulos editados durante a vida do dev server com query de versao (`?t=...`); o app carrega essa
  versao, e um `import('/src/stores/gameStateStore.ts')` sem query cria copia nova, com store e
  contadores module-level proprios. Sintomas reais observados: `team` vazio num jogo com POKE em
  campo, e — pior — chamar `controller.enterMap()` por esse caminho criou inimigos com `entity-1`
  colidindo com o id do player, quebrando o filtro de engajamento do combate e parecendo regressao
  de performance de 7x. Ao testar, use como fonte de verdade: o save em `localStorage`, o texto
  renderizado e os pixels do canvas. Pra disparar acoes, clique no UI real — nunca `import()`
  dinamico no console.
- Nao ha Python real neste ambiente (so alias da Windows Store) — `xlsx-reader.js` e tudo que le
  a planilha e Node puro de proposito.
- **Reset de save para teste**: nunca so `localStorage.clear()` — sob autoridade do servidor
  (Fase D), o cliente nem escreve mais no Postgres direto, entao limpar o `localStorage` sozinho
  desincroniza o que o servidor tem do que o navegador mostra. Usar a acao real (`reiniciarJogo`,
  chamada pela tela de Configuracoes) ou a conta de teste dedicada — ver
  `memory/conta-de-teste-unica.md`.
- **O repositorio e um so agora.** `main` e a branch de producao (deploy automatico via
  Cloudflare Pages a cada push); o jogo vanilla (`js/`/`css/`/`index.html`/`server.js`) foi
  cortado (ver `docs/01-arquitetura.md#o-que-foi-cortado`) — nao existe mais em disco nem em
  branch nenhuma.

## Comandos

Lista completa e atual em `package.json#scripts`; os que valem destacar:

- `npm run dev` — app **React** em modo desenvolvimento (porta 5173, raiz do repositorio — **nao**
  `cd web`, o app e a raiz desde o commit `70d5561`).
- `npm run build` — build de producao (`tsc -b && vite build && node scripts/copiar-assets.mjs`).
  O ultimo passo copia `assets/` pra `dist/` — sem ele o site sobe com zero sprite (ver
  `docs/01-arquitetura.md`).
- `npm test` / `npx vitest run` — suite do cliente. `cd server && npx vitest run` — suite do
  servidor, separada.
- `npm run build:engine` — empacota o motor (`src/engine/`) num ESM que o Node importa direto
  (`server/engine/headless.js`). Precisa rodar de novo (e o servidor local reiniciar) depois de
  QUALQUER mudanca em `src/engine/` ou `src/data/`.
- `npm run build:edge` — empacota motor + servico de autoridade num arquivo so
  (`supabase/functions/jogo/servidor.js`), pra publicar como Edge Function. `npm run
  edge:verificar` confere se o bundle publicado bate com `server/src` e reconstroi se nao bater —
  rodar antes de `npx supabase functions deploy jogo`. `npm run edge:publicar` faz as duas coisas.
- `npm run catalog:gerar` — regenera o catalogo do jogo a partir do Postgres (fonte atual — ver
  `docs/02-dados-e-catalogo.md`). **Bloqueado** atras de `PERMITIR_CATALOGO_GEN2=1`: o catalogo
  vivo hoje veio da migracao Ultra Sun (`usum:*`), rodar isto sem querer reverteria pro dado Gen2
  antigo.
- `npm run usum:baixar` / `usum:gerar` / `usum:conferir` — pipeline atual de catalogo (PokeAPI,
  Gen VII, conferido na Bulbapedia).
- `npm run subbiomas:extrair` / `subbiomas:gerar` — pipeline de sub-biomas (PokeRogue) que
  alimenta as hunts em salas (ver leva "hunts em salas").
- `npm run tiers:gerar` — regenera o peso de spawn (`spawn-tiers.json`, derivado dos
  disassemblies Gen1/2 — ver `docs/02-dados-e-catalogo.md`).
- `npm run db:wipe` — reseta save de TODOS os jogadores (`-- --confirmar=APAGAR-TUDO`). Nunca
  rodar sem confirmar com o usuario antes.
- `cd server && npm run dev` — servidor de autoridade local (precisa de `VITE_SERVIDOR_URL`
  apontando pra ele no `.env.local` do cliente pra jogar contra ele em vez da Edge Function).

## Sexta leva: bugfixes de mochila/filtros + evolucao especial via Stones

- **Bugfixes (Fase 1)**: `BagMenu.js`/`TeamMenu.js` sem guarda para `SPECIES[poke.speciesId]`
  invalido — 1 POKE quebrado (save legado, `ivs` ausente) lanca excecao no `for`, cortando em
  silencio todo POKE seguinte ("mochila nao mostra todos pokemons"); fix: guard pula invalido com
  `console.warn`. Filtro IV min/max de `ShopMenu.js` (aba "Pokemons") nao validava `ivMin > ivMax`:
  invertido zerava a lista sem aviso; fix: par ordenado (`Math.min`/`Math.max`) + aviso. Busca de
  `HuntMenu.js` ignorava o filtro de tipo (rolava ate card ja `display:none`, parecia nao achar);
  fix: ignora ocultos + "nenhuma hunt encontrada".
- **Stones — moeda de evolucao por tipo** (`js/data/stones.js`, novo): 17 itens "Pedra ${TYPE}" (1
  por tipo elemental Gen2 deste dataset, sem FAIRY), hand-authored (nao ha item real 1:1 com os 17
  tipos na planilha) — padrao "camada por cima do sync" de `nightmareMaps.js`/`legendaries.js`. 1
  icone base para todas (`assets/item-icons/type_stone.png`, recorte do pack SV do usuario, indice
  `item_0081` "Moon Stone", id por inspecao visual dos PNGs numerados — pack sem legenda; numeracao
  validada contra `item_0080/82/84` = Sun/Fire/Water Stone reais); distincao por borda colorida
  (`itemIconBorderColor`, `js/data/sprites.js`, usa `colorForType`, mesma linguagem "tint by type"
  de ability slots/type chips/aura) na Mochila/Loja, nao 17 sprites (nao existem no pack). No
  `ITEMS` de `js/data/items.js` (`getItem`/Mochila/Loja vendem como item comum) mas **fora do
  `SHOP_STOCK`** (nunca compraveis — so drop).
- **Evolucao "especial" (ex-troca/hold-item) = Level 80 + 20 Stones do tipo primario**: nunca houve
  gatilho de troca/hold-item (evolucao 100% por `evolvesAtLevel` da planilha); pras especies cuja
  evolucao Gen1/2 exigia troca (Kadabra, Machoke, Haunter, Graveler, Poliwhirl, Slowpoke->Slowking,
  Seadra, Scyther, Porygon) a planilha nunca populou `evolvesTo` — presas para sempre. **So 3 tem
  forma evoluida no roster curado** (Kadabra->Alakazam, Machoke->Machamp, Haunter->Gengar;
  Golem/Politoed/Slowking/Kingdra/Scizor/Porygon2 nunca curados em `KANTO_BANDS`, sem alvo sem
  inventar conteudo fora da planilha). Patch hand-authored em `js/data/pokes.js` (espirito do de
  Stones): pras 3, `evolvesTo`/`evolvesAtLevel=80`/`isSpecialEvolution=true` no `SPECIES` ja
  construido (1x, no load). `ProgressionSystem.js#evolutionStoneRequirement` ->
  `{itemId, count:20, type: species.type}` (**tipo primario**, ignora o secundario de proposito,
  desempate explicito do usuario) so com `isSpecialEvolution` true; evolucao normal (a maioria) sem
  custo extra nem mudanca. `evolvePokeInstance(pokeInstance, gameState)` ganhou 2º parametro (era so
  `pokeInstance`) para checar/deduzir inventario: `null` (nivel nao atingido),
  `{blocked:'stones', required}` (nivel ok, faltam Stones, inventario intocado),
  `{species, newAbilities}` (evoluiu, Stones deduzidas); `main.js#controller.evolvePoke` vira
  `blocked` em toast nomeando item/quantidade, nao falha silenciosa. Botao "Evoluir" (`TeamMenu.js`,
  HUD do POKE ativo) traz o custo no label (`Evoluir (20x Pedra FIRE)`) no Nivel 80, mesmo sem
  Stones (UX "botao sempre visivel, falha no clique com toast" de compra/desbloqueio).
- **Drop universal de Stone, 5% por kill, tipo primario do inimigo**:
  `EconomySystem.js#awardKillLoot` ganhou roll fixo (`STONE_DROP_CHANCE`, spreadsheet-editable via
  `evalOrDefault` como todo knob de economia, fallback 0.05) independente do drop por-hunt
  (`mapDef.itemDrops`): todo POKE de toda hunt dropa `stone_${especie.type}`. Mesma funcao serve
  combate ao vivo e catch-up silencioso/Farm Offline (`main.js#handleEnemyDefeated`, ver "Farmando
  em segundo plano" acima) — os dois ganham Stones identicamente; toast "Item encontrado" e resumo
  do Farm Offline (diff de `gameState.items`) cobrem item novo genericamente.
- **Bug de teste, nao de producao**: `createPokeInstance` de modulo re-importado a mao no browser
  (fora do grafo do jogo) reseta `nextInstanceId` (contador de `uid`, modulo-level em `pokes.js`)
  para 1, colidindo com `uid` de POKE salvo. So nesse teste manual via `import()` dinamico fora do
  fluxo normal: o jogo (grafo unico, 1x por `<script type="module">`) nunca re-executa `pokes.js`,
  contador nunca reseta em sessao real. Registrado por transparencia, nao virou tarefa (fora do
  escopo pedido).

## Setima leva: auditoria profunda pos-usuario + evolucao especial completa (9 cadeias) + bug de lendarios

Pedido explicito de re-auditoria ("a rodada anterior foi rasa"), 3 fases. Cada item verificado **ao
vivo**, nao so leitura: `gameState` de teste via hook temporario `window.__game` (padrao do gotcha
acima), cliques nos botoes reais, checagem do `gameState`/DOM.

- **Fase 1 (Mochila/Loja/filtros) — re-auditada, nao encontrado bug adicional**: 40 POKEs reais (IVs
  0-31) renderizam todos (`#bag-content .card`/`#sell-pokes-list .card` = 40); `scrollHeight` >
  `clientHeight` com `overflow-y:auto` = rolagem, nao corte. "Ordenar por IV" certo nas duas
  direcoes (100% -> 0% e vice-versa, lido no DOM a cada clique). "Selecionar tudo" marcou 39/40 (o
  40º shiny, excluido da selecao em massa — nao e bug, e a regra de seguranca documentada). "Vender
  Selecionados"/"Vender Tudo" (POKEs e Itens) removeram o esperado e creditaram o ouro certo.
  **Conclusao**: os bugs relatados (Selecionar Tudo nao seleciona, Vender Tudo nao vende) nao
  reproduziram com dado real — os 3 fixes anteriores (guard de POKE invalido, IV min/max invertido,
  busca vs filtro de tipo) provavelmente ja cobriam o sintoma, ou o teste do usuario caiu num
  caso-guarda (ex.: shiny no "Vender Tudo" parecendo "nao vendeu tudo" quando so pulou o shiny).
- **Fase 2 — Stone drop rate 5% -> 20%**: fallback de `EconomySystem.js#STONE_DROP_CHANCE` para 0.2.
  Validado com 3000 chamadas diretas de `awardKillLoot` (19.7% observado) **e** com combate ao vivo
  (`controller.enterMap` + game loop rodando ~20s, sem simulacao) — drop pelo caminho de producao,
  nao só numa chamada isolada.
- **Fase 3 — as 9 cadeias reais de evolucao trade/hold-item, nao so as 3 que ja existiam**: planilha
  **nao tem** coluna de "metodo de evolucao" (aba Espécies via `xlsx-reader.js`: só
  `Evolui Para (chave)`/`Evolui no Nível`, vazios para especie sem evolucao, seja "final de verdade"
  ou "trade-only"); quais das 251 sao trade/hold-item vem de conhecimento real de Pokemon Gen1/2,
  nao da planilha, como na leva anterior — agora as 9 cadeias
  (Kadabra/Machoke/Graveler/Haunter/Onix/Scyther/Seadra/Poliwhirl/Porygon), nao so as 3 que por
  acaso ja tinham as duas pontas na roster. Golem/Onix/Scizor/Kingdra/Politoed/Porygon2 (6 especies:
  forma evoluida ou ambas as pontas de 6 das 9 cadeias) entraram em
  `scripts/sync-planilha.js#KANTO_BANDS`, sincronizadas via `npm run planilha:aplicar` —
  stats/moveset sempre existiram na planilha (National Dex #1-251 completo), só nunca curados para
  hunt nenhuma. Slowpoke->Slowking (unico dos 10 casos reais de trade-evolution do Gen1/2 fora) nao
  implementado: Slowpoke ja evolui por nivel para Slowbro (nivel 37, dado real) e o modelo so
  suporta um `evolvesTo` por especie — nao e dead-end para "consertar", e uma segunda opcao de
  evolucao que este sistema nunca teve como representar.
  - **Armadilha ao adicionar as 6 especies**: `KANTO_BANDS` sozinho nao basta — `splitByBiome`
    (divide cada banda de 10 niveis em 2 hunts tematicas por bioma) descarta em silencio especie
    cujo bioma (Tipo 1 primario via `BIOME_BY_TYPE`) nao seja um dos 2 pro `seed` da banda: sem
    warning, sem erro, o pokemon nunca aparece em encontro nenhum. Achado comparando o `console.log`
    do sync (preview de 8 por hunt) contra grep em `pokes.generated.js` vs `enemies.generated.js` —
    a 1ª tentativa (6 especies em banda "aproximada por nivel") deixou 6 de 8 espécies **existindo
    como dado mas inalcancaveis** (sincronizada, zero encontro selvagem). Fix: bioma real (Tipo 1 ->
    `BIOME_BY_TYPE`), cada uma movida para banda cujo par sorteado
    (`BIOME_ORDER[(seed*2)%7]`/`BIOME_ORDER[(seed*2+1)%7]`) contem esse bioma — verificado com grep
    exigindo presenca em `enemies.generated.js` (nao só `pokes.generated.js`), nao só a existencia
    da especie.
  - **Bug pre-existente (fora do pedido, achado ao re-sincronizar a planilha 1ª vez nesta sessao)**:
    as 11 hunts BOSS (Modo Pesadelo, unica fonte de lendarios) **completamente quebradas** desde o
    commit que removeu a "Camara dos Lendarios" (`486a354`): tirou `LEGENDARY_BAND` de `KANTO_BANDS`
    E resincronizou a planilha junto, sem nada mais alimentando os 11 keys de lendario em
    `allSpeciesKeys` — `pokes.generated.js` sem NENHUM dos 11. `if (!SPECIES[speciesId]) continue`
    (`nightmareMaps.js#buildBossHunts`) engoliu o erro: as 11 hunts sumiram sem erro no console e
    ninguem notou até esta sessao rodar `npm run planilha:aplicar` (1ª vez desde aquele commit) e o
    roster cair de "221 especies" (o `pokes.generated.js` **committado**, ja tao quebrado quanto o
    novo — ambos sem lendarios) para "120" no log. Fix no padrao de `STARTER_SHEET_KEYS`:
    `LEGENDARY_SHEET_KEYS` (11 chaves reais da planilha) em `allSpeciesKeys` **sem** por essas
    especies em `enemyPool` de hunt normal (lendarios seguem BOSS-only, de proposito). Ao vivo: 11
    hunts `boss_*` de volta na aba "Modo Pesadelo".
  - **Sprites das 5 especies sem arte** (Golem/Scizor/Kingdra/Politoed/Porygon2 —
    Onix/Scyther/Porygon ja tinham arte pre-importada de leva anterior, nunca usada):
    `node scripts/import-kanto-sprites.js` de novo, mesmo fluxo (le do checkout local do
    SpriteCollab, mede foot-offset automaticamente). gen5ani (sprite do perfil) ja cobria as 8 desde
    a leva que "conferiu contra o roster inteiro", antes mesmo de serem alcancaveis — sem import
    novo.
  - `js/data/pokes.js#SPECIAL_EVOLUTIONS` de 3 para 9 pares
    (kadabra/machoke/haunter/graveler/onix/scyther/seadra/poliwhirl/porygon). Ao vivo: Onix Lv80 +
    20 Pedra ROCK -> `controller.evolvePoke` -> Steelix, Stones deduzidas corretamente.

## Oitava leva: World Building v2 — cada tipo elemental vira um bioma proprio

Pedido explicito do usuario: "varios tipos de pokemons (como Lutadores, Dragoes) foram esquecidos e
ficaram sem local de spawn" + reformular hunts/biomas do jogo inteiro mantendo "2 hunts a cada 10
niveis" e garantindo que **todo** POKE tenha hunt valida pro seu nivel/tipagem.

- **Bug real encontrado (bem pior do que o relatado)**: o sistema antigo
  (`scripts/sync-planilha.js`, removido) rotacionava 7 biomas "empacotados" de 2-3 tipos reais cada
  (`Sombrio` = GHOST+DARK+POISON, `Mistico` = FLYING+PSYCHIC+DRAGON, etc.) via
  `BIOME_ORDER[(seed*2)%7]`; cada banda de 10 niveis so testava contra os 2 biomas sorteados para
  ela. Duas falhas somadas: (1) `allSpeciesKeys` (lista final de especies sincronizadas) vinha das
  hunts **depois** do corte por bioma — especie cujo bioma nao batesse com a unica banda em que
  estava listada nao ficava so sem spawn, **desaparecia inteira do jogo** (ao vivo:
  DRATINI/DRAGONAIR/DRAGONITE nao existiam em `pokes.generated.js` nem em lugar nenhum; so 137 das
  ~226 especies esperadas sincronizadas na branch recem-commitada); (2) tipo populoso empacotado com
  tipo raro fazia o backfill (preenche o pool ate 8 pelo National Dex em ordem de Pokedex) esgotar
  as vagas no tipo maior antes do menor — `Mistico` sempre enchia com PSYCHIC (13 especies, Pokedex
  baixo) antes de `DRAGON` (3 especies, Pokedex alto) ganhar uma vaga, em qualquer banda com os dois
  juntos. Achado tambem: hunts BOSS de lendarios (unica fonte de lendarios) quebradas desde commit
  anterior que removeu `LEGENDARY_BAND` sem substituir a fonte de dados — ja corrigido em leva
  anterior (`LEGENDARY_SHEET_KEYS`), continua funcionando aqui.
- **Redesenho**: 1 tipo elemental real = 1 bioma, sem empacotamento — `TYPE_BIOME_PLAN`
  (`scripts/sync-planilha.js`): tabela explicita e auditavel de 9 brackets (5 Johto + 4 Kanto, mesma
  contagem de sempre) x 2 hunts, nao rotacao por aritmetica modular (causa raiz do bug acima). Cobre
  os **17 tipos reais** deste dataset Gen2 (lendo `TabelaDeTipos` — nao existe Fada/Fairy aqui, tipo
  da Gen6; a lista de "18 tipos" do pedido foi conferida contra a planilha e ajustada para 17, sem
  inventar type chart para tipo inexistente nos dados reais):
  - Natureza: Floresta(GRASS), Bosque(BUG), Costa+Profundezas(WATER, 2x — ver abaixo), Geleira(ICE)
  - Fisico/Estrutura: Planicie(NORMAL), Dojo(FIGHTING), Penhascos(FLYING), Deserto(GROUND),
    Caverna(ROCK), Fabrica(STEEL)
  - Mistico/Elemental: Vulcanico(FIRE), Usina(ELECTRIC), Torre Mistica(PSYCHIC), Cemiterio(GHOST),
    Covil Sombrio(DARK), Pantano(POISON), Ruinas Ancestrais(DRAGON)
  - 17 tipos, 17 vagas; 9 brackets x 2 = 18 vagas (1 sobrando). WATER ganhou a extra (Costa cedo +
    Profundezas no fim de jogo) por ser disparado o tipo mais populoso do elenco real com arte (40
    especies) — 2 metades por `baseExp` ascendente (fraco cedo, forte/raro no fim), nao aleatorio.
  - Progressao tematica por nivel e decisao de game design (nao vem da planilha), ex.: Rocha+Terra
    formam a zona de cavernas do meio-jogo, Fantasma+Sombrio a zona sinistra logo antes do capstone
    Dragao+Agua-profunda.
- **Populacao das hunts vem 100% do elenco real, nao de listas hand-typed por banda**:
  `buildTypeRoster()` varre a aba inteira "Especies" (National Dex #1-251) e inclui **toda** especie
  com arte real (`assets/battle-sprites/{id}/`) nao lendaria (BOSS-only, decisao ja existente) nem
  um dos 3 iniciais base (Charmander/Squirtle/Bulbasaur seguem exclusivos da tela de escolha — só as
  formas evoluidas, tipo Charizard/Venusaur/Blastoise, viram POKE selvagem comum do tipo delas,
  igual qualquer outra). Substitui as listas manuais `KANTO_BANDS.species` (cada especie só numa
  banda, sem fallback se aquela banda não desse match de bioma — o que causou o bug do Dragao):
  agora **toda** especie do elenco (226 apos o sync) cai na hunt do seu tipo primario, sem cap
  artificial (`MIN_BIOME_POOL_SIZE=8` removido para nao truncar tipos grandes como NORMAL=38 ou
  WATER=40 especies).
- **Tipos com poucos membros reais ganham reforco por tipagem dupla** (regra explicita do pedido:
  "Pokemons de tipagem dupla podem aparecer em biomas de qualquer um dos dois tipos"):
  `MIN_TYPE_POOL=4` — abaixo disso o pool e reforcado com especies cuja tipagem **secundaria** bate
  o tipo (ex.: Magnemite/Scizor reforcam Fabrica/STEEL sendo ELECTRIC/BUG primario). Caso extremo:
  **FLYING nao tem nenhuma especie com tipo primario Voador neste dataset** (fato real — nem nos
  jogos originais nenhum Pokemon de Gen1/2 tem Flying como tipo 1); Penhascos existe via tipagem
  secundaria (Pidgey, Zubat, Charizard, Dodrio, etc., 31 candidatos reais, cortado em 16 pelo
  `TYPE2_FALLBACK_CAP`). Duplicacao intencional (mesma especie na hunt do tipo primario e numa de
  reforco do secundario), permitida pela regra do pedido, unica forma de Penhascos/Fabrica/Ruinas
  Ancestrais terem populacao que valha a visita.
- **Relatorio de cobertura automatico**: `reportTypeCoverage()` roda ao fim de
  `npm run planilha:aplicar`, imprime por tipo quantas especies primarias existem vs. quantas
  spawnam, e avisa se alguma especie do elenco ficar sem hunt nenhuma — troca "espero que a rotacao
  cubra tudo" por checagem real a cada sync. Ao vivo apos o redesenho: **226 especies, 0 orfas,
  17/17 tipos com pelo menos 1 especie spawnavel** (FLYING com aviso informativo — 0 membros
  primarios reais, 16 especies spawnaveis via tipagem dupla — nao é buraco de cobertura, é o dado
  real do Gen2). A mao: nenhum `evolvesTo` quebrado (todo alvo existe em `SPECIES_DATA`), 11 hunts
  BOSS e Modo Pesadelo (espelho +nivel das 19 hunts normais) intactos; ao vivo, HuntMenu mostra as
  19 zonas (Johto/Kanto/Modo Pesadelo) com nomes/niveis corretos, filtro por elemento filtra certo
  (ex.: DRAGON mostra só Ruinas Ancestrais + Profundezas, essa ultima por ter Kingdra dual-type), e
  entrar numa hunt nova (Profundezas) spawnou POKEs reais do tipo certo (Seaking, Wartortle) sem
  erro novo no console.
- **Bounds/spawnPoints/background das hunts nao mudaram** — só a composicao de especies e a
  nomenclatura/tema visual (`bgTheme` = constante do TYPE, nao o nome do bioma antigo; `TYPE_THEME`
  em `sync-planilha.js` mapeia cada tipo para uma das 3 paletas de fallback BG_ROUTE/CAVE/TOWER ja
  existentes, cosmetico so, ja que a imagem de fundo real e identica em toda hunt).

## Nona leva: Overhaul Visual e Interface (Auto compacto, Patch Notes, cor por bioma, VFX tematico)

3 fases, cada uma commitada separadamente apos verificacao ao vivo sem erros novos.

- **Fase 1 — painel Auto compacto + contador de itens ao vivo**
  (`js/ui/panels/AutoPanel.js`/`autoFloatingPanel.js`/`UIManager.js`, `css/style.css`): todo
  `<select>` de item (bola padrao, bola shiny, pocao de cada regra de auto-pot, bola de cada regra
  por especie) ganhou `<span class="item-count-badge">` irmao com `x${quantidade}` — nunca dentro do
  `<select>`/`<option>`, para nao recriar elemento interativo debaixo de um clique em andamento (o
  mesmo "Bug de clique em botao..." documentado).
  `AutoPanel.js#updateAutoPanelCounts(container, gameState)` so escreve texto nesses spans, nunca
  toca o select — chamado a cada frame por `autoFloatingPanel.js#updateAutoFloatingPanelCounts`
  (novo, guarda o `body` do painel aberto) de `UIManager.updateHud()`, junto do
  `renderAutoItemBadge` rodando todo frame. Layout: hints redundantes removidas (a informacao ja
  vive no tooltip do icone "?"), "Bola padrao"/"Bola Shiny" viraram grid 2 colunas
  (`.auto-config-grid`), nao 2 cards empilhados, paddings/gaps reduzidos escopados a
  `.auto-floating-body` (nao afeta `.card`/`.toggle-row` em outro lugar). Bug achado na verificacao:
  "Vida <= X %, usar [pocao]" transbordava no painel de 280px (o `<input>` numerico sem classe
  dedicada caia no default do browser) — fix `.hp-input` proprio (36px) + `flex-wrap` na `.row`.
- **Fase 1 — menu "Patch-notes"** (`js/data/patchNotes.js`, novo — hand-authored, sem equivalente na
  planilha; `js/ui/panels/SettingsScreen.js` reescrito com abas "Geral"/"Patch-notes" no padrao
  `activeTab` module-level de `ShopMenu.js`): lista `PATCH_NOTES` (versao, data, titulo,
  `highlights[]`) em ordem decrescente via `sortedPatchNotes()`. Datas reais do `git log`
  (repositorio local criado nesta sessao, os 9 commits datados do mesmo dia); resumos de cada versao
  saem do historico real documentado neste arquivo, nao inventados.
- **Fase 2 — icone da hunt usa a cor real do bioma** (`js/ui/panels/HuntMenu.js#huntSwatchColor`): o
  circulo `.swatch` trocou `map.bg.primary` (so 3 cores fixas de tema, rota/caverna/torre) por
  `colorForType()` sobre o tipo elemental dominante da hunt — mesma ponderacao por peso real
  (`catchRate`) de `huntOdds()`. **Nao foi criado dicionario de cores novo**:
  `js/data/typeColors.js#TYPE_COLORS` ja cobria os 17 tipos reais (nenhum Fairy, ver leva anterior),
  reaproveitado direto.
- **Fase 3 — VFX de combate tematico por tipo** (`js/data/impactShapes.js`, novo;
  `js/render/Sprites.js`, `js/entities/Effect.js`, `js/systems/CombatSystem.js`): o burst de impacto
  ja era procedural via Canvas (nenhum spritesheet real por tipo no repo — ver "Sprite de golpe:
  procedural" em leva anterior), so com particulas circulares genericas iguais para qualquer golpe.
  `IMPACT_SHAPE_BY_TYPE` mapeia os 17 tipos reais para 1 de 12 familias de forma
  (`drawShapeParticle`, Sprites.js): chama (FIRE), gota (WATER), folha (GRASS), fragmento
  (BUG/STEEL), raio (ELECTRIC), cristal (ICE), estrela (FIGHTING), bolha (POISON), pedaco de rocha
  (GROUND/ROCK), pena (FLYING), espiral (PSYCHIC), nevoa (GHOST), garra (DRAGON/DARK) — varios tipos
  dividem familia de proposito (a cor via `colorForType` ja diferencia), 12 formas contra 1
  anterior. `Effect` ganhou `elementType` (`CombatSystem.js#resolveHit` = `ability.type`), lido por
  `drawImpactBurst`/`drawAoeRing` para escolher a forma. AOE ganhou 12 particulas tematicas ao redor
  do anel de expansao real (`worldSize`), alem do anel ja existente — "ampliadas e maior fidelidade"
  (pedido explicito), nao so o anel generico. A "acao temporaria de fallback" pedida (efeito bonito
  via cor do elemento sem asset real) **ja era a arquitetura existente**: nao trocou CSS/`<div>` por
  Canvas porque o jogo inteiro (mundo, sprites, combate) ja renderiza em `<canvas>`, nunca em DOM, e
  divs de VFX por cima quebrariam a transformacao de camera/zoom que todo o resto usa. Se
  spritesheets/gifs por tipo aparecerem, so plugam dentro de `drawShapeParticle` (ou `drawImage` no
  lugar dela quando houver asset) — nada mais no pipeline de combate muda. Ao vivo: hook temporario
  `window.__game` (removido antes de finalizar, ver "Gotchas conhecidos") pausou o loop
  (`loop.stop()`) e forcou um frame com `Effect`s a `age` fixo (evita screenshot vs. animacao de
  60fps) — 8 tipos single-target e 1 AOE inspecionados, formas distintas confirmadas, zero erro novo
  no console.

## Decima leva: por que o modo offline nao funcionava "em alguns dispositivos"

Investigacao pedida pelo usuario ("verificar o porque de alguns dispositivos o modo offline nao
funcionar corretamente"). **Cinco** problemas distintos, todos reproduzidos e verificados ao vivo
(Brave via CDP, servidor vanilla numa porta separada) antes e depois do fix. Correcoes **nos dois
codebases** — vanilla (`js/`) e port React em `web/`, que ja tinha portado o mesmo desenho e os
mesmos bugs.

- **Causa raiz #1 — o catch-up perdia 59 de cada 60 segundos em segundo plano (o "alguns
  dispositivos" do titulo)**: `main.js` media gap = agora menos o timestamp do ultimo tick ao vivo
  (`lastLiveTickAt`), que so serve em navegador que **congela** a pagina oculta (Safari/Chrome
  mobile, aba descartada). Chrome/Edge desktop: *intensive throttling* — o `setInterval` do
  `GameLoop` segue rodando, so que 1x por MINUTO, cada despertar clampado em `MAX_DELTA` (1s) e
  ainda **reescrevia o timestamp**. Gap medido nunca passava de ~60s: 3 horas de aba minimizada = ~3
  minutos de jogo. Fix: **contabilidade de debito** no lugar do timestamp — `simulatedSinceSync`
  (soma dos `dt` simulados, alimentada por `updateGame`) contra o relogio de parede; a diferenca e a
  divida do catch-up, qualquer que seja a causa da perda (throttle, clamp do `MAX_DELTA`, suspensao
  do SO). Port: `web/src/engine/clockDrift.ts` (singleton, alimentado por `useGameLoop`, lido pelo
  catch-up do `App.tsx` — componentes irmaos).
- **Causa raiz #2 — nenhum save quando a aba era ocultada**: fora do `setInterval` de 10s so havia
  `beforeunload`, que navegador mobile **nao dispara** ao matar pagina em segundo plano. `savedAt`
  mede o tempo fora no Farm Offline: save velho = tempo errado. Agora salva tambem em
  `visibilitychange`(hidden) e `pagehide`, nos dois codebases (port: `forceSave()` novo em
  `gameStateStore.ts`, escreve na hora sem esperar mudanca de estado disparar o `persist`).
- **Causa raiz #3 — simulacao sem teto travava/matava o aparelho**: catch-up era "sem limite de
  tempo", passo fixo em 0.1s — gap de 3 dias = 2.6 milhoes de passos de combate completo, sincronos,
  na thread principal. Desktop: travada longa; celular: navegador mata a pagina — e como
  `saveGame()` so vinha DEPOIS da simulacao, o save nunca era gravado e **a mesma simulacao
  condenada rodava de novo a cada carregamento**. `simulateWorldSeconds`
  (`js/systems/OfflineSimSystem.js` + `web/src/engine/systems/offlineSimSystem.ts`) ganhou dois
  limites independentes: `maxSteps` (250k, escolhido para o cap de 6h do Farm Offline continuar no
  passo pedido de 0.1s — zero mudanca de fidelidade no caso que o jogo usa) e `maxWallClockMs`.
  Estourar o orcamento **nao descarta o resto do gap**: passo quadruplicado (ate 3 rodadas, custo
  total limitado a ~2.5x o orcamento), simulacao segue com menos fidelidade — perder precisao e
  melhor que perder as horas do jogador. So se nem isso bastar e que para, com `truncated:true`, que
  o modal do Farm Offline agora explica em vez de so mostrar menos progresso do que o tempo fora
  sugeria. O catch-up de segundo plano usa orcamento menor (`CATCHUP_WALL_CLOCK_BUDGET_MS = 1200`)
  que o boot (2500), porque roda com o jogo ja na tela. Medido no Brave: 3 dias no vanilla = 2.5s e
  nenhuma travada; 6h no port = 3.0s com o tempo todo creditado.
- **Causa raiz #4 — relogio do dispositivo andando para tras**: `Date.now() - savedAt` fica negativo
  (resync de NTP, usuario mudando a hora, dual boot, save de maquina adiantada). O codigo antigo so
  nao entrava no `if` e o `savedAt` no futuro continuava la — Farm Offline morto ate o tempo real
  alcancar o timestamp furado. Agora gap negativo forca save imediato para reescrever o timestamp
  com o relogio deste aparelho, e `simulateWorldSeconds` recusa `seconds` nao-finito/negativo (gap
  negativo faria o `while` rodar para sempre).
- **Causa raiz #5 — falha de armazenamento em silencio**: `SaveManager.save`/`persist` engoliam o
  erro num `console.warn`. Sem save nao ha `savedAt`: "o farm offline nao funciona" fica
  indistinguivel de "o jogo nao salva" — e Safari em navegacao privada lanca na escrita. Agora um
  toast (uma vez por sessao) avisa o jogador nos dois codebases.
- **Tres gatilhos pro catch-up, nao um**: `visibilitychange` (troca de aba/minimizar), `pageshow`
  (volta pelo bfcache, que retoma sem necessariamente passar por transicao de visibilidade) e
  `setInterval` de 10s — este ultimo e o unico que cobre os casos **sem nenhum evento de
  visibilidade**: notebook com a tampa fechada e a aba em foco, e tela de celular desligada em
  alguns navegadores Android. Rodar com a aba oculta mantem o save fresco, entao aba descartada em
  segundo plano retoma de um ponto recente.

### Dois bugs do port React (`web/`) achados durante a verificacao

Fora do pedido, mas os dois quebravam o Farm Offline no port de forma total — e `web/` e o alvo da
migracao, entao ficaram corrigidos junto:

- **Draft do immer vazando para dentro do estado persistido (o pior bug desta leva)**: o loop de
  combate roda inteiro dentro de `useWorldStore.update(draft => ...)`, entao
  `enemy.poke`/`world.player.poke` sao proxies de draft. As funcoes de progressao/captura fazem
  `{...poke, ...}`, que copia o nivel de cima mas deixa `ivs`/`stats`/`unlockedAbilities` apontando
  pros proxies; terminado o producer, o immer **revoga** esses proxies. A partir da **primeira
  captura**, `JSON.stringify(gameState)` lancava
  `Cannot perform 'get' on a proxy that has been revoked` — e como o `setItem` do `persist` engolia
  o erro num `console.warn`, **o jogo nunca mais salvava**, em silencio. Reproduzido ao vivo (log do
  browser cheio de warnings, save no localStorage congelado). Fix: `detachPoke()` (clone JSON) na
  **fronteira da store persistida** — `addCapturedPoke`/`addPokeToTeam`/`updatePokeInstance` — e nao
  nos 3 pontos que hoje escrevem POKE, para nenhum caminho futuro reintroduzir o mesmo vazamento.
- **`persist` gravando a cada `set`**: no vanilla o modo `silent` pula o `saveGame()` por kill de
  proposito; no port quem grava e o middleware, que reage a QUALQUER `set` — e um unico kill faz
  varios (ouro, itens, POKE, treinador, pokedex). Simulacao de 2h fazia dezenas de milhares de
  `JSON.stringify` do estado inteiro + escritas no localStorage. Novo `withSavesDeferred(fn)` (troca
  o storage por no-op durante a simulacao e grava **uma vez** no fim) embrulha as duas chamadas de
  simulacao.


## Tier de spawn: o peso deixou de ser `catchRate`

Antes `encounter.weight` = `species.catchRate`. **Captura** nao tem relacao com **aparicao**:
Dunsparce (catchRate 190) ocupava **27%** de uma hunt; real = vaga de **1%**, a mais rara. Escolhido
por ser "dado que a planilha ja tinha", nao por estar certo. Hoje: **0,3%** na Planicie Lv11-20, a
faixa mais rara da hunt.

- **Planilha nao serve de fonte aqui.** Coluna `Slot` sugeria derivar a chance real, mas e
  **reconstrucao** infiel no slot: contra o disassembly, **48 das 78** divergiam — TENTACOOL 30% vs
  74% real (vaga de 60% da agua), MAGIKARP 51% vs 69%. E so cobre Johto no `day`: 130 das 212
  spawnaveis sem dado.
- **Fonte real**: `scripts/derive-spawn-tiers.js` le disassemblies `pret/pokecrystal`,
  `pret/pokegold` (Gold+Silver), `pret/pokered` (Red+Blue); cobre as **quatro** formas de encontro
  selvagem Gen2: grama, surf, pesca, headbutt — so grama+surf poria Remoraid, Qwilfish e Heracross
  em "nunca selvagem", falso. Resultado em `scripts/spawn-tiers.json` (nunca editar a mao): build
  sem rede; `.asm` em `.cache/pret/` (gitignorado).
- **Escala espelha `GrassMonProbTable` do Gen2** (30/30/20/10/5/4/1): os 5 tiers **sao** vagas
  reais, nao numeros a esmo — `muito_comum` 30, `comum` 20, `incomum` 10, `raro` 5, `muito_raro` 1.
  Metrica: fatia da especie no encontro do local, media entre locais onde aparece.
- **Procedencia por especie** (`origem` no JSON), auditavel em seis meses: das 251 do dex, **150**
  do Gen2 (`gsc`), **7** do Gen1 (`rb`, ausentes no Gen2), **94** de regra (`regra`) — sem encontro
  selvagem nas duas geracoes (troca/pedra, presente, fossil, lendario), sem taxa pra medir. Regra:
  profundidade na cadeia (mais fundo = mais raro), profundidade 0 dividida entre "ainda evolui"
  (Pichu, Togepi, Eevee → `incomum`) e "nunca evolui" (Snorlax, Lapras, Aerodactyl → `raro`); sem
  separar, Snorlax sairia tao facil quanto Pichu.
- **Onde mora**: tabela `spawn_tiers` (chave + peso), coluna `species.spawn_tier` no Postgres
  (migration `spawn_tier_por_especie`). Peso no banco, nao em constante do build: e balanceamento,
  rebalancear = `update`, nao deploy. NOT NULL **sem default** de proposito: especie nova declara
  tier, senao entra muda como 'incomum' sem ninguem notar.
- **Dois geradores, mesmo tier de fontes diferentes**: `sync-planilha.js` le o JSON,
  `generate-catalog.js` le a tabela, banco semeado do mesmo JSON — `npm run catalog:verificar` segue
  dando **14 arquivos byte-identicos**, e o diff prova que o seed nao divergiu do versionado. Sem
  fallback silencioso: especie sem tier **estoura**.

### Armadilhas reais encontradas montando isso

- **Recortar so o periodo `day`** (pra casar com a planilha) tornava Hoothoot (noturno), Ledyba e
  Spinarak (manha) "nunca selvagem". Nao ha ciclo dia/noite: chance = media dos 3 periodos, noturno
  conta 1/3.
- **`common` e `rare` de headbutt com peso igual** inflava quem so aparece na `rare`: Heracross saia
  `muito_comum` sendo encontro dificil. `rare` so sai em arvore rara — ponderada em 10%, cai pra
  `raro` (3%).
- **Grafo de evolucao via `SPECIES[].evolvesTo`** nao funciona: planilha so preenche esse campo em
  evolucao por nivel; pedra (Growlithe→Arcanine) e troca (Kadabra→Alakazam) ficam de fora, forma
  final vira profundidade 0 — Alakazam sairia tao comum quanto Pichu. Grafo vem de
  `evos_attacks.asm` (`EVOLVE_LEVEL/ITEM/TRADE/HAPPINESS/STAT`).
- **Derivar so as ~226 spawnaveis** deixava 25 linhas de `species` sem tier; migration falhava no
  `set not null` (aconteceu). Roster = National Dex inteiro (#1-251), de `pokemon_constants.asm`,
  que tem um **segundo** `const_def 1` com as 26 formas do Unown; sem cortar no `const_skip` viravam
  "especies" (277 em vez de 251).
- **`MR__MIME` tem underscore duplo**, mantido na chave (`mr__mime`). Script que "normalizava"
  `__`→`_` gerava id inexistente. Checagem contra o arquivo gerado nao pegou (Mr. Mime nao e
  spawnavel) — pegou o NOT NULL da migration.
- **Bug real pre-existente, achado ao vivo**: `HuntMenu.tsx` keava linhas por `sp.id`, e a hunt do
  Campeao Lance tem **tres Dragonites** (composicao real dele) — React reclamava de chave duplicada,
  podia omitir linhas. Encontros sempre certos (indexados, `lance_0..lance_5`); so a key errada,
  virou id do encontro.

## Determinismo: a aleatoriedade sai de uma semente, nao de `Math.random()`

Preparacao pra Fase D (autoridade migra pro servidor). Com `Math.random()`: sem estado pra salvar,
reproduzir nem verificar — cliente rerodando o gerador ate sair shiny era invisivel. Agora tudo
sorteia de um PRNG com semente dentro do `WorldState`.

- **`web/src/core/rng.ts`** — mulberry32. Estado de 32 bits inteiro num numero: serializa com o
  mundo sem tratamento especial. `Rng = { state, draws }`; `draws` conta sorteios
  (diagnostico/checkpoint barato pro servidor). `nextFloat(rng)` **muta** o rng de proposito: vive
  no draft do immer, mutar em lugar salva o avanco. `randomSeed()` usa `crypto.getRandomValues`, nao
  `Math.random()`: semente nao pode ser adivinhavel.
- **`core/random.ts`** — `randRange`/`randInt`/`rollChance`/`weightedPick` recebem `Rng` como 1o
  parametro. **Sem default**: sem volta silenciosa pro nao-verificavel.
  `createPokeInstance(rng, ...)` idem — seus 3 sorteios (IV, raridade, shiny) sao os que o servidor
  reconfere.
- **`FUNCS.random` do `formulaEngine` agora ESTOURA** sem `Rng`. Hoje so `DAMAGE_VARIATION` usa
  `random()`, mas a planilha pode ganhar outras — fallback silencioso reabriria o buraco.
  `eval(chave, contexto, rng)` ganhou o 3o parametro.
- **Contadores de id sairam de singleton de modulo** (`nextEntityId`/`nextEffectId`/
  `nextPendingHitId`) pra `world.counters`. Nao e estetica: `let` de modulo faz o id depender de
  quantas cenas a aba construiu; ja mordeu 2x (ver "Gotchas conhecidos": `import()` extra criava 2a
  copia do modulo com contador zerado, ids colidindo com os do jogo).
- **Sequencia atravessa trocas de cena**: `buildMapWorld`/`buildHospitalWorld` recebem
  `rng`/`counters` do mundo atual (`SequenciaDeSorteio`) — sessao = uma sequencia so. Sem isso, cada
  ida ao Hospital reiniciaria o stream; servidor rastrearia semente por cena, nao por sessao.
- **Estimar dano nao consome a sequencia**: `estimateDamage` (so ranqueia candidatos) usa
  `deriveRng(rng.state, 'estimate')`, le o estado sem avanca-lo. Candidatos variam por
  nivel/cooldown: gastando sorteios, a sequencia verificada dependeria de detalhe interno da IA, nao
  de eventos de jogo. Mesma tecnica no preview da Pokedex (`deriveRng(0, species.id)`), que fixa o
  POKE do cartao.

### Limites — o que isto garante e o que NAO garante

Garante **sequencia de sorteios** reproduzivel. **Nao** promete replay bit-a-bit entre maquinas:
motor usa `Math.sin`/`cos`/`atan2` no movimento e o IEEE 754 nao especifica essas funcoes bit-a-bit
— engines (e ate versoes da mesma engine) divergem no ultimo bit. Verificacao no servidor deve usar
os **sorteios discretos** (shiny, IV, raridade, crit, captura, especie/nivel do spawn), inteiros ou
comparacoes de limiar, nao igualdade exata de coordenadas.

`poke.uid` **fica de fora da sequencia de proposito** — vem de `crypto.randomUUID()`. E PK de
`pokemon_instances`: identidade de persistencia, nao resultado de simulacao; saindo da semente, dois
jogadores na mesma semente gerariam uids iguais, colidindo na PK. `randomUUID` nao toca no `Rng`,
nao dessincroniza nada.

### Prova automatizada

`web/src/engine/determinismo.test.ts` (vitest — `cd web && npm test`). "O jogo e deterministico"
quebra em silencio: basta um `Math.random()` novo em qualquer sistema e nada pareceria diferente.
Roda 600 passos de simulacao real 2x com a mesma semente, compara mundo com mundo campo por campo
(posicoes, POKEs, IVs, ids, efeitos, pendingHits), com controle negativo (semente diferente
**precisa** divergir) pro teste nao passar por acidente.

Pegou o unico ponto que ainda escapava (o `uid`) — leitura do codigo nao tinha pego.

### Bug real corrigido durante a verificacao ao vivo

`useWorldStore.getState()` devolve estado **congelado** pelo immer (autoFreeze) e `nextFloat` muta o
rng: passar `getState().rng` a um helper estoura com `Cannot assign to read only property 'state'`.
Era o que `chooseStarter` fazia — quebrava a criacao do primeiro POKE de conta nova. `worldStore`
ganhou `sortear(fn)`: sorteia dentro do `update` (rng = draft mutavel) e devolve o resultado,
gravando o avanco em vez de perde-lo. Todo sorteio fora de um sistema (que ja recebe o draft) passa
por ele.

## Fase D — autoridade no servidor (em andamento: D1 concluido)

### Correcao de plano: nao ha verificacao por re-simulacao

Plano original: "checkpoint + reconciliacao: servidor re-simula da semente e compara com o que o
cliente mandou". **Descartado, por dois motivos medidos:**

1. **Comparar nao funciona.** Fase C garante determinismo *dentro de uma engine*, mas o motor usa
   `Math.sin`/`cos`/`atan2` e o IEEE 754 nao especifica essas funcoes bit-a-bit. Cliente = navegador
   (V8/SpiderMonkey/JSC), servidor = Node. Posicao diverge no ultimo bit -> engajamento -> kill.
   Comparador acusaria jogador honesto.
2. **Se comparar custa o mesmo que simular, nao compare — simule.** Re-simular gasta a mesma CPU que
   ser a simulacao, sem comprar seguranca nenhuma a mais.

**Desenho adotado:** servidor **e** a simulacao, sob demanda (nao loop continuo por jogador).
Cliente manda *intencao* ("estou na hunt X com o POKE Y"), nunca resultado. No flush, servidor roda
`simulateWorldSeconds` pelo intervalo medido **pelo relogio dele** e grava. Simulacao local vira
predicao cosmetica, igual client-side prediction de FPS.

Medido no D1: **30 minutos de jogo simulam em 26ms** em Node; 6h de Farm Offline dariam ~350ms.
Custo de ser autoridade e desprezivel — sustenta a escolha.

Descartado tambem "loop continuo por jogador": custo escala com jogador conectado, obriga interpolar
o canvas a partir de snapshot, e nao compra seguranca a mais que o sob demanda.

Fase C continua valendo por outro motivo: servidor passa a **emitir a semente**, entao o cliente nao
reroda sorteio ate sair shiny.

### D1 — o motor roda headless em Node (concluido)

`engine/controller.ts` misturava duas coisas com ciclos de vida diferentes. Partido:

- **`engine/simulation.ts`** — nucleo puro: construcao de mundo, `stepWorld`, `handleEnemyDefeated`.
  Nao importa NENHUM valor de `gameStateStore` (puxa adaptador de persistencia -> `lib/supabase` ->
  `import.meta.env`, so no bundle do navegador); `GameStateStore` entra so como **tipo**, apagado
  pelo build. `useToastStore` ficou por ser zustand puro e rodar em Node — e o servidor simula
  sempre com `silent: true`, que ja pula toda notificacao.
- **`engine/controller.ts`** — so as acoes que a UI chama. Podem tocar as stores a vontade.
- **`engine/headless.ts`** — porta de entrada do servidor. Reexporta o motor + o TIPO
  `GameStateStore`: garante que o adaptador do servidor sobre o Postgres nao esqueca metodo —
  esquecendo, type-check quebra em vez de a simulacao falhar em runtime no meio de 6h.
- **`npm run build:engine`** (`vite build --ssr`) empacota tudo num ESM de ~548kB importado direto
  pelo Node. Usa o Vite existente: aliases `@/` e catalogo gerado resolvem sem ferramenta nova.

**Nao existe uma segunda implementacao das regras no servidor.** Duas implementacoes divergem no
primeiro ajuste de balanceamento, e a divergencia vira o buraco que a autoridade deveria fechar.

Provado ao vivo (`scratchpad/smoke/headless.mjs`, 7/7): catalogo com 226 especies carrega em Node,
mundo constroi, 30 min rendem 21 kills / 245 ouro / 84 xp em 26ms, e **a mesma semente produz
exatamente o mesmo resultado** no servidor.

### D2 — o servico de autoridade (concluido; o cliente ainda NAO foi religado)

`server/` — handler `fetch(Request) => Response`, sem framework. Worker do Cloudflare **e**
`export default { fetch }` e o Node 22 tem `Request`/`Response` nativos: mesmo arquivo roda nos
dois; `src/node.ts` (adaptador `node:http`) = unico com codigo de plataforma. Com hospedagem em
aberto, mantem a escolha aberta de graca. 4 rotas — framework nao pagaria o custo.

- **`POST /sessao/abrir`** — cliente declara **intencao** (`mapId`, `pokeUid`). Servidor valida mapa
  existente, POKE da equipe DELE, hunt desbloqueada e continente liberado; fecha (com flush)
  qualquer sessao anterior; **gera a semente**. Semente nunca volta pro cliente: decide shiny, IV,
  raridade e crit — deixar o cliente escolher seria deixar ele procurar a que da shiny.
- **`POST /sessao/flush`** — simula de `last_flush_at` ate `now()` **pelo relogio do servidor** e
  grava. Nada do corpo do request entra na conta: nem tempo, nem kills, nem ouro.
- **`POST /sessao/fechar`** / **`GET /estado`**.

**Uma sessao aberta por vez** (indice parcial + fechamento no abrir). Sem isso, abrir N sessoes e
dar flush em todas multiplicaria o mesmo intervalo por N — jeito mais direto de imprimir ouro aqui.

`last_flush_at` avanca pra **agora**, nao pra `desde + creditado`: o tempo cortado pelo teto de 6h
foi tempo real que passou, e credita-lo daria direito de acumular semanas paradas e sacar tudo de
uma vez. Intervalo negativo (relogio pra tras) credita zero e so re-ancora.

#### A sessao simula por JANELAS, e a sequencia de sorteio precisa atravessar todas

Flush nao e simulacao continua: janela nova a cada ~30s, cada uma montando mundo do zero com
`buildMapWorld`. Logo **o estado do sorteio tem que ser persistido entre janelas** —
`game_sessions.rng_state`/`rng_draws`, semeados de `seed` na abertura e regravados no fim de todo
flush (migration `sessao_guarda_o_estado_do_sorteio`).

Comecou errado; bug mais grave da fase: `aplicarFlush` fazia `createRng(sessao.seed)` por janela,
semente imutavel → toda janela repetia a **mesma sequencia**: inimigos, niveis, IVs, raridade,
shiny. 6 janelas de 30s: identicas, 9 kills, mesmo `spearow:1:comum` em cada. Sessao = loop de 30
segundos; jogador so notava na mochila ("varias copias iguais do mesmo POKE"). Ouro/XP nao
denunciavam — subiam normalmente.

`seed` continua imutavel de proposito (origem auditavel da sessao); `rng_state` guarda a sequencia.
`restoreRng` (`core/rng.ts`) torna a distincao explicita no tipo, em vez de um `createRng` que
parece certo em qualquer call site.

**A tentacao errada aqui e "so nao reconstruir o mundo".** Nao adianta: servidor e serverless, nao
guarda estado entre requests por design — mundo *vai* ser reconstruido. Precisa sobreviver a
sequencia, nao o mundo.

Efeito colateral aceito e nao corrigido: reconstruir o mundo devolve o jogador pro spawn e respawna
os inimigos a cada janela — tempo ate o primeiro inimigo pago toda vez. Medido, e pequeno (~10 kills
por 30s em janelas ou em simulacao continua de 1h), mas se o intervalo de flush cair muito passa a
morder.

**Nao existe uma segunda implementacao das regras.** Servico importa o motor via `#engine` (bundle
de D1) e o mapeamento DB<->jogo via `playerMapper` reexportado — mesmo codigo do cliente.
`server/src/estadoDoJogador.ts` implementa o tipo `GameStateStore` INTEIRO sobre `GameStateData`
puro: esquecer um metodo quebra o type-check, em vez de estourar no meio de uma simulacao de 6h em
producao.

Autenticacao pergunta ao Supabase (`GET /auth/v1/user`), nao decodifica JWT local. Custa uma ida de
rede por request; troca consciente: verificar em casa exige acertar segredo, algoritmo, `aud`,
`exp`, rotacao e revogacao — errar qualquer um = falha de autenticacao silenciosa. Se a latencia
incomodar: cache curto por token, nao verificacao caseira.

Verificado ponta a ponta sem navegador (`scratchpad/smoke/autoridade.mjs`, **21/21**): conta nova
via API do Supabase; sem token e token falso = 401; POKE alheio 403; hunt inexistente 400;
continente trancado 403; sessao aberta com semente gravada no banco e ausente da resposta; 20s de
jogo = 8 kills / 85 ouro em 446ms; ouro do banco batendo com a resposta; cliente **falhando** ao
voltar o relogio da sessao e ao abrir sessao paralela.

#### Bug real encontrado por isto: jogador novo nascia sem hunt nenhuma

`handle_new_user` fazia `insert into players (user_id)` e `unlocked_maps` caia no default `'{}'`. No
cliente passava despercebido porque nenhum mapa tem `unlock_cost`: cartao mostrava "Desbloquear" em
vez de "Entrar" e desbloquear de graca funcionava. Pro servidor virou bloqueio duro — e estava
certo, o banco dizia que o jogador nao tinha hunt nenhuma. Corrigido na origem (migration
`semear_hunts_desbloqueadas`), lista saindo de `maps where unlock_cost is null` em vez de constante
a mao: hunt nova continua funcionando sozinha.

### ATENCAO — o cliente ainda e autoritativo

Servico existe e funciona, mas **nada obriga o cliente a usa-lo ainda**. Ate o D3 revogar a escrita
do cliente na RLS (`players`, `pokemon_instances`, `player_items`, `player_pokedex`), um jogador
continua conseguindo `update players set gold = 999999999` do DevTools. **Nao abrir cadastro publico
antes disso.**

### D2/D3 — o que falta

- **D2**: servico Node (Fastify) como unico escritor de progresso; API de intencao; servidor emite a
  semente; adaptador de `GameStateStore` sobre as linhas do Postgres, usando `service_role`.
- **D3**: revogar a escrita do cliente na RLS (`players`, `pokemon_instances`, `player_items`,
  `player_pokedex`) e rodar o teste adversarial **antes** de abrir cadastro publico. Ate la o
  cliente ainda e autoritativo — consegue `update players set gold = 999999999` do DevTools.
- **Decisao pendente do usuario**: onde o servico Node roda (Fly.io/Railway/Render/VPS). Custa
  dinheiro e depende da conta dele. Edge Function do Supabase nao serve: limite de **2s de CPU por
  invocacao**, igual no plano pago, e o catch-up de boot pode passar disso.

### Pendencia aberta (nao resolvida)

**401 intermitente** no console durante o cadastro em algumas rodadas do smoke (nao reproduziu num
cadastro limpo isolado; nenhuma checagem funcional falha, e o end-to-end de save na nuvem passa
12/12). Provavelmente chamada REST disparada antes de a sessao assentar. Resolver antes do D3 — na
Fase D o cliente tambem vai autenticar contra o servico Node.

## Migracao para React + Vite (branch `feat/migracao-react-vite`)

Jogo portado inteiro (motor, canvas e UI) pra um app Vite em `web/`: React + TypeScript + Tailwind +
shadcn/ui + Zustand + React Query. **O jogo vanilla continua intacto na raiz como fallback** — o
corte (apagar `index.html`/`js/`/`css/`/`server.js`) ainda NAO foi feito e depende de aprovacao
explicita.

- **Estado**: `web/src/stores/` — `gameStateStore` (persistente, **mesma chave de localStorage e
  mesmo formato de payload do `SaveManager` antigo**: save real carrega nos dois jogos),
  `worldStore` (combate, efemero, immer), `uiStore`, `toastStore` (substitui o `eventBus`, de um
  unico evento).
- **Motor** (`web/src/engine/`): funcoes puras sobre draft do immer. Toda referencia direta entre
  entidades (`entity.target`, `effect.owner`, `pendingHit.attacker`) virou **id + lookup**: com
  estado imutavel, guardar referencia arrisca apontar pra versao velha.
- **Canvas imperativo**: `useGameLoop` avanca a simulacao; desenho num `rAF` proprio do `GameCanvas`
  lendo `useWorldStore.getState()`. Canvas nao tem virtual DOM: rotear desenho pelo React so somaria
  overhead.
- **HP/EXP do POKE em campo vivem no `worldStore`** na hunt, sincronizando com o save periodicamente
  e nas transicoes. No vanilla os dois eram o mesmo objeto por referencia; quem mostra HP ao vivo
  (HUD, AbilityHUD) tem que ler do `worldStore`.
- **Arte**: `assets/` (~270MB) continua na raiz, servida em `/assets/*` por um plugin em
  `web/vite.config.ts` (dev/preview) e por `web/serve.js` (producao) — nada copiado nem linkado,
  `dist/` ~1MB. Chunks do build saem em `dist/build/` pra nao colidir com `/assets/`.
- **`npm run planilha:aplicar` agora emite os dois formatos**: `.ts` tipado em
  `web/src/data/generated/` e `.js` em `js/data/` (so se a pasta existir — desliga sozinho no
  corte). Nunca editar arquivo gerado a mao continua valendo.
- **Bugs reais achados ao vivo** (nenhum aparecia no type-check): jogo novo nascia com 0 de ouro e 0
  itens (`merge` do `zustand/persist` roda mesmo sem save e sobrescrevia os defaults de jogo novo —
  por tabela, auto-pot/auto-revive nunca disparavam); recarregar com save existente deixava o
  Hospital sem o POKE em campo (faltava reconstruir o mundo no boot, o que o `main.js` fazia na
  carga); tema claro do shadcn num jogo dark.
- **Paridade verificada** com os dois jogos lado a lado (Charmander Lv1, Route 46, 60s): kills 5 vs
  6, EXP 20 vs 22, level 2 nos dois. Diferenca de ouro vem do RNG de raridade (`sellMultiplier` de
  1x a 600x). Os 7 arquivos de dado gerado sao byte-identicos entre os lados (divergem so nas linhas
  de anotacao de tipo).

## Plano detalhado

Historico de decisoes por rodada: `.claude/plans/enumerated-soaring-trinket.md`.

### D3 (parcial) — o interruptor `VITE_SERVIDOR_URL`

**Um interruptor**: sem `VITE_SERVIDOR_URL`, simula e grava local como antes; com ela apontada pro
servico, autoridade vai pro servidor. Interruptor, nao troca definitiva: hospedagem indefinida —
apontar a variavel e o unico passo restante.

- `web/src/data/remote/servidor.ts` — transporte (token Supabase no `Authorization`).
- `web/src/data/remote/autoridade.ts` — `pedirAcao(acao, fallback)`: com servidor manda INTENCAO e
  **sobrescreve estado local com a resposta**; sem servidor roda `fallback`. Um caminho por tela:
  ligar/desligar autoridade nao mexe em tela nenhuma. Tambem sessao de hunt e flush de 30s.
- `gameStatePersistence.ts` — **onde o cliente deixa de ser autoritativo**: sob servidor, `setItem`
  early-return (nao grava), `getItem` le do servidor. Sem o return, autosave sobrescreveria o
  servidor — ultima escrita vence, pior que sem servidor.
- `server/src/acoes.ts` — UM endpoint, lista branca de ~17 acoes. **Nenhuma acao aceita VALOR do
  cliente**: diz "quero comprar 5 pocoes", preco sai do catalogo no servidor. Sem
  `addGold`/`addItem`/`setTrainer` — ganho so nasce de simulacao.

Ligados: starter, curar, usar item, evoluir, definir ativo, tirar da equipe, comprar, vender item,
vender tudo, vender POKEs, desbloquear hunt, sessao de hunt e flush.

**Ainda NAO ligados** (mutam local; sob servidor, perdem-se no proximo flush): travas de item/POKE,
config de auto-pot/auto-catch, `porNaEquipe` (mochila -> equipe). Manipulador ja existe no servidor;
falta trocar a chamada na tela.

#### Bug real achado aqui: Modo Pesadelo ficava trancado

Hunts Modo Pesadelo/BOSS: geradas em RUNTIME (`data/nightmareMaps.ts`), nunca entram em `maps`, logo
nunca em `unlocked_maps`. Checar so a coluna trancava o Modo Pesadelo inteiro, em silencio. Servidor
passou a aplicar a regra real do jogo — "hunt sem custo nasce liberada; com custo, exige ter pago".

Pendencia cosmetica: cartao mostra "Desbloquear" em vez de "Entrar" porque o cliente checa
`unlockedMaps.includes()`. Clicar funciona (gratuito, servidor aceita), so custa um clique a mais.

### O que falta pra fechar a Fase D

1. Ligar as 3 acoes restantes acima.
2. **Revogar a escrita do cliente na RLS** (`players`, `pokemon_instances`, `player_items`,
   `player_pokedex`). **Enquanto nao feito, cliente escreve direto — nao abrir cadastro publico.**
3. Teste adversarial completo.
4. O 401 intermitente no cadastro.

### D3 concluido — o cliente perdeu a escrita

As 3 acoes que faltavam foram ligadas (travas de item/POKE, mochila->equipe, config de auto) e a RLS
revogada. **O cliente nao consegue mais escrever progresso.**

- Config de auto sincroniza em **bloco** (`sincronizarAuto`), nao nos 14 pontos de mutacao da tela:
  pequena e idempotente, servidor a substitui inteira. Primeiro disparo do efeito ignorado de
  proposito — viria apos o estado chegar DO servidor, devolvendo os mesmos valores.
- Migration `cliente_perde_a_escrita`: `own rows all` (select+insert+update+delete) virou **select
  apenas**, `own row update` de `players` removida. Escrita nas 5 tabelas de jogador so pela
  `service_role`.

**Consequencia que e o ponto, nao efeito colateral: o jogo parou de funcionar sem o servidor.**
Fallback (sem `VITE_SERVIDOR_URL`) escrevia direto no Postgres e agora falha — era a brecha fechada.
Rodar exige `cd server && npm run dev` + a variavel.

#### Teste adversarial (8/8)

Ataques com o token legitimo do proprio jogador (o que qualquer um tem com DevTools): imprimir
ouro/diamantes, criar Mewtwo Lv100 mythic, multiplicar itens, apagar o proprio progresso, escrever
na pokedex. Todos falharam; leitura funciona; `service_role` continua escrevendo.

**O caso que mais engana: DELETE bloqueado devolveu 204.** RLS nao rejeita — nao acha linha que case
com a policy. Teste de status code passaria com o banco aberto. Todo caso afirma o EFEITO no banco.

#### Alinhamento cliente/servidor no desbloqueio de hunt

`HuntMenu` checava `unlockedMaps.includes(map.id)`; agora usa a regra do servidor — hunt sem custo
nasce liberada. Sem isso, Modo Pesadelo e BOSS apareciam como "Desbloquear".

### O que ainda falta na Fase D

- **Hospedagem**: onde o servico roda (Cloudflare Workers Paid, VPS, etc.). Hoje so localhost.
- **CORS**: `ORIGENS_PERMITIDAS` precisa do dominio real do jogo no deploy.
- **401 intermitente** no cadastro, ainda aberto.

#### Entrar numa hunt agora bloqueia se o servidor recusar

`controller.enterMap` virou `async`, devolve se entrou de verdade; tela so fecha nesse caso. Antes
`void abrirSessaoDeHunt(...)` trocava a cena sem esperar: com recusa (hunt trancada, POKE fora da
equipe, servico fora do ar), o jogador entrava, via combate, nao ganhava nada, sem aviso — simulacao
local continua desenhando. So aparece como "o jogo parou de dar ouro".

Defeito irmao, do commit do interruptor: desbloqueio fixo em `{ success: true }` — ramo "recursos
insuficientes" era codigo morto, desbloquear sempre entrava no mapa mesmo com recusa. `pedirAcao`
passou a devolver `boolean` (`fallback` pode devolver `false`), permitindo a UI decidir. Verificado
com `/sessao/abrir` bloqueado: tela **nao** fecha, jogador e avisado (3/3).

#### Farm Offline sob autoridade do servidor

Relatorio "Bem-vindo de volta" mostra resumo **do servidor**, nao simulacao local. Dois erros
simultaneos:

1. Simulacao local daria numeros DIFERENTES dos creditados (RNG e mundo independentes): relatorio
   nao bateria com o ouro recebido.
2. Modal nem aparecia: sob servidor `savedAt` vem do load remoto, gap local ~0, boot desistia. Tempo
   offline ERA creditado, em silencio — no clique seguinte em "Entrar", quando a sessao antiga era
   liquidada. Ouro pulava sem explicacao.

`assentarSessaoPendente()` liquida no boot a sessao aberta e devolve o resumo. Fecha (nao so flush)
porque ao voltar o jogador esta no Hospital, nao cacando. Tipo e o mesmo `OfflineSimSummary` local —
modal le os dois sem saber a origem: servidor roda o mesmo `simulateWorldSeconds`.

### Farm offline: combate pessimista + piso de 50% (regras do usuario)

Regra: **offline nunca pode render mais que jogar acordado**, mas nao pode degenerar pra zero.

- **Combate pessimista** (`WorldState.pessimista`, so pelo servidor no flush): variacao de dano
  travada no minimo (0.85, piso da formula `DAMAGE_VARIATION` da planilha) e zero critico. So isso —
  as duas alavancas mexem na RESOLUCAO do combate, so fazem matar mais devagar. **O spawn continua
  sendo o sorteio normal da hunt** (ver correcao abaixo).
- **Piso de 50%** (`server/src/farmOffline.ts`): pessimista abaixo de metade da taxa online medida,
  servidor completa a diferenca em ouro e XP.

#### Correcao: fixar o inimigo "mais forte" nao era pessimismo

Primeira versao fixava o spawn — encontro de maior nivel do pool, no nivel maximo — supondo "o mais
forte sempre" como limite inferior. **Errado nos dois sentidos, e o usuario reportou o sintoma:**
mochila voltava com centenas de copias do MESMO POKE. Medido (1h na Planicie Lv11-20, mesma
semente):

| spawn | kills | ouro | capturas | especies distintas |
|---|---|---|---|---|
| sorteado (normal) | 1213 | 305.005 | 219 | 28 |
| fixado (pessimista antigo) | 1073 | 209.165 | **332** | **1** (pidgey x332) |

Fixar a especie fixa junto a `catchRate`: o de maior nivel da hunt era Pidgey, facil de capturar — o
modo criado pra LIMITAR o offline capturava **50% mais** que o jogo ao vivo. "Mais forte" e "menos
lucrativo" nao sao a mesma coisa.

Pessimismo real e monotonico: dano minimo e zero critico so alongam o tempo por kill. Composicao de
especie/nivel voltou a da hunt. Com 40 sementes (1h cada), pessimista vs normal: **kills 1200 vs
1246, ouro 341.524 vs 364.946 (-6,4%), XP -3,6%, capturas 205 vs 213, e 28,5 especies distintas nos
dois**.

Duas honestidades: (1) margem fina (3-6%): "offline < online" e garantia **estatistica** sobre
milhares de kills, nao estrutural por sorteio; (2) **ouro precisa de amostra grande** — com 8
sementes o pessimista saiu 0,5% ACIMA do normal, ruido da cauda do `sellMultiplier` (ate 600x). So
com 40 sementes converge.

**Por que simula, nao projeta por formula:** spec pedia captura/shiny com probabilidade normal e
consumo real de pocao/bola, com morte e pausa no instante em que acabam — exige sorteio por kill e
inventario evoluindo no tempo. Projecao seria segunda implementacao das regras. Mudou COMO o combate
resolve, nao quem resolve.

**A amostra do piso tem minimo** (`AMOSTRA_MINIMA_SEGUNDOS=300`, `AMOSTRA_MINIMA_KILLS=10`):
`perfStats` zera a cada entrada em hunt; quem entra e fecha em 3s teria 1200 kills/h, e metade disso
pagaria mais que jogar. Trocar de hunt zera a amostra, fechando o truque de farmar hunt facil,
trocar pra uma brutal e deslogar.

**O piso multiplica o tempo REALMENTE FARMADO** (`simulatedSeconds`), nao o offline: POKE morto aos
10 minutos por falta de pocao, piso vale sobre esses 10 minutos — tempo cheio anularia a regra de
morte. Captura, shiny e drop nao entram no piso: sao eventos, nao taxa; nao existe "50% de um
shiny".

#### Armadilha ao testar isto

Comparar UMA semente nos dois modos **nao vale**: pessimista consome menos sorteios (pula critico e
variacao de dano), a sequencia desloca. Primeira versao do teste "provou" que pessimista rendia MAIS
(14 vs 9 kills) — artefato do deslocamento. Honesto e a media sobre varias sementes, **40 no minimo
pra ouro**.

#### Dois regimes de flush (correcao de um bug que eu mesmo introduzi)

Primeira versao ligava `pessimista = true` em TODO flush — inclusive nos de 30 em 30s com o jogador
na frente do jogo. Penalizava quem jogava de verdade E destruia a referencia do piso: se todo
combate e pessimista, nao existe "taxa online".

Agora o intervalo decide (`LIMIAR_OFFLINE_SEGUNDOS = 120`, folga confortavel acima do flush de 30s):

| intervalo | regime | combate | piso | perfStats |
|---|---|---|---|---|
| <= 120s | ao vivo | normal | nao | **alimenta** a taxa |
| > 120s | ausencia | pessimista | sim | nao alimenta |

Alimentar a taxa com resultado offline a tornaria auto-referente — incluiria os proprios periodos
ausentes.

**E `perfStats` nao acumulava nada no servidor.** `recordKill` vive num `if (!silent)` do motor e o
servidor simula SEMPRE em silencio: amostra zerada (`{gold:0,mobs:0,since:0}` no banco, confirmado),
a guarda de amostra minima reprovava o piso pra sempre — recurso era codigo morto. Flush ao vivo
passou a chamar `recordBatch`, remedio do catch-up de aba oculta. `abrirSessao` zera a amostra, como
`controller.enterMap` sempre fez.

Verificado com amostra semeada: piso dispara (+886.992 de ouro completados e gravados), amostra de
10s nao aplica, amostra longa com 3 kills tambem nao (4/4). Regimes: 7/7.

### Hospedagem resolvida: o servico roda como Supabase Edge Function

Decisao do usuario: tudo numa conta so. `supabase/functions/jogo/`.

**Eu tinha afirmado que Edge Function nao serviria** pelo limite de **2s de CPU por invocacao**
(igual no plano gratis e no pago). Limite e real; a conclusao nao era — tirada antes de ter numero.
Medido: 30 min de jogo simulam em 26ms; o pior caso (6h, teto do farm offline) mede **1593ms de
ida-e-volta incluindo rede**, com 21.594s creditados e 8.550 kills, sem `WORKER_LIMIT` (546). Cabe.

- `web/vite.edge.config.ts` empacota **motor + servico num arquivo so**
  (`supabase/functions/jogo/servidor.js`, ~240kB gzip). Necessario porque o servidor usa `#engine`
  (subpath import do Node) e especificadores `.js` apontando pra `.ts` — o resolvedor do Deno nao
  aceita nenhum dos dois. Bundle unico tira resolucao de modulo do caminho.
- `supabase/functions/jogo/index.ts` e **so casca de plataforma**, equivalente Deno de
  `server/src/node.ts`: le env, monta CORS, remove o prefixo `/jogo` do gateway. Nenhuma regra de
  jogo. `server/` continua funcionando local (`npm run dev`).
- `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` sao **injetadas pela plataforma** — sem segredo pra
  subir a mao. `ORIGENS_PERMITIDAS` vai por `supabase secrets set` (no deploy real, trocar pelo
  dominio do jogo; `*` com `Authorization` deixaria qualquer site chamar com o token do jogador).

Comandos: `cd web && npm run build:edge` e depois `npx supabase functions deploy jogo`.

Verificado contra a funcao publicada: **21/21** na suite de autoridade, 6h numa invocacao, **5/5**
no jogo real com o cliente apontado pra ela.

### Deploy no Cloudflare Pages: dois bugs que so aparecem publicado

O `dist/` do Vite **nao continha a arte**. Em dev, `assets/` (na RAIZ do repo, fora de `web/`) e
servida por um plugin do Vite (ver `vite.config.ts`), inexistente no site publicado, que so serve
estatico: site subia com o codigo certo e **zero sprite**, todo `/assets/*` em 404 — invisivel em
teste local, onde o plugin cobre. Corrigido com `web/scripts/copiar-assets.mjs` no fim do
`npm run build`. A copia NAO vive em `web/public/` de proposito: 281MB e 6.300 arquivos ali fariam o
dev server indexar tudo a cada boot.

Faltava `_redirects`. Sem ele, recarregar em `/jogo`, `/login` ou `/registro` da 404 — o arquivo nao
existe no disco, quem resolve a rota e o roteador. Arquivo existente ganha da regra: `/assets/*`
continua servido.

**Limites do Pages, medidos:** 6.311 arquivos (limite 20.000, folga confortavel) e maior arquivo
**20,7 MB** (`assets/hunt-backgrounds/cave.png`) contra **25 MiB por arquivo** — folga de 4 MB.
Background maior quebra o deploy, e a mensagem do Pages nao dira "seu PNG e grande demais". Vale
comprimir os backgrounds antes que morda.

Config no painel do Pages: **diretorio raiz VAZIO** (a raiz do repositorio), build `npm run build`,
saida `dist`, branch de producao `main`. As tres variaveis (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_SERVIDOR_URL`) sao de BUILD — sem elas o bundle sobe e quebra no
load, porque `lib/supabase.ts` estoura de proposito quando falta config.

> O diretorio raiz era `web` ate o app virar a raiz do repositorio (commit `70d5561`). Esta linha
> ficou desatualizada e mandou uma rodada inteira procurar um build quebrado que nao existia.

### O dominio de producao tem sufixo aleatorio — `poke-hunt.pages.dev` NAO e o jogo

**Producao: `https://poke-hunt-euj.pages.dev`.** Projeto se chama `poke-hunt`, mas o subdominio
emitido leva sufixo `-euj` porque `poke-hunt.pages.dev` **ja pertencia a outro projeto, de outra
conta** — hoje serve uma pagina "Poke Idle Hunt Checklist" sem relacao com este jogo.

Armadilha cara: sondar o nome "obvio" devolve `200 OK` com HTML em TODO path (inclusive
`/assets/....gif`, que volta `text/html`), parecendo um deploy quebrado do jogo. Custou um
diagnostico errado e uma entrada de CORS apontada pro dominio de um terceiro. Nome real sai de
`GET /accounts/{id}/pages/projects/poke-hunt` (campo `subdomain`), nao de adivinhacao.

`ORIGENS_PERMITIDAS` (secret do projeto Supabase, lida pela Edge Function) precisa conter esse
dominio. Valor atual: `http://localhost:5173,http://localhost:4173,https://poke-hunt-euj.pages.dev`
— os dois locais sao dev (`vite`) e preview (`vite preview`). Valor volta hasheado na API: pra saber
o que esta la, sonde origem por origem com preflight `OPTIONS` e veja quem recebe
`Access-Control-Allow-Origin`.

## Redesenho da HUD (handoff `design_handoff_game_hud/`)

Interface reconstruida do pacote em `design_handoff_game_hud/` (README com
tokens/medidas/breakpoints/z-index + `Game HUD.dc.html`, prototipo navegavel). Motor, canvas e
autoridade no servidor **nao mudaram** — so a camada DOM.

### O fundamento: escala fluida em `em`, e por que shadcn saiu da HUD

Raiz do jogo (`.hud-root` em `index.css`, aplicada no `GameShell`) define
`font-size: calc(clamp(13px, 0.55vw + 9px, 19.5px) * var(--hud-scale))`. **Todo tamanho, padding e
offset da interface e escrito em `em`**: a UI encolhe e cresce em bloco com a largura da tela, sem
media query por elemento. `--hud-scale` = preferencia do jogador (0.8–1.4, ajustavel em Config).

Incompativel com primitivos shadcn, dimensionados em `rem` (ancorados na raiz do DOCUMENTO): um
`Button` `h-8` dentro de card em `em` para de acompanhar quando a tela muda de tamanho — no
prototipo ja tinha estourado o input de % do auto-pot pra fora do painel de 19em. Dai
`src/components/game/controls.tsx`
(GameButton/Input/Select/Check/Switch/SegmentedTabs/Meter/GameCard), tudo em `em`. Primitivos shadcn
seguem **fora** do jogo (login/cadastro/home) e nos tooltips, sem escala fluida.

`hudScale` **nao** vive no `gameStateStore`: aquele estado e propriedade do servidor (responde com o
objeto inteiro, cliente sobrescreve o local), entao preferencia de video gravada la seria apagada no
primeiro flush. Vive em `localStorage` proprio, por aparelho (`uiStore`).

### Breakpoints em JS, nao em media query

`useBreakpoints()` (uiStore) le `viewportWidth`, alimentado por UM listener de resize compartilhado
por 8 superficies. Decisoes de ESTADO, nao so de estilo — em `<640` o card de taxas nao encolhe,
some, e o dado reaparece como chip no bloco central, em outro ponto da arvore.

| largura | o que muda |
|---|---|
| `<1180` | chat estreita de 20em pra 13em (nao encostar no menu central) |
| `<1140` | bloco central desce pra baixo dos cards laterais (`top: 7.7em`, esticado) |
| `<780`  | chat e botao Auto sobem pra cima do menu; colunas duplas dos paineis empilham |
| `<640`  | card de taxas vira chip, treinador so avatar, botoes laterais so icone, rotulos do menu somem |

O mesmo listener **limpa as posicoes de janela arrastadas** (`winPos`): janela largada no canto
direito de tela larga fica inalcancavel quando ela encolhe, e sem barra de titulo visivel nao ha
como traze-la de volta.

Medido ao vivo em 492px: rotulos somem, menu quebra em duas fileiras, barra de golpes logo acima
dela — rodape ocupa ~12,4em, entao os 10,6em do handoff pro chat deixavam o primeiro slot de golpe
por baixo dele. Em `narrow` o chat sobe pra 13,5em.

### Janelas: uma moldura so

`components/game/GameWindow.tsx` e a moldura de todo painel/modal (menu, perfil, relatorio offline).
Arrastar (posicao no uiStore, `hooks/useWindowDrag.ts` com `pointer*`, funciona no toque),
redimensionar (`resize: both` do CSS, sem JS), barra de titulo/rodape fora da area rolavel.

Dois detalhes nao-cosmeticos:

- **Largura padrao escrita uma vez por `ref`, nunca no `style` reativo.** No style, cada frame de
  arrasto reescreveria `style.width` — a mesma propriedade que `resize: both` grava — desfazendo o
  redimensionamento do jogador.
- **`max-height: min(86vh, 100vh - 12em)`.** 86vh e o teto do handoff; o segundo termo impede que o
  rodape da janela vire area morta atras do menu inferior.

### Bug real corrigido: o backdrop comia o clique do menu

Reproduzido ao vivo: Loja aberta, clicar em "bestiário" so FECHAVA a Loja. Backdrop `inset-0` com
`pointer-events:auto` (assim funcionava o clique-fora-fecha) fica sobre toda a HUD — clique acertava
ele, nao o botao. Trocar de tela exigia dois cliques. (Mesmo defeito ja existira no vanilla.)

Corrigido invertendo a responsabilidade: **backdrop puramente visual** (`pointer-events:none`), o
fechar-ao-clicar-fora virou listener de documento no `GameWindow`. HUD continua ABAIXO dele na pilha
(escurece junto com o jogo) e mesmo assim clicavel. Botoes de menu carregam `data-keep-open` — sem
isso, clicar no botao da tela ja aberta fecharia (listener) e reabriria (onClick) no mesmo gesto.

### Correcoes da secao 9 do `UI-INVENTARIO.md`

1. **Botao Auto posicionado** (`HudLayer`, canto inferior direito). Antes, filho direto da camada
   sem wrapper, caia no fluxo normal — aparecia no canto superior ESQUERDO, por cima do HUD.
2. **Loja em 52em** (Bestiario 56, Calculadora 46, Correio 40, padrao 36).
3. **Faixa segura no rodape**: golpes e menu na mesma coluna centralizada; janelas param acima dela.
4. **Toasts que mentiam, corrigidos na raiz.** `ShopMenu` fazia
   `const res = { success: true }; void pedirAcao(...)` e lia `res` depois — literal fixo. Comprar
   dizia "Comprou" mesmo sem ouro, "Vender Tudo" nunca aparecia (`itemCount` era 0), vender POKE
   dizia "por 0 ouro". Agora `pedirAcaoComLocal` devolve o resultado do fallback local, e — porque
   sob servidor o cliente NAO executa a acao nem sabe o preco — as acoes que faltavam ganharam
   `mensagem` no servidor (`server/src/acoes.ts`: comprar, vender item, desbloquear hunt, mover POKE
   entre equipe e mochila).
5. **Venda individual de POKE passa pela autoridade** (mesmo endpoint em lote). Antes chamava
   `sellBagPoke` local direto e o POKE reaparecia no sincronismo seguinte.
6. Diamantes mantidos na carteira (decisao do handoff).
7. **Lista de especies unica por hunt** — tooltip `?` duplicado removido.
8. **Pokedex: expandir != abrir perfil.** O mesmo clique fazia as duas coisas e o modal cobria o
   detalhe recem-aberto. Agora o perfil e botao explicito dentro do detalhe.
9. Tema "black" com identidade (ver tokens abaixo), no lugar do preset acromatico de fabrica.
10. Hierarquia tipografica maior e fluida.
11. **Loading/disabled nos botoes de round-trip** (`hooks/useAcaoPendente.ts`). `pendingKey` e por
    LINHA, nao global: lista de 30 itens nao congela inteira porque um deles esta no ar.
12. Responsividade real (tabela acima).

### Tokens

O `.dark` do `index.css` virou a paleta black do handoff (`--background #0a0a0c`, cards `#141519`,
borda `#232428`, `primary` = pilula clara `#e6e7ea` com conteudo escuro). Escada neutra
(`n900`..`n100`) e cores semanticas de DADO (`gold`, `diamond`, `hp`, `hp-low`, `exp`, `shiny`,
`ok`, `warn`, `bad`, `cat-physical`, `cat-special`) sao tokens em `@theme inline` — antes,
utilitarios Tailwind soltos (`amber-400`, `emerald-500`) espalhados. Paletas de **tipo elemental** e
**raridade** continuam onde estavam (`data/typeColors.ts`, `data/rarity.ts`): dado do jogo indexado
por chave, nao cor de chrome.

`--font-mono` (Geist Mono, `@fontsource-variable/geist-mono`) foi definido: `font-mono` era usado
nos tres elementos mais chamativos do DOM (splash "LVL UP !", contagens do Lance e do Auto-Revive)
sem o token existir — caia no stack default: Menlo no Mac, Consolas no Windows, Liberation Mono no
Linux. Texto do CANVAS (`render/sprites.ts`) continua `monospace` literal de proposito: nao herda
CSS e e pixel-art do mundo, nao chrome.

Icones: `@phosphor-icons/react` (pacote npm, nao CDN — custo de request a outra origem no primeiro
paint ja era regra do projeto pra fonte, vale igual pra icone).

### Telas novas: o que foi construido e o que ficou como aviso

Handoff pedia cinco telas novas. Tres nao tem sistema de jogo por tras, e **preencher com o dado de
exemplo do prototipo mostraria barra que nunca anda e botao "Resgatar" que nao paga nada** — pior
que tela vazia, porque parece bug.

- **Bestiario** (`features/bestiario/`) — REAL. Grade das 226 especies com contagem de abates
  (`pokedexKills`, normal/shiny), busca, filtros, painel de detalhe e estagios de progresso
  derivados dos abates. Limiares (500/2.500/10.000/50.000) sao decisao de design, como
  `BG_ROUTE`/`KANTO_BANDS` ja eram; o progresso contra eles e dado real. Tokens e Runas **nao**
  foram desenhados: nao existe economia de token no jogo (nenhum sistema concede nem consome), e o
  painel diz isso.
- **Calculadora de Forca** (`features/calc/`) — REAL. Chama `computeStatsAtLevel`, a MESMA funcao
  que cria POKE, sobe de nivel e evolui, com comparacao A/B e delta por atributo. Campos "Potencial"
  e "Bonus de runa" do prototipo NAO existem no modelo de dados; o que multiplica status aqui e
  raridade, shiny e IV — sao esses os controles.
- **Tasks, Correio, Mercado** — shells com aviso honesto. Nao ha tabela de missoes, de amigos nem de
  mercado (nem no Postgres nem no save), e nenhuma rota no servidor pra elas. Card de cada um ja
  esta desenhado; quando o sistema existir, o trabalho e trocar a lista.

Pela mesma regra, chip de missao e "Pokes capturados 11/20" do bloco central do HUD sairam: save nao
guarda captura por especie. Entrou "Pokedex X/226" (especies com pelo menos um abate registrado),
dado real que diz o que e.

### Verificacao

`tsc -b` limpo, `vitest` 7/7 (determinismo continua passando — nada do motor foi tocado),
`npm run build` completo com a copia de arte. Ao vivo no navegador contra o servidor de autoridade
local: conta nova, escolha de inicial, compra na Loja (ouro e quantidade conferidos no HUD, mensagem
vindo do servidor), Bestiario, Calculadora, perfil do POKE, entrada numa hunt com combate, auto-pot,
captura e level-up rodando — zero erro de console. Breakpoints conferidos em 1440, 1100 e 492px.

## Auditoria extrema pos-HUD: 4 bugs de autoridade corrigidos (2 criticos)

Rodada de auditoria "extrema" do jogo React sob autoridade do servidor. Cada achado **reproduzido ao
vivo** (Chrome DevTools contra a Edge Function publicada, conta descartavel, efeito conferido no
Postgres via `service_role`) antes e depois do fix — nao leitura de codigo. Os quatro sao do lado
React/servidor; **nenhum afeta o jogo vanilla na raiz**, que nao e autoritativo no servidor.

- **CRITICO — evolucao especial (e qualquer item consumido a exatamente 0) nao persistia**:
  `server/src/progresso.ts#gravarEstado` fazia `upsert` de `player_items` **sem diff de remocao**
  (`pokemon_instances` ja apagava linhas ausentes). Item chegando a 0, `removeItem`
  (`estadoDoJogador.ts`) apagava a chave de `estado.items`: linha nunca reescrita **nem apagada**,
  banco mantinha o valor velho. Efeito: 20 Stones gastas numa evolucao especial (Onix->Steelix etc.)
  voltavam no reload = evolucoes especiais infinitas com um lote; pocao/bola zerada ressuscitava.
  Corrigido com o mesmo delete-diff de `pokemon_instances` (busca `item_id` no banco, apaga os que
  sumiram de `estado.items`). `gameStateToItemRows` preserva item travado com quantidade 0, entao
  trava com saldo zero sobrevive. Provado ao vivo: 20 `stone_rock` -> evoluir -> linha ausente,
  especie = `steelix`.
- **CRITICO — Modo Pesadelo (19 espelhos) + 11 hunts BOSS eram 100% injogaveis**:
  `game_sessions.map_id` tinha FK `references maps(id)` (migration `20260807003000`), mas essas
  hunts sao geradas em RUNTIME e **nunca entram na tabela `maps`** — INSERT da sessao violava o FK e
  `/sessao/abrir` respondia **502**. Com a RLS revogada (D3), o servidor e o unico modo: endgame
  inteiro morto (cliente recusava a entrada corretamente, sem trapaca, mas ninguem entrava). FK era
  **redundante**: `app.ts#abrirSessao` ja valida em codigo mapa existente (`if (!MAPS[mapId]) 400`),
  hunt desbloqueada e continente liberado. Migration `20260807130000_sessao_map_id_sem_fk.sql` dropa
  o FK **pelo nome real achado em `pg_constraint`** (`drop constraint if exists <palpite>` no-op
  deixaria o bug de pe em silencio se o nome divergisse). Provado ao vivo: `nightmare_route_46` e
  `boss_articuno` abrem 200 (era 502); o INSERT ter sucedido e a prova de que o FK saiu.
- **MEDIO — POKE ativo no HUD/campo ficava errado ao trocar/remover da equipe**:
  `controller.ts#setActiveTeamIndex`/`removeFromTeam` liam `team[0]`/`team[activeIndex]` de forma
  **sincrona** logo apos `void pedirAcao(...)`. Sob servidor o `fallback` NAO roda (ver
  `data/remote/autoridade.ts`): a leitura pegava o time VELHO (resposta reordenada ainda nao
  chegara) e escrevia o POKE errado em `worldStore.player.poke` — HUD e sprite so se corrigiam na
  proxima troca de cena. Corrigido movendo a escrita pro `.then` da resposta, padrao de
  `chooseStarter`/`resetGame`.
- **MEDIO — recusa de compra/venda/desbloqueio mostrava codigo cru**:
  `buyItem`/`sellItem`/`unlockMap` devolvem um CODIGO (`insufficient_gold`, ...), nao frase, e
  `acoes.ts` lancava `ErroHttp(409, r.reason)` direto — chat mostrava "insufficient_gold". Como sob
  servidor o cliente so exibe a mensagem que volta (`reportarErro` usa `erro.message`), a traducao
  mora no servidor: novo `MENSAGEM_ERRO_ECONOMIA` em `acoes.ts` mapeia os 6 codigos pra PT. Provado
  ao vivo: `{"erro":"Ouro insuficiente."}`.

### Suspeita de exploit REFUTADA ao vivo (registrado pra ninguem "consertar" depois)

`aplicarFlush` faz read-modify-write de `last_flush_at`/ouro sem lock nem atomicidade, e ha tres
gatilhos de flush no cliente (timer 30s, `/acao`, `visibilitychange`) — parecia vetor de duplicacao
de ouro por flush concorrente (inclusive atacante disparando N flushes com o proprio token).
**Medido: 20 flushes simultaneos do mesmo intervalo de 120s creditaram 1.03x** (os ~5 de ouro de
diferenca sao ruido de RNG entre contas com sementes diferentes), todos 200. Dois motivos
estruturais neutralizam a corrida, e por isso **NAO** foi construido RPC de claim atomico (risco pra
um nao-problema):
1. ouro e gravado como **valor absoluto** (`gold = G0+g`), nao incremento — flushes concorrentes que
   leem o mesmo `last_flush_at` convergem pro mesmo total em vez de somar;
2. `sessaoAberta` usa `order=started_at.desc&limit=1`, entao mesmo que a corrida de `/sessao/abrir`
   (o indice parcial `game_sessions_abertas` **nao** e unique) deixe sessoes abertas orfas, so a
   mais recente e flushada — as orfas nao creditam nada. Efeito colateral cosmetico (linhas orfas),
   nao exploit; nao vale um unique index + tratamento de conflito.

### Nao mexido, com motivo

- **401 intermitente no cadastro** (pendencia ja documentada na Fase D): token recem-emitido ainda
  nao propagado no lado do Supabase — `auth.ts#autenticar` faz `GET /auth/v1/user`, que as vezes
  recusa token de milissegundos atras. Retry-on-401 no servidor mascararia token invalido de verdade
  e somaria latencia a toda falha legitima; fix correto, se incomodar, e client-side (nao disparar
  request autenticado antes da sessao assentar). Nao reproduz isolado e nao quebra funcao.
- **Virtualizacao das listas** (Mochila/Loja, 220+ cards): FPS medido 158+, zero long task.
  Otimizacao prematura — YAGNI ate uma colecao realmente derrubar o frame.

### a11y: `name` automatico nos campos de formulario da HUD

Chrome emitia "A form field element has neither an id nor a name attribute" por instancia (auditoria
contou 208, quase todas de busca/qtd/filtro renderizadas em listas). Corrigido na raiz:
`GameInput`/`GameSelect`/`GameCheck` (`components/game/controls.tsx`) e o slider de escala
(`SettingsScreen.tsx`) geram `name` via `useId()` quando o call site nao passa um (fallback vem
DEPOIS do spread pra sempre vencer, e respeita `name`/`id` explicito quando existe) — 3 componentes
cobrem os 208 warnings sem tocar em cada uso.

### Deploy e verificacao

Edge Function republicada (`npm run build:edge` + `supabase functions deploy jogo`) e migration
aplicada no banco linkado (`supabase db push`). Cliente (controller + a11y) via push na `main`,
observada pela Cloudflare Pages. Suite end-to-end contra a Edge publicada: **13/13** (criar conta,
starter, abrir `route_46`/`nightmare_route_46`/`boss_articuno`, evoluir com consumo de Stone
conferido no banco); recusa de compra em PT conferida a parte; `tsc -b` do cliente e do servidor
limpos; `vitest` 7/7.

## Encaixe da HUD no mobile: rodape MEDIDO em vez de offset `em` chutado

Pedido explicito do usuario ("HUD no mobile nao esta encaixando bem"). Reproduzido **ao vivo em
360/390px reais**. Armadilha que explica por que ninguem tinha pego antes:
`mcp__chrome-devtools__resize_page` trava em **500px** (minimo da janela do Chrome), entao todo
teste anterior parava em ~492-500px (o "medido em 492px" das notas da HUD acima). So
`mcp__chrome-devtools__emulate` com `viewport: '390x844x3,mobile,touch'` (device metrics override
via CDP) chega num celular de verdade. Em 500px o layout quase fecha; abaixo disso quebrava.

Regra de medicao, pra repetir: coletar os `getBoundingClientRect` de toda superficie com `z-index`
18–22 (a faixa da HUD, ver `HudLayer.tsx`), remover as contidas noutra maior (wrappers
compartilhados dao falso-positivo) e cruzar par a par — **overlap real e o que sobra**. Screenshot
sozinho engana (o wrapper pode sobrepor sem o conteudo, centralizado, chegar a colidir).

Tres colisoes concretas em `<640px`, todas corrigidas:

- **Chat cobria a barra de golpes; botao Auto passava por tras do menu.** Ancoravam por offset `em`
  fixo (`ChatLog` em `13.5em`/`10.6em`, Auto em `10.6em`) — ajustado a mao **duas vezes** e ainda
  errado: a altura do rodape (golpes + menu) muda com **dois** eixos, a largura (menu quebra em mais
  fileiras) **e** o `hudScale`. Nenhuma constante em `em` fecha os dois. **Fix:** rodape MEDIDO.
  `HudLayer.tsx` poe um `ResizeObserver` no wrapper bottom-center (golpes + `MainMenu`) e grava a
  altura em `uiStore.footerHeight` (guarda anti-loop: so `set` se o valor arredondado mudou).
  `ChatLog` e `AutoButton`/`AutoWindow` ancoram em `calc(${footerHeight}px + folga)` quando
  `colStack` (<780), com o `em` antigo so como fallback ate a primeira medida. Acima de 780px o
  rodape e fileira central estreita longe dos cantos: chat/Auto ficam nos offsets antigos — caminho
  medido so pro regime empilhado.
- **O menu quebrava em 3 fileiras de circulos grandes no celular**, inflando o rodape pra ~198px e
  empurrando tudo. `MainMenu` ganhou modo `compact` (= `narrow`): circulos de `3.1→2.6em` (`big` de
  `3.9→3.2em`), `gap` menor e `max-w` de `84vw→92vw`. Cabe em **2 fileiras**, rodape caiu pra
  ~134px. Nao forcei fileira unica de proposito — 8 itens em 360px ficariam pequenos demais pra
  tocar.
- **`hudScale` ate 1.4 numa tela estreita estourava o HUD** (card do POKE cobrindo o treinador, chat
  cobrindo o bloco central). O multiplicador manual (0.8–1.4, `--hud-scale`) multiplica um
  `font-size` que em `<=640px` ja esta no piso do `clamp` (13px): 1.4 vira ~18px/em e os cards em
  `em` passam da largura da tela. **Fix (`index.css`):** `@media (max-width: 640px)` limita o
  multiplicador manual a `min(var(--hud-scale), 1.15)` (e baixa o teto do `clamp` de 19.5→16px). E a
  UNICA media-query de layout do projeto, legitima: `font-size` e estilo puro, nao posicionamento —
  "breakpoint de layout em JS, nao CSS" continua valendo pro resto. **Tradeoff assumido:** sobrepoe
  parcialmente a preferencia do jogador (1.4 num celular vira 1.15). Alternativa — honrar 1.4 com
  HUD estourado, ou zerar o slider no mobile — e pior; 1.15 ainda da "um pouco maior" sem quebrar.
  Reverter e trivial.

**Verificado ao vivo** (device emulation, conta descartavel contra a Edge de producao): 360 e 390px
@ `hudScale` 1.0 -> **zero colisao real** (resta so o overlap *wrapper* do bloco central sob a
coluna de menus laterais; conteudo centralizado livra os icones na pratica — confirmado ate com o
nome longo "Route 46 (Inicial)"). Extremo 360px @ 1.4 -> residuais de 12–15px, tolerados. Em
Hospital e dentro de hunt (combate rodando). `tsc -b` limpo, `oxlint` limpo.

**Nao mexido, com motivo:** overlap wrapper bloco-central × coluna-lateral. Reservar espaco a
direita faria a linha da carteira (`500.000 ◆5 <local> Pokedex X/226`) **transbordar** no celular —
precisa da largura cheia. Com o conteudo em `justify-center`, ele nao alcanca os icones laterais;
wrapper sobrepoe, conteudo nao. `z-index` do bloco (19) < o da coluna (20), entao nem clique e
roubado.

## Leva de 2026-08-08: wipe do servidor, XP -50%, listas paginadas, preload de arte, golpes de Lv50

Pedido do usuario em 5 blocos (banco/backend, performance de UI, bugs de reatividade, ajustes
visuais, regras de combate). Tudo verificado ao vivo contra a Edge Function publicada (conta
descartavel, efeito conferido no Postgres com `service_role`, conta apagada no fim).

### Wipe: uma funcao no banco, nao uma sequencia de DELETEs no script

`supabase/migrations/20260808120000_rotina_de_wipe.sql` (+ a corretiva `...121000`) cria
`public.wipe_todos_os_saves()`; `scripts/wipe-todos-os-saves.js` (`npm run db:wipe`) so dispara.
Executado nesta sessao: **57 jogadores resetados, 11.735 POKEs apagados** — conferido depois
(0 linhas em `pokemon_instances`/`player_pokedex`/`player_auto_catch_rules`, 570 linhas de item =
57x10, todo `players` com exatamente 500.000 de ouro e 19 hunts liberadas).

Tres decisoes que nao sao estetica:

1. **A logica mora no banco por ATOMICIDADE.** Um wipe pela metade (POKEs apagados, ouro intacto,
   sessao de hunt ainda aberta) e pior que nao apagar nada. Uma funcao roda numa transacao so.
2. **A linha de `players` e RESETADA, nao apagada.** `handle_new_user` so dispara em `auth.users`
   novo — apagar a linha deixaria toda conta EXISTENTE sem linha em `players`, e `carregarEstado`
   responde 404 nesse caso: o jogo simplesmente nao abriria mais pra ninguem. O estado inicial sai
   de `default` por coluna + `hunts_iniciais()`, as MESMAS regras do `handle_new_user` — item novo no
   catalogo, ou hunt nova sem custo, passa a valer no wipe sozinho.
3. **`revoke execute ... from anon, authenticated`.** Toda funcao no schema `public` e chamavel por
   RPC (`POST /rest/v1/rpc/<nome>`) com a anon key que VAI NO BUNDLE do jogo. Sem o revoke, qualquer
   visitante apagaria o progresso de todos com um `fetch`. Conferido ao vivo: com a anon key a
   chamada volta **401 "permission denied for function"**.

**Armadilha real (falhou na primeira execucao):** `delete from <tabela>` sem WHERE estoura
`21000 / "DELETE requires a WHERE clause"`. Nao e o Postgres — e a extensao `safeupdate`, que o
Supabase carrega no papel usado pela API REST, e ela vale **dentro de uma funcao chamada por RPC**
(`security definer` troca o dono dos privilegios, nao o `session_preload_libraries`). Em `psql` como
superusuario a mesma funcao roda; so aparece pelo caminho que o script realmente usa. `where true`
resolve.

### `gravarEstado` tinha DUAS tabelas fora do diff — e uma nunca era escrita

Achado ao implementar o "novo jogo", e o motivo real de ele nao funcionar direito:

- **`player_pokedex` sem delete-diff**: o reset apagava POKEs e itens, mas a Pokedex sobrevivia
  inteira (a conta "zerada" voltava com todos os abates). Corrigido com o mesmo diff que
  `pokemon_instances`/`player_items` ja tinham. Conferido: 0 linhas depois do reset.
- **`player_auto_catch_rules` nunca era gravada.** `carregarEstado` a lia,
  `gameStateToAutoCatchRuleRows` existia **sem nenhum call site**, e o mapper de `players` nao cobre
  essas regras (as outras 3 configs de auto sao JSONB na propria linha; esta e tabela). Efeito: a
  regra "capturar Dratini com Ultra Ball" valia pro request corrente e desaparecia no proximo load —
  e sobrevivia a um reset. Agora e reescrita por inteiro (delete + insert): a lista e pequena e a
  identidade de uma regra e o par (especie, bola), entao diff por linha nao compraria nada.

### Sessao de hunt orfa: 409 travava a conta inteira

`aplicarFlush` lancava `409 'o POKE desta sessao nao esta mais na equipe'`. Como **toda** rota passa
por um flush obrigatorio, uma sessao nesse estado travava todo request do jogador. Agora ela devolve
`null` e o chamador FECHA a sessao e segue (`liquidarSessaoAberta` em `app.ts`).

**Correcao de uma hipotese minha:** eu presumi que era isso que quebrava o "Iniciar novo jogo". Nao
e — `game_sessions.poke_uid` tem `on delete cascade`, entao apagar os POKEs no reset apaga a sessao
junto. O caminho realmente alcancavel e **tirar da equipe o POKE que esta cacando**: a linha
SOBREVIVE (`location='bag'`), nao ha cascade, e a sessao fica aberta apontando pra um POKE fora da
equipe. Reproduzido via API (sessao aberta + POKE movido pra bag): com o fix a acao volta **200** e
a sessao aparece FECHADA no banco.

### Reatividade da sprite: a comparacao era pelo NOME da animacao

`animationSystem.ts#updateAnimations` trocava `entity.battleAnim` so quando
`battleAnim.name !== resolved.name`. Trocar de POKE em campo ou evoluir mantem a animacao desejada
igual (`Idle`/`Walk`), entao a comparacao dizia "nao mudou" e a `url` continuava apontando pro
spritesheet da especie ANTIGA — a sprite so trocava quando a animacao mudava de nome por outro
motivo, na pratica no primeiro golpe (`Shoot`). Era exatamente o sintoma relatado. Passou a comparar
**a URL**, que carrega especie + animacao + shiny e cobre os tres casos de troca de arte.
Verificado ao vivo: "Colocar em campo" trocou Charmander por Bellsprout no canvas e no HUD sem
nenhum golpe no meio.

### Preload de arte (`data/preload.ts`) e o placeholder que nao era placeholder

O "bug de formas geometricas coloridas" tinha DUAS causas somadas:

1. `render/sprites.ts` carregava cada spritesheet de forma lazy, no primeiro frame que precisava
   dele. `preloadHunt(mapId, jogador)` (chamado em `controller.enterMap`, depois de a sessao ser
   aceita) aquece **o mesmo `imageCache` do desenho** via `primeImage` — cache proprio nao serviria:
   o desenho baixaria a segunda copia e o bug continuaria. Carrega todas as animacoes de todas as
   especies do `enemyPool` nas duas paletas (shiny e um arquivo diferente e pode nascer no primeiro
   spawn) + o fundo. Tem teto de tempo (`PRELOAD_TIMEOUT_MS = 4000`): rede ruim atrasa a entrada,
   nunca a impede.
2. `drawEntity` desenhava o placeholder geometrico sempre que a sprite nao estava pronta —
   confundindo "especie sem arte" com "arte ainda baixando". Agora o teste e
   `hasBattleSprites(species.id)`, e nao `entity.battleAnim`: `battleAnim` nasce null em toda
   entidade e so e preenchido no primeiro tick de `updateAnimations`, e o rAF de desenho e
   independente do loop de simulacao — entao o primeiro frame desenhado pode chegar antes disso e
   piscaria a forma colorida mesmo com a arte em cache.

### Paginacao (30 por pagina) em vez de virtualizacao — e por que

`components/game/Paginacao.tsx`, usado nas 4 listas longas (Mochila: POKEs e Itens; Loja: vender
itens e vender POKEs). Virtualizar exigiria saber a altura da viewport de scroll e de cada linha, e
aqui as duas variam com o **redimensionamento da janela** (`GameWindow` tem `resize: both` do CSS),
com o `hudScale` e com o proprio conteudo (o card quebra em duas linhas com nome longo) — daria
medicao continua e um scroll aninhado dentro de um container ja rolavel, ruim no toque.

A paginacao entra **depois** de filtrar/ordenar, e "Selecionar tudo"/"Vender Tudo" continuam
olhando a colecao inteira: um "Selecionar tudo" que marcasse so os 30 visiveis seria uma armadilha.
Verificado ao vivo baixando `TAMANHO_PAGINA` pra 1 na sessao de teste (revertido em seguida): 4
POKEs viraram 4 paginas, 1 cartao por pagina, avancar/voltar corretos e o total continuando 4.

### Golpes de nivel 50: PP 7 e categoria ancorada no nivel 50

`TYPED_AOE_PP` 15 -> **7**. PP nao e recurso consumivel aqui: e a UNICA entrada do cooldown
(`TICK_SECONDS * 20/pp`), entao a recarga foi de ~1,9s pra **4s** (medido no browser).

`resolveAbilityCategory` saiu de `data/abilities.ts` pra **`data/abilityCategory.ts`** (modulo novo)
e passou a comparar os atributos que o POKE tem **exatamente no nivel 50**, nao os atuais. Antes a
categoria oscilava — Fisico no 50, Especial no 63 (crescimento desigual), Fisico de novo depois de
uma evolucao —, e isso muda a formula de dano e a cor da moldura do slot no meio do jogo.

- **O snapshot e DERIVADO, nao gravado no POKE.** `computeStatsAtLevel` e deterministica sobre
  (especie, nivel, IVs, raridade, shiny) — campos que o POKE ja carrega e o banco ja persiste.
  Gravar exigiria coluna nova, backfill de todo save existente e mais um caminho de escrita no
  level-up; derivar da os mesmos numeros sem nenhum dos tres.
- **Usa a especie ATUAL de proposito**: a chave do golpe de nivel 50 vem do tipo primario da especie
  atual (`pokes.ts` -> `typedAoeMoveKey(species.type)`), entao congelar os atributos de uma
  pre-evolucao enquanto o golpe segue a evolucao deixaria os dois discordando de quem sao os numeros.
- **Modulo separado por ciclo de import**: `pokes.ts` importa `abilities.ts` (`getAbility`), entao
  `abilities.ts` nao pode importar `pokes.ts` de volta pra chamar `computeStatsAtLevel`.

Verificado no browser: `pp: 7`, `cooldown: 4`, e `statsAtTypedAoeLevel` de um POKE Lv100 devolvendo
o bloco do Lv50 (categoria identica no Lv5 e no Lv100).

### Bug de fluxo achado testando: curar no Hospital nao reanimava

`controller.healTeam` repunha o HP mas nunca limpava `fainted`/`state`. Reproduzido: HP 14/14 e
"Desmaiado!" na mesma tela, e o POKE seguia sem lutar na hunt seguinte (Movement/Combat olham
`fainted`, nao o HP). O caminho do Revive (`useItem`) sempre limpou os dois — a cura do Hospital era
a unica que esquecia. Corrigido e conferido ao vivo (desmaiado antes -> limpo depois).

### O resto

- **XP -50%**: `XP_GLOBAL_MULTIPLIER` 0.28 -> **0.14** (-86% da taxa original da planilha).
  Conferido que a chave NAO existe em `formulas.generated.ts`, entao o fallback e o valor efetivo —
  se a planilha tivesse a linha, editar so a constante nao mudaria nada.
- **Retrato do POKE ativo** (`ActivePokeCard`): passou a usar `faceIconUrl` (o retrato PMD 40x40, ja
  quadrado e enquadrado no rosto) com `object-cover` + `h-full w-full`. `spriteUrl` (o icone
  "grande", recorte de fan sheet) tem proporcao/padding variaveis por especie e sobrava faixa vazia
  com `object-contain` — era esse o "nao preenche a moldura".
- **Itens abaixo do botao "auto" removidos** (`AutoItemBadge`). A informacao nao se perdeu: as mesmas
  contagens aparecem ao lado de cada `<select>` DENTRO do painel Auto, que e onde o jogador esta
  quando ela importa (conferido: `x10000` em cada linha).
- **Icones de habilidade**: 3.4em -> **2.6em**, e encolhem por breakpoint (2.35em em `<780`, 2.05em
  em `<640`). O `em` sozinho ja escalava com a largura; o problema real e que o numero de slots
  cresce com o nivel e uma fileira de 8 slots grandes quebra em varias linhas no celular, inflando o
  rodape que o chat e o Auto medem e ancoram em cima. Fonte do rotulo/cooldown escala junto — em
  `.85em` fixo "12.3s" transbordava o slot estreito.
- **Simbolos trocados por icones reais** (`@phosphor-icons/react`, a biblioteca do projeto): setas
  de ordenacao (Mochila e Loja), o cadeado do botao de POKE trancado, o brilho dos filtros "Somente
  Shiny", e a lista "Navegando pelos menus" da Wiki — que usava emoji aproximados (uma bola de
  baseball pra Equipe) que nao batiam com nenhum botao da tela. O menu inferior em si **ja usava**
  icones de verdade.

### Verificacao

`tsc -b` limpo (cliente), `tsc --noEmit` limpo (servidor, apos `npm run build:engine`), `oxlint` sem
erro em `src`/`server/src`, `vitest` **7/7** (o teste de determinismo passa — nada do motor de
sorteio foi tocado). Ao vivo: conta nova, inicial, hunt com combate/captura/shiny, troca de POKE em
campo, paginacao, painel Auto, Patch-notes, e o ciclo completo "Iniciar novo jogo" -> escolher novo
inicial — zero erro de console alem de um `ERR_CONNECTION_CLOSED` transitorio de rede.

## Acesso ao Supabase (o que existe, e a disciplina de uso)

Verificado em 2026-08-08. **Nao ha nada pra configurar** — os quatro caminhos abaixo ja funcionam
nesta maquina. Isto esta escrito porque uma sessao futura vai perder tempo redescobrindo (eu perdi).

| Caminho | Comando | Alcance |
|---|---|---|
| SQL arbitrario | `npx supabase db query --linked "<sql>"` (ou `-f arquivo.sql`) | DDL + DML, sem Docker — vai pela Management API |
| Migrations | `npx supabase db push` | Aplica `supabase/migrations/*.sql` no projeto linkado |
| Edge Function | `npm run build:edge && npx supabase functions deploy jogo` | Publica o servidor de autoridade |
| REST/Auth admin | `fetch` com `SUPABASE_SERVICE_ROLE_KEY` do `.env` | Ignora RLS; inclui `/auth/v1/admin/users` (criar/apagar conta) |
| Secrets/config | `npx supabase secrets list|set`, `functions list` | `ORIGENS_PERMITIDAS` e afins |

**Onde mora a credencial da Management API:** no **Windows Credential Manager**, nao num arquivo.
`~/.supabase/access-token` NAO existe e `env | grep -i supabase` volta vazio — os dois deram a
impressao falsa de "CLI nao autenticada". O teste que vale e `npx supabase projects list`.

Projeto: `cffbihbmhiuudahsgjsn` ("Poke Idle Hunt", `sa-east-1`, Postgres 17.6). `.env` da raiz tem
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; `.env.local` tem as chaves do cliente (anon +
`VITE_SERVIDOR_URL` apontando pra Edge Function).

### A regra que importa: `db query` NAO substitui migration

Ter SQL arbitrario e util e perigoso pela mesma razao. Mudanca de **schema** (tabela, coluna,
funcao, policy, index, grant) continua indo por **migration versionada + `db push`**, sempre. Aplicar
schema direto por `db query` deixa o banco divergindo do repositorio em silencio: a proxima
`db push` nao sabe que aquilo existe, um ambiente novo nasce diferente, e a auditoria de "por que
esta coluna existe" some junto com o terminal.

`db query` e pra: inspecionar, diagnosticar, medir, e correcao pontual de DADO (nao de estrutura).

### Acoes destrutivas continuam pedindo confirmacao

Este acesso apaga producao inteira sem rede de seguranca (foi o que o wipe fez). Wipe, `drop`,
`delete` em massa, revogar policy, trocar secret e deploy que muda comportamento continuam sendo
confirmados com o usuario antes — a autonomia e pra nao precisar pedir *credencial*, nao pra decidir
sozinho o que e irreversivel.

### O que NAO tenho

Token da **Cloudflare** (Pages). O deploy do cliente acontece por `git push` na `main`, que a
Cloudflare observa — entao nao e bloqueio pro fluxo normal. Consultar/alterar o projeto no painel da
CF (dominio, variavel de build, ver log de deploy) exige um token que nao existe nesta maquina.

## Leva 4.1: regiao separa as hunts, Ranking/Perfil, wipe parcial e defaults novos

Cinco blocos pedidos pelo usuario (banco/backend, performance, reatividade, visual, regras de
combate). Migrations aplicadas no projeto linkado, Edge Function republicada, suite de fumaca
**22/22** contra a funcao publicada (conta descartavel, apagada no fim).

### Separacao por regiao: o pedido era "filtrar o array" e filtrar ESVAZIAVA hunt

Pedido: "Apenas Pokemon de Johto nas hunts de Johto; o mesmo vale para Kanto". As 19 hunts vinham do
sync organizadas por **tipo elemental**, sem olhar regiao — a "Zona Nivel 11-20 (Planicie)" de Johto
tinha Pidgey/Rattata/Meowth/Snorlax (Kanto) e a "Kanto 60-70 (Penhascos)" tinha Hoothoot/Ledyba
(Johto). Medido antes de mexer, filtrar pelo rotulo `continent` atual deixaria **3 hunts vazias e
~100 especies sem nenhum lugar pra spawnar**, porque o dado real nao coopera:

- Johto nao tem **nenhuma** especie POISON nem DRAGON primaria, e tem 1 FIGHTING e 1 GHOST.
- Kanto nao tem **nenhuma** DARK nem STEEL primaria — os dois tipos so existem a partir da Gen2.

Solucao em `src/data/huntSpawnOverrides.ts` (reescrito): cada BIOMA passa a existir nas duas
regioes. A hunt original mantem id/nome/nivel e fica com a regiao do rotulo; a regiao oposta ganha
uma hunt **irma** (`${id}_${regiao}`, mesmo bioma, mesma faixa). Resultado: **35 hunts** (era 19),
nenhuma vazia, **zero especie orfa** — cada uma cai na hunt do proprio tipo primario dentro da
propria regiao. Unica combinacao descartada: Kanto+DARK, que nao existe.

Consequencia assumida: cada regiao passa a ter escada completa de nivel (Johto tambem chega a
Lv105). O portao do Campeao Lance continua valendo — ele libera o continente Kanto inteiro, ou seja
metade do elenco.

- `src/data/regions.ts` (novo): numero da Pokedex extraido de `species.description` ("Pokedex Nº4"),
  que o sync ja emite — em vez de uma segunda tabela de 226 linhas que divergiria no primeiro sync.
  **Estoura** se alguma especie nao casar (uma especie sem numero viraria "Johto" em silencio).
  `NON_WILD_SPECIES` = porygon/porygon2/eevee (cassino/presente). Lista explicita e curta: derivar de
  `spawn-tiers.json#origem === 'regra'` pegaria as 94 sem encontro selvagem real e esvaziaria metade
  das hunts.
- `HUNT_BIOME` (18 linhas, a mao) porque o tipo do bioma **nao viaja no dado gerado** — vive em
  `TYPE_BIOME_PLAN` no sync e some na emissao. Hunt gerada sem entrada aqui estoura no boot.
- `buildNightmareMirror(maps, encounters)` virou funcao com parametro: o espelho do Modo Pesadelo era
  tirado de `MAPS_DATA` cru, entao congelaria a composicao misturada antiga **e** as hunts novas
  ficariam sem espelho. `nightmareMaps.ts` agora exporta `BOSS_MAPS_DATA`/`BOSS_ENCOUNTERS_DATA`
  (BOSS e Lance nao dependem das hunts normais) e o espelho e montado em `huntSpawnOverrides` depois
  do recorte.
- `src/data/hunts.test.ts` (novo, 6 casos) guarda os invariantes: nenhuma hunt vazia, todo encontro
  aponta pra especie real, **zero especie orfa**, hunt de uma regiao so com POKE daquela regiao,
  nenhum POKE de cassino spawnando, e o 80/20 da hunt inicial. Essas falhas sao silenciosas — uma
  especie sem hunt continua no Bestiario e com sprite, so nunca aparece (foi assim que a linha do
  Dratini sumiu por uma leva inteira).

### Nivel ponderado: `levelWeights`

`HuntEncounter` ganhou `levelWeights?: {level, weight}[]`; `spawnEnemyAt` usa `weightedPick` quando
presente, senao segue no `randInt` uniforme. Unico uso hoje: hunt inicial 80% Lv1 / 20% Lv2 (pedido
explicito — uniforme daria 50/50).

### Shiny: so o multiplicador de atributo mudou

`SHINY_STAT_MULTIPLIER` 1.2 -> **1.5**. A **chance** nao foi tocada: o pedido dizia "restaure a
formula original do projeto", e a formula no codigo **ja era** a original documentada
(`(catchRate/255) * (1/8192) * 200`). Mudar pra 1/8192 puro deixaria shiny 200x mais raro num
palpite — nao fiz. O que fiz foi transformar o 200 em knob editavel pela planilha
(`SHINY_RATE_MULTIPLIER`, `evalOrDefault`, fallback 200): ajustar agora e uma linha.

**Atributos passaram a ser RECALCULADOS na carga** (`playerMapper#rowToPoke`), em vez de lidos das
colunas `stat_*`. Eles sao deterministicos a partir de (especie, nivel, IVs, raridade, shiny) — tudo
que a linha ja guarda —, entao as colunas sao cache, nao verdade. Sem isso o 1.5 so valeria pros
shinys criados depois, e o jogador teria dois shinys identicos com atributos diferentes e nada no
jogo explicando. HP e clampado no novo maximo (recalcular pra baixo deixaria a barra acima de 100% e
o auto-pot nunca dispararia).

### Fluxo de loot: ja estava certo, virou teste

Auditado: `handleEnemyDefeated` ja faz EXP -> `awardKillLoot` -> `maybeAutoCatch`, e nao ha um
segundo caminho de kill (`awardKillLoot` tem um call site so). O que faltava era **garantia**: a
ordem e o tipo de coisa que uma refatoracao inverte sem parecer errada, e o sintoma ("capturar rende
menos que matar") so aparece como diferenca estatistica de ouro/hora. `src/engine/lootFlow.test.ts`
roda a simulacao real com auto-catch ligado e exige que nenhum kill tenha ouro 0 **e** que tenha
havido captura (senao o teste passaria sem provar nada).

### Banco: uma funcao define "conta nova", e o wipe parcial usa ela

`20260808150000_novos_valores_iniciais.sql`:

- `concessao_inicial_de_itens()` — a lista de itens de conta nova num lugar so. Antes ela estava
  COPIADA em `handle_new_user` e `wipe_todos_os_saves` como
  `where kind in ('ball','potion','revive')` com 10000 fixo. Agora sao **ids literais** (poke_ball
  100, potion 100, revive 10): "toda bola/pocao do catalogo" deixou de valer, e derivar de `kind`
  daria 10 itens em vez de 3.
- Defaults de `players`: `gold` 500000 -> **1000**, `diamonds` 5 -> **0**, `auto_toggles` com
  autoCatch/autoRevive **false**, `auto_pot_rules` a **50%**. O wipe reseta por `= default`, entao
  mudar aqui basta.
- `wipe_inventario_e_economia()` — wipe **parcial** (so estoque e carteira; POKE, Pokedex, nivel e
  hunts intactos), executado uma vez pela propria migration. Mesmo
  `revoke ... from anon, authenticated` do wipe total: toda funcao em `public` e chamavel por RPC com
  a anon key que vai no bundle. `where true` em todo DELETE/UPDATE por causa do `pg_safeupdate` (ver
  leva anterior).
- Aplicado em producao: **57 jogadores**, todos com 1000 de ouro, 0 diamantes e exatamente 3 linhas
  de item nas quantidades certas (conferido no banco).

`20260808160000_ranking_e_perfil.sql`: tabela `hall_da_fama` (user_id, conquista, conquistado_em) +
indices de ranking. **Sem coluna `play_seconds`**: o tempo de jogo ja e acumulado em
`game_sessions.simulated_seconds` e as sessoes fechadas ficam na tabela, entao o total do jogador e a
soma das linhas dele — uma coluna nova custaria uma escrita a mais em TODO flush (30 em 30s por
jogador ativo) pra um dado lido so quando alguem abre o Perfil. Os seis criterios de atributo do
ranking de POKE **nao ganharam indice** de proposito: seriam seis indices mantidos a cada escrita de
POKE numa tabela de milhares de linhas — revisar se a base mudar de escala.

### Ranking e Perfil sao rotas do servidor, nao consulta do cliente

`server/src/ranking.ts` + 4 rotas (`/perfil`, `/ranking/treinadores`, `/ranking/pokemon`,
`/ranking/hall`). O cliente **nao** pode consultar isso direto: a RLS (corretamente) nao deixa ler a
linha de outro jogador, e afrouxar pra montar ranking exporia ouro, itens e equipe de todo mundo — o
ranking precisa de dois campos, nao da linha inteira. `hall_da_fama` fica com RLS ligada e **nenhuma
policy** pra `authenticated`: so a `service_role` enxerga.

- O criterio do ranking de POKE vira **nome de coluna numa URL do PostgREST**, entao passa por lista
  branca (`COLUNA_POR_CRITERIO`) — interpolar o que o cliente mandou seria injecao de query.
  Verificado: `criterio=stat_hp;drop` responde 400.
- `rank` e **contado**, nao ordenado: "quantos tem mais EXP que eu, +1". Ordenar a base pra achar uma
  posicao daria o mesmo numero por muito mais.
- Hall da Fama e gravado em `aplicarFlush`, comparando `unlockedContinents` antes/depois — a unica
  coisa que libera `kanto` e limpar a sequencia do Lance. Registrado no servidor e nao no motor: o
  motor roda igual no cliente, e o cliente nao pode escrever conquista. `on_conflict` faz a segunda
  vez ser no-op, entao a data guardada e sempre a da primeira.

### Rede: timeout, retry e retry SO onde repetir e seguro

Nao havia timeout em lugar nenhum — uma conexao travada deixava a promessa pendurada pra sempre
(jogo "parado", zero erro). Agora `AbortSignal.timeout` (15s; 45s no flush, que simula ate 6h numa
invocacao) nos dois lados.

Retry e **opt-in por chamada** (`retentavel`), e a linha divisoria e "repetir estraga alguma coisa?":

- `/estado` e os rankings: leitura pura.
- `/sessao/flush` e `/sessao/fechar`: idempotentes por desenho — o intervalo sai de `last_flush_at`
  no banco e o ouro e gravado como valor **absoluto** (medido em leva anterior: 20 flushes
  simultaneos = 1,03x).
- `/acao` **nao**: "comprar 5 pocoes" duas vezes compra dez.
- `/sessao/abrir` **nao**: geraria uma segunda sessao e descartaria o intervalo da primeira.

**502 fica fora dos status retentaveis** de proposito: o nosso servidor responde 502 quando o
Postgres falha, e isso pode ter acontecido no meio de uma escrita. Retenta so 408/425/429/503/504 e
falha de rede pura.

No servidor, `db.ts#buscarComRetry` retenta PostgREST (todas as chamadas de la sao idempotentes:
leitura, upsert de chave fixa, delete por filtro, PATCH com valor absoluto) — o pooler do Supabase
derruba conexao de vez em quando e uma unica falha dessas virava 502 na cara do jogador.

Toast de erro ganhou **janela anti-repeticao de 20s por mensagem**: um flush de 30s com rede ruim
empilhava o mesmo aviso indefinidamente.

### `public/_redirects` NAO existia

O CLAUDE.md afirmava que ele tinha sido criado; `find` provou que nao. Sem ele, recarregar em
`/jogo`, `/login` ou `/registro` no site publicado devolve **404** — e o sintoma engana, parece "o
servidor caiu". Criado, com `/assets/*` explicito ANTES do catch-all: uma sprite caindo no
`/*  /index.html  200` voltaria como HTML com status 200, que nao da erro visivel, so nao aparece.

### Escala de sprite desligada

`scaleForSpecies` devolve **1** pra todo mundo (pedido explicito: tamanho original do arquivo,
comuns e lendarios). A funcao continua existindo em vez de sumir com as 3 chamadas em
`render/sprites.ts`: ela e o **unico** ponto de escala do campo de batalha, entao enquanto devolver 1
nao ha como escala nova reaparecer espalhada. `HEIGHT_M` (altura real da Pokedex) ficou exportado —
dado levantado a mao, nao vale jogar fora.

### O resto

- **Sprite de face no relatorio de farm offline**: usava `spriteUrl` (icone "grande", recorte de fan
  sheet com padding variavel por especie) num box de 1.6em — virava mancha com faixa vazia, e em
  varias especies o POKE nem aparecia. Trocado por `faceIconUrl` + `object-cover`, a mesma correcao
  ja feita no `ActivePokeCard`. Conferido que as 226 especies tem os 3 arquivos de arte no disco: o
  problema era o recorte, nao arquivo faltando.
- **Avisos confinados ao campo de batalha** (`components/modals/CampoOverlay.tsx`, novo): revive,
  BOSS e contagem do Lance eram `fixed inset-0` e cobriam a barra de golpes e o menu. O limite de
  baixo e **medido** (`uiStore.footerHeight`), nao um `em` chutado — a altura do rodape muda com a
  largura E com o `hudScale`.
- **Level-up mostra ganho de atributo**: `grantExp` passou a devolver `statGains` (delta do bloco
  inteiro de level-ups da chamada, que pode ser mais de um nivel). Calculado la porque so la existem
  os dois lados da comparacao. `data/statLabels.ts` (novo) centraliza rotulo/ordem/formatacao.
  `formatStatGains` devolve string vazia quando nada subiu (em curva lenta um level-up pode nao mover
  atributo nenhum, e "ganhou: " sem nada depois pareceria bug).
- **Perfil do Treinador** (`features/perfil/`): "batalhas vencidas" sai da **Pokedex** (cumulativa e
  persistida), e nao de `perfStats`, que zera a cada entrada em hunt por ser a amostra do piso do
  farm offline. "Log de capturas" precisou de `capturedAt` no POKE (o `created_at` da linha) — sem
  ele nao ha nenhuma ordem temporal no save. "Outfit" e "Especialidades" ficam com layout pronto e
  aviso honesto: nao existe skin nem bonus permanente no modelo de dados, e barra que nunca anda le
  como bug.
- **Tutoriais** (`data/tutoriais.ts`, `stores/tutorialStore.ts`): "ja viu" mora no **localStorage**,
  nao no `gameStateStore` — aquele estado e propriedade do servidor (resposta sobrescreve o local),
  entao a marca seria apagada no primeiro flush. Fechar por qualquer caminho conta como visto (marcar
  so no fim faria reaparecer em todo boot pra quem fechasse no meio).
- **Icone do menu Equipe**: `assets/ui-icons/equipe.png` (item_0004 do pack SV). `MenuEntry.iconUrl`
  substitui o icone vetorial, e o `Icon` de phosphor continua obrigatorio como fallback de `onError`
  — botao sem icone nenhum nao diz o que faz.
- **Calculadora**: equipe atual num `<optgroup>` no topo. Grupo com rotulo em vez de so reordenar,
  senao a lista comeca fora de ordem alfabetica sem explicacao.

## Leva 4.2: treinador original, piso de venda, ranking clicavel, orientacao no ataque

Cinco blocos pedidos pelo usuario (banco/economia, UI/ferramentas, animacao de combate). Migration
aplicada no projeto linkado, Edge Function republicada, verificado ao vivo contra a funcao publicada
(conta descartavel, efeito conferido no Postgres com `service_role`, conta apagada no fim) e no
navegador contra ela.

### Treinador original: coluna nova, e por que nao derivar do dono

`pokemon_instances.original_trainer` (migration `20260808180000_treinador_original.sql`), gravada em
`captureSystem.ts#attemptCapture` — o unico ponto onde um POKE muda de dono — e tambem em
`escolherStarter` (servidor e fallback local): o inicial nao passa pelo captureSystem, e seria o
unico POKE do jogador com o campo vazio, lendo como dado faltando.

Nao e derivavel de `players.trainer_name` pelo `user_id`: o nome do dono responde "de quem e agora"
e pode ser trocado depois. O registro de captura precisa ser imutavel, e continuaria correto se
algum dia existir troca entre jogadores. **Hoje os dois valores coincidem sempre** (nao ha troca) —
o campo so paga por si no ranking, onde aparece o POKE de outra pessoa, e no dia em que trade
existir. Registrado aqui pra ninguem "otimizar" a coluna fora depois.

Backfill na propria migration, com o nome do dono atual: sem troca, dono E capturador. 58 linhas,
todas preenchidas.

`pokeToRow` grava `poke.originalTrainer ?? null`, e nao `?? undefined`: com `undefined` a chave some
do JSON do upsert e o PostgREST mantem o valor antigo da linha. Coincide hoje (o valor nunca e
apagado), mas campo que "some" do payload e a forma classica de perder dado sem erro nenhum
aparecer — o mesmo mecanismo do bug de `player_items` sem delete-diff da leva anterior.

### Piso de venda: o piso NAO pode morar em `pokemonSellValue` sozinho

Pedido: "valor base minimo para a venda de qualquer Pokemon agora e de 1000G". O jeito obvio —
`Math.max(1000, ...)` dentro de `pokemonSellValue` — tambem inflaria o **ouro por abate**, porque
ele deriva do mesmo numero (`MONEY_FOR_KILL = sellValue / killDivisor`, divisor 15, depois
multiplicado por `KILL_GOLD_MULTIPLIER`). Medido: o ouro por kill na hunt inicial pularia de ~5 pra
~330, uma inflacao de farm de ~60x que ninguem pediu.

`economySystem.ts` foi partido em dois: `pokemonBaseValue()` (formula crua da planilha, usada por
`awardKillLoot`) e `pokemonSellValue()` (o mesmo, com o piso, usado pelos 4 call sites de venda e
pelo balanco do Farm Offline). Piso e `MIN_POKEMON_SELL_VALUE`, editavel pela planilha
(`evalOrDefault`, fallback 1000) como todo knob de economia.

`economySystem.test.ts` (novo) prende a separacao: a venda do POKE mais fraco possivel da
exatamente 1000, e `awardKillLoot` do mesmo POKE fica abaixo de 100. Sem o teste, a proxima
refatoracao que "simplificar" as duas funcoes numa so passa despercebida — o sintoma e uma
diferenca estatistica de ouro/hora, nao um erro.

**Consequencia de balanceamento que o usuario precisa decidir se quer:** com o piso, capturar e
vender passou a render muito mais que matar. Medido em 40 minutos de cacada na hunt inicial (mesma
sessao): 84 abates = 980 de ouro; 21 capturas do mesmo periodo = 21.000+ vendendo. ~21x. Nao e bug —
e o efeito direto do numero pedido, com o ouro por kill deliberadamente intocado.

### Ranking clicavel: o servidor devolve o POKE inteiro, nao um resumo

`rankingDePokemon` selecionava 11 colunas e devolvia `speciesId/level/isShiny/rarity/valor`. Pra
abrir o cartao de perfil (que mostra IV, EXP e HP reais) faltava quase tudo — e sintetizar a partir
de (especie, nivel) daria numeros plausiveis e ERRADOS numa tela cuja unica funcao e comparar POKEs
de jogadores diferentes.

Agora seleciona `*` e mapeia com `rowToPoke` — o MESMO mapper que carrega o save do dono, exportado
de `playerMapper` e reexportado por `headless.ts`. Sem uma segunda traducao linha->POKE vivendo no
servidor. `pokemon_instances` nao guarda nada privado alem do `user_id`, que ja era devolvido.

A linha do ranking virou `<button>` (foco de teclado de graca) e abre o `pokeProfileStore` — a mesma
janela de Equipe/Mochila/Loja/Pokedex. Especie desconhecida (renomeada num sync posterior) continua
listada mas nao abre: o cartao inteiro e montado a partir de `species`.

`EntradaPoke` carrega `treinador` (dono agora) e `treinadorOriginal` (quem capturou) separados — a
lista mostra o original, que e o que a coluna nova existe pra responder.

### Orientacao no ataque

`facing` so era escrito por quem MOVIA a entidade (`stepDirect`/`slideToward`). Combate acontece
parado, e a pose de ataque ainda TRAVA o movimento pela duracao dela — entao o POKE atacava virado
pra onde estava andando quando parou, de costas pro alvo sempre que o inimigo chegava por tras.

`faceToward()` novo em `animationSystem.ts`, chamado de dentro de `triggerAttackAnim(entity, isAoe,
target)` — e nao numa chamada separada no `combatSystem` — pra nao existir caminho novo de ataque
que dispare a pose sem virar o POKE. Foi exatamente esse esquecimento que produziu o bug.

Nao ha `scaleX(-1)`: as sprites PMD tem 8 linhas de direcao e `directionRowFromFacing` ja escolhia a
linha pelo `facing`. O que faltava era alguem escrever nele na hora do golpe. Distancia zero mantem
o facing anterior (normalizar vetor nulo daria NaN e o `atan2` escolheria direcao a esmo).

`animationSystem.test.ts` (novo) cobre as 4 cardeais + o caso degenerado.

### Alerta de consumivel acabando

`components/auto/estoqueBaixo.ts` (novo): `itensEmUso()` lista so o que uma automacao **ligada**
consumiria. Alertar sobre bolas com auto-catch desligado treinaria o jogador a ignorar o alerta.
`BEST_POTION_OPTION` nao e item — o estoque relevante nele e a SOMA das pocoes, senao "escolher
melhor" ficaria sem alerta justamente quando o jogador esta ficando sem nenhuma.

Alerta em dois lugares: o badge de contagem dentro do painel, e o **botao "auto"** — o painel fica
fechado quase o tempo todo, e um aviso que so aparece depois de abrir chega tarde demais. O botao
ganha borda/texto vermelhos + icone de aviso.

`@keyframes pulso-alerta` em `index.css` anima opacidade e `box-shadow`, nunca `transform`: o badge
e o botao ficam em fluxo ao lado de outros controles e escalar faria os vizinhos dancarem.
Desligado sob `prefers-reduced-motion` — piscar continuo e exatamente o que essa preferencia existe
pra desligar; a cor de alerta fica, que e ela quem carrega a informacao.

De brinde, o painel passou a mostrar a contagem de Revive, o unico consumivel do bot que nao tinha
`<select>` e por isso nao tinha contagem visivel nenhuma.

### Calculadora: valores manuais por atributo

`Lado.manual` (`Partial<Record<keyof StatBlock, number>>`) guardado SEPARADO do calculo, e nao
substituindo `stats`: trocar nivel/raridade tem que voltar a recalcular os atributos que o jogador
nao tocou. Chave ausente = "use o calculado", e apagar o campo REMOVE a chave em vez de gravar 0 —
0 e um valor manual legitimo. Atributo editado ganha borda de destaque + o valor calculado embaixo,
e um botao unico devolve tudo ao calculo.

### Verificacao

`tsc -b` limpo (cliente), `tsc --noEmit` limpo (servidor), `oxlint` sem erro novo, `vitest` **19/19**
(5 arquivos; determinismo continua passando — `faceToward` nao consome sorteio). Suite de fumaca
contra a Edge publicada: 15/15 (starter grava `original_trainer` no banco, ranking devolve POKE
completo + `treinadorOriginal`, criterio invalido segue 400) e uma segunda passada com janela de 40
minutos forcada (recuando `last_flush_at`): 21 capturas, **todas** com `original_trainer` correto,
venda de Ledyba Lv1 comum rendendo exatamente 1000, e ouro medio por kill em 11,7 — o piso nao
vazou. No navegador contra a mesma funcao: alerta do bot acendendo so com auto-catch ligado e Great
Ball em 0, calculadora aceitando valor manual, ranking abrindo o cartao completo de um Furret Lv35
mythic de outro jogador. Zero erro de console.

## Leva 5.0: Mercado entre jogadores, Chat Mundo, Correio, Hunt Analyzer e zonas honestas

Cinco blocos pedidos (sistemas novos, social/chat, janela Auto, QoL de UI, balanceamento de mundo)
+ wipe do servidor. Migrations aplicadas no projeto linkado, Edge Function republicada, suite de
fumaca **37/37** contra a funcao publicada (duas contas descartaveis — negociar e ser amigo exigem
duas pontas) e verificacao no navegador contra ela.

**As duas imagens de referencia citadas no pedido (`image_5a9ada.png`, `image_5b265f.png`) nunca
chegaram** — nao estao no repo nem em Downloads. Hunt Analyzer e a previsao de recursos foram
desenhados pelo texto do pedido e pela linguagem visual ja existente da HUD.

### Mercado: dois modelos, porque itens e POKE nao sao a mesma coisa

`server/src/mercado.ts` + `src/features/mercado/MercadoMenu.tsx`.

- **Item = livro de ofertas** (pedido: "semelhante ao Mercado Comunitario da Steam"). Item e
  fungivel, entao existe "melhor preco" e faz sentido cruzar filas. Preco de execucao e o da ordem
  QUE JA ESTAVA NO LIVRO, nunca o da que chegou — quem compra com limite alto paga o preco da
  melhor venda e recebe o troco na hora.
- **POKE = anuncio de preco fixo** em Ouro ou Diamante. IV, raridade e shiny fazem cada linha ser
  unica; nao existe "melhor preco" entre coisas diferentes, e um livro de POKE cruzaria oferta de
  Charmander com procura por Mewtwo.

Tres invariantes sustentam o resto:

1. **ESCROW.** Criar ordem de venda tira o item do inventario AGORA; ordem de compra tira o ouro
   AGORA. Sem isso, duas ordens de venda do mesmo estoque vendem o dobro do que existe.
2. **Nenhum valor vem do cliente alem de preco e quantidade** — mesma regra de `acoes.ts`.
3. **Toda escrita concorrente e compare-and-swap.** Nao ha transacao entre duas chamadas ao
   PostgREST (serverless), entao cada baixa numa ordem alheia manda o valor antigo no filtro
   (`&remaining=eq.7`); resposta vazia = perdi a corrida, sigo pra proxima. `atualizarRetornando`
   (`db.ts`) existe pra isso: com `return=minimal` perder a corrida seria indistinguivel de sucesso.

#### `market_deliveries`: por que o vendedor nao e pago por UPDATE direto

O servidor grava progresso reescrevendo o **snapshot inteiro** do jogador (`gravarEstado`). Se A
compra de B e o credito de B for `update players set gold = gold + 500`, o proximo flush de B — que
pode estar cacando nesse segundo — grava por cima o ouro que ELE tinha em memoria. B simplesmente
nao recebe, sem erro em lugar nenhum. E a mesma classe de bug que ja mordeu `player_items` (sem
delete-diff) e `player_auto_catch_rules` (nunca gravada).

Entao o credito vira LINHA. Ela e reivindicada com claim atomico (`update ... where claimed_at is
null returning`) dentro do proximo request do proprio B, e aplicada ao estado que aquele request ja
vai gravar. `carregarEstadoParaEscrita` e a unica porta pra isso, e **so pode ser usada por quem vai
gravar em seguida** — `/sessao/abrir`, que so valida intencao, continua no `carregarEstado` cru.
`/estado` virou um GET que grava, de proposito: e o unico caminho de quem so abriu o jogo.

#### POKE anunciado sai do inventario via `location='market'`

Valor novo do enum `pokemon_location`. `snapshotToGameState` filtra 'team'/'bag', entao o POKE some
do vendedor sozinho — inclusive da Loja, onde poderia ser vendido pro sistema enquanto anunciado.
Com uma coluna booleana, cada leitura teria que lembrar de filtrar, e a que esquecesse virava venda
dupla.

Duas armadilhas reais nisso:

- **`gravarEstado` teria APAGADO o POKE anunciado.** O delete-diff de `pokemon_instances` compara
  contra tudo que esta no banco; a linha em 'market' nao esta no snapshot do jogador e seria
  removida no primeiro flush apos anunciar. Corrigido filtrando o diff por
  `location=in.(team,bag)`.
- **`ALTER TYPE ... ADD VALUE` precisa de migration propria.** Postgres proibe USAR o valor novo na
  mesma transacao em que ele foi adicionado. Por isso o enum vai num arquivo e as tabelas noutro.

#### Bug real achado pelo smoke: a check `team_slot_required` proibia o valor novo

Ela foi escrita quando o enum tinha dois valores e enumerou os dois:
`(location='team' AND team_slot IS NOT NULL) OR (location='bag' AND team_slot IS NULL)`. Ou seja,
nao dizia "team precisa de slot" — dizia "location so pode ser team ou bag". Anunciar POKE
respondia **502 "falha ao falar com o banco"**. Reescrita como
`case when location='team' then team_slot is not null else team_slot is null end`: expressa a regra
real e um valor novo do enum passa a valer sozinho.

#### Ordem deliberada em `comprarAnuncio`: cobrar e gravar ANTES de mover o POKE

O estado do comprador e gravado como snapshot com diff de remocao. Se o POKE fosse transferido
primeiro, o `gravarEstado` (montado de um estado carregado ANTES da transferencia) nao teria a linha
nova e a apagaria — o comprador pagaria e o POKE sumiria do jogo. O risco invertido (falhar depois
de cobrar) existe, mas erra a favor do jogador e fica visivel.

### Chat Mundo: polling pelo servidor, nao Realtime

`chat_messages` + `chatStore.ts`. Realtime exigiria policy de SELECT pra `authenticated` na tabela
(ou seja, cliente lendo tabela direto), que e justamente o que a Fase D fechou. Com dezenas de
jogadores, uma leitura a cada 6s e barata e nao abre porta nenhuma.

- A aba "Mundo" passou a ser **so** mensagem de jogador (pedido explicito). Os avisos do jogo que
  caiam la foram pra aba nova **"Sistema"** — `CHANNEL_TO_TAB.world` virou `'sistema'`, e
  `ChatTab` deixou de ser redeclarado no `uiStore` (as duas copias ja divergiram uma vez).
- **Anexo guarda SNAPSHOT, nao id** (`saneiaAnexos`, `social.ts`). Duas coisas de uma vez: o link
  continua mostrando o que foi mostrado na hora (o POKE pode ser vendido ou evoluir depois), e
  ninguem ganha um jeito de consultar POKE alheio por id — o servidor nunca resolve o id, so
  repassa o que o autor exibiu.
- Shift+clique (`components/shared/linkarNoChat.ts`) injeta `[Nome Lv12]` no rascunho e guarda o
  anexo. No envio, **so vao os anexos cujo rotulo ainda esta no texto**: apagar o "[Charmander
  Lv12]" e mandar outra frase nao envia o POKE colado numa mensagem que nao fala dele.
- O rascunho vive na store (nao num `useState` do chat) porque quem escreve nele e a Mochila, de
  outro ponto da arvore e com o chat possivelmente fechado.

### Correio e amizades

`mail_messages` + `friendships`. O pedido de amizade e uma MENSAGEM com dois botoes, nao uma tabela
de pedidos: um lugar so pra olhar quando alguem interage com voce. Indice unico parcial
(`para_id, de_id` where pendente) impede spam; amizade e gravada nos dois sentidos (uma consulta de
"meus amigos" sem `or`).

### Nome do treinador: escolhido no cadastro e UNICO

"Adicionar amigo pelo nick" so funciona se o nick identificar uma pessoa — e ele nascia
`'Treinador'` pra todo mundo. A migration de-duplica os 57 existentes (sufixo com os 4 primeiros
caracteres do `user_id`) ANTES de criar o indice unico sobre `lower(trainer_name)`; sem isso ela
falharia.

O nome viaja em `options.data` do `signUp` (= `raw_user_meta_data`) e e gravado pelo trigger
`handle_new_user` na MESMA transacao da conta. A alternativa — UPDATE do cliente logo apos o
cadastro — e proibida pela RLS desde a Fase D e deixaria uma janela com o nome errado. Colisao no
trigger desambigua com sufixo em vez de derrubar o cadastro: perder a conta por causa de um nick e
desproporcional. A tela checa antes por RPC (`nome_de_treinador_disponivel`, chamavel por `anon`
porque devolve boolean e nada mais).

**O wipe NAO reseta mais `trainer_name`** (migration `20260808203000`). Dois motivos: com o indice
unico, 57 linhas voltando pro mesmo nome abortam o wipe inteiro; e o nick deixou de ser cosmetico —
ele e a identidade publica e a chave que `original_trainer` e as amizades referenciam.

### Hunt Analyzer

`features/hunt/HuntAnalyzer.tsx`, aberto pelo card/chip de taxas. **Tudo derivado de `perfStats` e
do catalogo** — nenhuma metrica nova, nenhum contador novo no save. Um grafico de "ouro por minuto
nos ultimos 10 minutos" exigiria serie temporal que ninguem grava: seria uma linha bonita feita de
nada.

Duas correcoes que sairam dele:

- `perfStats.since` sai **0** numa conta nova (default da coluna) e so vira timestamp na primeira
  entrada em hunt. O painel anunciava "amostra desta sessao: mais de um mes" pra quem acabou de
  criar a conta — a conta estava certa (epoch ate agora), a premissa e que estava errada.
- Analyzer e tela de menu usavam o mesmo z-index e o mesmo backdrop. Com o Analyzer aberto, clicar
  em "Mercado" abria o Mercado POR BAIXO dele. `openScreen`/`setAnalyzerOpen` viraram mutuamente
  exclusivos.

### Janela Auto: tres blocos, seletor com icone, previsao de fim de recursos

- **Reorganizacao**: auto-catch, auto-pot e auto-revive viraram `<section>` propria com o toggle no
  cabecalho. Antes toggles e regras estavam intercalados em fluxo unico — quem procurava a config de
  captura passava por uma regra de pocao no caminho. O corpo continua visivel com a automacao
  desligada (so esmaecido): a configuracao e o motivo de abrir o painel.
- **`ItemPicker`** (`components/auto/ItemPicker.tsx`): dropdown proprio porque `<option>` **nao
  aceita imagem** em navegador nenhum. Mostra icone + nome + estoque, e pinta de vermelho o que
  esta abaixo do limiar E em uso.
- **Previsao de consumo** (`components/auto/consumo.ts`): o jogo nao grava consumo de item em lugar
  nenhum, entao a taxa e MEDIDA comparando o estoque de agora com o do inicio da amostra. Estimar
  por formula ("1 bola por abate x abates/hora") erraria justamente onde importa: o bot so joga bola
  em quem sobrevive ao ultimo golpe, so usa pocao quando o HP cruza o limite, e regras por especie
  gastam bolas diferentes em ritmos diferentes. Amostra reinicia junto com `perfStats.since`
  (entrada em hunt) e estoque que SOBE re-ancora o marco (compra/drop/entrega nao viram taxa
  negativa). So aparece abaixo de 2h, como pedido.
- **Bug real corrigido durante a verificacao ao vivo**: `useGameStateStore(itensEmUso)` — o selector
  devolvia array NOVO a cada chamada, nunca comparava igual, e o painel entrava em loop infinito
  ("Maximum update depth exceeded"). Selecionar os quatro pedacos de estado e derivar num `useMemo`.

### Tooltips

- **Item** (`data/itemInfo.ts` + `components/shared/ItemTooltip.tsx`): texto DERIVADO dos numeros
  reais (`healAmount`, `captureRate`, `reviveHpPercent`, precos), nao de uma segunda lista escrita a
  mao. A planilha so tem descricao por CATEGORIA ("Restaura HP." nas quatro pocoes), que nao responde
  a unica pergunta do jogador: "esta e melhor que a que eu tenho?". `Infinity` (o valor real da Max
  Potion) vira "restaura TODO o HP" em vez de vazar detalhe interno.
- **Golpe** (`data/moveDescriptions.ts` + `components/shared/AbilityTooltip.tsx`): 223 descricoes,
  uma por golpe do dataset, conferidas por script contra `ABILITIES_DATA` (223/223, zero faltando,
  zero sobrando). Escritas em portugues a partir dos efeitos reais do Gen1/Gen2 — nao sao copia de
  pagina nenhuma.

  **O ponto delicado**: este jogo simula dano, tipo, STAB, efetividade e cooldown; nao simula status,
  alteracao de atributo, prioridade, multi-hit nem recoil (registrado como fora de escopo desde o
  inicio). Descrever "reduz o Ataque do alvo" sem avisar seria mentir sobre a mecanica. Por isso
  `AVISO_SEM_DANO` aparece automaticamente em todo golpe de poder 0 — que e exatamente o conjunto
  dos golpes cujo efeito inteiro nao existe aqui.

### Zonas: o nome mentia sobre o nivel

**Bug real, e a coisa mais grave desta leva.** Medido no dado gerado, antes:

| nome | spawnava |
|---|---|
| "Zona Nivel 1-10 (Floresta)" | Lv 2-12 |
| "Zona Nivel 11-20 (Planicie)" | Lv 10-18 |
| **"Zona Nivel 31-40 (Vulcanico)"** | **Lv 15-51** |
| "Kanto Zona Nivel 68-85 (Cemiterio)" | Lv 68-85 |

O nome vinha do bracket nominal do sync (agrupamento por nivel medio) e o `levelRange` vinha do
min/max real das especies agrupadas — dois numeros de origens diferentes que ninguem cruzava.

Corrigido fixando a faixa PRIMEIRO e derivando tudo dela: `ZONA_POR_HUNT` (tabela explicita, ao lado
de `HUNT_BIOME`) declara o numero de cada hunt, a faixa e `[n*10+1, n*10+10]`, e nome, cartao e
spawn saem da mesma fonte. Numeracao pedida: Lv1-10 = Zona 0, 11-20 = Zona 1, etc. Nome final:
`Johto Zona 3 · Vulcanico`.

**Consequencia assumida**: nove zonas contiguas de dez niveis cobrem Lv1-90, entao o teto das hunts
normais caiu de Lv105 pra Lv90. Conteudo acima disso continua no Modo Pesadelo (+100, piso 150) e
nas hunts BOSS (Lv300).

**Bug irmao, achado pelo teste novo**: o espelho do Modo Pesadelo deslocava `minLevel`/`maxLevel` mas
nao os `levelWeights` — que sao o sorteio de nivel de FATO quando existem. O Pesadelo da hunt
inicial anunciava Lv150 e spawnava nivel 1 e 2: a hunt mais dificil do inicio era a mais facil dele.

`hunts.test.ts` ganhou quatro invariantes novos (23 testes no total): faixa estrita por encontro E
por `levelWeights`, zonas de 10 niveis com o numero do nome batendo com a faixa, todo peso de spawn
positivo com soma > 0, e a soma das chances de cada hunt fechando 100%.

### EXP de evolucao +30%

Evolucao aqui e 100% por NIVEL (`species.evolvesAtLevel`) — nao existe barra de "EXP de evolucao"
separada pra encarecer. Encarecer o requisito de nivel do POKE E encarecer a evolucao, e e o unico
lugar onde o pedido cabe sem inventar mecanica.

`pokeExpForLevel` (`data/pokes.ts`) = `totalExpForLevel * POKE_EXP_REQUIREMENT_MULTIPLIER` (knob de
planilha, fallback 1.3). Funcao SEPARADA e nao multiplicador dentro de `totalExpForLevel` porque o
TREINADOR usa a mesma maquina de curva: encarecer la dentro deixaria o nivel de treinador 30% mais
lento junto, o que ninguem pediu.

### QoL

- **Fonte +3px**: `html { font-size: 19px }` (cobre login/cadastro/home e os primitivos shadcn, que
  sao em `rem`) e os tres numeros do clamp de `.hud-root` subiram 3px cada. **Consequencia real**: o
  encaixe de 360px foi calibrado no piso antigo (13px), entao o teto do multiplicador manual em
  `<=640px` caiu de 1.15 pra 1 e `HUD_SCALE_MIN` desceu de 0.8 pra 0.7 — quem jogava confortavel no
  tamanho antigo tem como voltar.
- **Carteira ancorada no card do treinador**: ela morava no bloco central, que MUDA DE ANCORA em
  <1140px (desce pra baixo dos cards laterais) — o dado mais consultado do jogo trocava de lugar
  conforme a largura da janela.
- **Item travado vai pro fim** (Mochila e Loja), com desempate por nome: sem ele, destrancar mandaria
  o item pra uma posicao aleatoria em vez de devolve-lo ao lugar.
- **Bestiario na ordem da Pokedex**, via `pokedexNumber` (ja existente) em vez de uma segunda tabela.
- **Auras cumulativas**: `globalCompositeOperation = 'lighter'` quando ha mais de um atributo maximo
  — verde + vermelho vira amarelo onde os halos se encontram e cada cor continua reconhecivel na
  borda onde so ela alcanca. Com uma aura so o modo normal e mantido (aditivo sobre fundo claro
  lavaria a cor).
- **Loja**: atalhos x10/x100/x1000 + "Max", total antes de confirmar em linha propria (dentro do
  botao o rotulo quebrava com 6+ digitos), "Vender tudo" POR ITEM (distinto do "Vender Tudo" geral) e
  `overflow-x-auto` nas duas colunas.
- **Alerta de estoque no chat** (`observarEstoqueBaixo`): dispara na BORDA (cruzou o limiar), nunca
  continuamente — o estado e checado a cada mudanca do save, que num combate ativo acontece varias
  vezes por segundo. Libera de novo quando o estoque sobe.

### O que NAO foi feito, e por que

**"Icones de imagem reais nos menus inferiores".** O menu ja usa icones de verdade (Phosphor), nao
texto nem placeholder. O unico pack de arte disponivel e o de ITENS do Scarlet/Violet (523 PNGs
numerados, sem legenda) — nao existe nele um icone de "mapa", "loja" ou "mercado", porque nao existe
item que seja isso. Trocar por arte de item errada seria pior que o icone vetorial correto. O
mecanismo (`MenuEntry.iconUrl`) segue de pe: e uma linha por menu quando houver arte adequada.

### Wipe

`wipe_mundo_social()` (novo) roda ANTES de `wipe_todos_os_saves()`: `market_listings.poke_uid`
referencia `pokemon_instances` com `on delete restrict`, entao apagar POKE antes violaria FK.
Executado: **57 jogadores resetados, 66 POKEs apagados, 3 negocios de mercado apagados**; conferido
depois — 0 POKEs, 171 linhas de item (57x3), 57 nicks unicos preservados, e 56 dos 57 com
exatamente 1000 de ouro (o 57o e um jogador que entrou depois do wipe e comprou uma Potion).

### Verificacao

`tsc -b` limpo (cliente), `tsc --noEmit` limpo (servidor), `oxlint` sem erro, `vitest` **23/23**,
`npm run build` completo com a copia de arte. Fumaca contra a Edge publicada: **37/37** (cadastro
com nick, RPC de disponibilidade, escrow, casamento com troco, entrega ao vendedor offline,
cancelamento, anuncio/compra de POKE com `original_trainer` preservado, anti-recompra, chat com
anexo, anti-flood, amizade nos dois sentidos, anti-duplicata). No navegador contra ela: cadastro com
nick, Hunt Analyzer, Mercado (ordem criada e listada em "Anuncios Ativos"), painel Auto reorganizado
com estoque nos seletores, Shift+clique linkando no chat e a mensagem renderizando o link, Loja com
os atalhos e o total, lista de hunts com os nomes novos, e uma hunt com combate rodando — zero erro
de console.

## Leva 5.1: o reset que nunca rodou, a barra de EXP que mentia, economia e fogo com arte

Quatro blocos pedidos (fluxo inicial, bugs de progresso, economia/balanceamento, assets visuais).
Migration aplicada no projeto linkado, Edge Function republicada, smoke **30/30** contra a funcao
publicada e verificacao no navegador contra ela.

### O bug do "Novo Jogo": ele estourava 502 e nao apagava nada

Reproduzido contra o servidor local (que loga o corpo do PostgREST, ao contrario da Edge, que
esconde):

```
PostgREST 409 em players?user_id=eq.<uid>:
{"code":"23505","details":"Key (lower(trainer_name))=(treinador) already exists."}
```

`acoes.ts#reiniciarJogo` zera o estado com `defaultGameStateData()`, cujo `trainer.name` e
`'Treinador'`. Desde que o nick virou UNICO (indice `players_trainer_name_unico`, leva do Mercado),
gravar esse nome colide com quem ja o tem — o UPDATE de `players` falhava e **toda a acao voltava
502**, ou seja, o reset nunca chegou a apagar nada depois daquela migration. A migration de wipe em
massa (`20260808203000`) ja tinha chegado a essa conclusao e parado de resetar o nome; o reset de UM
jogador ficou pra tras.

Fix: o nick sobrevive ao reset, nos dois caminhos (servidor e fallback local do
`controller.resetGame`). E o correto pelo conteudo tambem — nick e identidade publica, referenciada
por amizades e por `original_trainer`; reset apaga PROGRESSO.

**Licao de diagnostico:** a Edge Function nao repassa o corpo do erro do PostgREST (correto — traz
nome de coluna e constraint). Rodar `cd server && npm run dev` e repetir o request contra
`localhost:8787` foi o que mostrou a causa em um minuto. Vale como primeiro passo pra qualquer 502
do servico.

#### O que o reset ainda deixava pra tras

`gravarEstado` so propaga o estado zerado pras 5 tabelas que ele conhece. Tudo que nasceu depois
desse desenho sobrevivia: **anuncio de POKE no Mercado** (o POKE vive com `location='market'` e o
delete-diff filtra por `location in (team,bag)` de proposito), **ordem de compra/venda com escrow**,
**entrega pendente** (seria aplicada no request seguinte, injetando ouro numa conta recem-zerada) e
o **historico de `game_sessions`**, de onde o Perfil tira o tempo de jogo. `server/src/reiniciar.ts`
apaga os quatro, nessa ordem — anuncio antes do POKE, porque `market_listings.poke_uid` tem
`on delete restrict`.

Chat, Correio, amizades e Hall da Fama **nao** sao apagados: sao o registro social do jogador, nao o
save dele.

### A barra de EXP e o level-up mediam curvas diferentes

Relatado como "chega a 100% e o level up nao dispara". Nao era `>` vs `>=` nem arredondamento:
`expProgressForInstance` (a barra) ficou na curva crua `totalExpForLevel` quando o requisito de
nivel do POKE ganhou o multiplicador de +30% (`pokeExpForLevel`) na leva anterior. A barra enchia
30% antes do limiar real e ficava parada em 100%.

Regra que fecha isso: **todo calculo de progresso de POKE passa por `pokeExpForLevel`**;
`totalExpForLevel` cru so serve pro Treinador, que nao tem o multiplicador.

`src/engine/systems/progressionSystem.test.ts` (novo, 3 casos) prende: dar exatamente o EXP que
falta sobe de nivel, um a menos nao sobe, e a barra nunca fica em >= 100% depois de ganhar EXP
(varrendo 6 niveis x 4 lotes). Uma barra cheia sem level-up nao lanca excecao nem loga nada — o jogo
so parece travado, e por isso vale teste.

### "Dou F5 e perco niveis"

Nada de tempo se perde: o relogio de referencia vive no banco e o flush credita de `last_flush_at`
ate agora. O que o jogador ve regredir e a **predicao local** — a simulacao do navegador e
cosmetica, quem credita e o servidor re-simulando o intervalo com a sequencia de sorteio dele. Entre
dois flushes (30s) a predicao pode ter subido um nivel que a verdade ainda nao tem.

Nao da pra fazer as duas baterem (RNG independente, e comparar posicao de ponto flutuante entre
engines nunca foi opcao — ver Fase D). O que da e encurtar a janela: `commitAgora()`
(`data/remote/autoridade.ts`) grava na hora, com intervalo minimo de 5s pra um POKE de nivel baixo
nao virar uma chamada de rede por segundo. Disparado por:

- **level-up**, via `useCommitOnLevelUp` (GameShell): observa a soma `trainer.level + niveis da
  equipe` no proprio store, so em SUBIDA. Observa o ESTADO em vez de receber um callback do motor
  porque `engine/simulation.ts` roda identico em Node no servidor e nao pode importar
  `data/remote`; de brinde, todo caminho que sobe nivel entra de graca (combate ao vivo, catch-up de
  aba oculta, resposta do proprio flush).
- **aba oculta** (`visibilitychange`): ali `forceSave()` nao grava NADA sob autoridade do servidor
  (o cliente perdeu a escrita na Fase D), entao o intervalo ficava pendente ate o proximo flush — e
  num celular que mata a pagina em segundo plano, ate o proximo boot.

Verificado ao vivo: antes do reload, Treinador Lv7 / 10.020 de ouro; depois do reload, Lv8 / 10.190.
Sem regressao.

### Criacao de personagem em duas telas

`StartScreen` virou `PassoNome` -> `PassoInicial`. A tela e a mesma pra conta nova e pra pos-reset,
porque o estado que a dispara e o mesmo (jogador sem nenhum POKE) — e era exatamente o caso do reset
que nao tinha tela de nome nenhuma.

Acao nova `definirNomeDoTreinador` (`server/src/acoes.ts`), aceita **so com a conta sem POKE**. Nao
e restricao gratuita: livre pra trocar a qualquer hora, o nick viraria um jeito barato de se
desassociar do proprio historico social (chat, ranking, `original_trainer`).

**A unicidade e checada em `app.ts`, nao na acao**: `aplicarAcao` e sincrona e pura sobre a store
por desenho. Sem a checagem, nome repetido so estouraria no indice unico e voltaria 502 — erro de
servidor pra um erro de jogador.

**E a checagem usa RPC, nao `ilike`.** `_` e caractere valido de nick E curinga de uma letra em
LIKE: `players?trainer_name=ilike.ash_1` casaria com `ashX1` de outra pessoa e recusaria um nome
livre. `chamarRpc` (novo em `db.ts`) chama `nome_de_treinador_disponivel`, que compara por
`lower(trainer_name)`. Reescolher o proprio nome atual e permitido (a RPC diz "ocupado" pro dono).

### Economia

- **-70% em bola e pocao**, em `data/items.ts` e nao no dado gerado (`*.generated.ts` e sobrescrito
  a cada sync e eu nao escrevo na planilha). O arquivo ja e onde preco vira decisao: `sellPrice`
  sempre foi derivado ali em vez de armazenado. Knob de planilha (`BALL_POTION_BUY_DISCOUNT`,
  fallback 0.7).

  **O desconto entra ANTES do `sellPrice`, e isso nao e detalhe:** venda e 50% da compra
  (`SELL_ITEM_FRACTION`). Descontar so a compra deixaria a Poke Ball custando 60 e vendendo por 100
  — impressora de ouro com dois cliques. Conferido ao vivo na Loja: compra 60, venda 30.

- **Venda de POKE virou `1000 + modificadores`**, era `max(1000, modificadores)`. Com `max`, o piso
  engolia tudo ate a formula passar de 1000 sozinha: um comum de nivel 40 valia igual a um de nivel
  1. Teste novo em `economySystem.test.ts` prende que nivel vale desde o primeiro ponto.
  `pokemonBaseValue` (sem piso) continua separado — o ouro por abate deriva dele e nao pode herdar
  piso de venda.

- **Terceiras evolucoes em 0,2% exatos**, em `huntSpawnOverrides.ts`. A conta sai do peso dos
  OUTROS, nao de um numero absoluto (`weightedPick` usa `peso / soma`): com N fixadas em `s` cada e
  soma `S` no resto, `w = s*S / (1 - N*s)`. Generaliza — e substitui — o 1% que o Dragonite tinha
  por pedido anterior; ele e uma 3a evolucao e cai na regra nova.

  **"3a evolucao" sai de `SPECIES`, nao de `SPECIES_DATA`** (`data/evolutionStage.ts`, novo): as 9
  cadeias de evolucao por TROCA nao existem na planilha, sao costuradas no `SPECIES` em tempo de
  load. Contando pelo dado cru, Alakazam, Machamp, Gengar, Steelix, Scizor, Kingdra, Golem, Politoed
  e Porygon2 apareceriam como forma BASE.

  Hunts BOSS ficam de fora (o rescale so roda sobre `maps`, antes do espelho do Pesadelo): la o
  elenco E a luta, e 0,2% por Dragonite significaria 99,8% de nada aparecer na hunt do Lance. O
  teste novo em `hunts.test.ts` exclui `boss_*` pelo mesmo motivo.

- **200 Poke Ball / 200 Potion** pra conta nova e resetada (migration `20260808210000`, so a funcao
  `concessao_inicial_de_itens()` muda — `handle_new_user` e os dois wipes ja leem dela). Revive nao
  foi citado no pedido e fica em 10. Conta existente nao e tocada.

### Arte de golpe de Fogo (Dungeon Crawl Stone Soup)

7 PNGs de 32x32 de `crawl-ref/source/rltiles/effect` em `assets/move-vfx/fire/` (procedencia e
licenca em `assets/move-vfx/CREDITOS.txt`: RLTiles e dominio publico, conforme o `license.txt` do
proprio repositorio). Alvo unico: `flame0/1/2`. Area: `fire_storm0` -> `cloud_fire2/1/0` — estouro,
queima, dissipa; na ordem inversa pareceria fogo acendendo depois do dano.

`data/elementVfx.ts` e o encaixe que a nota antiga do CLAUDE.md ja previa. `drawImpactBurst` e
`drawAoeRing` tentam a arte e **caem no procedural** quando o tipo nao tem arte (16 dos 17) ou
quando o PNG ainda nao esta decodificado — sem essa segunda checagem, o primeiro Ember de uma sessao
sairia sem efeito nenhum. `preloadHunt` aquece os 7 quadros junto com as sprites.

O AOE usa `effect.worldSize` (o diametro real de `ability.radius * 2`), a mesma regra que o anel
procedural ja seguia. As duas escalas (`ESCALA_VFX_SINGLE = 1.6`, `ESCALA_VFX_AOE = 1.15`) existem
porque os quadros do Crawl tem margem transparente generosa: no tamanho cru o fogo sai menor que o
efeito que substitui.

### Verificacao

`tsc -b` limpo, `tsc --noEmit` do servidor limpo, `oxlint` sem erro, `vitest` **28/28**,
`npm run build` completo com a arte nova em `dist/assets/move-vfx/fire/`. Smoke contra a Edge
publicada: **30/30** — concessao 200/200, nome aceito/recusado (409 duplicado, 400 curto, 400
caractere invalido, `_` aceito), 409 com POKE na equipe, Poke Ball a 60 e Potion a 90 com venda
abaixo da compra, venda de POKE somando o nivel, reset limpando Mercado/POKE em
`market`/Pokedex/sessoes e preservando o nick, e escolher inicial funcionando depois do reset. No
navegador: cadastro -> tela de nome -> tela de inicial -> hunt com combate e a chama do Fogo
desenhando, zero erro de console.

## Leva 5.2: arte de golpe em 8 elementos, icone de skill, o ataque que nao existia, densidade da UI

Quatro blocos pedidos (assets externos, correcoes visuais, UI/chat, balanceamento inicial). Migration
aplicada no projeto linkado, verificacao ao vivo contra a Edge Function publicada (conta descartavel,
apagada no fim), `vitest` 34/34.

### O pedido tinha uma contradicao, e a leitura adotada esta registrada

O texto dizia: baixe sprites que correspondam a **Agua, Raio, Normal, Grama, Inseto, Lutador e
Pedra** e "vincule essas novas sprites as habilidades do tipo **Fogo**". Fogo ja tinha arte da leva
anterior, e vincular arte de agua a golpe de fogo nao produz nada coerente — o paragrafo e copia
literal do pedido anterior com a lista de elementos trocada. Adotado: **cada elemento vinculado ao
proprio tipo**, seguindo o mesmo padrao que o Fogo estabeleceu (uma animacao `single` e uma `aoe`).
Fogo nao foi tocado.

### Como a arte foi escolhida — o criterio que decidiu foi contraste, nao tema

`assets/move-vfx/<tipo>/`, mesma fonte do Fogo (Dungeon Crawl Stone Soup, `rltiles/effect`, dominio
publico; procedencia em `assets/move-vfx/CREDITOS.txt`). 49 PNGs de 32x32 em 8 pastas.

Duas armadilhas reais do repositorio de origem, as duas registradas no CREDITOS:

1. **Conjunto de 8 arquivos numerados `0..7` sao as 8 DIRECOES de um projetil, nao quadros de
   animacao** (`arrow`, `bolt`, `icicle`, `force_lance`, `stone_arrow`, `needle`, `slug`,
   `harpoon_shot`, `splinters_thornwood`...). Tocar um desses em sequencia daria um projetil girando
   no lugar. Nenhum foi usado — so conjuntos de 2 a 5 arquivos.
2. **A primeira montagem tinha duas escolhas invisiveis em jogo.** Julgadas numa folha de contato
   sobre fundo cinza, `bog_flash`/`slime_wave` (GRAMA, verde-escuro) e `shatter_wave_white`
   (LUTADOR, cinza) pareciam aceitaveis; renderizadas no tamanho real sobre
   `assets/hunt-backgrounds/forest.png`, sumiam no cenario. Trocadas por `contam`/`cloud_poison` e
   `haemoclasm`. **Um efeito invisivel e pior que o desenho procedural que ele substitui** — o
   procedural pelo menos brilha. Julgar arte fora do fundo real e o erro a nao repetir.

`VfxDeElemento` ganhou `escala?: {single?, aoe?}`: os quadros nao tem enquadramento padronizado (as
nuvens preenchem os 32x32, `sting` e `sandblast` desenham um simbolo pequeno com margem
transparente). Sem correcao, BUG e ROCK saiam do tamanho de uma moeda. BUG 2.2x, ROCK 1.7x.

Ordem dos quadros: sempre do mais denso pro mais ralo. `cloud_poison`/`cloud_meph` entraram
invertidos em relacao ao nome do arquivo (2,1,0) porque na ordem natural o efeito ficaria mais forte
DEPOIS do dano.

`src/data/elementVfx.test.ts` (novo) tranca o que falha em silencio: `drawVfxDeElemento` devolve
`false` quando a imagem nao esta pronta e quem chama cai no procedural — comportamento certo, mas
significa que um caminho de arquivo errado nao produz erro nenhum, so o efeito antigo de volta.
Testa existencia dos 49 quadros + 17 icones (via `import.meta.glob`, nao `node:fs`: o tsconfig do app
nao carrega os tipos de Node), que todo tipo com arte tem `single` E `aoe`, e que nenhum quadro e
reaproveitado entre dois tipos (reaproveitar anula o proprio ponto do recurso).

### Icone de skill por TIPO, e por que nao por golpe

`assets/ability-icons/<tipo>.png` (17 arquivos, `rltiles/gui/spells` do mesmo repositorio) +
`src/data/abilityIcons.ts`. O slot da barra de golpes trocou o rotulo de 3 letras
(`shortLabel(ability.name)` -> "EMB", "FLA") pelo icone do elemento.

Por tipo e nao por golpe porque sao **223 golpes** no dataset e o repositorio de origem nao tem
equivalente pra cada um: mapear "os que dao" deixaria a maioria dos slots sem icone e a barra
visualmente incoerente, o oposto do pedido.

**Tradeoff assumido e nao escondido:** dois golpes do MESMO tipo ficam visualmente iguais no slot. O
que os separa agora e o dano na faixa de baixo e o tooltip. Em troca a barra deixou de ser uma
fileira de siglas. O rotulo de 3 letras continua no codigo como fallback pra tipo sem icone — nao e
codigo morto defensivo: `ability.type` vem do catalogo gerado, e um tipo novo cairia nele.

### O ataque que nao existia (bug real, 15 especies)

Relatado como "a sprite de animacao de ataque do Charmander nao esta funcionando". Nao era conflito
com a arte de fogo nova: **`assets/battle-sprites/charmander/` nao tem `Shoot-Anim.png`**, e
`ANIM_FALLBACKS` mandava `Shoot -> Idle`. O Charmander atacava com a pose de PARADO. Sem erro, sem
log: so a ausencia de animacao. Vale pras 15 das 227 especies com arte que nao tem `Shoot` (ditto,
dodrio, doduo, farfetch_d, kakuna, machoke, natu, pichu, sandshrew, sandslash, tauros, togepi,
unown...). Todas TEM `Charge-Anim.png` (226 das 227 tem), que E uma pose de ataque.

A cadeia de fallback virou LISTA em vez de sucessor unico, por dois motivos:

- `Shoot -> Charge` e `Charge -> Shoot` sao mutuamente dependentes. Com sucessor unico, uma especie
  sem NENHUM dos dois entrava no ciclo, a guarda de visitados cortava o laco e `resolveBattleAnim`
  devolvia `null` — o que joga a entidade no **placeholder geometrico colorido**. O bug relatado
  teria virado outro pior.
- A lista deixa o ultimo degrau (`Walk`, que toda especie com arte tem) explicito: nenhuma cadeia
  termina em nada.

Provado ao vivo instrumentando `CanvasRenderingContext2D.prototype.drawImage`:
`battle-sprites/charmander/Charge-Anim.png` passou a ser desenhado em combate (antes, so
`Idle`/`Walk`).

### Opacidade de 90% em TODA sprite de ataque

`SOLID_OPACITY = 0.9` ja existia em `render/sprites.ts`, mas so o desenho **procedural** o aplicava:
a arte real (`drawVfxDeElemento`) saia opaca. Dois VFX do mesmo jogo com peso visual diferente.
Agora os dois multiplicam o proprio fade por ela.

### Cor de raridade no nome do POKE no log

`ToastRealce {texto, cor}` (novo em `stores/toastStore.ts`), 4o parametro opcional de `pushToast`, e
`components/shared/TextoComRealce.tsx` renderizando (compartilhado entre chat e pilha de toasts — a
mesma linha aparece nos dois, e duas implementacoes divergiriam no primeiro ajuste).

**A mensagem continua sendo uma STRING** e quem renderiza procura `texto` dentro dela. A alternativa
(mensagem virar lista de segmentos) obrigaria a mexer nos ~30 pontos que montam texto com template
string, e a maioria nunca vai precisar de cor. So a PRIMEIRA ocorrencia e pintada: em "X evoluiu para
Y" as duas especies sao POKEs diferentes e pintar as duas com a mesma cor mentiria.

Ligado em: abate, level-up do POKE, captura (raridade da INSTANCIA capturada, nao a do inimigo em
campo — `attemptCapture` sorteia o POKE que entra na mochila), desmaio, troca automatica de POKE em
campo, retirada da equipe e evolucao. Venda na Loja **nao**: sob autoridade do servidor a mensagem
vem pronta de la e o cliente nao sabe a raridade.

`realceDeRaridade` mora em `data/rarity.ts` e devolve um objeto **estrutural** (`{texto, cor}`) em
vez de importar o tipo da store: `data/` nao depende de `stores/`.

### Densidade da UI

Passagem unica e mecanica sobre os utilitarios de espacamento em `src/**/*.tsx` (32 dos 78 arquivos),
com tabela explicita: `gap` 1em->.65, .9->.6, .8->.55, .7->.5, .6->.45; `p*` 2em->1.2, 1.5->1,
1em->.7, .9->.65, .8->.6, .7->.55; `m*` equivalente. **Micro-espacos (<= .5em) ficaram intocados** —
encolher .2em nao ganha pixel e so quebra alinhamento. Fonte nao mudou.

O corpo das janelas (`GameWindow`) caiu de `p-[1em]` pra `p-[.7em]` e o rodape de `px-[1em] py-[.8em]`
pra `px-[.7em] py-[.6em]`, que e o ganho mais visivel porque vale pra toda tela de menu.

### Auto-pot em 70%

Migration `20260809120000_auto_pot_em_70.sql` + `DEFAULT_AUTO_POT_RULES` no cliente. O valor vive nos
dois lugares e nenhum e redundante: o do banco vale pra conta nova e pro wipe (`= default`), o do
cliente vale antes de o servidor responder.

**Jogadores existentes so foram atualizados se a regra deles fosse EXATAMENTE o default antigo**
(`[{"hpPercent":50,"itemId":"potion"}]`, comparado como jsonb inteiro). Quem escolheu outro numero
manteve — sobrescrever escolha de jogador com "novo balanceamento" e o tipo de mudanca que aparece
como bug pra quem a sofre. Medido depois: 56 jogadores migrados, 2 personalizados preservados (10% e
65%).

Texto do tutorial do Bot e o default do botao "+ Adicionar regra" acompanharam.

### Hunt inicial so com tipo NORMAL

`STARTER_HUNT_SPECIES` = `['sentret', 'hoothoot', 'rattata']` (sairam Ledyba e Spinarak, que sao BUG
e continuam com casa no bioma Bosque).

**Rattata e de KANTO e a hunt e de Johto** — e a unica excecao a regra de regiao do jogo, deliberada
e nomeada no pedido. A hunt inicial ja era curada a mao (elenco fixo, nivel 1-2, fora do sistema de
biomas), entao o teste de regiao passou a exclui-la explicitamente. Teste novo tranca o elenco exato
e que os tres sao NORMAL: o cartao da hunt nao lista especie, entao um sync futuro poderia devolver
Ledyba pra la sem ninguem notar.

### Verificacao

`tsc -b` limpo, `oxlint` sem erro, `vitest` **34/34**, `npm run build` completo com os 49 quadros de
VFX e os 17 icones em `dist/assets/`. Ao vivo (conta descartavel contra a Edge publicada, apagada no
fim): cadastro -> nome -> inicial Charmander; auto-pot mostrando "Vida <= 70%" numa conta nova; hunt
inicial spawnando **so** Sentret/Hoothoot/Rattata; nomes coloridos por raridade no chat (comum
`#9aa0a6`, incomum `#4ade80`, raro `#60a5fa`, ultra `#a78bfa`); icones de skill carregando nos 4
slots; menus (Mochila, Loja, painel Auto) sem quebra de layout; zero erro de console.

**Cobertura honesta da arte nova:** FOGO, NORMAL, AGUA (caminho AOE), PEDRA, GRAMA e RAIO foram
vistos sendo desenhados em combate real, instrumentando `drawImage`. **INSETO e LUTADOR nao**: a IA
escolhe o golpe de maior poder, e nas hunts desses biomas o POKE de teste matava o inimigo antes de
levar o golpe correspondente. Os dois estao cobertos pelo teste de assets e pela conferencia visual
no tamanho real sobre o fundo de hunt, nao por combate ao vivo.

## Leva 5.3: forca decide a zona de spawn, correio com anexo de item, e o toggle que nunca era gravado

Quatro blocos pedidos (banco/economia, balanceamento de spawn, UI/chat, reatividade). Duas migrations
aplicadas, Edge Function republicada, smoke **20/20** contra a funcao publicada e verificacao ao vivo
no navegador.

### O bug de balanceamento era estrutural, nao um dado errado

Medido no dado gerado ANTES desta leva:

| hunt | faixa | tinha |
|---|---|---|
| Johto Zona 0 · Bosque | Lv 1-10 | Scizor (500), Heracross (500) |
| Kanto Zona 0 · Bosque | Lv 1-10 | Scyther (500), Pinsir (500) |
| Johto/Kanto Zona 0 · Floresta | Lv 1-10 | Meganium (525), Venusaur (525) |
| Kanto Zona 1 · Costa | Lv 11-20 | Gyarados (540), Lapras (535), Blastoise (530) |
| Johto Zona 2 · Caverna | Lv 21-30 | **Tyranitar (600)** |

A causa: `huntSpawnOverrides` monta o pool pelo TIPO PRIMARIO, e cada tipo existe em exatamente UMA
zona por regiao. Floresta e a zona de GRASS, entao TODA especie GRASS — do Bellsprout ao Venusaur —
caia na mesma hunt de Lv 1-10. **Nao havia nenhum eixo de forca na decisao.** Nao adianta "tirar o
Scizor da lista": sem um segundo eixo, ele ou fica no comeco ou some do jogo.

`data/spawnStrength.ts` (novo) e esse eixo: `zonaMinimaDaEspecie()` = maximo entre a faixa de BST
(>=525 -> zona 7, >=475 -> 5, >=425 -> 3, >=350 -> 1) e um piso por estagio de evolucao (3a evolucao
nunca abaixo da zona 2). Os cortes saem da distribuicao real do elenco, nao de numeros redondos: das
226 especies, 300-349 e a moda (49), 450-499 vem atras (41), e so 14 passam de 550. **Zona 3 (Lv
31-40) e o primeiro degrau acima do piso pedido explicitamente**, e todo POKE com 425+ cai nele ou
acima.

O piso por ESTAGIO existe porque BST sozinho deixa passar forma final fraca: Butterfree e Beedrill
(395) sao 3as evolucoes e ficariam na mesma zona do Caterpie que virou eles.

#### A hunt nova nasce sozinha, nao e escrita a mao

`huntSpawnOverrides` passou a agrupar o pool por `max(zona do bioma, zona minima da especie)` e a
emitir uma hunt por balde. **"Johto Zona 5 · Bosque" existe porque Scizor e Heracross precisam de
casa** — ninguem escreveu essa hunt. Resultado: 36 -> 69 hunts normais, e o bioma continua sendo o
do tipo primario (Scizor nao virou POKE de Floresta).

Tres regras que nao sao arbitrarias:

1. **A zona BASE do bioma sempre sai como hunt propria**, mesmo com pool pequeno. E ela que carrega
   o id historico (`lv_1_10_bosque`), e esse id aparece em `unlocked_maps` e em
   `game_sessions.map_id` no Postgres. As zonas novas ganham sufixo (`_z5`), nunca o contrario.
2. **Balde magro (< 3 especies) e fundido com o de cima**, subindo o nivel de quem foi absorvido —
   nunca descendo. `zonaMinimaDaEspecie` e um PISO: subir respeita o grupo todo, descer devolveria
   pra hunt cedo exatamente quem esta leva tirou de la. Sem essa fusao davam 78 hunts, varias com
   uma especie so.
3. **A sobra do topo vira hunt propria mesmo com uma especie.** Fundir pra baixo apagaria a hunt
   cedo do bioma. Uma hunt de um POKE so (Tyranitar na Zona 7 da Caverna) e conteudo legitimo: e o
   dado real de Johto ter poucas especies ROCK.

#### Conflito com a regra dos 0,2% (e a resolucao)

A regra "toda 3a evolucao aparece em 0,2% da hunt" foi criada quando forma final era sempre minoria
num pool misturado. Com as zonas por forca isso deixou de valer: "Johto Zona 7 · Costa" tem Politoed,
Feraligatr, Kingdra e Octillery — fixar tres em 0,2% dava **99,4% pro Octillery**. A zona criada pra
abrigar as formas finais viraria uma fazenda de Octillery.

`LIMITE_ZONA_DE_FINAIS = 0.5`: com metade ou mais do pool em formas finais, a hunt E uma zona de
finais e quem manda e o tier de encontro real do Gen2. O espirito do pedido original ("forma final
tem que ser rara") continua valendo onde ela e a excecao.

#### O que NAO mudou nos pesos, e por que

As taxas de aparicao continuam sendo o tier real de encontro selvagem do Gen1/Gen2
(`scripts/derive-spawn-tiers.js`, derivado dos disassemblies). Foi conferido, nao esquecido: e o
criterio mais coerente que existe pra "quem aparece mais", e trocar por um numero inventado jogaria
fora dado real. O que estava incoerente era o NIVEL, e e nisso que a leva mexeu.

Dois testes novos em `hunts.test.ts` trancam a regra: nenhuma especie forte em hunt que termina antes
do Lv 30, e toda especie respeitando a propria zona minima. A falha e silenciosa sem eles — Tyranitar
num pool de Lv 21-30 nao quebra nada, so estraga o inicio de jogo.

#### Guard novo no servidor

`aplicarFlush` passou a devolver `null` quando a hunt da sessao nao existe mais, igual ja fazia
quando o POKE some. Rebalanceamento que recorta pools pode apagar um id; sem o guard, `buildMapWorld`
estouraria dentro do flush OBRIGATORIO de toda rota e travaria a conta inteira em 502.

### Shiny -50%

`SHINY_RATE_MULTIPLIER` 200 -> 100. A FORMULA nao mudou: a proporcionalidade por `catchRate`
continua, so a taxa toda ficou 2x mais dura. Continua sendo knob de planilha.

### Correio com anexo de item

Concessao inicial 200/200/10 -> **500/500/50** (`concessao_inicial_de_itens()` + o espelho no
cliente). Conta que ja existe nao e tocada pela funcao — regravar inventario de quem joga ha semanas
apagaria o que a pessoa juntou. A compensacao vem por Correio.

`mail_messages` ganhou `anexo_itens jsonb` + `anexo_coletado_em timestamptz`, e a migration insere
uma mensagem por jogador existente (58 enviadas). O `not exists` pelo assunto e a trava de reenvio.

**A coleta e explicita, e nao um credito automatico como `market_deliveries`.** No Mercado nao ha o
que o jogador decidir; aqui ele PRECISA ver o que chegou — uma compensacao caindo no inventario em
silencio e indistinguivel de bug ("meu save mudou sozinho").

`anexo_coletado_em` (e nao um booleano) porque a coluna E o claim atomico:
`update ... where anexo_coletado_em is null returning` nao acha linha na segunda vez. O claim vem
ANTES de enfileirar: se o enfileiramento falhar, o jogador perde o anexo — erra contra ele, mas nao
imprime item, que e o lado certo de errar.

O credito reusa `market_deliveries` (nome historico; ela e a fila generica de "creditar isto no
proximo request que grava"). Um `update player_items` direto seria sobrescrito pelo proximo flush de
quem estivesse cacando — a mesma classe de bug que ja mordeu `player_items` e `player_auto_catch_rules`.

**Bug meu, pego ao vivo:** a primeira versao chamava `liquidar()` depois de coletar. `liquidar()` e
`/sessao/flush`, que responde 409 sem hunt aberta — e coletar no Hospital e exatamente esse caso. A
mensagem virava "Recebido" e o item so aparecia quando o jogador entrasse numa hunt. Corrigido com
`recarregarEstado()` (`GET /estado`, que carrega PARA ESCRITA e grava). Conferido ao vivo:
500/500/50 -> 1000/1000/100 na hora.

### O duplo clique: o listener nunca esteve quebrado

Relatado como "o evento de duplo clique parou de funcionar". Ele sempre disparou. **Duas camadas
faltavam, as duas invisiveis:**

1. `AbilityHud` chamava `useGameStateStore.toggleAbilityDisabled` DIRETO. Sob autoridade do servidor
   (Fase D), o estado local muda, o slot mostra "OFF", e o proximo flush sobrescreve tudo com o
   estado do servidor — que nunca soube do desligamento. Dentro dos 30s de ilusao o POKE continuava
   usando o golpe, porque quem escolhe o golpe e o servidor. O manipulador `alternarHabilidade` ja
   existia la desde a Fase D; so faltava a tela chamar por ele.
2. **`pokemon_instances` nunca teve coluna pra `disabledAbilities`.** `pokeToRow` nao gravava e
   `rowToPoke` nao lia. Ligar so a acao consertaria o sintoma de 30 segundos e a configuracao
   continuaria sumindo a cada login. Migration `20260809150000` + as duas pontas do mapper.

`controller.toggleAbility` tambem escreve no `worldStore`: o POKE em campo e uma COPIA, entao sem
isso o desligamento so valeria apos a proxima troca de cena.

### UI

- **Icone de skill sem preto ao redor.** Duas coisas resolvem, e so a primeira e `object-fit`:
  `object-cover` + `h/w-full` faz a arte preencher o slot (era 78% com `object-contain`, sobrando um
  anel da cor do tipo); e `mix-blend-mode: screen` apaga o **preto de dentro da propria arte** — os
  icones do Crawl nao tem transparencia, sao ladrilhos 32x32 com fundo preto opaco, entao nenhum
  `object-fit` daria conta. No modo `screen` o pixel preto deixa passar o fundo do slot, que ja e a
  cor do elemento.
- **Correio "apagado"**: o corpo inteiro estava em `n400`/`n500`/`n600` com tamanhos aninhados em
  `em` que se multiplicavam. Assunto foi pra `text-foreground`, corpo pra `n300`, e os secundarios
  subiram um degrau.
- **Cor de raridade so na PALAVRA.** A versao anterior pintava o NOME do POKE, o que confundia duas
  informacoes numa so — quem le nao sabia se o azul falava da especie ou da raridade. Agora
  `realceDaRaridade(poke)` devolve o rotulo (`RARO`) e a cor, e o abate ganhou a palavra que antes
  so a captura tinha: "Rattata [RARO] derrotado!". Os avisos que nao tem palavra de raridade
  (level-up, desmaio, evolucao, troca de equipe) perderam o realce em vez de ganharem um `[COMUM]`
  decorativo.

### Verificacao

`tsc -b` limpo, `tsc --noEmit` do servidor limpo, `oxlint` sem erro, `vitest` **36/36**,
`npm run build` completo. Smoke contra a Edge publicada: **20/20** — concessao 500/500/50, conta nova
SEM a mensagem retroativa, coleta creditando, recoleta 409 sem creditar de novo, anexo de outro
jogador recusado, `lv_1_10_bosque_z5` existindo e abrindo, e o toggle indo e voltando no banco. No
navegador: correio com os tres chips de item e botao Coletar, inventario indo a 1000/1000/100, log
com so a palavra da raridade colorida, duplo clique deixando o slot em OFF e gravando
`{"basic_attack":true}` no banco, 33 hunts listadas na aba Johto (com as zonas avancadas novas), zero
erro de console.

## Leva 5.4: a corrida que duplicava POKE, leilao no Mercado e QoL de menu

Quatro blocos pedidos (exploit de duplicacao, Mercado, UI/QoL, relatorio). Uma migration aplicada,
Edge Function republicada, smoke **30/30** contra a funcao publicada e verificacao ao vivo no
navegador.

### O bug de duplicacao: dois flushes creditando o MESMO intervalo

Reproduzido e medido, nao deduzido. A/B com o servidor local rodando o codigo antigo e a Edge
publicada rodando o novo, mesmo roteiro (20 minutos de caçada, seis flushes disparados juntos):

| codigo | segundos creditados por flush | capturas no resumo | linhas novas em `pokemon_instances` |
|---|---|---|---|
| antigo | 1200 x6 | 66 x6 | **396** |
| novo | 1177, 0, 0, 0, 0, 0 | 61, 0, 0, 0, 0, 0 | **61** |

396 = 6 x 66. O mesmo POKE capturado seis vezes.

**Por que ninguem tinha visto pelo ouro.** `aplicarFlush` calcula o intervalo de `last_flush_at` ate
`now()` e grava ouro como valor ABSOLUTO — dois flushes do mesmo intervalo convergem pro mesmo total
(medido em leva anterior: 20 flushes simultaneos = 1,03x, e foi por isso que a suspeita de exploit
por flush concorrente foi REFUTADA na auditoria pos-HUD). Captura nao converge: ela cria linha nova
com `uid` de `crypto.randomUUID()`, que fica **fora da sequencia semeada de proposito** (ver
core/rng.ts — uid e PK de persistencia, nao resultado de simulacao). Os dois flushes sorteiam o mesmo
POKE, com a mesma especie/nivel/IV, e gravam com ids DIFERENTES. O diff de remocao do segundo so
apagaria o do primeiro se lesse o banco depois do insert dele — corrida dentro da corrida.

**Nao e caso raro.** O cliente tem cinco gatilhos de flush: timer de 30s, toda `/acao`, toda rota de
`/mercado`, `visibilitychange`, e o `commitAgora()` de level-up. Clicar em qualquer coisa perto do
tique dos 30s ja basta.

**Fix: claim atomico do intervalo.** Antes de carregar estado, reivindicar entrega ou simular
qualquer coisa, `aplicarFlush` faz
`PATCH game_sessions?id=eq.X&closed_at=is.null&last_flush_at=eq.<valor lido>` movendo a ancora pra
agora. Quem escreve primeiro leva o intervalo; o resto nao encontra linha e devolve `FLUSH_OCUPADO`
— um terceiro estado, distinto de `null` (sessao insimulavel, tem que fechar). O perdedor **nao
grava**: gravar seria sobrescrever o resultado do vencedor com um estado lido antes dele.

Custo assumido: se a simulacao estourar depois do claim, aquele intervalo e perdido (a ancora ja
avancou). Perder um intervalo e melhor que duplicar POKE, e o proximo flush segue de onde este
parou.

### `gravarEstado` deixou de escrever linha que nao e mais dele

Segundo mecanismo, mais silencioso, e que o claim sozinho nao fechava: o snapshot e gravado inteiro,
entao um request que carregou o estado ANTES de uma transferencia gravava por cima dela.

- `anunciarPoke` move o POKE pra `location='market'`. Um flush concorrente, com o POKE ainda na
  mochila em memoria, fazia upsert com `location='bag'` — o mesmo POKE em dois lugares: na mochila
  do vendedor E anunciado no Mercado. Duplicacao de verdade, com as duas pontas vendaveis.
- `comprarAnuncio` troca o `user_id`. Um flush concorrente do VENDEDOR reescrevia `user_id` de volta
  pra ele (o comprador pagava e perdia o POKE); um flush concorrente do COMPRADOR via a linha nova
  "sobrando" no diff de remocao e a APAGAVA.

`carregarEstadoParaEscrita` passou a devolver `{ estado, pokeIdsNoLoad }` — os ids que existiam no
momento da leitura — e `gravarEstado` exige esse conjunto. Duas regras saem dele:

1. **So apaga linha que este snapshot conhecia.** Linha criada depois da leitura nunca entra no diff.
2. **So grava linha que AINDA e deste jogador e ainda esta em team/bag**, conferido numa unica
   leitura de `id,user_id,location` das linhas de interesse. Linha sem par no banco e POKE novo
   (captura, inicial, compra) e passa.

O filtro `location=in.(team,bag)` do diff antigo continua valendo, agora por id.

### Mercado: modo "Somente Lance"

`market_listings.price` virou nullable + coluna `apenas_oferta`, amarradas por check
(`market_listings_preco_coerente`): anuncio sem preco PRECISA estar marcado como somente-lance, e
vice-versa. Sem a check, uma linha meio-preenchida ficaria invisivel na vitrine (sem preco pra
mostrar) e nao venderia por caminho nenhum.

Tabela `market_offers` nova, com o mesmo ESCROW das ordens de item: o valor sai do bolso do
ofertante na hora. Sem isso, dez ofertas do mesmo ouro seriam todas aceitaveis e a decima aceita nao
teria como ser paga. Indice unico parcial `(listing_id, buyer_id) where status='pendente'`: reenviar
substitui, nao empilha.

Devolucao do escrow em **todo** caminho de saida — recusa, cancelamento pelo comprador,
cancelamento do anuncio pelo vendedor, e as demais ofertas quando uma e aceita
(`recusarOfertasPendentes`). Sem cobrir o cancelamento do anuncio, o ouro ficaria retido pra sempre:
o jogador nao teria como cancelar uma oferta cujo anuncio sumiu da vitrine.

Aceitar fecha o anuncio por CAS. Perder esse CAS (o anuncio saiu no meio) **devolve o escrow desta
oferta** antes de responder 409 — nao da pra entregar um POKE que ja nao esta la, e reter o dinheiro
seria o pior dos dois erros.

RLS ligada e nenhuma policy pra `authenticated`, como o resto do Mercado: uma policy de leitura aqui
exporia quanto cada jogador esta disposto a pagar antes de a oferta ser respondida.

Compra direta em anuncio de lance responde 409 explicito, e a ordenacao por preco manda anuncio sem
preco pro fim em vez de trata-lo como 0 (o mais barato do Mercado).

### Mercado: vitrine e filtros

- A aba Comprar > Itens so lista item com ordem ativa (pedido explicito); vazia, mostra "Nenhuma
  proposta existente no momento" e aponta a aba Vender. Nao se perde a possibilidade de ser o
  primeiro a anunciar: a aba Vender lista o inventario inteiro.
- Item que so tem ordem de COMPRA mostra "procura-se a X" em vez de "sem oferta" — a linha aparece
  justamente porque tem gente querendo comprar.
- Filtros rapidos Gold / Diamante / Somente Oferta como botoes de um toque
  (`FiltroToggle`), no lugar do `<select>` de moeda. Moeda comeca com as duas ligadas; "Somente
  Oferta" comeca desligado, porque filtro restritivo ligado por padrao esconde a maioria dos
  anuncios sem o jogador ter pedido.

### QoL

- **Loja em um clique**: `x10/x100/x1000` viraram `+10/+100/+1000` e EXECUTAM a transacao
  (`AtalhosDeTransacao`), nos dois lados (comprar e vender). O campo numerico e o botao
  Comprar/Vender ficaram: sao o caminho pra uma quantidade qualquer e pra conferir o total antes de
  pagar. Atalho que nao cabe fica desabilitado com o motivo no `title` — executar "+1000" comprando
  340 seria uma quantidade que ninguem pediu.
- **Atalho da Loja no painel Auto**, no cabecalho, fechando o painel junto (a Loja abre por cima
  dele).
- **`NotificationBadge`** (`components/game/NotificationBadge.tsx`) + `hooks/usePendencias.ts`. As
  duas consultas usam as MESMAS `queryKey` das telas de Correio e Mercado: com a chave
  compartilhada, ler a mensagem invalida o cache e a bolinha some sozinha. O badge fica `absolute`
  fora do fluxo — entrar no fluxo mudaria a largura do botao quando o contador aparece, e uma
  fileira de menus que muda de tamanho sozinha e pior que nao ter aviso.
- **`StickyHeader`** (`components/game/controls.tsx`), aplicado em Mochila, Loja, Hunts, Mercado e
  Pokedex. `-top-[.7em]` e nao `top-0`: o `-mt-[.7em]` que cancela o padding do corpo tambem desloca
  onde o sticky gruda (ele ancora pela caixa de MARGEM), e com `top-0` sobrava uma faixa de ~12px
  por onde a lista passava rolando por cima. Medido ao vivo: delta de 11.8px antes, 0 depois.
- **Pokedex com escopo**: Hunt Atual / Continente / Pokedex. "Hunt Atual" le `worldStore.mapDef` e
  fica desabilitado (rotulo "Hunt Atual (fora)") no Hospital, em vez de mostrar lista vazia sem
  dizer por que. "Continente" usa `regionOfSpecies`; hunt do Modo Pesadelo carrega
  `continent: 'nightmare'`, que nao e regiao de especie nenhuma, entao cai em Johto.
- **Hunts ordenadas por nivel** (`levelRange[0]`, desempate por teto e nome). A ordem anterior era a
  de insercao em `MAPS`, que sai do gerador agrupada por bioma — a lista pulava de Lv1-10 pra
  Lv71-80 e voltava.
- **Hospital**: POKE no centro exato da tela (era `height*0.68`); a enfermeira subiu junto
  (0.35 -> 0.24) pra manter a distancia entre os dois.

### Relatorio de Farm Offline com niveis

`OfflineSimSummary` ganhou `pokeLevelsGained`/`trainerLevelsGained` + os niveis antes/depois. Medido
como DIFERENCA entre o inicio e o fim, e nao contando o `leveledUp` por abate: um unico abate pode
subir mais de um nivel, e o booleano por abate nao distingue "subiu 1" de "subiu 4". O modal cai no
booleano antigo quando a contagem vem 0, pra resumo vindo de um servidor ainda nao atualizado nao
sumir com a linha.

### Verificacao

`tsc -b` limpo (cliente), `tsc --noEmit` limpo (servidor), `oxlint` sem erro, `vitest` **36/36**,
`npm run build` completo. Smoke contra a Edge publicada (`scratchpad/smoke-54.mjs`, duas contas
descartaveis): **30/30** — a corrida de flush com a prova direta (uma linha de POKE por captura
simulada), anuncio de lance na vitrine sem preco, compra direta recusada com 409, escrow debitado e
devolvido nos tres caminhos de saida, segunda oferta pendente do mesmo comprador recusada pelo
indice, transferencia do POKE ao ofertante e anuncio marcado como vendido. No navegador: conta nova,
Loja comprando 10 num clique com o total vindo do servidor (500 -> 510), Pokedex com os tres
escopos (226 -> 91 em Johto), cabecalho grudando com delta 0 apos rolar 900px, Mercado com os
filtros novos, 33 hunts em ordem crescente de nivel, e o POKE centralizado no Hospital — sem erro de
console alem do 409 esperado do flush sem sessao aberta.

## Leva 5.5: por que o farm offline "nao funcionava" — POKE caido queimava o relogio pra sempre

Investigacao pedida pelo usuario. **Nao e o mesmo bug da leva 10** (aquele era o cliente perdendo o
gap; este e do lado do servidor, sob autoridade). Reproduzido e MEDIDO contra a Edge Function
publicada antes de qualquer mudanca:

```
flush #1: creditado 21579s | simulado 70.9s | kills 9 | stoppedEarly true | hp 0
flush #2: creditado 21579s | simulado  0.1s | kills 0 | stoppedEarly true | hp 0
flush #3: creditado 21579s | simulado  0.1s | kills 0 | stoppedEarly true | hp 0
-- cura no Hospital, mesma sessao --
pos-cura: simulado 21579.0s | kills 8285 | ouro 1055 -> 113165
```

**A cadeia.** `simulateWorldSeconds` para (`stoppedEarly`) quando o POKE cai e nao ha como
reanima-lo — regra correta e documentada ("morte pausa o farm"). O que ninguem tinha ligado: o HP
fica gravado em `pokemon_instances.hp`, a sessao continua ABERTA, e `buildMapWorld` reconstroi o
mundo com o POKE ja no chao. Entao **todo flush seguinte encontra o cadaver no primeiro passo**:
credita o intervalo inteiro (`last_flush_at` avanca pra agora), simula 0,1 segundo e devolve nada.
O jogador so sai disso curando no Hospital — o que ele nao tem motivo nenhum pra fazer, porque nada
na tela diz que a caçada morreu.

Piorando: **o relatorio "Bem-vindo de volta" so aparecia com `kills > 0`**. No caso do bug o resumo
tem zero abates, entao justamente a situacao que precisava de explicacao era a unica muda. Sintoma
pro jogador: passou a noite fora, voltou, nao ganhou nada e nao viu nenhuma mensagem.

**Nao e caso raro.** `autoRevive` nasce **desligado** (default desde a leva 4.1) e o inicial e Lv1
com 11-12 de HP. Medido no motor, Charmander Lv1 no route_46 com auto-pot ligado e 500 pocoes:
**gasta as 500 pocoes em ~30 minutos e morre**; a partir do Lv3 sobrevive a hora inteira. Ou seja, a
primeira ausencia longa de uma conta nova cai no bug com frequencia alta.

### As correcoes

- **A caçada ACABA quando o POKE cai sem como levantar.** `aplicarFlush` devolve
  `encerrada: 'desmaio'` e o chamador fecha a sessao e limpa `current_map_id` (`sairDaHunt`, novo em
  `app.ts`, usado pelos tres caminhos que ja fechavam sessao a mao). Sem sessao aberta, nao ha mais
  relogio pra queimar: o proximo flush responde 409 e o intervalo seguinte so comeca quando o
  jogador curar e entrar numa hunt de novo.
- **Nao banquei o tempo perdido de proposito.** A alternativa "congelar `last_flush_at` no instante
  da morte" devolveria as horas nao farmadas quando o jogador curasse — o que transforma "morrer
  custa o resto da ausencia" em "morrer nao custa nada, desde que voce cure em ate 6h". A regra
  documentada e a primeira.
- **`estado.currentMapId = null` sai na PROPRIA resposta do flush**, nao so na coluna. O cliente
  sobrescreve o estado local com essa resposta; um `currentMapId` sobrevivente o deixaria desenhando
  uma caçada que o servidor ja encerrou.
- **Cliente sai da hunt por regra DERIVADA, nao por campo especial.** `GameShell` observa
  "`currentMapId` nulo com hunt na tela" e volta pro Hospital. Escolhido assim porque `/acao` e
  `/mercado` **tambem** liquidam a sessao antes de agir (um POKE que cai durante uma dessas encerra
  a caçada por um caminho que nao passa pelo flush) — a regra derivada cobre as tres rotas de uma
  vez, e `currentMapId` ja volta em todas elas. O campo `sessaoEncerrada` continua existindo, mas so
  pro TOAST explicativo.
  - Trava `saindoDaHunt`: `returnToHospital` grava `currentMapId` (ja nulo) **antes** de trocar a
    cena, e esse `set` acorda o proprio observador com a hunt ainda na tela — sem a trava, recursao
    infinita.
- **O relatorio aparece com zero abates** quando `stoppedEarly` (`useOfflineFarmOnBoot`). O texto que
  explica a parada ja existia no modal desde sempre; nunca chegava a ser renderizado.
- **Aviso na tela quando o POKE cai numa hunt comum**: `BossDefeatModal` virou `DefeatModal` e vale
  pra QUALQUER hunt em que o POKE nao pode levantar (auto-revive desligado, Revive esgotado, ou hunt
  BOSS). Era a versao "com o jogo aberto" do mesmo buraco: o jogador via um POKE deitado num mapa que
  nao rendia mais nada e nada dizia por que.
- **`/sessao/abrir` recusa POKE com `hp <= 0`** (409 com frase em PT), e `controller.enterMap` recusa
  antes de ir na rede. O `HuntMenu` ja tinha um aviso proprio — estas duas sao defesa em
  profundidade, nao o fix principal (o caminho real e o POKE morrer DURANTE a sessao, nao entrar
  morto).
- **Hunt BOSS na condicao de parada** (`offlineSimSystem.ts`): `autoSystem` proibe reanimar em hunt
  `noRespawn`, mas o criterio de parada olhava so `autoRevive && tem Revive`. Com Revive na mochila,
  o laco considerava o POKE recuperavel e rodava as 6 horas inteiras com ele caido — sem
  `stoppedEarly`, ou seja, **zero abates e nenhuma explicacao no relatorio**.
- **`simulated_seconds` passou a somar `resumo.simulatedSeconds`**, nao o intervalo. Os dois so
  divergem quando a simulacao parou cedo, e ai creditar o intervalo cheio mente no "tempo de jogo" do
  Perfil: na medicao acima, tres flushes de 6h somaram **30 horas** de tempo jogado pra ~6 horas de
  simulacao real.

`src/engine/farmOffline.test.ts` (novo, 3 casos) prende os invariantes: POKE ja caido para no
primeiro passo, auto-revive com Revive **nao** para, e hunt BOSS para mesmo com Revive na mochila.
Nada disso lanca excecao nem loga — um `stoppedEarly` que deixe de ser setado (ou passe a ser setado
onde nao devia) so aparece como "o farm offline nao funciona as vezes".

### Decisao de balanceamento que ficou com o usuario

O gatilho pratico do bug e **auto-revive desligado por padrao**. Com ele ligado e Revive na mochila,
a caçada atravessa a noite. Nao mudei o default: ele foi escolhido explicitamente na leva 4.1, e
inverte-lo por conta propria trocaria "farm para quando voce morre" por "farm nunca para" sem
ninguem ter pedido. O patch note avisa o jogador.

### Pendencias conhecidas, nao mexidas

- **`/sessao/fechar` e retentavel.** Se a primeira tentativa der certo mas a resposta se perder, a
  segunda encontra a sessao ja fechada e devolve `fechada: false` — o credito acontece, o RELATORIO
  se perde naquele boot. Corrigir exige id de request; o custo (um relatorio perdido em falha de rede)
  nao paga.
- **Falha depois do claim descarta o intervalo.** Herdado do claim atomico da leva 5.4 e ja anotado
  la: se a simulacao estourar depois de reservar o intervalo, aquele intervalo se perde. Continua
  valendo que perder um intervalo e melhor que duplicar POKE.

### Verificacao

`tsc -b` limpo (cliente), `tsc --noEmit` limpo (servidor), `oxlint` sem erro, `vitest` **39/39**
(8 arquivos). Smoke contra a Edge publicada (`smoke-offline.mjs`, conta descartavel): **14/14** —
sessao fechada pelo servidor no desmaio, `sessaoEncerrada: 'desmaio'` na resposta, `simulated_seconds`
de 7s pra um intervalo de 21600s, `current_map_id` nulo, flush seguinte em 409 sem creditar, abertura
recusada com POKE desmaiado, e 6h rendendo ouro de verdade depois da cura. No navegador (conta nova
contra a Edge publicada): POKE desmaiado + 6h de ausencia -> modal "Bem-vindo de volta" com
"Seu POKE desmaiou e ficou sem Revive..." e "Nada aconteceu enquanto voce esteve fora", jogador no
Hospital, sessao fechada no banco com 27s simulados; zero erro de console.

## Leva 5.6: caça a bugs — 10 achados, dois criticos, todos reproduzidos antes do fix

Rodada de caça pedida pelo usuario ("todos os testes possiveis"). Metodo: leitura adversarial do
servidor + tres suites de ataque com contas descartaveis contra a Edge Function publicada +
invariantes de motor no vitest + navegador ao vivo. **Nenhum achado entrou aqui sem ser reproduzido
e medido antes da correcao**; tres "bugs" que apareceram nos ataques eram falso positivo do proprio
teste e estao registrados no fim.

### CRITICO 1 — uma acao RECUSADA apagava o que o Mercado te devia

`carregarEstadoParaEscrita` reivindica as entregas pendentes (`market_deliveries`) e as soma ao
estado ANTES de a operacao rodar. O claim carimba a linha; quem grava depois e o `gravarEstado` no
fim. So que **uma acao recusada lanca `ErroHttp` e nunca chega la** — e recusa e o caminho mais
comum do jogo: "Ouro insuficiente", item travado, POKE indisponivel, quantidade invalida.

Medido contra a funcao publicada:

```
entregas pendentes pra A: 1 (500 de ouro)
acao recusada: status 409 (Ouro insuficiente.)
pendentes: 0 | ja reivindicadas: 1
ouro apos GET /estado: 1000     <- os 500 nunca chegaram
```

Vendeu no Mercado, tentou comprar algo caro demais, perdeu a venda. Sem erro, sem log.

**Fix:** `devolverEntregas` (`claimed_at = null`) + o embrulho `comEstadoParaEscrita`, que carrega,
roda e devolve as entregas se a operacao abortar. Virou embrulho e nao "lembre de tratar o erro"
porque a versao sem ele ja falhou em **todos** os 8 call sites de uma vez — nenhum tinha try/catch.
`aplicarFlush` tambem devolve quando sai por `null` (sessao insimulavel), que e saida sem excecao e
o `catch` nao cobriria.

### CRITICO 2 — clique duplo em "Entrar" duplicava ouro E POKEs

O indice `game_sessions_abertas` existia desde a Fase D mas **nao era unique**. `abrirSessao` fecha
a sessao anterior antes de inserir a nova, o que resolve o caso sequencial e nada em corrida.

`sessaoAberta` le `order=started_at.desc&limit=1`: com duas abertas, so a mais recente e flushada. A
orfa fica parada com `last_flush_at` congelado na abertura. Quando a recente e fechada (sair da hunt
ou o encerramento por desmaio da leva 5.5), o proximo request encontra a ORFA e credita de uma vez
todo o tempo desde a abertura dela — o **mesmo periodo** que a outra ja pagou.

```
sessoes abertas apos o clique duplo: 2
flush #1 (sessao recente): 1779s | ouro 1000 -> 5555 | POKEs 1 -> 119
apos uma acao qualquer:            ouro 5555 -> 13660 | POKEs 119 -> 179
>>> DUPLICOU: +8.105 de ouro e +60 POKEs do MESMO periodo
```

**Isto contradiz uma conclusao anterior deste arquivo.** A auditoria pos-HUD tinha REFUTADO "flush
concorrente duplica ouro", medindo 20 flushes simultaneos = 1,03x. Aquela medicao estava certa e a
conclusao era estreita demais: ela vale pra dois flushes da MESMA sessao (ouro e valor absoluto e
converge). Duas sessoes tem cada uma seu proprio `last_flush_at`, entao os intervalos **somam**.

**Fix:** migration `20260809180000` fecha as orfas existentes e troca o indice por UNIQUE parcial.
`abrirSessao` trata a colisao devolvendo a sessao vencedora (clique duplo vira no-op, nao erro), e
`sessaoAberta` fecha sem creditar qualquer orfa que ainda apareca — defesa em profundidade e
conserto de dado legado.

### MEDIO 3 — busca de amigo por nick era LIKE com curinga

`players?trainer_name=ilike.<nick>` com o comentario "sem % e comparacao exata". Nao e: `_` vale por
uma letra qualquer em LIKE, e `_` e caractere valido de nick. Pior, o `nick` do cliente so passava
por limite de tamanho, entao `%` atravessava inteiro.

```
{"nick":"%"}   -> 200 "Pedido enviado para Treinador#4ce5"
{"nick":"___"} -> 200 "Pedido enviado para Treinador"
```

Pedido pra jogador arbitrario e enumeracao da base por tentativa. **Fix:** RPC
`id_por_nome_de_treinador` (migration `20260809181000`), mesma solucao ja adotada em
`nome_de_treinador_disponivel` na leva 5.1 — e pelo mesmo motivo, que estava ate escrito no
`chamarRpc` e nao foi aplicado aqui.

### MEDIO 4 — `configurarAuto` gravava qualquer coisa sem olhar

Era o unico ponto do servico que persistia um objeto do cliente sem validacao. Medido: **5.000
regras de pocao aceitas e gravadas**, e `{itemId: 42, hpPercent: "abc"}` tambem.

Nao e so sujeira: `updateAutoHeal` percorre `autoPotRules` a cada tick, e uma simulacao de 6h faz
~216 mil ticks. Milhares de regras que nao casam viram bilhoes de iteracoes, a Edge Function bate no
teto de 2s de CPU e o request morre — e **com o claim atomico do flush (leva 5.4), morrer no meio
custa o intervalo**. Ou seja, dava pra travar a propria conta.

**Fix:** `MAX_REGRAS_AUTO = 20` + validacao de tipo/faixa em `potRules`, `catchRules` e
`catchConfig`.

### MEDIO 5 — duas ofertas ficavam "aceitas" no mesmo anuncio

`responderOferta` faz CAS na oferta (marca 'aceita') e SO DEPOIS CAS no anuncio. Com dois "Aceitar"
simultaneos, as duas ofertas passam pelo primeiro CAS; a perdedora tem o escrow devolvido
corretamente, mas fica gravada como **aceita**. O dinheiro estava certo; o registro e que mentia — e
um historico de negociacao existe justamente pra nao fazer isso. Agora a perdedora volta pra
'recusada'.

### MEDIO 6 — o limite de 6 na equipe so existia no cliente

`moveBagToTeam` do `gameStateStore` tem a guarda; o adaptador do servidor (`estadoDoJogador.ts`),
que e quem de fato executa sob autoridade, nao tinha. O que segurava era a check `team_slot <= 5` do
banco — e ela so estoura na hora de GRAVAR, entao o 7º POKE virava **502 "falha ao falar com o
banco"**. Antes do fix do CRITICO 1, esse mesmo 502 ainda engolia as entregas do request.

Divergencia cliente/servidor e exatamente a classe de bug que a Fase D existe pra eliminar:
`MAX_TEAM_SIZE` passou a ser exportado do motor e usado nos dois lados.

### MENORES

- **Pocao com vida cheia era consumida por nada** (`Math.min` devolvia o mesmo HP e o item sumia). O
  Revive ja tinha a recusa simetrica. Corrigido no servidor **e** na tela: o botao "Usar" agora some
  com vida cheia, senao so trocariamos desperdicio silencioso por um botao que sempre da erro.
- **Segundo lance no mesmo anuncio respondia 502.** O indice unico parcial barrava certo, mas o erro
  cru do PostgREST vira 502 por desenho (`db.ts` nao repassa corpo). Traduzido pra 409 com frase.
- **`perfilDoJogador` contava jogadores com `selecionar(...).length`** — o PostgREST corta em 1000
  linhas em silencio (o gotcha que este projeto ja documentou no catalogo), entao a partir do
  jogador 1001 o rank e o total congelariam num numero plausivel. Novo `contar()` em `db.ts` usa
  `Range: 0-0` + `Content-Range`.
- **"valor invalido" para valor acima do teto** virou "O maximo permitido para valor e 100.000.000".

### O que NAO era bug (registrado pra nao ser "consertado" depois)

- `criterio=level;drop` no ranking: **funciona** (400). O ataque falhou porque o meu teste mandava a
  URL sem `encodeURIComponent` e o espaco quebrava a query — o teste estava errado, nao o servidor.
- "Pocao com HP cheio ainda passa" numa das rodadas: o POKE tinha acabado de farmar e estava ferido.
  Probe isolado com `curarEquipe` antes confirma o 409.
- "Preco/un. com `max=0`" na tela do Mercado: o a11y tree reporta `valuemax=0` quando o input **nao
  tem** `max`. O campo esta correto.

### Invariantes de motor (`src/engine/invariantes.test.ts`, novo)

Nenhum destes lanca excecao quando quebra — HP negativo desenha barra vazia, item negativo faz
`hasItem` mentir, uid repetido faz o upsert do servidor sobrescrever um POKE com outro. So um teste
que roda combate de verdade e olha o estado depois pega. 4 casos sobre 10 minutos de caçada real:
ouro/itens/HP/IV/stats em faixa valida e sem uid repetido; Pokedex so com especie real; o POKE em
campo aparecendo uma vez so no estado; e inimigo morto sempre com HP <= 0. Passaram sem alteracao no
motor — sao rede de seguranca, nao correcao.

### Verificacao

`tsc -b` limpo (cliente), `tsc --noEmit` limpo (servidor), `oxlint` sem erro, `vitest` **43/43** (9
arquivos). Duas migrations aplicadas e Edge Function republicada. Contra a funcao publicada, com
contas descartaveis apagadas no fim: caça 1 **39/40**, caça 2 **27/29**, caça 3 **11/11**, farm
offline **14/14** (as 3 divergencias sao os falso-positivos listados acima). Os dois exploits
criticos foram re-executados apos o deploy: entrega devolvida e creditada (1000 -> 1500), e seis
aberturas de sessao em paralelo resultando em **uma** sessao. No navegador contra a Edge publicada:
conta nova, nome, inicial, compra na Loja em um clique (1000 -> 400 de ouro, 500 -> 510 bolas),
Mochila sem o botao "Usar" com vida cheia, hunt com combate e taxa subindo, Mercado, Correio
recusando `%`, e o relatorio de volta ao recarregar — zero erro de console.

**Um bug meu, pego pelo teste ao vivo e nao pelo type-check:** a primeira versao do fix da pocao
usou `vidaCheia` antes de declarar, e o HMR do Vite aplicou so metade — `ReferenceError` derrubando
a aba de Itens. `tsc -b` estava limpo porque o codigo final esta correto; o que quebrou foi o estado
intermediario do hot reload. Vale como lembrete de que recarregar a pagina faz parte de verificar
uma mudanca de componente.

## Leva 5.7: bloqueador de anuncios — o jogo apresentava a conta como NOVA

Caça pedida pelo usuario. O jogo nao tem anuncio nenhum, entao o risco nunca foi "anuncio
bloqueado": e **falso positivo de filtro** — nome de arquivo, host ou padrao de URL que casa com
lista, e o efeito colateral disso no cliente.

### Primeiro: medir se alguma URL nossa e realmente bloqueada

`scratchpad/adblock.mjs` (descartavel) baixou EasyList, EasyPrivacy, EasyList Portuguese e as tres
listas do uBlock Origin (filters/privacy/badware), converteu as **regras de rede genericas** (sem
ancora de dominio — as ancoradas nunca nos alcancam) em regex e testou contra **6.420 URLs reais**
do jogo: 33 rotas do servico e do Supabase, as paginas do SPA, os chunks/fontes do build e a arte
inteira.

**Resultado: nenhuma casa.** Em particular `/mercado/anuncio`, que era o suspeito obvio — as regras
com "anuncio" da EasyList Portuguese sao cosmeticas (`##`) ou ancoradas em site especifico. **Nao
renomeei a rota**: renomear sem evidencia seria superstição, e trocar o caminho quebra o cliente ja
publicado durante a janela de deploy.

Tres falsos positivos do meu proprio matcher, todos "provando" que as 6.420 URLs estavam
bloqueadas, antes de eu chegar nesse numero: `|` nao escapado virando alternancia; `^` do ABP
expandido pra `...|$` sem grupo (e `$` casa com tudo); e regras `$from=`/`redirect-rule=` que so
valem em outros sites. Registrado porque a licao vale pra qualquer varredura futura: **um matcher
que acusa 100% das URLs esta errado, nao alarmante**.

### O bug de verdade: falha de leitura entrava como "conta nova"

Simulado com `initScript` que faz `fetch` rejeitar com `TypeError` pras URLs do servico — que e
exatamente o que `net::ERR_BLOCKED_BY_CLIENT` produz no JS. Conta com POKE na equipe, nick definido
e ouro no banco:

```
com o servico bloqueado -> "Antes de tudo: como voce quer ser chamado?"
```

O jogo entrava e apresentava a conta como NOVA. Pior: criar de novo tambem nao funcionava (o mesmo
bloqueio derruba `/acao`), entao o jogador ficava preso numa tela de criacao inutil com o progresso
intacto e invisivel no servidor.

**Causa:** `useProgressoRemoto` tem o gate certo e documentado ("falhar visivelmente e melhor que
entrar com estado default"), mas ele era **codigo morto**. O `persist` do zustand ENGOLE o erro do
storage: o `hydrate()` dele termina num `.catch` que chama `onRehydrateStorage(undefined, erro)` e
**resolve** a promessa. Ou seja, `rehydrate()?.then(...)` roda o `then` mesmo com o `getItem`
rejeitado, e o `.catch` de quem chamou nunca dispara. O store hidratava com o default.

**Fix:** `getItem` registra a falha (`erroDaUltimaCarga()`) e `useProgressoRemoto` CONSULTA esse
registro no `then`, em vez de esperar uma rejeicao que nunca vem. O `.catch` fica, cobrindo o que
possa rejeitar de fato.

Vale como padrao: **nao confie em `try/catch` em volta de API de biblioteca sem verificar se ela
propaga.** Aqui o `catch` existia, estava certo na intencao, e nunca rodou.

### O bug irmao: a mensagem culpava a internet do jogador

Todo `TypeError` de fetch virava "sem conexao com o servidor — verifique sua internet", e na tela de
login vazava a string crua **"Failed to fetch"**, em ingles. Quem tem Pi-hole ou uBlock ia reiniciar
o roteador.

`src/lib/erroDeRede.ts` (novo) centraliza a decisao. O navegador **nao conta ao JS** que o request
foi bloqueado — proposital, senao a pagina detectaria e chantagearia quem usa bloqueador. A unica
pista honesta e `navigator.onLine`: aparelho dizendo que esta online + nenhuma resposta = quase
nunca e a internet. A frase cita bloqueador, extensao de privacidade e filtro de DNS **como causa
provavel**, sem afirmar.

Modulo proprio porque os dois pontos que precisam disso nao se conhecem: o login (`authStore`, fala
direto com o Supabase) e o cliente do servico (`data/remote/servidor.ts`). A primeira versao
escreveu a frase nos dois — divergiriam no primeiro ajuste.

**Descartei a deteccao ativa por isca** (servir um `ads.js` e ver se carrega): e a tecnica dos sites
anti-adblock, obrigaria a publicar um arquivo com nome que as listas barram — o que arrisca marcar o
proprio dominio — e ainda assim so provaria "existe bloqueador", nao que foi ele que derrubou ESTE
request. O jogo tambem nao passa a exigir nada de quem usa bloqueador: a mensagem so aparece depois
que algo ja falhou.

`src/lib/erroDeRede.test.ts` tranca a regra: as tres formas de "sem resposta" (Chromium "Failed to
fetch", Safari "Load failed", Firefox "NetworkError"), credencial invalida NAO confundida com rede,
offline falando de internet **sem** acusar bloqueador, e online citando bloqueador e DNS. Uma
"simplificacao" de volta pra "verifique sua internet" nao quebraria nada visivel ate alguem com
uBlock tentar jogar.

### O que ja estava certo (verificado, nao assumido)

- **`localStorage` bloqueado** (extensao de privacidade, Safari privado): `uiStore` e
  `tutorialStore` ja leem dentro de `try/catch` e caem no default.
- **Arte bloqueada**: `primeImage` **nunca rejeita** e `preloadHunt` tem teto de 4s, entao sprite
  barrada nao trava a entrada na hunt; `isImageReady` exige `naturalWidth > 0`, entao imagem que
  falhou nao e desenhada como quadro vazio.
- **Brave "block fingerprinting"**: o jogo nao usa `getImageData`, `toDataURL`, `measureText` nem
  WebGL — o farbling do Brave nao alcança nada aqui.
- **`flushAoSair`** (fetch com `keepalive`) barrado por bloqueador de telemetria: perde no maximo o
  ultimo flush, e o relogio de referencia vive no banco.

### Risco estrutural registrado, sem correcao

O jogo e servido de `poke-hunt-euj.pages.dev`. `pages.dev` e dominio compartilhado e as listas ja
bloqueiam **subdominios individuais** dele (achei varios na EasyList, alem de
`||supabase.co/rest/v1/promos_available`, que mostra que caminhos em `supabase.co` tambem entram em
lista). Nenhuma regra alcanca os nossos hoje. Mas se alguem sinalizar o nosso subdominio por engano,
o site inteiro morre pra quem usa bloqueador, e nao ha nada no codigo que conserte isso — e o
argumento pratico a favor de um **dominio proprio**. Decisao do usuario.

### Verificacao

`tsc -b` limpo, `oxlint` sem erro, `vitest` **47/47** (10 arquivos), `npm run build` completo. Ao
vivo, com `fetch` patchado pra simular o bloqueio: servico barrado -> tela de erro com a frase certa
(era "conta nova"); host inteiro barrado -> login explicando em portugues (era "Failed to fetch");
e, **sem** bloqueio, boot normal carregando Charmander, nick e ouro do servidor, console limpo — a
mudanca mexe na hidratacao, entao a nao-regressao aqui importa tanto quanto o fix.

## Leva 5.8: a regressao de progresso e o 502 do Ctrl+Shift+R eram a mesma corrida

Investigacao pedida pelo usuario ("sinto que o progresso esta sendo regredido em alguns casos" +
"ao dar Ctrl+Shift+R aparece 'falha ao falar com o banco'"). Os dois sintomas sao o mesmo evento:
**um segundo request do jogador chegando enquanto um flush ainda esta escrevendo.** Reproduzidos e
medidos contra o servidor local (que loga o corpo do PostgREST, ao contrario da Edge) antes de
qualquer mudanca, e re-medidos contra a funcao publicada depois.

### O que o claim atomico da leva 5.4 NAO cobria

Aquele claim serializa **creditar o mesmo intervalo duas vezes** (`last_flush_at=eq.<lido>` no
filtro). Ele nao diz nada sobre o resto do jogo: `gravarEstado` reescreve o **snapshot inteiro** do
jogador, entao qualquer request que LEIA o estado durante a simulacao vai gravar, segundos depois,
um retrato de ANTES do flush. E como o claim ja moveu `last_flush_at`, **o intervalo foi consumido:
o ouro/XP/captura daquele periodo nao volta em flush nenhum.**

Medido (servidor local, 10 min de caçada pendente, POKE turbinado pra render ouro de verdade):

| request concorrente | atraso 30ms | 80ms | 130ms | 200ms | 300ms |
|---|---|---|---|---|---|
| `GET /estado` (pagina recarregando) | 0/6 | **3/6** | **4/6** | 0/6 | 0/6 |
| `POST /acao` (clique na Loja) | **2/6** | **5/6** | **1/6** | 0/6 | 0/6 |

Mais de 10.000 de ouro perdidos por lote de 6 tentativas. A janela ruim e "o outro request LE antes
do flush escrever e ESCREVE depois" — ou seja, exatamente a latencia de boot de uma pagina.

Os dois gatilhos sao rotina, nao caso exotico:

- **Recarregar**: `commitAgora()` dispara `/sessao/flush` no `visibilitychange`, a aba morre, **o
  servidor continua simulando** (o fetch abortado no cliente nao aborta a invocacao), e a pagina
  nova pede `GET /estado` no meio disso.
- **Clicar em qualquer coisa** perto do tique do flush de 30s: `/acao` e `/mercado` leem e regravam
  o snapshot do mesmo jeito.

### A correcao: uma marca de "estou escrevendo", e esperar por ela

`game_sessions.flushing_since` (migration `20260809190000`), gravada **junto com o claim** e limpa
num `finally`. `last_flush_at` sozinho nao servia de sinal: ele avanca no COMECO do flush, e o que
os outros precisam saber e quando ele **terminou de escrever**.

`aguardarFlushEmAndamento()` sonda essa marca antes de todo caminho que le-para-gravar
(`comEstadoParaEscrita`). Duas decisoes que nao sao detalhe:

- **Espera, e nao erro.** O outro request nao esta fazendo nada errado — vai terminar em
  milissegundos, e a resposta certa e usar o resultado DELE como ponto de partida. Devolver 409
  trocaria uma perda rara por uma falha certa.
- **Expira em 30s, e estourar a espera (2,5s) segue em frente.** Marca orfa (invocacao morta pelo
  limite de CPU, deploy no meio) faria todo request seguinte travar. Estourando, volta-se ao
  comportamento antigo — a corrida — em vez de travar a conta.

**A espera entra ANTES do claim, dentro do proprio `aplicarFlush`** — e foi o unico ponto que a
primeira versao errou. Colocada so no `comEstadoParaEscrita`, `/acao` continuava regredindo 5/6:
ele liquida a sessao antes de agir, le a linha ja com `last_flush_at` novo, **reivindica um
intervalo de ~0 segundo legitimamente** e, por ser um flush, pulava a espera — indo ler o estado
enquanto o primeiro ainda escrevia. Depois do claim seria esperar pela propria marca; antes dele e
o lugar certo.

### `GET /estado` deixou de gravar a toa

Ele grava por UM motivo: persistir a entrega do Mercado/Correio que `carregarEstadoParaEscrita`
acabou de carimbar como aplicada. Sem entrega, ele regravava um snapshot identico ao que tinha
lido — escrita inutil que era metade do problema no boot. Agora so grava quando
`entregas.length > 0`.

**Nao passou a liquidar a sessao**, de proposito: consumir ali o intervalo pendente deixaria o
`/sessao/fechar` que vem logo depois sem nada pra relatar, e o relatorio "Bem-vindo de volta"
sumiria.

### O 502 do Ctrl+Shift+R: `player_auto_catch_rules` era DELETE-tudo + INSERT

A tabela tem `UNIQUE (user_id, species_id)`, e `gravarEstado` a reescrevia apagando tudo e
inserindo de novo (decisao registrada na leva do wipe: "a lista e pequena e nao tem chave estavel").
Dois requests do mesmo jogador intercalando DELETE/DELETE/INSERT/INSERT fazem o segundo INSERT
violar a constraint. Medido com 8 regras configuradas: **33 de 48** `GET /estado` concorrentes
voltaram 502, com o log do PostgREST acusando
`duplicate key value violates unique constraint "player_auto_catch_rules_user_id_species_id_key"`.

Como `getItem` do save e justamente esse `GET /estado`, o 502 virava a tela **"Nao foi possivel
carregar seu progresso — falha ao falar com o banco"**. Era o aviso relatado.

Corrigido com o mesmo diff de remocao + upsert das outras quatro tabelas. A premissa antiga estava
errada: a chave estavel existe e e a propria constraint, `(user_id, species_id)`.

**O diagnostico so foi rapido porque rodou contra `cd server && npm run dev`.** A Edge Function nao
repassa o corpo do PostgREST (correto — traz nome de coluna e constraint), entao la o erro e opaco.
Vale como primeiro passo pra qualquer 502 do servico; a leva 5.1 ja tinha aprendido isso.

### Armadilha do proprio teste

As duas primeiras rodadas de medicao foram contra um **servidor local antigo que ainda estava de pe
na porta 8787** — o `node dist/node.js` novo morreu com `EADDRINUSE` e eu li o resultado do
processo velho como se fosse do codigo atual. Os numeros bateram por sorte (o bug existia nos dois),
mas podiam nao ter batido. Conferir `curl /saude` nao basta: e preciso conferir que **este**
processo subiu.

### O que continua em aberto (medido, nao adivinhado)

- **Dois `/acao` concorrentes entre si** (sem flush no meio) ainda sao last-write-wins: os dois leem
  e os dois gravam o snapshot inteiro. Nao entrou nesta leva porque o cliente ja serializa por botao
  (`useAcaoPendente`) e o dano e "a acao perdida", nao "10 minutos de caçada perdidos". O conserto
  de verdade seria travar a escrita por jogador (lease com expiracao), o que troca uma perda rara
  por um modo de falha novo — escrita travada — e nao se justifica com a evidencia atual.
- **Toda rota que muta paga uma sondagem a mais** (um `select` na `game_sessions`), e `/acao` paga
  duas: uma no `aplicarFlush` e outra no `comEstadoParaEscrita`. Correcao acima de latencia: pular a
  segunda exigiria assumir que a primeira cobriu, e ela pode ter devolvido `FLUSH_OCUPADO` por causa
  de um flush que comecou depois.
- **Se a invocacao do flush morrer no meio da escrita**, o snapshot fica parcialmente gravado. A
  marca expira e o jogo destrava, mas nada reconstroi o que faltou. Fora do alcance deste desenho.

### Verificacao

`tsc -b` limpo (cliente), `tsc --noEmit` limpo (servidor), `oxlint` sem erro novo, `vitest`
**47/47**. Migration aplicada no projeto linkado e Edge Function republicada.

Suite propria (conta descartavel, apagada no fim) — **11/11 contra a Edge publicada**: 8 lotes de
"flush + 6 requests concorrentes misturados" sem nenhuma regressao de ouro e sem nenhum 502; 6
`GET /estado` simultaneos com regras de auto-captura configuradas, todas preservadas; remocao de
regra ainda funcionando (4 → 2); entrega pendente creditada E gravada pelo `GET /estado`; relatorio
de farm offline ainda saindo quando o boot le o estado antes de assentar a sessao; nenhuma marca de
flush presa. As duas sondas de corrida, contra a funcao publicada: **0/60** (era 7/30 e 8/30).

No navegador contra o servidor local: conta nova, nick, inicial, regras de auto-captura, entrada em
hunt e **quatro Ctrl+Shift+R seguidos** — nenhuma tela de erro, nenhum "falha ao falar com o banco",
XP preservado entre os recarregamentos, console sem erro nenhum.

## Leva 6.0: a base de dados virou Pokemon Ultra Sun (Gen VII) + tipo Fada

Branch `feat/dados-ultra-sun`, tirada da `main`. **Nada foi escrito no Supabase** (decisao explicita
do usuario) — e e dai que sai a mudanca estrutural desta leva.

### A fonte de build deixou de ser o Postgres (e o gate byte-a-byte foi aposentado)

Antes: `npm run catalog:gerar` lia 8 tabelas do Supabase, e `npm run catalog:verificar` provava
byte-a-byte que planilha e Postgres produziam o MESMO catalogo. Com a proibicao de escrever no banco,
os dois viraram armadilha: o banco ficou com o catalogo de Gen2 e qualquer pessoa rodando
`catalog:gerar` **reverteria a leva inteira sem um erro sequer**. E o gate byte-a-byte provava que o
dado NAO muda, que e o oposto do objetivo aqui.

Agora:

| comando | o que faz |
|---|---|
| `npm run usum:baixar` | PokeAPI -> `scripts/usum/catalog.json` (commitado). Cache em `scripts/.cache/pokeapi` (gitignorado). |
| `npm run usum:conferir` | confere esse JSON contra a **Bulbapedia** (wikitexto cru). Exit 1 se divergir. |
| `npm run usum:gerar` | `catalog.json` + `scripts/usum/formulas.json` -> os 8 `*.generated.ts`. **Offline.** |
| `catalog:gerar` / `catalog:migrar` / `catalog:verificar` | **bloqueados** (`scripts/lib/guarda-catalogo-gen2.js`). Rodam so com `PERMITIR_CATALOGO_GEN2=1`. |
| `planilha:aplicar` | idem — bloqueado, mesma guarda. |

`sync-planilha.js` **continua sendo carregado e reusado como biblioteca**: ele e o dono da curadoria
de hunts (`TYPE_BIOME_PLAN`, `buildTypeRoster`, `buildTypePoolQueues`, `buildTypeDrivenHunts`) e do
emissor (`toJsLiteral`/`emitData`). O gerador novo monta um objeto com forma de workbook e entrega
pras mesmas funcoes — duplicar aquilo garantiria divergencia no primeiro ajuste de balanceamento. O
que mudou e so a FONTE do dado de Pokemon. A planilha ainda e lida para UMA coisa: a geometria das
hunts (faixas de nivel dos brackets de Johto e a hunt inicial), que nunca veio de dado de Pokemon.

### A parte que erra em silencio: `/pokemon` e `/move` devolvem o dado ATUAL, nao o do Ultra Sun

`scripts/lib/pokeapi.js`. Duas fontes de historico, com semanticas **opostas** — misturar erra por
uma geracao inteira e nao produz erro nenhum:

- **`move.past_values[i].version_group`** = o version group em que o valor MUDOU; os valores listados
  sao os ANTIGOS, validos ATE (exclusive) ele. Prova: Bite lista `{gold-silver, type: normal}` e Bite
  E Sombrio desde GS.
- **`pokemon.past_types[i].generation`** = a ultima geracao em que aqueles tipos valeram (INCLUSIVE).
  Prova: Magnemite lista `{generation-i, [electric]}` e ele E Eletrico/Aco desde a Gen2.

Resolucao por `version-group.order` (USUM = 20). Sem isso, Rapid Spin entraria com 50 de poder
(valor da Gen8) num jogo que diz usar Gen7 (20). O fetch tem assert de regressao embutido em 6
golpes conhecidos.

**Nao existe `past_stats`.** Atributos vem sempre do valor atual — e por isso a conferencia contra a
Bulbapedia usa a pagina **especifica da Gen VII** (`List of Pokemon by base stats in Generation
VII`), nao a lista geral.

### O que a conferencia contra a Bulbapedia cobre (e o que nao cobre)

`npm run usum:conferir`, wikitexto cru (`action=raw`), somente leitura, com cache local:

    base stats (Gen VII)   251 especies    0 divergencias
    tipos                  250 especies    0 divergencias
    catch rate             251 especies    0 divergencias
    curva de experiencia   251 especies    0 divergencias
    tabela de tipos        324 celulas     0 divergencias

Tem **piso de cobertura**: se o parser deixar de casar com a pagina (ela muda de formato), o script
falha em vez de passar tendo conferido nada. `base_experience` NAO e conferido — a Bulbapedia nao
publica lista dessa coluna por geracao. Lacuna registrada, nao escondida.

### Formulas: `scripts/usum/formulas.json` substituiu a aba "Formulas"

Hand-authored e versionado. Fim da friccao historica de "eu nao escrevo na planilha": ajustar knob
de economia agora e editar um JSON.

| formula | antes | agora (Gen VII) |
|---|---|---|
| `CRIT_CHANCE` | 1/16 | **1/24** |
| `CRIT_MULTIPLIER` | 2 | **1.5** (Gen VI+) |
| `EXP_GAIN` | `floor(b*L/7)` (Gen I-IV) | **escalada**: `floor(b*L/5 * ((2L+10)/(L+Lp+10))^2.5)+1` |
| captura | `min(1, taxa/255*bola*k)` | **cadeia real**: taxa modificada -> `(a/255)^0.1875` -> 3 sacudidas |
| `DAMAGE_BASE` | 2 floors | 3 floors, nas posicoes exatas da formula real |
| curvas | 6, com 2 inventadas | **6 reais**; ERRATIC e FLUCTUATING no lugar de SLIGHTLY_FAST/SLOW |

`STAT_FORMULA`/`HP_FORMULA`/`STAB`/`DAMAGE_VARIATION` **ja eram** as da Gen III+/VII — conferido, nao
alterado.

**O motor de formula ganhou `if`/`lt`/`lte`/`gt`/`gte`/`eq`** (`src/core/formulaEngine.ts`). Nao e
capricho: Erratic e Fluctuating sao funcoes POR PARTES (4 e 3 faixas), e sem isso as duas teriam que
virar codigo, quebrando a regra de "formula e dado". `if` avalia os dois ramos antes de escolher — a
linguagem so tem aritmetica pura, entao nao ha efeito colateral. Teste prende os valores publicados
no nivel 100 (Erratic 600.000, Fluctuating 1.640.000).

### As duas recalibragens, e por que elas NAO sao mudanca de balanceamento

- **`XP_GLOBAL_MULTIPLIER` 0.14 -> 0.10.** O termo escalado vale exatamente 1 quando os niveis
  empatam, entao a formula nova rende 7/5 = 1.4x a antiga nesse ponto; 0.14/1.4 = 0.10 desfaz. O XP
  contra alvo do proprio nivel fica identico ao de antes. **O que muda de verdade** e o resto da
  curva — um POKE Lv90 num mob Lv5 recebe ~1.6% do que receberia contra um Lv90. Isso e a regra da
  Gen VII, nao um knob, e cria pressao real pra subir de zona.
- **`GLOBAL_CATCH_MULTIPLIER` 0.3 -> 0.0925.** MEDIDO, nao chutado: e o valor que iguala a chance
  MEDIA de captura do elenco inteiro (226 especies x Poke/Great/Ultra Ball) a de antes, 18,4%. A
  FORMA da curva muda de proposito, porque a Gen VII eleva a taxa a 0.1875 por sacudida e isso
  comprime as diferencas: taxa 3 vai de 0,35% pra 2,2%, taxa 255 vai de 30% pra 26%.
  **Consequencia aceita:** lendario em hunt BOSS ficou ~6x mais capturavel. Ele e Lv300 e mata o
  jogador; a Champion Lance ja tem `noCatch`.

Medido com o motor de verdade (12 sementes, 1h cada, auto-pot e auto-catch ligados):

    lv_1_10_floresta    (Chikorita Lv8)   559 kills |  28.085 ouro/h |  2.089 xp/h | 112 capturas
    lv_41_50_dojo       (Machoke Lv45)  1.076 kills | 430.554 ouro/h | 40.110 xp/h | 142 capturas
    kanto_..._clareira  (Granbull Lv85)   550 kills | 870.192 ouro/h | 91.175 xp/h | 118 capturas

### Fada: onde ele encostou

18 tipos. `typeColors` (`#f5a9d0`), `abilityIcons` (`assets/ability-icons/fairy.png` = `jinxbite` do
Crawl, uma fada alada — nao colide com nenhum dos 17), `impactShapes` (familia **nova** `sparkle`,
brilho de 4 pontas finas com nucleo claro; reusar `star` do LUTADOR deixaria os dois iguais),
`nightmareMaps` (fundo = floresta), `stones`/`typedAoeMoves` (derivam de `TYPE_COLORS`, entraram
sozinhos), `sync-planilha#ALL_TYPES`/`TYPE_THEME`/`TYPE_BACKGROUND_IMAGE`, `huntSpawnOverrides`.

**Fada tomou o 2o slot de WATER ("Profundezas"), nao um bracket novo.** Sao 9 brackets x 2 = 18
vagas pra 18 tipos: a conta fecha exata. Um 10o bracket subiria o teto das hunts normais de Lv90 pra
Lv100, mudanca de progressao que ninguem pediu. O 2o slot de WATER existia pra partir o pool entre
"cedo" e "fim de jogo", e isso ficou redundante: `spawnStrength.zonaMinimaDaEspecie` ja promove por
BST/estagio, entao Gyarados/Lapras/Kingdra ganham hunt-irma de zona alta sozinhos. Dragao + Fada no
ultimo bracket e o pareamento tematico da propria Gen VI.

**Kanto nao tem nenhuma especie de Fada primaria no elenco com arte** — a Clareira Encantada e so de
Johto (Cleffa, Togepi, Snubbull, Granbull). Mesma situacao ja documentada de Kanto+DARK. Clefairy,
Clefable, Wigglytuff, Mr. Mime e Togetic sao Fada mas estao entre as 25 especies do dex 1-251 **sem
arte de batalha no disco**, entao ficam fora do elenco selvagem como sempre estiveram.

### Golpes: 223 -> 486, e a categoria `status` virou real

`AbilityCategory` ganhou `'status'`. Ate a Gen III a categoria era decidida pelo TIPO do golpe (a
planilha herdava isso), e todo golpe de status aparecia como "fisico com 0 de poder" — mentira que
ninguem via porque `isDamagingAbility` filtra por poder > 0. Agora ele se declara pelo que e.
Rotulo, borda do slot e tooltip cobrem os tres casos.

**Golpe em area saiu de uma lista de 6 chaves escrita a mao pro DADO** (`ability.target`, do alvo
real da PokeAPI). A lista ja estava furada: `selfdestruct` virou `self_destruct` no catalogo novo e a
entrada parou de casar em silencio — Explosao teria voltado a ser alvo unico. Sao **26 golpes de
area com dano** agora (Terremoto, Nevasca, Deslizamento de Rochas, Onda de Calor, Descarga, Voz
Encantadora...) contra os 6 de antes.

**278 descricoes novas em portugues** (`moveDescriptions.ts`), e 15 chaves obsoletas reescritas
(`solarbeam` -> `solar_beam`, `psychic_m` -> `psychic`, `hi_jump_kick` -> `high_jump_kick`, ...).
Teste novo prende a cobertura 1:1 — a falha aqui e muda (tooltip generico), e foi exatamente assim
que a migracao chegou com 278 buracos.

**6 especies ficaram sem NENHUM golpe de dano por nivel** (Metapod, Kakuna, Ditto, Smeargle, Abra,
Wobbuffet). E o dado real da Gen VII, e `BASIC_ATTACK` existe justamente pra isso. Golpe de poder
variavel (Magnitude, Return, Seismic Toss, Night Shade, OHKO...) volta com poder 0 da PokeAPI e fica
inerte — coerente com "dano fixo/multi-hit fora de escopo".

### Bug real corrigido de tabela: `unlockedAbilities` era lido do banco

`playerMapper#rowToPoke` agora **deriva** o moveset da especie + nivel, em vez de ler a coluna —
mesmo argumento que ja valia pros atributos ("a coluna e cache, nao verdade"). Sem isso, todo POKE
ja salvo perderia em silencio os golpes cujas chaves foram renomeadas (`getAbility` devolve null e o
combate simplesmente pula) e ficaria preso ao learnset de Gen2 pra sempre. A coluna continua sendo
gravada.

### Spawn tier: continua vindo do Gen1/Gen2, e isso foi MEDIDO antes de decidir

O pedido era pesquisar taxa de aparicao do Ultra Sun. Feito, e o dado **nao serve**:

- Dos 251 do dex, so **131** tem qualquer encontro selvagem no Ultra Sun.
- Boa parte via `island-scan` (chance **100%**, um Pokemon por dia) ou `sos` (cadeia de chamados).
  Adotar isso faria Bulbasaur, Charmander e Squirtle virarem os spawns mais comuns do jogo.
- **A Gen VII nao tem conceito global de raridade por especie**: as taxas sao por LOCAL (conferido na
  Bulbapedia, Alola Route 1 — "Caterpie all=10%", "Grubbin all=15%").

`scripts/spawn-tiers.json` (disassemblies de Gen1/Gen2, cobertura 251/251, escala 30/20/10/5/1 igual
a das vagas reais) continua sendo o eixo de frequencia. A medicao do USUM ficou commitada em
`scripts/usum/encontros-usum.json` como evidencia da decisao. **Divergencia de fonte assumida:
stats/moveset = Gen VII, taxa de aparicao = Gen1/Gen2.**

### Evolucoes

Derivadas da cadeia real, com dois recortes explicitos:

1. **Galhos posteriores ao dex 251 sao cortados.** As cadeias da PokeAPI nao tem recorte de geracao:
   Meowth lista Perrserker (Gen8) e Wooper lista Clodsire (Gen9). Nenhum dos dois existe no Ultra Sun
   nem neste jogo.
2. **Evolucao por troca/pedra/amizade sai com `evolvesTo` vazio** e continua sendo tratada pelo patch
   `SPECIAL_EVOLUTIONS` (Nivel 80 + 20 Pedras do tipo primario) — criterio mantido por decisao
   explicita do usuario, caso a caso fica pra depois. As 9 cadeias continuam intactas.

Unica diferenca de dado: **Tyrogue passou a evoluir** (nivel 20 -> Hitmonlee, o de menor Pokedex
entre os tres; Hitmonchan e Hitmontop ficam registrados como descartados no log do fetch).

### Nao mexido, com motivo

- **`element_type` do Postgres continua com 17 tipos** (sem FAIRY) e `src/lib/database.types.ts`
  idem. As tabelas de catalogo do banco nao alimentam mais o build, e nenhuma tabela de PROGRESSO
  guarda tipo elemental — nada quebra. Corrigir exigiria migration, ou seja, escrever no Supabase.
- **Edge Function nao republicada.** `supabase/functions/jogo/servidor.js` (o bundle publicado)
  segue com o catalogo antigo ate alguem rodar `npm run build:edge` + `functions deploy`. Como o
  servidor e a AUTORIDADE, **jogar contra a Edge de producao ainda usa o dado de Gen2**. O bundle
  local do motor (`server/engine/headless.js`) foi reconstruido e esta com o catalogo novo.
- **Roster continua em 226 especies** (as que tem arte de batalha no disco). Importar as 25 que
  faltam mudaria hunts e balanceamento inteiros — inclusive destravaria Pikachu -> Raichu, que hoje
  e um beco sem saida. Fica como trabalho proprio.

### Verificacao

`tsc -b` limpo (cliente), `tsc --noEmit` limpo (servidor), `oxlint` sem erro novo, `vitest`
**85/85** (12 arquivos — 38 testes novos entre `catalogoUsum.test.ts` e `moveDescriptions.test.ts`;
`determinismo.test.ts` continua passando), `npm run build:engine` OK, `npm run usum:conferir` sem
divergencia, e o relatorio de cobertura do gerador com **zero especie orfa** e 18/18 tipos com hunt.

## Leva 6.1 (branch `feat/hunts-em-salas`): hunts viram salas, e o Lance vira portao

**Branch tirada de `main`, NAO da `feat/dados-ultra-sun`** (pedido explicito). Entao o catalogo aqui
e o Gen2 de 226 especies, sem tipo Fada. As duas branches divergem no dado; esta leva nao toca no
catalogo.

O jogo passa a ter **12 biomas x 3 faixas de nivel = 36 hunts** (+ a inicial), e cada hunt e
percorrida em **10 salas**, cada sala um **sub-bioma** sorteado. Total de mapas: 86 (37 normais, 37
espelhos do Pesadelo, 12 BOSS) contra 100 antes.

### De onde vem o dado dos sub-biomas

Do codigo-fonte do PokeRogue (`pagefaultgames/pokerogue`, `src/data/balance/biomes/*.ts`), nao da
wiki (que responde 403).

- `scripts/pokerogue/extrair-biomas.mjs` (`npm run subbiomas:extrair`) -> `biomas.json`, COMMITADO.
  O build nao pode depender de rede nem do repo de terceiros; o extrator existe pra regerar e pra
  provar procedencia.
- `scripts/gerar-subbiomas.mjs` (`npm run subbiomas:gerar`) cruza com o nosso catalogo ->
  `src/data/generated/subBiomas.generated.ts`. **Estoura se sobrar orfa**, em vez de emitir catalogo
  mutilado.
- `src/data/biomas.ts` (a mao): agrupamento em 12 biomas, peso de sala, perfil de loot, faixas,
  geometria.

**Tres transformacoes deliberadas, sem as quais o dado do PokeRogue e inutilizavel aqui:**

1. **O pool de CHEFE entra no pool normal.** La, forma final quase nunca e encontro selvagem — ela e
   o chefe da 10a wave. So o pool selvagem deixava **97 das 226** especies sem casa (Gyarados,
   Tyranitar, Alakazam, Blastoise). Aqui quem cumpre o papel do slot de chefe e a faixa de nivel.
2. **A LINHA EVOLUTIVA INTEIRA mora nos mesmos lugares.** O PokeRogue nunca faz spawnar estagio do
   meio (Metapod, Graveler, Kadabra, Croconaw — 33 no nosso roster). A primeira versao so dava casa
   a quem nao tinha nenhuma, e isso deixou o **Templo com pool VAZIO nas faixas II e III**: todos os
   estagios dele evoluem antes do Lv31 e as formas evoluidas tinham casa noutro sub-bioma.
3. **Teto de 35% por especie** em pool de 5 ou mais. Unown ocupava **50,8%** do Sagrado (nos jogos
   reais ele e 100% das Ruinas de Alph, entao o tier esta certo; o pool e que encolheu).

Resultado: 33 sub-biomas, **209 especies alocadas, zero orfa**.

### A regra central: uma linha evolutiva, estagios em faixas DISJUNTAS

Uma faixa cobre 30 niveis. Jogar a linha inteira dentro dela dava **228 pares especie x hunt** em que
a especie ja deveria ter evoluido (Caterpie, que evolui no 7, nascendo Lv60). Entao cada estagio
entra com a sub-faixa em que ele e o estagio correto:

```
linha Caterpie na faixa I  (Lv 1-30):  Caterpie 1-6 | Metapod 7-9 | Butterfree 10-30
linha Pidgey   na faixa II (Lv 31-60): Pidgeotto 31-35 | Pidgeot 36-60
```

**Por que nao auto-evoluir no spawn (como o PokeRogue faz):** o Gyarados herdaria o peso
`muito_comum` do Magikarp. O `spawn_tier` derivado dos disassemblies e o dado mais bem fundamentado
do projeto e seria destruido em silencio.

**Bug que isso criou e o conserto:** Scyther sumia do jogo. Zona minima 5 (so Lv31+) e o gatilho da
evolucao especial caindo tambem em Lv31 deixavam a faixa dele vazia. A forma evoluida passou a ficar
pelo menos uma faixa acima da origem (`nivelDeTroca`).

### Salas

`src/engine/systems/salaSystem.ts`. Duas decisoes vieram da arquitetura, nao de preferencia:

- **Limpar a sala e QUOTA DE ABATES** (12), nao "zerar o campo". O servidor simula por JANELAS e
  reconstroi o mundo a cada flush (~30s): o inimigo em campo nao sobrevive de uma janela pra outra,
  um contador sobrevive. "Zerar o campo" seria uma condicao que o servidor nunca observaria inteira,
  e a hunt travaria na sala 1 pra sempre.
- **O sub-bioma da PROXIMA sala so e sorteado no avanco**, nao como plano de 10 na abertura. Plano
  mandado ao cliente = o jogador le qual sala e a boa, sai e reentra ate ela cair na primeira (reroll
  gratis); plano escondido = nao ha o que mostrar. Sorteando no avanco, o futuro nao existe pra ser
  espiado. O anti-reroll que sobra e o custo: sair da hunt fecha a sessao e volta pro ciclo 1.

O avanco mora no `stepWorld`, o unico ponto de abate do jogo — combate ao vivo, catch-up de aba
oculta e farm offline contam pela mesma regra sem nenhum deles precisar lembrar.

`game_sessions` ganhou `sala_indice`/`sala_chave`/`sala_abates`/`ciclos`, e o flush devolve a sala:
a simulacao local e PREDICAO com sequencia de sorteio propria, entao sem a resposta a sala exibida
seria o palpite do cliente enquanto o pool e o loot creditados vieram da do servidor.

#### A janela de nivel da sala (bug de balanceamento achado MEDINDO, nao lendo)

Faixa de 30 niveis sem janela deixava a **primeira** sala da "Mata I" (Lv1-30) jogar um Butterfree
Lv30 contra quem acabou de sair do Hospital. Medido no motor headless: Charmander Lv25 fez **4
abates em 30 minutos** e morreu gastando 21 pocoes. As zonas antigas tinham 10 niveis e nao expunham
isso.

`janelaDaSala` divide a faixa em 10 degraus: sala 1 na base, sala 10 no topo. Com a janela, a mesma
simulacao fez **114 abates** e chegou a sala 10. De brinde, a mecanica de salas ganhou significado
mecanico (a hunt afunda conforme voce avanca) alem da variedade de sub-bioma.

Medido depois, 2h na Mata I com Lv35: 2047 abates, 17 ciclos fechados, os 3 sub-biomas visitados na
proporcao dos pesos, e o loot por perfil aparecendo certo (`super_potion`/`great_ball` na Mata;
`hyper_potion`/`ultra_ball` so no Sombrio, que tem sub-bioma `profundo`).

### O gate: `continent` deixou de ser regiao

Virou o GRUPO DE GATE: `faixa1` | `faixa2` | `faixa3` | `nightmare`. As duas primeiras nascem
abertas; a faixa III e o Modo Pesadelo (com as 11 BOSS dentro) saem do Campeao Lance, cujo time e
Lv55-65 — o fim exato da faixa2. `unlocksContinentOnClear` virou LISTA.

**A separacao por regiao morreu, e nao dava pra manter:** as pools do PokeRogue sao tematicas.
Medido, recortar por regiao deixaria **12 dos 33 sub-biomas** com menos de 3 especies numa delas —
Praia e Dojo sem NENHUMA de Johto, Floresta Nevada sem nenhuma de Kanto. `regions.ts` continua vivo:
a ESPECIE tem regiao (numero da Pokedex), a hunt e que nao tem mais. O escopo "Continente" da Pokedex
virou escolha explicita Johto/Kanto, porque ele derivava a regiao da hunt atual.

#### BUG CRITICO: a luta contra o Lance era inganhavel

`sequenceIndex` vivia so em `WorldState`. O servidor reconstroi o mundo a cada janela, entao **toda
janela recomecava no primeiro POKE dele** — e o `startCountdown` de 5s era pago de novo junto. So
daria pra vencer matando os 6 em ~25 segundos. Ninguem notou porque ele nao trancava nada; agora ele
e o portao de metade do conteudo. `game_sessions.sequence_index`/`sequence_cleared` + o parametro de
progresso do `buildMapWorld` (que tambem pula a contagem regressiva na retomada).

### Outras mudancas estruturais

- **`maps.generated.ts` e `enemies.generated.ts` foram APAGADOS.** As hunts sao montadas em runtime;
  emitir os dois criaria arquivos que ninguem le e que pareceriam a fonte da verdade.
- **O peso de spawn virou arquivo proprio** (`npm run tiers:gerar` -> `spawnTiers.generated.ts`).
  Ele era RASPADO de `enemies.generated.ts` — dependencia silenciosa: parar de emitir aquele arquivo
  nao daria erro, so zeraria todos os pesos e todo spawn viraria o fallback "incomum".
- `sync-planilha.js` continua rodando a curadoria (ela alimenta o ROSTER via `syncSpeciesAndMoves`),
  so parou de EMITIR mapas/encontros.
- **`vite.config.ts` ganhou `test.exclude`**: o vitest varria `.claude/worktrees/*` (worktrees de
  outras branches) e rodava os testes DELAS contra este codigo — 12 falhas fantasma escondendo falha
  real.

### Verificacao

`tsc -b` limpo, `tsc --noEmit` do servidor limpo, `oxlint` sem erro, `vitest` **65/65** (11
arquivos), `npm run build` completo. O bundle carrega no navegador sem nenhum erro de console. O
motor rodou headless em Node por 2h de tempo de jogo (numeros acima).

**RESOLVIDO** (registrado como estava no momento, mas o bloqueio abaixo nao vale mais): as
migrations foram aplicadas, `main` e o schema `dev` convergiram, e o jogo roda sob autoridade
do servidor normalmente desde entao — todas as levas seguintes (5.x em diante, e a leva de
combate no fim deste arquivo) ja foram verificadas ao vivo contra o banco real. Texto original
da epoca, so pra contexto historico de como o bloqueio se parecia:

### BLOQUEIO (histórico — já resolvido): o banco remoto estava 31 migrations a frente de TODA branch deste repo

`supabase db push` recusava. As 31 (`20260811*`, `20260812*`, `20260813*`) nao existiam em `main`, nem
em `feat/dados-ultra-sun`, nem no worktree — eram um schema `dev` inteiro (36 tabelas, espelho do
`public`) mais uma camada de RPC (`rpc_batch1..3`, mercado, ranking, chat) aplicada de fora deste
repositorio.

`public.game_sessions` e `public.players` conferiam com o que esta branch esperava, entao
`supabase/migrations/20260814120000_faixas_e_gate_do_lance.sql` estava correto — faltava decidir onde
ele rodava e se o schema `dev` precisava do mesmo.

## Leva de combate (2026-08-16): dois bugs reais do Lance, documentacao retroativa de um sistema
inteiro, e limpeza geral do CLAUDE.md/docs/

Trabalho em tres partes: (1) dois bugs reportados pelo usuario na luta do Campeao Lance, achados
e corrigidos com prova ao vivo; (2) documentacao — Wiki in-game (2 abas novas) + auditoria e
reescrita de `CLAUDE.md`/`docs/`, pedida explicitamente pelo usuario depois que o item (1)
revelou o tamanho da lacuna.

### Os dois bugs do Lance

1. **CAS de `gravarEstado` descartava a janela inteira do flush.** `server/src/progresso.ts`
   grava o snapshot do jogador com um CAS otimista em `players.updated_at`; qualquer escrita
   concorrente na mesma linha (config de auto, comprar, vender — RPC direto, sem nocao do flush
   em andamento) derrubava esse CAS com 409, e a janela inteira (ouro, XP, e o
   `sequenceIndex`/`sequenceCleared` do Lance, que so persistem nesse mesmo golpe de escrita) era
   jogada fora. Pior: o cliente tratava QUALQUER 409 de `/sessao/flush` como "sessao sumiu",
   parando o timer e avisando o jogador que a cacada acabou. Fix: `comRetryDeColisao` (retry ate
   3x nesse 409 especifico) + o cliente so encerra a sessao na mensagem exata "nenhuma sessao
   aberta". Verificado ao vivo contra a Edge publicada disparando escritas concorrentes de
   proposito: 8/8 flushes sobreviveram (era uma fracao real de 409 antes do fix).
2. **`game_sessions.poke_uid` so gravava na abertura da sessao.** `autoSwitchTeamOnFaint` troca
   `world.player.poke` DENTRO da simulacao (POKE do Lance cai, proximo da equipe entra) — mas a
   janela SEGUINTE reconstruia o mundo com o `poke_uid` da ABERTURA, congelado, ignorando quem
   realmente estava em campo. Como a luta raramente cabe numa janela de 30s, a proxima janela
   comecava com um POKE ja desmaiado — sessao encerrada por "desmaio sem revive" com o resto da
   equipe intacta e viva (o sintoma relatado: "morre um POKE, volta pro Hospital mesmo com outros
   de vida cheia"), e a sequencia nunca fechava (o outro sintoma: "derrotar o Lance nao libera
   nada"). Fix: grava `world.player.poke.uid` (quem estava DE FATO em campo) junto com
   `sequenceIndex`/`sequenceCleared` a cada janela. Reproduzido com o time REAL salvo de um
   jogador (headless, dado do Postgres) antes do fix — travava exatamente como reportado; depois
   do fix, fecha a sequencia normalmente. Teste novo em `lance.test.ts` tranca o padrao de
   reconstrucao por janela com troca de POKE de verdade (os testes antigos so cobriam simulacao
   continua OU janela sem troca — nunca as duas juntas, e foi exatamente esse buraco que deixou o
   bug passar).

Os dois exigiram `npm run build:engine` + `npm run edge:publicar` (mudam o motor/servidor que
roda em producao).

### Wiki in-game: duas abas novas, dado real puxado ao vivo

Pedido do usuario: documentar pro JOGADOR como status e combate funcionam.
`src/features/wiki/WikiMenu.tsx` ganhou:

- **Aba "Status"**: os 6 status reais (Envenenado/Queimado/Paralisado/Dormindo/Congelado/
  Confuso), efeito/duracao/dano-por-turno/imunidade/cura de cada um, lidos AO VIVO de
  `data/statusEffects.ts` + `data/generated/status.generated.ts` (Gen VII, conferido na
  Bulbapedia) — zero numero hardcoded.
- **Aba "Combate"**: pipeline inteiro (sem turnos/sem prioridade, IA de escolha de golpe,
  acerto/erro, calculo de dano passo a passo, Traits, Clima, Escudos, Protect/Endure/Destiny
  Bond, efeitos continuos, golpes que travam o oponente, dano fixo/variavel, hazards). STAB/
  critico/velocidade de referencia/cooldown do Ataque Basico vem do MESMO `formulaEngine` que o
  combate real usa.

**Achado escrevendo a Wiki, nao lendo codigo:** a primeira versao da aba Combate tinha varios
nomes de golpe "traduzidos no chute" pro portugues (ex.: "Encanto da Sorte" pra Lucky Chant, que
o catalogo real chama de outro jeito) — mesmo erro que a regra do projeto existe pra evitar.
Trocados por `getAbility(id)?.name` real antes de publicar; verificado ao vivo que nenhum golpe
citado caiu no fallback (nome cru do id, que teria denunciado um id errado).

### Auditoria de `CLAUDE.md`/`docs/`: um sistema inteiro sem registro nenhum

Pesquisa de base pro pipeline de dano/traits/clima/etc. (agente de exploracao, cada mecanica
com citacao de arquivo:linha) revelou que **nada** disso estava documentado — nem aqui, nem em
`docs/`. `docs/03-motor-de-simulacao.md` e a propria linha "Fora de escopo" no topo deste
arquivo ainda afirmavam que status/estagio de atributo/dano fixo/mecanicas tipo-recoil nao
existiam — 4 copias da mesma alegacao agora errada, espalhadas por `CLAUDE.md`,
`docs/03-motor-de-simulacao.md`, `docs/09-interface.md` e `docs/12-decisoes-descartadas.md`,
todas corrigidas nesta rodada com a mesma redacao (status/estagio/dano-fixo/recoil SAIRAM da
lista; prioridade/multi-hit/OHKO/pesca/PP-consumivel continuam fora). `docs/13-divergencias-
conhecidas.md` ganhou uma entrada nova pra essa classe de achado ("sistema inteiro faltando",
distinta de "constante com valor errado").

### Limpeza geral, pedida explicitamente pelo usuario

`CLAUDE.md` **nao esta no git** (`.gitignore`) — antes de qualquer edicao grande, backup manual
em `CLAUDE.md.backup-2026-08-16` (nao versionado tambem, so nesta maquina; existe caso algum
corte desta rodada precise ser revertido).

Removido/reescrito, por ser codigo/arquivo que **nao existe mais no repositorio** (o jogo
vanilla foi cortado — ver `docs/01-arquitetura.md#o-que-foi-cortado`):

- **"Balanceamento de economia" e "Visual/HUD (pokedream.com.br)"**: descreviam
  `EconomySystem.js`/`ProgressionSystem.js`/`main.js`/`Sprites.js`/`UIManager.js`/`index.html`
  — nenhum existe mais. Os valores tambem estavam errados havia tempo (ver `docs/13`).
  Substituidos por um ponteiro pra `docs/02-dados-e-catalogo.md` (tabela de knobs viva, por
  simbolo) e uma nota honesta: as DECISOES de visual sobreviveram a migracao pra React
  (conferido no codigo: `strokeText` em `render/sprites.ts`, `LevelUpSplash.tsx`, emoji de ouro e
  prefixo de shiny em `engine/simulation.ts`/`controller.ts`) mas nao tem reescrita com o porque
  nos arquivos atuais — lacuna real, registrada, nao fechada nesta rodada.
- **"Gotchas conhecidos"**: tirado o gotcha de reset de save via `window.__game`/`main.js`
  (mecanismo vanilla que nao existe mais) e a linha final errada ("main = jogo vanilla, corte
  nao feito" — o corte foi feito ha varias levas). Os gotchas de PostgREST/numeric-string/
  segundo-modulo-React ficaram, ainda validos.
- **"Comandos"**: reescrito do zero contra `package.json#scripts` real. A versao antiga mandava
  `cd web && npm run dev` (o app e a raiz desde o commit `70d5561`) e `node server.js` (vanilla,
  removido); nenhum comando novo (`usum:*`, `subbiomas:*`, `tiers:gerar`, `build:engine`,
  `build:edge`, `edge:verificar`, `db:wipe`) estava listado.
- **BLOQUEIO das 31 migrations** (leva anterior): marcado como resolvido — o schema convergiu ha
  varias levas, mantido so o texto original riscado pra contexto historico de como o bloqueio se
  parecia.

**O que NAO foi tocado, de proposito:** a tabela de "Estado atual" (especies/sprites/import de
arte, ~150 linhas perto do topo) e a maior parte das 40+ secoes de leva individual. Auditar cada
uma contra o codigo atual — a mesma disciplina aplicada aqui — e um trabalho bem maior que esta
rodada, e cortar sem essa verificacao arriscaria apagar gotcha que ainda e valido. Feito: as
duas secoes inteiras confirmadas 100% vanilla, a lista "fora de escopo" (4 copias), o bloqueio
resolvido, e os 5 valores que `docs/13` ja tinha levantado como divergentes.

**Pendencia sinalizada nesta leva, corrigida na sequencia (mesma sessao)**:
`data/moveDescriptions.ts#AVISO_SEM_DANO` avisava em TODO golpe de potencia 0 como se nada dele
funcionasse aqui — falso pra dezenas de golpes desde a leva de combate (Taunt, Leech Seed,
Protect, Thunder Wave, ...). `golpeTemEfeitoReal` (`data/moveDescriptions.ts`, novo) decide caso
a caso: efeito DADO no proprio golpe (`status`/`statChanges`/`hazard`/`healPercent`/
`drainPercent`, que o motor le sem saber o id) ou HARDCODED por id
(`GOLPES_COM_EFEITO_HARDCODED`/`GOLPES_DE_ESCUDO`/`CLIMA_DO_GOLPE` — as duas primeiras exportadas
e testadas, com comentario apontando pro `combatSystem.ts#golpeDeApoioUtil`/switch "GOLPES DE
SUPORTE SEM DANO" que cada id espelha, pra nao virar uma segunda lista que desalinha sozinha).
Aviso so acende agora nos golpes GENUINAMENTE inertes (Splash, Transform, Sleep Talk, Rage
Powder, Quick Guard). `AbilityTooltip.tsx` trocou `semDano = power<=0` por
`semDano = power<=0 && !golpeTemEfeitoReal(ability)`; comentarios stale no proprio arquivo e em
`data/abilities.ts` corrigidos junto. 5 testes novos em `moveDescriptions.test.ts` (toda chave
das listas hardcoded existe no catalogo — pega typo/renomeacao; amostras dos dois lados
confirmadas). Verificado ao vivo: perfil do Charmander, golpe Scary Face (statChanges) e Growl
(statChanges) SEM o aviso — antes desta correcao apareceria nos dois.

### Verificacao

`tsc -b`/`oxlint`/`vitest` limpos nos dois bugs do Lance (353 + 28 testes), na Wiki (353, sem
teste novo — conteudo estatico) e no fix do AVISO_SEM_DANO (358, +5 testes). Wiki verificada ao
vivo no navegador (conta de teste, servidor local): as duas abas renderizam, zero erro de
console, nenhum nome de golpe/trait caiu no fallback de id cru. AVISO_SEM_DANO tambem verificado
ao vivo (perfil do Charmander, aba Golpes, hover em Scary Face/Growl). Os dois fixes do Lance,
deploy feito (`edge:publicar`) e push na main — o fix do AVISO_SEM_DANO e 100% cliente
(componente React + dado, sem tocar `src/engine/`), sem precisar de rebuild do motor/redeploy da
Edge Function. A limpeza de documentacao nao mexeu em codigo — sem verificacao de build alem do que os
outros dois itens ja cobriram.

## Leva de 2026-08-17: sala com contagem regressiva, bug real de 3 rodadas na pokebola, auditoria completa de docs/

Cascata de 4 pedidos originais (sprite de pokebola, wall-block pintado por sub-bioma, AOE=raio
de agressao, cone de spawn), seguida por 3 rodadas de bugfix ao vivo na animacao de captura
(cada uma motivada por print real do usuario, nao suposicao), e fechada com auditoria completa
de `docs/` a pedido explicito.

### Sub-bioma ganha wall-block pintado a mao (17 referencias novas + a que ja existia)

`scripts/build-sub-bioma-collision.js` reescrito pra ler pintura lilas/rosa como "unico lugar
andavel" (`modo: 'rosa_anda'`), oposto da convencao antiga (`vermelho_bloqueia`, so
`abismo.png`) — os dois modos coexistem por campo `modo` no manifesto, pra nao arriscar quebrar
a referencia ja testada so por unificar convencao. Referencias saem de
`scripts/body-block-refs/` (nao `assets/`) de proposito: 111MB de imagem-guia que
`scripts/copiar-assets.mjs` copiaria pra `dist/` sem uso nenhum em runtime.

`maps.ts#mapDefParaSala` troca a grade pela do sub-bioma da SALA atual, nao da hunt inteira —
sub-bioma muda varias vezes dentro da mesma hunt agora. `colisaoDefineLimite: true`: o
retangulo inteiro da grade e o limite real (raio de `mapWalkRadius` cresce pra nunca cortar a
pintura), e fora da grade conta como bloqueado (nao o comportamento leniente das grades
antigas). Dois bugs achados por investigacao propria antes de publicar: hunt inicial
(`route_46`, fora do sistema de salas) nao tinha wall-block nenhum ate ganhar fallback
explicito reusando a grade de `forest`; e o `playerSpawn` fixo `(700,450)` caia em celula
bloqueada nessa mesma grade — corrigido com snap pro ponto andavel mais perto
(`nearestOpenPoint`) na construcao do mundo.

### AOE = raio de agressao selvagem

`data/huntTypes.ts#WILD_AGGRO_RADIUS = 175` extraido como fonte compartilhada;
`abilities.ts#AOE_RADIUS = WILD_AGGRO_RADIUS`. Os 3 pontos que constroem `HuntEncounter`
continuam com o literal `175` hardcoded (documentado, nao importam a constante) — ela existe
so pra golpe AOE nao reescrever o mesmo numero magico uma 4a vez.

### Spawn em cone de visao, media distancia

`engine/simulation.ts#randomSpawnPoint`: sorteia angulo dentro de `±SPAWN_CONE_HALF_ANGLE`
(~55°) a partir de `player.facing`, distancia entre `SPAWN_CONE_MIN_DISTANCE` (250) e
`SPAWN_CONE_MAX_DISTANCE` (550). Fallback pro sorteio antigo (raio do mapa inteiro) se
`SPAWN_POINT_MAX_ATTEMPTS` tentativas nao acharem celula livre — corredor de body-block
estreito demais pro cone nao pode significar "nunca spawna nada".

### Sala vira transicao com contagem regressiva, nao troca instantanea

Redesenho pedido: ao fechar a quota de abates, a sala NAO troca na hora — `registrarAbate`
sorteia a proxima sala de imediato (RNG resolvido, pool/loot decididos) e arma
`world.salaCountdownRemaining = SALA_TRANSITION_COUNTDOWN` (3s), sem tocar em `world.sala`
ainda. `stepWorld` congela movimento/combate enquanto conta, mesmo padrao do
`countdownRemaining` de intro do Lance, so disparado no MEIO da hunt. Ao zerar,
`aplicarTransicaoDeSala` troca `world.sala`, reavalia `mapDefParaSala` e ZERA
`enemies`/`effects`/`pendingHits` — "area nova do zero" e literal, nao mais um filtro do que
sobrou da sala anterior (bug do desenho antigo: inimigo de `maxEnemies>1` sobrevivia com
especie fora do pool novo ate morrer sozinho). `SalaCountdownModal` (componente novo) cobre o
campo com "Entrando em nova area..." + 3-2-1 durante a espera. `ABATES_POR_SALA` 12 -> 30.

`salas.test.ts` ganhou teste dedicado ao novo mecanismo (congela tick pequeno, aplica em tick
grande, spawn fresco so da sala nova) — os testes antigos de quota/ciclo precisaram de um
helper que resolve a transicao na hora (`aplicarTransicaoDeSala` direto) pra continuar testando
so a matematica de quota sem reimplementar o motor de tempo.

### O bug real de tres rodadas na animacao de pokebola — cada rodada motivada por print, nao suposicao

Sessao anterior tinha trocado o pacote de sprite de pokebola e "consertado" a leitura da grade
com um palpite (`col = row % 3`) que parecia coerente em screenshot estatico mas nunca tinha
sido visto rodando — Browser pane sem compositing de screenshot nesta maquina, limitacao de
ambiente confirmada 2x, nao de codigo. Usuario reportou visualmente 3 vezes seguidas, cada
report motivando uma investigacao pixel-a-pixel nova:

1. **"bola fica duplicada"** (print: dois circulos vermelhos separados). Causa real, achada por
   deteccao de componentes conexos + overlay de grade: cada bola do sheet fica CENTRADA NA
   COSTURA entre blocos de 64px (x=0,64,128...448), nao dentro do bloco. Recorte alinhado ao
   bloco (`[col*64, col*64+64)`) pegava metade direita da bola de uma costura + metade esquerda
   da proxima — duas meia-bolas no mesmo frame. Corrigido deslocando o recorte -32px pra
   centralizar na costura, trocando a unica costura sem metade esquerda (x=0, fora do PNG) pela
   equivalente x=192 (mesma fase mod 3). `captureAnim.ts#captureAnimFrameRect`.
2. **Metadados reais do object-builder do usuario** (effect 730/731: 60 frames reais @100ms pro
   sucesso, 44 pra falha) contradiziam nosso `CAPTURE_ANIM_FRAME_DURATION=0.07s`: nossa planilha
   so tem 23/17 linhas (amostra reduzida das 60/44 reais), entao pra bater a duracao TOTAL cada
   linha precisava segurar ~260ms, nao 70ms — as duas contas (6000/23 e 4400/17) batem entre si
   a ~1%, calculadas independente. Corrigido so pra `premier_ball` (`CAPTURE_ANIM_FRAME_DURATION_BY_BALL`),
   por pedido explicito de testar 1 bola antes de aplicar nas 4. `simulation.ts` precisou do
   mesmo valor no calculo de duracao do `WorldEffect`, senao o efeito seria podado antes da
   animacao mais lenta terminar.
3. **"deu pra perceber a mudanca de velocidade, mas agora esta so metade"**. Nova simulacao
   pixel-a-pixel (recorte exato 40x20 que o canvas desenharia) continuou mostrando bola inteira
   em toda linha — geometria e timing ja verificados 2x nao eram a causa. Sobrou uma variavel
   nunca testada num navegador real: `drawImage` reduz o frame de 64px pra 40px, fator NAO
   INTEIRO (1.6x); `imageSmoothingEnabled=false` so garante qualidade de AMPLIACAO, minificacao
   nao-inteira nao e especificada como point-sampling puro em todo motor/GPU. Trocado
   `CAPTURE_ANIM_DRAW_WIDTH` 40 -> 32 (divisor inteiro exato de 64, reducao 2:1 trivial em
   qualquer motor). Reportado como hipotese, nao certeza — sem screenshot nesta sessao pra
   confirmar por mim mesmo; usuario nao voltou a reportar erro depois desse terceiro fix.

Cada rodada: commit proprio, push, confirmacao do bundle publicado via `curl` + grep no JS
minificado da Cloudflare Pages (nao so "npm run build passou") antes de reportar concluido.

### Interrupcao no meio: outage do Supabase, nao-causada por esta sessao

Entre a leva de sala/spawn e a leva de pokebola, o banco ficou inalcancavel (503
`PGRST002`/timeout puro) por esgotamento de recurso do projeto Supabase (aviso confirmado no
painel: "consumindo muitos recursos"), coincidencia de tempo com um deploy desta sessao mas SEM
relacao de causa (mudancas eram spawn/colisao/render, sem query nova nem carga extra
relevante). Resolveu sozinho (~40min depois, confirmado por `curl` direto ao PostgREST antes de
retomar). Registrado pra nao virar suspeita errada numa sessao futura.

### Auditoria completa de `docs/` (pedido explicito) — 2 achados graves, 4 menores

4 agentes de leitura em paralelo, cada um conferindo um subconjunto de `docs/*.md` (13
arquivos) inteiro contra o codigo real, nao contra a versao anterior do proprio documento.
Todo achado reverificado por mim antes de aceitar — um deles (docs/05, "conta nova
desatualizada, 500/500/50 deveria ser 100/100/10") era FALSO: o agente leu um estagio
intermediario no meio de uma cadeia de `create or replace function` no `dev-schema-clone.sql`
(ha 3 versoes da mesma funcao ao longo do historico de migrations), nao a ultima. Conferir a
ULTIMA definicao, nao a primeira que bate, evitou introduzir um erro novo corrigindo um que nao
existia.

- **`docs/06` (reescrito nesta sessao, antes da auditoria formal)**: descrevia por inteiro a
  arquitetura de hunts "1 tipo elemental = 1 bioma x 9 zonas x regiao" que o proprio
  `data/biomas.ts` diz no topo ter SUBSTITUIDO pelo sistema atual (12 biomas x 3 faixas x 10
  salas). Bounds errado (2800x1800 citado, real 1400x900); camada de regiao que nao separa
  hunt nenhuma ha uma leva inteira.
- **`docs/02` (grave)**: "a fonte de verdade e o Postgres" — trocou pra PokeAPI/Ultra Sun (Gen
  VII) ha uma leva inteira (`leva 6.0` deste arquivo). Os 3 geradores antigos (planilha,
  Postgres, diff byte-a-byte) estao BLOQUEADOS (`scripts/lib/guarda-catalogo-gen2.js`,
  `PERMITIR_CATALOGO_GEN2=1`), nao deletados — documentacao antiga teria levado alguem a
  reverter o catalogo em silencio rodando `npm run catalog:gerar`.
- **`docs/04` e `docs/08` (graves, mesma causa raiz)**: `server/src/app.ts`, `acoes.ts`,
  `mercado.ts`, `social.ts`, `reiniciar.ts`, `node.ts` — a autoridade HTTP inteira que os dois
  documentos descreviam — foram DELETADOS numa migracao "RPC-everything" (2026-08-11 a
  2026-08-16, ~50 migrations, aparentemente feita numa sessao/branch paralela nunca
  documentada). Compra/venda/evolucao/mercado/chat/correio/ranking/reset viraram ~20 funcoes
  `security definer` do Postgres, cliente chama `supabase.rpc(...)` direto — identidade sempre
  `auth.uid()` dentro da funcao, nunca parametro. So a sessao de hunt (4 rotas: abrir/flush/
  fechar/estado) continua HTTP, porque so ela precisa rodar `stepWorld` (motor real, nao roda
  em `plpgsql`). Reescritos os dois: logica/invariantes de negocio (escrow, claim atomico de
  entrega, `location='market'`, etc.) sobrevivem identicos, so nome de arquivo/funcao trocou.
  RLS de escrita nas 5 tabelas de jogador CONTINUA fechada pro cliente — o que mudou e que
  agora ha DOIS escritores legitimos (`service_role` da sessao, e funcao RPC `security
  definer`), nao mais so um.
- **Menores, corrigidos**: `docs/03` (conta de Traits com mecanica nao fechava, 39+10≠53, real
  43 — faltavam 7 traits de imunidade a status na enumeracao); `docs/05` (`XP_GLOBAL_MULTIPLIER`
  0.14->0.10 real, ligado a `EXP_GAIN` ter virado formula escalada de Gen VII; 13->19 itens
  reais, faltava a categoria `status_heal`; `AUTO_ACTION_COOLDOWN` citado nao existe, e
  `COOLDOWN_DO_TREINADOR=1.5`; 11->12 hunts BOSS, faltava contar o Campeao Lance); `docs/01`
  (README "cd web" citado como pendente ja tinha sido corrigido); `docs/10` (contagem de
  `hunts.test.ts` 23->25, `salas.test.ts` novo catalogado). `docs/07` ganhou aviso no topo:
  `FARM_OFFLINE_PAUSADO=true` esta ATIVO em producao agora (pedido explicito do usuario,
  chave temporaria) — nao e erro de documentacao, e estado operacional que nao existia quando
  os outros docs foram escritos. `docs/09`/`docs/12` conferem sem achado.

`docs/13` ganhou o registro consolidado de toda a rodada, no mesmo formato ja estabelecido la
(tabela com severidade + o que estava errado).

### Verificacao

Sala/wall-block/spawn-cone/AOE: `tsc -b`/`oxlint`/`vitest` limpos (364 testes cliente + 28
servidor), `build`/`build:engine` OK, edge redeployada (mudanca alcanca o motor compartilhado).
Pokebola: mesma bateria de testes a cada rodada (geometria/timing/render nao tocam
`src/engine/`, so cliente — sem redeploy de edge necessario nas 3 rodadas), bundle publicado
conferido via grep no JS minificado apos cada deploy, nao so "o build passou". Docs: nenhuma
mudanca de codigo, sem verificacao de build alem da leitura cruzada linha a linha contra as
fontes reais citadas em cada correcao.


## 2026-08-18 — v7.6: Habilidade/Natureza/Caracteristica, e o bug de "a vida vazia que nao morre"

Cinco pedidos numa leva. Os dois primeiros achados sao o que vale reler.

### 1. O bug relatado ("Typhlosion nao mata Kangaskhan") NAO era dano — era ENDURE

A primeira hipotese — e a errada — foi raridade. Medido: um Kangaskhan RARO de mesmo nivel de fato
ganha de um Typhlosion Nv60 comum, e um MYTHIC Nv60 mata um Typhlosion Nv90 (multiplicador de 3x
nos SEIS atributos). Numero real, mas nao era o sintoma descrito: *"ficava com a vida vazia e o
typhlosion batendo nele por muitos minutos sem que ele morresse"*.

**Kangaskhan leva Endure no kit selvagem a partir do Nv50.** Endure recarrega em 4s (PP 10, e
neste jogo PP e a base do cooldown) e o POKE do jogador ataca a cada ~2-3s: o hit que mataria caia
em cima da flag quase toda vez. Vida vazia (1 HP) e nao morre — literalmente o relato.

**A regra que fecha isso nos jogos NAO e o PP — e a falha por USO CONSECUTIVO** (Gen V+): cada uso
seguido de Protect/Detect/Endure tem metade da chance do anterior, e usar outro golpe zera a
conta. Implementada em `combatSystem.ts#chanceDeProtecao`. Kangaskhan Nv60 caiu de "minutos" pra
**25,3s**.

Assimetria deliberada no modo pessimista (farm offline): a protecao do JOGADOR sempre falha, a do
INIMIGO sempre pega. "Pessimista" e sempre-pior-pro-jogador, e zerar os dois lados faria o farm
offline render MELHOR que a mesma luta ao vivo.

### 1b. O caminho errado que quase entrou: cap de PP

Antes de achar o Endure, uma varredura das 87 hunts com o jogador IMORTAL apontou golpe de CURA
como causa:

    ty40 vs noctowl60: hp0=194  MORREU=false em 600s | curou 112x (+7.946 hp)

Virou um cap de `ability.pp` usos por batalha pra cura e protecao. **Revertido no mesmo dia, a
pedido do usuario, e ele estava certo**: PP neste jogo e a BASE DO COOLDOWN e nada mais — um golpe
de 5 PP ja recarrega em 8s por causa disso, e contar usos daria um segundo significado ao mesmo
campo.

O numero que fecha o assunto veio de refazer a medicao com o jogador **MORTAL**, que e o jogo de
verdade:

    ty40 vs noctowl60  JOGADOR CAIU em  9s
    ty50 vs noctowl60  JOGADOR CAIU em  9s
    ty55 vs noctowl60  inimigo caiu em 15s
    ty60 vs noctowl60  inimigo caiu em  9s

Nao existe faixa de nivel em que a luta nao termine. **O travamento de cura era artefato do
ARNES** — jogador imortal e a unica situacao em que uma cura de 50% a cada 8s nunca perde a
corrida. Licao registrada no cabecalho de `batalhaTermina.test.ts`, junto com o mesmo defeito na
lista de Gengar/Haunter (dreno se alimentando do alvo imortal).

### 2. Doze golpes ocupavam slot e nunca disparavam

`pickAbilityDaFila` decidia "isto e golpe de status" por `ability.power === 0`. Os 12 golpes de
`DANO_SEM_PODER_BASE` (Flail, Reversal, Seismic Toss, Night Shade, Dragon Rage, Super Fang,
Psywave, Magnitude, Present, Hidden Power, Counter, Mirror Coat) tem `power` 0 no catalogo — o dano
deles nasce em `specialDamageFor`. Caiam na perna de status, nao tinham `status` nem valiam como
apoio, e o `continue` os pulava PARA SEMPRE.

`activeAbilitiesPadrao` usa `isDamagingAbility`, que os ACEITA — entao o Magikarp Nv30+ recebia
Flail num dos 4 slots, o HUD mostrava o slot cheio, e o golpe nunca saia. Era o "magikarp nao causa
dano" do pedido 4.

O mesmo `power === 0` estava decidindo VFX: Flail e Seismic Toss desenhavam efeito de status.

### 3. IV: a regra geral ja estava certa

Conferido contra o Ultra Sun. Selvagem comum: 6 sorteios uniformes independentes em 0..31 — era
exatamente o que `rollIvs` fazia. Faltava a garantia de **3 IVs perfeitos em lendario/mitico**
(mesma regra de Ultra Beast e Totem naqueles jogos), implementada com Fisher-Yates parcial pra os
tres serem DISTINTOS.

Fora, com motivo: cadeia de SOS (exige o inimigo chamar reforco) e criacao (exige criadouro).

### 4. Kit automatico ranqueava por poder cru

`danoEfetivo` (que monta os 4 slots) so olhava `power * STAB`, enquanto `danoEsperado` (a IA de
combate) ja descontava precisao ha levas. Typhlosion Nv70 nascia com Inferno (50% de precisao,
cooldown 8s) e Double-Edge (-33% de recuo, sem STAB) na frente de Lava Plume. Passou a contar
precisao e recuo: duelo contra Kangaskhan de mesmo nivel terminava com 51/203 de HP, agora termina
com 129/203.

### 5. Habilidades: a atribuicao hand-authored estava errada, nao so incompleta

`traits.ts` era `speciesId -> 1 trait` escrita a olho. Alem de 76 das 226 especies sem habilidade,
tinha atribuicao INVENTADA: Gengar com `levitate`, que ele perdeu de verdade na Gen VII (no Ultra
Sun so tem Cursed Body).

Agora vem do dado: `pokemon.abilities` da PokeAPI entra no `catalog.json` e vira
`generated/traits.generated.ts` (catalogo de 133 + atribuicao por especie, slots normais e oculta).
Cada POKE sorteia a dele no nascimento.

**Caveat da fonte, dito em voz alta no gerador**: `pokemon.abilities` da PokeAPI NAO tem
`past_values` como `move` tem — devolve a atribuicao ATUAL. Pro elenco 1-251 a diferenca e nula ou
minima; se o elenco crescer pra Gen VIII+, conferir na Bulbapedia antes de confiar.

**102 das 133 tem efeito mecanico.** As 31 restantes estao em `docs/14-habilidades.md` com o motivo
ESTRUTURAL de cada uma (nao ha troca de POKE, item equipado, aliado em campo, ordem de turno, PP
gasto, fuga). A ficha do POKE mostra o motivo ao jogador — mostrar a descricao real de uma
habilidade que o motor ignora seria a ficha mentindo.

**A porta unica que essa leva criou**: `combatSystem.ts#traitsDoConfronto`. Neutralizing Gas e Mold
Breaker DESLIGAM outras habilidades, e as duas precisam ser consultadas antes de qualquer leitura
de trait. O primeiro bug dessa natureza apareceu na hora: Mold Breaker atravessava tudo MENOS a
imunidade de tipo, porque `resolverImunidadeDeTipo` lia `traitDoPoke` direto.

**Trace obrigou um backup.** Ela grava em `poke.trait` (todo o motor le de la), e o POKE do jogador
e GRAVADO no banco pelo snapshot da sessao. Sem `WorldEntity#traitOriginal`, um Porygon que
copiasse Intimidate sairia da hunt sendo um Porygon com Intimidate, permanentemente.

### 6. Natureza e Caracteristica

Natureza: 25, +10%/-10%, HP nunca afetado. Entra em `computeStatsAtLevel` ANTES de shiny e
raridade, que sao invencao deste jogo.

**Backfill NEUTRO de proposito.** Sortear natureza real pros POKE que ja existiam mudaria o time de
todo jogador pra pior em metade dos casos, sem explicacao no jogo.

**E o backfill quase foi desfeito sozinho.** Testando em localhost, a ficha do Entei da conta de
teste mostrava "Natureza —" com o banco tendo `hardy`. Causa: `pokeToRow` grava o snapshot INTEIRO,
entao um POKE carregado com `nature: undefined` GRAVA `null` no flush seguinte, e o backfill morre
na primeira cacada. Corrigido resolvendo `null` na LEITURA
(`playerMapper.ts#naturezaNeutraEstavel`). Vale pra todo campo novo por-POKE.

Caracteristica: derivada dos IVs, sem coluna. Unico desvio: o desempate entre IVs iguais usa
`STAT_ORDER` no lugar do Personality Value, que este jogo nao tem.

### 7. VFX de area (o "eruption com sprite ruim")

Golpe de area desenhava a MESMA tira do alvo-unico, esticada pro diametro do splash. A
justificativa antiga ("a leitura de area vem do tamanho") vale pras tiras RADIAIS e quebra nas 4
DIRECIONAIS: a do FIRE e um jato de 2,30x medido, e Eruption saia como um lanca-chamas deitado.

13 tipos ganharam tira de AREA propria (`TIRA_AOE_POR_ELEMENTO`), julgadas sobre fundo escuro no
tamanho de jogo. FIGHTING, ROCK, GHOST e STEEL ficaram de fora: o candidato de FIGHTING lia como
GRASS, o de ROCK sumia, e os dois de STEEL sao feixes horizontais. Um candidato de FIRE foi
rejeitado por ser um KANJI.

### Verificacao

`tsc -b` e `vitest` limpos (519 testes, 54 arquivos — 49 novos nesta leva), `build`,
`build:engine` e a migration `20260818140000/140100` aplicada com `db push`. Conferido ao vivo em
`localhost` com a conta de teste: ficha do POKE mostrando os tres tracos, e a tira de area de FIRE
desenhando em combate real.

**Pendente de publicacao**: `edge:publicar` e push da `main`. Enquanto a Edge Function nao for
republicada a natureza nao aparece na tela — o cliente le o estado de `/estado`, que roda o bundle
ANTIGO do `playerMapper`.

### 8. Correcao de rota do usuario: PP NAO e recurso, e o cap foi revertido

Pedido literal: *"Nao temos pp no jogo, o pp serve para ter uma base para o tempo de recarga do
golpe."* Estava certo, e a reversao expos um erro de METODO meu, nao so de codigo: a medicao que
justificava o cap (Noctowl imortalizando a luta) rodava com o jogador IMORTAL. Refeita com jogador
mortal, nao existe faixa de nivel em que a luta nao termine.

O travamento real era Endure, e a regra que o fecha e a falha por uso consecutivo — que ja e a
regra dos jogos e nao encosta em PP.

### 9. Tres melhorias de tela pedidas na mesma leva

- **Pokedex**: linha evolutiva com o NIVEL de cada passo e a condicao completa das 9 especies de
  Nivel 80 + pedra (regra que existia no motor e nao aparecia em tela nenhuma); ficha com dex,
  BST, EXP base, curva, captura, regiao e habilidades possiveis; setas Anterior/Proximo dentro do
  card, percorrendo a lista JA FILTRADA.
- **Precisao do golpe** na tabela de moveset (ficha e Pokedex) e no tooltip, em amarelo abaixo de
  100%. Motivo mecanico: `combatSystem#danoEsperado` ja ranqueia por poder x precisao ha levas, e
  a tela pedia uma escolha que ela nao informava.
- **Recarga individual no HUD de golpes**. `segundosAtePoderUsar` devolve o MAIOR entre o cooldown
  do golpe e o turno global — correto pra decidir se o golpe sai, e errado pra exibir: os quatro
  slots mostravam o mesmo numero justamente quando o turno global mandava. Novo `cooldownProprio`
  (entity.ts) e `cooldownTotalDoGolpe` (combatSystem.ts, ja escalado pela Velocidade efetiva, com
  clima) alimentam o numero e a cortina de recarga. Conferido ao vivo: os slots passaram de
  "1.3s | 1.3s | 1.3s | 1.3s" para "0.4s | 1.3s | 1.3s | 1.3s".


---

## HUD mobile-first (branch `feat/hud-mobile`, 2026-08-18)

Pedido: converter a HUD para celular, "minimalismo, eficiencia e praticidade, design black glass".
Trabalho em branch, sem tocar a `main`.

### O diagnostico, com numero

Medido em 390x844 antes de mexer: os cards do topo somavam ~450px de largura numa tela de 374px
uteis — o card do treinador **cobria o HP do POKE**. O chat ocupava 264x336px sobre o campo de
batalha, o menu quebrava em duas fileiras de circulos, e o jogo visivel virava um buraco no meio.

Tres causas, e nenhuma delas era "faltou media query":

1. **Cinco ancoras independentes** nas bordas, cada uma se posicionando sozinha e negociando com as
   vizinhas por breakpoint.
2. **Breakpoint so por LARGURA.** Celular deitado (844x390) lia como desktop, com 390px de altura.
3. **`viewport-fit=cover` no `index.html` desde sempre e zero `env(safe-area-inset-*)` no CSS.**

### O desenho novo

Duas superficies permanentes: **trilho** (topo) e **doca** (rodape). Uma arvore so — o desktop e o
compacto com mais largura e mais rotulo, decisao explicita do usuario contra manter dois layouts.

Criterio do trilho: *o dado muda sozinho e o jogador olha sem ter pedido* (HP, XP, carteira). Local,
Pokedex e taxas ficam atras de um toque. Criterio da doca: cinco slots, porque o slot e caro (44px
mais rotulo legivel).

Painel vira **bottom sheet** que para ACIMA da doca — trocar de tela continua custando um toque.

### O que so se descobre medindo

- **A altura do sheet em `vh` estourava a tela pra cima.** `vh` mais rodape medido em px cobria o
  trilho e escondia a propria alca do sheet. Virou % do pai.
- **Deitado, o sheet dava 109px de conteudo** — um card e meio. La ele cobre o trilho e para em cima
  da barra de navegacao (medida a parte), e o cabecalho perde uma linha: 268px.
- **320px estourava o trilho**: o piso de 9em dos vitais mais os vizinhos fixos davam 324px numa
  caixa de 302px, e o avatar saia pela borda da TELA. Virou `min(9em, 34vw)`.
- **157 de 341 alvos da Loja e 75 de 75 da Mochila tinham menos de 40px.** O tamanho passou a vir
  por CSS a partir de uma classe estavel em cada primitivo (`jogo-botao`, `jogo-campo`...), e nao
  por prop: threading `coarse` por ~200 pontos de chamada e uma edicao que o proximo controle novo
  esqueceria.
- **`em` dentro de um `<input>` resolve contra o font-size do PROPRIO controle** (~11.5px, definido
  pelo navegador), nao contra a raiz. Por isso `1.4em` no checkbox virava 16px.
- **O teclado virtual ficava POR CIMA da doca**: a raiz e `h-svh overflow-hidden`, e `svh` nao
  encolhe quando o teclado abre. Passou a medir `innerHeight - visualViewport.height` com piso de
  120px (a barra de URL come ~60px, e um pinch tambem encolhe).

### O erro de metodo desta leva: A/B nao intercalado

Escrevi em codigo e em docs que `backdrop-filter` custa "uma recomposicao por quadro por camada",
como se fosse medido. Ao medir de verdade, dentro de uma hunt:

| Cenario | Com blur | Sem blur |
|---|---|---|
| Sem throttle | 16,76ms | 16,68ms (os dois no teto de 60fps) |
| CPU 4x, A/B intercalado 4 rodadas | 101,2ms | 101,5ms |

A primeira leitura, **sequencial**, deu +17ms pro blur. Intercalando, some: eram 17ms de deriva do
proprio jogo ficando mais pesado com mais inimigos em campo. A chave de desligar continua (e uma
classe CSS, e o custo e real em GPU movel fraca), mas sem numero inventado. **Lembrete: A/B nao
intercalado mede a deriva, nao o tratamento.**

### Informacao que so existia no hover

Varredura pelos `Tooltip`: no dedo nao existe hover, entao cada um era informacao que o jogador de
celular nunca via, sem nem sinal de que existia. O tooltip do GOLPE era a unica fonte de dano,
precisao, recarga e descricao. O `ItemTooltip` era o unico lugar que dizia quanto uma pocao cura. A
faixa de status so tinha o nome do efeito no `title`. Os tres ganharam sheet no toque.

O slot de golpe virou `button` tambem no desktop (como `div` nao existia pro teclado). Quem abre a
ficha no mouse e `event.detail === 0` — o clique vindo do teclado; senao o duplo clique que
liga/desliga o golpe abriria a ficha duas vezes no caminho.

### Texto do jogo descrevendo uma HUD que nao existe

Wiki e tutoriais citavam "botao flutuante no canto inferior direito" (Auto), "botoes +/- no canto
superior direito" (zoom) e "o circulo grande do meio do menu" (Hunt). Patch-notes NAO foram
tocados: eles registram o que a tela era naquela leva.

### Verificacao

`tsc -b`, `vitest` (532 testes) e `build` limpos. Conferido ao vivo em 320x568, 390x844, 844x390 e
1440x900 com a conta de teste: os 13 paineis sem overflow horizontal e sem alvo abaixo de 40px, a
troca de sala com o aviso de campo na faixa certa (70..678, doca em 770), o botao voltar fechando
painel em vez de sair do jogo, e o toque na enfermeira curando (43% da largura cura, 40% nao — o
alvo cresceu sem virar a tela inteira).

**Nao verificado**: teclado virtual em aparelho real (a metade CSS foi, com o inset forcado: a doca
sobe exatos 300px), custo do blur em GPU movel, e o modal de derrota (o Entei Lv100 da conta de
teste nao morre em hunt de Lv1-30).

### Doca de 8 slots fixos (mesma branch, mesmo dia)

Pedido do usuario: a barra de baixo passa a ter sempre Equipe, Mochila, Pokedex, Hunt, Loja,
Hospital, Mercado e Mais, com Hunt centralizado e de icone maior — e reduzir o que for
desnecessario na tela.

**O que nao da pra entregar, e por que:** Hunt centralizado no pixel. Sao 7 destinos alem dele,
numero impar; qualquer divisao da 3 de um lado e 4 do outro e o centro do slot do meio cai meio
slot a esquerda (medido: 18,4px em 390px). Compensar com grupos de larguras diferentes joga os 4
slots da direita para 38,7px em 390px e 31px em 320px — abaixo do minimo de toque. As unicas saidas
exatas seriam 6 ou 8 destinos alem do Hunt.

**O bug que 8 slots destaparam:** `.alvo-toque` traz `min-width: 44px`. Com 8 slots em 320px os
botoes somavam 384px numa barra de 304 — flex nao encolhe abaixo de um minimo em px, entao "Mais"
ficava 64px fora da tela, sem erro nenhum e sem barra de rolagem. Na doca o piso passou a ser so de
altura. O rotulo virou `min(.58em, 2.3vw)` pelo mesmo motivo: com 34px de largura util, "Hospital"
e "Mercado" truncavam.

**Corte no trilho:** o contador da Pokedex saiu (ganhou slot proprio e continua na gaveta) e, so no
compacto, o avatar do treinador — sem largura pro nome e pro nivel ele era um icone generico
gastando ~46px permanentes na faixa que ja tinha empurrado o proprio avatar pra fora em 320px. Na
gaveta ele aparece COM nome e nivel.

**Achado de passagem:** "Resetar" na gaveta estava cortado em "R" na borda direita — `block`
(`w-full`) num flex com outro botao, a mesma armadilha ja corrigida na Equipe e na Loja. Terceira
ocorrencia do mesmo padrao.

### Densidade dos menus (mesma branch)

Pedido: "dentro dos menus, quero que mais itens sejam vistos em uma tela".

Medido em 390x844 antes: Mochila com **5 linhas**, Loja com **3,5 itens**. Quatro causas, com
numero cada:

1. **O sheet parava acima do rodape INTEIRO** (179px), quando so a barra de navegacao (68px) e
   inegociavel. Os outros 111px sao barra de golpes, zoom, Auto e ticker — nada acionavel com uma
   lista aberta. Sheet de 586px -> 705px.
2. **O card da Loja tinha tres faixas** e a do meio usava 192px de 343: 150px de vidro vazio ao
   lado dos atalhos, com o botao de confirmar numa faixa propria logo abaixo. 148,5px -> 95,6px.
3. **A auto-venda era um bloco permanente no topo da Mochila** (46px + espaco) enquanto a fileira
   das abas ao lado usava 190px de 374. Virou chip na propria fileira das abas.
4. **Padding e espaco entre linhas**: `p-[.6em]`/`gap-[.45em]` -> `p-[.4em]`/`gap-[.3em]` nas
   listas longas. 71px -> 61px por linha da Mochila.

Resultado: Mochila 5 -> 8, Loja 3,5 -> 5,5, Pokedex 9,5 -> 11.

**O que 320px pegou e 390px nao pegaria:** juntar as duas faixas da Loja fazia o rotulo do botao
(75,8px) nao caber nos 73,9px que sobravam, e ele vazava CORTADO em vez de truncar — faltava
`min-w-0` no span dentro do botao flex. O campo de quantidade passou de `4.2em` pra `3.4em` (ainda
cabe "1000") e fechou a conta.

**Nenhum alvo de toque encolheu.** A densidade saiu de espaco morto; os 44px de altura continuam
em todo controle.

### Loja em duas colunas no celular (mesma branch)

Pedido: comprar e vender na mesma tela, em duas colunas.

O bloqueio real nao era o layout, era a largura: com duas colunas em 390px cada uma fica com
~170px, e ali NAO cabe campo de quantidade + `+10 +100 +1000` + botao de confirmar sem derrubar
todo alvo de toque abaixo do minimo. A saida foi trocar a forma da linha por largura de coluna: em
`compacto` a linha e so identidade (icone, nome, estoque, preco) e a transacao abre num sheet;
em `deitado` (coluna de ~470px) e no amplo, o card inteiro continua inline.

O sheet cobra um toque a mais por compra e devolve alvo de toque: inline o `+10` tem **27px** de
largura, no sheet passa dos 44px.

**O bug que so aparece interagindo:** trancar um item de DENTRO do sheet fechava o sheet. Trancar
manda o item pro fim da ordenacao — e possivelmente pra outra pagina — entao a linha que montava o
sheet desmontava e levava o sheet junto. A ficha passou a ser montada pelo `ItensTab`, irma do
grid. Regra que fica: **estado de painel aberto nao pode viver num componente cujo tempo de vida
depende de ordenacao ou paginacao.**

Dois acertos menores encontrados no caminho: `ItemIcon` devolvia `null` quando o item nao tem arte
(as varas), e a linha inteira comecava 31px a esquerda das vizinhas — virou um vazio do mesmo
tamanho, com `block` porque `<span>` inline ignora altura e largura. E os cabecalhos das duas
colunas ganharam `min-h` igual: o botao "Tudo" da venda e mais alto que um rotulo de texto e
empurrava a primeira linha daquela coluna pra baixo da vizinha.

Efeito colateral bom: sumiu o eixo "que lado" da Loja no celular. As abas voltaram a ser as mesmas
dos dois regimes — "Itens | Pokemons" — e o `ladoExterno`/`ladoLocal` do `ItensTab` deixou de
existir.


---

## 2026-08-19 — face do HUD viva, mira dos golpes e o sub-bioma que trocava sozinho

Branch `feat/hud-mobile`. Tres frentes, e as tres comecaram com um relato de "esta estranho" que
so virou diagnostico depois de medir.

### 1. "O face icon do cabecalho nao esta atualizando em tempo real"

**Nao reproduziu, e o numero e que fechou o assunto.** Amostrei o DOM do trilho de status durante
uma hunt de teste: HP 100% -> 97,5 -> 96,7 -> 95,8 -> 91,0 -> 83,5; EXP 6,25% -> 9,60%; nivel
`Lv 6` -> `Lv 5 KO` (penalidade de morte); ouro 1.000.512.405 -> 1.000.520.065; anel de EXP do
treinador 46,26% -> 48,45%; e a face trocando de `entei.png` pra `charmander.png` na troca de POKE
em campo, com o `aria-label` junto. Tudo reativo, pelo mesmo caminho de store.

O que de fato **nao** mudava era a ARTE: uma imagem por especie, a expressao neutra, igual com o
POKE a 3% de vida. Entao a leva virou a feature que o relato pedia por baixo.

**7 expressoes por especie**, do mesmo banco da face neutra (`npm run faces:emocao`, 2.566
arquivos, 10,7 MB). A regra e pura (`data/faceEmotions.ts#escolherFace`) e a ordem e uma escala de
urgencia: KO (`dizzy`) > subiu de nivel (`joyous`, 2,2s) > HP<30% (`pain`) > status
(veneno/queimadura `pain`, paralisia/congelado `stunned`, sono `sigh`, confusao `dizzy`) > HP<60%
(`worried`) > lutando (`determined`) > neutra.

Tres decisoes que valem registro:

- **Level-up ganha de HP critico.** A festa dura 2s e e o unico momento comemorativo do loop.
- **Status ganha de HP baixo e perde de HP critico.** A 60% de vida com veneno, a noticia e o
  veneno; a 20%, a noticia e a vida.
- **Piso de 500ms por face.** Sem ele o retrato tremia: `chase` -> `wander` -> `chase` acontece
  varias vezes por segundo quando um alvo morre e outro nasce perto.

A cobertura da origem e **parcial** (~40 das 226 especies nao tem parte das expressoes), e e por
isso que existe mapa gerado: `<img>` pedindo PNG inexistente deixaria um quadrado vazio na unica
superficie permanente da tela. Quem nao tem cai na neutra em tempo de compilacao, nao por 404.

Sequencia real capturada ao vivo: `determined` -> `dizzy` (KO) -> `worried` (auto-revive a 50%) ->
`dizzy`.

**Achado de brinde:** `levelUpSplashStore` e codigo morto. `LevelUpSplash` esta montado em
`JogoCarregado.tsx`, mas ninguem chama `show()` em lugar nenhum do `src/` — o banner "LVL UP!"
nunca apareceu. Nao mexi; a face `joyous` acha o level-up por conta propria (diff de nivel do
mesmo uid).

### 2. Mira dos golpes: 7 das 8 artes direcionais erravam metade do circulo

O pedido era "pente fino em TODAS as sprites de habilidades, com a rotacao adequada". Os dois
conferidores que existiam nao respondiam a pergunta: um mede a arte e nao desenha
(`conferir-direcao-vfx.mjs`), o outro desenha **sem girar** (`conferir-vfx-visual.mjs`). O terceiro
(`conferir-mira-vfx.mjs`) replica a geometria real do desenho — rotacao, espelho, ancora, recorte —
e varia o angulo do alvo em 4 direcoes. Foi ele que mostrou o bug.

**A conta do espelho estava errada pra arte de eixo vertical.** `orientacaoDaTira` devolvia um giro
so (`angulo - base`) e o canvas espelhava ANTES de girar — ou seja, refletia em volta da horizontal
DO ARQUIVO. Isso funciona enquanto toda arte direcional tem eixo quase horizontal (era o caso: 0°,
-19°, 22°, -41°, -46°, 49°) e **inverte o sentido do movimento** quando o eixo e vertical.

Contrafactual medido, com a conta antiga, em 12 angulos:

| arte | base | erro |
|---|---|---|
| FIRE, bullet_punch | 0° | correto |
| flamethrower | -19° | 38° em 6 de 12 angulos |
| charm | 22° | 44° |
| DARK | -41° | 82° |
| scratch | -46° | 92° |
| mud_shot | 46° | 92° |
| BUG | 49° | 98° |
| shadow_punch | 98° | 164° |

Mud Shot mandava lama pra ESQUERDA com o inimigo em cima. Nada disso lanca erro: a arte aparece,
bonita, apontando pro lado errado.

**Conserto:** dois giros, com o espelho ENTRE eles — `rotate(giroParaOAlvo)` -> `scale(1,-1)` ->
`rotate(giroDaBase)`. O espelho passa a refletir em volta da linha do golpe, e a mira sobrevive a
qualquer eixo. A condicao do espelho tambem mudou de "giro resultante > 90°" pra "angulo do golpe >
90°", que e o que de fato deixa a arte de ponta-cabeca. Backward-compatible exato pra base 0°.

Trancado em `moveVfx.test.ts#mira da arte direcional`: pra cada arte marcada `direcional` nas duas
camadas, o vetor "frente" depois da cadeia inteira tem que apontar pro alvo, em 12 angulos.

Duas artes novas entraram girando: **shadow_punch** (o punho que desceu do teto a vida toda) e
**fury_swipes**. E uma licao de cadastro: `anguloBaseGraus` e pra onde a arte APONTA, e o medidor
devolve o EIXO — uma reta, ambigua em 180°. Shadow Punch mede -82° e aponta pra 98°; cadastrado com
-82° o golpe chega pelas costas do alvo.

O resto do lote continua sem girar, e agora com numero: 12 das 18 tiras por tipo sao radiais
(alongamento <= 1.35 ou eixo instavel a +-40° ou mais) — girar um estouro redondo nao muda nada. As
"verticais" que sobram (FLYING, fire_spin, dragon_dance) sao tornado, espiral e buff: apontam pra
CIMA, nao pro alvo.

### 3. O sub-bioma trocando sozinho, sem aviso — duas simulacoes sorteando salas diferentes

Reproduzido com log de DOM, uma hunt, 90 segundos:

```
14:53:13  Sala 2/10 Obra           predicao local, com aviso na tela
14:53:15  Sala 1/10 Usina 0/30     flush: VOLTOU pra sala anterior
14:53:20  Sala 2/10 Laboratorio    outro sub-bioma, sem aviso nenhum
14:53:45  Sala 2/10 Obra           e de volta pro palpite local
```

**Causa raiz:** as duas simulacoes tem sequencia de sorteio propria (a do cliente e predicao), e as
duas sorteavam a sala. Elas nunca poderiam concordar. Por cima disso, `definirSala` escrevia
`draft.sala` DIRETO — e trocar de sala e trocar mapa, colisao, spawn e inimigos em campo, coisas que
so `aplicarTransicaoDeSala` faz. O HUD anunciava "Laboratorio" e o canvas desenhava e colidia como
"Usina".

Conserto em tres partes:

1. `world.salaSobAutoridade` — com sessao no servidor, `registrarAbate` conta o abate e **para**.
   Sem servidor, e na propria simulacao do servidor, o sorteio local continua.
2. `reconciliarSalaDaAutoridade` — porta unica da sala que vem do flush. Mesma sala: so o contador,
   e nunca pra tras. Sala diferente: vira `salaPendente` e arma a contagem regressiva, entrando pela
   transicao normal. Sala anterior por `(ciclo, indice)`: ignorada.
3. A sala INICIAL passou a ser decidida na abertura da sessao (`appSessao.ts#abrirSessao`, com o
   `rng` da sessao avancado e gravado) e volta na resposta. Sem isso o cliente entrava com a sala
   dele e trocava de sub-bioma ~30s depois — observado ao vivo: `Obra` -> `Usina` com aviso, 30
   segundos apos entrar.

O cliente tambem pede o flush **na hora** em que a quota fecha, em vez de esperar os 30s
(`observarQuotaDeSala`, repetindo a cada 5s enquanto o servidor nao fechar a dele).

**Por que nao fazer os dois sorteios coincidirem:** exigiria o cliente conhecer a semente da sessao,
e com ela ele calcula as 10 salas na abertura — o reroll gratis que "sorteio no avanco, e nao plano
antecipado" (leva 6.1) existe pra impedir.

### 4. Modo Pesadelo nao tinha salas — metade do conteudo de bioma com outra mecanica

Medido: 87 hunts, **36 com salas e 51 sem**. As 51: hunt inicial, 12 BOSS, Lance, treino... e as
**36 do Modo Pesadelo**. `buildNightmareMirror` clonava mapa e encontros e parava ai, entao o
espelho nascia fora de `POOL_POR_SALA` e `temSalas()` respondia `false`: sem sub-bioma, sem chip de
sala, sem aviso de nova area, sem janela de nivel por sala, e com o pool INTEIRO da hunt spawnando
de uma vez. A hunt normal e o espelho dela diferiam num `nightmare_` de id e em toda a progressao
dentro da hunt.

O espelho agora recebe `POOL_POR_SALA` e devolve `porSala` com as mesmas chaves de sub-bioma da
origem (mesmo bioma, mesma arte, mesmo body-block — o que muda e o nivel), com os ids de encontro
trocados pelos espelhados. Depois: **72 com salas, 15 sem** — e as 15 sao as que nao deveriam ter
(elenco curado, lendario unico, fixture de teste).

`hunts.test.ts` trava por espelho: mesmas chaves da origem, pool nao-vazio, todo id existente em
`ENCOUNTERS` e contido no `enemyPool` da propria hunt.

### 5. Explicacao flutuante — e a descoberta de que nenhuma bolha do jogo abria no celular

Pedido: explicacao flutuante sobre trait, golpe, natureza etc — no celular ao tocar a palavra, no PC
ao passar o mouse. A metade do PC parecia existir (havia cinco `<Tooltip>` no codigo). Nao existia
metade nenhuma no celular, e nao por esquecimento: `TooltipTrigger` do base-ui passa
`mouseOnly: true` FIXO ao hook de hover (`node_modules/@base-ui/react/tooltip/trigger/
TooltipTrigger.js:147`). Nao ha prop pra desligar. Golpe, item, POKE do chat, POKE do mercado e o
`?` do painel Auto: todos hover-only. Todo `title=` da HUD, idem — `title` e hover.

Duas telas ja haviam contornado a mao, cada uma do seu jeito (ramo por `useDeviceMode().coarse` que
abre um `Sheet`); as outras tres nao tinham caminho nenhum.

`components/shared/Explicacao.tsx` e o mecanismo unico: `open` controlado por estado proprio, o
hover do base-ui continua mandando nele, e o toque entra por `onClick`. Quatro decisoes que custaram
teste ao vivo:

- **Sem ramo por `coarse`.** Notebook com toque e as duas coisas ao mesmo tempo, e
  `(pointer: coarse)` responde por UM ponteiro. Decide pelo `pointerType` do evento real — gravado
  no `pointerdown`, lido no `click`.
- **`onClick`, nao `onPointerDown`.** Com pointerdown, comecar a ROLAR a lista com o dedo em cima da
  palavra abria a bolha no meio da rolagem.
- **`stopPropagation` so no toque.** Tocar "Natureza" dentro de um card com `onClick` proprio abria
  a bolha E o card.
- **`data-keep-open` na BOLHA.** O popup e portado pra `document.body`, entao pro listener de
  `pointerdown` do `Sheet` ele e "fora" — um toque no TEXTO da explicacao fechava o painel inteiro
  por baixo dela. Reproduzido no celular emulado (390x844): ficha do POKE aberta, toque na bolha da
  Natureza, ficha some. Confirmado consertado no mesmo caminho.

`data/glossario.ts` guarda o texto: verbete estatico pro conceito, FUNCAO pro que depende do POKE na
tela (`verbeteDaNatureza`, `verbeteDaTrait`, `verbeteDoStatus`, ...). Nenhum numero escrito a mao
onde existe fonte — `NATURE_BONUS`, `IV_MAX`, `CHANCE_DE_TRAIT_OCULTA`, `RARITIES`, `STATUS_RULES` e
`TURNO_SEGUNDOS` entram por import, e o efeito de cada status sai inteiro de `regraDoStatus`.

**O teto de tamanho e a feature, e virou teste.** A primeira versao emendava os tres paragrafos do
conceito por baixo da linha especifica: no celular a bolha da Natureza cobria dois tercos da tela,
tapando a ficha que ela explicava. `glossario.test.ts` trava 4 paragrafos e 210 caracteres cada, e o
proprio teste achou dois estouros reais que a leitura nao acharia — `burn` com 5 linhas (dano + dano
fisico + imunidade + prazo + volatilidade) e `moltres` com 5 (4x, 2x, resiste 4x, resiste 2x,
imune). Os dois passaram a agrupar. O mesmo teste varre 25 naturezas, todas as habilidades do
catalogo, as 30 caracteristicas, os 6 status, as 6 raridades, os 18 tipos e todas as especies
procurando `NaN`/`undefined`/`${` — lixo de interpolacao nao lanca excecao, a bolha so abre mentindo.

**Um `title=` morto encontrado no caminho:** a faixa de efeitos ativos e `pointer-events-none` no
desktop (pra nao comer clique do canvas), entao o cursor nunca chegava nos icones e o `title` de
cada um nunca apareceu — o desktop nao tinha NENHUM jeito de saber o que aqueles icones eram. O
badge recebeu `pointer-events-auto` e a bolha; no dedo o sheet continua sendo o caminho, agora
listando o efeito e nao so o nome.

Onde as bolhas entraram: ficha do POKE (Natureza, Habilidade, Caracteristica, os 5 atributos, IVs,
cada chip de IV, os chips de tipo com o lado defensivo combinado), `StatusBadge`, sheet do golpe
(Dano base, Precisao, PP, Recarga, Alcance, Categoria, tipo), `StatusEffectsBar` e Pokedex. As tres
bolhas hover-only que restavam (golpe, POKE do chat, POKE do mercado) migraram pro mecanismo novo e
passaram a abrir no dedo.

Ficou **sem** bolha de proposito: `TypeChip` generico — o mesmo chip serve tipo de GOLPE e tipo de
ESPECIE, e a resposta certa e diferente nos dois; dar a ofensiva num contexto defensivo seria pior
que nao dar nada.

**Segunda rodada, no mesmo dia:** unificacao das duas telas que sobraram e divisao rotulo/valor.

`ItemTooltip` e o `InfoIcon` do `AutoPanel` perderam o ramo por `useDeviceMode().coarse` e o `Sheet`
proprio. Os dois escreviam o MESMO conteudo duas vezes, em dois formatos, e o ramo por media query
errava no notebook com tela de toque. Agora nao existe mais tooltip com caminho proprio no jogo
inteiro: `Explicacao` e o unico. O tamanho do texto da bolha tambem saiu de cada conteudo e virou
uma classe no `TooltipContent` — antes `AbilityTooltip` e `ChatLog` diziam `.95em` e a bolha do
glossario `.85em`, o que dava duas escalas de texto pro mesmo tipo de superficie.

**O que a unificacao nao mudou, e vale saber:** na Loja em coluna estreita o card inteiro tem
`onClick` (e assim que se compra no celular) e o `ItemTooltip` envolve so o ICONE. Tocar o icone
abre a explicacao, nao a compra. Nao e regressao — o ramo por `Sheet` fazia o mesmo, pelo mesmo
`stopPropagation`; tocar o nome/preco continua comprando.

**Divisao rotulo/valor** (pedido explicito): tocar "Natureza" responde *o que e natureza*; tocar
"Hardy (neutra)" responde *o que Hardy faz*. Idem Habilidade (`Pressure` traz a descricao real mais
o aviso de que o motor daqui ignora) e Caracteristica (`Cochila muito` traz "aponta HP como o IV
mais alto deste POKE (31)"). Os verbetes de individuo pararam de concatenar o conceito, e o titulo
deles virou o nome do sorteio (`Hardy`, nao `Natureza Hardy`).

Isso criou uma falha silenciosa nova, e ela virou teste: se alguem reemendar o conceito dentro do
verbete do individuo, as duas bolhas ficam IDENTICAS e o jogador le o conceito de novo a cada toque
— sem erro, sem log, sem diferenca visivel no codigo. `glossario.test.ts` exige titulo diferente do
conceito e nenhum paragrafo do conceito dentro do corpo do individuo, nas 25 naturezas, em toda
habilidade do catalogo e na caracteristica.

### 6. A ficha mentia em 11 golpes que funcionam (achado ao listar o "sem efeito")

Pedido: listar tudo que esta sem efeito no jogo. Medido por script (catalogo + learnset + banco), nao
de memoria — e a medicao achou um defeito.

**`golpeTemEfeitoReal` (data/moveDescriptions.ts) nao conhecia `DANO_SEM_PODER_BASE`
(data/abilities.ts)** — os golpes cujo dano vem de uma regra propria (nivel do usuario, HP do alvo, o
ultimo golpe recebido) e nao do dano base. O comentario do proprio arquivo garantia que isso era
impossivel: *"Golpes de dano fixo (Seismic Toss, Dragon Rage, ...) nao entram aqui: eles tem
`power > 0` na pratica"*. Tem `power: 0`. Os 11 alcancaveis por alguma especie:

    Magnitude, Seismic Toss, Dragon Rage, Counter, Mirror Coat, Psywave,
    Super Fang, Reversal, Flail, Night Shade, Present

Confirmado na tela antes do fix, ficha do Dugtrio da conta de teste:

    Magnitude | GROUND | Fisico | Dano base 0 | PP 30 | Recarga 1.3s | Area (raio 175)
    "Neste jogo este golpe nao causa dano, e nao tem nenhum efeito extra implementado aqui."

Mentira: `DYNAMIC_POWER_ABILITIES.magnitude` sorteia poder real e `isDamagingAbility` devolve `true`
— o motor escolhe Magnitude como golpe de dano e ela bate.

Tres consertos, um por sintoma:

1. `golpeTemEfeitoReal` consulta `DANO_SEM_PODER_BASE` (exportado agora).
2. A linha de **Precisao** na bolha passou a ser gatilhada por `isDamagingAbility`, nao por
   `power > 0`. Sintoma secundario da mesma raiz: Earthquake mostrava "Precisao 100%" e Magnitude,
   ao lado, nao mostrava nada.
3. "Dano base 0" virou "Dano base —" + `AVISO_DANO_POR_REGRA_PROPRIA`. Um zero cru le como golpe
   fraco num Seismic Toss que tira o nivel inteiro do alvo.

Depois, na tela: `Dano base — | Precisao 100% | ... | O dano deste golpe sai de uma regra propria,
nao do dano base.`

**Os quatro OHKO do catalogo eram tratados como um caso e sao dois.** `horn_drill`/`fissure` TEM
implementacao (`FIXED_DAMAGE_ABILITIES` causa `defenderPoke.hp`) e estao fora de
`isDamagingAbility` por balanceamento; `guillotine`/`sheer_cold` nao tem implementacao nenhuma.
Dizer "sem efeito implementado" nos dois primeiros era falso, entao eles ganharam
`AVISO_OHKO_DESLIGADO` ("mata o alvo de uma vez, e por isso esta desligado: o POKE nunca vai
escolhe-lo"). Novo Set `OHKO_DESLIGADO`, com a nota de manter em sincronia com o motor.

**A justificativa escrita no codigo pra manter os dois desligados estava desatualizada.** Ela dizia
"ESTE JOGO NAO TEM PRECISAO (nem `Ability` nem o dado gerado tem o campo; todo golpe sempre acerta)".
`accuracy` e campo OBRIGATORIO de `Ability` e existe rolagem de acerto com estagios de
precisao/evasao (`combatSystem.ts#chanceDeAcerto`); os dois vem do catalogo com accuracy 30. O que
falta de verdade e a regra de OHKO dos jogos — a chance ESCALA com a diferenca de nivel e nunca
acerta alvo de nivel maior. Sem ela, 30% e um dado de "mata agora" que funciona igual contra um BOSS
40 niveis acima. A decisao continua a mesma; a razao registrada agora e a certa.

**O invariante que fecha a classe inteira** (`moveDescriptions.test.ts`): nenhum golpe que
`isDamagingAbility` aceita pode ser anunciado como inerte. Conferido pelo CONTRAFACTUAL — removida a
linha do fix, o teste acusa os 11 pelo nome (`expected [ 'dragon_rage', 'mirror_coat', …(9) ] to
deeply equal []`).

**O resto do levantamento, para registro:** 67 golpes realmente inertes de 497 (todos alcancaveis,
nenhum orfao), 31 habilidades sem efeito de 132 — uma delas (`healer`) orfa, sem especie nenhuma —,
e **6 especies em que TODA habilidade possivel e inerte**: `ho_oh`, `celebi`, `mewtwo`, `staryu`,
`aipom`, `wobbuffet`. Tres legendarios entre eles: o campo "Habilidade" da ficha do Mewtwo e
decoracao permanente. Mais 3 varas sem pesca, o farm offline pausado por chave, e a fila
`market_deliveries` (14 linhas, todas reclamadas, nenhuma RPC insere — `entregas.ts` gasta uma query
por `/estado` pra assentar fila que ninguem alimenta).

Duas linhas de doc que a medicao derrubou: `element_type` no Postgres **tem** os 18 tipos com FAIRY
nos dois schemas (a pendencia no CLAUDE.md ja estava resolvida quando foi escrita), e a descricao de
OHKO em `CLAUDE.md`/`docs/03` misturava os dois casos.

**Achado de lado, MEDIDO e nao desta leva:** `pessimista.test.ts` falha por TIMEOUT em 2 de 3 rodadas
da suite completa e passa 3 de 3 em isolamento — verde sozinho, vermelho junto. Nao e flake
estatistico: a mensagem e `Test timed out in 45000ms`. Custo medido em isolamento: **37,6s com esta
branch e 38,5s no HEAD limpo** (`git stash` + rodar + `stash pop`), contra o cap de 45s. Ou seja, a
branch esta exonerada por medicao — a regressao ja estava no codigo commitado.

O que sobra de pergunta: o comentario do proprio teste (commit `ff699c1`) diz que ele custava **~12,8s**
quando o timeout foi de 15s pra 45s. Triplicou desde entao, e ninguem viu porque a resposta anterior
foi subir o relogio. **Nao subi o relogio de novo de proposito** — foi exatamente assim que o 3x se
escondeu. O caminho certo e `git bisect` no custo do teste, e isso fica registrado aqui como
pendencia com o numero na mao, nao como "teste flaky".

## 2026-09-01 (manha) — duas promocoes no mesmo dia, e um exploit que a propria issue pedia

Sessao com escopo fechado pelo dono: **so issues com reporter `chatgptdaqui`**. O bloco do
Otavio (epico shadcn PH-339 a PH-360, `sala_transicao` PH-361 a PH-365, PH-366, PH-205, PH-48)
nao foi tocado — 27 das 33 issues abertas ficaram de fora de proposito.

### 1. PH-334: o criterio de aceite da issue criaria um exploit de jogo

`sala_protetor` (PH-241) guarda o protetor vivo da sessao, uma linha por sessao. Ela nunca era
apagada. Medido em 01/09, antes do conserto:

```
public:  14 linhas, 14 de 14 apontam pra sessao FECHADA   (3 sessoes abertas)
dev:      7 linhas,  7 de  7 idem                         (0 sessoes abertas)
```

A FK **tem** `on delete cascade`, e ele nunca dispara: `game_sessions` nao e apagada no
fechamento, e MARCADA (`closed_at`). A linha do protetor sobrevive a sessao dona dela.

**A issue mandava pendurar um trigger em `closed_at`, com a justificativa de que "linha de
sessao fechada nunca e lida". Isso esta errado, e implementar ao pe da letra teria dado ao
jogador uma fuga gratis do Guardian.**

A issue conferiu UM leitor (`sessaoAberta`, que de fato filtra `closed_at=is.null`) e nao viu o
segundo: `salaHerdada` (`authority/src/appSessao.ts`) busca a ultima sessao do jogador NAQUELE
mapa com `select=*,sala_protetor(*)` e **sem filtro de `closed_at`** — le exatamente a linha de
uma sessao fechada. E a heranca de sala da PH-266: dar F5 no meio da luta fecha a sessao e abre
outra, e o protetor atravessa junto com o `hp_atual` que tinha. O comentario da propria PH-266
diz que ela existe pra impedir que F5 vire jeito de sumir com o bicho.

**O conserto e por IDADE, nao por evento.** `purgar_sala_protetor(p_limite interval default
'1 hour')`, cron horario (minuto 34 em `public`, 04 em `dev`), `delete` de filtro POSITIVO: so
alcanca linha para a qual **nao existe** sessao aberta nem fechada dentro do limite. O filtro
positivo e a parte que importa — ele obriga a provar que ha sessao viva pra poupar a linha, em
vez de provar que ha uma morta pra apaga-la, entao um caminho de fechamento novo que ninguem
lembrou erra pro lado de guardar lixo.

1 hora, e nao 5 minutos colados na janela do TypeScript: o purge nao precisa ser apertado e a
margem larga tira qualquer corrida entre fechar e reabrir do limite.

Isso cobre os dois caminhos de fechamento **e qualquer futuro**, que era o argumento a favor do
trigger, sem o efeito colateral: olha o estado, nao o evento.

`src/data/salaProtetorPurga.test.ts` tranca dois invariantes, pelo padrao `?raw` de
`limiteDeSessaoInativa.test.ts` (a suite nao tem Postgres): o limite do SQL tem que ser MAIOR
que `JANELA_DE_HERANCA_DE_SALA_MS` lido do fonte de authority, e **nenhuma** migration pode ter
trigger de `closed_at` tocando `sala_protetor`. Contrafactual conferido: com o limite em
`1 minute` o teste reprova nominalmente.

Depois de aplicar (run 33490599514): `public` 0 protetores com 3 sessoes abertas, `dev` 0 com 0.
As 21 orfas foram embora e nenhuma linha viva foi levada junto.

**A descricao da issue no Jira continua afirmando a frase errada** — a correcao foi so num
comentario. Quem reler a PH-334 sem ler os comentarios reimplementa o trigger.

### 2. PH-327: as tres armadilhas de tirar o CI do Node 20

Todo run dos 4 workflows anotava `Node.js 20 is deprecated ... being forced to run on Node.js
24`. "Being forced" e passado, nao futuro: o runtime ja tinha sido trocado por baixo.

Subiram as quatro no **menor major que sai do `node20`**, 15 pontos de uso em 4 arquivos —
`checkout` v4→v5, `setup-node` v4→v5, `upload-artifact` v4→**v6**, `setup-cli` v1→**v2**. O
runtime de cada alvo foi conferido no `action.yml` da propria tag, nao no changelog.

**Armadilha 1: `upload-artifact@v5` AINDA e `node20`.** Esta escrito na release note do v6:
"v5 had preliminary support for Node.js 24, however this action was by default still running on
Node.js 20". Uma varredura de "sobe um major em tudo" deixa justamente ela pra tras — e ela e
usada num lugar so, num passo condicional — e o aviso continua aparecendo sem ninguem entender
por que.

**Armadilha 2: nao precisa do `setup-cli@v3`.** O `v2` ja e `composite` e o unico Node que ele
carrega e `oven-sh/setup-bun@0c5077e` (v2.2.0), que ja e `node24`. Ele mantem o input `version`,
entao a pinagem `2.116.0` da PH-290 sobrevive — conferido no log: `Download action repository
'supabase/setup-cli@v2'` seguido de `version: 2.116.0`.

**Armadilha 3: `setup-node@v5` liga cache automatico** quando existe `packageManager` no
`package.json`. Este repo nao tem o campo, entao nada muda hoje; no dia em que alguem adicionar
por outro motivo, o comportamento do CI muda junto e ninguem relaciona as duas coisas. O
desligador e `package-manager-cache: false`.

**A prova, e ela e direta.** Anotacoes do mesmo workflow antes e depois:

| run | anotacao |
|---|---|
| `build-check` da PR #363 (v4) | `Node.js 20 is deprecated ... actions/checkout@v4, actions/setup-node@v4` |
| `build-check` da PR #364 (v5) | nenhuma |

`ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` nao aparece em lugar nenhum e nao foi usado: ele fixa
a divida em vez de paga-la.

**Risco que fica escrito:** `supabase/setup-cli@v2` e uma BRANCH (`refs/heads/v2`), nao uma tag.
O conteudo pode mudar debaixo do CI sem nenhuma mudanca neste repo. Ja era assim no `@v1`, entao
nao e regressao — mas as duas actions da Supabase sao as unicas do arsenal que nao sao
referencias imutaveis. Fecha-se pinando por SHA, como a propria `setup-cli` faz internamente com
o `oven-sh/setup-bun`.

### 3. O laco de tipos, que e fluxo e nao acidente

A migration da PH-334 criou uma RPC, entao o job `tipos` do `supabase-deploy-dev` reprovou o run
do proprio merge por `database.types.ts` desatualizado. **Nao ha como commitar o arquivo junto da
migration** — ele so pode ser gerado depois de a migration existir no remoto —, e o job ja sobe o
resultado como artefato justamente pra a PR de chore nao precisar de acesso ao banco. PH-379:
baixar o artefato, trocar o arquivo, `1 file changed, 2 insertions(+)`.

O custo de nao fazer isso na hora apareceu em minutos: o `check` da PR #364, que so mexe em YAML
de CI, reprovou por causa desse arquivo. E o "o custo cai em quem nao fez a mudanca" que a regra
do projeto descreve, e caiu na PR seguinte da mesma sessao.

**O que sempre conferir num `db:types` regenerado:** ele traz o schema remoto INTEIRO. Se houver
qualquer coisa aplicada fora de migration, ela entra de carona no commit e fica parecendo
consequencia da issue que motivou. O `--stat` e o gate: 2 linhas, nenhuma deriva.

### 4. A corrida de nove minutos entre duas sessoes, e o numero errado que subiu ao ar

**A promocao 7.27 (PR #366) foi mergeada as 09:29. A PR #362, de uma sessao paralela, corrigindo
um numero da MESMA nota, foi mergeada na `dev` as 09:38.** O corpo da #362 dizia "ainda nao
chegou em producao, da tempo de consertar antes da promocao". Nao deu.

A nota no ar prometia ao jogador **"cerca de um terco a menos de ouro, XP e abates"**. Isso era
aritmetica (1/1,5), nao medicao: **a conta ignora que o POKE passa boa parte do tempo ANDANDO
entre alvos, e andar nao dilatou com o turno.**

Medido em `scripts/harness/vazao-do-combate.mjs`, 200 minutos simulados por regime, com rebuild
do headless entre as duas medicoes (`TURNO_SEGUNDOS` e compilado dentro dele):

| regime | ouro/min turno 2 | ouro/min turno 3 | queda | % do tempo em luta |
|---|---|---|---|---|
| Nv25 charmander | 928,8 | 784,9 | **-15,5%** | 38,5% |
| Nv102 entei | 475,4 | 380,9 | **-19,9%** | 58,0% |

O modelo que explica: `vazao = 1 / (1 + 0,5 x f)`, com `f` = fracao do tempo em combate.
`f=0,385` preve -16,1% (medido -15,5%); `f=0,580` preve -22,5% (medido -19,9%). Concordancia de
~2 pontos, e a fracao engajada SOBE nos dois regimes, que e o sinal de que o turno dilatou a luta
como previsto.

Duas armadilhas da bancada, registradas nela: uma amostra de 12 sementes x 3 minutos deu
**-1,4%** e quase virou "o turno quase nao muda nada" — era ruido, e com 20 x 10 minutos virou
-15,5%; e `world.effects` nao serve pra contar golpe em `silent: true` (o modo do servidor), onde
devolve zero e parece "o POKE nao ataca" — `pendingHits` existe nos dois modos.

**Foi preciso uma segunda promocao no mesmo dia** (PR #368) so pra corrigir o texto. O erro era
para menos em favor do jogo — o jogador achava que tinha perdido mais do que perdeu —, mas e um
numero que ele confere sozinho ao fim de uma hora de farm, e uma nota que erra o proprio custo
por um fator de dois e pior que nota nenhuma.

**A licao de processo:** ler `origin/main..origin/dev` no comeco da sessao nao vale na hora do
merge. Duas sessoes no mesmo repositorio nao se veem, e a segunda tambem refez sozinha o
`database.types.ts` que a primeira ja tinha entregue pela PH-379 — duplicata benigna so por
sorte, porque as duas escreviam a mesma linha. Antes de mergear promocao: `git fetch` naquele
momento e `gh pr list --state all` das ultimas horas.

Cada promocao pediu back-merge proprio (PH-380, dois no dia): promocao entra por merge commit, a
`main` fica com um commit que a `dev` nao tem, e a promocao seguinte nasce `BEHIND`. E o
back-merge sai de branch de trabalho, nunca com `head:main` — PR assim fica `BLOCKED` pra
sempre, porque o check obrigatorio nao roda nesse par.

Producao conferida com `scripts/harness/fumaca-de-producao.mjs` nas duas vezes: login, status,
CORS e corpo do estado OK nos dois ambientes.

### 5. PH-162 arquivada, e PH-377 aberta com numero na mao

**PH-162** (encoder de PNG e gerador de referencia de body-block presos numa PR abandonada)
fechada como **nao-fazer**, por decisao do dono. Os dois primeiros criterios ja estavam
cumpridos desde 25/08 — a PR #139 fechada e o encoder duplicado fora da `dev`. O que restava era
a pergunta: gerar referencia de body-block por retangulo vale o custo de (1) um decoder de JPEG
em Node puro ou (2) uma base PNG versionada, que reabriria o peso que a PH-125 tinha cortado?
Resposta: nenhum dos dois. A pintura a mao continua.

**PH-377**, aberta com o achado da rodada de testes: 2 testes de
`scripts/ci/supabaseCliRetry.test.mjs` estouram o timeout de 5s **so quando a suite roda
inteira**, e passam sozinhos. Medido em isolamento: 4.162 ms e 3.895 ms contra teto de 5.000 ms —
78% e 83% do teto sem concorrencia nenhuma. Nao e `sleep` (o teste roda com
`SUPABASE_CLI_ESPERA: '0'`); e processo real, `bash` + o `supabase` falso, uma vez por tentativa.
Conferido com `git stash` numa rodada limpa: **as mesmas 2 falham no HEAD sem nenhuma mudanca
local**.

O que torna isso serio e a assimetria: **a suite local ja esta vermelha e o CI ainda esta
verde**, o que treina quem desenvolve a ignorar a saida de `vitest run`. E ha precedente medido
neste mesmo arquivo — `pessimista.test.ts` custava ~12,8s quando o timeout foi de 15s pra 45s
(commit `ff699c1`) e hoje custa ~38s. Triplicou, e ninguem viu porque a resposta anterior foi
subir o relogio. O criterio de aceite da PH-377 proibe explicitamente repetir isso.

## 2026-09-01 (tarde) — mais duas promocoes, o custo que era fork, e uma quarentena furada

Continuacao da manha (mesmo escopo: so issues com reporter `chatgptdaqui`). Duas promocoes,
**7.28** e **7.29**, as duas autorizadas explicitamente pelo dono.

### 1. PH-378: o Treinador era o unico ator do combate fora do compasso

`COOLDOWN_DO_TREINADOR` era **1,5s fixo**, escolhido quando o turno era 2s — 1,33 item de cura
por turno. Quando a PH-376 esticou o turno pra 3s, o MESMO 1,5s passou a valer **2,00 itens por
turno**: o Treinador ganhou ritmo de graca porque o turno de todo mundo esticou, e nada no
codigo acusava isso. Agora deriva de `TURNO_SEGUNDOS`, e a regra vira uma frase — cada um age uma
vez por turno, inclusive o Treinador.

**O custo foi medido, e a bancada nao servia como estava.** O criterio 5 da issue pedia medicao
de sobrevivencia num regime em que a cura REALMENTE dispara, e os dois regimes existentes de
`vazao-do-combate.mjs` nao respondiam: a coluna nova `piso HP` mostrou por que — eles param em
69% e 62% de HP, e a regra default de auto-pocao so acorda **abaixo de 70%**. Baixar o nivel
dentro da faixa1 nao resolve (um Nv8 mediu piso de 70,8%, ainda por cima da regra): os inimigos
da faixa1 sao Nv1-30 e um POKE fraco ainda ganha. O regime novo e **Nv25 numa hunt de faixa2**
(inimigos Nv31-60) — e a diferenca de FAIXA que faz o POKE apanhar.

200 minutos por regime, rebuild do headless entre as duas medicoes, turno em 3s nas duas colunas:

```
regime      curas/min 1,5s   curas/min turno   mortes/min 1,5s   turno
apertado         2,04             2,04              0,000        0,000
folgado          1,55             1,43              0,000        0,000
sofrido          8,45             4,22              5,955        7,185
```

A cura cai a METADE onde ela acontece, e as mortes sobem 20,7% junto. **Nos dois regimes normais
o custo e zero morte** — o preco mora inteiro no jogador que caca muito acima do nivel dele, o
mesmo que ja morria 6 vezes por minuto antes da mudanca.

**Aresta afiada, nomeada no comentario do codigo e sem teste:** HP critico COM status. A
prioridade gasta uma acao por turno, entao curar o status e depois o HP passa a levar dois
turnos. E a janela em que um POKE envenenado e quase morto pode nao ser salvo.

**E a armadilha da propria bancada, que quase virou conclusao publicada:** o contador de itens
nascia pendurado em `consumeItem`, e a automacao de cura chama `removeItem`. Ela reportava
**0,00 item/min em TODO regime**, inclusive num com o POKE morrendo 7 vezes por minuto — e esse
zero chegou a sair numa PR como se fosse fato sobre o jogo ("a cura nao dispara em regime
nenhum"). Era fiacao errada. A coluna `piso HP` existe pra que o proximo zero seja
diagnosticavel em vez de misterioso.

### 2. A nota 7.28 nasceu no lugar errado, e o culpado foi o `--auto` do `gh`

A PR da PH-378 pos o item do Treinador como quinto highlight da **7.27**. Estava certo quando a
branch abriu e ficou errado no meio dela: a 7.27 foi promovida por outra sessao enquanto a PR
estava em revisao. A regua e uma entrada **por promocao** — acrescentar item numa versao que o
jogador ja leu reescreve o passado dele, e quem abriu a aba ontem nunca veria a linha nova.

Corrigido num commit na propria branch... que **nao entrou**. `gh pr merge --auto` armado numa PR
cujos checks JA estao verdes mergeia na hora, no SHA daquele momento: o commit de codigo entrou e
a correcao da nota ficou orfa na branch. Custou uma PR extra pra mover o item pra uma **7.28**
propria.

**Regra que sai disso:** armar o auto-merge por ULTIMO, quando nao ha mais nada pra empurrar. Se
precisar empurrar depois, conferir `gh pr view <n> --json state` antes de assumir que o commit
entrou; se ja mergeou, o conserto e branch nova de `origin/dev` com `cherry-pick` do orfao.

### 3. PH-377: nao era teste lento, era fork

Os dois casos de `scripts/ci/supabaseCliRetry.test.mjs` que estouravam o timeout de 5s na suite
cheia gastavam 830ms POR TENTATIVA. O diagnostico obvio ("teste com espera real") estava errado:
o teste ja roda com `SUPABASE_CLI_ESPERA: '0'`. O custo era **processo**.

O wrapper forkava **nove por tentativa**: `mktemp`, dois `cat`, o `bash` do comando falso, o
`cat` do contador dentro dele, `grep`, `rm`, `sleep 0`, mais um `seq` no inicio. A ~100ms cada no
Git Bash do Windows, isso da os 830ms — 83% do teto **sem concorrencia nenhuma**.

Trocado o que tem builtin equivalente: `$(<arquivo)` no lugar de `cat`, `[[ =~ ]]` no lugar de
`grep -qE` (mesma familia de ERE, e sem depender de qual `grep` esta no PATH do runner),
aritmetica no lugar de `seq`, `sleep` so quando a espera nao e zero, e UM `mktemp` fora do laco
com `trap` de saida. **O `mktemp` ficou**: criacao segura de arquivo temporario nao se troca por
caminho previsivel pra economizar 100ms.

```
                                      antes     depois
sucesso de primeira                   833ms      301ms
28P01 duas vezes (3 tentativas)     2.692ms      657ms
erro de SQL                           833ms      311ms
28P01 em todas (3 tentativas)       2.248ms      576ms
```

**O teste nao mudou nada alem de um comentario**, e e isso que garante que a troca preservou
comportamento — as 5 assercoes sao as mesmas.

**O experimento de controle e o que prova, e ele quase nao foi feito.** Suite verde numa maquina
ociosa nao vale nada aqui, porque a falha era induzida por CARGA: as tres rodadas verdes que o
criterio 1 pedia sairam com a maquina livre e provavam pouco. Entao: 24 processos node em laco
fechado numa maquina de 16 nucleos, codigo antigo e novo sob a MESMA carga, no mesmo minuto.

```
caso                  antigo                  novo
28P01 duas vezes      7.110ms — TIMEOUT       2.402ms
28P01 em todas        4.734ms (95% do teto)   2.191ms
```

O antigo reprova e o novo passa. E o segundo caso do antigo estava a 95% do teto — ia cair na
proxima. **A margem melhorou ~3x, nao virou infinita**: 2.402ms sob aquela carga ainda e 48% do
teto. Por isso o custo esperado ficou escrito no cabecalho do teste, com a instrucao de que
passar de ~700ms por caso significa fork religado, e o conserto e achar o fork.

Deliberadamente NAO feito: transformar o comando falso em funcao exportada do bash tambem.
Economizaria mais um fork por tentativa, mas o comando deixaria de ser um PROCESSO — e o wrapper
existe pra rodar um binario de verdade. Nao se troca fidelidade por 100ms com a margem que
sobrou.

**O deploy da 7.29 foi o primeiro teste de producao do script**, que roda em 3 workflows e e o
caminho de todo `db push` e `gen types`. Saiu verde.

### 4. A promocao 7.29 esperou uma nota que nao era minha

A PH-382 (o trilho de reservas desenhava o POKE que estava em campo, com nivel e HP subindo nos
dois lugares — **bug com relato de jogador**) entrou na `dev` por outra sessao **sem entrada em
`patchNotes.ts`**. Peguei na leitura do intervalo `main..dev` e segurei a promocao pra escrever a
7.29 antes.

A frase que carrega essa nota e a segunda: *"se o seu time ficou assim, ele se corrige sozinho na
proxima vez que voce entrar"*. O conserto normaliza o save torto na CARGA, e sem dizer isso o
jogador nao distingue "consertaram" de "mudou de novo sozinho" — quem acha que o time embaralha
sem motivo para de confiar no save.

**Habito que sai disso:** `git diff --name-only origin/main..origin/dev -- src/data/patchNotes.ts`
antes de abrir a PR de promocao. A regua "promocao nao sai sem nota" e facil de cumprir pro
proprio trabalho e facil de furar pro trabalho alheio, porque quem promove nao e necessariamente
quem escreveu.

### 5. Furei a quarentena de um subsistema, e o registro disso vale mais que o achado

Perguntado se a PH-377 tinha relacao com um subsistema que esta **em quarentena por decisao do
dono**, eu tratei a pergunta como se ela levantasse a quarentena: abri o codigo, medi onde a
mecanica esta viva, escrevi o diagnostico e ainda ofereci trabalhar nela. A resposta certa cabia
em uma linha — "sim, essa metade da issue e desse assunto e esta fora por quarentena; a outra
metade e o retry do CLI".

**"Volta quando for pedido explicitamente" significa mandar voltar a trabalhar nele.** Nao e uma
pergunta de sim-ou-nao, nao e o dono citar o nome, nao e ele perguntar se algo tem relacao. E nao
vale reabrir o merito da decisao com evidencia de codigo: se o codigo mostra a mecanica viva em
algum caminho, isso e exatamente o tipo de medicao proibida.

**Consequencia concreta na fila:** a PH-377 tinha um criterio de aceite mandando investigar um
arquivo daquele subsistema — a propria fila mandava furar a quarentena. **O criterio foi REMOVIDO
da issue**, nao cumprido, e a issue foi reescrita pra cobrir so
`scripts/ci/supabaseCliRetry.test.mjs`, com um criterio novo proibindo tocar em arquivo de
subsistema em quarentena. Isso torna sem efeito a pendencia registrada no fim da entrada da manha
deste arquivo: ela descreve um `git bisect` que **nao deve ser feito** enquanto a quarentena valer.
O paragrafo fica como esta — historico nao se reescreve —, e esta linha e a correcao.

Reforco escrito em `CLAUDE.local.md`, na secao que ja existia.

---

## 2026-09-02 (madrugada) — a encarada dos duelos: tres reprovacoes visuais e o custo de cada uma

Uma feature so, puramente cosmetica, em quatro rodadas: PH-397 (a coreografia), PH-402 (a forma
final), PH-407 (a nota da 7.33), PH-408 (aberta). Promovida como **7.33**, com fumaca verde nos
dois ambientes.

O pedido: entre um golpe e o outro, nos duelos 1x1 (arena do Campeao Lance e as 11 hunts BOSS de
lendario), os dois POKEs deviam se encarar e girar em vez de tocar Idle parados. Medido antes de
comecar: **83% do tempo de duelo** era exatamente esse intervalo — `MIN_ACTION_GAP` e
`TURNO_SEGUNDOS` (3s) e a pose de ataque dura 0,5s.

### 1. A restricao de geometria que decide tudo, e que nao e obvia

`engageRangeFor` e `raioA + raioB + MELEE_RANGE_PADDING` = 39px, e `separarCorpos` (PH-384)
empurra ate a soma dos raios, 29px. **A distancia entre os dois esta presa em (29, 39) pelo
combate.**

Disso sai a consequencia que custou a primeira rodada: se os dois giram em torno do PONTO MEDIO,
o raio de cada corpo e METADE da distancia entre eles — 17px. O passo lateral sai
`2 x 17 x sen(arco)`, ou seja **26px com arco de 50 graus, e no maximo 34px** com +/-90 graus (que
ja nao e arco, e meia volta). Nao ha numero a mexer: largura de orbita e distancia de combate sao
a mesma variavel.

Sair disso exige **mover os dois JUNTOS** — translacao ou rotacao rigida do par —, e nao orbitar
um no outro. Rotacao rigida preserva distancia exatamente, entao o raio percorrido por cada corpo
deixa de ser metade da distancia e passa a ser a distancia ate um pivo qualquer, que e livre.

O limite superior tambem tem dono: a velocidade do corpo nao pode passar do **andar do proprio
POKE** (58,5px/s pro inimigo, 91 pro jogador), porque a cadencia do quadro do sheet PMD e FIXA
(`durations[frame] / 60`) e nao escala com velocidade. Devagar demais o POKE corre no lugar;
rapido demais ele patina. Sobra uma janela estreita, e ela e o que amarra tamanho de passo a
duracao de ciclo.

### 2. As tres reprovacoes, e por que sao a MESMA reprovacao

Cada uma custou um ciclo inteiro: implementar, testar, medir, subir bancada, o dono olhar.

1. **Giro em torno do ponto medio** (PH-397, foi pra producao assim): 26px. *"ficou muito
   discreta"*. Invisivel por geometria, nao por escolha de numero.
2. **Giro em torno de um pivo lateral fixo**: resolveu a largura (117px medidos) e criou outro
   defeito. Arco unico, sempre com a mesma barriga, percorrido pra la e pra ca: *"esta parecendo
   um balanco de um brinquedo de barca viking"*. E literalmente o que um pendulo e.
3. **Oito deitado** (lemniscata de Gerono): alternou a curva — duas meia-luas, uma pra cada lado —
   mas fecha sempre no mesmo ponto. *"nao ficou bom voltar para onde comecou"*.

**A leitura que so aparece na terceira:** as tres sao figuras FIXAS, e o olho acha o padrao de
qualquer figura fixa. Nao adianta escolher uma figura melhor. A solucao foi tirar a figura — uma
sequencia de meia-luas em que cada uma sorteia lado do pivo, curvatura (32 a 95px) e comprimento
(95px +/-35%). Nenhuma anuncia onde a proxima vai parar.

**Se eu tivesse enxergado isso na rodada 2, teria economizado uma rodada inteira.** O sinal estava
na propria reclamacao: "parece um pendulo" e uma queixa sobre PREVISIBILIDADE, nao sobre forma.

### 3. Onde o tempo foi embora, e o conserto que eu so fiz na terceira rodada

O caro nao foi implementar — cada geometria e 30 a 80 linhas. O caro foi **o loop de validacao**:
mexer no numero exigia editar constante, rodar `build:engine`, subir dev server, o dono abrir a
pagina.

Na terceira rodada a bancada `encarada-no-duelo.html` ganhou `?passo=`, `?coleira=` e `?vel=`
escrevendo em campos opcionais de `WorldState.encarada`. **Isso deveria existir desde a primeira
PR.** Para feature cosmetica, os botoes de ajuste sao parte da primeira entrega, nao um extra da
terceira — sem eles, cada "ficou X demais" custa um ciclo de PR inteiro em vez de um F5.

Os campos moram no ESTADO DO MUNDO, e nao numa variavel de modulo mutavel, de proposito: um
ajuste global seria lido tambem pela simulacao do servidor, e valor escrito de um lado so e a
forma classica de cliente e autoridade discordarem em silencio.

### 4. Como se testa "isto nao pode virar padrao"

Os testes obvios (distancia dentro de (29,39), parede, `world.rng` intocado, nao mexer em
`entity.state`) continuavam **todos verdes** nas tres versoes reprovadas. Eles provam que a
coreografia e inofensiva, nao que ela e boa.

O que trava a regressao sao tres medidas de VARIEDADE, e elas foram escritas depois de a tela
reprovar duas vezes:

- as meia-luas entortam pros dois lados em proporcao parecida (32 de 77 medidos);
- a curvatura varia de perna pra perna (desvio-padrao nao trivial — curvatura fixa daria zero);
- os fins de perna nao se repetem (10 de 77 caem perto de um anterior; caminho fechado poria
  quase todas).

Sem essas tres, alguem "simplifica" pra uma figura fixa e o pendulo volta com o resto do arquivo
verde. Todas verificadas por sabotagem — `RAIO_DA_CURVA = 0`, `ALTURA_DO_PASSO = 0`, gate do mapa
removido, `nextFloat(world.rng)` injetado: as quatro ficam vermelhas.

**Um teste de parede nasceu VACUO e so a sabotagem pegou.** A primeira versao posicionava o par
34px abaixo da parede, mas a excursao vertical do arco era 13px — o par nunca encostava. Passava
verde com a guarda de colisao REMOVIDA. A folga virou 4px e ai o teste passou a valer.

### 5. A nota da 7.31 prometeu o que o jogador nao podia ver

Este e o achado que mais vale registrar, porque nao e sobre codigo.

A PH-397 subiu na 7.31 com o item *"Agora eles circulam um ao redor do outro, virados de frente"*.
Aquilo era a versao de 26px. **O jogador leu uma promessa e nao teve como ver o que ela
descrevia** — e o verbo estava errado por cima: eles nao "circulam", nunca deram voltas um no
outro.

A nota da 7.33 nao podia anunciar a encarada de novo: seria a segunda vez que a mesma coisa e
prometida, e quem leu a 7.31 passaria a desconfiar da nota inteira. O item reconhece a promessa
anterior e diz o que mudou — da pra ver.

**A regra que sai disso:** so entra em nota o que foi olhado na tela pelo dono. "O codigo faz X"
nao autoriza escrever "voce ve X". A 7.31 foi escrita com a feature medida e testada, e ainda
assim mentiu.

### 6. Duas armadilhas de operacao encontradas no caminho

- **O dev server nao sobrevive entre turnos** numa sessao de background: subiu e foi morto tres
  vezes, sempre logo depois do fim do turno. Nao adianta reiniciar em loop — o caminho e o dono
  rodar `npm run dev` no proprio PowerShell. Alem disso a porta MUDA (5173 se livre, senao 5174),
  e a raiz `/` serve o JOGO, que sem CORS na porta errada nao deixa entrar: o link tem que ser o
  caminho completo da bancada.
- **`gh pr merge --delete-branch` falha** quando a branch base esta em uso por outro worktree
  (`fatal: 'dev' is already used by worktree at ...`). O merge no GitHub ACONTECE; o erro e do
  `gh` tentando trocar a branch local depois. Conferir o estado da PR antes de concluir que
  falhou, e deixar o worktree em HEAD destacado pra nao brigar com a sessao vizinha.

### 7. Aberto

**PH-408** — `src/data/remote/confirmacaoDaTrocaNoCliente.test.ts` estoura o timeout de 5s no
primeiro caso, por `await import()` dentro dele. Mesma classe que a PH-404 corrigiu em
`reordenarReservas`. Reproduz na `origin/dev` limpa (confirmado com stash), e **a CI passa** — ou
seja, o gate nao protege contra essa classe, so nao dispara no runner. Vale varrer todos os
arquivos com `await import()` no primeiro `it()` em vez de consertar um por um.

**Custo aceito e nao consertado:** a camera passeia bem mais agora (o par se afasta ate ~200px da
origem do duelo). `renderer.ts#_computeCamera` trava no jogador SEM suavizacao nenhuma, entao o
quanto o par anda e o quanto o fundo inteiro anda junto. E consequencia inseparavel do pedido —
se o ponto final muda, o par sai do lugar. O botao barato e `COLEIRA_DA_ENCARADA`; o conserto de
raiz seria suavizar a camera, e isso nunca foi pedido.
