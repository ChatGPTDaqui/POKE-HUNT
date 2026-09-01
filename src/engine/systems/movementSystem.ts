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

// --- corpo nao entra em corpo (PH-384) ---------------------------------------
//
// O QUE ACONTECIA
//
// Nada no motor olhava a posicao de uma entidade em relacao a OUTRA. A grade de
// colisao e a arte (parede), e `engageRangeFor` so decide a que distancia o
// combate comeca — nao segura ninguem. O caso visivel era o empilhamento: com
// `maxEnemies: 6`, os seis perseguem o MESMO ponto (o jogador), e quem chega
// depois entra dentro de quem chegou antes. `SPAWN_ENTRE_INIMIGOS` (170) espalha
// o NASCIMENTO e mais nada; dois segundos de perseguicao desfazem o
// espacamento.
//
// POR QUE A SEPARACAO E A SOMA DOS RAIOS, E NAO MAIS QUE ISSO
//
// `engageRangeFor(a, b)` = `a.radius + b.radius + MELEE_RANGE_PADDING` (10).
// Separar por mais que a soma dos raios + 10 faria o perseguidor nunca alcancar
// o alcance de combate: os dois se empurrariam pra fora da distancia em que
// lutam, e o combate PARAVA — trocar um defeito visual por um jogo que nao
// bate. Com a soma dos raios sobra exatamente a folga de 10 do
// `MELEE_RANGE_PADDING`.
//
// A geometria tambem fecha pro caso cheio: seis inimigos em volta do jogador,
// todos no alcance de combate (39), ficam num circulo cujos vizinhos distam 39
// um do outro — mais que os 30 que esta regra exige. Ou seja, os seis cabem em
// volta do jogador sem briga entre a separacao e o combate. Separacao maior que
// isso comecaria a expulsar inimigo do circulo e viraria um vai-e-vem.
//
// LIMITE CONHECIDO, ACEITO: isto separa os CORPOS (o raio de 14/15 que o motor
// declara), nao os SPRITES. O quadro PMD desenhado tem dezenas de pixels de
// largura, boa parte deles padding vazio, e a 30 unidades de distancia duas
// artes ainda se encostam. Encostar e o que um corpo-a-corpo deve parecer;
// afastar mais que isso exige mexer no alcance do combate (balanceamento) ou
// derivar a largura opaca real por especie, como `spriteTopOffsets.generated.ts`
// fez pra altura. Nenhum dos dois cabe nesta issue.
const SEPARACAO_MAXIMA_POR_SEGUNDO = 120
/**
 * Quantas varreduras de pares por tick.
 *
 * UMA NAO BASTA COM O CAMPO CHEIO, e isso foi medido. Cada par e resolvido em
 * sequencia (Gauss-Seidel), entao o par seguinte desfaz parte do que o
 * anterior acertou. Com seis inimigos empilhados no mesmo pixel, uma passada
 * so estabiliza em ~22 unidades de distancia minima e para de melhorar; quatro
 * chegam a ~28, que e o limite geometrico do caso (ver a nota da funcao).
 *
 * O laco sai cedo quando nenhum par sobrou sobreposto, entao o caso comum — um
 * ou dois corpos encostando — continua custando UMA varredura.
 */
const PASSADAS_DE_SEPARACAO = 4

/**
 * Direcao de desempate quando dois corpos estao EXATAMENTE no mesmo ponto.
 *
 * Sem isto a normal seria 0/0 e ninguem se moveria — e o caso acontece de
 * verdade (dois inimigos entrando pela mesma bola de spawn, POKE substituto
 * nascendo onde o anterior caiu).
 *
 * Deriva dos `id` das entidades, e nao de `world.rng`, DE PROPOSITO: a sequencia
 * de sorteio e comparada entre a predicao do cliente e o resim da autoridade
 * (core/rng.ts), e consumir um numero aqui deslocaria tudo o que vem depois.
 * Aritmetica inteira sobre os ids da o mesmo angulo nas duas pontas e nas duas
 * rodadas do teste de determinismo.
 */
function direcaoDeDesempate(idA: string, idB: string): Point {
  // `id` e `entity-<n>` (entity.ts), entao somar os codigos dos caracteres
  // separa os pares na pratica e nao depende do formato continuar o mesmo.
  let h = 0
  for (let i = 0; i < idA.length; i++) h = (h * 31 + idA.charCodeAt(i)) % 100003
  for (let i = 0; i < idB.length; i++) h = (h * 17 + idB.charCodeAt(i)) % 100003
  const rad = ((h % 360) * Math.PI) / 180
  return { x: Math.cos(rad), y: Math.sin(rad) }
}

