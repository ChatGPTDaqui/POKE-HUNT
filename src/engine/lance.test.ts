// A sequencia do Campeao Lance: os 6 POKEs dele entram um a um, so o proximo
// depois do anterior cair, ate esgotar a equipe — e do outro lado, o time do
// JOGADOR troca pro proximo poke vivo a cada desmaio (`autoSwitchTeamOnFaint`)
// ate ele tambem esgotar.
//
// Ja quebrou por levas (`sequenceIndex` reiniciando a cada janela de flush do
// servidor, ver a nota de `salas.test.ts`) sem nenhum erro visivel — so o
// proximo POKE nunca entrando. O caso que mais importa aqui NAO e a simulacao
// continua (essa e o caminho facil): e sobreviver a RECONSTRUCAO do mundo a
// cada janela, que e como o servidor de verdade avanca a luta.
import { describe, expect, it, beforeEach } from 'vitest'
import { createRng } from '@/core/rng'
import type { PokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld, type ProgressoDaSessao } from './simulation'
import { useGameStateStore } from '@/stores/gameStateStore'
import { LANCE_MAP_ID } from '@/data/nightmareMaps'

const ORDEM_REAL_DO_LANCE = ['gyarados', 'dragonite', 'charizard', 'dragonite', 'aerodactyl', 'dragonite']

function pokeFragil(uid: string): PokeInstance {
  return {
    uid,
    speciesId: 'rattata',
    level: 5,
    isShiny: false,
    rarity: 'comum',
    exp: 0,
    ivs: { hp: 10, atkFis: 10, atkEsp: 10, def: 10, defEsp: 10, speed: 10 },
    stats: { hp: 20, atkFis: 10, atkEsp: 10, def: 5, defEsp: 5, speed: 10 },
    hp: 20,
    unlockedAbilities: [],
    // Precisa gastar um slot no Ataque Basico desde 2026-08-18: antes ele era
    // injetado de graca como posicao fixa da rotacao, e estas fixtures nao
    // conhecem golpe NENHUM. Sem isto o POKE fica sem nada pra usar e os testes
    // de sequencia falham por um motivo que nao tem a ver com a sequencia.
    activeAbilities: ['basic_attack'],
  }
}

// So precisa vencer de longe, contra qualquer um dos 6 Lv55-65 do Lance — o
// alvo destes testes e a MAQUINA de estados, nao o combate em si.
function pokeAbsurdo(): PokeInstance {
  return {
    uid: 'destruidor',
    speciesId: 'mewtwo',
    level: 100,
    isShiny: false,
    rarity: 'mythic',
    exp: 0,
    ivs: { hp: 31, atkFis: 31, atkEsp: 31, def: 31, defEsp: 31, speed: 31 },
    stats: { hp: 99999, atkFis: 99999, atkEsp: 99999, def: 99999, defEsp: 99999, speed: 500 },
    hp: 99999,
    unlockedAbilities: [],
    // Precisa gastar um slot no Ataque Basico desde 2026-08-18: antes ele era
    // injetado de graca como posicao fixa da rotacao, e estas fixtures nao
    // conhecem golpe NENHUM. Sem isto o POKE fica sem nada pra usar e os testes
    // de sequencia falham por um motivo que nao tem a ver com a sequencia.
    activeAbilities: ['basic_attack'],
  }
}

