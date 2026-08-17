# 05 — Regras de negócio

Todo número citado aqui vem com o símbolo que o declara. **Conferir o símbolo antes de
decidir balanceamento em cima deste texto** — ver [13](13-divergencias-conhecidas.md) para o
que acontece quando isso não é feito.

## Progressão

### EXP

`expRewardForEnemy(enemyPoke, winnerLevel)` = `EXP_GAIN(baseExp, level, winnerLevel)` ×
`XP_GLOBAL_MULTIPLIER` (`progressionSystem.ts`, fallback **0.1**).

`winnerLevel` é parâmetro **obrigatório**, de propósito — um default (`= enemyPoke.level`,
por exemplo) faria a fórmula parecer funcionar em todo call site novo enquanto devolvia
sempre o valor de nível empatado, o **máximo** da curva, sem ninguém notar o excesso de XP.

`EXP_GAIN` é a fórmula escalada de Ultra Sun (Gen VII, ver [02](02-dados-e-catalogo.md)):
`floor(baseExp × level / 5 × ((2×level + 10) / (level + winnerLevel + 10))^2.5) + 1`. Ela
**pune farm abaixo do próprio nível**: o termo escalado vale exatamente 1 quando os níveis
empatam (POKE Lv90 contra alvo Lv90 rende o EXP "cheio"), mas cai para ~1.6% quando o alvo
está muito abaixo do POKE (Lv90 contra Lv5) — pressão real para subir de zona em vez de
farmar hunt fácil pra sempre.

`0.1` desfaz o fator de escala da fórmula nova no ponto de nível empatado: a Gen VII rende
7/5 = 1.4× o valor da fórmula antiga nesse ponto, e `0.14 / 1.4 = 0.1` mantém o XP contra
alvo do próprio nível igual ao de antes da troca de fórmula — só o resto da curva mudou.
`expRewardForEnemy` alimenta o POKE **e** o Treinador (`simulation.ts` soma o mesmo valor nos
dois; o nível do Treinador não entra na conta).

### A curva do POKE tem 30% a mais que a do Treinador

`pokeExpForLevel(level, curve)` = `totalExpForLevel(level, curve)` ×
`POKE_EXP_REQUIREMENT_MULTIPLIER` (`data/pokes.ts`, fallback **1.3**).

Função **separada**, e não um multiplicador dentro de `totalExpForLevel`, porque o Treinador
usa a mesma máquina de curva: encarecer lá dentro deixaria o nível de treinador 30% mais
lento junto.

O Treinador não tem curva própria — usa `MEDIUM_SLOW` fixa como referência.

**Regra que fecha um bug caro:** todo cálculo de progresso de POKE passa por
`pokeExpForLevel`; `totalExpForLevel` cru só serve para o Treinador.

`expProgressForInstance` — a barra de EXP — ficou na curva crua depois que o requisito ganhou
o multiplicador. A barra enchia 30% antes do limiar real e ficava parada em 100%. Reportado
como "chega a 100% e o level up não dispara"; não era `>` contra `>=` nem arredondamento,
eram duas curvas diferentes. Uma barra cheia sem level-up não lança exceção nem loga nada —
o jogo só parece travado. Por isso virou teste (`progressionSystem.test.ts`).

### Morte custa EXP

`DEATH_EXP_LOSS_PERCENT` (fallback **0.05**) = 5% do EXP necessário para o **nível atual**,
não do EXP cumulativo total. Pode causar level-down.

`pokeInstance.minLevel` é o piso: um POKE evoluído nunca de-evolui, mesmo depois de
level-down.

### Level-up mostra ganho de atributo

`grantExp` devolve `statGains` — o delta do bloco inteiro de level-ups daquela chamada (que
pode ser mais de um nível). Calculado lá porque só lá existem os dois lados da comparação.
`formatStatGains` devolve string vazia quando nada subiu: em curva lenta um level-up pode não
mover atributo nenhum, e "ganhou: " sem nada depois pareceria bug.

## Evolução

Evolução é 100% por **nível** (`species.evolvesAtLevel`, da planilha). Não existe gatilho de
troca, felicidade ou item segurado no dado original.

### Evolução especial (as 9 cadeias de troca)

Para as espécies cuja evolução na Gen 1/2 exigia **troca**, a planilha nunca preencheu
`evolvesTo` — ficariam presas para sempre. Quais das 251 são trade-only vem de conhecimento
de Pokémon Gen 1/2, não da planilha (que não tem coluna de "método de evolução").

