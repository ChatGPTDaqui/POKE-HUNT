// PH-472 — o chefe derrotado ATRAVESSA a janela de flush.
//
// O BUG. `world.protetorResolvido` era o unico registro de que o chefe daquela
// sala ja caiu, e ele e efemero. O que o flush gravava era `sala_abates` cheio
// e o DELETE da linha de `sala_protetor` — e a AUSENCIA dessa linha significa as
// duas coisas opostas:
//
//     "nunca nasceu nesta sala"   e   "ja morreu"
//
// `buildMapWorld` lia o estado ambiguo e escolhia a leitura errada: sorteava um
// protetor NOVO, com HP cheio. O jogador matava o chefe no fim de uma janela e
// o encontrava inteiro na seguinte, com a luta de minutos zerada.
//
// A SOLUCAO NAO PEDE COLUNA NOVA, e e a da PH-307: `sala_protetor.hp_atual` e
// `integer not null` sem CHECK, entao `0` e armazenavel e vale como marcador —
// a mesma semantica de tres valores que aquela issue deu ao `sequence_hp`.
//
// O QUE ESTE ARQUIVO TRAVA, e nenhum dos dois grita quando quebra:
//
//   1. o marcador ser GRAVADO (a identidade do caido sobrevive a resolucao);
//   2. o marcador ser LIDO, e se REESCREVER ate a sala trocar de verdade. Sem
//      a reescrita o conserto so adiaria o bug uma janela: a janela que le o
//      marcador nasceria com ele nulo, o flush dela deletaria a linha, e a
//      seguinte voltaria a sortear chefe novo.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { ABATES_COMUNS_POR_SALA, ABATES_POR_SALA } from '@/data/biomas'
import { useGameStateStore } from '@/stores/gameStateStore'
import { buildMapWorld, handleEnemyDefeated, stepWorld } from './simulation'
import {
  aplicarTransicaoDeSala, registrarAbate, resolverProtetorDaSala, salaDeveProtetor,
} from './systems/salaSystem'
import type { ProtetorPendente, SalaAtiva, WorldState } from './types'

const HUNT = 'mata_e1'
const SALA: SalaAtiva = { indice: 0, chave: 'volcano', abates: ABATES_COMUNS_POR_SALA, ciclos: 0 }

function mundo(semente: number, progresso?: { sala?: SalaAtiva; protetorPendente?: ProtetorPendente | null }): WorldState {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', 20)
  return buildMapWorld(HUNT, poke, {
    seed: 0, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 },
  }, progresso ?? { sala: { ...SALA } })
}

/**
 * Um mundo com o chefe em campo, do jeito que o motor o cria.
 *
 * SEM TICK NENHUM: `buildMapWorld` JA cria o protetor quando a sala vem com a
 * quota de comuns fechada (`sala.abates >= 29`) — a primeira versao deste
 * helper zerava `world.enemies` e dava um tique pra "fazer o chefe nascer", e o
 * resultado era um mundo com `protetorPendente` setado e NENHUMA entidade em
 * campo: `garantirProtetorDaSala` sai cedo em `if (world.protetorPendente)
 * return true` e nao recria o que o helper acabou de apagar.
 */
function comChefeEmCampo(semente: number): WorldState {
  const world = mundo(semente)
  expect(world.protetorPendente, 'o cenario exige chefe em campo').not.toBeNull()
  expect(world.enemies.filter((e) => e.isProtetor).length, 'chefe sem entidade').toBe(1)
  return world
}

