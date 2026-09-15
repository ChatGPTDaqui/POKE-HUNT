// PH-540: a arena e o contrato entre servidor e cliente — mesma semente e
// mesmos times têm que dar o MESMO duelo, tick a tick, com ou sem VFX.
import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance, type PokeInstance } from '@/data/pokes'
import { criarMundoArena, rodarArena, stepArena, ARENA_MAP_ID } from './arena'
import { mapDefParaSala, spawnInimigoParaSala, spawnPointParaSala } from '@/data/maps'
import { LANCE_MAP_ID } from '@/data/nightmareMaps'
import { isDead } from './entity'
import { LIVE_SIM_STEP_SECONDS, stepWorld } from './simulation'
import type { WorldState } from './types'

const IV_FULL = { hp: 31, atkFis: 31, atkEsp: 31, def: 31, defEsp: 31, speed: 31 }

function time(seed: number, especies: string[], nivel = 80): PokeInstance[] {
  const rng = createRng(seed)
  return especies.map((id) => createPokeInstance(rng, id, nivel, { ivs: { ...IV_FULL }, rarity: 'legendary' }))
}

const TIME_A = ['dragonite', 'tyranitar', 'gengar']
const TIME_B = ['metagross', 'salamence', 'machamp']

function assinatura(world: WorldState): string {
  const a = world.arena!
  return [
    a.resultado, a.ticks, a.indiceMeu, a.indiceRival,
    world.player!.poke.hp, world.player!.x.toFixed(3), world.player!.y.toFixed(3),
    ...world.enemies.map((e) => `${e.poke.speciesId}:${e.poke.hp}`),
    ...a.meuTime.map((p) => p.hp), ...a.rivalTime.map((p) => p.hp),
    world.rng.state,
  ].join('|')
}

describe('arena (PH-540)', () => {
  it('mesma semente e mesmos times: silencioso e ao vivo terminam identicos', () => {
    const opcoes = { semente: 7, meuTime: time(1, TIME_A), rivalTime: time(2, TIME_B), nomeDoRival: 'Rival' }
    const silencioso = rodarArena(opcoes, LIVE_SIM_STEP_SECONDS)

    const vivo = criarMundoArena(opcoes)
    while (vivo.arena!.resultado === 'lutando') stepArena(vivo, LIVE_SIM_STEP_SECONDS, { silent: false })

    expect(assinatura(vivo)).toBe(assinatura(silencioso.world))
    expect(silencioso.resultado).not.toBe('lutando')
    expect(silencioso.ticks).toBeGreaterThan(180)
  })

  it('semente diferente muda o duelo (a semente e de fato lida)', () => {
    const base = { meuTime: time(1, TIME_A), rivalTime: time(2, TIME_B), nomeDoRival: 'Rival' }
    const a = rodarArena({ ...base, semente: 1 }, LIVE_SIM_STEP_SECONDS)
    const b = rodarArena({ ...base, semente: 2 }, LIVE_SIM_STEP_SECONDS)
    expect(assinatura(a.world)).not.toBe(assinatura(b.world))
  })

  it('os dois lados rotacionam o time e o duelo acaba com um lado sem ninguem', () => {
    const forte = time(3, ['dragonite', 'tyranitar'], 80)
    const fraco = time(4, ['rattata', 'pidgey', 'caterpie'], 10)
    const { resultado, world } = rodarArena({ semente: 11, meuTime: forte, rivalTime: fraco, nomeDoRival: 'Fraco' }, LIVE_SIM_STEP_SECONDS)
    expect(resultado).toBe('vitoria')
    expect(world.arena!.indiceRival).toBe(2)
    // Corpos ficam em campo: os 3 rivais continuam no mundo, todos caidos.
    expect(world.enemies).toHaveLength(3)
    expect(world.enemies.every(isDead)).toBe(true)

    const derrota = rodarArena({ semente: 11, meuTime: fraco, rivalTime: forte, nomeDoRival: 'Forte' }, LIVE_SIM_STEP_SECONDS)
    expect(derrota.resultado).toBe('derrota')
    expect(derrota.world.arena!.indiceMeu).toBe(2)
    expect(derrota.world.player!.state).toBe('dead')
  })

  it('stepWorld delega pra arena e nao credita nada no gameState', () => {
    const world = criarMundoArena({ semente: 5, meuTime: time(1, ['dragonite']), rivalTime: time(2, ['rattata'], 5), nomeDoRival: 'R' })
    let tocouNoEstado = 0
    const gameState = new Proxy({}, { get() { tocouNoEstado++; return () => { throw new Error('arena nao pode tocar no gameState') } } })
    for (let i = 0; i < 60 * 20 && world.arena!.resultado === 'lutando'; i++) {
      const kills = stepWorld(world, LIVE_SIM_STEP_SECONDS, gameState as never, { silent: true })
      expect(kills).toEqual([])
    }
    expect(world.arena!.resultado).toBe('vitoria')
    expect(tocouNoEstado).toBe(0)
    expect(world.mapDef!.id).toBe(ARENA_MAP_ID)
  })
})

