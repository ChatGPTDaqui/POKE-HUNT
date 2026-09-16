// PH-552: o balao "Vai X!!" da abertura — quando aparece e quando nao.
import { describe, expect, it, vi } from 'vitest'

import type { WorldEntity, WorldState } from '@/engine/types'
import { drawBalaoDaAbertura, entidadeDoBalao, textoDoBalao } from './balaoDaAbertura'

function entidade(id: string, kind: 'player' | 'enemy', speciesId = 'charmander'): WorldEntity {
  return { id, kind, x: 100, y: 200, poke: { speciesId, isShiny: false } } as unknown as WorldEntity
}

function mundo(
  etapa: { tipo: 'bola' | 'ameaca' | 'habilidade'; entidadeId: string } | null,
  extra: Partial<WorldState> = {},
): WorldState {
  return {
    player: entidade('p', 'player', 'entei'),
    enemies: [entidade('e', 'enemy', 'articuno')],
    aberturaDoDuelo: etapa ? { fila: [{ lado: 'casa', ...etapa }], indice: 0, restante: 1, etapaIniciada: true } : null,
    arena: null,
    mapDef: { encarada: true },
    ...extra,
  } as unknown as WorldState
}

describe('balao da abertura (PH-552)', () => {
  it('o jogador grita "Vai <POKE>!!" na etapa bola', () => {
    const w = mundo({ tipo: 'bola', entidadeId: 'p' })
    expect(entidadeDoBalao(w)?.id).toBe('p')
    expect(textoDoBalao(w.player!)).toBe('Vai Entei!!')
  })

  it('so na bola: pose e habilidade nao tem balao', () => {
    expect(entidadeDoBalao(mundo({ tipo: 'ameaca', entidadeId: 'p' }))).toBeNull()
    expect(entidadeDoBalao(mundo({ tipo: 'habilidade', entidadeId: 'p' }))).toBeNull()
    expect(entidadeDoBalao(mundo(null))).toBeNull()
  })

  it('covil: o lendario sai da bola sem ninguem gritar (nao ha treinador)', () => {
    expect(entidadeDoBalao(mundo({ tipo: 'bola', entidadeId: 'e' }))).toBeNull()
  })

  it('arena e Lance: o rival tem treinador, entao o balao aparece do lado dele', () => {
    expect(entidadeDoBalao(mundo({ tipo: 'bola', entidadeId: 'e' }, { arena: {} as WorldState['arena'] }))?.id).toBe('e')
    expect(entidadeDoBalao(mundo({ tipo: 'bola', entidadeId: 'e' }, { mapDef: { encarada: true, sequence: ['x'] } as unknown as WorldState['mapDef'] }))?.id).toBe('e')
  })

  it('desenha o texto acima do ponto da bola', () => {
    const chamadas: Array<[string, number, number]> = []
    const ctx = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), arcTo: vi.fn(),
      closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
      measureText: (t: string) => ({ width: t.length * 6 }),
      fillText: (t: string, x: number, y: number) => { chamadas.push([t, x, y]) },
    } as unknown as CanvasRenderingContext2D
    drawBalaoDaAbertura(ctx, mundo({ tipo: 'bola', entidadeId: 'p' }))
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0][0]).toBe('Vai Entei!!')
    expect(chamadas[0][1]).toBe(100)
    expect(chamadas[0][2]).toBeLessThan(200 - 60)
  })
})
