// Nucleo de SIMULACAO — construcao de mundo, stepWorld, resolucao de kill.
//
// Separado de controller.ts (as acoes de UI) por um motivo concreto: este
// arquivo precisa rodar HEADLESS EM NODE, porque na Fase D o servidor passa a
// ser quem simula de verdade — o cliente vira predicao, como client-side
// prediction de FPS. Por isso aqui nao pode haver nenhum import de VALOR de
// `gameStateStore` (ele puxa o adaptador de persistencia -> lib/supabase ->
// `import.meta.env`, que so existe no bundle do navegador). `GameStateStore`
// entra so como TIPO, que o build apaga.
//
// `useToastStore` fica: e zustand puro, roda em Node sem problema. E, na
// pratica, o servidor simula sempre com `silent: true`, que ja pula toda
// notificacao daqui.
//
// Por que NAO verificar por re-simulacao (o plano original da Fase D dizia
// isso): o motor usa Math.sin/cos/atan2 no movimento e o IEEE 754 nao
// especifica essas funcoes bit-a-bit, entao navegador e Node divergem no
// ultimo bit — posicao diverge, instante de engajamento diverge, kill diverge.
// Um comparador acusaria jogador honesto. E re-simular pra conferir custa a
// MESMA CPU que simular; se vai gastar, gaste sendo a autoridade.
import { SPECIES, createPokeInstance, type PokeInstance } from '@/data/pokes'
import { getMap, mapWalkRadius, isCellBlocked, type MapDef } from '@/data/maps'
import { getEncounter } from '@/data/enemies'
import { getItem } from '@/data/items'
import { isDamagingAbility } from '@/data/abilities'
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from '@/data/generated/formulas.generated'
import { randInt, randRange, weightedPick } from '@/core/random'
import type { Rng } from '@/core/rng'
import { CAPTURE_ANIM_FRAME_DURATION, captureAnimRowCount } from '@/data/captureAnim'
import { rarityOf, realceDaRaridade } from '@/data/rarity'
import { formatStatGains } from '@/data/statLabels'

import { createPlayerEntity, createEnemyEntity, isDead } from './entity'
import { createWorldEffect } from './effect'
import { updateMovement } from './systems/movementSystem'
import { updateCombat } from './systems/combatSystem'
import { updateAnimations, tickAttackAnimTimers } from './systems/animationSystem'
import { updateAutoHeal, maybeAutoCatch } from './systems/autoSystem'
import { grantExp, expRewardForEnemy, grantTrainerExp, applyDeathExpPenalty } from './systems/progressionSystem'
import { awardKillLoot } from './systems/economySystem'
import { recordKill } from './systems/farmRates'
import { recordPokedexKill } from './systems/pokedexSystem'
import type { KillResult } from './systems/offlineSimSystem'

import type { GameStateStore } from '@/stores/gameStateStore'
import { emptyWorldState } from '@/stores/worldStore'
import { useToastStore } from '@/stores/toastStore'
import type { EnemyEntity, Point, WorldState } from './types'

export const STARTER_LEVEL = 1
// Starters sempre saem previsiveis — raridade Comum, IV 75% (23/31) em toda
// stat — em vez do roll aleatorio por-instancia normal, pra a primeira
// POKE de uma run nova nao ser um outlier de sorte.
export const STARTER_RARITY = 'comum' as const
export const STARTER_IVS = { hp: 23, atkFis: 23, atkEsp: 23, def: 23, defEsp: 23, speed: 23 }
export const DEATH_ANIM_GRACE_PERIOD = 4.0 // segundos que um inimigo derrotado fica visivel tocando a pose Faint

const formulaEngine = createFormulaEngine(FORMULAS)
export const OFFLINE_FARM_MAX_HOURS = formulaEngine.evalOrDefault('OFFLINE_FARM_MAX_HOURS', 6)
export const OFFLINE_SIM_STEP_SECONDS = formulaEngine.evalOrDefault('OFFLINE_SIM_STEP_SECONDS', 0.1)
export const MIN_CATCHUP_GAP_SECONDS = 5
export const MIN_OFFLINE_GAP_SECONDS = 60
// De quanto em quanto tempo o debito entre relogio de parede e tempo
// simulado e reconciliado. De proposito independente de qualquer evento de
// visibilidade — ver o comentario em App.tsx#useBackgroundCatchUp.
export const CATCHUP_CHECK_INTERVAL_MS = 10000
// Orcamento de tempo real mais curto que o do Farm Offline de boot: o
// catch-up roda com o jogo ja na tela, entao a pausa e sentida como travada.
// Como o simulador engrossa o passo em vez de descartar o resto do tempo
// (ver offlineSimSystem.ts), um orcamento menor custa fidelidade, nao tempo
// de jogo perdido.
export const CATCHUP_WALL_CLOCK_BUDGET_MS = 1200

