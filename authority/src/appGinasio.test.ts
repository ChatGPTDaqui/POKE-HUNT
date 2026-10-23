// Ginasios (23/10/2026): a luta do desafio e deterministica pela semente, e o
// que o servidor decide e o mesmo que o cliente reproduz na arena.
import { describe, expect, it } from 'vitest'
import { equipeNpc, FAIXAS_DE_GINASIO, equipeDoGinasio } from '@/data/ginasios'
import { criarMundoArena, sementeDaSessao, stepArena } from '@/engine/arena'
import { LIVE_SIM_STEP_SECONDS } from '@/engine/simulation'
import { lutaDoDesafio, tetoDoGinasio } from './appGinasio.js'

const faixa = FAIXAS_DE_GINASIO[0]
const desafio = {
  id: '11111111-2222-4333-8444-555555555555',
  ginasio_id: 'FIRE_100',
  equipe_desafiante: equipeNpc('WATER', faixa),
  equipe_lider: equipeNpc('FIRE', faixa),
}

describe('luta do desafio de ginasio', () => {
  it('teto pela faixa do id', () => {
    expect(tetoDoGinasio('FIRE_300')).toBe(300)
    expect(() => tetoDoGinasio('FIRE_150')).toThrow()
  })

  it('e deterministica e termina', () => {
    const a = lutaDoDesafio(desafio)
    const b = lutaDoDesafio(desafio)
    expect(a).toEqual(b)
    expect(['vitoria', 'derrota', 'empate']).toContain(a.resultado)
    expect(a.ticks).toBeGreaterThan(0)
  })

  it('o cliente, rodando a arena com a mesma semente e equipes, chega no mesmo resultado', () => {
    const servidor = lutaDoDesafio(desafio)
    const world = criarMundoArena({
      semente: sementeDaSessao(desafio.id),
      meuTime: equipeDoGinasio(desafio.equipe_desafiante, 100, `d-${desafio.id}`),
      rivalTime: equipeDoGinasio(desafio.equipe_lider, 100, `l-${desafio.id}`),
      nomeDoRival: 'Líder FIRE',
      casaEhOJogador: false,
    })
    while (world.arena!.resultado === 'lutando') stepArena(world, LIVE_SIM_STEP_SECONDS, { silent: true })
    expect(world.arena!.resultado).toBe(servidor.resultado)
    expect(world.arena!.ticks).toBe(servidor.ticks)
  })
})