`data/pokes.ts#SPECIAL_EVOLUTIONS` costura 9 pares no `SPECIES` já construído, uma vez no
load: kadabra, machoke, haunter, graveler, onix, scyther, seadra, poliwhirl, porygon.

Custo: **nível 80** (`SPECIAL_EVOLUTION_LEVEL`) + **20 Stones** do tipo primário
(`SPECIAL_EVOLUTION_STONE_COUNT`). O tipo **primário**, ignorando o secundário — desempate
explícito.

`evolvePokeInstance(pokeInstance, gameState)` devolve três coisas distintas:

| Retorno | Significado |
|---|---|
| `null` | Nível não atingido |
| `{ blocked: 'stones', required }` | Nível ok, faltam Stones. **Inventário intocado** |
| `{ species, newAbilities, updatedPoke }` | Evoluiu, Stones deduzidas |

Slowpoke → Slowking (o único dos 10 casos reais de trade-evolution fora) **não** foi
implementado: Slowpoke já evolui por nível para Slowbro (dado real), e o modelo só suporta
um `evolvesTo` por espécie. Não é dead-end para consertar — é uma segunda opção de evolução
que este sistema nunca teve como representar.

### Armadilha ao evoluir tarde

`evolvePokeInstance` só herdava `unlockedAbilities` do POKE pré-evolução. Como a espécie
evoluída aprende em níveis diferentes, um POKE que evoluísse **depois** do nível de um golpe
novo nunca o ganhava. Hoje, após trocar `speciesId` e `stats`, roda o laço de desbloqueio
para **todos** os golpes de `newSpecies.abilities` com `levelReq <= level` ainda não
desbloqueados.

## Stones

`data/stones.js` — 17 itens "Pedra {TIPO}", um por tipo elemental deste dataset (sem FAIRY,
que é da Gen 6 e não existe aqui). Escritos à mão: não há item real 1:1 com os 17 tipos na
planilha.

Um ícone base para todas (`assets/item-icons/type_stone.png`), com distinção por borda
colorida (`itemIconBorderColor` usa `colorForType`) — não existem 17 sprites no pack.

Estão em `ITEMS` (a Mochila e a Loja as tratam como item comum) mas **fora do `SHOP_STOCK`**:
nunca compráveis, só drop.

Drop: `STONE_DROP_CHANCE` (`economySystem.ts`, fallback **0.05**) por abate, do tipo primário
da vítima, **independente** da tabela `itemDrops` da hunt. Todo POKE de toda hunt dropa.

## Raridade

Eixo **independente** de espécie e hunt, sorteado por instância — mesmo espírito do roll de
shiny. `data/rarity.ts`, tabela fixa (6 linhas, não um escalar; por isso não é
spreadsheet-driven).

| Raridade | Peso | × atributo | × venda | Cor |
|---|---|---|---|---|
| Comum | 69 | 1 | 1 | `#9aa0a6` |
| Incomum | 22.7 | 1.15 | 3 | `#4ade80` |
| Raro | 7 | 1.35 | 10 | `#60a5fa` |
| Ultra | 1 | 1.7 | 40 | `#a78bfa` |
| Legendary | 0.25 | 2.2 | 150 | `#d4a017` |
| Mythic | 0.05 | 3 | 600 | `#e0348c` |

Pesos somam 100 — é porcentagem direta.

`rarityOf(poke)` centraliza o fallback para `comum`: save anterior ao recurso não tem
`poke.rarity`, e toda leitura passa por ela, então POKE antigo vira Comum sem migração
nenhuma.

`RARITY_ORDER` / `rarityRank()` são um rank ordinal **distinto do `weight`**, que corre para
o lado contrário (mais comum = peso maior). Usado para ordenar listas.

`realceDaRaridade(poke)` devolve `{ texto, cor }` — a **palavra** ("RARO") pintada, não o
nome do POKE. Pintar o nome confundia duas informações: quem lê não sabia se o azul falava da
espécie ou da raridade.

## Shiny

Chance: `(catchRate / 255) × (1 / 8192) × SHINY_RATE_MULTIPLIER` — `data/pokes.ts`, fallback
**100**.

A proporcionalidade por `catchRate` é a fórmula original documentada do projeto. O
multiplicador é o knob: já foi 200, hoje 100 (shiny 2x mais raro; a fórmula não mudou).

