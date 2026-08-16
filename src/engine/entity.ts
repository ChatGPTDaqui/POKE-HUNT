// Port de js/entities/Entity.js + Player.js + Enemy.js — funcoes puras
// sobre um WorldEntity (PlayerEntity|EnemyEntity) em vez de metodos de
// classe mutavel. Operam tanto sobre um draft imer (mutando direto, mesma
// ergonomia do original) quanto sobre um objeto solto (leitura).
import type { Species } from '@/data/pokes'
import { SPECIES } from '@/data/pokes'
import { footOffsetFraction } from '@/data/spriteFootOffsets'
import { getEncounter } from '@/data/enemies'
import type { PokeInstance } from '@/data/pokes'
import type { AbilityCategory } from '@/data/generated/types'
import { TURNO_SEGUNDOS } from '@/data/abilities'
import type { BaseEntity, EnemyEntity, Point, PlayerEntity, WorldCounters, WorldEntity } from './types'

// O contador de id vive no WorldState (`world.counters`), nao aqui. Um `let`
// de modulo faria o id depender de quantas cenas esta aba ja construiu — e isso
// ja mordeu de verdade neste projeto: um `import()` extra criava uma segunda
// copia do modulo com o contador zerado, gerando ids que colidiam com os do
// jogo (ver "Gotchas conhecidos" no CLAUDE.md).

const PLAYER_MOVE_SPEED = 91 // pixels/segundo (+30% balance pass), independente da stat de Velocidade
const ENEMY_MOVE_SPEED = 58.5 // pixels/segundo (+30% balance pass)
// Pedido explicito do usuario: alcance de aggro "moderado" — 1x aplica o
// valor real do encontro (175, ver sync-planilha.js) como esta, sem boost.
const AGGRO_RADIUS_MULTIPLIER = 1
const ENEMY_LEASH_MULTIPLIER = 2.2

export function createPlayerEntity(counters: WorldCounters, { poke, x, y }: { poke: PokeInstance; x: number; y: number }): PlayerEntity {
  return {
    id: `entity-${counters.entity++}`,
    kind: 'player',
    poke, x, y,
    facing: { x: 0, y: 1 },
    radius: 14,
    state: 'idle',
    cooldowns: {},
    globalCooldown: 0,
    targetId: null,
    deathHandled: false,
    flashTimer: 0,
    lastDamageTaken: { physical: { amount: 0, age: Infinity }, special: { amount: 0, age: Infinity } },
    battleAnim: null,
    animFrame: 0,
    animElapsed: 0,
    attackAnim: null,
    attackAnimTimer: 0,
    effectLanes: [],
    statusVolatil: null,
    estagios: {},
    imunidadeDeStatus: 0,
    proximoTurnoDeStatus: TURNO_SEGUNDOS,
    pathWaypoints: null,
    pathIndex: 0,
    pathRecalcTimer: 0,
    pathTargetX: null,
    pathTargetY: null,
    moveSpeed: PLAYER_MOVE_SPEED,
    wanderTarget: null,
    wanderPause: 0,
    fainted: false,
  }
}

export function createEnemyEntity(counters: WorldCounters, { poke, x, y, encounterId }: { poke: PokeInstance; x: number; y: number; encounterId: string }): EnemyEntity {
  const encounter = getEncounter(encounterId)
  if (!encounter) throw new Error(`Encontro desconhecido: ${encounterId}`)
  const aggroRadius = encounter.aggroRadius * AGGRO_RADIUS_MULTIPLIER
  return {
    id: `entity-${counters.entity++}`,
    kind: 'enemy',
    poke, x, y,
    facing: { x: 0, y: 1 },
    radius: 15,
    state: 'idle',
    cooldowns: {},
    globalCooldown: 0,
    targetId: null,
    deathHandled: false,
    flashTimer: 0,
    lastDamageTaken: { physical: { amount: 0, age: Infinity }, special: { amount: 0, age: Infinity } },
    battleAnim: null,
    animFrame: 0,
    animElapsed: 0,
    attackAnim: null,
    attackAnimTimer: 0,
    effectLanes: [],
    statusVolatil: null,
    estagios: {},
    imunidadeDeStatus: 0,
    proximoTurnoDeStatus: TURNO_SEGUNDOS,
    pathWaypoints: null,
    pathIndex: 0,
    pathRecalcTimer: 0,
    pathTargetX: null,
    pathTargetY: null,
    encounterId,
    spawnPoint: { x, y },
    moveSpeed: ENEMY_MOVE_SPEED,
    wanderTarget: null,
    wanderPause: 0,
    aggroRadius,
    wanderRadius: encounter.wanderRadius,
    leashRadius: aggroRadius * ENEMY_LEASH_MULTIPLIER,
    deathRemovalTimer: null,
  }
}

