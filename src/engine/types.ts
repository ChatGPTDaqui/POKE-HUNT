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
import type { StatusAtivo, EstagiosDeStat } from '@/data/statusEffects'
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

  // --- Status ---------------------------------------------------------------
  // O status NAO-VOLATIL (veneno, queimadura, paralisia, sono, congelamento)
  // mora no `poke`, nao aqui: ele sobrevive a hunt e vai pro banco, como nos
  // jogos, onde so o Centro Pokemon ou um item tira.
  //
  // A CONFUSAO mora aqui porque e VOLATIL: nos jogos ela some quando o POKE
  // sai de campo ou a batalha acaba. Como este combate nao acaba, o analogo e
  // a entidade — que e recriada a cada troca de cena.
  statusVolatil: StatusAtivo | null
  // Estagios de atributo (-6 a +6). Volateis pelo mesmo motivo da confusao:
  // nos jogos zeram quando o POKE sai de campo, e a entidade e o que e
  // recriado a cada troca de cena. Ausente = estagio 0 (multiplicador 1).
  estagios: EstagiosDeStat
  // Segundos restantes de imunidade a novo status, contados depois que um
  // status sai (cura ou fim natural). Desvio aprovado, ver
  // scripts/usum/status.json#reaplicacao.
  imunidadeDeStatus: number
  // Quanto falta pro proximo "turno" de status deste POKE (dano de veneno,
  // contador de sono, roll de descongelar). Conta separado do cooldown de
  // acao: um POKE dormindo nao age, mas o sono precisa continuar passando.
  proximoTurnoDeStatus: number
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

// UM cooldown so, do TREINADOR — nao um por tipo de item.
//
// Antes eram dois (`pot` e `revive`, 1s cada), o que deixava o bot usar pocao e
// revive no MESMO instante: dois timers independentes nunca se esperam. Com o
// Treinador virando personagem, quem tem o cooldown e ELE: uma mao, um item de
// cada vez.
//
// Poke Ball nao passa por aqui de proposito (decisao explicita): capturar nao
// e curar, e amarrar as duas coisas ao mesmo relogio faria o jogador perder
// capturas por ter tomado uma pocao.
export interface AutoTimers {
  treinador: number
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

/**
 * A sala em que o jogador esta dentro da hunt.
 *
 * Uma hunt tem 10 salas; cada sala e um SUB-BIOMA sorteado do bioma dela, com
 * pool de especies e loot proprios. Ver engine/systems/salaSystem.ts pro
 * porque a condicao de limpeza e quota de abates e nao "zerar o campo".
 */
export interface SalaAtiva {
  /** 0 a SALAS_POR_HUNT-1. */
  indice: number
  /** Chave do sub-bioma (casa com SUB_BIOMA_ESPECIES / data/biomas.ts). */
  chave: string
  abates: number
  /** Quantas voltas completas de 10 salas ja foram fechadas nesta sessao. */
  ciclos: number
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
  /** Nulo nas hunts sem salas: a inicial, as 11 BOSS e a do Campeao Lance. */
  sala: SalaAtiva | null
  // Toda aleatoriedade da simulacao sai daqui. Ver core/rng.ts pro porque e
  // pros limites (isto torna a SEQUENCIA DE SORTEIOS reproduzivel; nao promete
  // replay bit-a-bit de coordenadas entre engines diferentes).
  rng: Rng
  counters: WorldCounters
  // Combate no PIOR CASO, usado so pelo farm offline: variacao de dano no
  // minimo e zero critico. Regra do usuario — offline nunca pode render mais
  // que jogar de verdade.
  //
  // Cobre a RESOLUCAO do combate, e nao o spawn: as duas alavancas aqui so
  // fazem matar mais devagar, entao o resultado e monotonicamente menor. Fixar
  // tambem qual inimigo aparece parecia pessimismo e nao era — ver a nota em
  // simulation.ts#spawnEnemyAt, onde isso deixava a mochila com centenas de
  // copias de uma unica especie e ainda capturava MAIS que o jogo ao vivo.
  //
  // Vive no WorldState (e nao num parametro solto) porque o combate decide no
  // meio de um respawn, longe de quem iniciou a simulacao.
  pessimista: boolean
}
