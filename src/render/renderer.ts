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
import { drawEntity, drawHpBar, drawNameLevelTag, drawEffect, drawMapBackground, drawNpcMarker } from './sprites'
import type { WorldEntity, WorldState } from '@/engine/types'
import type { MapDef } from '@/data/maps'
import type { MapBackground } from '@/data/generated/types'

const HOSPITAL_BG: MapBackground = { primary: '#2b2f45', secondary: '#333a5c', image: null }

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

  // O POKE fica no centro EXATO da tela (pedido explicito: ele estava baixo
  // demais, quase encostando no rodape da HUD em telas curtas). A enfermeira
  // sobe junto pra manter a mesma distancia visual entre os dois; deixa-la em
  // 0.35 colaria as duas figuras.
  private _hospitalBaseNursePos(): ScreenPoint {
    return { x: this.width / 2, y: this.height * 0.24 }
  }

  private _hospitalBasePlayerPos(): ScreenPoint {
    return { x: this.width / 2, y: this.height * 0.5 }
  }

  private _applyHospitalZoom({ x, y }: ScreenPoint): ScreenPoint {
    const cx = this.width / 2
    const cy = this.height / 2
    return { x: cx + (x - cx) * this.zoom, y: cy + (y - cy) * this.zoom }
  }

  get hospitalNursePos(): ScreenPoint {
    return this._applyHospitalZoom(this._hospitalBaseNursePos())
  }

  get hospitalPlayerPos(): ScreenPoint {
    return this._applyHospitalZoom(this._hospitalBasePlayerPos())
  }

  renderHospital(playerEntity: WorldEntity | null): void {
    const ctx = this.ctx
    this.clear()
    const hospitalMap = { bounds: { width: this.width, height: this.height }, bg: HOSPITAL_BG }
    const cx = this.width / 2
    const cy = this.height / 2

    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(this.zoom, this.zoom)
    ctx.translate(-cx, -cy)

    const viewportW = this.width / this.zoom
    const viewportH = this.height / this.zoom
    drawMapBackground(ctx, hospitalMap, { x: cx - viewportW / 2, y: cy - viewportH / 2, w: viewportW, h: viewportH })

    const nursePos = this._hospitalBaseNursePos()
    drawNpcMarker(ctx, nursePos.x, nursePos.y, 'Enfermeira')
    if (playerEntity) {
      const playerPos = this._hospitalBasePlayerPos()
      const displayEntity: WorldEntity = { ...playerEntity, x: playerPos.x, y: playerPos.y }
      drawEntity(ctx, displayEntity)
      drawHpBar(ctx, displayEntity)
      drawNameLevelTag(ctx, displayEntity)
    }
    ctx.restore()
  }

  renderMap(mapDef: MapDef, world: WorldState): void {
    const ctx = this.ctx
    this.clear()

    const camera = this._computeCamera(mapDef, world.player)
    ctx.save()
    ctx.scale(this.zoom, this.zoom)
    ctx.translate(-camera.x, -camera.y)

    drawMapBackground(ctx, mapDef, { x: camera.x, y: camera.y, w: this.width / this.zoom, h: this.height / this.zoom })

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