`SHINY_STAT_MULTIPLIER = 1.5` — multiplica os atributos finais.

**Atributos são recalculados na carga** (`playerMapper#rowToPoke`), não lidos das colunas
`stat_*`. Eles são determinísticos a partir de (espécie, nível, IVs, raridade, shiny) — tudo
que a linha já guarda —, então as colunas são cache, não verdade. Sem isso, uma mudança no
multiplicador só valeria para shinys criados depois, e o jogador teria dois shinys idênticos
com atributos diferentes e nada no jogo explicando. O HP é clampado no novo máximo:
recalcular para baixo deixaria a barra acima de 100% e o auto-poção nunca dispararia.

Regras de shiny na UI e na economia:

- Venda de shiny exige confirmação e fica **fora** do "Vender Tudo" e da seleção em massa.
- No canvas, o nome e nível refletem shiny com ✨ e texto roxo direto no `fillText` — o
  canvas não usa as classes CSS dos menus.

## Atributos

`computeStatsAtLevel(species, level, ivs, rarityKey, isShiny)`.

Os quatro pontos que recalculam atributos passam a raridade e o shiny:
`createPokeInstance`, `captureSystem`, `progressionSystem#grantExp` e
`progressionSystem#evolvePokeInstance`. **Nunca recalcula do zero como Comum.**

IVs: 0 a 31 (`IV_MAX`), 6 atributos.

Inicial: `STARTER_IVS` = 23 em cada atributo (75% de 31), `STARTER_RARITY = 'comum'`,
`STARTER_LEVEL = 1`. Fixos de propósito — a escolha do inicial não é uma loteria.

`createPokeInstance(rng, speciesId, level, { ivs, rarity })` — o terceiro parâmetro pula
`rollIvs()` / `rollRarity()`.

### Aura: IV 31 num atributo dá contorno neon

`data/auraColors.ts`. HP verde, Atk Físico vermelho, Atk Especial roxo, Defesa cinza, Def
Especial azul, Velocidade amarelo.

`drawAura` desenha a **silhueta**, não um retângulo: pega o recorte do quadro atual e o
desenha com `shadowColor`/`shadowBlur` sem offset, então o canvas borra a forma real de alpha
e o halo abraça patas, orelhas e cauda. A versão anterior usava `strokeRect` no bounding-box,
e com o padding transparente dos quadros PMD lia como "moldura".

Com mais de um atributo máximo, `globalCompositeOperation = 'lighter'`: verde + vermelho vira
amarelo onde os halos se encontram, e cada cor continua reconhecível na borda onde só ela
alcança. Com uma aura só, modo normal (aditivo sobre fundo claro lavaria a cor).

## Captura

`attemptCapture(rng, gameState, defeatedPoke, ballItemId)`.

Chance = `CATCH_CHANCE(catchRate, ballMultiplier, catchMultiplier)` da planilha, clampada em
[0, 1].

A bola é consumida **antes** do sorteio.

O POKE capturado entra na mochila no **nível 1** (`CAPTURE_LEVEL`), seja qual for o nível
selvagem em campo. IVs, raridade e shiny do selvagem são preservados; nível, EXP, uid e
golpes desbloqueados são recalculados.

`uid` novo vem de `novoPokeUid()` (`crypto.randomUUID`) — a mesma fonte de
`createPokeInstance`. Substituiu um `Date.now() + Math.random()` que, além de não ser uuid,
podia colidir em duas capturas no mesmo milissegundo.

`originalTrainer` é gravado **aqui**, no instante em que o POKE muda de dono, e nunca
reescrito. `defeatedPoke` é o POKE selvagem, que não tem treinador.

### `original_trainer` não é derivável do dono

Coluna própria em `pokemon_instances`. Não sai de `players.trainer_name` pelo `user_id`
porque o nome do dono responde "de quem é agora" e pode mudar. O registro de captura precisa
ser imutável, e continuaria correto se um dia existir troca entre jogadores.

**Hoje os dois valores coincidem sempre** (não há troca de POKE fora do mercado, que preserva
o campo). A coluna só se paga no ranking, onde aparece o POKE de outra pessoa. Registrado
para ninguém "otimizar" a coluna fora depois.

O **inicial** também grava o campo (`escolherStarter`, servidor e fallback): ele não passa
pelo `captureSystem` e seria o único POKE do jogador com o campo vazio, lendo como dado
faltando.