describe('Campeao Lance — sequencia', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('numa simulacao continua, os 6 entram na ordem real', () => {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(pokeAbsurdo())
    gs.setActiveIndex(0)
    const gameState = useGameStateStore.getState()
    const world = buildMapWorld(LANCE_MAP_ID, gameState.team[0], { seed: 0,
      rng: createRng(1),
      counters: { entity: 1, effect: 1, pendingHit: 1 },
    })

    const especiesVistas: string[] = []
    let ultimoId: string | null = null
    for (let i = 0; i < 6000 && !world.sequenceCleared; i++) {
      stepWorld(world, 0.1, gameState, { silent: true })
      const vivo = world.enemies.find((e) => e.poke.hp > 0)
      if (vivo && vivo.id !== ultimoId) {
        ultimoId = vivo.id
        especiesVistas.push(vivo.poke.speciesId)
      }
    }

    expect(especiesVistas).toEqual(ORDEM_REAL_DO_LANCE)
    expect(world.sequenceCleared).toBe(true)
  })

  it('sobrevive a reconstrucao do mundo a cada janela (simula o flush do servidor)', () => {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(pokeAbsurdo())
    gs.setActiveIndex(0)
    const gameState = useGameStateStore.getState()

    let progresso: ProgressoDaSessao | undefined
    let world = buildMapWorld(LANCE_MAP_ID, gameState.team[0], { seed: 0,
      rng: createRng(1),
      counters: { entity: 1, effect: 1, pendingHit: 1 },
    }, progresso)

    const especiesVistas: string[] = []
    let ultimoId: string | null = null
    for (let janela = 0; janela < 40 && !world.sequenceCleared; janela++) {
      // ~30s por janela, passo de 0.1s = 300 ticks — o mesmo passo do flush real.
      for (let i = 0; i < 300 && !world.sequenceCleared; i++) {
        stepWorld(world, 0.1, gameState, { silent: true })
        const vivo = world.enemies.find((e) => e.poke.hp > 0)
        if (vivo && vivo.id !== ultimoId) {
          ultimoId = vivo.id
          especiesVistas.push(vivo.poke.speciesId)
        }
      }
      progresso = { sequenceIndex: world.sequenceIndex, sequenceCleared: world.sequenceCleared, sala: world.sala }
      world = buildMapWorld(LANCE_MAP_ID, gameState.team[0], { seed: 0, rng: world.rng, counters: world.counters }, progresso)
    }

    expect(especiesVistas).toEqual(ORDEM_REAL_DO_LANCE)
    expect(world.sequenceCleared).toBe(true)
  })

  // BUG REAL (server/src/progresso.ts#simularSessao): a janela seguinte
  // reconstruia o mundo com o UID do POKE que abriu a SESSAO, nao com quem
  // estava de fato em campo quando a janela anterior terminou.
  // `autoSwitchTeamOnFaint` troca `world.player.poke` no meio da simulacao
  // (POKE 1 cai, POKE 2 entra) — mas como o Lance raramente cai numa unica
  // janela de ~30s, a proxima janela usava o UID congelado do POKE 1, que ja
  // tinha desmaiado. Sem faint FRESCO nesta janela pra disparar o
  // auto-switch de novo, o mundo so via um cadaver parado: sessao encerrada
  // por "desmaio sem revive" com o resto da equipe vivo e intacto — o Lance
  // ficava inganhavel a partir da primeira troca. Este teste imita o
  // contrato que `simularSessao` tem que seguir: cada janela reconstroi a
  // partir do UID de quem REALMENTE estava em campo no fim da anterior.
  it('reconstrucao por janela usa quem estava em campo, nao o POKE que abriu a sessao', () => {
    const gs = useGameStateStore.getState()
    // POKE 1: fraco dos dois lados (ataque E hp) — nunca chega a derrotar o
    // Gyarados sozinho, e cai rapido, garantindo uma troca de verdade logo na
    // primeira janela (nao um "solo silencioso" que nunca troca de ninguem).
    gs.addPokeToTeam({ ...pokeFragil('abre-sessao') })
    // POKE 2: absurdo de verdade, fecha a sequencia inteira sozinho a partir
    // dai (inclusive o Gyarados, que o POKE 1 nao derrubou).
    gs.addPokeToTeam({ ...pokeAbsurdo(), uid: 'assume-depois' })
    gs.setActiveIndex(0)
    const gameState = useGameStateStore.getState()

    // O UID de quem a sessao considera "em campo" — imita `sessao.poke_uid`
    // no banco, atualizado a cada janela com o fix (era gravado so uma vez,
    // na abertura, no bug).
    let pokeEmCampo = gameState.team[0].uid
    let progresso: ProgressoDaSessao | undefined
    let world = buildMapWorld(LANCE_MAP_ID, gameState.team[0], { seed: 0,
      rng: createRng(1),
      counters: { entity: 1, effect: 1, pendingHit: 1 },
    }, progresso)

    for (let janela = 0; janela < 20 && !world.sequenceCleared; janela++) {
      for (let i = 0; i < 300 && !world.sequenceCleared; i++) {
        stepWorld(world, 0.1, gameState, { silent: true })
      }
      pokeEmCampo = world.player!.poke.uid
      progresso = { sequenceIndex: world.sequenceIndex, sequenceCleared: world.sequenceCleared, sala: world.sala }
      const ativo = gameState.team.find((p) => p.uid === pokeEmCampo)!
      world = buildMapWorld(LANCE_MAP_ID, ativo, { seed: 0, rng: world.rng, counters: world.counters }, progresso)
    }

    expect(pokeEmCampo).toBe('assume-depois')
    expect(world.sequenceCleared).toBe(true)
  })

  it('time do jogador troca de poke a cada desmaio, ate esgotar a equipe', () => {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(pokeFragil('r1'))
    gs.addPokeToTeam(pokeFragil('r2'))
    gs.addPokeToTeam(pokeFragil('r3'))
    gs.setActiveIndex(0)
    const gameState = useGameStateStore.getState()
    const world = buildMapWorld(LANCE_MAP_ID, gameState.team[0], { seed: 0,
      rng: createRng(1),
      counters: { entity: 1, effect: 1, pendingHit: 1 },
    })

    const idsVistos: string[] = []
    let ultimoUid: string | null = null
    for (let i = 0; i < 3000; i++) {
      stepWorld(world, 0.1, gameState, { silent: true })
      const uidAtual = world.player!.poke.uid
      if (uidAtual !== ultimoUid) {
        ultimoUid = uidAtual
        idsVistos.push(uidAtual)
      }
      if (gameState.team.every((p) => p.hp <= 0)) break // time inteiro desmaiado: nada mais pode acontecer
    }

    expect(idsVistos).toEqual(['r1', 'r2', 'r3'])
    expect(world.player!.fainted).toBe(true)
    expect(gameState.team.every((p) => p.hp <= 0)).toBe(true)
  })
})
