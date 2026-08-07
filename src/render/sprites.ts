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
import { effectProgress } from '@/engine/effect'
import { SPECIES } from '@/data/pokes'
import { scaleForSpecies } from '@/data/pokeHeights'
import { footOffsetFraction } from '@/data/spriteFootOffsets'
import { hpBarFillColor } from '@/data/hpBar'
import { AURA_COLORS } from '@/data/auraColors'
import { LEGENDARY_SPECIES_IDS } from '@/data/legendaries'
import { impactShapeForType, type ImpactShape } from '@/data/impactShapes'
import { CAPTURE_ANIM_URL, CAPTURE_ANIM_FRAME_DURATION, captureAnimFrameRect } from '@/data/captureAnim'
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
  return true
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
  if (!drewSprite) drawPlaceholderShape(ctx, entity)
}

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

function drawImpactBurst(ctx: CanvasRenderingContext2D, effect: WorldEffect): void {
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

function drawAbilityEffect(ctx: CanvasRenderingContext2D, effect: WorldEffect): void {
  if (effect.isAoe) drawAoeRing(ctx, effect)
  else drawImpactBurst(ctx, effect)
}

const CAPTURE_ANIM_DRAW_SIZE = 40

function drawCaptureAnim(ctx: CanvasRenderingContext2D, effect: WorldEffect): void {
  if (effect.age < effect.delay) return
  const img = getOrLoadImage(CAPTURE_ANIM_URL)
  if (!img.complete || img.naturalWidth === 0) return
  const frameIndex = Math.floor((effect.age - effect.delay) / CAPTURE_ANIM_FRAME_DURATION)
  const frame = captureAnimFrameRect(effect.ballItemId!, Boolean(effect.success), frameIndex)
  if (!frame) return

  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    img, frame.sx, frame.sy, frame.sw, frame.sh,
    effect.targetX! - CAPTURE_ANIM_DRAW_SIZE / 2, effect.targetY! - CAPTURE_ANIM_DRAW_SIZE / 2,
    CAPTURE_ANIM_DRAW_SIZE, CAPTURE_ANIM_DRAW_SIZE,
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

export function drawNpcMarker(ctx: CanvasRenderingContext2D, x: number, y: number, label?: string, color = '#eae2b7'): void {
  ctx.save()
  ctx.fillStyle = color
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 2
  ctx.fillRect(x - 16, y - 16, 32, 32)
  ctx.strokeRect(x - 16, y - 16, 32, 32)
  ctx.fillStyle = '#d62828'
  ctx.fillRect(x - 3, y - 10, 6, 20)
  ctx.fillRect(x - 10, y - 3, 20, 6)
  if (label) {
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#000000'
    ctx.strokeText(label, x, y + 32)
    ctx.fillStyle = '#f1f1f6'
    ctx.fillText(label, x, y + 32)
  }
  ctx.restore()
}

const HUNT_BG_TILE_SCALE = 0.8

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

    const iw = img.naturalWidth * HUNT_BG_TILE_SCALE
    const ih = img.naturalHeight * HUNT_BG_TILE_SCALE
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