describe('o marcador do chefe caido e GRAVADO', () => {
  beforeEach(() => { useGameStateStore.getState().resetToDefaults() })

  it('resolver o chefe guarda a identidade dele em `protetorCaido`', () => {
    const world = comChefeEmCampo(301)
    const uid = world.protetorPendente!.uid

    resolverProtetorDaSala(world, HUNT)

    expect(world.protetorPendente, 'o chefe vivo continua em campo').toBeNull()
    expect(world.protetorResolvido).toBe(true)
    // A IDENTIDADE E O QUE FALTAVA: sem ela `payloadDoProtetor` nao tem o que
    // gravar, e o flush volta a mandar `null` (= DELETE da linha).
    expect(world.protetorCaido?.uid).toBe(uid)
  })

  it('resolver DUAS vezes no mesmo tick nao apaga o que a primeira guardou', () => {
    // A funcao e idempotente por contrato — um AOE que mata dois inimigos no
    // mesmo tick a chama duas vezes. Na segunda `protetorPendente` ja e nulo, e
    // uma atribuicao seca zeraria o marcador.
    const world = comChefeEmCampo(302)
    const uid = world.protetorPendente!.uid
    resolverProtetorDaSala(world, HUNT)
    resolverProtetorDaSala(world, HUNT)
    expect(world.protetorCaido?.uid).toBe(uid)
  })

  it('a sala trocar LIMPA o marcador — ele vale por sala, nao pela sessao', () => {
    // Marcador da sala anterior gravado como marcador da sala nova seria o mesmo
    // defeito do `protetorPendente` pendurado que a PH-258 corrigiu, so pelo
    // lado da persistencia: a sala nova nasceria com o chefe "ja derrotado".
    const world = comChefeEmCampo(303)
    resolverProtetorDaSala(world, HUNT)
    expect(world.protetorCaido).not.toBeNull()

    // O abate do chefe e o 30o (PH-473) e ele arma a transicao.
    registrarAbate(world, HUNT)
    expect(world.salaPendente, 'a transicao nao armou').not.toBeNull()
    aplicarTransicaoDeSala(world, HUNT)

    expect(world.protetorCaido).toBeNull()
    expect(world.protetorResolvido).toBe(false)
  })

  it('o caminho de abate REAL grava o marcador, e nao so a chamada direta', () => {
    // `handleEnemyDefeated` e quem chama `resolverProtetorDaSala` no jogo (e e
    // o mesmo caminho de morte E de captura — `maybeAutoCatch` roda dentro
    // dele, depois do HP chegar a zero). Sem este caso, os de cima provariam
    // so que a funcao isolada funciona.
    const world = comChefeEmCampo(304)
    const uid = world.protetorPendente!.uid
    const chefe = world.enemies.find((e) => e.isProtetor)!
    // O time no store: `handleEnemyDefeated` credita XP e loot no jogador, e
    // `resetToDefaults()` do `beforeEach` deixa a equipe vazia.
    useGameStateStore.setState({ team: [world.player!.poke], activeIndex: 0 } as never, false)

    handleEnemyDefeated(world, chefe, useGameStateStore.getState(), { silent: true })

    expect(world.protetorCaido?.uid).toBe(uid)
    expect(world.protetorResolvido).toBe(true)
  })
})

