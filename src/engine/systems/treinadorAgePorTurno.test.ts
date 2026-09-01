// PH-378: o Treinador age UMA VEZ POR TURNO, como todo mundo.
//
// O QUE ISTO TRANCA, e por que precisa de teste. `COOLDOWN_DO_TREINADOR` era
// 1,5s FIXO. Com o turno em 2s isso dava 1,33 item por turno; quando a PH-376
// esticou o turno pra 3s, o MESMO 1,5s passou a dar 2,00 — o Treinador ganhou
// ritmo de graca so porque o turno de todo mundo esticou, e nada no codigo
// acusava isso. Amarrado ao turno, a regra vira uma frase e o teste guarda a
// frase.
//
// O caso que reprova de verdade e o SEGUNDO: com cooldown solto, uma segunda
// cura entra dentro do mesmo turno.
import { beforeEach, describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { TURNO_SEGUNDOS } from '@/data/abilities'
import { buildMapWorld } from '../simulation'
import { updateAutoHeal } from './autoSystem'
import { useGameStateStore } from '@/stores/gameStateStore'

/** POKE machucado, com potion e antidoto de sobra, e os dois toggles ligados. */
function cenario() {
  const rng = createRng(7)
  const poke = createPokeInstance(rng, 'charmander', 30)
  const world = buildMapWorld('route_46', poke, {
    seed: 0, rng, counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  const player = world.player!
  // 10% de HP: abaixo de qualquer regra de pocao, e abaixo do HP critico.
  player.poke.hp = Math.max(1, Math.round(player.poke.stats.hp * 0.1))

  useGameStateStore.setState({
    items: { potion: 99, antidote: 99 },
    autoToggles: {
      autoPot: true, autoCatch: false, autoRevive: false,
      autoStatus: true, avancoManualDeSala: false,
    },
  })
  return { world, player, gameState: useGameStateStore.getState() }
}

describe('o Treinador age uma vez por turno (PH-378)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('a primeira cura sai na hora', () => {
    const { world, gameState } = cenario()
    expect(updateAutoHeal(world, gameState, 0.1).length).toBe(1)
  })

  it('nao sai uma SEGUNDA cura dentro do mesmo turno', () => {
    // O coracao da issue. Com `COOLDOWN_DO_TREINADOR` em 1,5s e o turno em 3s,
    // esta segunda chamada passava — dois itens por turno.
    const { world, player, gameState } = cenario()
    expect(updateAutoHeal(world, gameState, 0.1).length).toBe(1)

    // Machuca de novo pra a regra de pocao continuar valendo, e anda ATE ANTES
    // do fim do turno.
    player.poke.hp = Math.max(1, Math.round(player.poke.stats.hp * 0.1))
    const quaseUmTurno = TURNO_SEGUNDOS - 0.2
    expect(updateAutoHeal(world, gameState, quaseUmTurno)).toEqual([])
  })

  it('passado o turno, o Treinador age de novo', () => {
    const { world, player, gameState } = cenario()
    expect(updateAutoHeal(world, gameState, 0.1).length).toBe(1)

    player.poke.hp = Math.max(1, Math.round(player.poke.stats.hp * 0.1))
    // O passo de 0,1s da primeira chamada JA descontou do timer, entao o que
    // falta e um turno menos aquilo. Somar folga em vez de calcular na unha
    // deixaria o teste passar mesmo com cooldown menor.
    expect(updateAutoHeal(world, gameState, TURNO_SEGUNDOS).length).toBe(1)
  })

  it('o cooldown E o turno, e nao um numero solto ao lado dele', () => {
    // Guarda de intencao: se alguem voltar a escrever 1.5 (ou qualquer outro
    // literal), este caso cai. Medido pelo COMPORTAMENTO, porque a constante
    // nao e exportada — e exporta-la so pro teste nao provaria que o codigo a
    // usa.
    const { world, player, gameState } = cenario()
    updateAutoHeal(world, gameState, 0.1)

    // Um pouco antes do turno: nada. Um pouco depois: age.
    player.poke.hp = Math.max(1, Math.round(player.poke.stats.hp * 0.1))
    expect(updateAutoHeal(world, gameState, TURNO_SEGUNDOS - 0.3)).toEqual([])
    expect(updateAutoHeal(world, gameState, 0.4).length).toBe(1)
  })
})
