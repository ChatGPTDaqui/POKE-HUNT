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

Só ataca com `engagedEnemies` (parado, sem perseguição durante o dano).

`pickAbility` pega o golpe pronto (fora de cooldown) de maior `power`, preferindo AOE se
atingiria 2 ou mais alvos. `BASIC_ATTACK` (o "Struggle" embutido) é sempre candidato como
fallback — nenhuma espécie em nenhum nível fica sem golpe utilizável.

### Pipeline de dano

```
DAMAGE_BASE → STAB → efetividade de tipo → crítico → variação
```

| Etapa | Origem |
|---|---|
| `DAMAGE_BASE` | fórmula da planilha |
| STAB | `STAB_MULTIPLIER` (planilha) |
| Efetividade | `typeChart.generated` |
| Crítico | `CRIT_CHANCE` / `CRIT_MULTIPLIER` (planilha) |
| Variação | `DAMAGE_VARIATION` (planilha), piso `DANO_VARIACAO_MINIMA` = 0.85 |

**Modo pessimista** (`world.pessimista`, ligado só pelo servidor em flush de ausência): o
crítico é forçado a `false` e a variação é fixada em `DANO_VARIACAO_MINIMA`. É isso, e só
isso — ver [07](07-farm-offline.md) para por que fixar o spawn foi tentado e rejeitado.

### Cooldown

O PP do golpe é a **única** entrada do cooldown: `cooldown = TICK_SECONDS * (20 / PP)`.
Menos PP, mais cooldown. PP não é recurso consumível (decisão explícita, fora de escopo).

`scaledCooldown` ajusta pelo atributo de Velocidade contra `ATTACK_SPEED_REFERENCE` (100).
`MIN_ACTION_GAP = 2` é um piso global: nenhum atacante age de novo antes disso, por mais
rápido que seja.

`HIT_LAND_DELAY` = `ATTACK_ANIM_DURATION` (0.5s) — o dano cai quando a animação termina, não
no instante da decisão.

### Casos especiais implementados

- **Auto-destruição** (`explosion`, `selfdestruct`): o usuário perde
  `SELF_DESTRUCT_HP_LOSS_PERCENT` = 50% do HP.
- **Magnitude**: tabela própria de potência sorteada (`MAGNITUDE_TABLE`).
- **Counter**: janela de memória de `COUNTER_MEMORY_WINDOW` = 3 segundos.
- **AOE**: marcado por chave de golpe em `data/abilities.ts#AOE_ABILITY_KEYS`, não pela
  planilha. Raio em `AOE_RADIUS`.

Fora de escopo, decisão explícita: status, alteração de atributo, prioridade, multi-hit,
recoil, dano fixo, "sempre acerta". O tooltip de golpe avisa automaticamente quando o
golpe tem potência 0 — que é exatamente o conjunto cujo efeito inteiro não existe aqui.

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
