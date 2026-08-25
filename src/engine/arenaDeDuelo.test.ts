// A arena de duelo (PH-78): as duas bolas pintadas na arte dizem por onde cada
// lado entra em campo, e o substituto de qualquer um dos dois so aparece
// ESPERA_DE_TROCA_SEGUNDOS depois do POKE anterior cair.
//
// Antes disto:
//   - o POKE do Lance nascia no `spawnPoints[0]` fixo do mapa, e do segundo em
//     diante num ponto aleatorio perto dele;
//   - o substituto do jogador aparecia INSTANTANEAMENTE, no mesmo tick do
//     desmaio, exatamente no buraco onde o anterior morreu.
//
// O caso que mais importa aqui e o mesmo de `lance.test.ts`: sobreviver a
// RECONSTRUCAO do mundo a cada janela de flush. A espera de troca e derivada,
// nao carregada — se ela dependesse de um campo em `ProgressoDaSessao`, um
// flush no meio dela deixaria o POKE desmaiado em campo pra sempre, sem erro
// nenhum na tela.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import type { PokeInstance } from '@/data/pokes'
import { COLISAO_POR_ARTE } from '@/data/generated/subBiomaCollision.generated'
import { ESPERA_DE_TROCA_SEGUNDOS } from '@/data/huntTypes'
import { getMap, MAPS } from '@/data/maps'
import { LANCE_MAP_ID } from '@/data/nightmareMaps'
import { useGameStateStore } from '@/stores/gameStateStore'
import { buildMapWorld, stepWorld, type ProgressoDaSessao } from './simulation'

const ARENA_DO_LANCE = COLISAO_POR_ARTE['assets/hunt-backgrounds/dragon.jpg']

function poke(uid: string, hp: number): PokeInstance {
  return {
    uid,
    speciesId: 'rattata',
    level: 5,
    isShiny: false,
    rarity: 'comum',
    exp: 0,
    ivs: { hp: 10, atkFis: 10, atkEsp: 10, def: 10, defEsp: 10, speed: 10 },
    stats: { hp: 20, atkFis: 10, atkEsp: 10, def: 5, defEsp: 5, speed: 10 },
    hp,
    unlockedAbilities: [],
    activeAbilities: ['basic_attack'],
  }
}

function mundoDoLance(progresso?: ProgressoDaSessao) {
  const gameState = useGameStateStore.getState()
  return buildMapWorld(LANCE_MAP_ID, gameState.team[gameState.activeIndex], { seed: 0,
    rng: createRng(7),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  }, progresso)
}

/** Passa a contagem regressiva de intro (5s) e para no primeiro POKE em campo. */
function passarIntro(world: ReturnType<typeof mundoDoLance>, gameState = useGameStateStore.getState()) {
  for (let i = 0; i < 80 && world.countdownRemaining != null; i++) {
    stepWorld(world, 0.1, gameState, { silent: true })
  }
}

describe('arena de duelo: por onde cada lado entra', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('a espera do lado do Lance chega em 2s DEPOIS de getMap, nao so no arquivo de dados', () => {
    // O teste que faltava: `getMap` multiplica todo `respawnDelay` por
    // `MOB_RESPAWN_DELAY_MULTIPLIER` (0,25), um botao de economia pra respawn
    // SELVAGEM. Os 2s escritos em nightmareMaps chegavam como 0,5s na arena, e
    // so uma medicao ao vivo pegou — asserir a constante no arquivo de origem
    // teria passado verde com o jogo errado.
    const arena = getMap(LANCE_MAP_ID)
    expect(arena!.respawnDelay).toBe(ESPERA_DE_TROCA_SEGUNDOS)
  })

  it('hunt normal continua com o multiplicador de economia aplicado', () => {
    // O contrapeso: a isencao vale SO pra hunt de sequencia. Se ela vazasse
    // pro resto, ouro/hora mudaria em todo o jogo sem ninguem pedir.
    const normal = getMap('route_46')
    expect(normal!.respawnDelay).toBeLessThan(MAPS['route_46'].respawnDelay)
  })

  it('a arte da arena tem as duas bolas, e elas nao coincidem', () => {
    expect(ARENA_DO_LANCE.spawnPoint).toBeDefined()
    expect(ARENA_DO_LANCE.spawnInimigo).toBeDefined()
    expect(ARENA_DO_LANCE.spawnInimigo).not.toEqual(ARENA_DO_LANCE.spawnPoint)
  })

  it('o jogador nasce na bola AMARELA', () => {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(poke('p1', 20))
    gs.setActiveIndex(0)
    const world = mundoDoLance()
    expect({ x: world.player!.x, y: world.player!.y }).toEqual(ARENA_DO_LANCE.spawnPoint)
  })

  it('o PRIMEIRO POKE do Lance ja entra pela bola VERDE, nao so os seguintes', () => {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(poke('p1', 20))
    gs.setActiveIndex(0)
    const world = mundoDoLance()
    passarIntro(world)

    const inimigo = world.enemies[0]
    expect(inimigo, 'ninguem entrou depois da intro').toBeDefined()
    expect({ x: inimigo.x, y: inimigo.y }).toEqual(ARENA_DO_LANCE.spawnInimigo)
  })

  it('todo POKE seguinte do Lance entra pela MESMA bola verde', () => {
    // Antes, do segundo em diante saia de `sequenceSpawnPoint` — um ponto
    // aleatorio num anel em volta do spawn fixo.
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(poke('forte', 99999))
    gs.setActiveIndex(0)
    // Um POKE que ganha de todos os 6, pra a sequencia inteira rodar.
    gs.updatePokeInstance('forte', (p) => ({
      ...p, level: 100, speciesId: 'mewtwo',
      stats: { hp: 99999, atkFis: 99999, atkEsp: 99999, def: 99999, defEsp: 99999, speed: 500 },
      hp: 99999,
    }))
    const gameState = useGameStateStore.getState()
    const world = mundoDoLance()

    const entradas: { x: number; y: number }[] = []
    const vistos = new Set<string>()
    for (let i = 0; i < 6000 && !world.sequenceCleared; i++) {
      stepWorld(world, 0.1, gameState, { silent: true })
      for (const e of world.enemies) {
        if (vistos.has(e.id)) continue
        vistos.add(e.id)
        entradas.push({ x: e.x, y: e.y })
      }
    }

    expect(entradas.length, 'a sequencia nao andou').toBeGreaterThanOrEqual(2)
    for (const p of entradas) expect(p).toEqual(ARENA_DO_LANCE.spawnInimigo)
  })
})