export function shinyPrefix(isShiny?: boolean): string {
  return isShiny ? '✨ ' : ''
}

// ---------- Construcao de mundo ----------

// A sequencia de sorteios ATRAVESSA as trocas de cena: quem constroi um mundo
// novo passa o `rng`/`counters` do mundo atual, entao a sessao inteira e uma
// unica sequencia derivada de uma semente so. Sem isso, cada ida ao Hospital
// reiniciaria o stream com uma semente nova e o servidor (Fase D) teria que
// rastrear uma semente por cena em vez de uma por sessao.
export type SequenciaDeSorteio = Pick<WorldState, 'rng' | 'counters'>

function novoMundo(carry?: SequenciaDeSorteio): WorldState {
  const base = emptyWorldState()
  if (carry) {
    base.rng = { ...carry.rng }
    base.counters = { ...carry.counters }
  }
  return base
}

export function buildHospitalWorld(activePoke: PokeInstance | null, hospitalSpot: Point, carry?: SequenciaDeSorteio): WorldState {
  const base = novoMundo(carry)
  const player = activePoke ? createPlayerEntity(base.counters, { poke: activePoke, x: hospitalSpot.x, y: hospitalSpot.y }) : null
  if (player && isDead(player)) player.fainted = true
  return { ...base, player, enemies: [] }
}

const SPAWN_MIN_DISTANCE = 250
const SPAWN_MARGIN = 60
const SPAWN_POINT_MAX_ATTEMPTS = 40

function randomSpawnPoint(rng: Rng, mapDef: MapDef): Point {
  const cx = mapDef.bounds.width / 2
  const cy = mapDef.bounds.height / 2
  const radius = mapWalkRadius(mapDef) - SPAWN_MARGIN
  let x = cx, y = cy
  let attempts = 0
  do {
    const angle = randRange(rng, 0, Math.PI * 2)
    const dist = Math.sqrt(randRange(rng, 0, 1)) * radius
    x = cx + Math.cos(angle) * dist
    y = cy + Math.sin(angle) * dist
    attempts++
  } while (
    attempts < SPAWN_POINT_MAX_ATTEMPTS
    && (Math.hypot(x - mapDef.playerSpawn.x, y - mapDef.playerSpawn.y) < SPAWN_MIN_DISTANCE || isCellBlocked(mapDef, x, y))
  )
  return { x, y }
}

function spawnEnemyAt(world: SequenciaDeSorteio, mapDef: MapDef): EnemyEntity {
  const { rng, counters } = world
  const point = randomSpawnPoint(rng, mapDef)
  // Ponderado pelo TIER de spawn da especie, derivado da chance real de
  // encontro selvagem do Gen1/Gen2 (ver scripts/derive-spawn-tiers.js) — quem e
  // comum nos jogos reais aparece mais que quem e raro, dentro da mesma hunt.
  // Antes era a taxa de captura, que mede outra coisa.
  //
  // O SORTEIO E O MESMO NO MODO PESSIMISTA (farm offline). Uma versao anterior
  // fixava aqui o inimigo de maior nivel do pool, na ideia de que "o mais forte
  // sempre" seria o limite inferior. Media, era falso e quebrava o jogo de dois
  // jeitos (1h na Planicie, mesma semente):
  //
  //   sorteado  1213 kills, 305.005 ouro, 219 capturas de 28 especies
  //   fixado    1073 kills, 209.165 ouro, 332 capturas de  1 especie
  //
  //   1. A mochila voltava com 332 copias do MESMO POKE — o jogador farmava a
  //      noite inteira e recebia uma unica especie repetida. Foi assim que o
  //      bug apareceu.
  //   2. Capturar rendia MAIS offline que acordado, exatamente o contrario da
  //      regra. O inimigo fixo era Pidgey (o de maior nivel ali), que tem
  //      `catchRate` alto — fixar a especie fixa junto a chance de captura
  //      dela, entao "o mais forte" podia ser tambem "o mais facil de pegar".
  //
  // O limite inferior vem de onde ele e de fato monotonico: a RESOLUCAO do
  // combate (dano na variacao minima, zero critico — ver computeDamage), que so
  // faz matar mais devagar, nunca render mais. Composicao de especie e nivel
  // continua sendo a da hunt, entao o que volta na mochila e o que aquela hunt
  // realmente da. Contra a "sequencia de sorte" que a versao anterior temia, o
  // que protege e a escala: um flush offline sao milhares de kills, e a media
  // de milhares de sorteios nao desvia o bastante pra passar o jogo ao vivo.
  const encounterId = weightedPick(rng, mapDef.enemyPool, (id) => getEncounter(id)?.weight ?? 45)
  const encounter = getEncounter(encounterId)
  if (!encounter) throw new Error(`Encontro desconhecido: ${encounterId}`)
  // `levelWeights` (ver data/huntTypes.ts) troca o sorteio uniforme por um
  // ponderado — hoje so a hunt inicial usa, pra sair 80% Lv1 / 20% Lv2.
  const level = encounter.levelWeights?.length
    ? weightedPick(rng, encounter.levelWeights, (entry) => entry.weight).level
    : randInt(rng, encounter.minLevel, encounter.maxLevel)
  const poke = createPokeInstance(rng, encounter.speciesId, level)
  return createEnemyEntity(counters, { poke, x: point.x, y: point.y, encounterId })
}