// PH-541: o mundo da arena e o palco PINTADO do Lance. Com o catalogo cru
// (1400x900, sem grade) as bolas ficavam fora do mundo e o primeiro tick
// puxava os corpos pro centro — o "teleporte" que o dono viu contra os bots.
describe('arena: palco pintado do Lance (PH-541)', () => {
  it('herda bounds e grade da arte, e cada lado nasce na sua bola', () => {
    const world = criarMundoArena({ semente: 3, meuTime: time(1, TIME_A), rivalTime: time(2, TIME_B), nomeDoRival: 'Rival' })
    const lance = mapDefParaSala(LANCE_MAP_ID, null)!
    expect(world.mapDef!.bounds).toEqual(lance.bounds)
    expect(world.mapDef!.collisionGrid).toBe(lance.collisionGrid)
    expect(world.mapDef!.colisaoDefineLimite).toBe(true)

    const amarela = spawnPointParaSala(LANCE_MAP_ID, null)!
    const verde = spawnInimigoParaSala(LANCE_MAP_ID, null)!
    expect({ x: world.player!.x, y: world.player!.y }).toEqual(amarela)
    expect({ x: world.enemies[0].x, y: world.enemies[0].y }).toEqual(verde)
    expect(amarela.y).toBeGreaterThan(900) // a bola so existe no mundo da arte
  })

  it('ninguem teleporta: nenhum corpo anda mais que um passo por tick na luta inteira', () => {
    // Com o catalogo cru o salto era de ~460 px no tick em que a encarada
    // engaja (a coleira puxava o par pro centro de um mapa que nao existe).
    const world = criarMundoArena({ semente: 3, meuTime: time(1, TIME_A), rivalTime: time(2, TIME_B), nomeDoRival: 'Rival' })
    let maiorSalto = 0
    while (world.arena!.resultado === 'lutando') {
      const antes = [world.player!, ...world.enemies].map((e) => ({ id: e.id, x: e.x, y: e.y }))
      stepArena(world, LIVE_SIM_STEP_SECONDS, { silent: true })
      for (const { id, x, y } of antes) {
        const e = world.player!.id === id ? world.player! : world.enemies.find((k) => k.id === id)
        if (e) maiorSalto = Math.max(maiorSalto, Math.hypot(e.x - x, e.y - y))
      }
    }
    expect(maiorSalto).toBeLessThan(15)
  })

  // PH-542: a arena e combate duelo, entao golpes pesados armam a pose Hurt
  // em quem levou — prova que o gancho de resolveHit dispara na luta real.
  it('golpe de 20%+ do HP arma a pose Hurt em quem levou', () => {
    const world = criarMundoArena({ semente: 3, meuTime: time(1, TIME_A), rivalTime: time(2, TIME_B), nomeDoRival: 'Rival' })
    let flinches = 0
    while (world.arena!.resultado === 'lutando') {
      stepArena(world, LIVE_SIM_STEP_SECONDS, { silent: true })
      for (const e of [world.player!, ...world.enemies]) {
        if ((e.hurtAnimTimer ?? 0) > 0) { flinches++; e.hurtAnimTimer = undefined }
      }
    }
    expect(flinches).toBeGreaterThan(0)
  })
})
