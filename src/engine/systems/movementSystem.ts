// Port de js/systems/MovementSystem.js.
import { randRange } from '@/core/random'
import type { Rng } from '@/core/rng'
import { mapWalkRadius, isCellBlocked, type MapDef } from '@/data/maps'
import { COLLISION_GRID_CELL_SIZE } from '@/data/collisionConstants'
import { findPath } from '@/core/pathfinding'
import { engageRangeFor } from './combatSystem'
import { isDead, distanceTo } from '../entity'
import { imobilizadoPorStatus } from './statusSystem'
import type { EnemyEntity, PlayerEntity, Point, WorldState } from '../types'

const WANDER_MARGIN = 40
const ARRIVE_THRESHOLD = 4
const WANDER_PAUSE_MIN = 1
const WANDER_PAUSE_MAX = 3

// A cada quantos segundos um alvo em movimento (ex: o jogador, enquanto um
// inimigo persegue) forca um recalculo completo de rota — barato o
// suficiente nesse tamanho de grade pra rodar sem soluco de frame, mas nao
// tao frequente a ponto de recalcular todo tick a toa.
const PATH_RECALC_INTERVAL = 1
// Um alvo rastreado precisa se afastar essa quantidade de unidades de onde
// a rota/linha-de-visao atual foi calculada por ultimo antes disso sozinho
// forcar um recalculo antecipado (alem do timer acima).
const PATH_TARGET_DRIFT = 60
// Um salto bem maior (ex: uma entidade trocando de alvo de wander pra
// perseguir o jogador, ou vice-versa) pula o timer de recalculo por
// completo.
const PATH_TARGET_BIG_JUMP = 150
// `hasLineOfSight` amostra o segmento a cada meia celula — barato, mas pode
// pular uma parede fina de 1 celula entre duas amostras numa geometria
// irregular (achado testando o body-block do abismo). Quando isso acontece,
// `slideToward` fica preso (os 3 jeitos de deslizar caem em celula
// bloqueada) e o (tx,ty) cacheado nunca muda o bastante pra forcar um novo
// calculo — a entidade congela pra sempre. Depois desse tanto de tempo
// preso, o proximo recalculo pula o atalho de "linha limpa" e vai direto
// pro A* real, que contorna a parede que o atalho nao via.
const PATH_STUCK_THRESHOLD_SECONDS = 0.3

// A pegada de colisao de um POKE e uma caixa de `POKE_COLLISION_FOOTPRINT`, e
// checar so o ponto central contra a grade EQUIVALE a isso — mas nao porque
// "cada celula ja e uma caixa", que era o raciocinio antigo e valia so enquanto
// a pegada e o tamanho da celula eram o mesmo numero por coincidencia.
//
// Equivale porque a grade nao diz "aqui tem tinta": ela diz "o CENTRO do POKE
// pode estar aqui". A pegada e aplicada na GERACAO, por erosao
// (build-sub-bioma-collision.js, passo 1.5), o que mantem este laco — que roda
// ate 250 mil passos por chamada no resim do servidor — com uma consulta so em
// vez das nove que uma caixa exigiria em runtime.
//
// Mexer na pegada e mexer naquela constante e rodar o gerador de novo; nao ha
// nada a mudar aqui. Ver a nota longa em data/collisionConstants.ts (PH-94)
// pro que a medicao mostrou sobre a pegada de 40.
function canOccupy(mapDef: MapDef, x: number, y: number): boolean {
  return !isCellBlocked(mapDef, x, y)
}

// Passo em linha reta sem consciencia de colisao — seguro quando nao ha
// grade nenhuma, ou ao longo de um segmento ja verificado caminhavel.
function stepDirect(entity: { x: number; y: number; facing: Point }, tx: number, ty: number, speed: number, dt: number): boolean {
  const dx = tx - entity.x
  const dy = ty - entity.y
  const dist = Math.hypot(dx, dy)
  if (dist <= ARRIVE_THRESHOLD) return true
  const step = Math.min(1, (speed * dt) / dist)
  entity.x += dx * step
  entity.y += dy * step
  entity.facing = { x: dx / dist, y: dy / dist }
  return false
}

// Fallback antigo de colisao por eixo separado: tenta o passo diagonal
// completo, depois desliza so no eixo X ou so no Y. Usado so quando o A*
// nao achou rota (celula alvo bloqueada/inalcancavel).
function slideToward(entity: { x: number; y: number; facing: Point }, tx: number, ty: number, speed: number, dt: number, mapDef: MapDef): boolean {
  const dx = tx - entity.x, dy = ty - entity.y
  const dist = Math.hypot(dx, dy)
  if (dist <= ARRIVE_THRESHOLD) return true
  const step = speed * dt
  const ratio = Math.min(1, step / dist)
  const stepX = dx * ratio, stepY = dy * ratio
  entity.facing = { x: dx / dist, y: dy / dist }
  const fullX = entity.x + stepX, fullY = entity.y + stepY
  if (canOccupy(mapDef, fullX, fullY)) {
    entity.x = fullX
    entity.y = fullY
  } else if (canOccupy(mapDef, fullX, entity.y)) {
    entity.x = fullX
  } else if (canOccupy(mapDef, entity.x, fullY)) {
    entity.y = fullY
  }
  return false
}