// --- getters do Entity.js original, como funcoes livres ---

export function getSpecies(entity: BaseEntity): Species {
  return SPECIES[entity.poke.speciesId]
}

export function getMaxHp(entity: BaseEntity): number {
  return entity.poke.stats.hp
}

export function isDead(entity: BaseEntity): boolean {
  return entity.poke.hp <= 0
}

// Distancia do `entity.y` ate os "pes" visiveis de verdade no frame atual do
// battle sprite (data/spriteFootOffsets.ts — frames PMD tem bastante padding
// vazio embaixo pra animacao de bounce, entao NAO e frameHeight/2). Constante
// independente da escala Bulbapedia (data/pokeHeights.ts) do sprite.
export function getGroundOffset(entity: BaseEntity): number {
  if (!entity.battleAnim) return entity.radius
  return entity.battleAnim.frameHeight * footOffsetFraction(getSpecies(entity).id)
}

export function distanceTo(a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

// --- mutadores do Entity.js original — recebem um draft imer e mutam direto ---

// Menor "raia" livre de `size` slots consecutivos acima desta entidade —
// reivindicada por um Effect na criacao, liberada quando ele termina (ver
// effect.ts / combatSystem.ts's cleanup).
export function claimEffectLane(entity: BaseEntity, effectId: string, size = 1): number {
  let lane = 0
  for (;;) {
    const overlaps = entity.effectLanes.some((e) => lane < e.lane + e.size && e.lane < lane + size)
    if (!overlaps) break
    lane++
  }
  entity.effectLanes.push({ id: effectId, lane, size })
  return lane
}

export function releaseEffectLane(entity: BaseEntity, effectId: string): void {
  entity.effectLanes = entity.effectLanes.filter((e) => e.id !== effectId)
}

export function tickCooldowns(entity: BaseEntity, dt: number): void {
  for (const key of Object.keys(entity.cooldowns)) {
    entity.cooldowns[key] = Math.max(0, entity.cooldowns[key] - dt)
  }
  if (entity.globalCooldown > 0) entity.globalCooldown = Math.max(0, entity.globalCooldown - dt)
  if (entity.flashTimer > 0) entity.flashTimer = Math.max(0, entity.flashTimer - dt)
  entity.lastDamageTaken.physical.age += dt
  entity.lastDamageTaken.special.age += dt
  // Imunidade de tipo temporaria por golpe (Magnet Rise) — mesmo padrao dos
  // outros timers deste metodo: desce a cada frame, zera o campo quando acaba
  // (ver types.ts#imuneAoTipoVolatil).
  if (entity.imuneAoTipoVolatil) {
    entity.imuneAoTipoVolatil.restante -= dt
    if (entity.imuneAoTipoVolatil.restante <= 0) entity.imuneAoTipoVolatil = undefined
  }
}

export function isAbilityReady(entity: BaseEntity, abilityId: string): boolean {
  return !entity.cooldowns[abilityId]
}

export function startCooldown(entity: BaseEntity, abilityId: string, seconds: number): void {
  entity.cooldowns[abilityId] = seconds
}

// Se ja passou tempo suficiente desde o ultimo uso de QUALQUER golpe — evita
// 2 golpes de cooldown baixo diferentes disparando um frame depois do outro.
export function canAct(entity: BaseEntity): boolean {
  return entity.globalCooldown <= 0
}

export function startGlobalCooldown(entity: BaseEntity, seconds: number): void {
  entity.globalCooldown = seconds
}

// `category` aceita 'status' (categoria real desde a base de dados do Ultra
// Sun) so pra assinatura casar com `resolveAbilityCategory`; o registro de
// ultimo dano recebido continua so pros dois que causam dano — golpe de status
// nao chega aqui de qualquer forma (`isDamagingAbility` filtra antes).
export function takeDamage(entity: BaseEntity, amount: number, category?: AbilityCategory): void {
  entity.poke.hp = Math.max(0, entity.poke.hp - amount)
  entity.flashTimer = 0.15
  if (category === 'physical' || category === 'special') {
    entity.lastDamageTaken[category] = { amount, age: 0 }
  }
}

export function heal(entity: BaseEntity, amount: number): void {
  entity.poke.hp = Math.min(getMaxHp(entity), entity.poke.hp + amount)
}

// Helper compartilhado por combatSystem/movementSystem/controller — acha uma
// entidade (jogador ou inimigo) pelo id dentro do draft do world. Substitui
// a referencia direta que `entity.target`/`effect.owner` guardavam no
// original (ver nota em engine/types.ts).
export function findEntityById(player: PlayerEntity | null, enemies: EnemyEntity[], id: string | null): WorldEntity | null {
  if (!id) return null
  if (player && player.id === id) return player
  return enemies.find((e) => e.id === id) || null
}
