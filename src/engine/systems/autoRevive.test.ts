// PH-144 — o auto-revive só usava `revive`, literal no código.
//
// O seletor da tela sempre ofereceu todos os itens de revive, e o bot nunca
// encostou em nenhum outro. Quem tinha cinquenta Max Revive e nenhum Revive
// comum ficava com a automação MORTA: o POKE desmaiava, o bot não levantava, e
// nada na tela explicava. O aviso de suprimento então gritava por Revive — o
// item que o jogador nem queria usar.
//
// Foi assim que o defeito apareceu: o usuário reclamou do AVISO, e o aviso
// estava certo sobre um bot que estava errado.
import { beforeEach, describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { ITEMS, type GeneratedItem } from '@/data/items'
import { useGameStateStore } from '@/stores/gameStateStore'

import { buildMapWorld } from '../simulation'
import { updateAutoHeal } from './autoSystem'

const REVIVES = Object.values(ITEMS)
  .filter((i): i is GeneratedItem => 'kind' in i && i.kind === 'revive' && i.reviveHpPercent != null)
  .sort((a, b) => a.buyPrice - b.buyPrice)

function cenario(itens: Record<string, number>) {
  const rng = createRng(5)
  const poke = createPokeInstance(rng, 'charmander', 30)
  const world = buildMapWorld('route_46', poke, {
    seed: 0, rng, counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  const player = world.player!
  player.poke.hp = 0
  player.fainted = true
  world.reviveCountdown = 0

  useGameStateStore.setState({
    items: { ...itens },
    autoToggles: { autoPot: false, autoCatch: false, autoRevive: true, autoStatus: false, avancarDeEstagio: false, recuarSePerder: false },
  })
  return { world, player, gameState: useGameStateStore.getState() }
}

describe('auto-revive (PH-144)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('o catálogo tem mais de um revive', () => {
    // Guarda anti-teste-vácuo: com um só, "escolhe o mais barato" não
    // significaria nada e os casos abaixo passariam sem provar nada.
    expect(REVIVES.length).toBeGreaterThan(1)
  })

  it('levanta o POKE usando SÓ Max Revive, sem nenhum Revive comum', () => {
    // O caso relatado. Antes disto o bot não fazia nada aqui.
    const caro = REVIVES[REVIVES.length - 1]
    const { world, player, gameState } = cenario({ [caro.id]: 50 })

    const eventos = updateAutoHeal(world, gameState, 0.1)

    expect(eventos).toEqual([{ type: 'auto_revive', itemId: caro.id }])
    expect(player.fainted).toBe(false)
    expect(player.poke.hp).toBeGreaterThan(0)
    expect(useGameStateStore.getState().items[caro.id]).toBe(49)
  })

  it('tendo os dois, gasta o MAIS BARATO', () => {
    // Mesma economia do auto-status: queimar o Max Revive (que devolve HP
    // cheio) quando um Revive comum resolve é desperdício.
    const barato = REVIVES[0]
    const caro = REVIVES[REVIVES.length - 1]
    const { world, gameState } = cenario({ [barato.id]: 5, [caro.id]: 5 })

    const eventos = updateAutoHeal(world, gameState, 0.1)

    expect(eventos).toEqual([{ type: 'auto_revive', itemId: barato.id }])
    expect(useGameStateStore.getState().items[caro.id]).toBe(5)
  })

  it('o HP devolvido é o do item que foi usado', () => {
    // Cada revive devolve uma fração diferente. Usar o item A e aplicar a
    // fração do item B é o erro que a versão anterior tornava impossível de
    // ver, porque só existia um item.
    const caro = REVIVES[REVIVES.length - 1]
    const { world, player, gameState } = cenario({ [caro.id]: 1 })

    updateAutoHeal(world, gameState, 0.1)

    expect(player.poke.hp).toBe(Math.round(player.poke.stats.hp * caro.reviveHpPercent!))
  })

  it('sem nenhum revive, não levanta e não gasta nada', () => {
    const zerado = Object.fromEntries(REVIVES.map((i) => [i.id, 0]))
    const { world, player, gameState } = cenario(zerado)

    expect(updateAutoHeal(world, gameState, 0.1)).toEqual([])
    expect(player.fainted).toBe(true)
  })
})
