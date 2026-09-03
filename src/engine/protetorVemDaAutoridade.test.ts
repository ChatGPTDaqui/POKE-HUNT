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
import { adotarProtetorDaAutoridade, buildMapWorld, stepWorld } from './simulation'
import { ESPERA_MAXIMA_PELA_AUTORIDADE } from './systems/salaSystem'
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

  it('quota fechada e nenhum chefe em campo: o cliente espera, e a sala nao avanca', () => {
    const world = esperandoOChefe(201)
    const gameState = useGameStateStore.getState()

    // MEDE TODOS OS TICKS, e nao o estado final — a diferenca reprova ou nao
    // reprova. Sabotar o gate e olhar so o fim deste laco passa VERDE: o chefe
    // nasce no tick 0 e o cao de guarda do impasse (PH-301) o remove alguns
    // segundos depois, entao o estado final volta a ser "sem chefe" por outro
    // caminho. Medido por sabotagem antes de escrever isto assim.
    //
    // 60 ticks (6s de jogo) — longe dos 120s de silencio que liberam a
    // escapatoria, e mais que suficiente pro caminho antigo ter sorteado.
    let ticksComChefe = 0
    for (let i = 0; i < 60; i++) {
      stepWorld(world, 0.1, gameState, { silent: true })
      if (world.protetorPendente || world.enemies.some((e) => e.isProtetor)) ticksComChefe += 1
    }

    expect(ticksComChefe, 'o cliente sorteou um chefe proprio').toBe(0)
    // E a sala continua travada: o `true` de `garantirProtetorDaSala` e o que
    // impede o palpite de sala enquanto o chefe nao chega.
    expect(world.salaPendente).toBeNull()
    expect(world.sala!.indice).toBe(0)

    // Guarda anti-vacuo: sem autoridade, o MESMO cenario sorteia o chefe. Sem
    // esta metade, o caso acima passaria com o motor inteiro desligado.
    const local = esperandoOChefe(201)
    local.salaSobAutoridade = false
    stepWorld(local, 0.1, gameState, { silent: true })
    expect(local.protetorPendente, 'o caminho local deixou de sortear').not.toBeNull()
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

  it('servidor MUDO: passado o tempo de silencio o cliente volta a sortear', () => {
    // A escapatoria. Contra uma Edge fora do ar, a alternativa e a hunt travada
    // pra sempre com a barra em 29/30 — pior que a divergencia.
    //
    // O relogio de silencio SO ANDA se ele estiver antes do gate do protetor em
    // `garantirTransicaoDeQuotaFechada`. Ele estava depois, e este caso e o que
    // trava essa ordem: com o `+= dt` no lugar antigo, o gate cortava o tick e
    // o relogio ficava em zero pra sempre.
    const world = esperandoOChefe(209)
    const gameState = useGameStateStore.getState()
    const ticks = Math.ceil((ESPERA_MAXIMA_PELA_AUTORIDADE + 1) / 0.1)
    for (let i = 0; i < ticks; i++) stepWorld(world, 0.1, gameState, { silent: true })

    expect(world.protetorPendente, 'o cliente nunca voltou a sortear').not.toBeNull()
    expect(world.enemies.some((e) => e.isProtetor)).toBe(true)
  })
})
