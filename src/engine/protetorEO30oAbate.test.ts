// PH-473 — o protetor E o 30o abate da sala, e nenhum comum nasce depois do 29o.
//
// O QUE MUDOU, E O SINTOMA QUE ISSO APAGA. A quota eram 30 abates COMUNS e o
// Guardian (ou o Lord, na ultima sala) nascia depois dela: o abate dele era um
// 31o que a barra do HUD nao tinha onde contar. O que o jogador via era a barra
// em 30/30 e a sala parada — ele lia "completei a sala e ela travou", e o relato
// chegou nessas palavras.
//
// Agora a quota de comuns e 29, a barra para em 29/30 com o protetor em campo
// ("falta o chefe"), e o abate dele fecha os 30 no mesmo instante em que fecha a
// sala.
//
// A SEGUNDA METADE DA REGRA e o que nao nasce mais. O gate de respawn suspendia
// o repovoamento com protetor VIVO em campo (`!protetorPendente`), e sobravam
// duas frestas: o tick entre o 29o abate e o spawn do protetor, e o caminho sob
// autoridade, onde o protetor que decide e o do servidor e pode nao haver
// espelho local. `comunsEsgotados` fecha as duas pela CONTAGEM, que e o que
// atravessa janela de flush.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { ABATES_COMUNS_POR_SALA, ABATES_POR_SALA } from '@/data/biomas'
import { estagioId, quantidadeDeSalas } from '@/data/estagios'
import { progressoPorBiomaDefault } from '@/data/progressoDeBioma'
import { useGameStateStore } from '@/stores/gameStateStore'
import { buildMapWorld, handleEnemyDefeated, stepWorld } from './simulation'
import {
  comunsEsgotados, protetorDaSala, quotaDeAbatesDaSala, registrarAbate,
  salaDeveProtetor,
} from './systems/salaSystem'
import { STARTER_HUNT_ID } from '@/data/huntSpawnOverrides'
import type { WorldState } from './types'

const HUNT = estagioId('mata', 1)

function mundo(semente: number, progresso = progressoPorBiomaDefault()): WorldState {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', 20)
  return buildMapWorld(HUNT, poke, {
    seed: 0, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 },
  }, undefined, undefined, progresso)
}

/** Conta N abates comuns sem passar pelo combate. */
function abaterComuns(world: WorldState, quantos: number) {
  for (let i = 0; i < quantos; i++) registrarAbate(world, world.mapDef!.id)
}

function comuns(world: WorldState) {
  return world.enemies.filter((e) => !e.isProtetor)
}

