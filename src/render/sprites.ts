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
import { hasBattleSprites } from '@/data/battleSprites'
import { effectProgress } from '@/engine/effect'
import { SPECIES } from '@/data/pokes'
import { scaleForSpecies } from '@/data/pokeHeights'
import { footOffsetFraction } from '@/data/spriteFootOffsets'
import { hpBarFillColor } from '@/data/hpBar'
import { AURA_COLORS } from '@/data/auraColors'
import { LEGENDARY_SPECIES_IDS } from '@/data/legendaries'
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

/** A imagem desta URL ja esta decodificada e pronta pra desenhar? */
export function isImageReady(url: string): boolean {
  const img = imageCache.get(url)
  return Boolean(img && img.complete && img.naturalWidth > 0)
}

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
  if (!isImageReady(tira.url)) return false
  const img = getOrLoadImage(tira.url)
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
  const { girar, espelharY, ancoraX, recorteX } = orientacaoDaTira(tira, anguloDeAtaque)
  if (girar === 0 && !espelharY && ancoraX === 0.5 && recorteX === 1) {
    ctx.drawImage(img, indice * sw, 0, sw, sh, cx - largura / 2, cy - altura / 2, largura, altura)
    ctx.restore()
    return true
  }

  // Fatia da direita do quadro — o lado do impacto. `recorteX === 1` devolve o
  // quadro inteiro, entao a conta vale pros dois casos sem ramo extra.
  const larguraFonte = sw * recorteX
  const inicioFonte = indice * sw + (sw - larguraFonte)
  const larguraDestino = largura * recorteX

  ctx.translate(cx, cy)
  ctx.rotate(girar)
  if (espelharY) ctx.scale(1, -1)
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
  const scale = scaleForSpecies(getSpecies(entity).id)
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

function visualTopOffset(entity: WorldEntity): number {
  if (!entity.battleAnim) return entity.radius
  const scale = scaleForSpecies(getSpecies(entity).id)
  const footFraction = footOffsetFraction(getSpecies(entity).id)
  return entity.battleAnim.frameHeight * (scale * (0.5 + footFraction) - footFraction)
}

