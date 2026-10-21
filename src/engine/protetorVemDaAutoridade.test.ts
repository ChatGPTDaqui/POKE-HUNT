// PH-475 — sob autoridade o chefe da sala e do SERVIDOR, e o cliente adota.
//
// O QUE ISSO CONSERTA, e sao os dois relatos do dono na mesma sessao. A resposta
// de flush era autoritativa sobre `sala` e `clima` e nao dizia nada sobre o
// protetor, entao havia DOIS chefes por sala: o do servidor, sorteado com a
// semente da sessao e persistido em `sala_protetor`, e o do cliente, sorteado
// por `garantirProtetorDaSala` com a sequencia LOCAL, que e predicao. Podiam ser
// especies diferentes, e o HP deles nao se falava.
//
//   1. o jogador matava o chefe LOCAL; `resolverProtetorDaSala` sai sem avancar
//      nada sob autoridade (de proposito) e a sala ficava parada — "matei o
//      chefe e nada aconteceu";
//   2. minutos depois o servidor matava o DELE, o flush trazia a sala seguinte e
//      `aplicarTransicaoDeSala` zerava `world.enemies` no meio da luta — "a sala
//      trocou durante o chefe".
//
// A ESCAPATORIA CONTRA SERVIDOR MUDO E PARTE DO CONTRATO, nao um detalhe: sem
// ela, uma Edge fora do ar deixaria a hunt travada em 29/30 pra sempre. O ultimo
// caso deste arquivo e o que a tranca.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { ABATES_COMUNS_POR_SALA } from '@/data/biomas'
import { useGameStateStore } from '@/stores/gameStateStore'
import { adotarProtetorDaAutoridade, buildMapWorld, handleEnemyDefeated, stepWorld } from './simulation'
import type { ProtetorPendente, WorldState } from './types'

const HUNT = 'mata_e1'

function mundo(semente: number): WorldState {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', 20)
  return buildMapWorld(HUNT, poke, {
    seed: 0, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
}

/** Sala com a quota de comuns fechada, sob autoridade, sem chefe em campo. */
function esperandoOChefe(semente: number): WorldState {
  const world = mundo(semente)
  world.sala = { indice: 0, chave: 'volcano', abates: ABATES_COMUNS_POR_SALA, ciclos: 0 }
  world.enemies = []
  world.respawnTimer = 999
  world.salaSobAutoridade = true
  return world
}

/**
 * Um `ProtetorPendente` de verdade, do jeito que o servidor manda.
 *
 * Sai do caminho LOCAL de proposito (autoridade desligada, um tick): assim o
 * dado do teste e a mesma forma que `criarEntidadeDoProtetor` produz, e nao uma
 * literal escrita a mao que pode divergir do tipo sem ninguem notar.
 */
function protetorDoServidor(semente: number, uid: string, hpAtual?: number): ProtetorPendente {
  const world = mundo(semente)
  world.sala = { indice: 0, chave: 'volcano', abates: ABATES_COMUNS_POR_SALA, ciclos: 0 }
  world.enemies = []
  world.respawnTimer = 999
  stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })
  const pendente = world.protetorPendente
  if (!pendente) throw new Error('a fixture nao conseguiu montar um protetor')
  return { ...pendente, uid, hpAtual: hpAtual ?? pendente.hpAtual }
}