const SEQUENCE_SPAWN_OFFSET_MIN = 60
const SEQUENCE_SPAWN_OFFSET_MAX = 150
function sequenceSpawnPoint(rng: Rng, mapDef: MapDef, base: Point): Point {
  const mapCx = mapDef.bounds.width / 2
  const mapCy = mapDef.bounds.height / 2
  const radius = mapWalkRadius(mapDef)
  let x = base.x, y = base.y, attempts = 0
  do {
    const angle = randRange(rng, 0, Math.PI * 2)
    const dist = randRange(rng, SEQUENCE_SPAWN_OFFSET_MIN, SEQUENCE_SPAWN_OFFSET_MAX)
    x = base.x + Math.cos(angle) * dist
    y = base.y + Math.sin(angle) * dist
    attempts++
  } while (
    attempts < SPAWN_POINT_MAX_ATTEMPTS
    && (Math.hypot(x - mapCx, y - mapCy) > radius || isCellBlocked(mapDef, x, y))
  )
  return { x, y }
}

function spawnSequenceEnemy(world: SequenciaDeSorteio, mapDef: MapDef, index: number): EnemyEntity {
  const { rng, counters } = world
  const encounterId = mapDef.sequence![index]
  const encounter = getEncounter(encounterId)
  if (!encounter) throw new Error(`Encontro desconhecido: ${encounterId}`)
  const base = mapDef.spawnPoints[0] || mapDef.playerSpawn
  const point = index === 0 ? base : sequenceSpawnPoint(rng, mapDef, base)
  const poke = createPokeInstance(rng, encounter.speciesId, encounter.minLevel, { rarity: encounter.rarity, ivs: encounter.ivs })
  return createEnemyEntity(counters, { poke, x: point.x, y: point.y, encounterId })
}

export function buildMapWorld(mapId: string, activePoke: PokeInstance, carry?: SequenciaDeSorteio): WorldState {
  const mapDef = getMap(mapId)
  if (!mapDef) throw new Error(`Mapa desconhecido: ${mapId}`)
  const base = novoMundo(carry)
  const player = createPlayerEntity(base.counters, { poke: activePoke, x: mapDef.playerSpawn.x, y: mapDef.playerSpawn.y })
  if (isDead(player)) player.fainted = true

  // Contagem regressiva de intro da Champion Lance (pedido explicito do
  // usuario): sua primeira POKE so nasce quando a fase de countdown do
  // stepWorld termina — toda outra hunt nao tem `startCountdown` e nasce
  // exatamente como antes.
  const enemies: EnemyEntity[] = []
  if (!mapDef.startCountdown) {
    if (mapDef.sequence) {
      enemies.push(spawnSequenceEnemy(base, mapDef, 0))
    } else {
      for (let i = 0; i < mapDef.maxEnemies; i++) {
        enemies.push(spawnEnemyAt(base, mapDef))
      }
    }
  }

  return {
    ...base,
    mapDef, player, enemies, effects: [], pendingHits: [],
    autoTimers: { pot: 0, revive: 0 },
    reviveCountdown: null,
    respawnTimer: mapDef.respawnDelay,
    sequenceIndex: 0,
    sequenceCleared: false,
    countdownRemaining: mapDef.startCountdown || null,
  }
}

// ---------- Resolucao de combate (EXP, loot, captura) ----------

