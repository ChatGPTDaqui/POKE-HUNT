// PH-202/203/225: mini-boss (salas 1-9) e boss ultimate (sala 10) — todo
// bioma em ORDEM_DOS_BIOMAS tem boss (pivo 27/08, ver salaSystem.ts#bossDaSala
// — nao e mais so o piloto igneo). Fecha a quota da sala normalmente, mas o
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
import { bossDaSala, ESPERA_MAXIMA_PELA_AUTORIDADE, SALA_TRANSITION_COUNTDOWN } from './systems/salaSystem'
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

  it('sub-bioma desconhecido (fora dos 12 de ORDEM_DOS_BIOMAS) nao pede boss', () => {
    expect(bossDaSala({ indice: SALAS_POR_HUNT - 1, chave: 'chave-que-nao-existe', abates: 0, ciclos: 0 })).toBeNull()
  })

  it('salas 1-9 de igneo pedem mini-boss', () => {
    for (let indice = 0; indice < SALAS_POR_HUNT - 1; indice++) {
      expect(bossDaSala({ indice, chave: 'volcano', abates: 0, ciclos: 0 })).toBe('mini')
    }
  })

  it('a ultima sala de igneo pede o boss ultimate', () => {
    expect(bossDaSala({ indice: SALAS_POR_HUNT - 1, chave: 'volcano', abates: 0, ciclos: 0 })).toBe('ultimate')
  })

  // PH-225: prova que nao esta hardcoded so pro piloto — 'jungle' e sub-bioma
  // de 'mata' (data/biomas.ts), o SEGUNDO bioma de ORDEM_DOS_BIOMAS.
  it('salas 1-9 de outro bioma (mata) TAMBEM pedem mini-boss', () => {
    for (let indice = 0; indice < SALAS_POR_HUNT - 1; indice++) {
      expect(bossDaSala({ indice, chave: 'jungle', abates: 0, ciclos: 0 })).toBe('mini')
    }
  })

  it('a ultima sala de outro bioma (mata) TAMBEM pede o boss ultimate', () => {
    expect(bossDaSala({ indice: SALAS_POR_HUNT - 1, chave: 'jungle', abates: 0, ciclos: 0 })).toBe('ultimate')
  })
})

