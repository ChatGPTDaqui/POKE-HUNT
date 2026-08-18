// Port de js/render/Renderer.js. Wrapper de canvas 2D com estado de camera/
// zoom, chamado imperativamente pelo loop de rAF do <GameCanvas> (Fase 5) —
// nunca via re-render do React.
//
// Desvio deliberado do original em renderHospital: o vanilla mutava
// `playerEntity.x/y` temporariamente (pra reusar drawEntity/drawHpBar/
// drawNameLevelTag na posicao fixa da cena do Hospital) e restaurava depois.
// Isso e seguro com um objeto de classe mutavel solto, mas `playerEntity`
// aqui vem do `worldStore` (Zustand+immer) — em desenvolvimento o Immer
// congela (`Object.freeze`) o estado que produz, entao mutar
// `playerEntity.x = ...` direto lançaria erro ("Cannot assign to read only
// property"). Troquei por uma copia rasa com x/y sobrescritos — mesmo
// resultado visual, sem mutar nada do store, e de brinde evita o hazard que
// a nota original ja mencionava ("dois desenhos no mesmo tick, ex.
// StrictMode double-invoke, podem corromper a posicao").
import { drawEntity, drawHpBar, drawNameLevelTag, drawEffect, drawMapBackground, readyImage } from './sprites'
import { CENA_HOSPITAL, escalaDoPoke } from '@/data/hospital'
import type { WorldEntity, WorldState } from '@/engine/types'
import { backgroundParaSala } from '@/data/maps'
import type { MapDef } from '@/data/maps'

// Fundo por sub-bioma: a sala troca de sub-bioma a cada quota de abates (ver
// salaSystem.ts) mas ate 2026-08-15 o FUNDO ficava parado no do bioma inteiro
// — inconsistente com o HUD ja anunciando o sub-bioma novo.
//
// A regra nasceu aqui e MUDOU DE CASA em 2026-08-18 pra `data/maps.ts`: ela
// tambem decide qual walk-block pintado vale, e duas copias divergiriam em
// silencio (colisao de uma imagem, pixel na tela de outra). Importada, nao
// reescrita.

// Cor de fundo enquanto a arte do Centro Pokemon nao terminou de decodificar.
// Escura de proposito: a propria arte tem fundo preto em volta do predio,
// entao a troca "cor solida -> imagem" nao pisca.
const HOSPITAL_FALLBACK = '#0d0d10'

// Tamanho de tela do nome/nivel e da barra de HP do POKE no Hospital. 1.5 e o
// zoom padrao com que a hunt desenha os mesmos elementos, entao o rotulo tem
// ali a mesma legibilidade que tem no combate.
const ESCALA_ROTULO_POKE = 1.5

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.5
const ZOOM_SENSITIVITY = 0.0015
const ZOOM_STEP = 0.1
const DEFAULT_ZOOM = 1.5
const PLAYER_ANCHOR_Y = 0.58

export interface ScreenPoint {
  x: number
  y: number
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, h / 2, w / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

export class Renderer {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  zoom: number

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context indisponivel')
    this.ctx = ctx
    this.ctx.imageSmoothingEnabled = false
    this.width = canvas.width
    this.height = canvas.height
    this.zoom = DEFAULT_ZOOM
  }

  handleResize(): void {
    this.width = this.canvas.width
    this.height = this.canvas.height
  }

