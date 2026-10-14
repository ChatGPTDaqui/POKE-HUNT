import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Renderer } from './renderer'
import { CENA_HOSPITAL, ZOOM_DA_CENA } from '@/data/hospital'
import { quadroDaSkin, SKINS_DO_TREINADOR } from '@/data/skinsDoTreinador'
import { createPokeInstance } from '@/data/pokes'
import { createRng } from '@/core/rng'
import { buildHospitalWorld } from '@/engine/simulation'
import { drawEntity, drawHpBar, drawNameLevelTag } from './sprites'

vi.mock('./sprites', async importOriginal => ({
  ...await importOriginal<typeof import('./sprites')>(),
  readyImage: () => null,
  drawEntity: vi.fn(), drawHpBar: vi.fn(), drawNameLevelTag: vi.fn(),
}))

function cena(width: number, height: number) {
  const ctx = {
    clearRect: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(), beginPath: vi.fn(),
    ellipse: vi.fn(), fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), arcTo: vi.fn(),
    closePath: vi.fn(), strokeText: vi.fn(), fillText: vi.fn(),
    measureText: () => ({ width: 40 }), imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  }
  const renderer = new Renderer({ width, height, getContext: () => ctx } as unknown as HTMLCanvasElement)
  return { renderer, ctx }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('Image', class { complete = true; naturalWidth = 1000; src = '' })
})
afterEach(() => vi.unstubAllGlobals())

describe('treinador no Hospital', () => {
  it.each([[390, 844], [844, 390], [1366, 768]])('substitui só o desenho do Pokémon e preserva cura em %ix%i', (width, height) => {
    const { renderer, ctx } = cena(width, height)
    const player = buildHospitalWorld(createPokeInstance(createRng(1), 'squirtle', 10), { x: 10, y: 20 }).player!
    Object.freeze(player)
    renderer.treinador.nome = 'Vinny'
    renderer.renderHospital(player, true)
    expect([player.x, player.y]).toEqual([10, 20])
    expect(drawEntity).not.toHaveBeenCalled()
    expect(drawHpBar).not.toHaveBeenCalled()
    expect(drawNameLevelTag).not.toHaveBeenCalled()
    expect(ctx.drawImage).toHaveBeenCalledOnce()
    expect(ctx.fillText.mock.calls.map(c => c[0])).toEqual(['Vinny', 'Curar'])
    const escala = Math.max(width / CENA_HOSPITAL.largura, height / CENA_HOSPITAL.altura) * ZOOM_DA_CENA
    expect(ctx.scale).toHaveBeenCalledWith(1.5 / escala, 1.5 / escala)
    const x = (width - CENA_HOSPITAL.largura * escala) / 2 + CENA_HOSPITAL.enfermeira.x * CENA_HOSPITAL.largura * escala
    const y = (height - CENA_HOSPITAL.altura * escala) / 2 + CENA_HOSPITAL.enfermeira.y * CENA_HOSPITAL.altura * escala
    expect(renderer.hospitalClickOnNurse(x, y)).toBe(true)
    expect(renderer.hospitalClickOnNurse(0, 0)).toBe(false)
  })

  it.each(SKINS_DO_TREINADOR)('usa a skin $id nativa, olhando para frente, mesmo sem Pokémon', skin => {
    const { renderer, ctx } = cena(390, 844)
    renderer.treinador.skin = skin.id
    renderer.renderHospital(null)
    const args = ctx.drawImage.mock.calls[0]
    expect(args[0].src).toContain(`/${skin.id}/Idle-Anim.png`)
    expect(args[2]).toBe(0) // linha Down, nunca herda costas da hunt
    const g = quadroDaSkin(skin.id)
    expect(args.slice(3, 5)).toEqual([g.frameWidth, g.frameHeight])
    expect(args[8]).toBeCloseTo(g.frameHeight * CENA_HOSPITAL.alturaTreinador / g.bodyHeight)
    const pe = renderer.treinador.pe!
    expect(pe).toEqual({ x: CENA_HOSPITAL.tapete.x * CENA_HOSPITAL.largura, y: CENA_HOSPITAL.tapete.y * CENA_HOSPITAL.altura })
    expect(pe.y - CENA_HOSPITAL.alturaTreinador).toBeGreaterThan(CENA_HOSPITAL.alvo.y2 * CENA_HOSPITAL.altura)
    expect(renderer.treinador.animacao).toBe('Idle')
    // A volta à hunt reposiciona o seguidor, sem interpolar desde o tapete.
    renderer.treinador.atualizar({ x: 200, y: 200, radius: 12 }, 0)
    expect(Math.hypot(renderer.treinador.pe!.x - 200, renderer.treinador.pe!.y - 200)).toBeLessThan(100)
  })
})
