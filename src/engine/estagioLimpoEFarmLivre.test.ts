// PH-428 — o que acontece quando o estagio ja foi limpo, e o que acontece
// quando ele fecha.
//
// AS DUAS REGRAS FALHAM EM SILENCIO, e em direcoes opostas:
//
//   - protetor reposto num estagio ja limpo nao da erro: o jogador so leva uma
//     luta obrigatoria a cada 30 abates num lugar que ele fechou, e a caçada
//     direcionada (a mecanica central do redesenho) vira pedagio;
//   - o toggle de fim de estagio lido errado tira o jogador do estagio que ele
//     escolheu, ou o prende num que ele queria deixar. Nenhum dos dois estoura.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { ABATES_POR_SALA } from '@/data/biomas'
import { ESTAGIOS_POR_BIOMA, estagioId, quantidadeDeSalas } from '@/data/estagios'
import { progressoPorBiomaDefault, type ProgressoPorBioma } from '@/data/progressoDeBioma'
import { buildMapWorld, stepWorld, handleEnemyDefeated } from './simulation'
import {
  estagioJaLimpo, proximoEstagioLiberado, protetorDaSala, registrarAbate,
  salaTravadaPeloProtetor,
} from './systems/salaSystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { WorldState } from './types'

const BIOMA = 'mata'
const E1 = estagioId(BIOMA, 1)
const SALAS_DO_E1 = quantidadeDeSalas(E1)

function mundo(mapId: string, progresso: ProgressoPorBioma = progressoPorBiomaDefault()): WorldState {
  const rng = createRng(7)
  const poke = createPokeInstance(rng, 'charmander', 20)
  return buildMapWorld(
    mapId, poke,
    { seed: 0, rng: createRng(7), counters: { entity: 1, effect: 1, pendingHit: 1 } },
    undefined, undefined, progresso,
  )
}

beforeEach(() => {
  useGameStateStore.getState().resetToDefaults()
})

describe('estagioJaLimpo (a pergunta pura)', () => {
  it('e verdade so a partir do estagio que o progresso alcanca', () => {
    const p = { ...progressoPorBiomaDefault(), mata: 3 }
    expect(estagioJaLimpo(estagioId(BIOMA, 1), p)).toBe(true)
    expect(estagioJaLimpo(estagioId(BIOMA, 3), p)).toBe(true)
    expect(estagioJaLimpo(estagioId(BIOMA, 4), p)).toBe(false)
  })

  it('progresso de outro bioma nao conta', () => {
    const p = { ...progressoPorBiomaDefault(), marinho: 10 }
    expect(estagioJaLimpo(estagioId(BIOMA, 1), p)).toBe(false)
  })

  it('hunt sem estagio (inicial, BOSS, Pesadelo) nunca conta como limpa', () => {
    const p = { ...progressoPorBiomaDefault(), mata: 10 }
    for (const id of ['route_46', 'boss_lance', 'nightmare_mata_e1']) {
      expect(estagioJaLimpo(id, p), id).toBe(false)
    }
  })
})

describe('estagio JA LIMPO nao repoe protetor', () => {
  it('o mundo nasce marcado, e a sala nao trava', () => {
    const world = mundo(E1, { ...progressoPorBiomaDefault(), mata: 1 })
    expect(world.estagioJaLimpo).toBe(true)

    world.sala = { indice: SALAS_DO_E1 - 1, chave: 'jungle', abates: ABATES_POR_SALA, ciclos: 0 }
    // A FORMA da sala continua pedindo Lord — `protetorDaSala` e pura e nao
    // sabe do progresso. Quem responde a verdade do jogador e o mundo.
    expect(protetorDaSala(world.sala, E1)).toBe('lord')
    expect(salaTravadaPeloProtetor(world)).toBe(false)
  })

  it('nenhum protetor nasce, nem no tick nem na reconstrucao do mundo', () => {
    const world = mundo(E1, { ...progressoPorBiomaDefault(), mata: 1 })
    world.sala = { indice: SALAS_DO_E1 - 1, chave: 'jungle', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })
    expect(world.protetorPendente).toBeNull()
    expect(world.enemies.some((e) => e.isProtetor)).toBe(false)

    // E a reconstrucao por janela (o que o servidor faz a cada flush) tambem
    // nao o traz de volta — era o caminho pelo qual o protetor reaparecia
    // sozinho antes da PH-225.
    const reconstruido = mundo(E1, { ...progressoPorBiomaDefault(), mata: 1 })
    reconstruido.sala = { indice: SALAS_DO_E1 - 1, chave: 'jungle', abates: ABATES_POR_SALA, ciclos: 0 }
    stepWorld(reconstruido, 0.1, useGameStateStore.getState(), { silent: true })
    expect(reconstruido.protetorPendente).toBeNull()
  })

  it('a sala avanca direto na quota, sem esperar protetor nenhum', () => {
    const world = mundo(E1, { ...progressoPorBiomaDefault(), mata: 1 })
    world.sala = { indice: 0, chave: 'jungle', abates: ABATES_POR_SALA - 1, ciclos: 0 }
    const evento = registrarAbate(world, E1)
    // Num estagio NAO limpo este mesmo abate seria recusado ate o Guardian cair.
    expect(evento.avancou).toBe(true)
    expect(world.salaPendente?.indice).toBe(1)
  })

  it('estagio NAO limpo continua exigindo o protetor', () => {
    const world = mundo(E1)
    expect(world.estagioJaLimpo).toBe(false)
    world.sala = { indice: 0, chave: 'jungle', abates: ABATES_POR_SALA - 1, ciclos: 0 }
    const evento = registrarAbate(world, E1)
    expect(evento.avancou).toBe(false)
    expect(salaTravadaPeloProtetor(world)).toBe(true)
  })
})