function drawShadow(ctx: CanvasRenderingContext2D, entity: WorldEntity): void {
  const groundY = entity.y + groundOffset(entity)
  const baseWidth = entity.battleAnim
    ? entity.battleAnim.frameWidth * scaleForSpecies(getSpecies(entity).id)
    : entity.radius * 2
  const rx = baseWidth * 0.32
  ctx.save()
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.beginPath()
  ctx.ellipse(entity.x, groundY - 1, rx, rx * 0.35, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function drawEntity(ctx: CanvasRenderingContext2D, entity: WorldEntity): void {
  drawShadow(ctx, entity)
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

const BOSS_HP_BAR_WIDTH_MULTIPLIER = 5
const BOSS_HP_BAR_HEIGHT_MULTIPLIER = 2

export function drawHpBar(ctx: CanvasRenderingContext2D, entity: WorldEntity): void {
  const isBoss = LEGENDARY_SPECIES_IDS.includes(getSpecies(entity).id)
  const width = HP_BAR_WIDTH * (isBoss ? BOSS_HP_BAR_WIDTH_MULTIPLIER : 1)
  const height = HP_BAR_HEIGHT * (isBoss ? BOSS_HP_BAR_HEIGHT_MULTIPLIER : 1)
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
  ctx.restore()
}

const SHINY_NAME_COLOR = '#b366ff'

export function drawNameLevelTag(ctx: CanvasRenderingContext2D, entity: WorldEntity): void {
  const halfHeight = visualTopOffset(entity)
  const isShiny = entity.poke.isShiny
  const name = isShiny ? `✨ ${getSpecies(entity).name}` : getSpecies(entity).name
  ctx.save()
  ctx.font = '9px monospace'
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
  if (!isImageReady(url)) return false
  const img = getOrLoadImage(url)

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
  // Tenta a arte de status primeiro; sem ela (FLYING/DRAGON, sem sheet no
  // catalogo — ver statusVfx.ts) ou enquanto o GIF ainda baixa, cai no
  // burst/anel procedural de sempre — mesmo padrao de fallback do resto do
  // arquivo, nao um caminho de erro novo.
  if (effect.statusDirection && drawStatusEffect(ctx, effect)) return
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

function effectAnchor(effect: WorldEffect, world: WorldState): { x: number; y: number } {
  const owner = resolveEffectOwner(effect, world)
  if (!owner) return { x: effect.targetX!, y: effect.targetY! }
  return {
    x: owner.x + EFFECT_COLUMN_X_OFFSET,
    y: owner.y - visualTopOffset(owner) - EFFECT_BASE_GAP - effect.lane * EFFECT_LANE_HEIGHT,
  }
}

function drawDamageNumber(ctx: CanvasRenderingContext2D, effect: WorldEffect, world: WorldState): void {
  const progress = effectProgress(effect)
  const floatOffset = 30 * progress
  const alpha = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3
  const anchor = effectAnchor(effect, world)
  const x = anchor.x
  const y = anchor.y - floatOffset
  const color = effect.color || '#ffffff'
  const outline = color === '#000000' ? '#ffffff' : '#000000'

  ctx.save()
  ctx.globalAlpha = Math.max(0, alpha)
  ctx.textAlign = 'left'
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.strokeStyle = outline
  ctx.font = 'bold 12px monospace'
  ctx.fillStyle = color
  ctx.strokeText(`-${effect.value}`, x, y)
  ctx.fillText(`-${effect.value}`, x, y)

  if (effect.effectiveness) {
    const isSuper = effect.effectiveness === 'super'
    ctx.font = isSuper ? 'bold 13px monospace' : '9px monospace'
    ctx.fillStyle = color
    const labelY = y - (isSuper ? 14 : 12)
    ctx.strokeText(effect.effectivenessLabel || effect.effectiveness, x, labelY)
    ctx.fillText(effect.effectivenessLabel || effect.effectiveness, x, labelY)
  }

  ctx.restore()
}

const ABILITY_NAME_Y_OFFSET = 2

function drawAbilityName(ctx: CanvasRenderingContext2D, effect: WorldEffect, world: WorldState): void {
  const progress = effectProgress(effect)
  const alpha = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3
  const anchor = effectAnchor(effect, world)
  const x = anchor.x
  const y = anchor.y + ABILITY_NAME_Y_OFFSET

  ctx.save()
  ctx.globalAlpha = Math.max(0, alpha)
  ctx.textAlign = 'left'
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#000000'
  ctx.font = 'bold 8px monospace'
  ctx.fillStyle = effect.color || '#cdd6ff'
  ctx.strokeText(effect.text!, x, y)
  ctx.fillText(effect.text!, x, y)
  ctx.restore()
}

function drawRewardText(ctx: CanvasRenderingContext2D, effect: WorldEffect, world: WorldState): void {
  const progress = effectProgress(effect)
  const floatOffset = 34 * progress
  const alpha = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3
  const anchor = effectAnchor(effect, world)
  const x = anchor.x
  const y = anchor.y - floatOffset
  const label = `+${effect.value}${effect.unit ? ' ' + effect.unit : ''}`

  ctx.save()
  ctx.globalAlpha = Math.max(0, alpha)
  ctx.textAlign = 'left'
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#000000'
  ctx.font = 'bold 11px monospace'
  ctx.fillStyle = effect.color
  ctx.strokeText(label, x, y)
  ctx.fillText(label, x, y)
  ctx.restore()
}

export function drawEffect(ctx: CanvasRenderingContext2D, effect: WorldEffect, world: WorldState): void {
  if (effect.type === 'damageNumber') return drawDamageNumber(ctx, effect, world)
  if (effect.type === 'abilityName') return drawAbilityName(ctx, effect, world)
  if (effect.type === 'rewardText') return drawRewardText(ctx, effect, world)
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
}

export interface Viewport {
  x: number
  y: number
  w: number
  h: number
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
    const escalaMinima = Math.max(
      (map.bounds.width * HUNT_BG_COVERAGE_MARGIN) / img.naturalWidth,
      (map.bounds.height * HUNT_BG_COVERAGE_MARGIN) / img.naturalHeight,
    )
    const escala = Math.max(HUNT_BG_TILE_SCALE, escalaMinima)
    const iw = img.naturalWidth * escala
    const ih = img.naturalHeight * escala
    const mapCx = map.bounds.width / 2
    const mapCy = map.bounds.height / 2
    ctx.drawImage(img, mapCx - iw / 2, mapCy - ih / 2, iw, ih)
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
