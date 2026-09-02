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
import {
  protetorDaSala, ESPERA_MAXIMA_PELA_AUTORIDADE, SALA_TRANSITION_COUNTDOWN,
} from './systems/salaSystem'
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

// PH-230: o par `protetorPendente`/`protetorDaSala` nao distingue "protetor
// ainda nao nasceu" de "protetor ja morreu" — os dois leem `protetorPendente:
// null` numa sala que `protetorDaSala` continua marcando como
// protetor-habilitada. Sem autoridade isso nunca apareceu porque
// `resolverProtetorDaSala` arma a transicao no mesmo tick e a sala troca. Sob
// `salaSobAutoridade` ela NAO troca (so o servidor decide), e o tick seguinte
// relia "esta sala pede protetor, nao ha protetor" e sorteava outro.
//
// O estrago nao era so o gauntlet infinito na tela: o `garantirProtetorDaSala?.()`
// de `garantirTransicaoDeQuotaFechada` retornava true pra sempre, e o
// early-return dele acontecia ANTES do bloco de espera da autoridade — entao
// `salaEsperaDaAutoridade` nunca acumulava e o fallback de predicao local
// (a rede de seguranca contra servidor mudo/antigo) ficava morto.
describe('protetor resolvido sob autoridade nao respawna (PH-230)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  /**
   * Fecha a quota numa sala protetor-habilitada sob autoridade, deixa o
   * protetor nascer e o mata. Devolve o mundo logo depois do abate.
   */
  function protetorCaidoSobAutoridade(semente: number): WorldState {
    const world = mundo(semente)
    world.salaSobAutoridade = true
    world.sala = { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()

    stepWorld(world, 0.1, gameState, { silent: true })
    const protetor = world.enemies.find((e) => e.isProtetor)
    expect(protetor).toBeDefined()
    handleEnemyDefeated(world, protetor!, gameState, { silent: true })
    world.enemies = world.enemies.filter((e) => e !== protetor)
    return world
  }

  it('sob autoridade, matar o protetor NAO arma a transicao — mas tambem nao faz nascer outro', () => {
    const world = protetorCaidoSobAutoridade(60)
    const gameState = useGameStateStore.getState()

    // O contrato de `resolverProtetorDaSala` sob autoridade continua o de
    // sempre: quem decide a proxima sala e o flush do servidor, nao o cliente.
    expect(world.salaPendente).toBeNull()
    expect(world.salaCountdownRemaining).toBeNull()
    expect(world.protetorResolvido).toBe(true)

    // O bug: cada um destes ticks sorteava um protetor novo.
    for (let i = 0; i < 30; i++) {
      stepWorld(world, 0.1, gameState, { silent: true })
      expect(world.protetorPendente).toBeNull()
      expect(world.enemies.some((e) => e.isProtetor)).toBe(false)
    }
  })

  it('protetor resolvido + servidor que nao responde: o fallback de predicao local ainda dispara', () => {
    const world = protetorCaidoSobAutoridade(61)
    const gameState = useGameStateStore.getState()
    const inicio = world.sala!.indice

    // Nenhuma `reconciliarSalaDaAutoridade` aqui de proposito: e exatamente o
    // servidor mudo (ou de versao antiga, sem `garantirTransicaoDeQuotaFechada`)
    // que o fallback existe pra cobrir.
    const ticks = Math.floor((ESPERA_MAXIMA_PELA_AUTORIDADE + SALA_TRANSITION_COUNTDOWN + 1) / 0.1)
    for (let i = 0; i < ticks; i++) stepWorld(world, 0.1, gameState, { silent: true })

    expect(world.sala!.indice).toBe(inicio + 1)
    expect(world.salaPredita).toBe(true)
    // Sala nova, marca zerada: o proximo protetor desta hunt tem que poder nascer.
    expect(world.protetorResolvido).toBe(false)
  })

  it('sem autoridade, matar o protetor segue armando a transicao no mesmo tick (nao regrediu)', () => {
    const world = mundo(62)
    world.sala = { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()

    stepWorld(world, 0.1, gameState, { silent: true })
    const protetor = world.enemies.find((e) => e.isProtetor)!
    handleEnemyDefeated(world, protetor, gameState, { silent: true })

    expect(world.salaPendente).not.toBeNull()
    expect(world.salaCountdownRemaining).not.toBeNull()
  })
})

// PH-423: O LIVELOCK DA SALA QUE NUNCA AVANCA.
//
// O servidor reconstroi o mundo a cada janela de flush e a posicao NAO e
// persistida (so identidade e `hpAtual`). Enquanto o protetor RETOMADO nascia no
// mesmo cone de 250-550px de um protetor novo, toda janela curta repetia a mesma
// aproximacao parcial e era descartada antes do contato:
//
//   nasce a 250-550px -> persegue -> janela fecha a ~114px -> mundo descartado
//   -> nasce a 250-550px de novo, rng restaurado, geometria identica
//
// `engageRangeFor` e ~39px, entao 114px nunca virava luta. Sonda de 46 janelas
// seguidas numa sala travada: `dist=114` IDENTICO em todas, os dois em `chase` e
// nunca `engaged`, `hpAtual` congelado em 33 — "caiu 0". Medido em
// scripts/harness/troca-de-sala-sob-autoridade.mjs: com janela de 30s (o padrao
// de producao) 3 salas em 120 NUNCA avancavam; com o conserto, zero.
//
// O cao de guarda do impasse (PH-301) nao cobre isto de proposito — ele so conta
// tempo com os dois ENGAJADOS, pra nao trocar o protetor durante a caminhada
// legitima, e perseguicao que nao converge fica no ponto cego dele.
describe('protetor retomado nasce em alcance de combate (PH-423)', () => {
  /** Copia de `engageRangeFor` (combatSystem): raio + raio + MELEE_RANGE_PADDING. */
  const alcanceDeCombate = (a: { radius: number }, b: { radius: number }) => a.radius + b.radius + 10

  function reconstruirComProtetorSalvo(semente: number) {
    const world = mundo(semente)
    world.sala = { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })
    const protetorSalvo: ProtetorPendente = { ...world.protetorPendente!, hpAtual: 5 }

    const poke = createPokeInstance(createRng(semente), 'charmander', 20)
    const reconstruido = buildMapWorld(
      HUNT, poke,
      { seed: 0, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 } },
      { sala: world.sala!, protetorPendente: protetorSalvo },
    )
    return { reconstruido, protetorSalvo }
  }

  it('o protetor retomado nasce perto o bastante pra a luta comecar', () => {
    // Varias sementes porque a posicao depende do facing e da grade de colisao:
    // uma semente so poderia passar por acidente.
    for (const semente of [53, 71, 97, 131, 199]) {
      const { reconstruido } = reconstruirComProtetorSalvo(semente)
      const protetor = reconstruido.enemies.find((e) => e.isProtetor)!
      const jogador = reconstruido.player!
      const dist = Math.hypot(protetor.x - jogador.x, protetor.y - jogador.y)
      const alcance = alcanceDeCombate(jogador, protetor)

      // O NUMERO QUE IMPORTA: dentro do alcance de combate. O comportamento
      // antigo (cone de 250-550px) reprova aqui com uma ordem de grandeza de
      // folga — sabotar `pontoEmAlcanceDeCombate` pra devolver o ponto de spawn
      // deixa este caso vermelho.
      expect(dist, `semente ${semente}: ${dist.toFixed(0)}px de ${alcance}px`)
        .toBeLessThanOrEqual(alcance)
      // E NAO sobreposto: duas entidades no mesmo ponto fazem o passo de
      // separacao de movementSystem empurrar as duas.
      expect(dist, `semente ${semente} colado no jogador`).toBeGreaterThan(0)
    }
  })

  it('a retomada continua consumindo ZERO rng — a fidelidade da PH-217 nao regride', () => {
    // A primeira versao deste conserto sorteava o angulo com `randRange`, o que
    // desloca `rng_state` a cada reconstrucao e muda tudo que vem depois. Duas
    // reconstrucoes com a MESMA semente tem que dar exatamente o mesmo mundo.
    const a = reconstruirComProtetorSalvo(53)
    const b = reconstruirComProtetorSalvo(53)
    const pa = a.reconstruido.enemies.find((e) => e.isProtetor)!
    const pb = b.reconstruido.enemies.find((e) => e.isProtetor)!
    expect({ x: pa.x, y: pa.y }).toEqual({ x: pb.x, y: pb.y })
    expect(a.reconstruido.rng.draws).toBe(b.reconstruido.rng.draws)
    // E a identidade segue vindo do que foi persistido, nao de sorteio novo.
    expect(pa.poke.uid).toBe(a.protetorSalvo.uid)
    expect(pa.poke.hp).toBe(5)
  })

  it('protetor NOVO continua nascendo longe — o conserto e so pra retomada', () => {
    // Protecao contra o conserto vazar pro caso geral: se protetor novo passasse
    // a nascer colado, a chegada dele na tela mudaria e o jogador perderia o
    // aviso visual de que algo entrou em campo.
    const world = mundo(53)
    world.sala = { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })

    const protetor = world.enemies.find((e) => e.isProtetor)!
    const jogador = world.player!
    const dist = Math.hypot(protetor.x - jogador.x, protetor.y - jogador.y)
    expect(dist).toBeGreaterThan(alcanceDeCombate(jogador, protetor))
  })
})
