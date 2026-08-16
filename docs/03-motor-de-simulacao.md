# 03 — Motor de simulação

O motor é a única implementação das regras do jogo. Ele roda idêntico em três contextos:

| Contexto | Passo | Silencioso |
|---|---|---|
| Combate ao vivo no navegador | 1/60s (`useGameLoop`) | não |
| Catch-up de aba oculta | `OFFLINE_SIM_STEP_SECONDS` (0.1s) | sim |
| Servidor de autoridade, a cada flush | 0.1s | sempre |

`{ silent: true }` pula os efeitos visuais, os avisos e o `saveGame()` por abate — nunca a
lógica. XP, ouro, loot e captura acontecem igual nos três. É isso que faz o farm offline
ser fiel: ele **é** o jogo, só sem desenhar.

## Ciclo de um passo

`stepWorld(world, dt, gameState, opts)`:

1. Movimento — perseguição, wander, retorno ao spawn
2. Combate — escolha de golpe, cooldown, resolução de dano
3. Animação — pose, direção, quadro
4. Automação — poção, revive, captura
5. Respawn — reposição de inimigos abatidos
6. Efeitos — envelhecimento e limpeza

Estados de entidade: `wander` → `chase` → `engaged` → `dead`.

## Movimento (`movementSystem.ts`)

O jogador livre busca o inimigo vivo mais próximo. Persegue por `aggroRadius`, gruda por
`leashRadius` depois de entrar em `chase`/`engaged`, e engaja a `engageRange`
(raio + raio + `MELEE_RANGE_PADDING` = 10).

**Todo engajamento é corpo a corpo.** O bônus de alcance de 3x para golpes especiais foi
removido: físico ou especial, o POKE só ataca perto do alvo.

**Foco automático em shiny**: havendo shiny vivo na hunt, o jogador troca de alvo na hora,
por cima de qualquer perseguição em andamento.

Inimigo sem alvo faz `wanderStep` em torno do próprio `spawnPoint` (raio `wanderRadius`), e
volta para o spawn se se afastar demais.

**O limite caminhável é circular, não retangular.** `mapWalkRadius(mapDef)` =
`min(bounds.width, bounds.height) / 2` — o círculo inscrito na menor dimensão, centrado. O
wander do jogador amostra **por área** (`sqrt(random()) * radius`), não só por raio; sem
isso, os pontos se concentrariam no centro. `moveToward` (perseguição e combate) segue sem
clamp — não era requisito nem existia na versão retangular.

Não há marcação visual do limite. A borda preta foi removida.

`src/core/pathfinding.ts` faz busca em grade com teto de `MAX_EXPANSIONS = 4000`, recalculando
a cada `PATH_RECALC_INTERVAL` (1s) ou quando o alvo se desloca além de `PATH_TARGET_DRIFT`
(60) / `PATH_TARGET_BIG_JUMP` (150).

Velocidades: `PLAYER_MOVE_SPEED = 91` e `ENEMY_MOVE_SPEED = 58.5` px/s — independentes do
atributo de Velocidade, que afeta cooldown de golpe, não deslocamento.

## Combate (`combatSystem.ts`)

**Contínuo, sem turno alternado e sem prioridade de golpe.** Cada POKE age assim que estiver
pronto (fora de cooldown); não existe fila nem ordem especial entre atacantes — golpes reais
de prioridade (ex. o que faria Investida Rápida agir sempre primeiro) não têm efeito disso
aqui. `TURNO_SEGUNDOS` (`abilities.ts`, fallback 2s) é só a unidade de tempo usada nas
durações abaixo (status, escudo, trava) — não um turno de batalha de verdade. Só ataca com
`engagedEnemies` (parado, sem perseguição durante o dano).

**Duas IAs de escolha de golpe**, por `entity.kind` (`pickAbility`):

- **Selvagem** (`pickAbilityGreedy`): entre golpes prontos, usa um de apoio (status/buff/
  escudo/hazard) se `golpeDeApoioUtil` disser que vale a pena AGORA (não reaplica status já
  presente, não reergue escudo já de pé, etc.) e o melhor golpe de dano não bastaria pra
  matar o alvo neste instante; senão restringe a golpes AOE se algum atingiria 2+ alvos, e
  dentro do que sobrar escolhe o maior **dano esperado** (`danoEsperado` = dano estimado ×
  chance de acerto).
- **POKE do jogador** (`pickAbilityDaFila`): percorre os até `MAX_ACTIVE_ABILITIES` (4,
  `activeAbilities.ts`) golpes escolhidos pelo jogador, em ORDEM FIXA — tenta o próximo da
  fila assim que pronto, pulando (sem gastar a vez) um golpe de apoio que não faria nada
  agora. Não prioriza AOE sozinho.

