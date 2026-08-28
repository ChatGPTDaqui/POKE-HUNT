// PH-202/203/225/236: Guardian (salas 1-9) e Lord (sala 10) — todo bioma em
// ORDEM_DOS_BIOMAS tem protetor (pivo 27/08, ver salaSystem.ts#protetorDaSala
// — nao e mais so o piloto igneo). Fecha a quota da sala normalmente, mas o
// AVANCO fica bloqueado ate o protetor ser resolvido (morto ou capturado) —
// sem escape automatico, ver design em `_Architecture.md` (16/08).
//
// `protetorDaSala` decide QUAL protetor a sala pede so pela chave do
// sub-bioma — forcar `world.sala.chave = 'volcano'` direto (bypassando o
// grafo de sub-biomas da hunt) e o mesmo padrao que `salas.test.ts` ja usa
// pra 'jungle' em `mata_faixa1`: a chave nao precisa ser alcancavel de
// verdade pelo sorteio daquela hunt pra exercitar a logica.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld, handleEnemyDefeated } from './simulation'
import { protetorDaSala } from './systems/salaSystem'
import { ABATES_POR_SALA, SALAS_POR_HUNT } from '@/data/biomas'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { WorldState, ProtetorPendente } from './types'

const HUNT = 'mata_faixa1'

function mundo(semente: number): WorldState {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', 20)
  return buildMapWorld(HUNT, poke, { seed: 0, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 } })
}

describe('protetorDaSala (logica pura)', () => {
  it('sem sala, nao pede protetor', () => {
    expect(protetorDaSala(null)).toBeNull()
  })

  it('sub-bioma desconhecido (fora dos 12 de ORDEM_DOS_BIOMAS) nao pede protetor', () => {
    expect(protetorDaSala({ indice: SALAS_POR_HUNT - 1, chave: 'chave-que-nao-existe', abates: 0, ciclos: 0 })).toBeNull()
  })

  it('salas 1-9 de igneo pedem Guardian', () => {
    for (let indice = 0; indice < SALAS_POR_HUNT - 1; indice++) {
      expect(protetorDaSala({ indice, chave: 'volcano', abates: 0, ciclos: 0 })).toBe('guardian')
    }
  })

  it('a ultima sala de igneo pede o Lord', () => {
    expect(protetorDaSala({ indice: SALAS_POR_HUNT - 1, chave: 'volcano', abates: 0, ciclos: 0 })).toBe('lord')
  })

  // PH-225: prova que nao esta hardcoded so pro piloto — 'jungle' e sub-bioma
  // de 'mata' (data/biomas.ts), o SEGUNDO bioma de ORDEM_DOS_BIOMAS.
  it('salas 1-9 de outro bioma (mata) TAMBEM pedem Guardian', () => {
    for (let indice = 0; indice < SALAS_POR_HUNT - 1; indice++) {
      expect(protetorDaSala({ indice, chave: 'jungle', abates: 0, ciclos: 0 })).toBe('guardian')
    }
  })

  it('a ultima sala de outro bioma (mata) TAMBEM pede o Lord', () => {
    expect(protetorDaSala({ indice: SALAS_POR_HUNT - 1, chave: 'jungle', abates: 0, ciclos: 0 })).toBe('lord')
  })
})

// PH-225: bug REAL relatado ao vivo pelo usuario — "protetor aparece
// sozinho, tela vazia, sem nenhum mob". Causa: `buildMapWorld` checava so
// bioma+indice da sala (`protetorDaSala`), nunca se a quota (30 abates)
// tinha de fato fechado. Mascarado antes por so igneo ter protetor
// habilitado; virou visivel pra QUALQUER hunt de bioma assim que os 12
// ganharam protetor.
describe('buildMapWorld respeita a quota antes de reconstruir o protetor (PH-225)', () => {
  it('sala com protetor habilitado e quota ABERTA (abates < 30) spawna mob normal, nao protetor', () => {
    const poke = createPokeInstance(createRng(60), 'charmander', 20)
    const world = buildMapWorld(
      HUNT, poke,
      { seed: 0, rng: createRng(60), counters: { entity: 1, effect: 1, pendingHit: 1 } },
      { sala: { indice: 0, chave: 'volcano', abates: 0, ciclos: 0 } },
    )
    expect(world.protetorPendente).toBeNull()
    expect(world.enemies.length).toBeGreaterThan(0)
    expect(world.enemies.every((e) => !e.isProtetor)).toBe(true)
  })

  it('sala com protetor habilitado e quota JA FECHADA (abates >= 30) reconstroi o protetor, sem mob normal', () => {
    const poke = createPokeInstance(createRng(61), 'charmander', 20)
    const world = buildMapWorld(
      HUNT, poke,
      { seed: 0, rng: createRng(61), counters: { entity: 1, effect: 1, pendingHit: 1 } },
      { sala: { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 } },
    )
    expect(world.protetorPendente).not.toBeNull()
    expect(world.enemies.length).toBe(1)
    expect(world.enemies[0].isProtetor).toBe(true)
  })
})

