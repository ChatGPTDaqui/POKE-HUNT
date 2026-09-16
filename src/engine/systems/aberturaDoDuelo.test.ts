// PH-552: a abertura do combate duelo — fila, congelamento, hook de entrada
// uma vez so, ordem casa -> visitante, e o que NAO acontece fora do duelo.
import { beforeEach, describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { ESPERA_DE_TROCA_SEGUNDOS } from '@/data/huntTypes'
import { LANCE_MAP_ID } from '@/data/nightmareMaps'
import { createPokeInstance, type PokeInstance } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { criarMundoArena, stepArena } from '../arena'
import { isDead } from '../entity'
import { buildMapWorld, LIVE_SIM_STEP_SECONDS, stepWorld } from '../simulation'
import { pularAbertura } from '../testes/aberturaDeTeste'
import type { WorldState } from '../types'
import { apresentarEntrada, ETAPA_DA_ABERTURA_SEGUNDOS, ladoDaEntidade } from './aberturaDoDuelo'

const PASSO = LIVE_SIM_STEP_SECONDS
const IV_FULL = { hp: 31, atkFis: 31, atkEsp: 31, def: 31, defEsp: 31, speed: 31 }

function poke(seed: number, speciesId: string, trait?: string, nivel = 80): PokeInstance {
  const p = createPokeInstance(createRng(seed), speciesId, nivel, { ivs: { ...IV_FULL }, rarity: 'legendary' })
  if (trait) p.trait = trait as PokeInstance['trait']
  else p.trait = undefined
  return p
}

function arena(meuTime: PokeInstance[], rivalTime: PokeInstance[], casaEhOJogador = false): WorldState {
  return criarMundoArena({ semente: 5, meuTime, rivalTime, nomeDoRival: 'Rival', casaEhOJogador })
}

function fila(world: WorldState): string[] {
  return (world.aberturaDoDuelo?.fila ?? []).map((e) => `${e.lado}:${e.tipo}`)
}

function avancar(world: WorldState, segundos: number): void {
  const ticks = Math.round(segundos / PASSO)
  for (let i = 0; i < ticks; i++) stepArena(world, PASSO, { silent: true })
}

describe('abertura do duelo (PH-552): a fila', () => {
  it('abertura inicial: casa-bola, casa-ameaca, vis-bola, vis-ameaca, depois as habilidades casa -> visitante', () => {
    // Os dois com hook de entrada; o rival e a casa (arena ranqueada/bot).
    const world = arena([poke(1, 'gyarados', 'intimidate')], [poke(2, 'porygon2', 'download')])
    expect(fila(world)).toEqual([
      'casa:bola', 'casa:ameaca', 'visitante:bola', 'visitante:ameaca', 'casa:habilidade', 'visitante:habilidade',
    ])
    expect(ladoDaEntidade(world, world.player!)).toBe('visitante')
    expect(ladoDaEntidade(world, world.enemies[0])).toBe('casa')
  })

  it('no amistoso o anfitriao e a casa: o jogador apresenta primeiro', () => {
    const world = arena([poke(1, 'gyarados', 'intimidate')], [poke(2, 'porygon2', 'download')], true)
    expect(fila(world)).toEqual([
      'casa:bola', 'casa:ameaca', 'visitante:bola', 'visitante:ameaca', 'casa:habilidade', 'visitante:habilidade',
    ])
    expect(ladoDaEntidade(world, world.player!)).toBe('casa')
  })

  it('sem hook de entrada nao ha etapa de habilidade', () => {
    const world = arena([poke(1, 'dragonite')], [poke(2, 'metagross')])
    expect(fila(world)).toEqual(['casa:bola', 'casa:ameaca', 'visitante:bola', 'visitante:ameaca'])
  })

  it('cada etapa dura ETAPA_DA_ABERTURA_SEGUNDOS e a abertura fecha no fim da ultima', () => {
    const world = arena([poke(1, 'gyarados', 'intimidate')], [poke(2, 'metagross')])
    const etapas = world.aberturaDoDuelo!.fila.length
    expect(etapas).toBe(5)
    avancar(world, etapas * ETAPA_DA_ABERTURA_SEGUNDOS - PASSO)
    expect(world.aberturaDoDuelo).not.toBeNull()
    avancar(world, PASSO)
    expect(world.aberturaDoDuelo).toBeNull()
  })

  it('substituicao: so quem entra faz bola -> ameaca -> habilidade', () => {
    const world = arena([poke(1, 'dragonite'), poke(3, 'gyarados', 'intimidate')], [poke(2, 'metagross')])
    pularAbertura(world)
    world.player!.poke.hp = 0
    avancar(world, ESPERA_DE_TROCA_SEGUNDOS + PASSO)
    expect(world.player!.poke.speciesId).toBe('gyarados')
    expect(fila(world)).toEqual(['visitante:bola', 'visitante:ameaca', 'visitante:habilidade'])
  })

  it('os dois caindo no mesmo tick apresentam casa primeiro, habilidades depois dos dois', () => {
    const world = arena([poke(1, 'dragonite'), poke(3, 'gyarados', 'intimidate')], [poke(2, 'metagross'), poke(4, 'porygon2', 'download')])
    pularAbertura(world)
    world.player!.poke.hp = 0
    world.enemies[0].poke.hp = 0
    avancar(world, ESPERA_DE_TROCA_SEGUNDOS + PASSO)
    expect(fila(world)).toEqual([
      'casa:bola', 'casa:ameaca', 'visitante:bola', 'visitante:ameaca', 'casa:habilidade', 'visitante:habilidade',
    ])
  })
})

describe('abertura do duelo (PH-552): o que acontece com as entidades', () => {
  it('bola: nasce invisivel e aparece no fim da etapa; ameaca: Pose; habilidade: Swing', () => {
    const world = arena([poke(1, 'gyarados', 'intimidate')], [poke(2, 'metagross')])
    const rival = world.enemies[0]
    const eu = world.player!
    expect(rival.nascendo).toBe(true)
    expect(eu.nascendo).toBe(true)

    avancar(world, ETAPA_DA_ABERTURA_SEGUNDOS)
    expect(rival.nascendo).toBeUndefined()
    expect(rival.animOverride).toBe('Pose')
    expect(eu.nascendo).toBe(true)

    avancar(world, ETAPA_DA_ABERTURA_SEGUNDOS)
    expect(rival.animOverride).toBeUndefined()
    expect(eu.nascendo).toBe(true)

    avancar(world, ETAPA_DA_ABERTURA_SEGUNDOS)
    expect(eu.nascendo).toBeUndefined()
    expect(eu.animOverride).toBe('Pose')

    avancar(world, ETAPA_DA_ABERTURA_SEGUNDOS)
    expect(eu.animOverride).toBe('Swing')
    // O hook so no FIM da etapa de habilidade.
    expect(rival.estagios.atkFis ?? 0).toBe(0)

    avancar(world, ETAPA_DA_ABERTURA_SEGUNDOS)
    expect(eu.animOverride).toBeUndefined()
    expect(rival.estagios.atkFis).toBe(-1)
    expect(world.aberturaDoDuelo).toBeNull()
  })

  it('ninguem anda, ninguem bate, HP e status nao mudam durante a abertura', () => {
    const world = arena([poke(1, 'gyarados', 'intimidate')], [poke(2, 'porygon2', 'download')])
    const eu = world.player!
    const rival = world.enemies[0]
    rival.poke.status = { tipo: 'poison', turnosRestantes: 99 } as never
    const antes = { x: eu.x, y: eu.y, rx: rival.x, ry: rival.y, hp: eu.poke.hp, rhp: rival.poke.hp }
    const rng = world.rng.state
    avancar(world, 6 * ETAPA_DA_ABERTURA_SEGUNDOS - PASSO)
    expect(world.aberturaDoDuelo).not.toBeNull()
    expect({ x: eu.x, y: eu.y, rx: rival.x, ry: rival.y, hp: eu.poke.hp, rhp: rival.poke.hp }).toEqual(antes)
    expect(world.pendingHits).toEqual([])
    expect(world.rodadaDeDuelo).toBeNull()
    expect(eu.targetId).toBeNull()
    expect(world.rng.state, 'a abertura nao consome sorteio').toBe(rng)
  })

  it('Intimidate dispara UMA vez — no fim da etapa, nunca de novo ao engajar', () => {
    const world = arena([poke(1, 'gyarados', 'intimidate')], [poke(2, 'metagross')])
    const rival = world.enemies[0]
    pularAbertura(world)
    expect(rival.estagios.atkFis).toBe(-1)
    // Ate os dois engajarem e trocarem golpe: o estagio continua -1, nao -2.
    for (let i = 0; i < 600 && world.pendingHits.length === 0 && !isDead(rival); i++) stepArena(world, PASSO, { silent: true })
    expect(rival.estagios.atkFis).toBe(-1)
  })

  it('silencioso e ao vivo terminam identicos com a abertura no meio', () => {
    const opcoes = { semente: 9, meuTime: [poke(1, 'gyarados', 'intimidate'), poke(3, 'tyranitar')], rivalTime: [poke(2, 'porygon2', 'download'), poke(4, 'machamp')], nomeDoRival: 'R' }
    const a = criarMundoArena(opcoes)
    const b = criarMundoArena(opcoes)
    while (a.arena!.resultado === 'lutando') stepArena(a, PASSO, { silent: true })
    while (b.arena!.resultado === 'lutando') stepArena(b, PASSO, { silent: false })
    expect([a.arena!.resultado, a.arena!.ticks, a.rng.state]).toEqual([b.arena!.resultado, b.arena!.ticks, b.rng.state])
    // O vivo criou a bola (efeito visual); o silencioso nao — e nada mudou.
    expect(b.counters.effect).toBeGreaterThan(a.counters.effect)
  })
})

describe('abertura do duelo (PH-552): hunts', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  function mundo(mapId: string, progresso?: Parameters<typeof buildMapWorld>[3]): WorldState {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(poke(1, 'gyarados', 'intimidate', 100))
    gs.setActiveIndex(0)
    return buildMapWorld(mapId, useGameStateStore.getState().team[0], {
      seed: 0, rng: createRng(7), counters: { entity: 1, effect: 1, pendingHit: 1 },
    }, progresso)
  }

  it('Lance: sem contagem, a casa e o Lance, e o proximo da sequencia se apresenta', () => {
    const world = mundo(LANCE_MAP_ID)
    const gameState = useGameStateStore.getState()
    expect(world.countdownRemaining).toBeNull()
    expect(world.enemies).toHaveLength(1)
    // O Gyarados do Lance tem Intimidate de especie: a casa tambem faz habilidade.
    expect(fila(world)).toEqual(['casa:bola', 'casa:ameaca', 'visitante:bola', 'visitante:ameaca', 'casa:habilidade', 'visitante:habilidade'])
    pularAbertura(world, gameState)

    // Derruba o primeiro; o segundo entra pela espera e se apresenta sozinho.
    world.enemies[0].poke.hp = 0
    for (let i = 0; i < Math.ceil((ESPERA_DE_TROCA_SEGUNDOS + 1) / 0.1) && !world.aberturaDoDuelo; i++) {
      stepWorld(world, 0.1, gameState, { silent: true })
    }
    expect(world.sequenceIndex).toBe(1)
    expect(fila(world)).toEqual(['casa:bola', 'casa:ameaca'])
  })

  it('covil de lendario: apresentacao sem etapa de fala (nao ha treinador), casa e o lendario', () => {
    const world = mundo('boss_articuno')
    expect(world.mapDef?.encarada).toBe(true)
    expect(fila(world)).toEqual(['casa:bola', 'casa:ameaca', 'visitante:bola', 'visitante:ameaca', 'visitante:habilidade'])
    expect(ladoDaEntidade(world, world.enemies[0])).toBe('casa')
  })

  it('modo livre: sem abertura, e o hook de entrada continua no engajar', () => {
    const world = mundo('route_46')
    expect(world.aberturaDoDuelo).toBeNull()
    apresentarEntrada(world, [world.player!])
    expect(world.aberturaDoDuelo).toBeNull()
    expect(world.player!.nascendo).toBeUndefined()
  })

  it('retomada (servidor): a abertura nao toca de novo', () => {
    const world = mundo(LANCE_MAP_ID, { sequenceIndex: 2, sequenceCleared: false, sequenceHp: 50, sala: null })
    expect(world.aberturaDoDuelo).toBeNull()
    expect(world.enemies[0].nascendo).toBeUndefined()
  })
})
