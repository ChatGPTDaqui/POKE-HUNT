// PH-181: os 3 cenarios do toggle de avanco manual de sala (PH-177), direto
// no motor, sem mock de rede.
//
// O caso que motivou a correcao de design da PH-177 (26/08, ANTES de codar):
// `silent` nao discrimina "jogador ausente" de "servidor confirmando um
// flush ao vivo normal" — o resim do servidor roda `silent: true` SEMPRE. O
// discriminador real e o tamanho da janela (`LIMIAR_OFFLINE_SEGUNDOS`),
// calculado fora do motor (`authority/progresso.ts`) e passado como
// `manualAdvance` ja resolvido. Estes testes cobrem `registrarAbate` e
// `garantirTransicaoDeQuotaFechada` recebendo esse parametro diretamente —
// e o segundo e o que existe pra fechar um furo achado so lendo o codigo:
// `garantirTransicaoDeQuotaFechada` roda no TOPO de todo tick (inclusive o
// primeiro de uma janela de flush reconstruida do zero) e reavancava a sala
// sozinha mesmo com quota fechada numa janela ANTERIOR, por fora do caminho
// que `registrarAbate` cobre.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld, handleEnemyDefeated } from '../simulation'
import {
  registrarAbate, garantirTransicaoDeQuotaFechada, solicitarAvancoDeSala, protetorDaSala,
} from './salaSystem'
import { ABATES_POR_SALA } from '@/data/biomas'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { WorldState } from '../types'

const HUNT = 'mata_e1'

function mundo(semente: number): WorldState {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', 20)
  return buildMapWorld(HUNT, poke, { seed: 0, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 } })
}

/** Fecha a quota sem avancar de fato — mesmo helper de `abates - 1` que salas.test.ts usa. */
function fecharQuota(world: WorldState, opts?: { manualAdvance?: boolean }) {
  for (let i = 0; i < ABATES_POR_SALA - 1; i++) registrarAbate(world, world.mapDef!.id)
  return registrarAbate(world, world.mapDef!.id, opts)
}

/**
 * PH-225/236: sala com protetor habilitado (todo bioma agora) nao arma a
 * transicao no proprio abate — `registrarAbate` se recusa de proposito ate
 * o protetor ser resolvido. Mesmo padrao de
 * `salas.test.ts#resolverProtetorSeHouver`.
 */
function resolverProtetorSeHouver(world: WorldState) {
  if (world.sala!.abates < ABATES_POR_SALA || !protetorDaSala(world.sala)) return
  const gameState = useGameStateStore.getState()
  if (!world.protetorPendente) stepWorld(world, 0.1, gameState, { silent: true }) // nasce o protetor
  const protetor = world.enemies.find((e) => e.isProtetor)
  if (protetor) handleEnemyDefeated(world, protetor, gameState, { silent: true })
  world.enemies = world.enemies.filter((e) => !e.isProtetor)
}

