// Port de js/render/Sprites.js — todo desenho de canvas fica aqui. Continua
// lendo direto do estado do motor (WorldEntity/WorldEffect/MapDef) a cada
// frame, exatamente como o original: nenhuma "view model" intermediaria,
// nenhuma dependencia de React (este arquivo nunca importa 'react' nem
// stores por hook — recebe tudo por parametro, chamado de dentro do loop de
// rAF imperativo do <GameCanvas>, ver Fase 5).
//
// Unico desvio de forma (nao de comportamento) do original: `effect.owner`
// era referencia direta a outra Entity; aqui `WorldEffect.ownerId` e so um
// id (ver engine/types.ts) — toda funcao que precisava do owner agora recebe
// tambem `world` pra resolver o id numa entidade de verdade
// (`resolveEffectOwner`), no lugar de `effect.owner` direto.
import { directionRowFromFacing } from '@/engine/systems/animationSystem'
import { protetorDaSala } from '@/engine/systems/salaSystem'
import { hasBattleSprites } from '@/data/battleSprites'
import { effectProgress } from '@/engine/effect'
import { SPECIES } from '@/data/pokes'
import { scaleForSpecies } from '@/data/pokeHeights'
import { footOffsetFraction } from '@/data/spriteFootOffsets'
import { topoOpacoFraction } from '@/data/spriteTopOffsets'
import {
  alturaDaFonte, caixaDoNomeDeGolpe, caixaDoNumeroDeDano, caixaDoRotuloFixo, FONTE, medidorDoCanvas,
  resolverColunasDeTexto, type Caixa, type CaixaDeEfeito, type Janela, type Medidor,
} from './textoDeCombate'
import { hpBarFillColor } from '@/data/hpBar'
import { AURA_COLORS } from '@/data/auraColors'
import { colorForType } from '@/data/typeColors'
import { impactShapeForType, type ImpactShape } from '@/data/impactShapes'
import {
  captureAnimFrameDuration,
  captureAnimFrameRect,
  CAPTURE_ANIM_ANCHOR_X,
  CAPTURE_ANIM_ANCHOR_Y,
} from '@/data/captureAnim'
import { vfxDoGolpe } from '@/data/moveVfx'
import { statusVfxUrl } from '@/data/statusVfx'
import {
  tiraDoElemento, tiraDeAreaDoElemento, orientacaoDaTira, TIRA_CURA_HP, TIRA_CURA_STATUS, TIRA_CONFUSAO, TIRA_SONO,
  TIRA_POR_CONDICAO_NO_CORPO,
  COR_DE_STATUS_NO_CORPO, FORCA_DA_TINTA_DE_STATUS, type TiraDeVfx,
} from '@/data/vfxTiras'
import { VFX_CURA_DURACAO } from '@/engine/entity'
import type { Species } from '@/data/pokes'
import type { WorldEntity, WorldEffect, WorldState } from '@/engine/types'
import type { MapBackground } from '@/data/generated/types'

const IV_MAX = 31

function getSpecies(entity: WorldEntity): Species {
  return SPECIES[entity.poke.speciesId]
}

// PH-228/236: `isProtetor` so existe em EnemyEntity (WorldEntity tambem
// cobre o player) — `in` narrowing pra nao quebrar o union.
//
// PH-256: desde entao ele e o UNICO dono da barra de HP grande. O
// `LEGENDARY_SPECIES_IDS` tambem entrava nela (Modo Pesadelo, boss por especie
// fixa) e saiu por pedido explicito do usuario — lendario volta a desenhar a
// barra do tamanho comum. O protetor por sala/andar nao foi tocado.
function ehProtetor(entity: WorldEntity): boolean {
  return 'isProtetor' in entity && entity.isProtetor === true
}

// Mesmo fator nos 3 lugares que multiplicam scaleForSpecies (spriteBounds,
// visualTopOffset, sombra) — sprite maior precisa da sombra/HP-bar/name-tag
// acompanhando, senao a barra fica flutuando longe da cabeca do protetor.
const PROTETOR_SPRITE_SCALE = 1.4

function effectiveScale(entity: WorldEntity): number {
  return scaleForSpecies(getSpecies(entity).id) * (ehProtetor(entity) ? PROTETOR_SPRITE_SCALE : 1)
}

function maxHp(entity: WorldEntity): number {
  return entity.poke.stats.hp
}

// Distancia de entity.y ate o "pe" visivel de verdade no frame atual — ver
// nota extensa no js/entities/Entity.js original sobre por que isso nao e
// so frameHeight/2.
function groundOffset(entity: WorldEntity): number {
  if (!entity.battleAnim) return entity.radius
  return entity.battleAnim.frameHeight * footOffsetFraction(getSpecies(entity).id)
}

// Battle sprites (assets/battle-sprites/) carregam de forma lazy/async; isso
// cacheia os Image entre desenhos pra nao recriar um a cada frame.
const imageCache = new Map<string, HTMLImageElement>()
function getOrLoadImage(url: string): HTMLImageElement {
  let img = imageCache.get(url)
  if (!img) {
    img = new Image()
    img.src = url
    imageCache.set(url, img)
  }
  return img
}

/**
 * Carrega `url` pro MESMO cache que o desenho usa e resolve quando a imagem
 * esta pronta (ou falhou). Existe pro sistema de preload (data/preload.ts)
 * poder aquecer o cache antes de a cena aparecer, sem duplicar o cache: se ele
 * tivesse um cache proprio, o primeiro frame ainda comecaria um download novo
 * e o placeholder apareceria de novo — que e justamente o bug.
 *
 * Nunca rejeita: sprite faltando e um problema de asset, nao motivo pra travar
 * a entrada numa hunt.
 */
export function primeImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    // `typeof Image === 'undefined'` acontece fora de navegador (teste Node,
    // SSR): sem isso `new Image()` lanca sincrono dentro do executor e vira
    // promise REJEITADA, quebrando o contrato "nunca rejeita" acima.
    if (typeof Image === 'undefined') return resolve()
    const img = getOrLoadImage(url)
    if (img.complete) return resolve()
    img.addEventListener('load', () => resolve(), { once: true })
    img.addEventListener('error', () => resolve(), { once: true })
  })
}

// AQUI VIVIA `isImageReady(url)`, e ela saiu com PH-82 em vez de ficar sem uso.
//
// Ela consultava o cache sem NUNCA preencher, e os dois lugares que a usavam
// como porteira (`drawQuadroDeTira` e `drawGifEffect`) por isso nunca
// disparavam o download da propria arte que estavam esperando. Deixa-la
// exportada seria deixar a armadilha montada pro proximo desenho que precisar
// checar "ja carregou?" — a resposta certa e pegar a imagem com
// `getOrLoadImage` (que inicia o download) e olhar o `complete` dela, que e o
// que `drawCaptureAnim` sempre fez.

/**
 * Um quadro de uma TIRA (data/vfxTiras.ts) desenhado com a ALTURA pedida,
 * centrado em (cx, cy). A largura sai da proporcao do quadro — nunca do
 * quadrado: a arte deste banco tem quadro retangular (o de FOGO e 220x119) e
 * forcar quadrado o espremeria pra metade da largura.
 *
 * `fase` e 0..1 dentro da animacao (ja com as repeticoes aplicadas por quem
 * chama). Devolve false quando a imagem ainda nao carregou, pra quem chama
 * poder cair no desenho de reserva em vez de mostrar um buraco.
 */
function drawQuadroDeTira(
  ctx: CanvasRenderingContext2D,
  tira: TiraDeVfx,
  fase: number,
  cx: number,
  cy: number,
  altura: number,
  alpha: number,
  /**
   * Direcao do golpe (atacante -> alvo), em radianos. So gira a arte marcada
   * como `direcional` em data/vfxTiras.ts; nas outras e ignorado de proposito
   * — anel e cupula nao tem lado, e girar a cupula do PSYCHIC a deitaria no
   * chao. `undefined` (golpe em si mesmo, area) tambem nao gira.
   */
  anguloDeAtaque?: number,
): boolean {
  // `getOrLoadImage` ANTES da checagem, e nao depois — e ele quem DISPARA o
  // download; `isImageReady` so consulta o cache e nunca o preenche.
  //
  // BUG REAL (PH-82): com a ordem invertida, a primeira chamada saia no
  // `return false` sem nunca pedir a imagem, o cache continuava vazio, e a
  // chamada seguinte fazia a mesma coisa — pra sempre. As 23 artes POR GOLPE
  // ficam de fora do preload de proposito (ver data/moveVfx.ts), apostando
  // exatamente neste carregamento no primeiro uso, entao NENHUMA delas jamais
  // apareceu: todo golpe com arte propria caia no burst procedural do tipo, e
  // o Bullet Punch saia identico ao Metal Claw.
  //
  // Medido num canvas isolado, contando pixels: 1436 (procedural) na primeira
  // chamada, 1436 de novo 1,5s depois, e 789 (a arte) so depois de um
  // `primeImage` manual na mesma URL. `drawCaptureAnim`, logo abaixo, sempre
  // fez na ordem certa.
  const img = getOrLoadImage(tira.url)
  if (!img.complete || img.naturalWidth === 0) return false
  const sw = img.naturalWidth / tira.quadros
  const sh = img.naturalHeight
  // clamp antes do modulo: `fase === 1` voltaria pro quadro 0 no ultimo frame
  const indice = Math.min(tira.quadros - 1, Math.max(0, Math.floor(fase * tira.quadros)))
  const largura = altura * (sw / sh)

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
  ctx.imageSmoothingEnabled = false

  // A conta de orientacao mora em data/vfxTiras.ts, como funcao pura: sinal
  // trocado num canvas nao lanca erro nenhum, so espelha a arte, e e o tipo de
  // bug que sobrevive a revisao. Aqui fica so a aplicacao.
  const { giroParaOAlvo, giroDaBase, espelharY, ancoraX, recorteX } = orientacaoDaTira(tira, anguloDeAtaque)
  if (giroParaOAlvo === 0 && giroDaBase === 0 && !espelharY && ancoraX === 0.5 && recorteX === 1) {
    ctx.drawImage(img, indice * sw, 0, sw, sh, cx - largura / 2, cy - altura / 2, largura, altura)
    ctx.restore()
    return true
  }

  // Fatia da direita do quadro — o lado do impacto. `recorteX === 1` devolve o
  // quadro inteiro, entao a conta vale pros dois casos sem ramo extra.
  const larguraFonte = sw * recorteX
  const inicioFonte = indice * sw + (sw - larguraFonte)
  const larguraDestino = largura * recorteX

  // Ordem exigida por `orientacaoDaTira` (ver a nota "DOIS GIROS" la): o espelho
  // fica ENTRE os dois giros, pra refletir em volta da linha do golpe e nao em
  // volta da horizontal do arquivo — a segunda inverte a mira de arte com eixo
  // vertical.
  ctx.translate(cx, cy)
  ctx.rotate(giroParaOAlvo)
  if (espelharY) ctx.scale(1, -1)
  ctx.rotate(giroDaBase)
  ctx.drawImage(
    img, inicioFonte, 0, larguraFonte, sh,
    -larguraDestino * ancoraX, -altura / 2, larguraDestino, altura,
  )
  ctx.restore()
  return true
}

/**
 * A imagem desta URL pronta pra desenhar, ou null se ainda nao esta. Comeca o
 * download na primeira chamada (mesmo cache do resto do desenho), entao quem
 * chama nao precisa de preload — o preload so evita o intervalo em que isto
 * devolve null.
 */
export function readyImage(url: string): HTMLImageElement | null {
  const img = getOrLoadImage(url)
  return img.complete && img.naturalWidth > 0 ? img : null
}