`pokeToRow` grava `poke.originalTrainer ?? null`, **não** `?? undefined`: com `undefined` a
chave some do JSON do upsert e o PostgREST mantém o valor antigo. Coincide hoje, mas campo
que "some" do payload é a forma clássica de perder dado sem erro nenhum aparecer — o mesmo
mecanismo do bug de `player_items` sem delete-diff.

## Economia

### As duas funções de valor de POKE, e por que não podem ser uma

```
pokemonBaseValue(level, baseExp, rarity)   →  POKEMON_SELL_VALUE × sellMultiplier
pokemonSellValue(level, baseExp, rarity)   →  MIN_POKEMON_SELL_VALUE + pokemonBaseValue(...)
```

`awardKillLoot` usa **`pokemonBaseValue`** (sem piso). Os quatro pontos de venda e o balanço
do relatório de farm offline usam `pokemonSellValue` (com piso).

Aplicar o piso na função única inflaria o **ouro por abate** junto, porque ele deriva do
mesmo número (`MONEY_FOR_KILL = sellValue / killDivisor`). Medido: o ouro por abate na hunt
inicial saltaria de ~5 para ~330 — inflação de farm de ~60x que ninguém pediu.

O piso é **soma, não `max`**: `1000 + modificadores`, não `max(1000, modificadores)`. Com
`max`, os 1000 engoliam tudo até a fórmula passar de 1000 sozinha — na prática, um POKE comum
de nível 40 valia o mesmo que um de nível 1.

`economySystem.test.ts` tranca as duas propriedades: a venda do POKE mais fraco possível dá
exatamente 1000, `awardKillLoot` do mesmo POKE fica abaixo de 100, e o nível vale desde o
primeiro ponto. Sem o teste, a próxima refatoração que "simplificar" as duas funções numa só
passa despercebida — o sintoma é uma diferença estatística de ouro por hora, não um erro.

**Consequência de balanceamento assumida:** com o piso, capturar e vender rende muito mais
que matar. Medido em 40 minutos na hunt inicial: 84 abates = 980 de ouro; 21 capturas do
mesmo período = 21.000+ vendendo. ~21x. É o efeito direto do número pedido, com o ouro por
abate deliberadamente intocado.

### Ouro por abate

```
baseGold = MONEY_FOR_KILL(sellValue, killDivisor)
gold     = baseGold × KILL_GOLD_MULTIPLIER (5) × GOLD_GLOBAL_MULTIPLIER (1)
```

Mínimo de 1.

### Itens

**19** itens no catálogo (`src/data/generated/items.generated.ts`, gerado do catálogo Ultra
Sun — ver [02](02-dados-e-catalogo.md)): 4 `ball`, 4 `potion`, 2 `revive`, **6 `status_heal`**
(entraram junto com os status de combate — Antidote e afins, cada um cura o status
correspondente), 3 `rod`. A Loja vende os **16** que não são `rod`
(`KINDS_FORA_DA_LOJA = new Set(['rod'])`, `data/items.ts`); varas sincronizam mas a pesca não
é implementada (fora de escopo).

`sellPrice` é sempre **derivado** de `SELL_ITEM_PRICE(buyPrice, SELL_ITEM_FRACTION)`, nunca
armazenado — mexer na fração rebalanceia todo item de uma vez.

**Desconto de 70% na compra de bola, poção e cura de status** (`BALL_POTION_BUY_DISCOUNT`,
fallback 0.7, `KINDS_COM_DESCONTO = new Set(['ball', 'potion', 'status_heal'])`), aplicado em
`data/items.ts` e não no dado gerado (regra do projeto: `*.generated.ts` é sobrescrito e o
catálogo de origem não é editado por script nenhum).

**O desconto entra ANTES do `sellPrice`, e isso não é detalhe:** venda é 50% da compra.
Descontar só a compra deixaria a Poke Ball custando 60 e vendendo por 100 — impressora de
ouro com dois cliques. Conferido: compra 60, venda 30.

### Conta nova

Definido em `concessao_inicial_de_itens()` (migration), um lugar só. `handle_new_user` e os
dois wipes leem dela.

| Recurso | Valor |
|---|---|
| Ouro | 1.000 |
| Diamantes | 0 |
| Poke Ball | 500 |
| Potion | 500 |
| Revive | 50 |
| Hunts liberadas | todas sem `unlock_cost` |
| Auto-captura / auto-revive | desligados |
| Auto-poção | ligado, 70% |