// PH-225: bug REAL relatado ao vivo pelo usuario — "boss aparece sozinho, tela
// vazia, sem nenhum mob". Causa: `buildMapWorld` checava so bioma+indice da
// sala (`bossDaSala`), nunca se a quota (30 abates) tinha de fato fechado.
// Mascarado antes por so igneo ter boss habilitado; virou visivel pra
// QUALQUER hunt de bioma assim que os 12 ganharam boss.
describe('buildMapWorld respeita a quota antes de reconstruir o boss (PH-225)', () => {
  it('sala boss-habilitada com quota ABERTA (abates < 30) spawna mob normal, nao boss', () => {
    const poke = createPokeInstance(createRng(60), 'charmander', 20)
    const world = buildMapWorld(
      HUNT, poke,
      { seed: 0, rng: createRng(60), counters: { entity: 1, effect: 1, pendingHit: 1 } },
      { sala: { indice: 0, chave: 'volcano', abates: 0, ciclos: 0 } },
    )
    expect(world.bossPendente).toBeNull()
    expect(world.enemies.length).toBeGreaterThan(0)
    expect(world.enemies.every((e) => !e.isBoss)).toBe(true)
  })

  it('sala boss-habilitada com quota JA FECHADA (abates >= 30) reconstroi o boss, sem mob normal', () => {
    const poke = createPokeInstance(createRng(61), 'charmander', 20)
    const world = buildMapWorld(
      HUNT, poke,
      { seed: 0, rng: createRng(61), counters: { entity: 1, effect: 1, pendingHit: 1 } },
      { sala: { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 } },
    )
    expect(world.bossPendente).not.toBeNull()
    expect(world.enemies.length).toBe(1)
    expect(world.enemies[0].isBoss).toBe(true)
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

  it('boss vivo suspende o respawn de mob comum (nao enche a sala do lado dele)', () => {
    // Achado revisando PH-217: `aliveCount` conta o boss (1) e fica abaixo de
    // `maxEnemies`, entao sem o corte em `!world.bossPendente` o respawn
    // normal enchia a sala de mob comum do lado do boss — o design fala em
    // "spawn normal suspenso ate resolver". `respawnTimer = 0` de proposito
    // (o contrario do resto do arquivo, que usa 999 pra NAO exercitar este
    // caminho) — aqui e exatamente o que se quer testar.
    const world = mundo(55)
    world.sala = { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 0
    const gameState = useGameStateStore.getState()

    // So alguns ticks: o bastante pro boss nascer e o respawn (timer ja
    // zerado) ter chance de disparar no MESMO tick — nao o bastante pro
    // combate real decidir a luta (o alvo aqui e o respawn, nao o resultado
    // do combate).
    for (let i = 0; i < 3; i++) stepWorld(world, 0.1, gameState, { silent: true })

    expect(world.bossPendente).not.toBeNull()
    expect(world.enemies.length).toBe(1)
    expect(world.enemies[0].isBoss).toBe(true)
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

  it('bossPendente.hpAtual acompanha o dano da entidade a cada tick (PH-217)', () => {
    // Sem isto, `hpAtual` fica congelado no HP de spawn: o flush persiste o
    // valor cheio e a proxima janela recria o boss curado. Uma luta longa
    // (varias janelas) nunca fecharia.
    const world = mundo(54)
    world.sala = { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })

    const boss = world.enemies.find((e) => e.isBoss)!
    expect(world.bossPendente!.hpAtual).toBe(boss.poke.hp)

    // Dano fora do combate — o proximo tick tem que espelhar.
    boss.poke.hp = Math.max(1, Math.floor(boss.poke.hp / 3))
    stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })
    expect(world.bossPendente!.hpAtual).toBe(boss.poke.hp)
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

// PH-226: vencer (matar OU capturar) o boss ULTIMATE avanca o indice de
// biomaProgress da faixa — SO se o bioma resolvido for exatamente o proximo
// esperado na ordem canonica. `mata` (HUNT deste arquivo) e o indice 4 de
// ORDEM_DOS_BIOMAS (campo_aberto, subterraneo, marinho, industrial, mata,
// ...).
describe('avanco de biomaProgress ao vencer o boss ultimate (PH-226)', () => {
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
    const boss = world.enemies.find((e) => e.isBoss)!
    handleEnemyDefeated(world, boss, gameState, { silent: true })

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
    const boss = world.enemies.find((e) => e.isBoss)!
    handleEnemyDefeated(world, boss, gameState, { silent: true })

    expect(useGameStateStore.getState().biomaProgress.faixa1).toBe(0)
  })

  it('vencer o MINI-boss (nao ultimate) nao mexe em biomaProgress', () => {
    useGameStateStore.getState().setBiomaProgress('faixa1', INDICE_DE_MATA)
    const world = mundo(72)
    world.sala = { indice: 0, chave: 'jungle', abates: ABATES_POR_SALA, ciclos: 0 } // sala 1, nao 10
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()

    stepWorld(world, 0.1, gameState, { silent: true })
    const boss = world.enemies.find((e) => e.isBoss)!
    handleEnemyDefeated(world, boss, gameState, { silent: true })

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
    const boss = world.enemies.find((e) => e.isBoss)!
    handleEnemyDefeated(world, boss, gameState, { silent: true })

    expect(useGameStateStore.getState().biomaProgress.faixa1).toBe(INDICE_DE_MATA + 1)
    expect(useGameStateStore.getState().biomaProgress.faixa2).toBe(99)
  })
})

// PH-230: o par `bossPendente`/`bossDaSala` nao distingue "boss ainda nao
// nasceu" de "boss ja morreu" — os dois leem `bossPendente: null` numa sala
// que `bossDaSala` continua marcando como boss-habilitada. Sem autoridade isso
// nunca apareceu porque `resolverBossDaSala` arma a transicao no mesmo tick e a
// sala troca. Sob `salaSobAutoridade` ela NAO troca (so o servidor decide), e o
// tick seguinte relia "esta sala pede boss, nao ha boss" e sorteava outro.
//
// O estrago nao era so o gauntlet infinito na tela: o `garantirBossDaSala?.()`
// de `garantirTransicaoDeQuotaFechada` retornava true pra sempre, e o
// early-return dele acontecia ANTES do bloco de espera da autoridade — entao
// `salaEsperaDaAutoridade` nunca acumulava e o fallback de predicao local
// (a rede de seguranca contra servidor mudo/antigo) ficava morto.
describe('boss resolvido sob autoridade nao respawna (PH-230)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  /**
   * Fecha a quota numa sala boss-habilitada sob autoridade, deixa o boss
   * nascer e o mata. Devolve o mundo logo depois do abate do boss.
   */
  function bossCaidoSobAutoridade(semente: number): WorldState {
    const world = mundo(semente)
    world.salaSobAutoridade = true
    world.sala = { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()

    stepWorld(world, 0.1, gameState, { silent: true })
    const boss = world.enemies.find((e) => e.isBoss)
    expect(boss).toBeDefined()
    handleEnemyDefeated(world, boss!, gameState, { silent: true })
    world.enemies = world.enemies.filter((e) => e !== boss)
    return world
  }

  it('sob autoridade, matar o boss NAO arma a transicao — mas tambem nao faz nascer outro', () => {
    const world = bossCaidoSobAutoridade(60)
    const gameState = useGameStateStore.getState()

    // O contrato de `resolverBossDaSala` sob autoridade continua o de sempre:
    // quem decide a proxima sala e o flush do servidor, nao o cliente.
    expect(world.salaPendente).toBeNull()
    expect(world.salaCountdownRemaining).toBeNull()
    expect(world.bossResolvido).toBe(true)

    // O bug: cada um destes ticks sorteava um boss novo.
    for (let i = 0; i < 30; i++) {
      stepWorld(world, 0.1, gameState, { silent: true })
      expect(world.bossPendente).toBeNull()
      expect(world.enemies.some((e) => e.isBoss)).toBe(false)
    }
  })

  it('boss resolvido + servidor que nao responde: o fallback de predicao local ainda dispara', () => {
    const world = bossCaidoSobAutoridade(61)
    const gameState = useGameStateStore.getState()
    const inicio = world.sala!.indice

    // Nenhuma `reconciliarSalaDaAutoridade` aqui de proposito: e exatamente o
    // servidor mudo (ou de versao antiga, sem `garantirTransicaoDeQuotaFechada`)
    // que o fallback existe pra cobrir.
    const ticks = Math.floor((ESPERA_MAXIMA_PELA_AUTORIDADE + SALA_TRANSITION_COUNTDOWN + 1) / 0.1)
    for (let i = 0; i < ticks; i++) stepWorld(world, 0.1, gameState, { silent: true })

    expect(world.sala!.indice).toBe(inicio + 1)
    expect(world.salaPredita).toBe(true)
    // Sala nova, marca zerada: o proximo boss desta hunt tem que poder nascer.
    expect(world.bossResolvido).toBe(false)
  })

  it('sem autoridade, matar o boss segue armando a transicao no mesmo tick (nao regrediu)', () => {
    const world = mundo(62)
    world.sala = { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()

    stepWorld(world, 0.1, gameState, { silent: true })
    const boss = world.enemies.find((e) => e.isBoss)!
    handleEnemyDefeated(world, boss, gameState, { silent: true })

    expect(world.salaPendente).not.toBeNull()
    expect(world.salaCountdownRemaining).not.toBeNull()
  })
})