/**
 * Desloca um corpo por (dx, dy) respeitando parede pintada e o circulo andavel.
 *
 * Mesma degradacao por eixo do `slideToward`: o passo cheio, senao so X, senao
 * so Y, senao nao anda. Um empurrao NUNCA pode ser a porta de entrada pra
 * atravessar parede — a colisao da arte e mais forte que a separacao de corpos.
 */
function empurrarCorpo(
  entity: { x: number; y: number },
  dx: number,
  dy: number,
  mapDef: MapDef,
  mapCx: number,
  mapCy: number,
  mapRadius: number,
): void {
  const alvo = clampToMapCircle(entity.x + dx, entity.y + dy, mapCx, mapCy, mapRadius)
  if (canOccupy(mapDef, alvo.x, alvo.y)) {
    entity.x = alvo.x
    entity.y = alvo.y
    return
  }
  if (canOccupy(mapDef, alvo.x, entity.y)) {
    entity.x = alvo.x
    return
  }
  if (canOccupy(mapDef, entity.x, alvo.y)) {
    entity.y = alvo.y
  }
}

/**
 * Nenhum corpo vivo ocupa o espaco de outro (PH-384).
 *
 * Roda no FIM de `updateMovement`, depois de todo mundo ter andado: a separacao
 * corrige a sobreposicao que o passo daquele tick criou, em vez de disputar o
 * destino com quem esta perseguindo.
 *
 * O par se resolve pela METADE pra cada lado. Empurrar so um dos dois faria o
 * inimigo parado (`engaged`, que nao anda) absorver todo o deslocamento e o
 * jogador atravessar o campo empurrando a fila inteira.
 *
 * O teto de `SEPARACAO_MAXIMA_POR_SEGUNDO` existe pro caso de sobreposicao
 * GRANDE (dois corpos nascendo no mesmo ponto): resolver de uma vez leria como
 * teleporte. Sobreposicao normal — no maximo o passo de um tick — cabe inteira
 * dentro do teto e se resolve no mesmo tick.
 *
 * O(n²) sem grade espacial de proposito: `maxEnemies` e 6, entao sao 21 pares no
 * pior caso do jogo inteiro. Uma grade custaria mais em manutencao do que
 * economiza em ciclos.
 *
 * MORTO NAO EMPURRA E NAO E EMPURRADO: o corpo fica em campo por
 * `deathRemovalTimer` (e pra sempre na arena do Lance, `keepCorpses`), e um
 * cadaver que ocupa espaco viraria obstaculo permanente em volta do jogador.
 *
 * IMOBILIZADO (sono/congelamento) TAMBEM SE MOVE AQUI. Imobilizacao e sobre nao
 * poder AGIR — andar, perseguir, atacar —, nao sobre virar poste. Um POKE
 * dormindo empurrado alguns pixels por quem esbarra nele nao ganha nem perde
 * nada; um POKE dormindo intransponivel deixaria a sobreposicao sem solucao,
 * porque o outro lado teria que absorver o dobro.
 */
function separarCorpos(world: WorldState, dt: number): void {
  const { player, enemies, mapDef } = world
  if (!player || !mapDef) return

  const corpos: { x: number; y: number; id: string; radius: number }[] = []
  if (!isDead(player)) corpos.push(player)
  for (const enemy of enemies) {
    if (!isDead(enemy)) corpos.push(enemy)
  }
  if (corpos.length < 2) return

  const mapCx = mapDef.bounds.width / 2
  const mapCy = mapDef.bounds.height / 2
  const mapRadius = mapWalkRadius(mapDef)
  const teto = SEPARACAO_MAXIMA_POR_SEGUNDO * dt

  for (let passada = 0; passada < PASSADAS_DE_SEPARACAO; passada++) {
    let sobrou = false
    for (let i = 0; i < corpos.length; i++) {
      for (let j = i + 1; j < corpos.length; j++) {
        const a = corpos[i]
        const b = corpos[j]
        const minima = a.radius + b.radius
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy)
        if (dist >= minima) continue
        sobrou = true

        const normal = dist > 0
          ? { x: dx / dist, y: dy / dist }
          : direcaoDeDesempate(a.id, b.id)
        const metade = Math.min(minima - dist, teto) / 2

        empurrarCorpo(a, -normal.x * metade, -normal.y * metade, mapDef, mapCx, mapCy, mapRadius)
        empurrarCorpo(b, normal.x * metade, normal.y * metade, mapDef, mapCx, mapCy, mapRadius)
      }
    }
    // Campo folgado (o caso comum: 1 ou 2 corpos encostando) resolve na
    // primeira passada e sai — as outras seriam varredura a toa.
    if (!sobrou) break
  }
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