// Amostra pontos ao longo do segmento reto de (x0,y0) a (x1,y1) a cada
// ~meia celula de grade, checando cada um contra a grade de colisao —
// probe barato de "consigo andar direto ate ali", rodado so quando uma
// rota precisa ser (re)decidida, nunca todo frame.
function hasLineOfSight(mapDef: MapDef, x0: number, y0: number, x1: number, y1: number): boolean {
  const dist = Math.hypot(x1 - x0, y1 - y0)
  const steps = Math.max(1, Math.ceil(dist / (COLLISION_GRID_CELL_SIZE / 2)))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    if (isCellBlocked(mapDef, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false
  }
  return true
}

interface Movable {
  x: number
  y: number
  facing: Point
  pathWaypoints: Point[] | null
  pathIndex: number
  pathRecalcTimer: number
  pathTargetX: number | null
  pathTargetY: number | null
  pathStuckSeconds: number
}

// Move uma entidade em direcao a (tx,ty), contornando obstaculos via A*
// real (core/pathfinding.ts) em vez de so deslizar no que encostar. `mapDef`
// e opcional-seguro: mapas sem grade de colisao (10 dos 17 temas de hunt)
// pulam tudo isso e sempre se movem em linha reta.
function moveToward(entity: Movable, tx: number, ty: number, speed: number, dt: number, mapDef: MapDef | null): boolean {
  if (!mapDef || !mapDef.collisionGrid) {
    return stepDirect(entity, tx, ty, speed, dt)
  }

  const dist = Math.hypot(tx - entity.x, ty - entity.y)
  if (dist <= ARRIVE_THRESHOLD) {
    entity.pathWaypoints = null
    return true
  }

  entity.pathRecalcTimer -= dt
  const targetJump = Math.hypot(tx - (entity.pathTargetX ?? tx), ty - (entity.pathTargetY ?? ty))
  const drifted = targetJump > PATH_TARGET_DRIFT
  const bigJump = targetJump > PATH_TARGET_BIG_JUMP
  // Preso ha tempo o bastante: forca a entrada neste bloco mesmo sem drift
  // (senao um alvo que mal se move nunca solta a rota congelada) e pula o
  // atalho de linha-de-visao, que foi o que mentiu da primeira vez.
  const travado = entity.pathStuckSeconds >= PATH_STUCK_THRESHOLD_SECONDS
  if (entity.pathWaypoints == null || bigJump || (drifted && entity.pathRecalcTimer <= 0) || travado) {
    if (!travado && hasLineOfSight(mapDef, entity.x, entity.y, tx, ty)) {
      entity.pathWaypoints = [] // linha limpa — anda reto, sem rota necessaria
    } else {
      const route = findPath(mapDef, entity.x, entity.y, tx, ty)
      entity.pathWaypoints = route || [] // null (inalcancavel) cai no fallback direto/slide abaixo
      entity.pathIndex = 0
    }
    entity.pathTargetX = tx
    entity.pathTargetY = ty
    entity.pathRecalcTimer = PATH_RECALC_INTERVAL
    if (travado) entity.pathStuckSeconds = 0
  }

  if (entity.pathWaypoints.length > 0) {
    entity.pathStuckSeconds = 0
    const wp = entity.pathWaypoints[entity.pathIndex]
    const arrivedAtWaypoint = stepDirect(entity, wp.x, wp.y, speed, dt)
    if (arrivedAtWaypoint) {
      entity.pathIndex += 1
      if (entity.pathIndex >= entity.pathWaypoints.length) entity.pathWaypoints = null
    }
    return false
  }

  // Sem rota necessaria (linha limpa) ou nenhuma encontrada (alvo
  // inalcancavel) — anda reto, ainda deslizando no que encostar em vez de
  // congelar. Quando nem isso move a entidade, acumula o tempo preso pra
  // eventualmente forcar o A* real (acima).
  const beforeX = entity.x, beforeY = entity.y
  const arrived = slideToward(entity, tx, ty, speed, dt, mapDef)
  entity.pathStuckSeconds = (!arrived && entity.x === beforeX && entity.y === beforeY)
    ? entity.pathStuckSeconds + dt
    : 0
  return arrived
}

// Puxa (x, y) de volta pra borda circular caminhavel do mapa se caiu fora
// dela — a hunt nao tem mais cantos retangulares, so esse circulo invisivel.
function clampToMapCircle(x: number, y: number, mapCx: number, mapCy: number, mapRadius: number): Point {
  const dx = x - mapCx
  const dy = y - mapCy
  const dist = Math.hypot(dx, dy)
  if (dist <= mapRadius || dist === 0) return { x, y }
  const ratio = mapRadius / dist
  return { x: mapCx + dx * ratio, y: mapCy + dy * ratio }
}

interface Wanderer extends Movable {
  wanderTarget: Point | null
  wanderPause: number
  moveSpeed: number
}

function wanderStep(rng: Rng, entity: Wanderer, dt: number, centerX: number, centerY: number, radius: number, mapCx: number, mapCy: number, mapRadius: number, mapDef: MapDef | null): void {
  if (entity.wanderTarget) {
    const prevX = entity.x, prevY = entity.y
    const arrived = moveToward(entity, entity.wanderTarget.x, entity.wanderTarget.y, entity.moveSpeed, dt, mapDef)
    // Um alvo de wander atras de uma parede congelaria essa entidade pra
    // sempre (a colisao do moveToward segura a posicao, entao `arrived`
    // nunca vira true) — trata "nao se moveu nada este frame" igual a
    // chegar: desiste do alvo e sorteia um novo.
    const stuck = !arrived && entity.x === prevX && entity.y === prevY
    if (arrived || stuck) {
      entity.wanderTarget = null
      entity.wanderPause = randRange(rng, WANDER_PAUSE_MIN, WANDER_PAUSE_MAX)
    }
    return
  }
  if (entity.wanderPause > 0) {
    entity.wanderPause -= dt
    return
  }
  const angle = randRange(rng, 0, Math.PI * 2)
  const dist = randRange(rng, radius * 0.3, radius)
  const tx = centerX + Math.cos(angle) * dist
  const ty = centerY + Math.sin(angle) * dist
  entity.wanderTarget = clampToMapCircle(tx, ty, mapCx, mapCy, mapRadius)
}

function findNearestAliveEnemy(player: PlayerEntity, enemies: EnemyEntity[]): EnemyEntity | null {
  let nearest: EnemyEntity | null = null
  let nearestDist = Infinity
  for (const enemy of enemies) {
    if (isDead(enemy)) continue
    const dist = distanceTo(player, enemy)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = enemy
    }
  }
  return nearest
}

