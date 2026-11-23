// Port de js/systems/AnimationSystem.js.
import { resolveBattleAnim } from '@/data/battleSprites'
import type { AnimName } from '@/data/battleSpriteAnims'
import type { AttackAnimKind, ImpactoVisual, PlayerEntity, EnemyEntity, Point, WorldState, WorldEntity } from '../types'
import { poseBaseDoModo } from '@/data/poseDoGolpe'
import { getSpecies, isDead } from '../entity'
import { imobilizadoPorStatus } from './statusSystem'

// Quanto tempo a pose de ataque (Shoot/Charge) fica na tela apos disparar —
// nao ligado ao numero de frames do sprite, so um flourish fixo. Tambem
// usado por CombatSystem como o delay de "o golpe realmente acerta", entao
// dano/efeitos/derrota so acontecem quando a pose termina de tocar.
export const ATTACK_ANIM_DURATION = 0.5

// PH-542: quanto tempo, no minimo, a pose Hurt fica na tela. A arte toca uma
// volta e segura o ultimo quadro ate aqui (`duracaoDoHurt`); antes ela repetia
// em loop pelos 0,45 s e o flinch "piscava" duas vezes e meia.
export const HURT_ANIM_DURATION = 0.45

// GRAUS DO IMPACTO (coreografia de batalha, 23/11/2026). Todo acerto que tira
// HP tem uma reacao, nos dois modos de combate (antes so o duelo, e so acima de
// 20% do HP). A fracao e do HP MAXIMO de quem levou, por acerto:
//   1 leve  (< 10%)  so o brilho e um tremor curto — sem pose
//   2 medio (10–25%) pose Hurt e um recuo pequeno
//   3 forte (>= 25%) pose Hurt, recuo maior e hitstop (o alvo congela no impacto)
// Critico e super efetivo sobem um grau (no maximo 3).
export const FRACAO_DO_IMPACTO_MEDIO = 0.1
export const FRACAO_DO_IMPACTO_FORTE = 0.25
export type GrauDoImpacto = 1 | 2 | 3

/**
 * Hitstop: quanto o alvo de um impacto forte fica congelado no quadro em que
 * foi atingido. So DESENHO — a simulacao nao para (ver `updateAnimations`). O
 * Hurt de quem congelou ganha o mesmo tanto, pra pose nao perder o fim.
 */
export const HITSTOP_FORTE = 0.09
export const HITSTOP_CRITICO = 0.12
export const HITSTOP_DE_DERROTA = 0.15

export interface DetalheDoImpacto {
  critico?: boolean
  superEfetivo?: boolean
}

export function grauDoImpacto(dano: number, hpMaximo: number, detalhe: DetalheDoImpacto = {}): GrauDoImpacto {
  const fracao = hpMaximo > 0 ? dano / hpMaximo : 1
  let grau: number = fracao >= FRACAO_DO_IMPACTO_FORTE ? 3 : fracao >= FRACAO_DO_IMPACTO_MEDIO ? 2 : 1
  if (detalhe.critico || detalhe.superEfetivo) grau += 1
  return Math.min(3, grau) as GrauDoImpacto
}

export function hitstopDoImpacto(grau: GrauDoImpacto, critico: boolean, derrota: boolean): number {
  if (derrota) return HITSTOP_DE_DERROTA
  if (grau < 3) return 0
  return critico ? HITSTOP_CRITICO : HITSTOP_FORTE
}

/**
 * Segundos que o flinch fica na tela. Toda arte de Hurt do acervo PMD tem 2
 * quadros e ~0,17 s — curta demais pro olho registrar num jogo assistido. Ela
 * toca UMA vez e segura o ultimo quadro (o recuo) ate completar
 * HURT_ANIM_DURATION (`updateAnimations`), em vez de dar volta e meia.
 */
