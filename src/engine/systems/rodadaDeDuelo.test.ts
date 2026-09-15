// PH-544: um por vez, 3 s entre acoes, ordem por Velocidade recalculada a cada
// round. Unidade aqui com entidades minimas; a luta real esta em arena.test.ts.
import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { executarRodadaDeDuelo, tickRodadaDeDuelo, INTERVALO_DO_TURNO } from './rodadaDeDuelo'
import type { EnemyEntity, PlayerEntity, WorldEntity, WorldState } from '../types'

function entidade(id: string, hp = 100): WorldEntity {
  return { id, globalCooldown: 0, fainted: false, poke: { hp, stats: { hp: 100 } } } as unknown as WorldEntity
}

function mundo(): WorldState {
  return { rng: createRng(1), rodadaDeDuelo: null, trickRoomRestante: 0 } as unknown as WorldState
}

/** Executor que "age": arma o cooldown global como os reais fazem. */
function executores(log: string[]) {
  return {
    jogador: (p: WorldEntity) => () => { if (p.globalCooldown > 0) return; p.globalCooldown = INTERVALO_DO_TURNO; log.push(p.id) },
    inimigo: () => (e: EnemyEntity) => { if (e.globalCooldown > 0) return; e.globalCooldown = INTERVALO_DO_TURNO; log.push(e.id) },
  }
}

function roda(world: WorldState, player: PlayerEntity, rival: EnemyEntity, vel: Record<string, number>, log: string[], ticks: number, dt = 1 / 60) {
  const ex = executores(log)
  for (let i = 0; i < ticks; i++) {
    for (const e of [player, rival]) { e.globalCooldown = Math.max(0, e.globalCooldown - dt); if (e.globalCooldown < 1e-6) e.globalCooldown = 0 }
    tickRodadaDeDuelo(world, dt)
    executarRodadaDeDuelo(world, player, [rival], (e) => vel[e.id], { jogador: ex.jogador(player), inimigo: ex.inimigo() })
  }
}

describe('rodada de duelo (PH-544)', () => {
  it('o mais rapido age primeiro, o outro 3 s depois, e o round fecha apos os dois', () => {
    const world = mundo()
    const p = entidade('p') as PlayerEntity
    const r = entidade('r') as EnemyEntity
    const log: string[] = []
    roda(world, p, r, { p: 50, r: 120 }, log, 1)
    expect(log).toEqual(['r'])
    roda(world, p, r, { p: 50, r: 120 }, log, 179)
    expect(log).toEqual(['r']) // ainda dentro dos 3 s
    roda(world, p, r, { p: 50, r: 120 }, log, 1)
    expect(log).toEqual(['r', 'p'])
    expect(world.rodadaDeDuelo!.numero).toBe(1)
    roda(world, p, r, { p: 50, r: 120 }, log, 180)
    expect(log).toEqual(['r', 'p', 'r'])
    expect(world.rodadaDeDuelo!.numero).toBe(2)
  })

  it('a ordem e recalculada a cada round: Velocidade que mudou inverte quem vai primeiro', () => {
    const world = mundo()
    const p = entidade('p') as PlayerEntity
    const r = entidade('r') as EnemyEntity
    const log: string[] = []
    const vel = { p: 50, r: 120 }
    roda(world, p, r, vel, log, 181)
    expect(log).toEqual(['r', 'p'])
    vel.p = 200 // Danca das Espadas... de Velocidade: agora o jogador e o rapido
    roda(world, p, r, vel, log, 180)
    expect(log).toEqual(['r', 'p', 'p'])
  })

  it('Trick Room inverte: o mais lento vai primeiro', () => {
    const world = mundo()
    world.trickRoomRestante = 30
    const p = entidade('p') as PlayerEntity
    const r = entidade('r') as EnemyEntity
    const log: string[] = []
    roda(world, p, r, { p: 50, r: 120 }, log, 1)
    expect(log).toEqual(['p'])
  })

  it('empate de Velocidade sorteia por world.rng (mesma semente, mesmo vencedor)', () => {
    const primeiro = (seed: number) => {
      const world = { ...mundo(), rng: createRng(seed) } as WorldState
      const p = entidade('p') as PlayerEntity
      const r = entidade('r') as EnemyEntity
      const log: string[] = []
      roda(world, p, r, { p: 100, r: 100 }, log, 1)
      return log[0]
    }
    expect(primeiro(7)).toBe(primeiro(7))
    const vistos = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(primeiro))
    expect(vistos.size).toBe(2) // os dois lados ganham empates
  })

  it('um lado caido descarta o round; substituto abre round novo com a ordem de agora', () => {
    const world = mundo()
    const p = entidade('p') as PlayerEntity
    const r = entidade('r') as EnemyEntity
    const log: string[] = []
    roda(world, p, r, { p: 50, r: 120 }, log, 1)
    expect(log).toEqual(['r'])
    r.poke.hp = 0
    roda(world, p, r, { p: 50, r: 120 }, log, 200)
    expect(world.rodadaDeDuelo).toBeNull()
    expect(log).toEqual(['r'])
    const r2 = entidade('r2') as EnemyEntity
    roda(world, p, r2, { p: 50, r2: 10 }, log, 1)
    expect(log).toEqual(['r', 'p'])
    expect(world.rodadaDeDuelo!.ordem).toEqual(['p', 'r2'])
  })

  it('quem nao consegue agir (cooldown ainda contando) segura a vez, nao a perde', () => {
    const world = mundo()
    const p = entidade('p') as PlayerEntity
    const r = entidade('r') as EnemyEntity
    r.globalCooldown = 1 // acabou de agir por outro caminho
    const log: string[] = []
    roda(world, p, r, { p: 50, r: 120 }, log, 30)
    expect(log).toEqual([])
    expect(world.rodadaDeDuelo!.indice).toBe(0)
    roda(world, p, r, { p: 50, r: 120 }, log, 31)
    expect(log).toEqual(['r'])
  })
})
