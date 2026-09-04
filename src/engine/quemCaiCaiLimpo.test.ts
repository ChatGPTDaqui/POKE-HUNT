// PH-493: o POKE que desmaia perde a condição, e o "Recuar se perder".
//
// SÃO DUAS COISAS NO MESMO ARQUIVO porque as duas nascem do mesmo instante do
// jogo — o desmaio do POKE em campo — e o teste da segunda precisa exatamente do
// gatilho da primeira. Separá-las duplicaria a montagem do mundo sem separar
// nada de conceito.
//
// O BUG, palavras do dono do projeto: "ao morrer o pokemon continua com status
// negativo. e ao reviver ele continua com status negativo."
//
// As duas metades eram verdade. `apagarTodosOsEstagios` já rodava nos dois
// caminhos de revive desde a PH-418, mas a CONDIÇÃO (veneno, queimadura,
// paralisia, sono, congelamento) nunca era limpa em lugar nenhum do desmaio — e
// ela mora em `poke.status`, na mesma instância que o `gameStateStore` guarda e
// o flush grava. Um POKE que caía envenenado levantava envenenado, e o veneno o
// derrubava de novo: o mesmo laço que a PH-418 fechou para o estágio, entrando
// pela outra porta.
import { describe, expect, it, beforeEach, vi } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { BASIC_ATTACK } from '@/data/abilities'
import { buildMapWorld, stepWorld, DERROTAS_PARA_RECUAR, JANELA_DE_RECUO_SEGUNDOS } from './simulation'
import { limparEfeitosAoDesmaiar } from './systems/statusSystem'
import { estagioAnterior } from './systems/salaSystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { WorldState, WorldEntity } from './types'

vi.mock('@/stores/toastStore', () => ({
  useToastStore: { getState: () => ({ pushToast() {} }) },
}))

/** O estágio 3 de um bioma: tem para onde recuar, ao contrário do 1. */
const HUNT = 'mata_e3'

function mundo(semente = 7): WorldState {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', 20)
  return buildMapWorld(HUNT, poke, {
    seed: 0, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
}

/**
 * Derruba o POKE em campo POR DANO e roda UM tick.
 *
 * NÃO SERVE zerar `hp` nem marcar `fainted` na mão, e a primeira versão deste
 * arquivo tentou as duas: `playerJustFainted` — o sinal que dispara a limpeza e
 * o contador de recuo — só nasce dentro de `creditarMorteSeNecessario`, ou seja,
 * quando a morte passa por um golpe que POUSA ou por um tique de status. Um HP
 * zerado por fora deixa o motor com um POKE morto e nenhum evento, que é
 * exatamente o estado que o teste não pode confundir com "funcionou".
 *
 * Então o teste enfileira o golpe pendente que a produção enfileira, com o timer
 * já vencido, e deixa `updateCombat` resolver.
 */
function derrubarEmCampo(world: WorldState, dt = 0.1) {
  const inimigo = world.enemies[0]
  if (!inimigo) throw new Error('a hunt nasceu sem inimigo — o teste nao tem quem bata')
  world.player!.poke.hp = 1
  world.pendingHits.push({
    id: `hit-teste-${world.counters.pendingHit++}`,
    timer: 0,
    attackerId: inimigo.id,
    targetId: world.player!.id,
    ability: BASIC_ATTACK,
  })
  stepWorld(world, dt, useGameStateStore.getState(), { silent: true })
}

describe('quem cai, cai limpo (PH-493)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('o desmaio apaga condicao, volatil e estagio de uma vez', () => {
    const world = mundo()
    const eu = world.player!
    eu.poke.status = { tipo: 'poison', turnosRestantes: 5 }
    eu.statusVolatil = { tipo: 'confusion', turnosRestantes: 3 }
    eu.estagios = { atkFis: -2 }

    derrubarEmCampo(world)

    expect(eu.fainted, 'o POKE tinha que ter desmaiado — senao o teste nao mede nada').toBe(true)
    expect(eu.poke.status, 'o POKE caido continua envenenado').toBeNull()
    expect(eu.statusVolatil, 'o POKE caido continua confuso').toBeNull()
    expect(eu.estagios, 'o POKE caido continua com o Ataque derrubado').toEqual({})
  })

  it('o helper limpa as tres coisas — e a fonte do estagio junto', () => {
    // A FONTE IMPORTA, e esta é a lição da PH-418 escrita em
    // `apagarTodosOsEstagios`: zerar só `estagios` não limpa nada, porque
    // `recalcularEstagio` reescreve o cache a partir das fontes vivas no
    // próximo tick — o Rosnado voltava sozinho.
    const entidade = {
      poke: { status: { tipo: 'burn', turnosRestantes: 4 } },
      statusVolatil: { tipo: 'confusion', turnosRestantes: 2 },
      estagios: { speed: -1 },
      estagiosFonte: { speed: [{ tipo: 'golpe', id: 'growl', proprio: false, deQuem: 'Rattata' }] },
    } as unknown as WorldEntity

    limparEfeitosAoDesmaiar(entidade)

    expect(entidade.poke.status).toBeNull()
    expect(entidade.statusVolatil).toBeNull()
    expect(entidade.estagios).toEqual({})
    expect(entidade.estagiosFonte).toBeUndefined()
  })
})

