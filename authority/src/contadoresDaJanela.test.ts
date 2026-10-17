// Contadores de conquista que uma janela de hunt produz
// (spec 2026-10-14-conquistas-design). Tudo vem da simulacao autoritativa.
import { describe, expect, it } from 'vitest'
import { contadoresDaJanela } from './progresso.js'

const vazio = { captures: [], autoVendidos: 0, gold: 0, simulatedSeconds: 0, itemsConsumed: {} }

describe('contadoresDaJanela', () => {
  it('janela sem nada nao gera contador', () => {
    expect(contadoresDaJanela(vazio, null, null)).toEqual({})
  })

  it('captura conta no total (inclusive a auto-vendida) e por especie', () => {
    const c = contadoresDaJanela({
      ...vazio,
      captures: [
        { speciesId: 'pidgey', level: 3, isShiny: false, rarity: 'comum' },
        { speciesId: 'pidgey', level: 4, isShiny: false, rarity: 'comum' },
        { speciesId: 'rattata', level: 2, isShiny: false, rarity: 'comum' },
      ],
      autoVendidos: 2,
    }, null, null)
    expect(c.captura_total).toBe(5)
    expect(c['captura:pidgey']).toBe(2)
    expect(c['captura:rattata']).toBe(1)
  })

  it('tempo vai pro total, pra especie em campo e pro clima da sala', () => {
    const c = contadoresDaJanela({ ...vazio, simulatedSeconds: 30.7 }, 'pikachu', 'neve')
    expect(c.hunt_seg).toBe(30)
    expect(c['ativo_seg:pikachu']).toBe(30)
    expect(c['clima_seg:neve']).toBe(30)
    // Especialidade como missao: o tempo conta pro TIPO do POKE em campo.
    expect(c['ativo_tipo_seg:ELECTRIC']).toBe(30)
  })

  it('POKE de dois tipos anda as missoes dos dois', () => {
    const c = contadoresDaJanela({ ...vazio, simulatedSeconds: 60 }, 'gyarados', null)
    expect(c['ativo_tipo_seg:WATER']).toBe(60)
    expect(c['ativo_tipo_seg:FLYING']).toBe(60)
  })

  it('ouro da caca e itens consumidos', () => {
    const c = contadoresDaJanela({ ...vazio, gold: 1234.9, itemsConsumed: { potion: 3, poke_ball: 7 } }, null, null)
    expect(c.ouro_caca).toBe(1234)
    expect(c['item:potion']).toBe(3)
    expect(c['item:poke_ball']).toBe(7)
  })

  it('nunca manda valor zero ou negativo (o SQL so soma, contador nao desce)', () => {
    const c = contadoresDaJanela({ ...vazio, gold: 0.4, itemsConsumed: { potion: 0 } }, null, null)
    expect(c).toEqual({})
  })
})
