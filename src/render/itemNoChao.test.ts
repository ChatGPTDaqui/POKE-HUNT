// ITENS DO ABATE CAEM NO CHAO E VOAM PRA MOCHILA, COM BRILHO POR RARIDADE (11/10).
//
// Tranca: a raridade fixa por item (TM lendario, pedra incomum, Potion comum);
// que cada `rewardText` de item vira UM item no chao (e o ouro/XP continuam com
// as moedas); que itens do mesmo abate se espalham; e que o lendario fica mais
// tempo no chao e quica mais alto.
import { beforeEach, describe, expect, it } from 'vitest'

import { raridadeDoDrop, corDoDrop } from '@/data/raridadeDoDrop'
import { RARITIES } from '@/data/rarity'
import { tipoDaRecompensa } from '@/data/recompensaDoAbate'
import {
  contarItensNoChao, converterItensNovos, criarItemCaido, faseDoItem, posicaoDoItemNoChao,
  QUEDA_DO_ITEM, reiniciarItensNoChao,
} from './itemNoChao'

const naTela = (p: { x: number; y: number }) => p
const item = (id: string, itemId: string, x = 100, y = 100) => ({ id, type: 'rewardText', unit: 'item', itemId, x, y })

describe('raridade do drop', () => {
  it.each([
    ['tm_24', 'lendario'],
    ['tm_100', 'lendario'],
    ['stone_fire', 'incomum'],
    ['great_ball', 'incomum'],
    ['revive', 'raro'],
    ['max_revive', 'raro'],
    ['potion', 'comum'],
    ['poke_ball', 'comum'],
    ['item_que_ainda_nao_existe', 'comum'],
  ])('%s e %s', (itemId, esperado) => {
    expect(raridadeDoDrop(itemId)).toBe(esperado)
  })

  it('usa as cores da raridade de POKE', () => {
    expect(corDoDrop('lendario')).toBe(RARITIES.legendary.color)
    expect(corDoDrop('raro')).toBe(RARITIES.raro.color)
  })
})

describe('itens caindo no chao', () => {
  beforeEach(() => reiniciarItensNoChao())

  it('cada item do abate vira um item no chao; o mesmo efeito nao cai duas vezes', () => {
    converterItensNovos([item('effect-1', 'potion'), item('effect-2', 'tm_24')], naTela)
    expect(contarItensNoChao()).toBe(2)
    converterItensNovos([item('effect-1', 'potion'), item('effect-2', 'tm_24')], naTela)
    expect(contarItensNoChao()).toBe(2)
  })

  it('ouro e XP nao viram item (continuam com as moedas) e item nao vira moeda', () => {
    converterItensNovos([{ id: 'effect-1', type: 'rewardText', unit: '🪙', x: 1, y: 1 }], naTela)
    expect(contarItensNoChao()).toBe(0)
    expect(tipoDaRecompensa('item')).toBeNull()
  })

  it('fora da hunt (sem conversao pra tela) nada cai', () => {
    converterItensNovos([item('effect-1', 'potion')], () => null)
    expect(contarItensNoChao()).toBe(0)
  })

  it('itens do mesmo abate pousam em lugares diferentes', () => {
    const a = criarItemCaido('potion', { x: 0, y: 0 }, 0, 1)
    const b = criarItemCaido('stone_fire', { x: 0, y: 0 }, 1, 2)
    expect(Math.hypot(a.xc - b.xc, a.yc - b.yc)).toBeGreaterThan(5)
  })

  it('o lendario fica 4 s no chao; o comum 2 s', () => {
    const tm = criarItemCaido('tm_24', { x: 0, y: 0 }, 0, 1)
    const pocao = criarItemCaido('potion', { x: 0, y: 0 }, 0, 1)
    expect(faseDoItem(pocao, 2.1)).toBe('voo')
    expect(faseDoItem(tm, 2.1)).toBe('chao')
    expect(faseDoItem(tm, 4.1)).toBe('voo')
  })

  it('o lendario quica mais alto e pousa no ponto do chao', () => {
    const tm = criarItemCaido('tm_24', { x: 0, y: 0 }, 0, 1)
    const pocao = criarItemCaido('potion', { x: 0, y: 0 }, 0, 1)
    // No meio da queda a componente do quique domina.
    const meio = QUEDA_DO_ITEM / 2
    const alturaTm = posicaoDoItemNoChao(tm, meio)!.altura - (1 - 0.5) * (tm.yc - tm.y0)
    const alturaPocao = posicaoDoItemNoChao(pocao, meio)!.altura - (1 - 0.5) * (pocao.yc - pocao.y0)
    expect(alturaTm).toBeGreaterThan(alturaPocao)
    expect(posicaoDoItemNoChao(tm, QUEDA_DO_ITEM + 0.1)).toEqual({ x: tm.xc, y: tm.yc, altura: 0 })
  })
})