// Um shiny em qualquer lugar da hunt sempre ganha a atencao do jogador —
// shiny mais proximo se houver mais de um vivo ao mesmo tempo, sobrepondo o
// que quer que ele estivesse perseguindo/lutando antes.
function findNearestAliveShiny(player: PlayerEntity, enemies: EnemyEntity[]): EnemyEntity | null {
  let nearest: EnemyEntity | null = null
  let nearestDist = Infinity
  for (const enemy of enemies) {
    if (isDead(enemy) || !enemy.poke.isShiny) continue
    const dist = distanceTo(player, enemy)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = enemy
    }
  }
  return nearest
}

function wanderFreely(rng: Rng, entity: Wanderer, dt: number, cx: number, cy: number, radius: number, mapDef: MapDef | null): void {
  if (entity.wanderTarget) {
    const prevX = entity.x, prevY = entity.y
    const arrived = moveToward(entity, entity.wanderTarget.x, entity.wanderTarget.y, entity.moveSpeed, dt, mapDef)
    const stuck = !arrived && entity.x === prevX && entity.y === prevY
    if (arrived || stuck) {
      entity.wanderTarget = null
      entity.wanderPause = randRange(rng, WANDER_PAUSE_MIN, WANDER_PAUSE_MAX)
    }
    return
  }
  if (entity.wanderPause > 0) {
    entity.wanderPause -= dt
    return
  }
  // Amostragem uniforme-por-AREA dentro do circulo (raiz quadrada de um
  // fracao uniforme [0,1]) em vez de uniforme-por-raio, que concentraria
  // pontos demais perto do centro.
  const angle = randRange(rng, 0, Math.PI * 2)
  const dist = Math.sqrt(randRange(rng, 0, 1)) * radius
  entity.wanderTarget = { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist }
}