function drawPlaceholderShape(ctx: CanvasRenderingContext2D, entity: WorldEntity): void {
  const { shape, color } = getSpecies(entity)
  const r = entity.radius
  ctx.save()
  ctx.translate(entity.x, entity.y)
  ctx.fillStyle = entity.flashTimer > 0 ? '#ffffff' : color
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 2

  ctx.beginPath()
  if (shape === 'circle') {
    ctx.arc(0, 0, r, 0, Math.PI * 2)
  } else if (shape === 'square') {
    ctx.rect(-r, -r, r * 2, r * 2)
  } else if (shape === 'diamond') {
    ctx.moveTo(0, -r)
    ctx.lineTo(r, 0)
    ctx.lineTo(0, r)
    ctx.lineTo(-r, 0)
    ctx.closePath()
  } else {
    ctx.moveTo(0, -r)
    ctx.lineTo(r, r)
    ctx.lineTo(-r, r)
    ctx.closePath()
  }
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

interface SpriteBounds {
  x: number
  y: number
  w: number
  h: number
}

function spriteBounds(entity: WorldEntity): SpriteBounds | null {
  if (!entity.battleAnim) return null
  const anim = entity.battleAnim
  const scale = effectiveScale(entity)
  const footFraction = footOffsetFraction(getSpecies(entity).id)
  const destW = anim.frameWidth * scale
  const destH = anim.frameHeight * scale
  const groundY = entity.y + groundOffset(entity)
  const topY = groundY - destH * (0.5 + footFraction)
  return { x: entity.x - destW / 2, y: topY, w: destW, h: destH }
}

interface FrameSource {
  img: HTMLImageElement
  sx: number
  sy: number
  sw: number
  sh: number
}

function currentFrameSource(entity: WorldEntity): FrameSource | null {
  if (!entity.battleAnim) return null
  const anim = entity.battleAnim
  const img = getOrLoadImage(anim.url)
  if (!img.complete || img.naturalWidth === 0) return null

  const rowCount = Math.max(1, Math.round(img.naturalHeight / anim.frameHeight))
  const row = Math.min(rowCount - 1, directionRowFromFacing(entity.facing))
  return {
    img,
    sx: entity.animFrame * anim.frameWidth,
    sy: row * anim.frameHeight,
    sw: anim.frameWidth,
    sh: anim.frameHeight,
  }
}

function drawBattleSprite(ctx: CanvasRenderingContext2D, entity: WorldEntity): boolean {
  const frame = currentFrameSource(entity)
  if (!frame) return false

  const bounds = spriteBounds(entity)!

  ctx.save()
  if (entity.flashTimer > 0) ctx.filter = 'brightness(2.2)'
  ctx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, bounds.x, bounds.y, bounds.w, bounds.h)
  ctx.restore()
  drawTintaDeStatus(ctx, entity, frame, bounds)
  return true
}

// Canvas fora da tela pra tingir a sprite. UM so, module-level: criar um por
// frame e por entidade custaria uma alocacao de textura a 60fps.
//
// POR QUE NAO DA PRA TINGIR DIRETO NO CANVAS PRINCIPAL: o modo de composicao
// que pinta "so onde ja tem pixel" (`source-atop`) enxerga TODO o canvas, e
// nesse ponto o fundo da hunt ja foi desenhado — a tinta sairia cobrindo o
// mapa inteiro. Isolando a sprite num canvas proprio, o "ja tem pixel" passa
// a significar exatamente o recorte do POKE.
const canvasDeTinta: HTMLCanvasElement | null =
  typeof document !== 'undefined' ? document.createElement('canvas') : null

function corDeStatusNoCorpo(entity: WorldEntity): string | null {
  const tipo = entity.poke.status?.tipo
  return (tipo && COR_DE_STATUS_NO_CORPO[tipo]) || null
}

/**
 * Tinge o corpo inteiro do POKE com a cor do status que ele carrega — veneno
 * roxo, queimadura laranja, paralisia amarela, congelamento ciano.
 *
 * `FORCA_DA_TINTA_DE_STATUS` e o que separa "arroxeado" de "roxo": a sprite
 * original continua embaixo e so uma fracao da cor entra por cima, entao da
 * pra continuar reconhecendo a especie.
 *
 * Sono e confusao nao entram aqui de proposito — os dois usam simbolo
 * constante sobre a cabeca (drawSimboloDeStatus), nao cor.
 */
function drawTintaDeStatus(
  ctx: CanvasRenderingContext2D,
  entity: WorldEntity,
  frame: FrameSource,
  bounds: SpriteBounds,
): void {
  const cor = corDeStatusNoCorpo(entity)
  if (!cor || !canvasDeTinta) return
  // O canvas so cresce: encolher a cada troca de especie faria realocacao a
  // toa, e mexer em width/height limpa o conteudo (que e reescrito abaixo de
  // qualquer forma).
  if (canvasDeTinta.width < frame.sw) canvasDeTinta.width = frame.sw
  if (canvasDeTinta.height < frame.sh) canvasDeTinta.height = frame.sh
  const off = canvasDeTinta.getContext('2d')
  if (!off) return

  off.globalCompositeOperation = 'source-over'
  off.clearRect(0, 0, canvasDeTinta.width, canvasDeTinta.height)
  off.imageSmoothingEnabled = false
  off.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, frame.sw, frame.sh)
  off.globalCompositeOperation = 'source-atop'
  off.fillStyle = cor
  off.fillRect(0, 0, frame.sw, frame.sh)

  ctx.save()
  ctx.globalAlpha = FORCA_DA_TINTA_DE_STATUS
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(canvasDeTinta, 0, 0, frame.sw, frame.sh, bounds.x, bounds.y, bounds.w, bounds.h)
  ctx.restore()
}

function drawAura(ctx: CanvasRenderingContext2D, entity: WorldEntity): void {
  const ivs = entity.poke.ivs as unknown as Record<string, number>
  const maxedStats = Object.keys(AURA_COLORS).filter((key) => ivs[key] >= IV_MAX)
  if (maxedStats.length === 0) return

  const frame = currentFrameSource(entity)
  const bounds = frame && spriteBounds(entity)
  const alpha = maxedStats.length > 1 ? 0.55 : 0.85

  ctx.save()
  ctx.globalAlpha = alpha
  if (bounds && frame) {
    // Com mais de uma aura, as camadas passam a SOMAR luz em vez de a ultima
    // cobrir as anteriores (pedido explicito de "sobreposicao gerando efeito
    // arco-iris"). `lighter` e blending aditivo: verde + vermelho vira amarelo
    // na regiao onde os dois halos se encontram, e cada cor continua
    // reconhecivel na borda onde so ela alcanca — que e exatamente a leitura
    // util ("este POKE tem HP e Ataque maximos"). Com uma aura so o modo normal
    // e mantido: aditivo sobre fundo claro lavaria a cor.
    if (maxedStats.length > 1) ctx.globalCompositeOperation = 'lighter'
    maxedStats.forEach((stat, i) => {
      ctx.shadowColor = AURA_COLORS[stat]
      ctx.shadowBlur = 9 + i * 5
      ctx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, bounds.x, bounds.y, bounds.w, bounds.h)
    })
  } else {
    maxedStats.forEach((stat, i) => {
      ctx.shadowColor = AURA_COLORS[stat]
      ctx.shadowBlur = 9 + i * 5
      ctx.strokeStyle = AURA_COLORS[stat]
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(entity.x, entity.y, entity.radius + i * 3, 0, Math.PI * 2)
      ctx.stroke()
    })
  }
  ctx.restore()
}

/**
 * Distancia de `entity.y` ate o topo VISIVEL do POKE — o primeiro pixel opaco
 * do quadro, e nao a borda da moldura (PH-189).
 *
 * Ancora de tudo que fica acima do corpo: nome, nivel, barra de HP, aura de
 * boss, simbolo de status e a coluna de texto de combate. Ate a PH-189 ela
 * devolvia o topo da MOLDURA, e como o padding vazio do PMD varia por especie o
 * vao entre a cabeca e o rotulo ia de 0 a 11px — medido em
 * `scripts/harness/vao-do-rotulo.mjs`. Esse vao vazio e justamente a faixa que o
 * texto do POKE vizinho invade.
 *
 * A fracao e lida POR FILEIRA DE DIRECAO, com a mesma fileira que
 * `currentFrameSource` desenha: a silhueta de um POKE de perfil e mais alta que
 * a dele de frente, e acompanhar isso e o que deixa o rotulo colado na cabeca em
 * vez de flutuando acima dela em metade das direcoes.
 */
function visualTopOffset(entity: WorldEntity): number {
  if (!entity.battleAnim) return entity.radius
  const scale = effectiveScale(entity)
  const footFraction = footOffsetFraction(getSpecies(entity).id)
  const topoVazio = topoOpacoFraction(
    getSpecies(entity).id,
    entity.battleAnim.name,
    directionRowFromFacing(entity.facing),
  )
  return entity.battleAnim.frameHeight * (scale * (0.5 + footFraction - topoVazio) - footFraction)
}

