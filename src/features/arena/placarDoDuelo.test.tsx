// @vitest-environment jsdom
// PH-549: o placar aparece nos tres tipos de duelo (arena, Lance, covil), some
// fora deles, e mostra o que o motor sabe — treinadores, POKEs, HP, bolas.
//
// Chaveia por `mapDef.encarada`: um mapa do mundo (sem encarada) NAO tem
// placar mesmo com inimigo em campo; o Lance TEM placar sem `world.arena`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createRng } from '@/core/rng'
import type { PokeInstance } from '@/data/pokes'
import { LANCE_MAP_ID } from '@/data/nightmareMaps'
import { STARTER_HUNT_ID } from '@/data/huntSpawnOverrides'
import { criarMundoArena } from '@/engine/arena'
import { buildMapWorld, stepWorld } from '@/engine/simulation'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { useAvatarStore } from '@/stores/avatarStore'
import { useArenaStore } from './arena'
import { PlacarDoDuelo } from './PlacarDoDuelo'

vi.mock('@/data/remote/avatarRpc', () => ({
  avataresDe: vi.fn(async () => new Map()),
  definirAvatar: vi.fn(),
}))

function poke(uid: string, speciesId = 'rattata', hp = 20): PokeInstance {
  return {
    uid, speciesId, level: 5, isShiny: false, rarity: 'comum', exp: 0,
    ivs: { hp: 10, atkFis: 10, atkEsp: 10, def: 10, defEsp: 10, speed: 10 },
    stats: { hp: 20, atkFis: 10, atkEsp: 10, def: 5, defEsp: 5, speed: 10 },
    hp, unlockedAbilities: [], activeAbilities: ['basic_attack'],
  }
}

function placar() {
  return screen.queryByTestId('placar-do-duelo')
}

describe('placar do duelo (PH-549)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
    useAvatarStore.getState().reiniciar()
    useArenaStore.setState({ veredito: null, nomeDoRival: '', rivalId: null, aoSair: null })
  })
  afterEach(() => {
    cleanup()
    useWorldStore.getState().resetWorld()
  })

  it('arena: os dois treinadores, os POKEs em campo e as bolas dos dois times', () => {
    const world = criarMundoArena({
      semente: 1,
      meuTime: [poke('m1', 'pikachu'), poke('m2', 'eevee')],
      rivalTime: [poke('r1', 'gengar'), poke('r2', 'snorlax'), poke('r3', 'lapras')],
      nomeDoRival: 'Lance',
    })
    useArenaStore.setState({ nomeDoRival: 'Lance', rivalId: 'bot-lance' })
    useWorldStore.getState().setWorld(world)
    render(<PlacarDoDuelo />)
    const el = placar()!
    expect(el).not.toBeNull()
    expect(el.textContent).toContain('Lance')
    expect(el.textContent).toContain('Pikachu')
    expect(el.textContent).toContain('Gengar')
    expect(screen.getByLabelText('2 de 2 de pé')).toBeTruthy()
    expect(screen.getByLabelText('3 de 3 de pé')).toBeTruthy()
  })

  it('Lance: placar sem world.arena, rival com retrato fixo e 6 bolas da sequencia', () => {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(poke('meu', 'pikachu'))
    gs.setActiveIndex(0)
    const gameState = useGameStateStore.getState()
    const world = buildMapWorld(LANCE_MAP_ID, gameState.team[0], { seed: 0,
      rng: createRng(1), counters: { entity: 1, effect: 1, pendingHit: 1 },
    })
    // Passa a contagem inicial pro Gyarados nascer.
    for (let i = 0; i < 80; i++) stepWorld(world, 0.1, gameState, { silent: true })
    useWorldStore.getState().setWorld(world)
    render(<PlacarDoDuelo />)
    const el = placar()!
    expect(el).not.toBeNull()
    expect(el.textContent).toContain('Lance')
    expect(el.textContent).toContain('Gyarados')
    expect(el.querySelector('img[src="assets/treinadores/rosto/lance.png"]')).not.toBeNull()
    expect(screen.getByLabelText('6 de 6 de pé')).toBeTruthy()
  })

  it('mapa do mundo: sem placar', () => {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(poke('meu', 'pikachu'))
    gs.setActiveIndex(0)
    const gameState = useGameStateStore.getState()
    const world = buildMapWorld(STARTER_HUNT_ID, gameState.team[0], { seed: 0,
      rng: createRng(1), counters: { entity: 1, effect: 1, pendingHit: 1 },
    })
    useWorldStore.getState().setWorld(world)
    render(<PlacarDoDuelo />)
    expect(placar()).toBeNull()
  })
})

// PH-551: KOs, quem age primeiro e a vez — tudo derivado do que o motor ja tem.
describe('placar do duelo — KOs e ordem do round (PH-551)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
    useAvatarStore.getState().reiniciar()
    useArenaStore.setState({ veredito: null, nomeDoRival: 'Rival', rivalId: null, aoSair: null })
  })
  afterEach(() => {
    cleanup()
    useWorldStore.getState().resetWorld()
  })

  it('KO de cada lado = bolas caidas do outro; o 1º e quem abre a ordem do round', () => {
    const world = criarMundoArena({
      semente: 1,
      meuTime: [poke('m1', 'pikachu'), poke('m2', 'eevee')],
      rivalTime: [poke('r1', 'gengar'), poke('r2', 'snorlax'), poke('r3', 'lapras')],
      nomeDoRival: 'Rival',
    })
    // Dois do rival ja cairam; um meu tambem.
    world.arena!.rivalTime[0].hp = 0
    world.arena!.rivalTime[1].hp = 0
    world.arena!.meuTime[1].hp = 0
    const inimigo = world.enemies[0]
    world.rodadaDeDuelo = { numero: 3, ordem: [inimigo.id, world.player!.id], indice: 1, espera: 0, golpes: {} }
    useWorldStore.getState().setWorld(world)
    render(<PlacarDoDuelo />)
    expect(screen.getByLabelText('2 KO')).toBeTruthy()
    expect(screen.getByLabelText('1 KO')).toBeTruthy()
    // O rival abriu o round; a vez (indice 1) e minha.
    const lados = screen.getByTestId('placar-do-duelo').querySelectorAll('[data-na-vez]')
    expect(lados.length).toBe(1)
    expect(lados[0].textContent).toContain('Pikachu')
    const marca = screen.getByTitle('Age primeiro neste round')
    expect(marca.closest('[data-na-vez], .flex.min-w-0.flex-1.items-center')!.textContent).toContain('Gengar')
  })
})
