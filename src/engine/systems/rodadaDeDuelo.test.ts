// PH-535: Modo Duelo passa a rodar dentro do MESMO `updateCombat` de
// qualquer hunt (motor real: dano/stage/status/trait), so com um gate
// aditivo (`world.rodadaDuelo`) que trava o combate em turnos alternados por
// Velocidade em vez do "cada lado no proprio cooldown" do modo livre. Este
// teste prova o gate isolado — sem o runner headless (authority/src), que
// tem seu proprio teste de integracao.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import { updateCombat } from './combatSystem'

const PASSO = 0.1

function cenario(velocidadeJogador: number, velocidadeInimigo: number) {
  const rng = createRng(7)

  const jogadorPoke = createPokeInstance(rng, 'charmander', 40)
  jogadorPoke.stats = { ...jogadorPoke.stats, speed: velocidadeJogador, hp: 9999 }
  jogadorPoke.hp = 9999
  const world = buildMapWorld('mata_e1', jogadorPoke, { seed: 7, rng, counters: { entity: 1, effect: 1, pendingHit: 1 } })
  world.rodadaDuelo = { fila: [], eventos: [] }
  const player = world.player!
  player.state = 'engaged'

  const inimigoPoke = createPokeInstance(rng, 'rattata', 40)
  inimigoPoke.stats = { ...inimigoPoke.stats, speed: velocidadeInimigo, hp: 9999 }
  inimigoPoke.hp = 9999
  const enemy = createEnemyEntity(world.counters, {
    poke: inimigoPoke, x: player.x + 5, y: player.y, encounterId: world.mapDef!.enemyPool[0],
  })
  enemy.state = 'engaged'
  enemy.targetId = player.id

  world.enemies = [enemy]
  return { world, player, enemy }
}

describe('gate de turno do Modo Duelo (PH-535)', () => {
  it('so o lado da vez ataca — nunca os dois no mesmo instante', () => {
    const { world } = cenario(200, 50)

    for (let i = 0; i < 200; i++) updateCombat(world, PASSO, { silent: true })

    const eventos = world.rodadaDuelo!.eventos
    expect(eventos.length).toBeGreaterThan(1)
    // Alternancia estrita: nunca dois eventos seguidos do MESMO lado.
    for (let i = 1; i < eventos.length; i++) {
      expect(eventos[i].atacanteLado).not.toBe(eventos[i - 1].atacanteLado)
    }
  })

  it('quem tem Velocidade maior abre o primeiro round', () => {
    const { world } = cenario(200, 50)
    for (let i = 0; i < 40; i++) updateCombat(world, PASSO, { silent: true })
    expect(world.rodadaDuelo!.eventos[0]?.atacanteLado).toBe('player')
  })

  it('inverte quem abre o round quando o inimigo e mais rapido', () => {
    const { world } = cenario(50, 200)
    for (let i = 0; i < 40; i++) updateCombat(world, PASSO, { silent: true })
    expect(world.rodadaDuelo!.eventos[0]?.atacanteLado).toBe('enemy')
  })

  it('mundo sem rodadaDuelo (hunt normal) nao trava ninguem', () => {
    const { world } = cenario(200, 50)
    world.rodadaDuelo = null

    for (let i = 0; i < 40; i++) updateCombat(world, PASSO, { silent: true })

    // Sem gate, os dois cooldowns rodam de forma independente — o inimigo
    // tambem consegue agir mesmo sendo mais lento (o gate e o UNICO motivo
    // dele ter que esperar a vez no cenario de duelo).
    expect(world.enemies[0].globalCooldown).toBeGreaterThan(0)
  })

  // O motivo inteiro da PH-535: no motor antigo (pvpSimulator.ts) a
  // habilidade de entrada nunca poderia ter efeito de verdade (sem stage de
  // stat nenhum). Aqui e o MESMO `resolveEntryHook` de qualquer hunt —
  // ganha de graca.
  it('habilidade de entrada (Intimidate) baixa estagio de verdade dentro do duelo', () => {
    const { world, player, enemy } = cenario(100, 100)
    enemy.poke.trait = 'intimidate'

    updateCombat(world, PASSO, { silent: true })

    expect(player.estagios.atkFis).toBe(-1)
  })

  it('troca de POKE mid-duelo refaz o hook de entrada pro novo ativo', () => {
    const { world, player, enemy } = cenario(100, 100)
    updateCombat(world, PASSO, { silent: true }) // entrada inicial, sem Intimidate ainda
    expect(player.estagios.atkFis ?? 0).toBe(0)

    // Mesma troca que `appDuelo.ts#trocarAtivo` faz: poke novo na entidade,
    // hook de entrada resetado, fila da rodada zerada.
    const novoRival = createPokeInstance(createRng(9), 'pidgey', 40)
    novoRival.trait = 'intimidate'
    novoRival.stats = { ...novoRival.stats, hp: 9999 }
    novoRival.hp = 9999
    enemy.poke = novoRival
    enemy.entradaProcessada = false
    world.rodadaDuelo!.fila = []

    updateCombat(world, PASSO, { silent: true })

    expect(player.estagios.atkFis).toBe(-1)
  })
})