describe('arena de duelo: a espera de 2s pra trocar de POKE', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  function equipeComUmCaido() {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(poke('caido', 0))
    gs.addPokeToTeam(poke('reserva', 20))
    gs.setActiveIndex(0)
    return useGameStateStore.getState()
  }

  it('nao troca antes da hora', () => {
    const gameState = equipeComUmCaido()
    const world = mundoDoLance()
    passarIntro(world, gameState)

    // Um passo curto so pra a espera comecar a correr.
    stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })
    expect(world.player!.poke.uid, 'trocou cedo demais').toBe('caido')
    expect(world.trocaEmCampo).toBeGreaterThan(0)
  })

  it('troca depois de ESPERA_DE_TROCA_SEGUNDOS', () => {
    equipeComUmCaido()
    const world = mundoDoLance()
    passarIntro(world)

    for (let i = 0; i < Math.ceil(ESPERA_DE_TROCA_SEGUNDOS / 0.1) + 2; i++) {
      stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })
    }
    expect(world.player!.poke.uid).toBe('reserva')
    expect(world.trocaEmCampo).toBeNull()
  })

  it('o substituto entra pela bola AMARELA, nao onde o anterior caiu', () => {
    equipeComUmCaido()
    const world = mundoDoLance()
    passarIntro(world)
    // Arrasta o corpo pra longe da bola: sem o reposicionamento, o substituto
    // apareceria exatamente aqui.
    world.player!.x = 700
    world.player!.y = 450

    // Medido NO TICK DA TROCA: o substituto entra em `state: 'wander'` e ja
    // comeca a andar, entao dois ticks depois ele legitimamente nao esta mais
    // em cima da bola.
    let ondeEntrou: { x: number; y: number } | null = null
    for (let i = 0; i < Math.ceil(ESPERA_DE_TROCA_SEGUNDOS / 0.1) + 2 && !ondeEntrou; i++) {
      stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })
      if (world.player!.poke.uid === 'reserva') ondeEntrou = { x: world.player!.x, y: world.player!.y }
    }
    expect(ondeEntrou).toEqual(ARENA_DO_LANCE.spawnPoint)
  })

  it('a espera sobrevive a reconstrucao do mundo no meio dela', () => {
    // O caso que uma espera CARREGADA (campo em ProgressoDaSessao) perderia: o
    // mundo novo nasce sem timer, o POKE continua desmaiado, e a troca nunca
    // acontece. Como ela e derivada, o mundo novo so recomeca a contagem.
    equipeComUmCaido()
    let world = mundoDoLance()
    passarIntro(world)
    stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })
    expect(world.player!.poke.uid).toBe('caido')

    const progresso: ProgressoDaSessao = {
      sequenceIndex: world.sequenceIndex,
      sequenceCleared: world.sequenceCleared,
      sala: world.sala,
    }
    world = mundoDoLance(progresso)
    expect(world.trocaEmCampo, 'mundo reconstruido nasce sem timer').toBeNull()
    expect(world.player!.poke.uid, 'o mundo novo nasce com o POKE caido em campo').toBe('caido')
    passarIntro(world)

    for (let i = 0; i < Math.ceil(ESPERA_DE_TROCA_SEGUNDOS / 0.1) + 2; i++) {
      stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })
    }
    expect(world.player!.poke.uid, 'a troca travou depois do flush').toBe('reserva')
  })

  it('equipe inteira caida nao arma espera nenhuma', () => {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(poke('caido', 0))
    gs.setActiveIndex(0)
    const world = mundoDoLance()
    passarIntro(world)

    for (let i = 0; i < 60; i++) stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })
    expect(world.trocaEmCampo).toBeNull()
    expect(world.player!.poke.uid).toBe('caido')
  })
})