/**
 * Este inimigo sobrepoe a regra de "o mais proximo"?
 *
 * Dois casos, e eles estao no MESMO nivel de prioridade de proposito (PH-331):
 *
 *  - **shiny** — regra antiga: um shiny em qualquer lugar da hunt sempre ganha a
 *    atencao do jogador, porque perder um por distracao e perda de conteudo raro.
 *  - **protetor** (Guardian/Lord) — pedido explicito, "ele tera a prioridade
 *    igual o Pokemon Shine". E a leitura certa mesmo sem o pedido: o protetor e
 *    o UNICO inimigo que destrava a sala (`salaTravadaPeloProtetor`), entao um
 *    jogador que persegue um mob comum ao lado dele nao esta apenas perdendo
 *    tempo — a hunt inteira fica parada em 30/30 esperando.
 *
 * "Mesmo nivel" e literal: nao ha desempate por categoria, so por DISTANCIA.
 * Empilhar (protetor acima de shiny, ou o contrario) seria inventar uma regra
 * que ninguem pediu, e o caso em que os dois convivem e raro por construcao —
 * protetor vivo suspende o respawn de mob comum (ver simulation.ts), entao o
 * unico jeito de haver protetor E shiny em campo e um shiny ter sobrado vivo
 * de antes do protetor nascer. Nesse caso o mais perto ganha, e o outro vem
 * logo depois.
 *
 * `'isProtetor' in enemy` nao e necessario aqui (o parametro ja e `EnemyEntity`,
 * que e onde o campo existe), mas o campo e opcional — `=== true` e o que
 * distingue "nao e protetor" de "campo ausente".
 */
export function ehAlvoPrioritario(enemy: EnemyEntity): boolean {
  return enemy.poke.isShiny === true || enemy.isProtetor === true
}

/**
 * O alvo prioritario vivo mais proximo (shiny ou protetor), ou `null`.
 *
 * Substitui `findNearestAliveShiny`. O nome mudou junto com a regra: um nome que
 * diz "shiny" enquanto a funcao tambem devolve protetor e a forma classica de o
 * proximo leitor concluir que o protetor entrou ali por acidente.
 */
function findNearestAlivePrioritario(player: PlayerEntity, enemies: EnemyEntity[]): EnemyEntity | null {
  let nearest: EnemyEntity | null = null
  let nearestDist = Infinity
  for (const enemy of enemies) {
    if (isDead(enemy) || !ehAlvoPrioritario(enemy)) continue
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
  } else if (world.lure?.fase === 'reunindo') {
    // LURE, fase de reuniao (engine/systems/lureSystem.ts). O jogador NAO para
    // pra lutar: ele atravessa o raio de aggro do proximo selvagem pra puxa-lo.
    //
    // Este ramo so troca PRA ONDE o jogador anda — nao mexe em combate nenhum.
    // `updateCombat` decide lutar pelo estado DOS INIMIGOS (`engagedEnemies`),
    // entao o que alcancar o jogador durante a reuniao e enfrentado
    // normalmente, e nenhum turno e desperdicado.
    //
    // `destino` nulo aqui significa "segura a posicao" (esperando retardatario,
    // ver `esperandoRetardatario`) — e nao "sem alvo": cair no wander ali levaria
    // o jogador pra longe justamente de quem esta tentando alcanca-lo.
    const lure = world.lure
    player.state = lure.destino ? 'chase' : 'idle'
    player.wanderTarget = null
    if (lure.destino && !imobilizadoPorStatus(player)) {
      moveToward(player, lure.destino.x, lure.destino.y, player.moveSpeed, dt, mapDef)
    }
  } else {
    // Um shiny OU um protetor (PH-331) em qualquer lugar da hunt sobrepoe tudo
    // mais — o jogador troca de foco pra ele imediatamente, mesmo no meio de
    // outra luta. Fora isso, o jogador sempre anda em direcao a qualquer inimigo
    // vivo mais PROXIMO agora — recalculado do zero todo frame.
    const prioritario = findNearestAlivePrioritario(player, enemies)
    const targetEnemy = prioritario || findNearestAliveEnemy(player, enemies)

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

  // Depois de TODO MUNDO ter andado, nao antes e nao no meio: a separacao
  // desfaz a sobreposicao que o passo deste tick criou. Ver `separarCorpos`.
  separarCorpos(world, dt)
}