// `silent` e usado pelos 2 sistemas headless de catch-up — as chamadas
// reais de XP/ouro/loot/captura sempre rodam de qualquer jeito, so os
// Effects visuais e os toasts sao pulados quando silent. Sempre devolve um
// resumo do que aconteceu pro chamador agregar (OfflineSimSystem).
export function handleEnemyDefeated(world: WorldState, enemy: EnemyEntity, gameState: GameStateStore, opts: { silent?: boolean } = {}): KillResult {
  const silent = opts.silent ?? false
  const player = world.player!
  // Autoritativo durante combate — ver nota de arquitetura no topo do
  // arquivo. NAO le gameState.activePoke aqui (poderia estar desatualizado
  // em relacao ao HP/EXP que a luta ja aplicou nesta hunt).
  const poke = player.poke
  const enemySpecies = SPECIES[enemy.poke.speciesId]

  const expGain = expRewardForEnemy(enemy.poke)
  const grantResult = grantExp(poke, expGain)
  player.poke = grantResult.poke
  gameState.updatePokeInstance(grantResult.poke.uid, () => grantResult.poke)

  const trainerResult = grantTrainerExp(gameState.trainer, expGain)
  gameState.setTrainer(trainerResult.trainer)

  const loot = awardKillLoot(world.rng, gameState, enemy, world.mapDef!)
  // Champion Lance (data/nightmareMaps.ts) proibe captura explicitamente —
  // seu `noCatch` e o unico lugar que isso e setado.
  const captureResult = world.mapDef!.noCatch ? null : maybeAutoCatch(world.rng, gameState, enemy.poke)
  recordPokedexKill(gameState, enemy.poke.speciesId, Boolean(enemy.poke.isShiny))

  if (!silent) {
    recordKill(gameState, { gold: loot.gold, xp: expGain, isShiny: enemy.poke.isShiny })

    world.effects.push(createWorldEffect(world.counters, {
      type: 'rewardText', x: enemy.x, y: enemy.y,
      targetX: enemy.x, targetY: enemy.y,
      value: expGain, unit: 'XP', color: '#4ade80', duration: 1.1, owner: enemy,
    }))
    world.effects.push(createWorldEffect(world.counters, {
      type: 'rewardText', x: enemy.x, y: enemy.y,
      targetX: enemy.x, targetY: enemy.y,
      value: loot.gold, unit: '🪙', color: '#fff59d', duration: 1.1, owner: enemy,
    }))

    useToastStore.getState().pushToast(
      `${shinyPrefix(enemy.poke.isShiny)}${enemySpecies.name} [${rarityOf(enemy.poke).label}] derrotado! +${expGain} EXP, +${loot.gold} ouro`,
      'gold', 'combat', realceDaRaridade(enemy.poke),
    )

    if (grantResult.leveledUp) {
      // O ganho numerico de atributo vai junto do aviso (pedido explicito):
      // sem ele o level-up so dizia "subiu de nivel" e o jogador precisava
      // abrir o perfil pra descobrir se aquilo valeu alguma coisa.
      const ganhos = formatStatGains(grantResult.statGains)
      useToastStore.getState().pushToast(
        `${shinyPrefix(grantResult.poke.isShiny)}${SPECIES[grantResult.poke.speciesId].name} subiu para o nivel ${grantResult.level}!${ganhos ? ` ${ganhos}` : ''}`,
        'levelup', 'combat',
      )
      for (const ability of grantResult.newAbilities.filter(isDamagingAbility)) {
        useToastStore.getState().pushToast(`Nova habilidade desbloqueada: ${ability.name}!`, 'levelup', 'combat')
      }
    }
    if (trainerResult.leveledUp) {
      useToastStore.getState().pushToast(`${gameState.trainer.name} subiu para o nivel ${trainerResult.level}!`, 'levelup', 'combat')
    }

    for (const itemId of loot.droppedItems) {
      const item = getItem(itemId)
      if (item) useToastStore.getState().pushToast(`Item encontrado: ${item.name}`, 'success', 'world')
    }

    // Animacao de arremesso de Pokebola — so pra uma tentativa de verdade.
    if (captureResult && 'ballItemId' in captureResult && captureResult.ballItemId) {
      const rowCount = captureAnimRowCount(captureResult.success)
      world.effects.push(createWorldEffect(world.counters, {
        type: 'captureAnim', x: enemy.x, y: enemy.y, targetX: enemy.x, targetY: enemy.y,
        ballItemId: captureResult.ballItemId, success: captureResult.success,
        delay: DEATH_ANIM_GRACE_PERIOD,
        duration: rowCount * CAPTURE_ANIM_FRAME_DURATION + 0.3,
      }))
    }

    if (captureResult) {
      if (captureResult.success) {
        const location = captureResult.location === 'bag' ? 'mochila' : captureResult.location
        // Raridade concatenada no relatorio (pedido explicito): ela multiplica
        // atributo e valor de venda em ate 600x, entao e o dado que decide se
        // aquela captura importou — e o chat era o unico lugar que nao dizia.
        const raridade = rarityOf(captureResult.poke).label
        useToastStore.getState().pushToast(
          `${shinyPrefix(enemy.poke.isShiny)}${enemySpecies.name} [${raridade}] capturado! Foi para a ${location}.`,
          'capture-success', 'world',
          // A raridade que vale e a da INSTANCIA capturada, nao a do inimigo em
          // campo: `attemptCapture` sorteia o POKE que entra na mochila.
          realceDaRaridade(captureResult.poke),
        )
      } else if (captureResult.reason === 'roll_failed') {
        useToastStore.getState().pushToast('A captura falhou!', 'capture-fail', 'combat')
      }
    }
  }

  return {
    gold: loot.gold,
    xp: expGain,
    leveledUp: grantResult.leveledUp,
    trainerLeveledUp: trainerResult.leveledUp,
    isShiny: Boolean(enemy.poke.isShiny),
    captured: Boolean(captureResult && captureResult.success),
    capturedPoke: captureResult && captureResult.success ? captureResult.poke : null,
    droppedItems: loot.droppedItems,
  }
}