**A lista é de ids literais**, não `where kind in ('ball','potion','revive')`. "Toda bola e
poção do catálogo" daria 10 itens em vez de 3.

Conta que já existe **não** é tocada pela função — regravar o inventário de quem joga há
semanas apagaria o que a pessoa juntou. Compensação de mudança de concessão vai por Correio,
com anexo coletável.

### Cadeado contra venda

`poke.locked` (boolean) e `gameState.lockedItems` (`{ itemId: true }`).

`lockedItems` é um objeto simples, **não um `Set`**, de propósito: `Set` vira `{}` no
`JSON.stringify` do save.

Recusado em `sellBagPoke`, `sellAllBagPokes`, `sellItem` e `sellAllItems` — defesa em
profundidade, já que a UI também exclui o travado do lote (mesma regra do shiny).

Item travado vai para o **fim** da lista ordenada, com desempate por nome: sem isso,
destrancar mandaria o item para uma posição aleatória em vez de devolvê-lo ao lugar.

## Automação

| Toggle | Padrão | Constante |
|---|---|---|
| Auto-poção | ligado, 70% de HP | `DEFAULT_AUTO_POT_RULES` |
| Auto-captura | desligado | — |
| Auto-revive | desligado, delay 5s | `AUTO_REVIVE_DELAY` |

`COOLDOWN_DO_TREINADOR = 1.5` (`autoSystem.ts`) — intervalo mínimo entre ações do bot
(poção, revive, e cura de status desde a leva de itens `status_heal`); um único cooldown
compartilhado, não um por tipo de ação.

`BEST_POTION_OPTION = 'best'` não é um item: é a instrução "escolha a melhor poção
disponível". O estoque relevante nela é a **soma** das poções.

**Hunts BOSS não têm rede de segurança.** `isBossHunt = Boolean(world.mapDef?.noRespawn)` —
o campo marca as 11 hunts BOSS de lendário **e** a hunt do Campeão Lance (`noRespawn: true`
nos dois casos, `nightmareMaps.ts`), **12** hunts ao todo. Com ele, auto-poção, auto-revive e
a contagem de revive são pulados **independente** dos toggles. Morte em BOSS é definitiva
naquela visita.

### Alerta de consumível acabando

`components/auto/estoqueBaixo.ts` — `itensEmUso()` lista só o que uma automação **ligada**
consumiria. Alertar sobre bolas com auto-captura desligada treinaria o jogador a ignorar o
alerta.

Aparece em dois lugares: o badge dentro do painel e o **botão "auto"** — o painel fica
fechado quase o tempo todo, e um aviso que só aparece depois de abrir chega tarde demais.

O alerta no chat dispara na **borda** (cruzou o limiar), nunca continuamente: o estado é
checado a cada mudança do save, que num combate ativo acontece várias vezes por segundo.
Libera de novo quando o estoque sobe.

`@keyframes pulso-alerta` anima opacidade e `box-shadow`, **nunca `transform`**: o badge fica
em fluxo ao lado de outros controles e escalar faria os vizinhos dançarem. Desligado sob
`prefers-reduced-motion` — piscar contínuo é exatamente o que essa preferência existe para
desligar; a cor de alerta fica, que é ela quem carrega a informação.

## Categoria de golpe ancorada no nível 50

`resolveAbilityCategory` (`data/abilityCategory.ts`) compara os atributos que o POKE tem
**exatamente no nível 50**, não os atuais.

Antes a categoria oscilava — Físico no 50, Especial no 63 (crescimento desigual), Físico de
novo depois de uma evolução — e isso muda a fórmula de dano **e** a cor da moldura do slot no
meio do jogo.

O snapshot é **derivado, não gravado**: `computeStatsAtLevel` é determinística sobre campos
que o POKE já carrega e o banco já persiste. Gravar exigiria coluna nova, backfill de todo
save existente e mais um caminho de escrita no level-up.

Usa a espécie **atual** de propósito: a chave do golpe de nível 50 vem do tipo primário da
espécie atual, então congelar os atributos de uma pré-evolução enquanto o golpe segue a
evolução deixaria os dois discordando.

Módulo separado por **ciclo de import**: `pokes.ts` importa `abilities.ts`, então
`abilities.ts` não pode importar `pokes.ts` de volta.

Golpes de nível 50 têm PP 7 (`TYPED_AOE_PP`) — e como PP é a única entrada do cooldown, a
recarga é de ~4s.