describe('avanco manual de sala (PH-177/181)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('registrarAbate: manualAdvance ausente/false avanca sozinho (comportamento atual preservado)', () => {
    const world = mundo(10)
    const evento = fecharQuota(world)
    // PH-225: sala com protetor habilitado nao arma no proprio abate — so
    // depois de resolver o protetor que ele faz nascer (ver
    // salaSystem.ts#registrarAbate).
    expect(evento.avancou).toBe(false)
    resolverProtetorSeHouver(world)
    expect(world.salaCountdownRemaining).not.toBeNull()
    expect(world.salaPendente).not.toBeNull()
  })

  it('registrarAbate: manualAdvance true fecha a quota mas nao sorteia nem arma transicao', () => {
    const world = mundo(11)
    const evento = fecharQuota(world, { manualAdvance: true })
    expect(evento.avancou).toBe(false)
    expect(world.salaCountdownRemaining).toBeNull()
    expect(world.salaPendente).toBeNull()
    // Cap preservado: quota fechada nao poluiu `sala.abates` alem do teto.
    expect(world.sala!.abates).toBe(ABATES_POR_SALA)
  })

  it('registrarAbate: abates extras alem da quota nao estouram o cap com manualAdvance true', () => {
    const world = mundo(12)
    fecharQuota(world, { manualAdvance: true })
    registrarAbate(world, world.mapDef!.id, { manualAdvance: true })
    registrarAbate(world, world.mapDef!.id, { manualAdvance: true })
    expect(world.sala!.abates).toBe(ABATES_POR_SALA)
  })

  it('garantirTransicaoDeQuotaFechada: manualAdvance false reavanca sozinha (livelock fix preservado)', () => {
    const world = mundo(13)
    fecharQuota(world, { manualAdvance: true })
    // Simula a janela seguinte: countdown/pendente sao efemeros e nao
    // atravessam a reconstrucao do world do servidor — so `sala.abates` (30,
    // persistido) sobrevive.
    world.salaCountdownRemaining = null
    world.salaPendente = null

    garantirTransicaoDeQuotaFechada(world, world.mapDef!.id, 0, false)
    expect(world.salaCountdownRemaining).not.toBeNull()
    expect(world.salaPendente).not.toBeNull()
  })

  it('garantirTransicaoDeQuotaFechada: manualAdvance true NAO reavanca numa janela nova (o furo achado antes de codar)', () => {
    const world = mundo(14)
    fecharQuota(world, { manualAdvance: true })
    world.salaCountdownRemaining = null
    world.salaPendente = null

    // Isto e exatamente o "resim do servidor confirmando um flush ao vivo
    // normal" — sem este teste, so `registrarAbate` respeitar o toggle
    // passaria batido e a sala avancaria de novo sozinha aqui.
    garantirTransicaoDeQuotaFechada(world, world.mapDef!.id, 0, true)
    expect(world.salaCountdownRemaining).toBeNull()
    expect(world.salaPendente).toBeNull()
    expect(world.sala!.abates).toBe(ABATES_POR_SALA)
  })

  it('stepWorld: toggle ligado trava a sala (opts.offline ausente = janela curta)', () => {
    const world = mundo(15)
    useGameStateStore.getState().setAutoToggle('avancoManualDeSala', true)
    fecharQuota(world, { manualAdvance: true })
    expect(world.salaCountdownRemaining).toBeNull()

    // Um tick a mais (janela curta, sem `offline`) nao pode reavancar sozinho
    // — e o furo que `garantirTransicaoDeQuotaFechada` cobre, agora visto
    // atraves do `stepWorld` real (o call site que a producao usa).
    stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })
    expect(world.salaCountdownRemaining).toBeNull()
    expect(world.salaPendente).toBeNull()
  })

  it('stepWorld: toggle ligado + opts.offline true avanca mesmo assim (farm offline real ignora o toggle)', () => {
    const world = mundo(16)
    useGameStateStore.getState().setAutoToggle('avancoManualDeSala', true)
    fecharQuota(world, { manualAdvance: true })
    expect(world.salaCountdownRemaining).toBeNull()

    // PH-225: sala com protetor habilitado — o primeiro tick so faz o
    // protetor nascer (`offline` nao pula essa parte, so a espera de
    // autoridade/manual advance mais abaixo em
    // garantirTransicaoDeQuotaFechada). Resolve o protetor antes de checar
    // se a transicao arma.
    stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true, offline: true })
    const protetor = world.enemies.find((e) => e.isProtetor)
    if (protetor) handleEnemyDefeated(world, protetor, useGameStateStore.getState(), { silent: true })
    world.enemies = world.enemies.filter((e) => !e.isProtetor)

    expect(world.salaCountdownRemaining).not.toBeNull()
    expect(world.salaPendente).not.toBeNull()
  })

  it('solicitarAvancoDeSala: sala travada avanca; sala nao travada nao faz nada', () => {
    const world = mundo(17)
    expect(solicitarAvancoDeSala(world, world.mapDef!.id).avancou).toBe(false)

    fecharQuota(world, { manualAdvance: true })
    expect(world.salaCountdownRemaining).toBeNull()

    // PH-291: ESTE CASO MUDOU, e a mudanca E o conserto de um bug.
    //
    // Ate aqui o teste esperava `avancou: true` NESTE PONTO — com o protetor da
    // sala vivo. O comportamento errado estava codificado como esperado, e foi
    // por isso que ninguem percebeu que o avanco manual era a UNICA das tres
    // portas de avanco sem a trava do protetor: `registrarAbate` e
    // `garantirTransicaoDeQuotaFechada` sempre respeitaram, `solicitarAvancoDeSala`
    // nao. Pulando o Lord da sala 10, o ciclo fecha sem creditar
    // `bioma_progress` — o jogador farma pra sempre sem destravar o bioma
    // seguinte.
    expect(
      solicitarAvancoDeSala(world, world.mapDef!.id).avancou,
      'avanco manual passou por cima do protetor vivo',
    ).toBe(false)
    expect(world.salaCountdownRemaining).toBeNull()

    // E COM O PROTETOR RESOLVIDO, QUEM ARMA A TRANSICAO E ELE — nao o clique.
    //
    // Isto foi achado escrevendo este caso, e vale registrar porque muda o que o
    // toggle significa hoje: `resolverProtetorDaSala` chama `armarTransicaoDeSala`
    // direto, sem olhar `manualAdvance`. Como TODA sala de bioma passou a ter
    // protetor (PH-202/225), a sala nunca fica parada em 30/30 esperando o
    // clique — ela para esperando o protetor cair, e assim que ele cai a
    // transicao anda sozinha. O toggle sobrou como controle das salas sem
    // protetor. Aberto como PH-292.
    resolverProtetorSeHouver(world)
    expect(
      world.salaCountdownRemaining,
      'a resolucao do protetor deixou de armar a transicao',
    ).not.toBeNull()

    // E ai o clique e um no-op idempotente, nao um segundo sorteio — a garantia
    // que `armarTransicaoDeSala` sempre deu.
    const evento = solicitarAvancoDeSala(world, world.mapDef!.id)
    expect(evento.avancou, 'rearmou uma transicao ja armada').toBe(false)
  })
})
