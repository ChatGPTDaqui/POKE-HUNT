// PH-228: boss (EnemyEntity.isBoss) tinha ZERO pista visual distinta de mob
// comum — motor correto (spawn normal suspenso), so faltava a apresentacao.
// `LEGENDARY_SPECIES_IDS` (Modo Pesadelo) ja tinha barra de HP grande; este
// arquivo tranca que o boss por sala/andar (isBoss) ganha o MESMO tratamento
// mais 3 sinais novos: sprite maior, tag "BOSS" no nome, aura pulsante.
import { describe, expect, it } from 'vitest'

import { drawEntity, drawHpBar, drawNameLevelTag } from './sprites'
import type { WorldEntity } from '@/engine/types'

function ctxEspiao() {
  const escritas: string[] = []
  const retangulos: { x: number; w: number }[] = []
  let auraDesenhada = false
  let ultimoMoveTo: { x: number } | null = null
  const alvo = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '', textAlign: '', globalAlpha: 1,
    save() {}, restore() {},
    fillText(texto: string) { escritas.push(texto) },
    strokeText() {},
    beginPath() {}, closePath() {}, stroke() {}, fill() {}, arc() {},
    moveTo(x: number) { ultimoMoveTo = { x } },
    arcTo(x: number) {
      if (ultimoMoveTo) {
        retangulos.push({ x: ultimoMoveTo.x, w: x - ultimoMoveTo.x })
        ultimoMoveTo = null // so a PRIMEIRA arcTo de cada roundedRectPath fecha o par
      }
    },
    ellipse() {},
    createRadialGradient() {
      auraDesenhada = true
      return { addColorStop() {} } as unknown as CanvasGradient
    },
  }
  return { ctx: alvo as unknown as CanvasRenderingContext2D, escritas, retangulos, auraDesenhada: () => auraDesenhada }
}

function entidade(isBoss: boolean): WorldEntity {
  return {
    id: 'e1', x: 100, y: 100, radius: 16, battleAnim: null, facing: 'down',
    isBoss,
    poke: { speciesId: 'charizard', level: 30, isShiny: false, hp: 50, stats: { hp: 100 }, ivs: {} },
  } as unknown as WorldEntity
}

describe('tag "BOSS" no nome (PH-228)', () => {
  it('boss ganha a tag, mob comum nao', () => {
    const { ctx, escritas } = ctxEspiao()
    drawNameLevelTag(ctx, entidade(true))
    expect(escritas.some((t) => t.includes('BOSS'))).toBe(true)

    const semBoss = ctxEspiao()
    drawNameLevelTag(semBoss.ctx, entidade(false))
    expect(semBoss.escritas.some((t) => t.includes('BOSS'))).toBe(false)
  })
})

describe('barra de HP maior pro boss (PH-228)', () => {
  it('largura da barra do boss e maior que a do mob comum', () => {
    const doBoss = ctxEspiao()
    drawHpBar(doBoss.ctx, entidade(true))
    const doMob = ctxEspiao()
    drawHpBar(doMob.ctx, entidade(false))

    expect(doBoss.retangulos[0].w).toBeGreaterThan(doMob.retangulos[0].w)
  })
})

describe('aura pulsante de boss (PH-228)', () => {
  it('boss desenha aura, mob comum nao', () => {
    const doBoss = ctxEspiao()
    drawEntity(doBoss.ctx, entidade(true))
    expect(doBoss.auraDesenhada()).toBe(true)

    const doMob = ctxEspiao()
    drawEntity(doMob.ctx, entidade(false))
    expect(doMob.auraDesenhada()).toBe(false)
  })
})
