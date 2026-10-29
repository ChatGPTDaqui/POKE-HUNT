// Movimento do treinador sem pixel novo (29/10/2026): respiracao parado,
// balanco do passo e arremesso da Pokebola.
import { describe, expect, it } from 'vitest'
import { DURACAO_DO_ARREMESSO, TreinadorEmCampo, poseDoTreinador } from './treinadorEmCampo'

describe('pose do treinador', () => {
  it('parado respira: o corpo estica e encolhe pouco, sem sair do chao nem girar', () => {
    const alturas = Array.from({ length: 28 }, (_, i) => poseDoTreinador('Idle', i * 0.1, 0, null))
    const sy = alturas.map((p) => p.sy)
    expect(Math.max(...sy)).toBeGreaterThan(1.01)
    expect(Math.min(...sy)).toBeLessThan(0.99)
    expect(Math.max(...sy) - Math.min(...sy)).toBeLessThan(0.05)
    for (const p of alturas) { expect(p.giro).toBe(0); expect(p.sobe).toBe(0) }
  })

  it('andando: no chao no passo aberto, no alto com as pernas cruzadas', () => {
    expect(poseDoTreinador('Walk', 0, 0, null).sobe).toBeCloseTo(0)
    expect(poseDoTreinador('Walk', 0, 0.5, null).sobe).toBeCloseTo(0)
    expect(poseDoTreinador('Walk', 0, 0.25, null).sobe).toBeGreaterThan(0.015)
    expect(poseDoTreinador('Walk', 0, 0.75, null).sobe).toBeGreaterThan(0.015)
  })

  it('arremesso: recua pro lado contrario ao alvo, joga pra frente e volta a pose normal', () => {
    const recuo = poseDoTreinador('Idle', 0, 0, { t: 0.2, lado: 1 })
    const solta = poseDoTreinador('Idle', 0, 0, { t: 0.33, lado: 1 })
    const fim = poseDoTreinador('Idle', 0, 0, { t: DURACAO_DO_ARREMESSO, lado: 1 })
    expect(recuo.giro).toBeLessThan(-0.1)
    expect(solta.giro).toBeGreaterThan(0.1)
    expect(Math.abs(fim.giro)).toBeLessThan(0.001)
    expect(fim.sy).toBeCloseTo(1)
    // Alvo a esquerda espelha o gesto.
    expect(poseDoTreinador('Idle', 0, 0, { t: 0.2, lado: -1 }).giro).toBeGreaterThan(0.1)
  })

  it('o gesto termina sozinho e vira o treinador pro alvo', () => {
    const t = new TreinadorEmCampo()
    const poke = { x: 100, y: 100, radius: 10, facing: { x: 0, y: -1 } }
    t.atualizar(poke, 1 / 60)
    t.arremessar({ x: 160, y: 60 }, null)
    expect(t.arremessando).toBe(true)
    for (let i = 0; i < Math.ceil(DURACAO_DO_ARREMESSO * 60) + 2; i++) t.atualizar(poke, 1 / 60)
    expect(t.arremessando).toBe(false)
  })
})