function drawShadow(ctx: CanvasRenderingContext2D, entity: WorldEntity): void {
  const groundY = entity.y + groundOffset(entity)
  const baseWidth = entity.battleAnim
    ? entity.battleAnim.frameWidth * effectiveScale(entity)
    : entity.radius * 2
  const rx = baseWidth * 0.32
  ctx.save()
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.beginPath()
  ctx.ellipse(entity.x, groundY - 1, rx, rx * 0.35, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// PH-228/236: aura de "isso e protetor", separada de `drawAura` (que
// sinaliza IV maximizado — semantica diferente, um protetor com IV normal
// nao devia ganhar halo de raridade que ele nao tem). Pulso pelo relogio de
// parede, mesmo padrao de CICLO_SIMBOLO_MS abaixo — enfeite que roda igual
// com o jogo pausado atras de um menu.
const AURA_DO_PROTETOR_CICLO_MS = 1600
const AURA_DO_PROTETOR_RAIO_MIN = 0.85
const AURA_DO_PROTETOR_RAIO_MAX = 1.05

function drawAuraDoProtetor(ctx: CanvasRenderingContext2D, entity: WorldEntity): void {
  if (!ehProtetor(entity)) return
  const cor = colorForType(getSpecies(entity).type)
  const bounds = spriteBounds(entity)
  const raioBase = bounds ? Math.max(bounds.w, bounds.h) * 0.55 : entity.radius * 1.8
  const fase = (performance.now() % AURA_DO_PROTETOR_CICLO_MS) / AURA_DO_PROTETOR_CICLO_MS
  // Onda triangular (sobe e desce) em vez de senoidal — barato e a diferenca
  // nao e perceptivel num halo desse tamanho.
  const pulso = fase < 0.5 ? fase * 2 : 2 - fase * 2
  const raio = raioBase * (AURA_DO_PROTETOR_RAIO_MIN + (AURA_DO_PROTETOR_RAIO_MAX - AURA_DO_PROTETOR_RAIO_MIN) * pulso)
  const centroY = entity.y - visualTopOffset(entity) * 0.5

  ctx.save()
  const grad = ctx.createRadialGradient(entity.x, centroY, 0, entity.x, centroY, raio)
  grad.addColorStop(0, `${cor}66`)
  grad.addColorStop(0.7, `${cor}33`)
  grad.addColorStop(1, `${cor}00`)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(entity.x, centroY, raio, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function drawEntity(ctx: CanvasRenderingContext2D, entity: WorldEntity): void {
  drawShadow(ctx, entity)
  drawAuraDoProtetor(ctx, entity)
  drawAura(ctx, entity)
  const drewSprite = Boolean(entity.battleAnim) && drawBattleSprite(ctx, entity)
  // O placeholder geometrico (triangulo/circulo colorido) e pra especie que NAO
  // TEM arte — nao pra especie cuja arte ainda esta baixando. Antes ele cobria os
  // dois casos, e por isso todo primeiro encontro com uma especie piscava uma
  // forma colorida por alguns frames (o bug visual relatado). O preload
  // (data/preload.ts) aquece o cache antes da cena aparecer; este guard e a
  // segunda linha de defesa pro caso de o preload nao ter terminado (rede lenta,
  // respawn de especie nova no meio da hunt): desenhar nada por 2 frames e
  // melhor que desenhar a coisa errada.
  //
  // O teste e `hasBattleSprites` (a especie tem arte no disco?) e nao
  // `entity.battleAnim` (a animacao ja foi resolvida?), porque `battleAnim` nasce
  // null em toda entidade e so e preenchido no primeiro tick de
  // `updateAnimations` — o rAF de desenho e independente do loop de simulacao,
  // entao o primeiro frame desenhado pode chegar antes disso e piscaria a forma
  // colorida mesmo com a arte ja em cache.
  if (!drewSprite && !hasBattleSprites(getSpecies(entity).id)) drawPlaceholderShape(ctx, entity)
  drawVfxSobreCorpo(ctx, entity)
}

// --- quem sou eu, e em quem estou batendo (PH-189) ---------------------------
//
// Com 4 corpos em cena, achar "qual e o meu" exigia LER o nome da especie —
// texto, no meio de outros seis textos, pra responder a pergunta mais basica da
// tela. `player.targetId` ja existia e ja era publicado por
// `combatSystem#updateCombat`; o canvas simplesmente nao desenhava nada com ele.
//
// Sao duas marcas de FORMA e POSICAO diferentes, nao duas cores da mesma marca:
// um anel no CHAO embaixo do meu POKE, e um colchete em volta do CORPO do alvo.
// Distinguir por cor sozinha falharia pra quem nao separa vermelho de azul, e
// os dois marcadores podem estar na tela ao mesmo tempo.
const COR_DA_MARCA_DO_JOGADOR = '#5eead4'
const COR_DA_MARCA_DO_ALVO = '#fb7185'
const CICLO_DA_MARCA_MS = 1800

/** Onda triangular 0..1 pelo relogio de parede. Mesma escolha de `drawBossAura`. */
function pulsoDaMarca(): number {
  const fase = (performance.now() % CICLO_DA_MARCA_MS) / CICLO_DA_MARCA_MS
  return fase < 0.5 ? fase * 2 : 2 - fase * 2
}

/**
 * Anel no chao embaixo do POKE do jogador.
 *
 * No CHAO e nao em volta do corpo porque o chao esta sempre livre: em volta do
 * corpo ele disputaria com a aura de IV maximo, com a aura de boss e com a
 * tinta de status, e um marcador que some quando o POKE fica envenenado nao
 * serve pra "qual e o meu".
 *
 * Desenhado ANTES dos corpos (ver `Renderer#renderMap`) pra ficar por baixo de
 * todo mundo — e uma marca de chao, e um anel passando por cima de um POKE que
 * anda em cima dele leria como efeito de golpe.
 */
export function drawMarcaDoJogador(ctx: CanvasRenderingContext2D, entity: WorldEntity): void {
  const groundY = entity.y + groundOffset(entity)
  const baseWidth = entity.battleAnim
    ? entity.battleAnim.frameWidth * effectiveScale(entity)
    : entity.radius * 2
  const rx = baseWidth * 0.42 * (0.94 + pulsoDaMarca() * 0.12)

  ctx.save()
  ctx.strokeStyle = COR_DA_MARCA_DO_JOGADOR
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.55 + pulsoDaMarca() * 0.35
  ctx.beginPath()
  ctx.ellipse(entity.x, groundY - 1, rx, rx * 0.35, 0, 0, Math.PI * 2)
  ctx.stroke()
  // Anel interno mais fraco: um traco so, sobre grama de alta frequencia, some.
  // Dois circulos concentricos leem como marcador mesmo com o fundo poluido.
  ctx.globalAlpha *= 0.6
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.ellipse(entity.x, groundY - 1, rx * 0.66, rx * 0.66 * 0.35, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** Comprimento do braco de cada colchete, como fracao do lado da caixa. */
const BRACO_DO_COLCHETE = 0.3

/**
 * Colchetes nos quatro cantos do corpo do alvo atual.
 *
 * Em volta do CORPO (e nao no chao) porque a pergunta e outra: "em quem estou
 * batendo" e sobre o alvo, e o retangulo de mira e a convencao que responde isso
 * sem texto. Desenhado DEPOIS dos corpos, senao o proprio POKE o cobriria.
 *
 * Cantos e nao retangulo fechado: fechado vira uma moldura que compete com a
 * silhueta do POKE — quatro cantos leem como mira e deixam o corpo inteiro
 * visivel.
 */
export function drawMarcaDoAlvo(ctx: CanvasRenderingContext2D, entity: WorldEntity): void {
  const bounds = spriteBounds(entity)
  const meio = entity.radius * 1.2
  const caixa = bounds ?? { x: entity.x - meio, y: entity.y - meio, w: meio * 2, h: meio * 2 }
  // Afasta com o pulso: a mira "respira" em volta do alvo, o que a separa de
  // qualquer coisa estatica desenhada no cenario.
  const folga = 2 + pulsoDaMarca() * 2
  const x0 = caixa.x - folga
  const y0 = caixa.y - folga
  const x1 = caixa.x + caixa.w + folga
  const y1 = caixa.y + caixa.h + folga
  const bx = Math.max(4, caixa.w * BRACO_DO_COLCHETE)
  const by = Math.max(4, caixa.h * BRACO_DO_COLCHETE)

  ctx.save()
  ctx.strokeStyle = COR_DA_MARCA_DO_ALVO
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.globalAlpha = 0.95
  for (const [cx, cy, sx, sy] of [
    [x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1],
  ] as const) {
    ctx.beginPath()
    ctx.moveTo(cx, cy + sy * by)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx + sx * bx, cy)
    ctx.stroke()
  }
  ctx.restore()
}

// Altura do simbolo constante de sono/confusao, em pixel de mundo. Fixa e nao
// proporcional a sprite: um Caterpie e um Steelix precisam do MESMO simbolo
// legivel, e escalar por especie deixaria o do Caterpie ilegivel.
const ALTURA_SIMBOLO_DE_STATUS = 26
// Volta completa do simbolo constante. Vem do relogio de parede, e nao do
// mundo simulado, porque nao ha estado nenhum por tras: e uma animacao de
// enfeite que roda igual mesmo com o jogo pausado atras de um menu.
const CICLO_SIMBOLO_MS = 1400

/**
 * Camada que fica SOBRE o corpo do POKE: faisca de cura (HP e status) e o
 * simbolo constante de sono/confusao.
 *
 * Ordem importa — a faisca de cura vem por ultimo, porque ela e o evento e o
 * simbolo e o estado de fundo (curar um POKE dormindo tem que mostrar a
 * faisca por cima do "Zzz", nao atras dele).
 */
function drawVfxSobreCorpo(ctx: CanvasRenderingContext2D, entity: WorldEntity): void {
  const topo = entity.y - visualTopOffset(entity)
  const meioDoCorpo = (topo + entity.y + groundOffset(entity)) / 2
  const alturaDoCorpo = entity.y + groundOffset(entity) - topo

  // --- estado constante: so um simbolo por vez -----------------------------
  // Sono e nao-volatil e confusao e volatil, entao os dois podem coexistir.
  // Sono ganha: um POKE dormindo nao age, e essa e a informacao que muda o
  // que o jogador entende da cena.
  const simbolo = entity.poke.status?.tipo === 'sleep'
    ? TIRA_SONO
    : entity.statusVolatil?.tipo === 'confusion' ? TIRA_CONFUSAO : null
  if (simbolo) {
    const fase = (Date.now() % CICLO_SIMBOLO_MS) / CICLO_SIMBOLO_MS
    drawQuadroDeTira(
      ctx, simbolo, fase,
      entity.x + entity.radius * 0.9,
      topo - ALTURA_SIMBOLO_DE_STATUS * 0.4,
      ALTURA_SIMBOLO_DE_STATUS, 1,
    )
  }

  // --- condicao constante: faisca de paralisia, brasa de queimadura --------
  // Canal SEPARADO do simbolo acima, e nao mais um caso naquele `if`. Os dois
  // motivos:
  //
  // 1. Nao ha disputa a resolver. `poke.status` guarda UM status nao-volatil,
  //    entao sono e paralisia/queimadura nunca coexistem; o unico encontro
  //    possivel e com a confusao, que e volatil — e a confusao continua ficando
  //    com o badge de canto, que e o unico sinal que ela tem. Paralisia e
  //    queimadura tem a tinta no corpo alem disto.
  // 2. O tamanho e outro. O badge tem 26px de altura fixa; estas duas artes vem
  //    do banco em 214x181 e 51x59, feitas pra cobrir um corpo, e nos 26px do
  //    badge viram um risco e uma mancha.
  //
  // Vem ANTES da faisca de cura pelo mesmo motivo que o simbolo vem: cura e
  // evento e condicao e estado de fundo, entao a faisca fica por cima.
  const condicao = entity.poke.status?.tipo
  const arteDaCondicao = condicao ? TIRA_POR_CONDICAO_NO_CORPO[condicao] : undefined
  if (arteDaCondicao) {
    const fase = (Date.now() % CICLO_CONDICAO_MS) / CICLO_CONDICAO_MS
    drawQuadroDeTira(
      ctx, arteDaCondicao, fase, entity.x, meioDoCorpo,
      Math.max(24, alturaDoCorpo * 0.9), OPACIDADE_DA_CONDICAO,
    )
  }

  // --- evento: faisca de cura ----------------------------------------------
  // `vfxCuraHp`/`vfxCuraStatus` sao CONTAGENS REGRESSIVAS (engine/types.ts),
  // entao a fase e o complemento delas. As duas podem tocar juntas — poção
  // que cura HP e Antidoto usado no mesmo instante — e sobrepor as duas cores
  // e a leitura certa, nao um conflito.
  const alturaDaFaisca = Math.max(28, alturaDoCorpo * 0.95)
  for (const [restante, tira] of [
    [entity.vfxCuraStatus, TIRA_CURA_STATUS] as const,
    [entity.vfxCuraHp, TIRA_CURA_HP] as const,
  ]) {
    if (!restante) continue
    const fase = Math.min(1, Math.max(0, 1 - restante / VFX_CURA_DURACAO))
    drawQuadroDeTira(ctx, tira, fase, entity.x, meioDoCorpo, alturaDaFaisca, VFX_CURA_OPACIDADE)
  }
}

// Pedido explicito: a faisca de cura fica "com 90% de transparencia sobre o
// corpo" — ou seja, quase solida, deixando ver o POKE por baixo.
const VFX_CURA_OPACIDADE = 0.9

// Volta completa da arte de condicao. Mais lenta que o ciclo do badge (1400ms)
// de proposito: ela cobre o corpo inteiro e fica no ar o tempo todo em que o
// status durar, entao piscar no mesmo ritmo do "Zzz" viraria tremor.
const CICLO_CONDICAO_MS = 2000
// 0.75, e o numero saiu de OLHAR, nao de estimar: a primeira versao poe 0.5
// raciocinando que "condicao e estado de fundo", e
// scripts/harness/condicao-sobre-o-corpo.mjs — que compoe a arte sobre o corpo
// REAL do POKE com a tinta de status ja aplicada, no tamanho de jogo — mostrou
// que em 0.5 a faisca de paralisia sobre um Pikachu fica um risco esverdeado
// quase invisivel, exatamente o caso que esta feature existe pra resolver.
// Em 0.9 as brasas cobrem metade da sprite. 0.75 le nos dois e deixa o POKE
// visivel.
const OPACIDADE_DA_CONDICAO = 0.75

const HP_BAR_WIDTH = 32
const HP_BAR_HEIGHT = 5

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, h / 2, w / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

const PROTETOR_HP_BAR_WIDTH_MULTIPLIER = 5
const PROTETOR_HP_BAR_HEIGHT_MULTIPLIER = 2

/**
 * Cor do numero de porcentagem. Branco puro em cima do contorno preto — a COR
 * ja e canal da barra atras (`hpBarFillColor` vai de verde a vermelho), e
 * repetir o mesmo canal no numero nao acrescenta leitura nenhuma; o numero esta
 * ali pra dar a quantidade EXATA que o comprimento de um traco de 32px nao da.
 */
const COR_DA_PORCENTAGEM = '#ffffff'

export function drawHpBar(
  ctx: CanvasRenderingContext2D, entity: WorldEntity, mostrarPorcentagem = false,
): void {
  // PH-228/236 criou a barra grande pro protetor por sala/andar; PH-256 tirou
  // dela o segundo dono. Ate aqui a condicao era
  // `ehProtetor(entity) || LEGENDARY_SPECIES_IDS.includes(...)`, e o lendario
  // do Modo Pesadelo desenhava 160x10 onde um selvagem desenha 32x5. Por pedido
  // explicito do usuario o lendario voltou ao tamanho comum: a escala visual
  // 1.5x, a aura e o nome continuam distinguindo ele em campo, e a barra deixou
  // de ser o quinto sinal da mesma coisa.
  //
  // O nome do multiplicador (`PROTETOR_*`) agora descreve o unico caso que
  // sobrou, e a condicao ficou uma so — mantida em variavel propria porque
  // largura e altura leem a mesma decisao.
  const barraGrande = ehProtetor(entity)
  const width = HP_BAR_WIDTH * (barraGrande ? PROTETOR_HP_BAR_WIDTH_MULTIPLIER : 1)
  const height = HP_BAR_HEIGHT * (barraGrande ? PROTETOR_HP_BAR_HEIGHT_MULTIPLIER : 1)
  const x = entity.x - width / 2
  const y = entity.y - visualTopOffset(entity) - 8 - height
  const pct = Math.max(0, entity.poke.hp / maxHp(entity))

  ctx.save()
  roundedRectPath(ctx, x, y, width, height, height / 2)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)'
  ctx.lineWidth = 1
  ctx.stroke()

  if (pct > 0) {
    roundedRectPath(ctx, x, y, width * pct, height, height / 2)
    ctx.fillStyle = hpBarFillColor(pct)
    ctx.fill()
  }

  // A porcentagem (PH-189). So no POKE do jogador e no alvo dele — quem decide
  // e o `Renderer`, que e quem conhece `player.targetId`. Escrever em todo mundo
  // devolveria ao campo exatamente o excesso de texto que a issue esta tirando
  // dele, e num mob de passagem o numero nao responde pergunta nenhuma: o
  // comprimento da barra ja diz "quase morto".
  //
  // A DIREITA da barra, e nao em cima: acima ficam o nivel (-15) e o nome (-26),
  // e embaixo esta a cabeca do POKE. A lateral e o unico lugar livre que nao
  // empurra nada.
  if (mostrarPorcentagem) {
    // Arredonda pra cima acima de zero: com 1 de HP de 300, `Math.round` daria
    // "0%" num POKE que ainda esta vivo — e "0%" le como morto.
    const inteiro = pct > 0 ? Math.max(1, Math.round(pct * 100)) : 0
    ctx.font = FONTE.porcentagemDeHp
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#000000'
    const texto = `${inteiro}%`
    const py = y + height
    ctx.strokeText(texto, x + width + 3, py)
    ctx.fillStyle = COR_DA_PORCENTAGEM
    ctx.fillText(texto, x + width + 3, py)
  }
  ctx.restore()
}

const SHINY_NAME_COLOR = '#b366ff'

// PH-228/236: cor propria pra distinguir do amarelo de shiny e do branco
// normal — vermelho/dourado le como "aviso/destaque", nao como raridade de
// captura.
const PROTETOR_TAG_COLOR = '#ff4d4d'

// PH-236: qual tag mostrar (Guardian, sala 1-9, ou Lord, sala 10) depende do
// TIPO do protetor — informacao que nao vive na entidade (`isProtetor` so
// marca QUE e protetor, nao QUAL). Quem chama passa o tipo resolvido pela
// sala (`protetorDaSala`, engine/systems/salaSystem.ts) — sprites.ts fica
// livre de reimportar a logica de sala, so decide o texto. `undefined`/
// `null` (player, cena do Hospital, chamador antigo) cai no fallback
// GUARDIAN, mas so aparece na tela quando `isProtetor` tambem for true.
//
// `rotuloDeProtetor` (abaixo) e a UNICA fonte do texto do selo — o
// planejador de texto (PH-189, `medirTextoDeCombate`) precisa medir a mesma
// string que vai pro canvas pra tratar o rotulo como obstaculo; duplicar a
// string ali e aqui vira caixa medida errada no dia em que so um dos dois
// mudar.
export function rotuloDeProtetor(tipoDeProtetor?: 'guardian' | 'lord' | null): string {
  return tipoDeProtetor === 'lord' ? '★ LORD ★' : '★ GUARDIAN ★'
}

export function drawNameLevelTag(
  ctx: CanvasRenderingContext2D,
  entity: WorldEntity,
  tipoDeProtetor?: 'guardian' | 'lord' | null,
): void {
  const halfHeight = visualTopOffset(entity)
  const isShiny = entity.poke.isShiny
  const protetor = ehProtetor(entity)
  const name = isShiny ? `✨ ${getSpecies(entity).name}` : getSpecies(entity).name
  ctx.save()
  ctx.font = FONTE.nomeDaEspecie
  ctx.textAlign = 'center'
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#000000'
  const levelText = `Lv${entity.poke.level}`
  ctx.strokeText(levelText, entity.x, entity.y - halfHeight - 15)
  ctx.fillStyle = '#f1f1f6'
  ctx.fillText(levelText, entity.x, entity.y - halfHeight - 15)
  ctx.strokeText(name, entity.x, entity.y - halfHeight - 26)
  ctx.fillStyle = isShiny ? SHINY_NAME_COLOR : '#f1f1f6'
  ctx.fillText(name, entity.x, entity.y - halfHeight - 26)
  if (protetor) {
    const tagText = rotuloDeProtetor(tipoDeProtetor)
    ctx.font = FONTE.selo
    ctx.strokeText(tagText, entity.x, entity.y - halfHeight - 37)
    ctx.fillStyle = PROTETOR_TAG_COLOR
    ctx.fillText(tagText, entity.x, entity.y - halfHeight - 37)
  }
  ctx.restore()
}

const IMPACT_BASE_SIZE = 44
// Opacidade de TODA sprite/efeito de ataque: 90% solida, 10% transparente.
// Vale pro desenho procedural e pra arte real (drawQuadroDeTira) — os dois
// multiplicam o proprio fade por ela.
const SOLID_OPACITY = 0.9
const HOLD_PORTION = 0.6

function drawShapeParticle(ctx: CanvasRenderingContext2D, shape: ImpactShape, size: number): void {
  const r = size / 2
  switch (shape) {
    case 'flame': {
      ctx.beginPath()
      ctx.moveTo(-r, 0)
      ctx.quadraticCurveTo(-r * 0.3, -r * 0.9, r, -r * 0.15)
      ctx.quadraticCurveTo(r * 0.5, 0, r, r * 0.15)
      ctx.quadraticCurveTo(-r * 0.3, r * 0.9, -r, 0)
      ctx.fill()
      break
    }
    case 'droplet': {
      ctx.beginPath()
      ctx.moveTo(r, 0)
      ctx.quadraticCurveTo(r * 0.2, -r * 0.75, -r, 0)
      ctx.quadraticCurveTo(r * 0.2, r * 0.75, r, 0)
      ctx.fill()
      break
    }
    case 'leaf': {
      ctx.beginPath()
      ctx.ellipse(0, 0, r, r * 0.45, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(-r, 0)
      ctx.lineTo(r, 0)
      ctx.lineWidth = Math.max(1, r * 0.12)
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.stroke()
      break
    }
    case 'shard': {
      ctx.beginPath()
      ctx.moveTo(r, 0)
      ctx.lineTo(-r * 0.5, -r * 0.5)
      ctx.lineTo(-r * 0.5, r * 0.5)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'bolt': {
      ctx.lineWidth = Math.max(1.5, r * 0.35)
      ctx.strokeStyle = ctx.fillStyle as string
      ctx.beginPath()
      ctx.moveTo(-r, -r * 0.6)
      ctx.lineTo(-r * 0.1, -r * 0.1)
      ctx.lineTo(-r * 0.4, r * 0.1)
      ctx.lineTo(r, r * 0.7)
      ctx.stroke()
      break
    }
    case 'crystal': {
      ctx.beginPath()
      ctx.moveTo(0, -r)
      ctx.lineTo(r * 0.55, 0)
      ctx.lineTo(0, r)
      ctx.lineTo(-r * 0.55, 0)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'star': {
      const spikes = 4
      ctx.beginPath()
      for (let i = 0; i < spikes * 2; i++) {
        const rad = i % 2 === 0 ? r : r * 0.35
        const ang = (Math.PI / spikes) * i - Math.PI / 2
        const px = Math.cos(ang) * rad
        const py = Math.sin(ang) * rad
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
      break
    }
    // FAIRY. Um brilho de 4 pontas FINAS (pontas longas, cintura estreita),
    // deliberadamente diferente da 'star' de LUTADOR, que e uma estrela cheia
    // de 4 pontas grossas. As duas sao "estrela" de longe, entao a diferenca
    // tem que estar na proporcao, nao so na cor.
    case 'sparkle': {
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const rad = i % 2 === 0 ? r : r * 0.14
        const ang = (Math.PI / 4) * i - Math.PI / 2
        const px = Math.cos(ang) * rad
        const py = Math.sin(ang) * rad
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
      // Nucleo claro: sem ele o brilho some contra fundo escuro, que e
      // metade das hunts (caverna/cemiterio/covil).
      ctx.globalAlpha *= 0.8
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'bubble': {
      ctx.globalAlpha *= 0.7
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha *= 1.4
      ctx.beginPath()
      ctx.arc(-r * 0.3, -r * 0.3, r * 0.25, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      break
    }
    case 'chunk': {
      ctx.save()
      ctx.rotate(0.5)
      ctx.fillRect(-r * 0.5, -r * 0.5, r, r)
      ctx.restore()
      break
    }
    case 'feather': {
      ctx.beginPath()
      ctx.moveTo(r, 0)
      ctx.quadraticCurveTo(0, -r * 0.55, -r, -r * 0.1)
      ctx.quadraticCurveTo(0, 0, r, 0)
      ctx.quadraticCurveTo(0, r * 0.05, -r, r * 0.1)
      ctx.quadraticCurveTo(0, r * 0.55, r, 0)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(-r * 0.9, 0)
      ctx.lineTo(r * 0.9, 0)
      ctx.lineWidth = Math.max(1, r * 0.1)
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'
      ctx.stroke()
      break
    }
    case 'swirl': {
      ctx.lineWidth = Math.max(1.5, r * 0.3)
      ctx.strokeStyle = ctx.fillStyle as string
      ctx.beginPath()
      ctx.arc(0, 0, r, 0.3, Math.PI * 1.5)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(r * 0.85, 0, r * 0.18, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'wisp': {
      ctx.globalAlpha *= 0.6
      ctx.beginPath()
      ctx.ellipse(0, 0, r, r * 0.7, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'claw': {
      ctx.lineWidth = Math.max(1.5, r * 0.28)
      ctx.strokeStyle = ctx.fillStyle as string
      ctx.lineCap = 'round'
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath()
        ctx.moveTo(-r * 0.6, -r * 0.6 + i * r * 0.5)
        ctx.lineTo(r * 0.6, r * 0.6 + i * r * 0.5)
        ctx.stroke()
      }
      break
    }
    case 'dot':
    default: {
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fill()
      break
    }
  }
}

// Multiplicadores de tamanho da arte real em relacao ao efeito procedural que
// ela substitui. Os quadros do Crawl sao 32x32 com margem transparente
// generosa; desenhados no tamanho cru, o fogo fica visivelmente menor que o
// burst procedural do mesmo golpe.
// ERA 1.6 e isso deixava TODO impacto com mais de duas vezes o tamanho do POKE.
// Medido em 2026-08-18 com `node scripts/conferir-direcao-vfx.mjs`: a altura
// pedida saia em 70px de mundo e o conteudo de cada quadro chegava na tela com
// 59 a 143px, contra um POKE de 29px de diametro (raio 14-15 em
// engine/entity.ts). O efeito COBRIA o alvo — o jogador via o golpe e nao via
// quem levou.
//
// 1.05 poe o impacto em ~46px, uma vez e meia o POKE: le como "acertou aqui" e
// ainda deixa a silhueta do alvo aparecer nas bordas. Tambem para de alcancar o
// atacante, que fica a 39px (raio 14 + raio 15 + padding 10).
//
// A conferencia visual e `node scripts/conferir-vfx-visual.mjs`, que desenha na
// geometria real do combate — atacante, alvo e a distancia entre os dois.
const ESCALA_VFX_SINGLE = 1.05
// O AOE NAO leva esse tratamento de proposito: ali o tamanho da sprite E o
// diametro da area de efeito (`effect.worldSize = ability.radius * 2`), entao
// encolher mentiria sobre o alcance do golpe.
const ESCALA_VFX_AOE = 1.15


/**
 * Fase 0..1 dentro da tira. Uma volta ocupa a vida INTEIRA do efeito: a
 * duracao ja e diferente entre impacto (1,0s) e area (1,2s), entao amarrar a
 * fase ao progresso deixa as duas terminando junto com o proprio efeito, sem
 * constante de fps nova. Arte muito curta pede `repeticoes` (data/moveVfx.ts).
 */
function faseDaTira(effect: WorldEffect, tira: TiraDeVfx): number {
  const repeticoes = vfxDoGolpe(effect.abilityId)?.repeticoes ?? 1
  if (repeticoes <= 1 || tira.quadros <= 0) return effectProgress(effect)
  return (effectProgress(effect) * repeticoes) % 1
}

/** Fade do fim da vida do efeito, ja multiplicado pela opacidade global de VFX. */
function opacidadeDoEfeito(effect: WorldEffect): number {
  const progress = effectProgress(effect)
  const fade = progress < HOLD_PORTION ? 1 : 1 - (progress - HOLD_PORTION) / (1 - HOLD_PORTION)
  return Math.max(0, Math.min(1, fade)) * SOLID_OPACITY
}

/**
 * Quanto o impacto recua do centro do alvo NA DIRECAO do atacante, em px de
 * mundo. Um golpe acerta a face virada pra quem bateu, nao o miolo do bicho.
 *
 * Vale so pra arte que NAO gira. A que gira (`direcional`) ja resolve o
 * posicionamento pelo proprio `ancoraX` — deslocar tambem empurraria a faisca
 * pra fora do alvo, que e o defeito oposto.
 *
 * 8px sai do raio: o POKE tem raio 14-15, entao recuar 8 poe o centro do
 * efeito a pouco mais da metade do corpo, com o desenho ainda cobrindo o alvo
 * inteiro (o impacto mede ~44px contra 29px de POKE). Recuar o raio cheio
 * deixaria o efeito entre os dois, parecendo que errou.
 */
const RECUO_DO_IMPACTO = 8

function encostoNoAlvo(effect: WorldEffect, tira: TiraDeVfx): [number, number] {
  if (tira.direcional || effect.anguloDeAtaque == null) return [0, 0]
  return [
    -Math.cos(effect.anguloDeAtaque) * RECUO_DO_IMPACTO,
    -Math.sin(effect.anguloDeAtaque) * RECUO_DO_IMPACTO,
  ]
}

function drawImpactBurst(ctx: CanvasRenderingContext2D, effect: WorldEffect): void {
  // Arte POR GOLPE antes da arte por tipo (data/moveVfx.ts): Bullet Punch e
  // STEEL, e sem esta consulta ele desenharia o mesmo aco de Metal Claw.
  const arteDoGolpe = vfxDoGolpe(effect.abilityId)
  if (arteDoGolpe) {
    const tamanho = (effect.worldSize || IMPACT_BASE_SIZE) * ESCALA_VFX_SINGLE * (arteDoGolpe.escala?.single ?? 1)
    // Arte de golpe e arte de tipo passam pelo MESMO desenho desde a migracao
    // pra tira: recorte, ancora, giro e espelho vivem num lugar so.
    const [dxg, dyg] = encostoNoAlvo(effect, arteDoGolpe.single)
    if (drawQuadroDeTira(
      ctx, arteDoGolpe.single, faseDaTira(effect, arteDoGolpe.single),
      effect.targetX! + dxg, effect.targetY! + dyg, tamanho,
      opacidadeDoEfeito(effect), effect.anguloDeAtaque,
    )) return
  }

  const tira = tiraDoElemento(effect.elementType)
  if (tira) {
    const tamanho = (effect.worldSize || IMPACT_BASE_SIZE) * ESCALA_VFX_SINGLE * (tira.escala ?? 1)
    // O angulo so entra no impacto ALVO-UNICO. `drawAoeRing` nao passa: area e
    // um circulo centrado em quem lancou, e nao aponta pra ninguem.
    //
    // O DESLOCAMENTO e o que da direcao pras 15 tiras que NAO giram. Elas sao
    // radiais de verdade (anel, estouro, cupula) e girar piora — mas
    // desenhadas no centro exato do alvo elas tambem nao dizem de onde o golpe
    // veio: o mesmo desenho aparece igual quer o atacante esteja a esquerda,
    // acima ou atras. Encostar o efeito na FACE do alvo virada pro atacante
    // devolve essa leitura sem tocar na arte.
    const [dx, dy] = encostoNoAlvo(effect, tira)
    if (drawQuadroDeTira(ctx, tira, faseDaTira(effect, tira), effect.targetX! + dx, effect.targetY! + dy, tamanho, opacidadeDoEfeito(effect), effect.anguloDeAtaque)) return
  }

  const x = effect.targetX!
  const y = effect.targetY!
  const color = effect.color
  const progress = effectProgress(effect)
  const growth = Math.min(1, progress / 0.25)
  const fade = progress < HOLD_PORTION ? 1 : 1 - (progress - HOLD_PORTION) / (1 - HOLD_PORTION)
  const alpha = Math.max(0, Math.min(1, fade)) * SOLID_OPACITY
  const coreRadius = ((effect.worldSize || IMPACT_BASE_SIZE) / 2) * (0.55 + growth * 0.45)
  const shape = impactShapeForType(effect.elementType)

  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = alpha

  const gradient = ctx.createRadialGradient(x, y, 0, x, y, coreRadius)
  gradient.addColorStop(0, `${color}ff`)
  gradient.addColorStop(0.6, `${color}cc`)
  gradient.addColorStop(1, `${color}00`)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, coreRadius, 0, Math.PI * 2)
  ctx.fill()

  const particleCount = 7
  const travel = coreRadius * 1.6 * progress
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2 + i * 0.7
    const px = x + Math.cos(angle) * travel
    const py = y + Math.sin(angle) * travel
    const particleSize = coreRadius * 0.44 * (1 - progress * 0.7)
    if (particleSize <= 0) continue
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(angle)
    ctx.fillStyle = color
    drawShapeParticle(ctx, shape, particleSize)
    ctx.restore()
  }
  ctx.restore()
}

function drawAoeRing(ctx: CanvasRenderingContext2D, effect: WorldEffect): void {
  // `worldSize` e o DIAMETRO real da area de efeito (ability.radius * 2), entao
  // a arte sai exatamente do tamanho do que o golpe atinge — a mesma regra que
  // o anel procedural ja seguia.
  // Mesma precedencia do impacto alvo-unico. `aoe` e opcional em VfxDeGolpe:
  // golpe alvo-unico (o caso de Bullet Punch) nao tem arte de area, e cair pro
  // caminho de tipo/procedural aqui e o certo.
  const arteDoGolpe = vfxDoGolpe(effect.abilityId)
  if (arteDoGolpe?.aoe) {
    const tamanho = effect.worldSize! * ESCALA_VFX_AOE * (arteDoGolpe.escala?.aoe ?? 1)
    // Sem angulo e sem recuo: area e um circulo, nao aponta pra ninguem.
    if (drawQuadroDeTira(
      ctx, arteDoGolpe.aoe, faseDaTira(effect, arteDoGolpe.aoe),
      effect.targetX!, effect.targetY!, tamanho, opacidadeDoEfeito(effect),
    )) return
  }

  // Arte de AREA por TIPO (data/vfxTiras.ts#TIRA_AOE_POR_ELEMENTO), a camada
  // que faltava. Sem ela, area caia direto na tira de IMPACTO logo abaixo — e
  // as quatro tiras direcionais desse lote sao jatos, nao areas: Eruption
  // desenhava um lanca-chamas horizontal esticado ate o diametro do splash.
  // Sem angulo, como todo desenho de area: o circulo e centrado em quem lancou
  // e nao aponta pra ninguem.
  const tiraDeArea = tiraDeAreaDoElemento(effect.elementType)
  if (tiraDeArea) {
    const tamanho = effect.worldSize! * ESCALA_VFX_AOE * (tiraDeArea.escala ?? 1)
    if (drawQuadroDeTira(ctx, tiraDeArea, faseDaTira(effect, tiraDeArea), effect.targetX!, effect.targetY!, tamanho, opacidadeDoEfeito(effect))) return
  }

  // Ultimo recurso antes do procedural: a tira do IMPACTO alvo-unico, esticada
  // pro diametro real do splash. Continua sendo o caminho dos 4 tipos que a
  // camada acima nao cobre (FIGHTING, ROCK, GHOST, STEEL).
  const tira = tiraDoElemento(effect.elementType)
  if (tira) {
    const tamanho = effect.worldSize! * ESCALA_VFX_AOE * (tira.escala ?? 1)
    if (drawQuadroDeTira(ctx, tira, faseDaTira(effect, tira), effect.targetX!, effect.targetY!, tamanho, opacidadeDoEfeito(effect))) return
  }

  const x = effect.targetX!
  const y = effect.targetY!
  const color = effect.color
  const progress = effectProgress(effect)
  const maxRadius = effect.worldSize! / 2
  const eased = 1 - (1 - progress) * (1 - progress)
  const radius = maxRadius * eased
  const fade = progress < HOLD_PORTION ? 1 : 1 - (progress - HOLD_PORTION) / (1 - HOLD_PORTION)
  const alpha = Math.max(0, fade) * SOLID_OPACITY
  const shape = impactShapeForType(effect.elementType)

  ctx.save()
  ctx.globalCompositeOperation = 'source-over'

  ctx.globalAlpha = alpha * 0.5
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.globalAlpha = alpha
  ctx.lineWidth = Math.max(2, 6 * (1 - progress))
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 12
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.shadowBlur = 0

  const particleCount = 12
  const particleSize = Math.max(6, maxRadius * 0.16) * (0.4 + 0.6 * (1 - progress))
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2 + 0.3
    const px = x + Math.cos(angle) * radius
    const py = y + Math.sin(angle) * radius
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(angle)
    ctx.fillStyle = color
    drawShapeParticle(ctx, shape, particleSize)
    ctx.restore()
  }

  ctx.restore()
}

// GIF nativo (nao uma tira de quadros pisada por `effect.age` como
// `drawQuadroDeTira`): o navegador ja anima uma `Image()` apontada pra um
// `.gif` sozinho, e este loop de desenho ja redesenha tudo a cada frame —
// `drawImage` so pega o quadro que o GIF esta mostrando naquele instante,
// de graca. Usado so por golpe de STATUS (data/statusVfx.ts, altura fixa):
// o impacto de DANO migrou pros dois lotes de tira (data/vfxTiras.ts).
function drawGifEffect(ctx: CanvasRenderingContext2D, effect: WorldEffect, url: string, altura: number): boolean {
  // Mesma ordem de `drawQuadroDeTira`, pelo mesmo motivo (PH-82): pegar a
  // imagem e o que inicia o download. Aqui o defeito era menos visivel porque
  // `data/preload.ts` ja aquece os VFX de status na entrada da hunt — mas
  // qualquer cena que nao passe por aquele preload cairia no mesmo buraco.
  const img = getOrLoadImage(url)
  if (!img.complete || img.naturalWidth === 0) return false

  const progress = effectProgress(effect)
  const fade = progress < HOLD_PORTION ? 1 : 1 - (progress - HOLD_PORTION) / (1 - HOLD_PORTION)
  const alpha = Math.max(0, Math.min(1, fade)) * SOLID_OPACITY

  const largura = altura * (img.naturalWidth / img.naturalHeight)

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, effect.targetX! - largura / 2, effect.targetY! - altura / 2, largura, altura)
  ctx.restore()
  return true
}

const STATUS_VFX_ALTURA = 48

function drawStatusEffect(ctx: CanvasRenderingContext2D, effect: WorldEffect): boolean {
  const url = statusVfxUrl(effect.elementType, effect.statusDirection!)
  if (!url) return false
  return drawGifEffect(ctx, effect, url, STATUS_VFX_ALTURA)
}

function drawAbilityEffect(ctx: CanvasRenderingContext2D, effect: WorldEffect): void {
  // A camada por GOLPE (data/moveVfx.ts) vence a de tipo, e isso inclui o VFX
  // de status por tipo+direcao. Ate a PH-367 nao incluia: `drawStatusEffect`
  // era tentado ANTES e devolvia true pra todo golpe de status cujo TIPO tem
  // GIF, entao a arte propria de `charm` (FAIRY), `taunt` (DARK) e
  // `spider_web` (BUG) nunca chegava na tela — as tres estao em disco,
  // cadastradas, cobertas pelo teste de existencia de arquivo e documentadas
  // como "a camada de golpe vence a de tipo". So `dragon_dance` aparecia, e
  // por acidente: DRAGON esta fora de TIPOS_COM_ARTE.
  //
  // A guarda olha o RAMO que vai desenhar, e nao a existencia da entrada:
  // golpe de status de AREA sem `aoe` proprio continua no GIF, que le melhor
  // que a tira de area do tipo. Mesma logica da precedencia de
  // drawImpactBurst/drawAoeRing, escrita uma vez aqui.
  const arteDoGolpe = vfxDoGolpe(effect.abilityId)
  const temArtePropria = effect.isAoe ? !!arteDoGolpe?.aoe : !!arteDoGolpe?.single
  // Sem arte propria (FLYING/DRAGON sem sheet no catalogo — ver statusVfx.ts)
  // ou enquanto o GIF ainda baixa, cai no burst/anel procedural de sempre —
  // mesmo padrao de fallback do resto do arquivo, nao um caminho de erro novo.
  if (effect.statusDirection && !temArtePropria && drawStatusEffect(ctx, effect)) return
  if (effect.isAoe) drawAoeRing(ctx, effect)
  else drawImpactBurst(ctx, effect)
}

// 1:1 com a fonte (64x96). A escala PRECISA ser inteira: com fator nao-inteiro
// e `imageSmoothingEnabled=false`, reducao nao e garantida como point-sampling
// puro em todo motor/GPU — alguns aplicam algo tipo mipmap mesmo com suavizacao
// desligada (ela so controla a AMPLIACAO, nao a reducao) e podem descartar
// metade dos pixels da bola dependendo do alinhamento. Isso ja aconteceu aqui
// com 40/64 = 1.6x, e o print do usuario ("so esta metade") batia exatamente
// com o padrao.
//
// 0.5 = a metade pedida. E seguro apesar do paragrafo acima porque o problema
// nunca foi "reduzir": foi reduzir por um fator que nao divide o pixel
// inteiro. 40/64 = 0,625 faz cada pixel de destino cair sobre 1,6 pixels de
// origem, e a amostragem escolhe de forma irregular quais sobrevivem — dai a
// bola pela metade. 0,5 e divisor exato: cada pixel de destino cobre 2 de
// origem, o descarte e uniforme (um sim, um nao) e o resultado e identico ao
// que sairia reduzindo o arquivo no exportador.
//
// A ancora nao muda junto: ela e FRACAO do quadro (data/captureAnim.ts), nao
// pixel, entao continua caindo no mesmo ponto da bola depois da reducao.
const CAPTURE_ANIM_DRAW_SCALE = 0.5

function drawCaptureAnim(ctx: CanvasRenderingContext2D, effect: WorldEffect): void {
  if (effect.age < effect.delay) return
  const frameIndex = Math.floor((effect.age - effect.delay) / captureAnimFrameDuration())
  const frame = captureAnimFrameRect(effect.ballItemId!, Boolean(effect.success), frameIndex)
  if (!frame) return
  const img = getOrLoadImage(frame.url)
  if (!img.complete || img.naturalWidth === 0) return

  const largura = frame.sw * CAPTURE_ANIM_DRAW_SCALE
  const altura = frame.sh * CAPTURE_ANIM_DRAW_SCALE
  // A bola em repouso nao fica no centro do quadro (o terco de cima e so o
  // arremesso e o estouro) — quem cai sobre o POKE e o ponto de ancora medido
  // em data/captureAnim.ts.
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    img, frame.sx, frame.sy, frame.sw, frame.sh,
    effect.targetX! - largura * CAPTURE_ANIM_ANCHOR_X,
    effect.targetY! - altura * CAPTURE_ANIM_ANCHOR_Y,
    largura, altura,
  )
  ctx.restore()
}

function resolveEffectOwner(effect: WorldEffect, world: WorldState): WorldEntity | null {
  if (!effect.ownerId) return null
  if (world.player && world.player.id === effect.ownerId) return world.player
  return world.enemies.find((e) => e.id === effect.ownerId) || null
}

const EFFECT_LANE_HEIGHT = 16
const EFFECT_BASE_GAP = 44
const EFFECT_COLUMN_X_OFFSET = -18

// Quanto o numero de dano sobe ao longo da vida dele.
const SUBIDA_DO_NUMERO = 30

function effectAnchor(effect: WorldEffect, world: WorldState): { x: number; y: number } {
  const owner = resolveEffectOwner(effect, world)
  if (!owner) return { x: effect.targetX!, y: effect.targetY! }
  return {
    x: owner.x + EFFECT_COLUMN_X_OFFSET,
    y: owner.y - visualTopOffset(owner) - EFFECT_BASE_GAP - effect.lane * EFFECT_LANE_HEIGHT,
  }
}

/**
 * Onde o texto de um efeito e escrito de fato — a ancora do dono ja com o
 * deslocamento proprio do tipo (o float do numero, o offset do nome do golpe).
 *
 * Existe pra o planejador e o desenho lerem o MESMO ponto. Enquanto a conta do
 * float vivia dentro de `drawDamageNumber`, medir a caixa fora dele exigiria
 * repetir a formula, e uma copia que se desatualize mede uma caixa que nao esta
 * onde o texto esta.
 */
function ancoraDoTexto(effect: WorldEffect, world: WorldState): { x: number; y: number } {
  const ancora = effectAnchor(effect, world)
  if (effect.type === 'damageNumber') {
    return { x: ancora.x, y: ancora.y - SUBIDA_DO_NUMERO * effectProgress(effect) }
  }
  return { x: ancora.x, y: ancora.y + ABILITY_NAME_Y_OFFSET }
}

/**
 * Segunda passada de layout do texto de combate, do lado do CLIENTE (PH-189).
 *
 * Devolve quanto cada caixa precisa subir pra ninguem se atropelar. Ver o
 * cabecalho de `render/textoDeCombate.ts` pro porque isto nao pode morar no
 * motor: a raia de la e por dono e nao mede texto, porque vai pro bundle da Edge
 * e precisa ser deterministica sem canvas.
 *
 * Chamado uma vez por quadro pelo `Renderer`, antes do laco que desenha os
 * efeitos. O resultado e passado pra `drawEffect`; sem ele o desenho cai no
 * comportamento antigo (deslocamento zero), que e o que os testes de canal do
 * PH-131 exercitam.
 */
export function planejarTextoDeCombate(
  ctx: CanvasRenderingContext2D, world: WorldState, janela: Janela,
): Map<string, number> {
  const { moveis, fixas } = medirTextoDeCombate(medidorDoCanvas(ctx), world)
  if (moveis.length === 0) return new Map()
  return resolverColunasDeTexto(moveis, fixas, janela)
}

/**
 * As caixas do quadro, medidas e ainda NAO resolvidas.
 *
 * Separada de `planejarTextoDeCombate` pra o teste poder medir a mesma coisa que
 * o jogo mede e conferir sobreposicao com regua — o criterio de aceite da PH-189
 * e explicito em pedir medicao das caixas, e nao inspecao visual.
 */
export function medirTextoDeCombate(
  m: Medidor, world: WorldState,
): { moveis: CaixaDeEfeito[]; fixas: Caixa[] } {
  const moveis: CaixaDeEfeito[] = []
  for (const effect of world.effects) {
    if (effect.type !== 'damageNumber' && effect.type !== 'abilityName') continue
    const owner = resolveEffectOwner(effect, world)
    // Efeito sem dono nao entra: ele nasce colado no ponto do impacto
    // (`targetX/targetY`) e mover isso trocaria o significado do texto.
    if (!owner) continue
    const { x, y } = ancoraDoTexto(effect, world)
    const caixa = effect.type === 'damageNumber'
      ? caixaDoNumeroDeDano(m, effect, x, y)
      : caixaDoNomeDeGolpe(m, effect, x, y)
    moveis.push({ ...caixa, id: effect.id, ownerId: effect.ownerId, lane: effect.lane })
  }

  // PH-236: mesma fonte de verdade do texto (`rotuloDeProtetor`) que
  // `drawNameLevelTag` usa pra desenhar — resolvido uma vez por chamada,
  // igual ao Renderer faz antes do loop de desenho.
  const tipoDeProtetorAtual = protetorDaSala(world.sala)
  const fixas: Caixa[] = []
  for (const entidade of [world.player, ...world.enemies]) {
    if (!entidade || entidade.poke.hp <= 0) continue
    const especie = getSpecies(entidade)
    fixas.push(caixaDoRotuloFixo(
      m,
      entidade.poke.isShiny ? `✨ ${especie.name}` : especie.name,
      `Lv${entidade.poke.level}`,
      ehProtetor(entidade) ? rotuloDeProtetor(tipoDeProtetorAtual) : null,
      entidade.x,
      entidade.y - visualTopOffset(entidade),
    ))
  }

  return { moveis, fixas }
}

/** Marca escrita do critico. Curta pra caber ao lado do numero em 390px. */
const ROTULO_DE_CRITICO = 'CRIT'
const COR_DE_CRITICO = '#ffd166'
/**
 * Placa atras do numero que o POKE do JOGADOR levou (PH-131).
 *
 * A primeira tentativa foi so trocar a cor do CONTORNO para vermelho, e olhando
 * no harness ela reprovou: num numero de 12px o contorno tem 3px e, sobre
 * preenchimento laranja de "super efetivo", ficou indistinguivel do contorno
 * preto. Canal fraco nao e canal. Fundo e area — le de relance e nao disputa
 * nada com a cor do texto, que continua sendo efetividade.
 */
const PLACA_DE_DANO_RECEBIDO = 'rgba(153, 27, 27, 0.85)'
const BORDA_DA_PLACA = 'rgba(248, 113, 113, 0.9)'

/**
 * Numero de dano flutuante, com TRES canais independentes — e a
 * independencia e o ponto (PH-131):
 *
 *   cor do numero  -> efetividade de tipo (super/efetivo/normal/resistido/imune)
 *   tamanho + marca -> critico
 *   placa de fundo  -> de quem e o dano (recebido pelo jogador ou causado por ele)
 *
 * Antes, so o primeiro existia. O critico multiplica o dano
 * (`combatSystem#CRIT_MULTIPLIER`, com Sniper por cima) e nao aparecia em lugar
 * nenhum: o mesmo golpe no mesmo alvo tirava numeros muito diferentes e nada na
 * tela explicava, o que le como sorte ou como bug. E dano recebido era
 * indistinguivel do causado, porque a cor ja estava gasta com efetividade.
 *
 * Sao canais SEPARADOS porque as tres perguntas sao ortogonais: um hit pode ser
 * critico, super efetivo e recebido ao mesmo tempo. Empilhar duas delas na cor
 * faria uma esconder a outra.
 */
function drawDamageNumber(
  ctx: CanvasRenderingContext2D, effect: WorldEffect, world: WorldState, desvio = 0,
): void {
  const progress = effectProgress(effect)
  const alpha = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3
  const anchor = ancoraDoTexto(effect, world)
  const x = anchor.x
  const y = anchor.y - desvio
  const color = effect.color || '#ffffff'
  // Dono do efeito de dano E o alvo que levou o hit (ver spawnDamageNumber).
  const recebidoPeloJogador = Boolean(
    world.player && effect.ownerId != null && effect.ownerId === world.player.id,
  )
  // Contorno preto sempre; branco so na excecao do `immune`, que e preenchido
  // de preto e desapareceria. Autoria NAO mora aqui (ver PLACA_DE_DANO_RECEBIDO).
  const outline = color === '#000000' ? '#ffffff' : '#000000'
  const crit = effect.isCrit === true
  const numero = `-${effect.value}`

  ctx.save()
  ctx.globalAlpha = Math.max(0, alpha)
  ctx.textAlign = 'left'
  ctx.lineWidth = crit ? 4 : 3
  ctx.lineJoin = 'round'
  // Tamanho e canal pre-atentivo: o numero maior e lido como "esse foi
  // diferente" antes de qualquer texto.
  ctx.font = crit ? FONTE.danoCritico : FONTE.dano

  if (recebidoPeloJogador) {
    const m = ctx.measureText(numero)
    const alturaTexto = alturaDaFonte(crit ? FONTE.danoCritico : FONTE.dano)
    const pad = 3
    ctx.fillStyle = PLACA_DE_DANO_RECEBIDO
    roundedRectPath(ctx, x - pad, y - alturaTexto, m.width + pad * 2, alturaTexto + pad, 3)
    ctx.fill()
    ctx.strokeStyle = BORDA_DA_PLACA
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.lineWidth = crit ? 4 : 3
  }

  ctx.strokeStyle = outline
  ctx.fillStyle = color
  ctx.strokeText(numero, x, y)
  ctx.fillText(numero, x, y)

  // A marca escrita e o que TRANSFORMA "numero grande" em "critico". Sem ela o
  // jogador ve variacao, nao causa. Na mesma linha, logo depois do numero, pra
  // nao gastar raia (ver spawnDamageNumber).
  if (crit) {
    const largura = ctx.measureText(numero).width
    ctx.font = FONTE.marcaDeCritico
    ctx.fillStyle = COR_DE_CRITICO
    ctx.strokeText(ROTULO_DE_CRITICO, x + largura + 3, y)
    ctx.fillText(ROTULO_DE_CRITICO, x + largura + 3, y)
  }

  if (effect.effectiveness) {
    const isSuper = effect.effectiveness === 'super'
    ctx.font = isSuper ? FONTE.efetividadeSuper : FONTE.efetividade
    ctx.fillStyle = color
    // O rotulo sobe junto quando o numero cresceu, senao o critico encosta nele.
    const labelY = y - (isSuper ? 14 : 12) - (crit ? 5 : 0)
    ctx.strokeText(effect.effectivenessLabel || effect.effectiveness, x, labelY)
    ctx.fillText(effect.effectivenessLabel || effect.effectiveness, x, labelY)
  }

  ctx.restore()
}

/**
 * Onde o nome do golpe fica: LOGO ABAIXO DA BARRA DE VIDA do POKE que atacou
 * (PH-275), e nao no alto da coluna de texto junto com os numeros de dano.
 *
 * A geometria da placa, de cima pra baixo (`y` cresce pra baixo, e `topo` e
 * `entity.y - visualTopOffset(entity)`, o alto do corpo):
 *
 *   topo - 26   nome da especie      (drawNameLevelTag)
 *   topo - 15   Lv                   (drawNameLevelTag)
 *   topo - 13   barra de vida, 5px de altura, terminando em `topo - 8`
 *   topo +  2   NOME DO GOLPE        <- aqui, encostado na barra
 *   topo        cabeca do sprite
 *
 * O deslocamento parte de `EFFECT_BASE_GAP` porque a ancora da coluna de efeitos
 * comeca justamente `EFFECT_BASE_GAP` ACIMA do topo do corpo: somar isso traz o
 * texto de volta pro corpo.
 *
 * COLADO NA BARRA, e nao 3px abaixo dela (PH-283, a pedido do usuario, depois de
 * ver na tela). Com a folga, o nome flutuava entre a barra e o POKE e nao lia
 * como parte da placa. A placa de fundo (`PLACA_DO_GOLPE`) da a folga visual que
 * o vao dava, sem o texto se soltar da barra: o topo dela encosta em `topo - 8`,
 * que e exatamente onde a barra termina.
 *
 * O `lane` continua embutido na ancora e continua subtraindo — entao um SEGUNDO
 * golpe do mesmo POKE, ainda em cena, cai na raia de cima em vez de escrever por
 * cima do primeiro. Era pedido explicito da issue: dois golpes seguidos nao
 * podem deixar dois textos empilhados no mesmo lugar.
 *
 * Por que perto do corpo e nao no alto: o nome do golpe responde "o que ESTE
 * POKE acabou de fazer", e no alto ele disputava leitura com os numeros de dano,
 * que sao de quem RECEBEU. Duas perguntas diferentes no mesmo lugar.
 */
const ABILITY_NAME_Y_OFFSET = EFFECT_BASE_GAP + 2

/**
 * Fundo da placa do nome do golpe (PH-283).
 *
 * Escuro e translucido: ela existe pra o texto ler sobre QUALQUER coisa — grama
 * clara, o proprio sprite, e principalmente a animacao do golpe, que nos
 * grandes (Lava Plume, Eruption) cobre a area inteira por alguns quadros e
 * engolia o nome. Mesma familia do fundo que o numero de dano recebido ja usa
 * (`PLACA_DE_DANO_RECEBIDO`): area le de relance e nao disputa a COR do texto,
 * que continua sendo o tipo do golpe.
 */
const PLACA_DO_GOLPE = 'rgba(10, 12, 20, 0.72)'
const PLACA_DO_GOLPE_FOLGA_X = 3
const PLACA_DO_GOLPE_FOLGA_Y = 2

function drawAbilityName(
  ctx: CanvasRenderingContext2D, effect: WorldEffect, world: WorldState, desvio = 0,
): void {
  const progress = effectProgress(effect)
  const alpha = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3
  const anchor = ancoraDoTexto(effect, world)
  const x = anchor.x
  const y = anchor.y - desvio

  ctx.save()
  ctx.globalAlpha = Math.max(0, alpha)
  ctx.textAlign = 'left'
  ctx.font = FONTE.nomeDeGolpe

  const largura = ctx.measureText(effect.text ?? '').width
  const altura = alturaDaFonte(FONTE.nomeDeGolpe)
  roundedRectPath(
    ctx,
    x - PLACA_DO_GOLPE_FOLGA_X,
    y - altura - PLACA_DO_GOLPE_FOLGA_Y,
    largura + PLACA_DO_GOLPE_FOLGA_X * 2,
    altura + PLACA_DO_GOLPE_FOLGA_Y * 2,
    2,
  )
  ctx.fillStyle = PLACA_DO_GOLPE
  ctx.fill()

  // O contorno CONTINUA, e nao virou redundante: a placa e translucida, entao
  // sobre um fundo claro que atravesse ela o texto ainda precisa da borda.
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#000000'
  ctx.fillStyle = effect.color || '#cdd6ff'
  ctx.strokeText(effect.text!, x, y)
  ctx.fillText(effect.text!, x, y)
  ctx.restore()
}

// `drawRewardText` foi REMOVIDA aqui (PH-191). O ouro e o XP do abate deixaram
// de ser texto no campo e passaram a VOAR ate a carteira do trilho — ver
// `render/vooDeRecompensa.ts`.
//
// Nao e informacao perdida, e informacao movida: a moeda chega no numero que
// ela muda, e o valor exato aparece no pulso da carteira (alem da linha que o
// ticker do chat ja escrevia). O que se ganha e espaco — medido na PH-189, a
// faixa de texto sobre o combate tem 169 px de MUNDO de largura em 390px, e os
// dois `rewardText` por abate disputavam ela com o numero de dano, que nao tem
// outro lugar nenhum pra ir.
//
// O efeito `rewardText` CONTINUA existindo no `WorldState`: o motor nao foi
// alterado. Quem o consome agora e a camada de VFX, no cliente.

export function drawEffect(
  ctx: CanvasRenderingContext2D, effect: WorldEffect, world: WorldState,
  desvios?: ReadonlyMap<string, number>,
): void {
  const desvio = desvios?.get(effect.id) ?? 0
  if (effect.type === 'damageNumber') return drawDamageNumber(ctx, effect, world, desvio)
  if (effect.type === 'abilityName') return drawAbilityName(ctx, effect, world, desvio)
  if (effect.type === 'abilityEffect') return drawAbilityEffect(ctx, effect)
  if (effect.type === 'captureAnim') return drawCaptureAnim(ctx, effect)
}

// `drawNpcMarker` (quadrado branco com cruz vermelha) vivia aqui e era o unico
// NPC do jogo: a enfermeira do Hospital. Saiu junto com o fundo quadriculado —
// a enfermeira agora e a moca desenhada na propria arte do Centro Pokemon
// (ver render/renderer.ts#renderHospital e data/hospital.ts). Nao ha outro NPC
// pra desenhar, entao a funcao foi removida em vez de ficar como codigo morto.

const HUNT_BG_TILE_SCALE = 0.8
// Folga alem do minimo pra cobrir o mapa (as imagens antigas ja tinham essa
// sobra, calibrada a olho). So entra em jogo quando a imagem NAO e grande o
// bastante em 0.8 — as artes normais (~2048px nativos) nunca chegam perto
// deste teto, ele existe pra imagem de resolucao menor nao deixar buraco de
// cor solida nas bordas do mapa.
const HUNT_BG_COVERAGE_MARGIN = 1.15

export interface MapBackgroundDef {
  bg: MapBackground
  bounds: { width: number; height: number }
  /**
   * Onde a imagem fica, em coordenadas de mundo — vem do arquivo gerado, via
   * `data/maps.ts#arteParaSala`.
   *
   * ISTO DEIXOU DE SER CALCULADO AQUI de proposito. Antes este arquivo e
   * `scripts/build-sub-bioma-collision.js` chegavam na mesma transformacao por
   * conta propria, concordando so porque repetiam as mesmas constantes; e o
   * cabecalho de `data/maps.ts` ja alertava que a grade ser de uma imagem e o
   * pixel na tela ser de outra e a classe de bug mais cara deste sistema.
   * Desde que o mundo virou o recorte da area pintada (PH-80), a conta depende
   * da caixa da tinta e nao ha como derivar aqui — o gerador manda, o desenho
   * obedece.
   *
   * Ausente = arte sem referencia pintada. Cai no enquadramento antigo
   * (centrado nos bounds, esticado pra cobrir), que continua valendo pra
   * qualquer cena que nao passe pelo walk-block — hoje, o Hospital.
   */
  arte?: { escala: number; x: number; y: number }
}

export interface Viewport {
  x: number
  y: number
  w: number
  h: number
}

// --- borda que desmancha (PH-95) --------------------------------------------
//
// A arte da hunt terminava numa aresta reta: um retangulo colado em cima de uma
// cor solida, em vez de um pedaco de mundo. Pedido do usuario: "um pincel
// magico nas bordas, pra nao ficar quadrado o mapa".
//
// POR QUE PINTAR A COR POR CIMA, E NAO MASCARAR A IMAGEM
// ---------------------------------------------------------------------------
// O caminho obvio seria montar, uma vez por arte, um canvas offscreen com a
// imagem e apagar as bordas com `destination-out`. Cacheado, custa uma vez so.
//
// Nao cabe: as artes tem ~2048x2048, ou seja ~16 MB de canvas cada. Sao 31
// artes, e trocar de sub-bioma acontece a cada quota de abates — um cache que
// segure as visitadas passa de meio giga, e um que segure duas remonta a
// mascara em toda troca de sala, no meio do jogo.
//
// Como a area em volta da imagem JA e preenchida com `primary` (a cor de fundo
// do bioma), o mesmo efeito sai de graca pelo outro lado: em vez de apagar a
// borda da imagem, pinta-se `primary` por cima dela, opaco na aresta e
// transparente pra dentro. A imagem dissolve na cor que ja estava atras. Zero
// canvas extra, zero memoria, e o laco de desenho continua com um `drawImage`.
//
// O RUIDO NAO PODE VIR DO MOTOR
// ---------------------------------------------------------------------------
// Nada aqui toca `world.rng`. Aquele gerador e autoritativo e compartilhado com
// o resim do servidor — sortear a posicao de uma mancha decorativa nele
// dessincronizaria a sequencia e o flush passaria a divergir do que o cliente
// mostrou (a classe de bug do PH-37). O ruido desta borda sai de um hash da URL
// da arte: deterministico, igual em toda maquina, e sem relacao nenhuma com a
// simulacao.

// Largura do esfumado como fracao do menor lado da arte. Fracao, e nao pixels:
// as artes vao de ~1250px a ~2048px nativos, e um valor fixo seria uma moldura
// grossa numa e um fio na outra.
//
// Era 0.12, e 0.12 POR ARESTA quer dizer 24% do menor lado somando os dois
// lados opostos — quase um quarto do cenario visivel entregue ao esfumado, mais
// o raio das manchas (abaixo), que passa disso pra dentro. Pedido do usuario:
// "faca o embacado das laterais ocupar menos parte do mapa".
const BORDA_FRACAO = 0.055
// Manchas por aresta. O esfumado reto sozinho ainda le como retangulo (de
// cantos macios, mas retangulo); as manchas e que quebram a linha.
//
// Eram 9, e subiu junto com a queda de BORDA_FRACAO — NAO e enfeite. O raio da
// mancha e fracao da MESMA constante, entao encolher a faixa encolhe cada
// mancha na mesma proporcao: com 9 manchas de raio ~0.055 os diametros somados
// mal cobrem uma vez o comprimento da aresta, e sobra trecho reto entre elas.
// Reduzir a faixa sem isto devolveria a borda de retangulo que o PH-95 existiu
// pra tirar, so mais fina.
const MANCHAS_POR_ARESTA = 18

/** Hash estavel de string -> semente. Pequeno de proposito: o unico requisito
 *  e ser o MESMO numero em toda maquina pra a borda nao "respirar" entre
 *  sessoes nem diferir entre jogadores. */
function semeteDaArte(chave: string): number {
  let h = 2166136261
  for (let i = 0; i < chave.length; i++) {
    h ^= chave.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** LCG minusculo. Nao precisa de qualidade estatistica — precisa ser barato e
 *  repetivel. */
function sorteioLocal(semente: number): () => number {
  let s = semente || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * A geometria da borda de uma arte, montada uma vez e guardada.
 *
 * Guardar isto (e nao a imagem mascarada) e o que faz o cache ser barato: sao
 * ~28 numeros por arte, nao 16 MB de pixels.
 */
interface BordaDaArte {
  /** Manchas em coordenadas NORMALIZADAS (0..1) do retangulo da arte, com raio
   *  em fracao do menor lado — assim a mesma geometria serve qualquer zoom e
   *  qualquer enquadramento sem recalcular. */
  manchas: { u: number; v: number; r: number }[]
}

const bordasPorArte = new Map<string, BordaDaArte>()

function bordaDaArte(chave: string): BordaDaArte {
  const cacheada = bordasPorArte.get(chave)
  if (cacheada) return cacheada

  const rand = sorteioLocal(semeteDaArte(chave))
  const manchas: BordaDaArte['manchas'] = []
  for (let aresta = 0; aresta < 4; aresta++) {
    for (let i = 0; i < MANCHAS_POR_ARESTA; i++) {
      // Distribuidas ao longo da aresta com jitter, em vez de posicao
      // totalmente aleatoria: aleatorio puro deixa buraco (um trecho da aresta
      // sem mancha nenhuma, que volta a parecer reto) e amontoado.
      const t = (i + 0.5) / MANCHAS_POR_ARESTA + (rand() - 0.5) * (0.8 / MANCHAS_POR_ARESTA)
      // Mancha centrada SOBRE a aresta (nao dentro nem fora): metade dela come
      // a imagem, metade cai no fundo, que e o que produz recorte irregular em
      // vez de dentado pra um lado so.
      const desvio = (rand() - 0.5) * BORDA_FRACAO * 0.6
      const r = BORDA_FRACAO * (0.6 + rand() * 1.0)
      if (aresta === 0) manchas.push({ u: t, v: 0 + desvio, r })
      else if (aresta === 1) manchas.push({ u: t, v: 1 + desvio, r })
      else if (aresta === 2) manchas.push({ u: 0 + desvio, v: t, r })
      else manchas.push({ u: 1 + desvio, v: t, r })
    }
  }
  const borda = { manchas }
  bordasPorArte.set(chave, borda)
  return borda
}

/**
 * A MESMA cor com alpha 0 — e nunca a palavra-chave `transparent`.
 *
 * BUG REAL, VISTO NA TELA na primeira versao desta borda: `transparent` e
 * `rgba(0,0,0,0)`, ou seja PRETO com alpha zero. Um gradiente de `#3f5a34` ate
 * `transparent` interpola o RGB rumo ao preto junto com o alpha, entao o meio
 * do gradiente e preto meio-transparente. As manchas apareciam como discos
 * ESCUROS flutuando sobre o fundo solido, em vez de invisiveis — que e o que
 * elas tem que ser fora da imagem, ja que ali a cor pintada e igual a cor que
 * ja estava atras.
 *
 * As cores de bioma sao hex de 6 digitos hoje (`#3f5a34`), mas nao da pra
 * assumir isso: a normalizacao vai pelo proprio canvas, que aceita qualquer
 * cor CSS valida e devolve `#rrggbb` ou `rgba(...)`.
 */
function comAlphaZero(ctx: CanvasRenderingContext2D, cor: string): string {
  const anterior = ctx.fillStyle
  ctx.fillStyle = cor
  const normalizada = String(ctx.fillStyle)
  ctx.fillStyle = anterior

  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(normalizada)
  if (hex) {
    return `rgba(${parseInt(hex[1], 16)}, ${parseInt(hex[2], 16)}, ${parseInt(hex[3], 16)}, 0)`
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(normalizada)
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, 0)`
  // Cor que o canvas normalizou pra algo que nao reconhecemos (gradiente,
  // pattern, `currentColor` herdado). `transparent` de volta e pior que nao
  // desenhar: melhor a borda dura de antes que uma sombra preta em volta dela.
  return normalizada
}

/**
 * Dissolve as bordas do retangulo (x,y,w,h) na cor `cor`.
 *
 * Chamado DEPOIS do `drawImage` da arte e dentro do mesmo `save`/`restore`.
 */
function desmancharBorda(
  ctx: CanvasRenderingContext2D,
  chave: string,
  cor: string,
  x: number, y: number, w: number, h: number,
): void {
  const menorLado = Math.min(w, h)
  const faixa = menorLado * BORDA_FRACAO
  if (faixa <= 0) return

  const corSumindo = comAlphaZero(ctx, cor)

  // 1) Rampa por aresta.
  const rampas: [number, number, number, number, number, number, number, number][] = [
    [x, y, x, y + faixa, x, y, w, faixa],
    [x, y + h, x, y + h - faixa, x, y + h - faixa, w, faixa],
    [x, y, x + faixa, y, x, y, faixa, h],
    [x + w, y, x + w - faixa, y, x + w - faixa, y, faixa, h],
  ]
  for (const [gx0, gy0, gx1, gy1, rx, ry, rw, rh] of rampas) {
    const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1)
    g.addColorStop(0, cor)
    g.addColorStop(1, corSumindo)
    ctx.fillStyle = g
    ctx.fillRect(rx, ry, rw, rh)
  }

  // 2) Manchas por cima, pra a aresta deixar de ser uma linha.
  const { manchas } = bordaDaArte(chave)
  for (const m of manchas) {
    const cx = x + m.u * w
    const cy = y + m.v * h
    const raio = m.r * menorLado
    const g = ctx.createRadialGradient(cx, cy, raio * 0.42, cx, cy, raio)
    g.addColorStop(0, cor)
    g.addColorStop(1, corSumindo)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, raio, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function drawMapBackground(ctx: CanvasRenderingContext2D, map: MapBackgroundDef, viewport: Viewport): void {
  const { primary, secondary, image } = map.bg
  const img = image ? getOrLoadImage(image) : null
  const imageReady = Boolean(img && img.complete && img.naturalWidth > 0)

  ctx.save()
  if (imageReady && img) {
    ctx.fillStyle = primary
    const baseMargin = 300
    ctx.fillRect(viewport.x - baseMargin, viewport.y - baseMargin, viewport.w + baseMargin * 2, viewport.h + baseMargin * 2)

    // Escala por imagem, nao mais uma constante cega: com a leva de
    // backgrounds novos, achamos 2 arquivos na metade da resolucao dos
    // outros (1254px contra ~2048px) — em 0.8 fixo, isso desenhava menos
    // largura que o proprio mapa (buraco visivel nas bordas em zoom normal,
    // nao so no zoom-out extremo que ja era aceito). A escala agora nunca
    // desenha a imagem menor do que o necessario pra cobrir o mapa, qualquer
    // que seja a resolucao nativa do arquivo.
    if (map.arte) {
      const iw = img.naturalWidth * map.arte.escala
      const ih = img.naturalHeight * map.arte.escala
      ctx.drawImage(img, map.arte.x, map.arte.y, iw, ih)
      desmancharBorda(ctx, image!, primary, map.arte.x, map.arte.y, iw, ih)
    } else {
      const escalaMinima = Math.max(
        (map.bounds.width * HUNT_BG_COVERAGE_MARGIN) / img.naturalWidth,
        (map.bounds.height * HUNT_BG_COVERAGE_MARGIN) / img.naturalHeight,
      )
      const escala = Math.max(HUNT_BG_TILE_SCALE, escalaMinima)
      const iw = img.naturalWidth * escala
      const ih = img.naturalHeight * escala
      const mapCx = map.bounds.width / 2
      const mapCy = map.bounds.height / 2
      // Este ramo desenha a arte MAIOR que o mapa de proposito (ela cobre os
      // bounds com sobra), entao a aresta dela cai fora da area jogavel e
      // desmanchar ali nao tem o que resolver — pior, comeria imagem que o
      // enquadramento pos justamente pra nao faltar cobertura na borda do
      // mundo. Hoje so o Hospital cai aqui (arte sem referencia pintada).
      ctx.drawImage(img, mapCx - iw / 2, mapCy - ih / 2, iw, ih)
    }
  } else {
    const tile = 48
    const margin = 300
    ctx.fillStyle = primary
    ctx.fillRect(viewport.x - margin, viewport.y - margin, viewport.w + margin * 2, viewport.h + margin * 2)
    ctx.fillStyle = secondary
    const startCol = Math.floor(viewport.x / tile)
    const endCol = Math.ceil((viewport.x + viewport.w) / tile)
    const startRow = Math.floor(viewport.y / tile)
    const endRow = Math.ceil((viewport.y + viewport.h) / tile)
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        if ((row + col) % 2 === 0) {
          ctx.fillRect(col * tile, row * tile, tile, tile)
        }
      }
    }
  }
  ctx.restore()
}