export function duracaoDoHurt(speciesId: string | undefined): number {
  if (!speciesId) return HURT_ANIM_DURATION
  const arte = resolveBattleAnim(speciesId, 'Hurt')
  if (!arte || arte.name !== 'Hurt' || arte.durations.length === 0) return HURT_ANIM_DURATION
  return Math.max(HURT_ANIM_DURATION, arte.durations.reduce((s, d) => s + d, 0) / 60)
}

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
  // PH-552: pose da abertura do duelo (ameaca/habilidade de entrada). Acima
  // do sono de proposito: quem acabou de sair da bola esta se apresentando, e
  // a apresentacao e o que o jogador esta olhando.
  if (entity.animOverride) return entity.animOverride
  // UMA ANIMACAO NAO CORTA A OUTRA (coreografia de batalha, 23/11/2026). A
  // pose de golpe e exclusiva: so o desmaio (acima) a interrompe. O sono vinha
  // antes dela e cortava o golpe no meio; agora ele espera a pose acabar — no
  // maximo a duracao da arte, ~0,3–0,9 s. O golpe ja enfileirado pousa igual (o
  // guard de resolveHit e sobre morte, nao sobre sono).
  if (entity.attackAnimTimer > 0) return entity.attackAnim as AnimName
  // Sono: unico status com animacao propria em todas as especies com arte
  // (ANIM_FALLBACKS encadeia Sleep -> Idle -> Walk), e "dormindo" muda o que o
  // jogador entende da cena — vence o flinch e o resto.
  if (entity.poke.status?.tipo === 'sleep') return 'Sleep'
  // Flinch de levar dano. Quem leva o acerto no meio do PROPRIO golpe nao e
  // interrompido: o Hurt espera em `hurtNaFila` e toca quando a pose de ataque
  // termina (ver `registrarDanoParaHurt` e `tickAttackAnimTimers`).
  if ((entity.hurtAnimTimer ?? 0) > 0) return 'Hurt'
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
  // O golpe ainda no ar (`travaDoGolpe`, ate o ultimo impacto) segura o corpo,
  // mas o estado segue saindo da distancia real: com o alvo caido e o proximo
  // longe, o estado vira 'chase' sem deslocamento — e a arte de andar tocava no
  // lugar ate a trava soltar. Parado e parado.
  if ((entity.travaDoGolpe ?? 0) > 0) return 'Idle'
  if (entity.state === 'chase') return 'Walk'
  // 'wander' cobre duas fases (ver movementSystem.ts#wanderStep/wanderFreely):
  // perseguindo um wanderTarget (anda de verdade) e pausado entre alvos
  // (wanderTarget null, wanderPause contando). Sem checar o alvo, o POKE
  // parado na pausa continuava com o frame de "Walk".
  if (entity.state === 'wander') return entity.wanderTarget ? 'Walk' : 'Idle'
  return 'Idle'
}

/** Só apresentação: também expira no saguão, sem avançar combate/cooldowns. */
export function tickCuraTimers(entity: WorldEntity, dt: number): void {
  if (!entity.vfxCuraHp && !entity.vfxCuraStatus) return
  for (const campo of ['vfxCuraHp', 'vfxCuraStatus'] as const) {
    const restante = entity[campo]
    if (!restante) continue
    const resta = restante - dt
    if (resta > 0) entity[campo] = resta
    else delete entity[campo]
  }
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
      // A pose de golpe acabou: o flinch que chegou durante ela toca agora.
      if (entity.attackAnimTimer === 0 && entity.hurtNaFila) {
        entity.hurtAnimTimer = entity.hurtNaFila
        delete entity.hurtNaFila
        reiniciarQuadros(entity)
      }
    }
    // Mesmo motivo: movementSystem le, e a trava tem que descer no servidor.
    if (entity.travaDoGolpe) {
      const resta = entity.travaDoGolpe - dt
      if (resta > 0) entity.travaDoGolpe = resta
      else delete entity.travaDoGolpe
    }
    if (entity.hurtAnimTimer) {
      const resta = entity.hurtAnimTimer - dt
      if (resta > 0) entity.hurtAnimTimer = resta
      else delete entity.hurtAnimTimer
    }
    if (entity.impactoVisual) {
      entity.impactoVisual.idade += dt
      if (entity.impactoVisual.idade >= duracaoDoImpactoVisual(entity.impactoVisual)) delete entity.impactoVisual
    }
    // Faiscas de cura (HP e status). Descontadas aqui e nao em `updateAnimations`
    // pelo mesmo motivo do `attackAnimTimer`: esta funcao roda tambem no modo
    // silencioso do servidor, e um timer que so desce no cliente ficaria
    // travado num snapshot vindo de um flush.
    tickCuraTimers(entity, dt)
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
    // Congela na pose de desmaiado; o flinch tambem segura o ultimo quadro (o
    // recuo) ate o timer dele acabar — ver `duracaoDoHurt`.
    const holdOnLastFrame = (wantedName === 'Faint' || wantedName === 'Hurt') && frameOnLastFrame
    if (holdOnLastFrame) continue

    // Hitstop: o alvo de um impacto forte segura o quadro em que foi atingido.
    if (entity.impactoVisual && entity.impactoVisual.idade < entity.impactoVisual.hitstop) continue

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
//
// `duelo` (PH-543): no combate duelo (`mapDef.encarada`) a pose e sempre
// `Attack`, alvo unico ou area — o acervo PMD nao separa por alcance, e o
// pedido foi "a sprite attack" pra todo golpe do duelo. O combate livre
// continua com Shoot/Charge.
export function poseDeAtaque(isAoe: boolean, duelo = false): AttackAnimKind {
  return poseBaseDoModo(isAoe, duelo)
}

