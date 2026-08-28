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
import { pokemonSellValue, awardKillLoot, sellAllBagPokes } from './economySystem'
import { SPECIES, createPokeInstance } from '@/data/pokes'
import { getMap } from '@/data/maps'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { EnemyEntity } from '../types'

const PISO = 1000

describe('valor de POKE', () => {
  it('nenhuma venda sai abaixo do piso, nem a do POKE mais fraco possivel', () => {
    // Sentret Lv1 comum: o extremo inferior real do jogo (hunt inicial).
    expect(pokemonSellValue(1, SPECIES.sentret.baseExp, 'comum')).toBeGreaterThanOrEqual(PISO)
  })

  // O piso e BASE, nao teto disfarcado: com `max(piso, formula)` todo POKE
  // abaixo de 1000 valia exatamente igual e nivel nao mudava nada ate a formula
  // ultrapassar o piso sozinha. Somando, o nivel vale desde o primeiro ponto.
  it('nivel continua valendo mesmo na faixa em que a formula fica abaixo do piso', () => {
    const fraco = pokemonSellValue(1, SPECIES.sentret.baseExp, 'comum')
    const forte = pokemonSellValue(20, SPECIES.sentret.baseExp, 'comum')
    expect(forte).toBeGreaterThan(fraco)
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

// PH-24: a UI ja exclui POKE shiny da selecao de venda em lote, mas uma
// request forjada direto pra `venderPokes` (bypassando a UI) bate no servidor
// sem passar por ela. `sellAllBagPokes` e a MESMA funcao usada pelo servidor
// (bundle em authority/engine/), entao ela e a revalidacao — nao pode confiar so
// no `locked`.
describe('sellAllBagPokes — defesa em profundidade (PH-24)', () => {
  it('pula POKE shiny mesmo destrancado, mesmo com o uid explicitamente pedido', () => {
    const gameState = useGameStateStore.getState()
    const rng = createRng(2026)

    const shiny = createPokeInstance(rng, 'sentret', 5)
    shiny.isShiny = true
    shiny.locked = false
    gameState.addCapturedPoke(shiny)

    const normal = createPokeInstance(rng, 'sentret', 5)
    normal.isShiny = false
    normal.locked = false
    gameState.addCapturedPoke(normal)

    const ouroAntes = useGameStateStore.getState().wallet.gold
    const { pokeCount } = sellAllBagPokes(useGameStateStore.getState(), [shiny.uid, normal.uid])

    expect(pokeCount).toBe(1)
    const bagUids = useGameStateStore.getState().bagPokes.map((p) => p.uid)
    expect(bagUids).toContain(shiny.uid)
    expect(bagUids).not.toContain(normal.uid)
    expect(useGameStateStore.getState().wallet.gold).toBeGreaterThan(ouroAntes)
  })
})

// PH-246: a Pedra FLYING nao caia de lugar nenhum. `awardKillLoot` dropava a
// Stone do tipo PRIMARIO da vitima, e NENHUMA das 245 especies do catalogo tem
// FLYING como primario — ele so existe como `type2`. A tela de Especialidades
// anunciava os 10 niveis de FLYING com preco que nunca podia ser pago, e o
// maximo de `progressoGlobal` era inatingivel junto.
//
// Estes casos exercitam a FUNCAO, e nao um modelo dela: `ofertaDeStone.ts`
// espelha esta regra pra calcular o custo de cada tipo, e sem um teste que
// chame `awardKillLoot` de verdade um revert no motor deixaria o espelho
// mentindo em silencio.
describe('Stone de abate cobre os dois tipos da vitima (PH-246)', () => {
  function stonesDe(speciesId: string, tentativas: number): Set<string> {
    const gameState = useGameStateStore.getState()
    const mapDef = getMap('route_46')!
    const saiu = new Set<string>()
    for (let i = 0; i < tentativas; i++) {
      const rng = createRng(1000 + i)
      const poke = createPokeInstance(rng, speciesId, 5)
      const { droppedItems } = awardKillLoot(rng, gameState, { poke } as EnemyEntity, mapDef)
      for (const id of droppedItems) if (id.startsWith('stone_')) saiu.add(id)
    }
    return saiu
  }

  it('zubat (POISON/FLYING) solta Pedra FLYING, e nao so a do primario', () => {
    const zubat = SPECIES.zubat
    expect(zubat.type).toBe('POISON')
    expect(zubat.type2).toBe('FLYING')

    const saiu = stonesDe('zubat', 400)
    expect(saiu, 'nenhuma Stone saiu em 400 abates — o teste nao mediu nada').not.toEqual(new Set())
    expect([...saiu].sort()).toEqual(['stone_flying', 'stone_poison'])
  })

  it('especie de um tipo so continua soltando apenas a Stone dele', () => {
    // O sorteio novo nao pode inventar um segundo tipo onde nao existe.
    expect(SPECIES.rattata.type2).toBeFalsy()
    expect([...stonesDe('rattata', 200)]).toEqual(['stone_normal'])
  })
})