describe('a quota de comuns e 29, e o protetor e o 30o', () => {
  beforeEach(() => { useGameStateStore.getState().resetToDefaults() })

  it('a barra para em 29/30 com o protetor em campo, e nao em 30/30', () => {
    const world = mundo(101)
    // Guarda anti-vacuo: esta sala PEDE protetor. Sem isso o caso mediria uma
    // sala sem chefe e passaria dizendo o contrario do que afirma.
    expect(protetorDaSala(world.sala, HUNT)).toBe('guardian')
    expect(salaDeveProtetor(world.sala, HUNT, world)).toBe(true)
    expect(quotaDeAbatesDaSala(world.sala, HUNT, world)).toBe(ABATES_COMUNS_POR_SALA)

    abaterComuns(world, ABATES_COMUNS_POR_SALA)
    expect(world.sala!.abates).toBe(ABATES_COMUNS_POR_SALA)
    expect(world.sala!.abates).toBe(29)
    // A sala nao avancou: falta o chefe.
    expect(world.salaCountdownRemaining).toBeNull()
    expect(world.salaPendente).toBeNull()

    // Abate comum a mais nao empurra a barra pra 30 — o 30o e do chefe.
    abaterComuns(world, 5)
    expect(world.sala!.abates).toBe(ABATES_COMUNS_POR_SALA)
  })

  it('o abate do protetor fecha os 30 E arma a transicao', () => {
    const world = mundo(102)
    const gameState = useGameStateStore.getState()
    abaterComuns(world, ABATES_COMUNS_POR_SALA)

    // Um tick faz o protetor nascer (o motor cria a entidade em `stepWorld`).
    stepWorld(world, 0.1, gameState, { silent: true })
    const protetor = world.enemies.find((e) => e.isProtetor)
    expect(protetor, 'o protetor nao nasceu com a quota de comuns fechada').toBeTruthy()

    handleEnemyDefeated(world, protetor!, gameState, { silent: true })
    registrarAbate(world, world.mapDef!.id)

    expect(world.sala!.abates).toBe(ABATES_POR_SALA)
    expect(world.sala!.abates).toBe(30)
    expect(world.salaPendente, 'a sala nao avancou depois do chefe').not.toBeNull()
  })

  // LEIA A NOTA ANTES DE CONFIAR NESTE CASO. Ele passa VERDE com o
  // `!comunsEsgotados(...)` removido do gate de respawn — medido por sabotagem.
  // O motivo e que `garantirProtetorDaSala` recria o protetor no inicio de todo
  // tick, entao `protetorPendente` (a outra metade do gate) quase nunca fica
  // nulo enquanto a quota esta fechada. O que este caso PROVA e o
  // comportamento visivel — campo sem selvagem comum novo depois da quota —, e
  // nao qual das duas metades do gate o produziu. Ver a nota do gate em
  // `simulation.ts`.
  it('nenhum comum nasce depois do 29o abate', () => {
    const world = mundo(103)
    const gameState = useGameStateStore.getState()
    // Guarda anti-vacuo: com a sala nova o campo repovoa de verdade, senao o
    // caso abaixo mediria um respawn que nunca acontece.
    world.enemies = []
    world.respawnTimer = 0
    stepWorld(world, 1, gameState, { silent: true })
    expect(comuns(world).length).toBeGreaterThan(0)

    abaterComuns(world, ABATES_COMUNS_POR_SALA)
    expect(comunsEsgotados(world, HUNT)).toBe(true)

    // Campo esvaziado na mao, relogio de respawn zerado, e vinte segundos de
    // jogo: nada comum aparece. Antes disto o gate olhava so
    // `protetorPendente`, entao no tick anterior ao spawn do protetor — e em
    // toda janela sob autoridade sem espelho local — o campo voltava a encher.
    world.enemies = []
    world.protetorPendente = null
    world.respawnTimer = 0
    for (let i = 0; i < 20; i++) stepWorld(world, 1, gameState, { silent: true })
    expect(comuns(world).length, 'nasceu selvagem comum depois da quota').toBe(0)
  })

  it('depois do protetor resolvido o farm volta, e isso e de proposito', () => {
    // Sob autoridade a sala so troca quando o servidor manda, o que pode levar
    // minutos (ver ESPERA_MAXIMA_PELA_AUTORIDADE). Campo vazio nesse intervalo
    // tiraria o farm do jogador em troca de nada: a sala ja esta decidida.
    const world = mundo(104)
    abaterComuns(world, ABATES_COMUNS_POR_SALA)
    expect(comunsEsgotados(world, HUNT)).toBe(true)

    world.protetorResolvido = true
    expect(comunsEsgotados(world, HUNT)).toBe(false)
    expect(quotaDeAbatesDaSala(world.sala, HUNT, world)).toBe(ABATES_POR_SALA)
  })

  it('estagio JA LIMPO fica nos 30 comuns e nao espera chefe nenhum', () => {
    // PH-428: estagio limpo nao repoe protetor, entao nao ha 30o abate de chefe
    // — a quota volta a ser 30 comuns e a sala avanca sozinha.
    const limpo = { ...progressoPorBiomaDefault(), mata: 3 }
    const world = mundo(105, limpo)
    expect(world.estagioJaLimpo).toBe(true)
    expect(salaDeveProtetor(world.sala, HUNT, world)).toBe(false)
    expect(quotaDeAbatesDaSala(world.sala, HUNT, world)).toBe(ABATES_POR_SALA)

    abaterComuns(world, ABATES_COMUNS_POR_SALA)
    expect(world.salaPendente, 'avancou com 29 num estagio sem chefe').toBeNull()
    registrarAbate(world, world.mapDef!.id)
    expect(world.sala!.abates).toBe(ABATES_POR_SALA)
    expect(world.salaPendente, 'nao avancou com 30 num estagio sem chefe').not.toBeNull()
    // E o campo continua repovoando: sem chefe, nao ha o que esgotar.
    expect(comunsEsgotados(world, HUNT)).toBe(false)
  })

  it('a ultima sala do estagio pede LORD, e ele tambem e o 30o', () => {
    const world = mundo(106)
    const ultima = quantidadeDeSalas(HUNT) - 1
    world.sala = { ...world.sala!, indice: ultima, abates: 0 }
    expect(protetorDaSala(world.sala, HUNT)).toBe('lord')
    expect(quotaDeAbatesDaSala(world.sala, HUNT, world)).toBe(ABATES_COMUNS_POR_SALA)
  })

  it('hunt sem sala nao tem quota de sala nenhuma', () => {
    // A inicial, as BOSS e o Campeao Lance nao tem sala — `salaDeveProtetor`
    // devolve false por `protetorDaSala` nao achar bioma, e a quota cai nos 30.
    expect(salaDeveProtetor(null, STARTER_HUNT_ID, {
      estagioJaLimpo: false, protetorResolvido: false,
    })).toBe(false)
    expect(quotaDeAbatesDaSala(null, STARTER_HUNT_ID, {
      estagioJaLimpo: false, protetorResolvido: false,
    })).toBe(ABATES_POR_SALA)
  })
})