// ---------- Tick de passo fixo ----------

// Compartilhado pelo loop ao vivo (silent:false) e os 2 sistemas headless
// de catch-up (silent:true, chamados em loop apertado por
// simulateWorldSeconds) — este e o UNICO lugar onde movimento/combate/
// auto-heal/respawn avancam. Devolve a lista de resumos por-kill.
export function stepWorld(world: WorldState, dt: number, gameState: GameStateStore, opts: { silent?: boolean } = {}): KillResult[] {
  const silent = opts.silent ?? false
  if (!world.player) return []

  if (!world.mapDef) {
    // Hospital: sem movimento/combate, mas o battle sprite continua animando.
    if (!silent) updateAnimations(world, dt)
    return []
  }

  // Contagem regressiva de intro da Champion Lance: movimento/combate/
  // respawn ficam congelados e nada nasceu ainda ate isso chegar a 0.
  if (world.countdownRemaining != null) {
    world.countdownRemaining -= dt
    if (world.countdownRemaining <= 0) {
      world.countdownRemaining = null
      if (world.mapDef.sequence) world.enemies.push(spawnSequenceEnemy(world, world.mapDef, world.sequenceIndex))
      else for (let i = 0; i < world.mapDef.maxEnemies; i++) world.enemies.push(spawnEnemyAt(world, world.mapDef))
    }
    if (!silent) updateAnimations(world, dt)
    return []
  }

  updateMovement(world, dt)
  const { defeatedEnemyIds, playerJustFainted } = updateCombat(world, dt)
  // attackAnimTimer precisa decrementar todo tick independente de `silent`
  // — MovementSystem trava movimento enquanto ele roda.
  tickAttackAnimTimers(world, dt)
  // Precisa rodar DEPOIS do combate: triggerAttackAnim (chamado de dentro
  // de updateCombat) precisa ser capturado no mesmo tick.
  if (!silent) updateAnimations(world, dt)

  const kills: KillResult[] = []
  if (defeatedEnemyIds.length > 0) {
    for (const enemyId of defeatedEnemyIds) {
      const enemy = world.enemies.find((e) => e.id === enemyId)
      if (!enemy) continue
      kills.push(handleEnemyDefeated(world, enemy, gameState, { silent }))
      enemy.deathRemovalTimer = silent ? 0 : DEATH_ANIM_GRACE_PERIOD
    }
  }
  for (const enemy of world.enemies) {
    if (isDead(enemy) && enemy.deathRemovalTimer != null && enemy.deathRemovalTimer > 0) enemy.deathRemovalTimer -= dt
  }
  // Regra da Champion Lance: POKEs derrotados ficam em campo como "corpos"
  // visiveis em vez de desaparecer apos o periodo de graca usual.
  world.enemies = world.enemies.filter((e) => !isDead(e) || (e.deathRemovalTimer ?? 0) > 0 || world.mapDef!.keepCorpses)

  if (playerJustFainted && world.player) {
    // Roda mesmo quando silent — mesma regra de todo outro pipeline de
    // recompensa/penalidade aqui, so o toast e ao-vivo-so.
    const penaltyResult = applyDeathExpPenalty(world.player.poke)
    world.player.poke = penaltyResult.poke
    gameState.updatePokeInstance(penaltyResult.poke.uid, () => penaltyResult.poke)
    if (!silent) {
      useToastStore.getState().pushToast(
        `${SPECIES[world.player.poke.speciesId].name} desmaiou!${penaltyResult.leveledDown ? ` Caiu para o nivel ${penaltyResult.level}.` : ''}`,
        'error', 'combat',
      )
    }

    // Regra da Champion Lance (autoSwitchTeamOnFaint): em vez do modal
    // "voce perdeu" de BOSS normal no primeiro desmaio, o proximo membro
    // de equipe nao-desmaiado entra em campo automaticamente.
    if (world.mapDef.autoSwitchTeamOnFaint) {
      const nextIndex = gameState.team.findIndex((p) => p.hp > 0)
      if (nextIndex !== -1) {
        gameState.setActiveIndex(nextIndex)
        const nextPoke = gameState.team[nextIndex]
        world.player.poke = nextPoke
        world.player.cooldowns = {}
        world.player.flashTimer = 0
        world.player.fainted = false
        world.player.state = 'wander'
        world.player.targetId = null
        if (!silent) {
          useToastStore.getState().pushToast(
            `${shinyPrefix(nextPoke.isShiny)}${SPECIES[nextPoke.speciesId].name} entrou em campo!`,
            'success', 'combat',
          )
        }
      }
    }
  }

  const autoEvents = updateAutoHeal(world, gameState, dt)
  if (!silent) {
    for (const ev of autoEvents) {
      if (ev.type === 'auto_pot') {
        const item = getItem(ev.itemId)
        if (item) useToastStore.getState().pushToast(`Auto-pot usou ${item.name}.`, 'success', 'combat')
      }
      if (ev.type === 'auto_revive') useToastStore.getState().pushToast('Auto-revive reanimou seu POKE!', 'success', 'combat')
    }
  }

  // Hunts BOSS (Modo Pesadelo) nascem seu unico lendario uma vez por
  // visita e nunca reabastecem o pool depois que ele morre.
  const aliveCount = world.enemies.filter((e) => !isDead(e)).length

  if (
    world.mapDef.sequence && world.mapDef.unlocksContinentOnClear && !world.sequenceCleared
    && aliveCount === 0 && world.sequenceIndex === world.mapDef.sequence.length - 1
  ) {
    world.sequenceCleared = true
    const continent = world.mapDef.unlocksContinentOnClear
    const wasLocked = !gameState.isContinentUnlocked(continent)
    gameState.unlockContinent(continent)
    if (!silent && wasLocked) {
      useToastStore.getState().pushToast('Voce derrotou o Campeao Lance! O Novo Continente foi desbloqueado.', 'success', 'world')
    }
  }

  if (aliveCount < world.mapDef.maxEnemies && !world.mapDef.noRespawn) {
    world.respawnTimer = (world.respawnTimer ?? 0) - dt
    if (world.respawnTimer <= 0) {
      world.enemies.push(spawnEnemyAt(world, world.mapDef))
      world.respawnTimer = world.mapDef.respawnDelay
    }
  } else if (world.mapDef.sequence && aliveCount === 0 && world.sequenceIndex < world.mapDef.sequence.length - 1) {
    world.respawnTimer = (world.respawnTimer ?? 0) - dt
    if (world.respawnTimer <= 0) {
      world.sequenceIndex += 1
      world.enemies.push(spawnSequenceEnemy(world, world.mapDef, world.sequenceIndex))
      world.respawnTimer = world.mapDef.respawnDelay
    }
  }

  return kills
}

// Copia world.player.poke (autoritativo ao vivo durante combate) de volta
// pra gameStateStore.team — ver nota de arquitetura no topo do arquivo.
// Chamado pela Fase 5 num timer periodico de baixa frequencia (nao todo
// tick) e em pontos de transicao de cena.
export function syncActivePokeToGameState(world: WorldState, gameState: GameStateStore): void {
  if (!world.player) return
  gameState.updatePokeInstance(world.player.poke.uid, () => world.player!.poke)
}

// ---------- Acoes do controller (chamadas pela UI, Fase 6) ----------