describe('o marcador do chefe caido e LIDO', () => {
  beforeEach(() => { useGameStateStore.getState().resetToDefaults() })

  /** A linha de `sala_protetor` como ela volta do banco. */
  function linhaDoCaido(base: ProtetorPendente, hpAtual: number): ProtetorPendente {
    return { ...base, hpAtual }
  }

  it('reconstruir com `hpAtual = 0` NAO faz nascer outro chefe', () => {
    // O bug, direto: era aqui que a janela seguinte sorteava um protetor novo
    // com HP cheio.
    const anterior = comChefeEmCampo(311)
    const caido = linhaDoCaido(anterior.protetorPendente!, 0)

    const world = mundo(312, { sala: { ...SALA }, protetorPendente: caido })

    expect(world.protetorResolvido).toBe(true)
    expect(world.protetorPendente, 'nasceu um chefe novo').toBeNull()
    expect(world.enemies.some((e) => e.isProtetor), 'chefe novo em campo').toBe(false)
    // A sala destrava por consequencia: `salaDeveProtetor` consulta
    // `protetorResolvido`, entao nenhum gate precisou mudar.
    expect(salaDeveProtetor(world.sala, HUNT, world)).toBe(false)
  })

  it('e o marcador SE REESCREVE — senao o conserto so adia o bug uma janela', () => {
    // Sem isto a janela que LE o marcador nasceria com os dois campos nulos, o
    // flush dela mandaria `p_protetor: null`, a RPC deletaria a linha, e a
    // janela seguinte voltaria a ler "nunca nasceu".
    const anterior = comChefeEmCampo(313)
    const caido = linhaDoCaido(anterior.protetorPendente!, 0)

    const world = mundo(314, { sala: { ...SALA }, protetorPendente: caido })

    expect(world.protetorCaido?.uid).toBe(caido.uid)
    expect(world.protetorCaido?.hpAtual).toBe(0)
  })

  it('a sala AVANCA no primeiro tique depois de reconstruir com o marcador', () => {
    const anterior = comChefeEmCampo(315)
    const caido = linhaDoCaido(anterior.protetorPendente!, 0)
    // `sala_abates` = 30, e nao 29: o abate do chefe E o 30o (PH-473), entao a
    // linha persistida no flush em que ele cai tem a quota CHEIA. Com 29 a sala
    // legitimamente nao avanca — a quota de uma sala que nao deve mais protetor
    // volta a ser 30, e faltaria um abate.
    const world = mundo(316, {
      sala: { ...SALA, abates: ABATES_POR_SALA }, protetorPendente: caido,
    })
    // Sem autoridade a transicao e local e imediata — e o que este caso mede e
    // que ela ACONTECE, e nao quem a decide.
    expect(world.salaSobAutoridade).toBe(false)

    const antes = world.sala!.indice
    stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })

    // A SALA JA TROCOU, e nao "armou a transicao": `silent: true` e simulacao
    // sem plateia (resim do servidor, catch-up de aba oculta) e
    // `encurtarTransicaoDeSala` colapsa os 3s de overlay pra zero no mesmo
    // tique (PH-331) — sem plateia nao ha o que esperar. Entao o que se mede
    // aqui e o indice, e nao `salaPendente`, que nasce e morre dentro do tique.
    expect(world.sala!.indice, 'a sala ficou travada').toBe(antes + 1)
    expect(world.protetorCaido, 'o marcador sobreviveu a troca de sala').toBeNull()
  })

  it('`hpAtual > 0` continua recriando FIEL — nao regrediu', () => {
    // O outro lado da regra de tres valores: luta em andamento tem que voltar
    // exatamente como parou, com zero RNG extra consumido.
    const anterior = comChefeEmCampo(317)
    const vivo = linhaDoCaido(anterior.protetorPendente!, 7)

    const world = mundo(318, { sala: { ...SALA }, protetorPendente: vivo })

    expect(world.protetorResolvido).toBe(false)
    expect(world.protetorCaido).toBeNull()
    expect(world.protetorPendente?.uid).toBe(vivo.uid)
    expect(world.protetorPendente?.hpAtual).toBe(7)
    const emCampo = world.enemies.filter((e) => e.isProtetor)
    expect(emCampo.length).toBe(1)
    expect(emCampo[0].poke.uid).toBe(vivo.uid)
    expect(emCampo[0].poke.hp).toBe(7)
  })

  it('sem linha nenhuma, a sala em modo protetor sorteia um — o caso normal', () => {
    // Guarda anti-vacuo do bloco inteiro: se `buildMapWorld` tivesse parado de
    // criar protetor por qualquer motivo, todos os casos acima passariam.
    const world = mundo(319, { sala: { ...SALA } })
    expect(world.protetorPendente, 'o caminho normal deixou de sortear').not.toBeNull()
    expect(world.protetorResolvido).toBe(false)
  })
})
