// Invariantes que a simulacao NUNCA pode quebrar.
//
// Todos falham em silencio: HP negativo desenha uma barra vazia, item negativo
// vira `hasItem` sempre falso, uid repetido faz o upsert do servidor sobrescrever
// um POKE com outro. Nenhum lanca excecao, entao so um teste que roda combate de
// verdade e olha o estado depois pega.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { SPECIES } from '@/data/pokes'
import { buildMapWorld, stepWorld } from './simulation'
import { useGameStateStore } from '@/stores/gameStateStore'

const PASSO = 0.1
const PASSOS = 6000 // 10 minutos de jogo

function cacar(semente: number, mapa: string, nivel: number) {
  const gameState = useGameStateStore.getState()
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', nivel)
  gameState.addPokeToTeam(poke)
  gameState.setActiveIndex(0)
  const world = buildMapWorld(mapa, poke, {
    rng: createRng(semente),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  for (let i = 0; i < PASSOS; i++) stepWorld(world, PASSO, gameState, { silent: true })
  return { world, gameState }
}

describe('invariantes da simulacao', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
    const gameState = useGameStateStore.getState()
    gameState.setAutoToggle('autoCatch', true)
    gameState.setAutoToggle('autoPot', true)
    gameState.setAutoToggle('autoRevive', true)
    gameState.addItem('poke_ball', 5000)
    gameState.addItem('potion', 5000)
    gameState.addItem('revive', 5000)
  })

  it('10 minutos de caçada nao produzem estado invalido', () => {
    const { gameState } = cacar(20260809, 'mata_faixa1', 25)
    const s = useGameStateStore.getState()

    expect(s.wallet.gold).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(s.wallet.gold)).toBe(true)
    expect(s.wallet.diamonds).toBeGreaterThanOrEqual(0)

    for (const [itemId, qtd] of Object.entries(s.items)) {
      expect(qtd, `item ${itemId}`).toBeGreaterThan(0)
      expect(Number.isInteger(qtd), `item ${itemId} inteiro`).toBe(true)
    }

    const todos = [...s.team, ...s.bagPokes]
    expect(todos.length).toBeGreaterThan(1) // sem captura o teste nao provaria nada

    const uids = new Set<string>()
    for (const p of todos) {
      expect(uids.has(p.uid), `uid repetido: ${p.uid}`).toBe(false)
      uids.add(p.uid)
      expect(SPECIES[p.speciesId], `especie desconhecida: ${p.speciesId}`).toBeTruthy()
      expect(p.level).toBeGreaterThanOrEqual(1)
      expect(p.hp).toBeGreaterThanOrEqual(0)
      expect(p.hp, `HP acima do maximo em ${p.speciesId}`).toBeLessThanOrEqual(p.stats.hp)
      expect(p.exp).toBeGreaterThanOrEqual(0)
      for (const [stat, valor] of Object.entries(p.stats)) {
        expect(valor, `stat ${stat} de ${p.speciesId}`).toBeGreaterThan(0)
      }
      for (const [stat, valor] of Object.entries(p.ivs)) {
        expect(valor, `IV ${stat} de ${p.speciesId}`).toBeGreaterThanOrEqual(0)
        expect(valor, `IV ${stat} de ${p.speciesId}`).toBeLessThanOrEqual(31)
      }
    }

    expect(s.activeIndex).toBeGreaterThanOrEqual(0)
    expect(s.activeIndex).toBeLessThan(s.team.length)
    void gameState
  })

  it('a Pokedex so registra especie real e contagem nao-negativa', () => {
    cacar(777001, 'mata_faixa1', 20)
    const s = useGameStateStore.getState()
    const entradas = Object.entries(s.pokedexKills)
    expect(entradas.length).toBeGreaterThan(0)
    for (const [speciesId, entrada] of entradas) {
      expect(SPECIES[speciesId], `pokedex com especie fantasma: ${speciesId}`).toBeTruthy()
      expect(entrada.normal).toBeGreaterThanOrEqual(0)
      expect(entrada.shiny).toBeGreaterThanOrEqual(0)
      expect(entrada.normal + entrada.shiny).toBeGreaterThan(0)
    }
  })

  it('o POKE em campo so aparece uma vez no estado', () => {
    // `addCapturedPoke` empurra pra mochila; se algum caminho capturasse o
    // proprio POKE em campo (ou o duplicasse ao evoluir), so isto pegaria.
    const { world } = cacar(31337, 'mata_faixa1', 30)
    const s = useGameStateStore.getState()
    const ativo = world.player!.poke
    const ocorrencias = [...s.team, ...s.bagPokes].filter((p) => p.uid === ativo.uid).length
    expect(ocorrencias).toBe(1)
  })

  it('inimigo derrotado nunca fica com HP acima de zero na hora do loot', () => {
    const gameState = useGameStateStore.getState()
    const rng = createRng(9090)
    const poke = createPokeInstance(rng, 'charmander', 40)
    gameState.addPokeToTeam(poke)
    gameState.setActiveIndex(0)
    const world = buildMapWorld('mata_faixa1', poke, {
      rng: createRng(9090), counters: { entity: 1, effect: 1, pendingHit: 1 },
    })
    let kills = 0
    for (let i = 0; i < PASSOS; i++) {
      for (const _ of stepWorld(world, PASSO, gameState, { silent: true })) kills++
      for (const inimigo of world.enemies) {
        // `state === 'dead'` e o que marca inimigo abatido (EnemyEntity nao tem
        // `fainted`; o cadaver some pelo `deathRemovalTimer`).
        if (inimigo.state === 'dead') expect(inimigo.poke.hp).toBeLessThanOrEqual(0)
        else expect(inimigo.poke.hp).toBeGreaterThan(0)
      }
    }
    expect(kills).toBeGreaterThan(0)
  })
})