  adjustZoom(deltaY: number): void {
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom - deltaY * ZOOM_SENSITIVITY))
  }

  zoomStep(direction: number): number {
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom + direction * ZOOM_STEP))
    return this.zoom
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height)
  }

  /**
   * Como a arte do Centro Pokemon (quadrada) e encaixada nesta tela: `cover`
   * (preenche, cortando o excedente), nunca `contain`.
   *
   * Cover corta as bordas, e isso e seguro AQUI porque os dois pontos que
   * importam — a enfermeira e o tapete — ficam colados no eixo central da
   * imagem: sobrevivem tanto ao corte lateral do retrato (celular) quanto ao
   * corte de topo/rodape do ultrawide. Contain deixaria tarja preta em toda
   * tela que nao fosse quadrada.
   *
   * O ZOOM NAO ENTRA NESTA CONTA de proposito. Zoom e controle de CAMERA sobre
   * um mapa maior que a tela; o Hospital e um cenario fixo. Aplicar zoom aqui
   * so cortaria mais o cenario, e no maximo (2.5x) o tapete — onde fica o POKE
   * — sai inteiro da tela. Pior: com a enfermeira virando o botao de curar, um
   * nivel de zoom que a esconde e um beco sem saida. O ZoomControl fica oculto
   * fora da hunt (ver HudLayer) pra nao virar um botao que nao faz nada.
   */
  private _hospitalLayout(): { escala: number; ox: number; oy: number } {
    const escala = Math.max(this.width / CENA_HOSPITAL.largura, this.height / CENA_HOSPITAL.altura)
    return {
      escala,
      ox: (this.width - CENA_HOSPITAL.largura * escala) / 2,
      oy: (this.height - CENA_HOSPITAL.altura * escala) / 2,
    }
  }

  /** Fracao da imagem -> pixel da tela. */
  private _hospitalParaTela(fx: number, fy: number): ScreenPoint {
    const { escala, ox, oy } = this._hospitalLayout()
    return { x: ox + fx * CENA_HOSPITAL.largura * escala, y: oy + fy * CENA_HOSPITAL.altura * escala }
  }

  get hospitalPlayerPos(): ScreenPoint {
    return this._hospitalParaTela(CENA_HOSPITAL.tapete.x, CENA_HOSPITAL.tapete.y)
  }

  /** Este ponto da tela esta sobre a enfermeira (ou sobre o rotulo "Curar")? */
  hospitalClickOnNurse(x: number, y: number): boolean {
    const { escala, ox, oy } = this._hospitalLayout()
    if (!(escala > 0)) return false
    const fx = (x - ox) / (CENA_HOSPITAL.largura * escala)
    const fy = (y - oy) / (CENA_HOSPITAL.altura * escala)
    const a = CENA_HOSPITAL.alvo
    return fx >= a.x1 && fx <= a.x2 && fy >= a.y1 && fy <= a.y2
  }

  renderHospital(playerEntity: WorldEntity | null, nurseHovered = false): void {
    const ctx = this.ctx
    this.clear()
    ctx.fillStyle = HOSPITAL_FALLBACK
    ctx.fillRect(0, 0, this.width, this.height)

    const { escala, ox, oy } = this._hospitalLayout()
    if (!(escala > 0)) return // canvas ainda sem tamanho (primeiro frame antes do resize)
    const fundo = readyImage(CENA_HOSPITAL.imagem)

    ctx.save()
    // Daqui pra baixo tudo e desenhado em COORDENADA DA IMAGEM (0..2000): e o
    // unico sistema em que os pontos medidos sobre a arte continuam valendo
    // quando a janela muda de tamanho.
    ctx.translate(ox, oy)
    ctx.scale(escala, escala)

    if (fundo) ctx.drawImage(fundo, 0, 0, CENA_HOSPITAL.largura, CENA_HOSPITAL.altura)
    if (playerEntity) this._drawHospitalPoke(ctx, playerEntity, escala)
    this._drawHealLabel(ctx, nurseHovered)

    ctx.restore()
  }

  private _drawHospitalPoke(ctx: CanvasRenderingContext2D, playerEntity: WorldEntity, escala: number): void {
    const pes = {
      x: CENA_HOSPITAL.tapete.x * CENA_HOSPITAL.largura,
      y: CENA_HOSPITAL.tapete.y * CENA_HOSPITAL.altura,
    }
    const k = escalaDoPoke(playerEntity.battleAnim?.frameHeight ?? 0)
    // Virado pra camera: `facing` fica com o que sobrou da ultima hunt, entao
    // sem isto o POKE aparece de costas no saguao. Row 0 do sheet PMD e Down —
    // ver SECTOR_TO_ROW em animationSystem.
    const display: WorldEntity = { ...playerEntity, x: pes.x, y: pes.y, facing: { x: 0, y: 1 } }

    ctx.save()
    ctx.translate(pes.x, pes.y)
    ctx.scale(k, k)
    ctx.translate(-pes.x, -pes.y)
    drawEntity(ctx, display)
    ctx.restore()

    // Barra de HP e nome NAO entram na escala do sprite: a 5x, a fonte de 9px
    // viraria 45px e o nome ficaria maior que a enfermeira.
    //
    // Tambem nao podem sair na escala da IMAGEM: numa janela quase quadrada o
    // cover fica em ~0.64, e o nome sairia com 6px de tela — ilegivel (visto ao
    // vivo). Entao eles sao desenhados numa escala que CANCELA a da imagem e
    // fixa o tamanho em pixel de tela, no mesmo tamanho aparente que tem dentro
    // da hunt (que desenha com zoom 1.5 por padrao).
    //
    // A ancora vertical usa `frameHeight * k` porque e exatamente isso que
    // `visualTopOffset` le pra decidir a que altura o rotulo fica — o sprite ja
    // esta ampliado, o rotulo tem que subir junto.
    const legivel = ESCALA_ROTULO_POKE / escala
    const anim = display.battleAnim
    // `k / legivel` e o que faz o rotulo pousar no topo do sprite APESAR de o
    // contexto estar em outra escala: `visualTopOffset` e linear no
    // frameHeight, entao dividir aqui cancela o `scale(legivel)` de baixo e
    // sobra exatamente o `k` do sprite.
    const ancora: WorldEntity = anim
      ? { ...display, battleAnim: { ...anim, frameHeight: (anim.frameHeight * k) / legivel } }
      : display
    ctx.save()
    ctx.translate(pes.x, pes.y)
    ctx.scale(legivel, legivel)
    ctx.translate(-pes.x, -pes.y)
    drawHpBar(ctx, ancora)
    drawNameLevelTag(ctx, ancora)
    ctx.restore()
  }

  // "Curar" acima da cabeca da enfermeira. E o unico aviso de que ela e
  // clicavel, entao vem numa pilula com contorno em vez de texto solto: o
  // balcao atras e cheio de detalhe e texto puro se perderia nele.
  private _drawHealLabel(ctx: CanvasRenderingContext2D, hovered: boolean): void {
    const x = CENA_HOSPITAL.rotulo.x * CENA_HOSPITAL.largura
    const y = CENA_HOSPITAL.rotulo.y * CENA_HOSPITAL.altura
    const texto = 'Curar'

    ctx.save()
    ctx.font = 'bold 26px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const w = ctx.measureText(texto).width + 34
    const h = 44

    if (hovered) {
      ctx.shadowColor = 'rgba(255, 214, 120, 0.9)'
      ctx.shadowBlur = 22
    }
    roundedRect(ctx, x - w / 2, y - h / 2, w, h, h / 2)
    ctx.fillStyle = hovered ? 'rgba(24, 18, 10, 0.94)' : 'rgba(12, 12, 16, 0.86)'
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = 3
    ctx.strokeStyle = hovered ? '#ffd678' : '#c9a24a'
    ctx.stroke()

    ctx.fillStyle = hovered ? '#fff3d4' : '#ffe9a8'
    ctx.fillText(texto, x, y + 1)
    ctx.restore()
  }

  renderMap(mapDef: MapDef, world: WorldState): void {
    const ctx = this.ctx
    this.clear()

    const camera = this._computeCamera(mapDef, world.player)
    ctx.save()
    ctx.scale(this.zoom, this.zoom)
    ctx.translate(-camera.x, -camera.y)

    drawMapBackground(
      ctx,
      { bg: backgroundParaSala(mapDef, world.sala), bounds: mapDef.bounds },
      { x: camera.x, y: camera.y, w: this.width / this.zoom, h: this.height / this.zoom },
    )

    for (const enemy of world.enemies) {
      drawEntity(ctx, enemy)
      if (enemy.poke.hp > 0) {
        drawHpBar(ctx, enemy)
        drawNameLevelTag(ctx, enemy)
      }
    }

    if (world.player && !world.player.fainted) {
      drawEntity(ctx, world.player)
      drawHpBar(ctx, world.player)
      drawNameLevelTag(ctx, world.player)
    }

    for (const effect of world.effects) {
      drawEffect(ctx, effect, world)
    }

    ctx.restore()
  }

  private _computeCamera(mapDef: MapDef, player: WorldEntity | null): ScreenPoint {
    const px = player ? player.x : mapDef.bounds.width / 2
    const py = player ? player.y : mapDef.bounds.height / 2
    return { x: px - this.width / 2 / this.zoom, y: py - (this.height * PLAYER_ANCHOR_Y) / this.zoom }
  }
}
