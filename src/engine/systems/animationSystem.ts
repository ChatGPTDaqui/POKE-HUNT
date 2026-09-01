// Port de js/systems/AnimationSystem.js.
import { resolveBattleAnim } from '@/data/battleSprites'
import type { AnimName } from '@/data/battleSpriteAnims'
import type { AttackAnimKind, PlayerEntity, EnemyEntity, Point, WorldState } from '../types'
import { getSpecies, isDead } from '../entity'
import { imobilizadoPorStatus } from './statusSystem'

// Quanto tempo a pose de ataque (Shoot/Charge) fica na tela apos disparar —
// nao ligado ao numero de frames do sprite, so um flourish fixo. Tambem
// usado por CombatSystem como o delay de "o golpe realmente acerta", entao
// dano/efeitos/derrota so acontecem quando a pose termina de tocar.
export const ATTACK_ANIM_DURATION = 0.5

// 8 direcoes de bussola na ordem padrao do sheet PMD: Down, DownRight,
// Right, UpRight, Up, UpLeft, Left, DownLeft (sentido horario a partir do sul).
const SECTOR_TO_ROW = [2, 1, 0, 7, 6, 5, 4, 3]

export function directionRowFromFacing(facing: Point): number {
  const angle = Math.atan2(facing.y, facing.x)
  const sector = (((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8)
  return SECTOR_TO_ROW[sector]
}

export function desiredAnimName(entity: PlayerEntity | EnemyEntity): AnimName {
  if (isDead(entity)) return 'Faint'
  // Sono vence ate a pose de ataque: e o unico status com animacao propria em
  // todas as 226 especies com arte, e "dormindo" e a informacao que muda o que
  // o jogador entende da cena. Um POKE que adormece no meio da propria pose de
  // Shoot mostra o sono na hora — o golpe ja enfileirado ainda pousa (o guard
  // de resolveHit e sobre morte, nao sobre sono), mas ele nao age de novo.
  //
  // Nao ha risco de especie sem `Sleep-Anim.png`: ANIM_FALLBACKS ja encadeia
  // Sleep -> Idle -> Walk (conferido: 0 das 226 especies sem Sleep).
  if (entity.poke.status?.tipo === 'sleep') return 'Sleep'
  if (entity.attackAnimTimer > 0) return entity.attackAnim as AnimName
  // Imobilizado por status (hoje congelamento — o sono ja saiu acima, com
  // animacao propria): o estado continua 'chase'/'wander' pra o combate
  // seguir funcionando (movementSystem.ts explica por que), entao sem esta
  // linha um POKE congelado andaria no lugar. Nao ha animacao de congelado no
  // lote PMD; o que comunica o status e o corpo tingido de ciano
  // (data/vfxTiras.ts#COR_DE_STATUS_NO_CORPO).
  if (imobilizadoPorStatus(entity)) return 'Idle'
  // Encarada do duelo (PH-397): o corpo esta girando em torno do adversario,
  // mas o estado continua 'engaged' — e tem que continuar, senao `updateCombat`
  // para de contar essa entidade como em combate. A flag e a unica coisa que
  // liga "o corpo se deslocou neste tick" a arte que o mostra.
  if (entity.encarando) return 'Walk'
  if (entity.state === 'chase') return 'Walk'
  // 'wander' cobre duas fases (ver movementSystem.ts#wanderStep/wanderFreely):
  // perseguindo um wanderTarget (anda de verdade) e pausado entre alvos
  // (wanderTarget null, wanderPause contando). Sem checar o alvo, o POKE
  // parado na pausa continuava com o frame de "Walk".
  if (entity.state === 'wander') return entity.wanderTarget ? 'Walk' : 'Idle'
  return 'Idle'
}

// Decrementa attackAnimTimer de toda entidade — separado de updateAnimations
// abaixo (que e pulado em modo silent/headless) porque MovementSystem.ts
// tambem le esse mesmo timer pra TRAVAR o movimento enquanto uma pose de
// ataque toca. Bug real encontrado ao vivo: como so updateAnimations
// decrementava isso, uma simulacao silenciosa (Farm Offline/catch-up de
// segundo plano) travava a entidade atacante no lugar pra sempre assim que
// o primeiro golpe disparava — nada mais restante rodando nunca trazia o
// timer de volta a 0, entao o movimento ficava preso em 'engaged' pelo
// resto da simulacao. Precisa rodar todo tick, silent ou nao.
export function tickAttackAnimTimers(world: WorldState, dt: number): void {
  const entities: (PlayerEntity | EnemyEntity | null)[] = [world.player, ...world.enemies]
  for (const entity of entities) {
    if (!entity) continue
    if (entity.attackAnimTimer > 0) {
      entity.attackAnimTimer = Math.max(0, entity.attackAnimTimer - dt)
    }
    // Faiscas de cura (HP e status). Descontadas aqui e nao em `updateAnimations`
    // pelo mesmo motivo do `attackAnimTimer`: esta funcao roda tambem no modo
    // silencioso do servidor, e um timer que so desce no cliente ficaria
    // travado num snapshot vindo de um flush.
    if (entity.vfxCuraHp) {
      const resta = entity.vfxCuraHp - dt
      if (resta > 0) entity.vfxCuraHp = resta
      else delete entity.vfxCuraHp
    }
    if (entity.vfxCuraStatus) {
      const resta = entity.vfxCuraStatus - dt
      if (resta > 0) entity.vfxCuraStatus = resta
      else delete entity.vfxCuraStatus
    }
  }
}

// Avanca o frame de animacao do battle sprite de cada entidade — so selecao
// de sprite/frame agora (ver tickAttackAnimTimers acima pro proprio timer,
// que o movimento tambem depende e por isso nao pode ser pulado quando
// silent). Entidades cuja especie nao tem battle sprite (resolveBattleAnim
// devolve null) ficam intocadas e caem no placeholder geometrico.
export function updateAnimations(world: WorldState, dt: number): void {
  const entities = [world.player, ...world.enemies].filter((e): e is PlayerEntity | EnemyEntity => Boolean(e))

  for (const entity of entities) {
    const wantedName = desiredAnimName(entity)
    const resolved = resolveBattleAnim(getSpecies(entity).id, wantedName, entity.poke.isShiny)
    if (!resolved) {
      entity.battleAnim = null
      continue
    }

    // Compara a URL, nao so o NOME da animacao. Bug real: trocar de POKE em
    // campo ou evoluir mantem a animacao desejada igual ('Idle'/'Walk'), entao a
    // comparacao por nome dava "nao mudou" e `battleAnim.url` continuava
    // apontando pro spritesheet da especie ANTIGA. A sprite so trocava quando a
    // animacao mudava de nome por outro motivo — na pratica, no primeiro golpe
    // ('Shoot'). A URL carrega especie + animacao + shiny, entao cobre os tres
    // casos de troca de arte de uma vez.
    if (!entity.battleAnim || entity.battleAnim.url !== resolved.url) {
      entity.battleAnim = resolved
      entity.animFrame = 0
      entity.animElapsed = 0
    }

    const frameOnLastFrame = entity.animFrame >= resolved.durations.length - 1
    const holdOnLastFrame = wantedName === 'Faint' && frameOnLastFrame
    if (holdOnLastFrame) continue // congela na pose de desmaiado

    entity.animElapsed += dt
    const frameDuration = resolved.durations[entity.animFrame] / 60
    if (entity.animElapsed >= frameDuration) {
      entity.animElapsed -= frameDuration
      entity.animFrame = frameOnLastFrame ? 0 : entity.animFrame + 1
    }
  }
}

// Vira o atacante de frente pro alvo.
//
// `facing` so era escrito por quem MOVIA a entidade (stepDirect/slideToward em
// movementSystem). Como o combate acontece parado — e a pose de ataque ainda
// trava o movimento pela duracao dela —, o POKE atacava virado pra onde estava
// andando quando parou: golpe saindo de costas pro alvo era o caso comum
// quando o inimigo chegava por tras. `facing` alimenta o row do spritesheet
// PMD (8 direcoes, ver directionRowFromFacing), entao mexer nele e o
// equivalente aqui ao `scaleX(-1)` de um sprite de duas direcoes.
//
// Distancia zero (entidades exatamente sobrepostas) mantem o facing anterior:
// normalizar um vetor nulo daria NaN e o atan2 escolheria uma direcao a esmo.
export function faceToward(entity: PlayerEntity | EnemyEntity, target: Point): void {
  const dx = target.x - entity.x
  const dy = target.y - entity.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return
  entity.facing = { x: dx / dist, y: dy / dist }
}

// Chamado por CombatSystem no instante em que um golpe dispara, pra o
// atacante mostrar brevemente uma pose Shoot (single-target) ou Charge (AOE)
// em vez de Walk/Idle.
//
// `target` entra aqui, e nao numa chamada separada de faceToward no
// CombatSystem, pra nao existir caminho novo de ataque que dispare a pose sem
// virar o POKE — foi exatamente esse esquecimento que produziu o bug.
export function triggerAttackAnim(entity: PlayerEntity | EnemyEntity, isAoe: boolean, target?: Point): void {
  const kind: AttackAnimKind = isAoe ? 'Charge' : 'Shoot'
  entity.attackAnim = kind
  entity.attackAnimTimer = ATTACK_ANIM_DURATION
  if (target) faceToward(entity, target)
}