describe('o cliente nao sorteia o chefe sob autoridade (PH-475)', () => {
  beforeEach(() => { useGameStateStore.getState().resetToDefaults() })

  // 21/10/2026: o cliente NAO espera mais o chefe do servidor. O sorteio e
  // semeado pela sala, entao os dois lados criam o MESMO chefe na hora.
  it('sob autoridade o cliente cria na hora o MESMO chefe que o servidor cria', () => {
    const gameState = useGameStateStore.getState()
    const cliente = esperandoOChefe(201)
    stepWorld(cliente, 0.1, gameState, { silent: true })
    expect(cliente.protetorPendente, 'o cliente esperou o servidor').not.toBeNull()
    expect(cliente.salaPendente).toBeNull()

    // "Servidor": outro rng de mundo, sem autoridade, mesma sala.
    const servidor = esperandoOChefe(999)
    servidor.salaSobAutoridade = false
    stepWorld(servidor, 0.1, gameState, { silent: true })
    expect(servidor.protetorPendente?.uid).toBe(cliente.protetorPendente!.uid)
    expect(servidor.protetorPendente?.speciesId).toBe(cliente.protetorPendente!.speciesId)
    expect(servidor.protetorPendente?.level).toBe(cliente.protetorPendente!.level)
  })

  it('chefe ja derrotado no cliente nao ressuscita com a resposta atrasada do servidor', () => {
    const gameState = useGameStateStore.getState()
    const world = esperandoOChefe(205)
    stepWorld(world, 0.1, gameState, { silent: true })
    const chefe = world.enemies.find((e) => e.isProtetor)!
    const pendente = { ...world.protetorPendente! }
    handleEnemyDefeated(world, chefe, gameState, { silent: true })
    world.enemies = world.enemies.filter((e) => !e.isProtetor)
    expect(world.protetorResolvido).toBe(true)

    adotarProtetorDaAutoridade(world, { pendente, resolvido: false })
    expect(world.enemies.some((e) => e.isProtetor), 'o chefe voltou').toBe(false)
  })

  it('resposta atrasada com o chefe da sala ANTERIOR nao o recria na sala nova', () => {
    const gameState = useGameStateStore.getState()
    const world = esperandoOChefe(207)
    stepWorld(world, 0.1, gameState, { silent: true })
    const chefe = world.enemies.find((e) => e.isProtetor)!
    const pendente = { ...world.protetorPendente! }
    handleEnemyDefeated(world, chefe, gameState, { silent: true })
    world.enemies = world.enemies.filter((e) => !e.isProtetor)
    // A sala trocou (o que `aplicarTransicaoDeSala` zera).
    world.sala = { ...world.sala!, indice: 1, abates: 0 }
    world.protetorResolvido = false
    world.protetorCaido = null

    adotarProtetorDaAutoridade(world, { pendente, resolvido: false })
    expect(world.enemies.some((e) => e.isProtetor), 'o chefe da sala anterior voltou').toBe(false)
  })

  it('chefe adotado do servidor tira de campo os comuns que o cliente ainda tinha vivos', () => {
    const world = esperandoOChefe(211)
    world.salaSobAutoridade = true
    // Cliente atrasado: ainda com comuns vivos quando o chefe do servidor chega.
    const outro = mundo(211)
    world.enemies = outro.enemies.filter((e) => !e.isProtetor).slice(0, 3)
    expect(world.enemies.length).toBeGreaterThan(0)
    adotarProtetorDaAutoridade(world, { pendente: protetorDoServidor(211, 'srv-adotado'), resolvido: false })
    expect(world.enemies.filter((e) => !e.isProtetor && e.poke.hp > 0)).toHaveLength(0)
    expect(world.enemies.some((e) => e.isProtetor)).toBe(true)
  })

  it('sem o campo na resposta (servidor mais velho) nada muda', () => {
    const world = esperandoOChefe(202)
    adotarProtetorDaAutoridade(world, undefined)
    expect(world.protetorPendente).toBeNull()
    expect(world.protetorResolvido).toBe(false)
  })

  it('campo nulo (hunt sem sala) nao limpa nada', () => {
    const world = esperandoOChefe(203)
    const doServidor = protetorDoServidor(203, 'srv-1')
    adotarProtetorDaAutoridade(world, { pendente: doServidor, resolvido: false })
    expect(world.protetorPendente).not.toBeNull()

    adotarProtetorDaAutoridade(world, null)
    expect(world.protetorPendente, 'um `null` apagou o chefe adotado').not.toBeNull()
  })

  it('chefe novo: adota especie, nivel e HP do servidor, sem sortear', () => {
    const world = esperandoOChefe(204)
    const doServidor = protetorDoServidor(204, 'srv-42', 777)

    adotarProtetorDaAutoridade(world, { pendente: doServidor, resolvido: false })

    expect(world.protetorPendente?.uid).toBe('srv-42')
    expect(world.protetorPendente?.speciesId).toBe(doServidor.speciesId)
    expect(world.protetorPendente?.hpAtual).toBe(777)
    const emCampo = world.enemies.filter((e) => e.isProtetor)
    expect(emCampo.length, 'nem um chefe, ou mais de um').toBe(1)
    expect(emCampo[0].poke.uid).toBe('srv-42')
    expect(emCampo[0].poke.speciesId).toBe(doServidor.speciesId)
    expect(emCampo[0].poke.level).toBe(doServidor.level)
  })

  it('mesmo chefe: so o HP anda, e a entidade nao e recriada', () => {
    const world = esperandoOChefe(205)
    const doServidor = protetorDoServidor(205, 'srv-7')
    adotarProtetorDaAutoridade(world, { pendente: doServidor, resolvido: false })
    const idAntes = world.enemies.find((e) => e.isProtetor)!.id

    adotarProtetorDaAutoridade(world, {
      pendente: { ...doServidor, hpAtual: 12 }, resolvido: false,
    })

    const emCampo = world.enemies.filter((e) => e.isProtetor)
    expect(emCampo.length).toBe(1)
    // MESMA entidade: recriar a cada flush zeraria a posicao e o estado de
    // combate dele, e o jogador veria o chefe teleportar de 30 em 30 segundos.
    expect(emCampo[0].id).toBe(idAntes)
    expect(emCampo[0].poke.hp).toBe(12)
    expect(world.protetorPendente?.hpAtual).toBe(12)
  })

  it('chefe DIFERENTE do que o cliente tinha: o de la substitui o de ca', () => {
    const world = esperandoOChefe(206)
    adotarProtetorDaAutoridade(world, {
      pendente: protetorDoServidor(206, 'srv-antigo'), resolvido: false,
    })
    adotarProtetorDaAutoridade(world, {
      pendente: protetorDoServidor(206, 'srv-novo'), resolvido: false,
    })

    const emCampo = world.enemies.filter((e) => e.isProtetor)
    expect(emCampo.length, 'os dois chefes ficaram em campo').toBe(1)
    expect(emCampo[0].poke.uid).toBe('srv-novo')
    expect(world.protetorPendente?.uid).toBe('srv-novo')
  })

  it('chefe resolvido no servidor: sai de campo e a sala destrava', () => {
    const world = esperandoOChefe(207)
    adotarProtetorDaAutoridade(world, {
      pendente: protetorDoServidor(207, 'srv-9'), resolvido: false,
    })
    expect(world.enemies.some((e) => e.isProtetor)).toBe(true)

    adotarProtetorDaAutoridade(world, { pendente: null, resolvido: true })

    expect(world.enemies.some((e) => e.isProtetor)).toBe(false)
    expect(world.protetorPendente).toBeNull()
    expect(world.protetorResolvido).toBe(true)
    // NAO arma transicao: quem decide a sala e o proprio flush, que roda a
    // reconciliacao de sala imediatamente antes desta adocao. Armar as duas
    // poria uma sala predita por cima da autoritativa.
    expect(world.salaPendente).toBeNull()
    expect(world.salaCountdownRemaining).toBeNull()
  })

  it('`pendente: null` sem `resolvido` nao apaga o chefe ja adotado', () => {
    // Resposta atrasada, ou servidor que ainda nao fechou a quota dele. Nao e
    // "o chefe morreu" — e "nao tenho nada a dizer sobre ele".
    const world = esperandoOChefe(208)
    adotarProtetorDaAutoridade(world, {
      pendente: protetorDoServidor(208, 'srv-3'), resolvido: false,
    })
    adotarProtetorDaAutoridade(world, { pendente: null, resolvido: false })
    expect(world.protetorPendente?.uid).toBe('srv-3')
    expect(world.protetorResolvido).toBe(false)
  })


})