Os dois caem em `BASIC_ATTACK` (o "Struggle" embutido) como fallback final — nenhuma espécie
em nenhum nível fica sem golpe utilizável.

### Acerto ou erro (`golpeErrou`)

```
precisaoEfetiva = ability.accuracy × multAccuracy(atacante) / multEvasion(defensor)
erra se precisaoEfetiva < 100 e roll(0-100) >= precisaoEfetiva
```

Precisão/Evasão são um EIXO SEPARADO dos estágios normais de Atk/Def/Speed — fórmula própria
de base 3 (`multiplicadorDeAccuracyOuEvasion`, `statusEffects.ts`), não a de base 2 do resto.
`ability.accuracy >= 100` nunca erra (o Ataque Básico é um). Uma rolagem por USO, não por alvo
atingido num AOE. Lock-On/Mind Reader zeram a rolagem no próximo golpe contra o alvo marcado;
Foresight/Miracle Eye/Odor Sleuth fazem o atacante ignorar a Evasão do defensor dali em diante.

### Pipeline de dano (`computeDamage`)

Golpes de **dano fixo** (Seismic Toss/Night Shade = nível do usuário; Dragon Rage = 40 flat;
Super Fang = metade do HP atual do alvo; Horn Drill/Fissure existem na tabela mas ficam fora
de `isDamagingAbility`, nunca selecionáveis — sem accuracy dedicada pra equilibrar um OHKO)
pulam a pipeline inteira, exceto a imunidade de tipo. Golpe normal:

```
DAMAGE_BASE(nível, power, atk×estágio, def×estágio)
  → queimadura (½ se atacante queimado E golpe físico)
  → STAB (×STAB_MULTIPLIER se o tipo do golpe bate um dos tipos do atacante)
  → trait de HP baixo (Blaze/Torrent/Overgrow/Swarm, ×1.5 abaixo de 1/3 do HP máx)
  → Flash Fire (×1.5 nos próprios golpes FIRE, depois de absorver um)
  → efetividade de tipo (typeChart.generated, multiplica os dois tipos do defensor)
  → clima (chuva/sol: ±50% em WATER/FIRE)
  → Multiscale (×0.5 se defensor no HP máximo EXATO)
  → Reflect/Light Screen (×0.5 por categoria, se o escudo estiver de pé)
  → crítico (ver abaixo)
  → variação (DAMAGE_VARIATION, planilha — uniforme 0.85 a 1.00)
```

