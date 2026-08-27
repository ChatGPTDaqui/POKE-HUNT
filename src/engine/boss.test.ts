// PH-202/203: mini-boss (salas 1-9) e boss ultimate (sala 10) do bioma piloto
// (`BIOMA_PILOTO_BOSS = 'igneo'`). Fecha a quota da sala normalmente, mas o
// AVANCO fica bloqueado ate o boss ser resolvido (morto ou capturado) — sem
// escape automatico, ver design em `_Architecture.md` (16/08).
//
// `bossDaSala` decide QUAL boss a sala pede so pela chave do sub-bioma —
// forcar `world.sala.chave = 'volcano'` direto (bypassando o grafo de
// sub-biomas da hunt) e o mesmo padrao que `salas.test.ts` ja usa pra 'jungle'
// em `mata_faixa1`: a chave nao precisa ser alcancavel de verdade pelo
// sorteio daquela hunt pra exercitar a logica.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld, handleEnemyDefeated } from './simulation'
import { bossDaSala } from './systems/salaSystem'
import { ABATES_POR_SALA, SALAS_POR_HUNT } from '@/data/biomas'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { WorldState, BossPendente } from './types'

const HUNT = 'mata_faixa1'

function mundo(semente: number): WorldState {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', 20)
  return buildMapWorld(HUNT, poke, { seed: 0, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 } })
}

describe('bossDaSala (logica pura)', () => {
  it('sem sala, nao pede boss', () => {
    expect(bossDaSala(null)).toBeNull()
  })

  it('bioma fora do piloto nao pede boss, mesmo na ultima sala', () => {
    expect(bossDaSala({ indice: SALAS_POR_HUNT - 1, chave: 'jungle', abates: 0, ciclos: 0 })).toBeNull()
  })

  it('salas 1-9 do bioma piloto pedem mini-boss', () => {
    for (let indice = 0; indice < SALAS_POR_HUNT - 1; indice++) {
      expect(bossDaSala({ indice, chave: 'volcano', abates: 0, ciclos: 0 })).toBe('mini')
    }
  })

  it('a ultima sala do bioma piloto pede o boss ultimate', () => {
    expect(bossDaSala({ indice: SALAS_POR_HUNT - 1, chave: 'volcano', abates: 0, ciclos: 0 })).toBe('ultimate')
  })
})

describe('boss bloqueia o avanco de sala (PH-202)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('quota fechada numa sala do bioma piloto nao avanca sozinha — nasce um boss em vez disso', () => {
    const world = mundo(50)
    world.sala = { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()

    for (let i = 0; i < 60; i++) stepWorld(world, 0.1, gameState, { silent: true })

    expect(world.sala!.indice).toBe(0)
    expect(world.salaPendente).toBeNull()
    expect(world.salaCountdownRemaining).toBeNull()
    expect(world.bossPendente).not.toBeNull()
    expect(world.enemies.length).toBe(1)
    expect(world.enemies[0].isBoss).toBe(true)
    // IV minimo 20 (vs. 0 do rollIvs padrao) — a decisao de forca do boss.
    for (const iv of Object.values(world.bossPendente!.ivs)) {
      expect(iv).toBeGreaterThanOrEqual(20)
    }
  })

  it('sala 10 do bioma piloto pede o boss ULTIMATE, no teto da faixa (nao so da janela)', () => {
    const world = mundo(51)
    world.sala = { indice: SALAS_POR_HUNT - 1, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()

    for (let i = 0; i < 60; i++) stepWorld(world, 0.1, gameState, { silent: true })

    expect(world.bossPendente).not.toBeNull()
    expect(world.enemies[0].poke.level).toBe(world.mapDef!.levelRange[1])
  })

  it('matar o boss libera o avanco de sala de novo', () => {
    const world = mundo(52)
    world.sala = { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()

    stepWorld(world, 0.1, gameState, { silent: true })
    expect(world.bossPendente).not.toBeNull()
    const boss = world.enemies.find((e) => e.isBoss)!

    handleEnemyDefeated(world, boss, gameState, { silent: true })
    expect(world.bossPendente).toBeNull()

    world.enemies = world.enemies.filter((e) => e !== boss)
    for (let i = 0; i < 60; i++) stepWorld(world, 0.1, gameState, { silent: true })

    expect(world.sala!.indice).toBe(1)
    expect(world.bossPendente).toBeNull()
  })

  it('a reconstrucao do mundo recria o boss FIEL (zero RNG extra) em vez de sortear outro', () => {
    const world = mundo(53)
    world.sala = { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })

    const bossOriginal = world.bossPendente!
    // HP parcial: a luta ja tinha acontecido nesta sessao antes do flush.
    const bossSalvo: BossPendente = { ...bossOriginal, hpAtual: 1 }

    // Semente DIFERENTE de proposito — se a reconstrucao rolasse RNG de novo
    // pra recriar o boss, uma semente diferente provaria (especie/ivs/raridade
    // diferentes). A prova de fidelidade e o resultado ser IGUAL mesmo assim.
    const poke = createPokeInstance(createRng(999), 'charmander', 20)
    const reconstruido = buildMapWorld(
      HUNT, poke,
      { seed: 0, rng: createRng(999), counters: { entity: 1, effect: 1, pendingHit: 1 } },
      { sala: world.sala!, bossPendente: bossSalvo },
    )

    expect(reconstruido.enemies.length).toBe(1)
    const enemy = reconstruido.enemies[0]
    expect(enemy.isBoss).toBe(true)
    expect(enemy.poke.uid).toBe(bossOriginal.uid)
    expect(enemy.poke.speciesId).toBe(bossOriginal.speciesId)
    expect(enemy.poke.level).toBe(bossOriginal.level)
    expect(enemy.poke.ivs).toEqual(bossOriginal.ivs)
    expect(enemy.poke.rarity).toBe(bossOriginal.rarity)
    expect(enemy.poke.isShiny).toBe(bossOriginal.isShiny)
    expect(enemy.poke.nature).toBe(bossOriginal.nature)
    expect(enemy.poke.trait).toBe(bossOriginal.trait)
    // HP e o unico campo que a reconstrucao aplica por cima — o resto vem
    // fielmente do que foi persistido, nao de um novo sorteio.
    expect(enemy.poke.hp).toBe(1)
    expect(reconstruido.bossPendente).toEqual(bossSalvo)
  })
})