describe('proximoEstagioLiberado', () => {
  it('devolve o seguinte quando ele esta liberado', () => {
    const p = { ...progressoPorBiomaDefault(), mata: 3 }
    expect(proximoEstagioLiberado(estagioId(BIOMA, 3), p)).toBe(estagioId(BIOMA, 4))
  })

  it('devolve null quando o seguinte ainda esta bloqueado', () => {
    // Progresso 3, estagio atual 4 (liberado). O 5 pede o 4 limpo, que nao
    // esta — e mandar o cliente pedir sessao la levaria um 403 do gate.
    const p = { ...progressoPorBiomaDefault(), mata: 3 }
    expect(proximoEstagioLiberado(estagioId(BIOMA, 4), p)).toBeNull()
  })

  it('devolve null no ultimo estagio — nao ha pra onde ir', () => {
    const p = { ...progressoPorBiomaDefault(), mata: ESTAGIOS_POR_BIOMA }
    expect(proximoEstagioLiberado(estagioId(BIOMA, ESTAGIOS_POR_BIOMA), p)).toBeNull()
  })

  it('devolve null pra hunt que nao e estagio', () => {
    const p = { ...progressoPorBiomaDefault(), mata: 10 }
    expect(proximoEstagioLiberado('route_46', p)).toBeNull()
    expect(proximoEstagioLiberado('boss_lance', p)).toBeNull()
  })
})

describe('o toggle de fim de estagio', () => {
  function fecharUltimaSala(mapId: string, progresso: ProgressoPorBioma = progressoPorBiomaDefault()) {
    const world = mundo(mapId, progresso)
    const salas = quantidadeDeSalas(mapId)
    world.sala = { indice: salas - 1, chave: 'jungle', abates: ABATES_POR_SALA, ciclos: 0 }
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()
    // Num estagio nao limpo, quem arma a transicao e o abate do protetor.
    if (!world.estagioJaLimpo) {
      stepWorld(world, 0.1, gameState, { silent: true })
      const protetor = world.enemies.find((e) => e.isProtetor)
      if (protetor) handleEnemyDefeated(world, protetor, gameState, { silent: true })
      world.enemies = world.enemies.filter((e) => !e.isProtetor)
    } else {
      registrarAbate(world, mapId)
    }
    // Zera a contagem regressiva pra a transicao ser aplicada neste tick.
    stepWorld(world, 5, gameState, { silent: true })
    return world
  }

  it('PADRAO e REPETIR: volta a sala 1 do MESMO estagio', () => {
    // O padrao importa mais que a opcao: este e um jogo idle, e o normal e o
    // jogador deixar rodando onde escolheu.
    expect(useGameStateStore.getState().autoToggles.avancarDeEstagio).toBe(false)
    const world = fecharUltimaSala(E1)
    expect(world.avancarParaEstagio).toBeNull()
    expect(world.sala?.indice).toBe(0)
  })

  it('com o toggle LIGADO, pede o estagio seguinte', () => {
    useGameStateStore.getState().setAutoToggle('avancarDeEstagio', true)
    useGameStateStore.getState().setBiomaProgress(BIOMA, 1)
    const world = fecharUltimaSala(E1, { ...progressoPorBiomaDefault(), mata: 1 })
    expect(world.avancarParaEstagio).toBe(estagioId(BIOMA, 2))
  })

  it('com o toggle ligado e o seguinte BLOQUEADO, repete', () => {
    // O jogador nunca fica parado esperando uma hunt que nao vai abrir.
    useGameStateStore.getState().setAutoToggle('avancarDeEstagio', true)
    const world = fecharUltimaSala(E1)
    expect(world.avancarParaEstagio).toBeNull()
    expect(world.sala?.indice).toBe(0)
  })

  it('com o toggle ligado no ULTIMO estagio, repete', () => {
    useGameStateStore.getState().setAutoToggle('avancarDeEstagio', true)
    useGameStateStore.getState().setBiomaProgress(BIOMA, ESTAGIOS_POR_BIOMA)
    const completo = { ...progressoPorBiomaDefault(), mata: ESTAGIOS_POR_BIOMA }
    const world = fecharUltimaSala(estagioId(BIOMA, ESTAGIOS_POR_BIOMA), completo)
    expect(world.avancarParaEstagio).toBeNull()
  })

  it('o toggle nao dispara ao trocar de sala no MEIO do estagio', () => {
    useGameStateStore.getState().setAutoToggle('avancarDeEstagio', true)
    useGameStateStore.getState().setBiomaProgress(BIOMA, 1)
    const world = mundo(E1, { ...progressoPorBiomaDefault(), mata: 1 })
    world.sala = { indice: 0, chave: 'jungle', abates: ABATES_POR_SALA, ciclos: 0 }
    registrarAbate(world, E1)
    stepWorld(world, 5, useGameStateStore.getState(), { silent: true })
    expect(world.avancarParaEstagio).toBeNull()
  })
})