`atk`/`def` escolhidos por `resolveAbilityCategory` (`abilityCategory.ts`) — físico usa
atkFis/def, especial usa atkEsp/defEsp; o golpe de nível 50 usa o maior dos dois Ataques do
PRÓPRIO usuário, fixado no valor que ele tinha no nível 50 (não o atual — ver
[05](05-regras-de-negocio.md#categoria-de-golpe-ancorada-no-nível-50)). Cada stat de Atk/Def
já entra multiplicada pelo próprio estágio (base 2: +1 = 1.5x, −1 = 0.67x) e por Traits que
multiplicam Atk/Def (`multiplicadorDeAtaquePorTrait`/`multiplicadorDeDefesaPorTrait`: Huge
Power/Pure Power ×2 atk, Hustle ×1.5 atk (com −20% de precisão nos próprios golpes físicos),
Guts ×1.5 atk enquanto statused, Marvel Scale ×1.5 def enquanto statused).

**Crítico**: `chanceDeCritico = CRIT_CHANCE × 3^min(3, estágiosDeCrítico)`, `CRIT_CHANCE`
(planilha, hoje 1/24) — satura em 50% a partir de 3 estágios. Focus Energy dá +2 estágios por
uso; alguns golpes já nascem com +1 (`ability.critStages`). `CRIT_MULTIPLIER` (planilha, hoje
1.5x). Lucky Chant torna o usuário imune a crítico recebido, mesmo contra um garantido por
Laser Focus; Laser Focus garante crítico no próprio próximo golpe de dano.

**Modo pessimista** (`world.pessimista`, ligado só pelo servidor em flush de ausência): crítico
forçado a `false`, variação fixada no piso (`DANO_VARIACAO_MINIMA` = 0.85). É isso, e só isso
— ver [07](07-farm-offline.md) para por que fixar o spawn foi tentado e rejeitado.

Resultado sempre `Math.max(1, round(...))`, ou `0` se o defensor for imune ao tipo.

### Traits (habilidades passivas de espécie — `data/traits.ts`)

Uma por espécie (`traitOf(speciesId)`), no máximo. **Não confundir com `Ability`** (golpe) —
o nome "Trait" existe só pra não colidir com esse vocabulário já ocupado.

39 das 53 `TraitId` têm mecânica real implementada em `combatSystem.ts`/`statusSystem.ts`:
imunidade de tipo (Levitate/GROUND), imunidade+absorção-e-cura (Volt Absorb, Water Absorb,
1/4 do HP máx), imunidade+estágio (Sap Sipper/Lightning Rod/Storm Drain/Motor Drive, +1),
Flash Fire, entrada em combate (Intimidate: −1 atkFis no oponente; Download: +1 no próprio
Atk mais forte contra a Defesa correspondente do oponente; Drizzle/Sand Stream/Snow Warning/
Drought: clima automático), contato (Static/Flame Body/Poison Point/Effect Spore: 30% de
status no atacante; Rough Skin/Iron Barbs/Aftermath: dano de retorno), multiplicadores de
stat (Huge Power/Pure Power/Hustle/Guts/Marvel Scale/Quick Feet — ver pipeline acima),
HP baixo (Blaze/Torrent/Overgrow/Swarm), Sturdy/Multiscale (condicionados a HP máximo exato),
Synchronize (reflete status recebido), Poison Heal (veneno cura em vez de ferir), Inner
Focus (imune a flinch). As **10 restantes** (Swift Swim, Chlorophyll, Sand Rush, Ice Body,
Sand Veil, Snow Cloak, Speed Boost, Moxie, Shed Skin, Rain Dish) existem no `TraitId` e têm
espécie atribuída, mas **sem mecânica nenhuma** — decorativas até o roster crescer o bastante
pra justificar implementar (comentário no topo de `traits.ts` explica a curadoria).

### Clima (`ClimaTipo`, 4 tipos: chuva/sol/granizo/areia)

Ligado por golpe (`CLIMA_DO_GOLPE`, `abilities.ts`) ou Trait de entrada; substitui o clima
anterior sem empilhar; dura `ESCUDO_DURACAO_TURNOS`-equivalente quando por golpe (5 turnos),
`Infinity` (até sobrescrito) quando por Trait. Chuva/sol dão ±50% em WATER/FIRE. Granizo/areia
tiram 1/16 do HP máximo por turno (`danoDeClimaPorTurno`, `statusSystem.ts`) de quem não tem
o tipo isento (ICE pro granizo; ROCK/GROUND/STEEL pra areia).

### Escudos (`Escudos`, campo `entity.escudos`)

Reflect (½ dano físico), Light Screen (½ dano especial), Safeguard (bloqueia status NOVO),
Mist (bloqueia queda de estágio vinda do OPONENTE), Lucky Chant (imune a crítico), Wide Guard
(cancela o próximo hit de AOE recebido) — sempre em quem usou, nunca redirecionado. Duração
fixa de 5 turnos, contando em segundos reais (não no relógio de turno da entidade). Quick
Guard existe no catálogo mas não faz nada — este motor não tem prioridade pra ele bloquear.

### Protect / Endure / Destiny Bond

Protect/Detect bloqueia por completo o próximo hit que mira em quem usou — golpes que miram o
próprio usuário (cura, buff em si) e uma lista curta (`PROTECT_BYPASS_ABILITY_IDS`: Endure,
Destiny Bond, Rest, Perish Song, ...) ignoram. Endure garante sobreviver com 1 HP no próximo
hit que seria letal — mesma garantia que a Trait Sturdy, mas por uso (não por HP máximo
exato). Destiny Bond: se o usuário morrer com o efeito ativo, o atacante morre junto, na
mesma resolução.

### Efeitos contínuos de dano/cura (campos voláteis em `WorldEntity`)

Leech Seed (drena 1/8 do HP máx do alvo por turno pra quem plantou, falha em alvo GRASS),
Curse — variante GHOST, não a de estágio — (custa 50% do HP MÁXIMO do usuário, tira 1/4 do
alvo por turno sem prazo), Nightmare (1/4 por turno, só enquanto o alvo dorme), Ingrain/Aqua
Ring (1/16 de cura própria por turno, sem prazo), Wish (agenda 50% de cura 2 turnos depois,
mesmo com troca de POKE ativo no meio).

### Golpes que travam o oponente

Taunt (3 turnos, proíbe golpe de status), Disable (4 turnos, tranca o último golpe usado),
Encore (3 turnos, força repetir o último golpe, cai pro Ataque Básico se ele entrar em
cooldown), Torment (3 turnos, proíbe repetir o mesmo golpe duas vezes seguidas), Spite (soma
4 turnos direto no cooldown do último golpe do alvo), Heal Block (5 turnos, bloqueia cura/
dreno positivo, não bloqueia recoil), Yawn (sono ATRASADO 2 turnos, tenta aplicar de verdade
respeitando imunidade normalmente nesse momento).

### Golpes de potência variável (`combatSystem.ts`, funções `roll*`/`*Power`)

Magnitude (tabela sorteada 10-150), Reversal/Flail (mais forte quanto menos HP restante),
Present (40/80/120 sorteado), Hidden Power (sempre NORMAL aqui — simplificação; potência 30-70
pela média dos IVs), Psywave (aleatório só pelo nível, ignora Atk/Def), Counter/Mirror Coat
(2× o último dano físico/especial sofrido em `COUNTER_MEMORY_WINDOW` = 3s; sem nada recente,
vira golpe genérico de poder 40).

### Auto-destruição e outras adaptações deliberadas

Explosion/Self-Destruct causam dano normal E custam `SELF_DESTRUCT_HP_LOSS_PERCENT` = 50% do
HP ATUAL do usuário (não desmaiam de verdade como nos jogos — sem essa adaptação, esses
golpes ficariam sem custo nenhum aqui). Soak força o TIPO do alvo pra WATER só pra
efetividade. Rage Powder existe no catálogo mas não faz nada — redireciona ataque num time de
2+ POKEs em campo, e este motor é sempre 1 POKE contra selvagens, sem aliado. Flinch é
modelado como cooldown global extra (não há "ordem de turno" pra furar); Inner Focus imuniza.

### Hazards de campo

Spikes (3 camadas), Toxic Spikes (2), Stealth Rock, Sticky Web — só o jogador arma (não há
conceito de "lado" pra um selvagem armar contra o jogador); aplicados a cada inimigo novo que
nasce na hunt via `simulation.ts#aplicarHazardsAoInimigo`.

### Reset de fim de combate

`limparEstadoVolatil` (`statusSystem.ts`): estágios, confusão, escudos, clima, travas (Taunt/
Disable/Encore/Torment), efeitos de dreno contínuo, e as flags de Protect/Endure/Destiny Bond
zeram ao sair de uma hunt. Status **não-volátil** (Envenenado/Queimado/Paralisado/Dormindo/
Congelado) **não zera** — sobrevive entre combates, como nos jogos originais. Ver
[status.generated.ts](../src/data/generated/status.generated.ts) (Gen VII, conferido na
Bulbapedia) pra duração/dano por turno/imunidade de cada um dos 6 status reais.

### Cooldown

O PP do golpe é a **única** entrada do cooldown na autoria: `cooldown = TURNO_SEGUNDOS *
(20 / PP)`. PP não é recurso consumível (decisão explícita, fora de escopo). Na hora do uso,
`scaledCooldown` ajusta pelo atributo de Velocidade contra `ATTACK_SPEED_REFERENCE`
(planilha, fallback 100) — na prática só recarrega mais rápido que o piso se a Velocidade
passar da referência. `MIN_ACTION_GAP` (= `TURNO_SEGUNDOS`) é o cooldown GLOBAL: nenhum
atacante age de novo antes disso, por mais rápido que seja, qualquer que seja o golpe.
`BASIC_ATTACK_COOLDOWN` (planilha, fallback 2s) é a única exceção — fixo, não escala com PP
nem Velocidade.

`HIT_LAND_DELAY` = `ATTACK_ANIM_DURATION` (0.5s) — o dano cai quando a animação termina, não
no instante da decisão.

### Continua fora de escopo, decisão explícita

Prioridade de golpe (nenhum golpe age antes de outro por "prioridade" — é por isso que Wide
Guard/Quick Guard existem no catálogo sem essa parte funcionar), multi-hit (golpe que acerta
2-5 vezes numa investida só), OHKO de verdade, pesca/varas, PP como recurso consumível. O
tooltip de golpe (`data/moveDescriptions.ts#AVISO_SEM_DANO`) ainda avisa em TODO golpe de
potência 0 como se nada dele funcionasse aqui — **isso ficou desatualizado com esta leva**:
Taunt/Leech Seed/Protect/Thunder Wave e dezenas de outros golpes de potência 0 têm efeito
real agora. Vale revisar esse aviso pra distinguir "sem efeito nenhum aqui" de "sem DANO, mas
com efeito real".

## Determinismo

Toda aleatoriedade sai de um PRNG semeado dentro do `WorldState`. Nada de `Math.random()`.

`src/core/rng.ts` — mulberry32. O estado de 32 bits cabe num único número, então serializa
junto com o mundo sem tratamento especial.

```ts
Rng = { state: number, draws: number }
```

`draws` conta sorteios — diagnóstico e checkpoint barato. `nextFloat(rng)` **muta** o rng de
propósito: ele vive no draft do immer, e mutar em lugar salva o avanço.

`randomSeed()` usa `crypto.getRandomValues`, não `Math.random()`: a semente não pode ser
adivinhável.

`randRange` / `randInt` / `rollChance` / `weightedPick` recebem `Rng` como primeiro
parâmetro, **sem default** — não há volta silenciosa para o não-verificável.

### Regras que a experiência impôs

- **A sequência atravessa trocas de cena.** `buildMapWorld` / `buildHospitalWorld` recebem
  `rng` e `counters` do mundo atual: a sessão é uma sequência só. Sem isso, cada ida ao
  Hospital reiniciaria o stream.
- **Estimar dano não consome a sequência.** `estimateDamage` (que só ranqueia candidatos)
  usa `deriveRng(rng.state, 'estimate')`, lendo o estado sem avançá-lo. Candidatos variam
  por nível e cooldown; gastando sorteios, a sequência verificada dependeria de detalhe
  interno da IA em vez de eventos de jogo. Mesma técnica no preview da Pokedex
  (`deriveRng(0, species.id)`).
- **`restoreRng` existe separado de `createRng`.** A distinção já custou um bug: o servidor
  refazia `createRng(seed)` a cada flush, e a sessão inteira virava a mesma sequência
  repetida — mesmos inimigos, IVs, raridade e shiny, a cada 30 segundos. Ver
  [04](04-autoridade-do-servidor.md).
- **`poke.uid` fica fora da sequência de propósito.** Vem de `crypto.randomUUID()`. É a
  chave primária de `pokemon_instances`: identidade de persistência, não resultado de
  simulação. Saindo da semente, dois jogadores com a mesma semente gerariam uids iguais e
  colidiriam na PK.

### O que o determinismo NÃO garante

Ele garante que a **sequência de sorteios** é reproduzível. **Não** promete replay bit a bit
entre máquinas: o motor usa `Math.sin` / `cos` / `atan2` no movimento, e o IEEE 754 não
especifica essas funções bit a bit — engines (e até versões da mesma engine) divergem no
último bit.

Qualquer verificação no servidor deve se apoiar nos **sorteios discretos** (shiny, IV,
raridade, crítico, captura, espécie e nível do spawn), que são inteiros ou comparações de
limiar, nunca em igualdade exata de coordenadas. Foi essa limitação que matou o plano
original de "servidor re-simula e compara" — ver [12](12-decisoes-descartadas.md).

## Simulação em lote (`offlineSimSystem.ts`)

`simulateWorldSeconds` roda `stepWorld` num laço apertado, em passos de
`OFFLINE_SIM_STEP_SECONDS` (0.1s), não uma vez por quadro.

Dois orçamentos independentes, porque uma simulação sem teto trava ou mata o aparelho:

| Limite | Valor |
|---|---|
| `DEFAULT_MAX_STEPS` | 250.000 |
| `DEFAULT_MAX_WALL_CLOCK_MS` | 2.500 |
| `CLOCK_CHECK_EVERY` | 512 passos |

250.000 passos é escolhido para o teto de 6h do farm offline caber no passo de 0.1s — zero
mudança de fidelidade no caso que o jogo realmente usa.

**Estourar o orçamento não descarta o resto do intervalo.** O passo é quadruplicado
(`COARSEN_FACTOR` = 4, até `MAX_COARSEN_ROUNDS` = 3 rodadas) e a simulação segue com menos
fidelidade. Perder precisão é melhor que perder as horas do jogador. Só se nem isso bastar
ela para, com `truncated: true`, e o relatório explica em vez de mostrar menos progresso do
que o tempo ausente sugeria.

`seconds` não finito ou negativo é recusado: um `while` com segundos negativos não termina.

A simulação para cedo (`stoppedEarly`) quando o POKE cai e não há como reanimá-lo. Ver
[07](07-farm-offline.md) para as consequências disso, que custaram uma leva inteira de
correção.

## Execução headless

`npm run build:engine` empacota o motor num ESM (`vite build --ssr`) que o Node importa
direto. É o que permite o servidor ser a simulação em vez de reimplementá-la.

Medido: **30 minutos de jogo simulam em 26ms** em Node. 6 horas (o teto do farm offline)
medem ~1,6s incluindo rede, numa invocação de Edge Function.
