// PH-382: a troca automatica por desmaio quebrava o invariante do slot 0.
//
// O modelo tem um invariante so, e o banco o impoe: `team[0]` E o POKE em campo.
// `definir_ativo` (RPC) rotaciona o escolhido pro slot 0 e grava
// `active_team_index = 0` SEMPRE; `refetchEquipeInteira` ordena por `team_slot`
// por causa disso; `reordenarReservas` recusa mexer no indice 0 nos dois lados.
//
// `trocarPorDesmaio` era o unico lugar do projeto que apontava `activeIndex` pra
// outro slot em vez de rotacionar. O estado torto ia pro banco pelo flush
// (`active_team_index = 1` numa conta real, 01/09) e a tela mostrava o POKE de
// campo duas vezes — ver `components/hud/reservaNaoRepeteOPokeEmCampo.test.tsx`.
//
// Este teste roda o caminho de verdade (`stepWorld` na arena do Lance, o mapa
// com `autoSwitchTeamOnFaint`), e nao a funcao isolada: o defeito era de
// integracao entre o motor e a store.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import type { PokeInstance } from '@/data/pokes'
import { ESPERA_DE_TROCA_SEGUNDOS } from '@/data/huntTypes'
import { LANCE_MAP_ID } from '@/data/nightmareMaps'
import { useGameStateStore } from '@/stores/gameStateStore'
import { buildMapWorld, stepWorld } from './simulation'

function poke(uid: string, hp: number): PokeInstance {
  return {
    uid,
    speciesId: 'rattata',
    level: 5,
    isShiny: false,
    rarity: 'comum',
    exp: 0,
    ivs: { hp: 10, atkFis: 10, atkEsp: 10, def: 10, defEsp: 10, speed: 10 },
    stats: { hp: 20, atkFis: 10, atkEsp: 10, def: 5, defEsp: 5, speed: 10 },
    hp,
    unlockedAbilities: [],
    activeAbilities: ['basic_attack'],
  }
}

/** Equipe de 3 com o de campo caido: a troca tem que escolher o do meio. */
function equipeComOAtivoCaido() {
  const gs = useGameStateStore.getState()
  gs.addPokeToTeam(poke('caido', 0))
  gs.addPokeToTeam(poke('reserva-1', 20))
  gs.addPokeToTeam(poke('reserva-2', 20))
  gs.setActiveIndex(0)
}

function mundoDoLance() {
  const gs = useGameStateStore.getState()
  return buildMapWorld(LANCE_MAP_ID, gs.team[gs.activeIndex], {
    seed: 0,
    rng: createRng(7),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
}

/**
 * Roda ate a PRIMEIRA troca e para ali.
 *
 * Parar importa: o Lance continua batendo, e com folga de sobra o substituto
 * tambem cai e uma SEGUNDA troca acontece — a equipe fica rotacionada duas
 * vezes e o teste passa a medir outra coisa.
 */
function correrAteATroca(world: ReturnType<typeof mundoDoLance>) {
  // Intro do Lance (contagem regressiva) + a espera de troca, com folga.
  const passos = Math.ceil((10 + ESPERA_DE_TROCA_SEGUNDOS) / 0.1)
  for (let i = 0; i < passos; i++) {
    stepWorld(world, 0.1, useGameStateStore.getState(), { silent: true })
    if (world.player!.poke.uid !== 'caido') return
  }
  throw new Error('a troca por desmaio nunca aconteceu')
}

describe('desmaio em campo rotaciona a equipe, nao so o indice (PH-382)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('o substituto vira o slot 0 e activeIndex volta a 0', () => {
    equipeComOAtivoCaido()
    const world = mundoDoLance()
    correrAteATroca(world)

    const depois = useGameStateStore.getState()
    expect(world.player!.poke.uid, 'nao trocou o POKE de campo').toBe('reserva-1')
    // O par que o defeito quebrava: `activeIndex` ia pra 1 e a ordem ficava
    // como estava, entao `team[0]` continuava sendo o POKE desmaiado.
    expect(depois.activeIndex, 'activeIndex saiu do slot 0').toBe(0)
    expect(depois.team[0].uid, 'o POKE em campo nao e o slot 0').toBe('reserva-1')
  })

  it('o POKE desmaiado continua na equipe, logo atras do que entrou', () => {
    equipeComOAtivoCaido()
    const world = mundoDoLance()
    correrAteATroca(world)

    // Rotacao, nao descarte: o desmaiado precisa continuar curavel no Hospital.
    const equipe = useGameStateStore.getState().team.map((p) => p.uid)
    expect(equipe).toEqual(['reserva-1', 'caido', 'reserva-2'])
  })

  it('o POKE em campo nunca esta entre as reservas (team.slice(1))', () => {
    equipeComOAtivoCaido()
    const world = mundoDoLance()
    correrAteATroca(world)

    // A leitura que o trilho de reservas fazia. Sem a rotacao, o POKE de campo
    // caia aqui dentro e aparecia duas vezes na tela.
    const reservas = useGameStateStore.getState().team.slice(1).map((p) => p.uid)
    expect(reservas).not.toContain(world.player!.poke.uid)
  })
})