describe('protetor bloqueia o avanco de sala (PH-202)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('quota fechada numa sala do bioma piloto nao avanca sozinha — nasce um protetor em vez disso', () => {
    const world = mundo(50)
    world.sala = { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()

    for (let i = 0; i < 60; i++) stepWorld(world, 0.1, gameState, { silent: true })

    expect(world.sala!.indice).toBe(0)
    expect(world.salaPendente).toBeNull()
    expect(world.salaCountdownRemaining).toBeNull()
    expect(world.protetorPendente).not.toBeNull()
    expect(world.enemies.length).toBe(1)
    expect(world.enemies[0].isProtetor).toBe(true)
    // IV minimo 20 (vs. 0 do rollIvs padrao) — a decisao de forca do protetor.
    for (const iv of Object.values(world.protetorPendente!.ivs)) {
      expect(iv).toBeGreaterThanOrEqual(20)
    }
  })

  it('protetor vivo suspende o respawn de mob comum (nao enche a sala do lado dele)', () => {
    // Achado revisando PH-217: `aliveCount` conta o protetor (1) e fica
    // abaixo de `maxEnemies`, entao sem o corte em `!world.protetorPendente`
    // o respawn normal enchia a sala de mob comum do lado do protetor — o
    // design fala em "spawn normal suspenso ate resolver". `respawnTimer = 0`
    // de proposito (o contrario do resto do arquivo, que usa 999 pra NAO
    // exercitar este caminho) — aqui e exatamente o que se quer testar.
    const world = mundo(55)
    world.sala = { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 0
    const gameState = useGameStateStore.getState()

    // So alguns ticks: o bastante pro protetor nascer e o respawn (timer ja
    // zerado) ter chance de disparar no MESMO tick — nao o bastante pro
    // combate real decidir a luta (o alvo aqui e o respawn, nao o resultado
    // do combate).
    for (let i = 0; i < 3; i++) stepWorld(world, 0.1, gameState, { silent: true })

    expect(world.protetorPendente).not.toBeNull()
    expect(world.enemies.length).toBe(1)
    expect(world.enemies[0].isProtetor).toBe(true)
  })

  it('sala 10 do bioma piloto pede o LORD, no teto da faixa (nao so da janela)', () => {
    const world = mundo(51)
    world.sala = { indice: SALAS_POR_HUNT - 1, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()

    for (let i = 0; i < 60; i++) stepWorld(world, 0.1, gameState, { silent: true })

    expect(world.protetorPendente).not.toBeNull()
    expect(world.enemies[0].poke.level).toBe(world.mapDef!.levelRange[1])
  })

  it('matar o protetor libera o avanco de sala de novo', () => {
    const world = mundo(52)
    world.sala = { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()

    stepWorld(world, 0.1, gameState, { silent: true })
    expect(world.protetorPendente).not.toBeNull()
    const protetor = world.enemies.find((e) => e.isProtetor)!

    handleEnemyDefeated(world, protetor, gameState, { silent: true })
    expect(world.protetorPendente).toBeNull()

    world.enemies = world.enemies.filter((e) => e !== protetor)
    for (let i = 0; i < 60; i++) stepWorld(world, 0.1, gameState, { silent: true })

    expect(world.sala!.indice).toBe(1)
    expect(world.protetorPendente).toBeNull()
  })

  it('protetorPendente.hpAtual acompanha o dano da entidade a cada tick (PH-217)', () => {
    // Sem isto, `hpAtual` fica congelado no HP de spawn: o flush persiste o
    // valor cheio e a proxima janela recria o protetor curado. Uma luta
    // longa (varias janelas) nunca fecharia.
    const world = mundo(54)
    world.sala = { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })

    const protetor = world.enemies.find((e) => e.isProtetor)!
    expect(world.protetorPendente!.hpAtual).toBe(protetor.poke.hp)

    // Dano fora do combate — o proximo tick tem que espelhar.
    protetor.poke.hp = Math.max(1, Math.floor(protetor.poke.hp / 3))
    stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })
    expect(world.protetorPendente!.hpAtual).toBe(protetor.poke.hp)
  })

  it('a reconstrucao do mundo recria o protetor FIEL (zero RNG extra) em vez de sortear outro', () => {
    const world = mundo(53)
    world.sala = { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })

    const protetorOriginal = world.protetorPendente!
    // HP parcial: a luta ja tinha acontecido nesta sessao antes do flush.
    const protetorSalvo: ProtetorPendente = { ...protetorOriginal, hpAtual: 1 }

    // Semente DIFERENTE de proposito — se a reconstrucao rolasse RNG de novo
    // pra recriar o protetor, uma semente diferente provaria (especie/ivs/
    // raridade diferentes). A prova de fidelidade e o resultado ser IGUAL
    // mesmo assim.
    const poke = createPokeInstance(createRng(999), 'charmander', 20)
    const reconstruido = buildMapWorld(
      HUNT, poke,
      { seed: 0, rng: createRng(999), counters: { entity: 1, effect: 1, pendingHit: 1 } },
      { sala: world.sala!, protetorPendente: protetorSalvo },
    )

    expect(reconstruido.enemies.length).toBe(1)
    const enemy = reconstruido.enemies[0]
    expect(enemy.isProtetor).toBe(true)
    expect(enemy.poke.uid).toBe(protetorOriginal.uid)
    expect(enemy.poke.speciesId).toBe(protetorOriginal.speciesId)
    expect(enemy.poke.level).toBe(protetorOriginal.level)
    expect(enemy.poke.ivs).toEqual(protetorOriginal.ivs)
    expect(enemy.poke.rarity).toBe(protetorOriginal.rarity)
    expect(enemy.poke.isShiny).toBe(protetorOriginal.isShiny)
    expect(enemy.poke.nature).toBe(protetorOriginal.nature)
    expect(enemy.poke.trait).toBe(protetorOriginal.trait)
    // HP e o unico campo que a reconstrucao aplica por cima — o resto vem
    // fielmente do que foi persistido, nao de um novo sorteio.
    expect(enemy.poke.hp).toBe(1)
    expect(reconstruido.protetorPendente).toEqual(protetorSalvo)
  })
})