// `duracao` (11/10): o combate passa o tempo REAL da arte da especie (ver
// engine/tempoDoGolpe.ts) — a pose toca do quadro 0 ao fim, uma vez (Charge em
// loop ate o golpe bater). O padrao fica pros chamadores sem golpe.
//
// `pose` (18/10/2026): a pose do golpe, escolhida por engine/poseDoGolpe.ts.
// Ausente, vale a pose de sempre do modo.
export function triggerAttackAnim(entity: PlayerEntity | EnemyEntity, isAoe: boolean, target?: Point, duelo = false, duracao = ATTACK_ANIM_DURATION, pose?: AttackAnimKind): void {
  entity.attackAnim = pose ?? poseDeAtaque(isAoe, duelo)
  entity.attackAnimTimer = duracao
  if (target) faceToward(entity, target)
}


/** Volta a arte do quadro 0 — o Hurt seguinte recomeca o flinch, nao continua o anterior. */
function reiniciarQuadros(entity: PlayerEntity | EnemyEntity): void {
  entity.animFrame = 0
  entity.animElapsed = 0
}

/**
 * Reacao a UM acerto que tirou HP, nos dois modos de combate (PH-542 armava so
 * no duelo e so acima de 20%). Devolve o grau (`grauDoImpacto`); do grau 2 pra
 * cima arma a pose Hurt. Multi-hit conta por acerto.
 *
 * FILA, NAO CORTE: quem esta no meio da propria pose de golpe nao e
 * interrompido — o Hurt vai pra `hurtNaFila` e toca quando a pose termina
 * (`tickAttackAnimTimers`). Hurt sobre Hurt recomeca do quadro 0.
 *
 * Morto nao flincha: a pose de desmaio vence em `desiredAnimName`. Roda tambem
 * no servidor (silent): os timers sao so apresentacao, mas descem nos dois
 * lados pelo mesmo caminho dos timers de cura.
 */
export function registrarDanoParaHurt(
  alvo: PlayerEntity | EnemyEntity, dano: number,
  detalhe: DetalheDoImpacto & { hitstop?: number } = {},
): GrauDoImpacto | 0 {
  if (dano <= 0) return 0
  const grau = grauDoImpacto(dano, alvo.poke.stats.hp, detalhe)
  if (isDead(alvo) || grau < 2) return grau
  const duracao = duracaoDoHurt(alvo.poke.speciesId) + (detalhe.hitstop ?? 0)
  if (alvo.attackAnimTimer > 0) {
    alvo.hurtNaFila = Math.max(alvo.hurtNaFila ?? 0, duracao)
    return grau
  }
  if ((alvo.hurtAnimTimer ?? 0) > 0) reiniciarQuadros(alvo)
  alvo.hurtAnimTimer = duracao
  return grau
}

/** Quanto tempo o tremor/recuo de UM pulso fica vivo. */
export const DURACAO_DO_TREMOR = 0.28
export function duracaoDoImpactoVisual(i: ImpactoVisual): number {
  return i.hitstop + (i.pulsos - 1) * i.intervalo + DURACAO_DO_TREMOR
}

/**
 * Arma o tremor/recuo/hitstop do acerto em quem levou. So desenho: o combate
 * chama fora do modo silent, e nada da simulacao le este campo. `pulsos` =
 * acertos de um golpe multiplo (um tremor por numero de dano), `intervalo` o
 * espaco entre eles.
 */
export function registrarImpactoVisual(
  alvo: PlayerEntity | EnemyEntity, origem: Point | null, grau: GrauDoImpacto,
  opcoes: { pulsos?: number; intervalo?: number; hitstop?: number } = {},
): void {
  const dx = origem ? alvo.x - origem.x : 0
  const dy = origem ? alvo.y - origem.y : 0
  alvo.impactoVisual = {
    grau,
    angulo: dx === 0 && dy === 0 ? null : Math.atan2(dy, dx),
    idade: 0,
    pulsos: Math.max(1, opcoes.pulsos ?? 1),
    intervalo: opcoes.intervalo ?? 0,
    hitstop: opcoes.hitstop ?? 0,
  }
}
