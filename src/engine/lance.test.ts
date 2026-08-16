// A sequencia do Campeao Lance: os 6 POKEs dele entram um a um, so o proximo
// depois do anterior cair, ate esgotar a equipe — e do outro lado, o time do
// JOGADOR troca pro proximo poke vivo a cada desmaio (`autoSwitchTeamOnFaint`)
// ate ele tambem esgotar.
//
// Ja quebrou por levas (`sequenceIndex` reiniciando a cada janela de flush do
// servidor, ver a nota de `salas.test.ts`) sem nenhum erro visivel — so o
// proximo POKE nunca entrando. O caso que mais importa aqui NAO e a simulacao
// continua (essa e o caminho facil): e sobreviver a RECONSTRUCAO do mundo a
// cada janela, que e como o servidor de verdade avanca a luta.
import { describe, expect, it, beforeEach } from 'vitest'
import { createRng } from '@/core/rng'
import type { PokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld, type ProgressoDaSessao } from './simulation'
import { useGameStateStore } from '@/stores/gameStateStore'
import { LANCE_MAP_ID } from '@/data/nightmareMaps'

const ORDEM_REAL_DO_LANCE = ['gyarados', 'dragonite', 'charizard', 'dragonite', 'aerodactyl', 'dragonite']

function pokeFragil(uid: string): PokeInstance {
  return {
    uid,
    speciesId: 'rattata',
    level: 5,
    isShiny: false,
    rarity: 'comum',
    exp: 0,
    ivs: { hp: 10, atkFis: 10, atkEsp: 10, def: 10, defEsp: 10, speed: 10 },
    stats: { hp: 20, atkFis: 10, atkEsp: 10, def: 5, defEsp: 5, speed: 10 },
    hp: 20,
    unlockedAbilities: [],
    activeAbilities: [],
  }
}

// So precisa vencer de longe, contra qualquer um dos 6 Lv55-65 do Lance — o
// alvo destes testes e a MAQUINA de estados, nao o combate em si.
function pokeAbsurdo(): PokeInstance {
  return {
    uid: 'destruidor',
    speciesId: 'mewtwo',
    level: 100,
    isShiny: false,
    rarity: 'mythic',
    exp: 0,
    ivs: { hp: 31, atkFis: 31, atkEsp: 31, def: 31, defEsp: 31, speed: 31 },
    stats: { hp: 99999, atkFis: 99999, atkEsp: 99999, def: 99999, defEsp: 99999, speed: 500 },
    hp: 99999,
    unlockedAbilities: [],
    activeAbilities: [],
  }
}

describe('Campeao Lance — sequencia', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('numa simulacao continua, os 6 entram na ordem real', () => {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(pokeAbsurdo())
    gs.setActiveIndex(0)
    const gameState = useGameStateStore.getState()
    const world = buildMapWorld(LANCE_MAP_ID, gameState.team[0], {
      rng: createRng(1),
      counters: { entity: 1, effect: 1, pendingHit: 1 },
    })

    const especiesVistas: string[] = []
    let ultimoId: string | null = null
    for (let i = 0; i < 6000 && !world.sequenceCleared; i++) {
      stepWorld(world, 0.1, gameState, { silent: true })
      const vivo = world.enemies.find((e) => e.poke.hp > 0)
      if (vivo && vivo.id !== ultimoId) {
        ultimoId = vivo.id
        especiesVistas.push(vivo.poke.speciesId)
      }
    }

    expect(especiesVistas).toEqual(ORDEM_REAL_DO_LANCE)
    expect(world.sequenceCleared).toBe(true)
  })

  it('sobrevive a reconstrucao do mundo a cada janela (simula o flush do servidor)', () => {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(pokeAbsurdo())
    gs.setActiveIndex(0)
    const gameState = useGameStateStore.getState()

    let progresso: ProgressoDaSessao | undefined
    let world = buildMapWorld(LANCE_MAP_ID, gameState.team[0], {
      rng: createRng(1),
      counters: { entity: 1, effect: 1, pendingHit: 1 },
    }, progresso)

    const especiesVistas: string[] = []
    let ultimoId: string | null = null
    for (let janela = 0; janela < 40 && !world.sequenceCleared; janela++) {
      // ~30s por janela, passo de 0.1s = 300 ticks — o mesmo passo do flush real.
      for (let i = 0; i < 300 && !world.sequenceCleared; i++) {
        stepWorld(world, 0.1, gameState, { silent: true })
        const vivo = world.enemies.find((e) => e.poke.hp > 0)
        if (vivo && vivo.id !== ultimoId) {
          ultimoId = vivo.id
          especiesVistas.push(vivo.poke.speciesId)
        }
      }
      progresso = { sequenceIndex: world.sequenceIndex, sequenceCleared: world.sequenceCleared, sala: world.sala }
      world = buildMapWorld(LANCE_MAP_ID, gameState.team[0], { rng: world.rng, counters: world.counters }, progresso)
    }

    expect(especiesVistas).toEqual(ORDEM_REAL_DO_LANCE)
    expect(world.sequenceCleared).toBe(true)
  })

  it('time do jogador troca de poke a cada desmaio, ate esgotar a equipe', () => {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(pokeFragil('r1'))
    gs.addPokeToTeam(pokeFragil('r2'))
    gs.addPokeToTeam(pokeFragil('r3'))
    gs.setActiveIndex(0)
    const gameState = useGameStateStore.getState()
    const world = buildMapWorld(LANCE_MAP_ID, gameState.team[0], {
      rng: createRng(1),
      counters: { entity: 1, effect: 1, pendingHit: 1 },
    })

    const idsVistos: string[] = []
    let ultimoUid: string | null = null
    for (let i = 0; i < 3000; i++) {
      stepWorld(world, 0.1, gameState, { silent: true })
      const uidAtual = world.player!.poke.uid
      if (uidAtual !== ultimoUid) {
        ultimoUid = uidAtual
        idsVistos.push(uidAtual)
      }
      if (gameState.team.every((p) => p.hp <= 0)) break // time inteiro desmaiado: nada mais pode acontecer
    }

    expect(idsVistos).toEqual(['r1', 'r2', 'r3'])
    expect(world.player!.fainted).toBe(true)
    expect(gameState.team.every((p) => p.hp <= 0)).toBe(true)
  })
})