// PH-226/236: vencer (matar OU capturar) o LORD avanca o indice de
// biomaProgress da faixa — SO se o bioma resolvido for exatamente o proximo
// esperado na ordem canonica. `mata` (HUNT deste arquivo) e o indice 4 de
// ORDEM_DOS_BIOMAS (campo_aberto, subterraneo, marinho, industrial, mata,
// ...).
describe('avanco de biomaProgress ao vencer o Lord (PH-226)', () => {
  const INDICE_DE_MATA = 4

  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('bioma esperado (indice bate com biomaProgress atual): avanca +1', () => {
    useGameStateStore.getState().setBiomaProgress('faixa1', INDICE_DE_MATA)
    const world = mundo(70)
    world.sala = { indice: SALAS_POR_HUNT - 1, chave: 'jungle', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()

    stepWorld(world, 0.1, gameState, { silent: true })
    const protetor = world.enemies.find((e) => e.isProtetor)!
    handleEnemyDefeated(world, protetor, gameState, { silent: true })

    expect(useGameStateStore.getState().biomaProgress.faixa1).toBe(INDICE_DE_MATA + 1)
  })

  it('bioma fora de ordem (biomaProgress nao bate): NAO avanca — defesa em profundidade', () => {
    useGameStateStore.getState().setBiomaProgress('faixa1', 0) // esperava campo_aberto, nao mata
    const world = mundo(71)
    world.sala = { indice: SALAS_POR_HUNT - 1, chave: 'jungle', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()

    stepWorld(world, 0.1, gameState, { silent: true })
    const protetor = world.enemies.find((e) => e.isProtetor)!
    handleEnemyDefeated(world, protetor, gameState, { silent: true })

    expect(useGameStateStore.getState().biomaProgress.faixa1).toBe(0)
  })

  it('vencer o GUARDIAN (nao Lord) nao mexe em biomaProgress', () => {
    useGameStateStore.getState().setBiomaProgress('faixa1', INDICE_DE_MATA)
    const world = mundo(72)
    world.sala = { indice: 0, chave: 'jungle', abates: ABATES_POR_SALA, ciclos: 0 } // sala 1, nao 10
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()

    stepWorld(world, 0.1, gameState, { silent: true })
    const protetor = world.enemies.find((e) => e.isProtetor)!
    handleEnemyDefeated(world, protetor, gameState, { silent: true })

    expect(useGameStateStore.getState().biomaProgress.faixa1).toBe(INDICE_DE_MATA)
  })

  it('faixa errada (biomaProgress.faixa2 nao e tocado por uma hunt de faixa1)', () => {
    useGameStateStore.getState().setBiomaProgress('faixa1', INDICE_DE_MATA)
    useGameStateStore.getState().setBiomaProgress('faixa2', 99)
    const world = mundo(73)
    world.sala = { indice: SALAS_POR_HUNT - 1, chave: 'jungle', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()

    stepWorld(world, 0.1, gameState, { silent: true })
    const protetor = world.enemies.find((e) => e.isProtetor)!
    handleEnemyDefeated(world, protetor, gameState, { silent: true })

    expect(useGameStateStore.getState().biomaProgress.faixa1).toBe(INDICE_DE_MATA + 1)
    expect(useGameStateStore.getState().biomaProgress.faixa2).toBe(99)
  })
})
