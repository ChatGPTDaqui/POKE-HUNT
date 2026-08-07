// Tipos da arvore de estado EFEMERA de combate (o "world" de main.js) —
// separada de gameStateStore.ts (persistente). Porta js/entities/Entity.js
// (+Player.js/Enemy.js) e js/entities/Effect.js pra dado plano tipado.
//
// Desvio deliberado do original (nao e so traducao de sintaxe, ver plano
// Fase 3->4): no jogo vanilla, `entity.target`/`effect.owner`/
// `pendingHit.attacker`/`pendingHit.target` guardavam REFERENCIA DIRETA a
// outro objeto Entity mutavel. Com o motor rodando dentro de uma store
// Zustand+immer (cada update produz um novo objeto imutavel), guardar uma
// referencia direta arrisca apontar pra uma versao "velha" do objeto depois
// do proximo update. Toda referencia a outra entidade vira **id** (string) +
// lookup no momento do uso (`world.enemies.find(e => e.id === targetId)`) —
// mesma logica, forma diferente de apontar. Ability em pendingHit continua
// referencia direta porque `AbilityDataEntry` e dado estatico (nunca muda
// depois de carregado), sem risco de staleness.
import type { PokeInstance } from '@/data/pokes'
import type { MapDef } from '@/data/maps'
import type { ElementType } from '@/data/generated/types'
import type { Ability } from '@/data/abilities'
import type { ResolvedBattleAnim } from '@/data/battleSprites'
import type { Rng } from '@/core/rng'

export type EntityState = 'idle' | 'wander' | 'chase' | 'engaged' | 'dead'
export type AttackAnimKind = 'Shoot' | 'Charge'

export interface Point {
  x: number
  y: number
}

export interface DamageRecord {
  amount: number
  age: number
}

export interface EffectLaneClaim {
  id: string
  lane: number
  size: number
}

// Campos compartilhados por Player e Enemy (era a classe base Entity).
export interface BaseEntity {
  id: string
  poke: PokeInstance
  x: number
  y: number
  facing: Point
  radius: number
  state: EntityState
  cooldowns: Record<string, number>
  globalCooldown: number
  targetId: string | null // era `target` (referencia direta), ver nota do topo
  deathHandled: boolean
  flashTimer: number
  // Lido por Counter (fisico) / Mirror Coat (especial) pra refletir 2x o
  // ultimo dano daquela categoria — ver CombatSystem.js#counterDamage.
  lastDamageTaken: { physical: DamageRecord; special: DamageRecord }
  battleAnim: ResolvedBattleAnim | null
  animFrame: number
  animElapsed: number
  attackAnim: AttackAnimKind | null
  attackAnimTimer: number
  effectLanes: EffectLaneClaim[]
  pathWaypoints: Point[] | null
  pathIndex: number
  pathRecalcTimer: number
  pathTargetX: number | null
  pathTargetY: number | null
}

export interface PlayerEntity extends BaseEntity {
  kind: 'player'
  moveSpeed: number
  wanderTarget: Point | null
  wanderPause: number
  fainted: boolean
}

export interface EnemyEntity extends BaseEntity {
  kind: 'enemy'
  encounterId: string
  spawnPoint: Point
  moveSpeed: number
  wanderTarget: Point | null
  wanderPause: number
  aggroRadius: number
  wanderRadius: number
  leashRadius: number
  // Setado por stepWorld apos handleEnemyDefeated — cadaver fica visivel ate
  // o timer zerar (ou pra sempre, se mapDef.keepCorpses).
  deathRemovalTimer: number | null
}

export type WorldEntity = PlayerEntity | EnemyEntity

export type EffectType = 'damageNumber' | 'abilityName' | 'rewardText' | 'abilityEffect' | 'captureAnim'

export interface WorldEffect {
  id: string
  type: EffectType
  x: number
  y: number
  targetX?: number
  targetY?: number
  radius: number
  color: string
  duration: number
  delay: number
  age: number
  value?: number
  effectiveness?: string
  effectivenessLabel?: string
  text?: string
  unit?: string
  isAoe?: boolean
  worldSize?: number
  elementType?: ElementType
  ballItemId?: string
  success?: boolean
  laneSize: number
  ownerId: string | null // era `owner` (referencia direta), ver nota do topo
  lane: number
}

export interface PendingHit {
  id: string
  timer: number
  attackerId: string
  targetId: string | null // null pra hits isAoeVisual (sem alvo unico, ver combatSystem.ts#queueAoeVisual)
  ability: Ability
  isAoeVisual?: boolean
}

export interface AutoTimers {
  pot: number
  revive: number
}

// A arvore de estado efemera inteira — reconstruida do zero a cada troca de
// cena (buildHospitalWorld/buildMapWorld no main.js original), nunca
// persistida. `mapDef: null` = cena do Hospital.
// Contadores de id que antes eram `let nextXId = 1` no topo de entity.ts,
// effect.ts e combatSystem.ts. Singleton de modulo nao serve pra um mundo
// reproduzivel: o id passa a depender de quantas cenas o jogador visitou nesta
// aba, e nao do estado do mundo. Isso ja mordeu de verdade duas vezes neste
// projeto (ver "Gotchas conhecidos" no CLAUDE.md: um `import()` extra resetava o
// contador e gerava ids colidindo com os do jogo). Vivendo aqui, sao salvos e
// retomados junto com o resto do mundo.
export interface WorldCounters {
  entity: number
  effect: number
  pendingHit: number
}

export interface WorldState {
  mapDef: MapDef | null
  player: PlayerEntity | null
  enemies: EnemyEntity[]
  effects: WorldEffect[]
  pendingHits: PendingHit[]
  autoTimers: AutoTimers
  reviveCountdown: number | null
  respawnTimer: number | null
  sequenceIndex: number
  sequenceCleared: boolean
  countdownRemaining: number | null
  // Toda aleatoriedade da simulacao sai daqui. Ver core/rng.ts pro porque e
  // pros limites (isto torna a SEQUENCIA DE SORTEIOS reproduzivel; nao promete
  // replay bit-a-bit de coordenadas entre engines diferentes).
  rng: Rng
  counters: WorldCounters
}