/**
 * Sono e paralisia travam o POKE onde ele esta (data/statusEffects.ts#imobiliza).
 *
 * O que e pulado e SO o deslocamento — o resto da maquina de estado continua
 * rodando. Isso e proposital e nao detalhe: `updateCombat` filtra os inimigos
 * por `state === 'engaged'`, entao um inimigo adormecido que saisse de
 * 'engaged' pararia de poder ser ATACADO, e o jogador ficaria parado ao lado
 * de um alvo dormindo sem fazer nada. Mantendo o estado, o combate segue
 * normal e quem decide se o POKE age e `statusImpedeAcao`, como sempre foi.
 *
 * A pose de "parado" nao e responsabilidade daqui: quem imobiliza tambem
 * cairia na pose de andar por continuar em 'chase'/'wander', e e
 * animationSystem#desiredAnimName que resolve isso num lugar so.
 *
 * POR QUE SO SONO E CONGELAMENTO IMOBILIZAM, e nao paralisia: os dois acabam
 * sozinhos (sono em 2-4 turnos; congelamento com 20% de chance por turno, ou
 * na hora com um golpe de FOGO). Paralisia e PERMANENTE neste motor, e um
 * jogador que nao anda nunca mais encontra inimigo — o raio de aggro do
 * selvagem e 175px e o spawn nasce entre 250 e 550px
 * (simulation.ts#SPAWN_CONE_MIN_DISTANCE), entao a hunt travaria ate alguem
 * curar. Ver data/statusEffects.ts#STATUS_QUE_IMOBILIZAM.
 */
export function updateMovement(world: WorldState, dt: number): void {
  const { player, enemies, mapDef } = world
  if (!player || !mapDef) return
  const mapCx = mapDef.bounds.width / 2
  const mapCy = mapDef.bounds.height / 2
  const mapRadius = mapWalkRadius(mapDef) - WANDER_MARGIN

  if (player.fainted) {
    player.state = 'dead'
  } else if (player.attackAnimTimer > 0) {
    // Meio da pose Shoot/Charge: segura a posicao — um POKE nunca pode
    // andar e usar um golpe no mesmo instante.
    player.state = 'engaged'
  } else {
    // Um shiny em qualquer lugar da hunt sobrepoe tudo mais — o jogador
    // troca de foco pra ele imediatamente, mesmo no meio de outra luta.
    // Fora isso, o jogador sempre anda em direcao a qualquer inimigo vivo
    // mais PROXIMO agora — recalculado do zero todo frame.
    const shinyEnemy = findNearestAliveShiny(player, enemies)
    const targetEnemy = shinyEnemy || findNearestAliveEnemy(player, enemies)

    if (targetEnemy) {
      const engageRange = engageRangeFor(player, targetEnemy)
      if (distanceTo(player, targetEnemy) <= engageRange) {
        player.state = 'engaged'
      } else {
        player.state = 'chase'
        if (!imobilizadoPorStatus(player)) moveToward(player, targetEnemy.x, targetEnemy.y, player.moveSpeed, dt, mapDef)
        player.wanderTarget = null
      }
    } else {
      player.state = 'wander'
      if (imobilizadoPorStatus(player)) player.wanderTarget = null
      else wanderFreely(world.rng, player, dt, mapCx, mapCy, mapRadius, mapDef)
    }
  }

  for (const enemy of enemies) {
    if (isDead(enemy)) {
      enemy.state = 'dead'
      continue
    }

    if (enemy.attackAnimTimer > 0) {
      // Mesma trava do jogador acima — nunca anda no meio de um ataque.
      enemy.state = 'engaged'
      continue
    }

    const enemyImobilizado = imobilizadoPorStatus(enemy)

    if (player.fainted) {
      enemy.state = 'wander'
      enemy.targetId = null
      if (enemyImobilizado) enemy.wanderTarget = null
      else wanderStep(world.rng, enemy, dt, enemy.spawnPoint.x, enemy.spawnPoint.y, enemy.wanderRadius, mapCx, mapCy, mapRadius, mapDef)
      continue
    }

    const dist = distanceTo(enemy, player)
    const engageRange = engageRangeFor(enemy, player)

    if (dist <= engageRange) {
      enemy.state = 'engaged'
      enemy.targetId = player.id
      enemy.wanderTarget = null
    } else if (dist <= enemy.aggroRadius || ((enemy.state === 'chase' || enemy.state === 'engaged') && dist <= enemy.leashRadius)) {
      enemy.state = 'chase'
      enemy.targetId = player.id
      enemy.wanderTarget = null
      if (!enemyImobilizado) moveToward(enemy, player.x, player.y, enemy.moveSpeed, dt, mapDef)
    } else {
      enemy.state = 'wander'
      enemy.targetId = null
      if (enemyImobilizado) {
        enemy.wanderTarget = null
      } else {
        const distToSpawn = Math.hypot(enemy.x - enemy.spawnPoint.x, enemy.y - enemy.spawnPoint.y)
        if (distToSpawn > enemy.wanderRadius) {
          moveToward(enemy, enemy.spawnPoint.x, enemy.spawnPoint.y, enemy.moveSpeed, dt, mapDef)
          enemy.wanderTarget = null
        } else {
          wanderStep(world.rng, enemy, dt, enemy.spawnPoint.x, enemy.spawnPoint.y, enemy.wanderRadius, mapCx, mapCy, mapRadius, mapDef)
        }
      }
    }
  }
}
