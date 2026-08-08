// O piso de venda de POKE (1000G) e regra de VENDA, e nao pode vazar pro ouro
// por abate.
//
// Os dois saem do mesmo numero bruto: `MONEY_FOR_KILL = sellValue /
// killDivisor`. Juntar as duas coisas numa funcao so — que e o jeito obvio de
// escrever isso — multiplicaria o ouro por kill na hunt inicial por volta de
// 60x sem ninguem ter pedido inflacao de farm, e o sintoma apareceria como
// "economia quebrada" muitas sessoes depois, longe do commit.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { pokemonSellValue, awardKillLoot } from './economySystem'
import { SPECIES, createPokeInstance } from '@/data/pokes'
import { getMap } from '@/data/maps'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { EnemyEntity } from '../types'

const PISO = 1000

describe('valor de POKE', () => {
  it('nenhuma venda sai abaixo do piso, nem a do POKE mais fraco possivel', () => {
    // Sentret Lv1 comum: o extremo inferior real do jogo (hunt inicial).
    expect(pokemonSellValue(1, SPECIES.sentret.baseExp, 'comum')).toBe(PISO)
  })

  it('raridade continua valendo acima do piso', () => {
    const comum = pokemonSellValue(100, SPECIES.dragonite.baseExp, 'comum')
    const mitico = pokemonSellValue(100, SPECIES.dragonite.baseExp, 'mythic')
    expect(comum).toBeGreaterThan(PISO)
    expect(mitico).toBeGreaterThan(comum)
  })

  it('ouro por abate NAO herda o piso de venda', () => {
    const gameState = useGameStateStore.getState()
    const rng = createRng(12345)
    const poke = createPokeInstance(rng, 'sentret', 1)
    const enemy = { poke } as EnemyEntity
    const mapDef = getMap('route_46')!

    const ouroAntes = useGameStateStore.getState().wallet.gold
    const { gold } = awardKillLoot(rng, gameState, enemy, mapDef)

    // Se o piso vazasse pra ca, este numero passaria de 300.
    expect(gold).toBeLessThan(PISO / 10)
    expect(useGameStateStore.getState().wallet.gold).toBe(ouroAntes + gold)
  })
})