describe('recuar se perder (PH-493)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('tres derrotas na janela pedem o estagio ANTERIOR', () => {
    useGameStateStore.getState().setAutoToggle('recuarSePerder', true)
    const world = mundo()

    for (let i = 0; i < DERROTAS_PARA_RECUAR; i++) {
      // Levanta de novo entre uma derrota e a seguinte: no jogo quem faz isso é
      // o Auto-Revive ou a troca por desmaio, e sem isso o segundo `stepWorld`
      // não teria ninguém para derrubar.
      world.player!.fainted = false
      world.player!.poke.hp = world.player!.poke.stats.hp
      derrubarEmCampo(world, 1)
    }

    expect(world.avancarParaEstagio, 'o recuo nao foi pedido').toBe(estagioAnterior(HUNT))
    expect(world.desmaiosRecentes, 'a lista tinha que zerar, senao recua duas vezes').toEqual([])
  })

  it('DUAS derrotas nao bastam — o gatilho e tres', () => {
    useGameStateStore.getState().setAutoToggle('recuarSePerder', true)
    const world = mundo()

    for (let i = 0; i < DERROTAS_PARA_RECUAR - 1; i++) {
      world.player!.fainted = false
      world.player!.poke.hp = world.player!.poke.stats.hp
      derrubarEmCampo(world, 1)
    }

    expect(world.avancarParaEstagio).toBeNull()
  })

  it('espacadas alem da janela nao recuam — e a JANELA que decide, nao a contagem', () => {
    // O caso que separa "estágio acima do meu time" de "morri três vezes hoje".
    // Sem a janela, um jogador que caísse uma vez por hora seria devolvido ao
    // estágio anterior no fim da tarde.
    useGameStateStore.getState().setAutoToggle('recuarSePerder', true)
    const world = mundo()

    for (let i = 0; i < DERROTAS_PARA_RECUAR; i++) {
      world.player!.fainted = false
      world.player!.poke.hp = world.player!.poke.stats.hp
      // Um tick longo o bastante para a derrota anterior sair da janela.
      derrubarEmCampo(world, JANELA_DE_RECUO_SEGUNDOS + 1)
    }

    expect(world.avancarParaEstagio).toBeNull()
  })

  it('com o toggle DESLIGADO nao recua, por mais que morra', () => {
    const world = mundo()
    for (let i = 0; i < DERROTAS_PARA_RECUAR + 2; i++) {
      world.player!.fainted = false
      world.player!.poke.hp = world.player!.poke.stats.hp
      derrubarEmCampo(world, 1)
    }
    expect(world.avancarParaEstagio).toBeNull()
  })
})

describe('para onde se recua (PH-493)', () => {
  it('o estagio 3 recua pro 2', () => {
    expect(estagioAnterior('mata_e3')).toBe('mata_e2')
  })

  it('o estagio 1 nao tem para onde recuar', () => {
    expect(estagioAnterior('mata_e1')).toBeNull()
  })

  it('hunt que nao e de estagio nao tem anterior nenhum', () => {
    // Rota 46, as 11 BOSS e a do Lance: `parseEstagioId` devolve `null` para
    // todas, e nas duas últimas morrer já é definitivo.
    expect(estagioAnterior('route_46')).toBeNull()
  })
})
