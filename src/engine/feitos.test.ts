// Feitos de Especialidade (23/10/2026): a simulacao conta, o molde pede.
import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { MISSOES_DE_ESPECIALIDADE, FEITOS_POR_NIVEL } from '@/data/especialidadeMissoes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { buildMapWorld, stepWorld, LIVE_SIM_STEP_SECONDS } from './simulation'
import { contarParaOsTipos, temVantagemDeTipo } from './feitos'

const PREFIXOS = ['abate_tipo', 'supereficaz_tipo', 'protetor_tipo', 'resistido_tipo', 'critico_tipo',
  'vantagem_tipo', 'captura_tipo', 'evolucao_tipo', 'estagio_equipe']

describe('feitos contados pela simulacao', () => {
  it('caçar com um POKE de Agua no Igneo conta abates e super-efetivos de Agua', () => {
    useGameStateStore.getState().resetToDefaults()
    const poke = createPokeInstance(createRng(5), 'squirtle', 30)
    useGameStateStore.setState({ team: [poke], activeIndex: 0, items: { potion: 999 } } as never)
    const world = buildMapWorld('igneo_e2', poke, { seed: 0, rng: createRng(9), counters: { entity: 1, effect: 1, pendingHit: 1 } })
    for (let t = 0; t < 240; t += LIVE_SIM_STEP_SECONDS) stepWorld(world, LIVE_SIM_STEP_SECONDS, useGameStateStore.getState(), { silent: true })
    expect(world.feitos?.['abate_tipo:WATER'] ?? 0).toBeGreaterThan(0)
    expect(world.feitos?.['supereficaz_tipo:WATER'] ?? 0).toBeGreaterThan(0)
    expect(world.feitos?.['abate_tipo:FIRE']).toBeUndefined()
  })

  it('POKE de dois tipos conta pros dois', () => {
    const w: { feitos?: Record<string, number> } = {}
    contarParaOsTipos(w, 'abate_tipo', 'geodude')
    expect(w.feitos).toEqual({ 'abate_tipo:ROCK': 1, 'abate_tipo:GROUND': 1 })
  })

  it('vantagem de tipo', () => {
    expect(temVantagemDeTipo('oddish', 'squirtle')).toBe(true)
    expect(temVantagemDeTipo('charmander', 'squirtle')).toBe(false)
  })
})

describe('molde das missoes de Especialidade', () => {
  it('360 missoes, de 1 a 3 feitos, 1 no nivel 1, todas com contadores conhecidos', () => {
    expect(MISSOES_DE_ESPECIALIDADE).toHaveLength(360)
    for (const m of MISSOES_DE_ESPECIALIDADE) {
      expect(m.requisitos.length).toBeGreaterThanOrEqual(1)
      expect(m.requisitos.length).toBeLessThanOrEqual(FEITOS_POR_NIVEL(m.nivel - 1))
      if (m.nivel === 1) expect(m.requisitos).toHaveLength(1)
      for (const r of m.requisitos) {
        if (r.regra.t === 'contador') {
          const [prefixo, tipo] = r.regra.chave.split(':')
          expect(PREFIXOS).toContain(prefixo)
          expect(tipo).toBe(m.tipo)
          expect(r.regra.alvo).toBeGreaterThan(0)
        }
      }
    }
  })

  it('Dano comeca por abates com o tipo; Defesa por golpes resistidos', () => {
    const fogo = MISSOES_DE_ESPECIALIDADE.filter((m) => m.tipo === 'FIRE')
    expect(fogo.find((m) => m.trilha === 'dano' && m.nivel === 1)!.requisitos[0].regra).toMatchObject({ chave: 'abate_tipo:FIRE' })
    expect(fogo.find((m) => m.trilha === 'defesa' && m.nivel === 1)!.requisitos[0].regra).toMatchObject({ chave: 'resistido_tipo:FIRE' })
  })
})
