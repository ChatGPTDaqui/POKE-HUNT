// PH-144 — o aviso de suprimento tem que medir o que o BOT gastaria, e não uma
// lista de itens parecida com isso.
//
// Os dois casos que o jogador relatou, e que passavam despercebidos:
//
//   1. item DESLIGADO em `autoStatusConfig` continuava contando;
//   2. item com SUBSTITUTO em estoque continuava contando — cinquenta Max
//      Revive não impediam o aviso de gritar por Revive.
//
// Nenhum dos dois dá erro. O alerta simplesmente grita sem motivo, e um alerta
// que grita sem motivo é um alerta que o jogador aprende a ignorar — aí o dia
// em que faltar bola de verdade ele não vai ser lido.
import { describe, expect, it } from 'vitest'

import { ITEMS, type GeneratedItem } from '@/data/items'
import { BEST_POTION_OPTION } from '@/engine/systems/autoSystem'

import {
  itensEmUso, estoqueDoItemDeRegra, idsDaFamilia, rotuloDaFamilia,
  FAMILIA_REVIVE, FAMILIA_STATUS, LIMIAR_ESTOQUE_BAIXO,
} from './estoqueBaixo'

const TUDO_LIGADO = { autoPot: true, autoCatch: true, autoRevive: true, autoStatus: true }

function estado(over: Partial<Parameters<typeof itensEmUso>[0]> = {}) {
  return {
    autoToggles: TUDO_LIGADO,
    autoPotRules: [{ itemId: 'potion' }],
    autoCatchConfig: { ballId: 'poke_ball', shinyBallId: 'ultra_ball', catchShinyEnabled: false },
    autoCatchRules: [],
    autoStatusConfig: {},
    ...over,
  }
}

const REVIVES = Object.values(ITEMS).filter((i) => i.kind === 'revive').map((i) => i.id)

describe('o catálogo tem o que estes casos precisam (PH-144)', () => {
  it('existe mais de um item de revive', () => {
    // Guarda anti-teste-vácuo: com um revive só, "família de revive" não
    // significaria nada e os casos abaixo passariam sem provar nada.
    expect(REVIVES.length).toBeGreaterThan(1)
    expect(REVIVES).toContain('revive')
  })

  it('existe cura de status que cobre mais de um status', () => {
    // Full Heal é quem faz as seis famílias se sobreporem.
    const coberturas = Object.values(ITEMS)
      .filter((i): i is GeneratedItem => 'kind' in i && i.kind === 'status_heal')
      .map((i) => (i.healsStatus ?? []).length)
    expect(Math.max(...coberturas)).toBeGreaterThan(1)
  })
})

describe('substituto em estoque cala o aviso (PH-144)', () => {
  it('a família de revive soma TODOS os revives', () => {
    const semRevive = Object.fromEntries(REVIVES.map((id) => [id, 0]))
    const soMax = { ...semRevive, [REVIVES.find((id) => id !== 'revive')!]: 50 }
    // Era exatamente isto que o jogador reclamou: zero Revive, cinquenta Max
    // Revive, e o aviso gritando.
    expect(estoqueDoItemDeRegra(soMax, FAMILIA_REVIVE)).toBe(50)
    expect(estoqueDoItemDeRegra(soMax, FAMILIA_REVIVE)).toBeGreaterThanOrEqual(LIMIAR_ESTOQUE_BAIXO)
  })

  it('auto-revive ligado põe a FAMÍLIA em uso, e não o item `revive`', () => {
    const ids = itensEmUso(estado())
    expect(ids).toContain(FAMILIA_REVIVE)
    // O id cru não pode entrar: ele mediria só um dos revives.
    expect(ids).not.toContain('revive')
  })

  it('sem nenhum revive em estoque, o aviso continua valendo', () => {
    // O outro lado: agrupar não pode virar "nunca mais avisa".
    const zerado = Object.fromEntries(REVIVES.map((id) => [id, 0]))
    expect(estoqueDoItemDeRegra(zerado, FAMILIA_REVIVE)).toBe(0)
  })
})

describe('item desligado sai de uso (PH-144)', () => {
  it('cura de status desmarcada não conta no estoque da família', () => {
    const items = { antidote: 0, full_heal: 40 }
    const semAntidoto = { antidote: false }
    const familiaVeneno = `${FAMILIA_STATUS}poison`
    // Com o Antídoto desligado, quem cura veneno é o Full Heal — e ele está
    // cheio. O aviso não tem por que existir.
    expect(estoqueDoItemDeRegra(items, familiaVeneno, semAntidoto)).toBe(40)
    // Com ele ligado, o Antídoto entra na soma (e continua não gritando, porque
    // o Full Heal cobre).
    expect(idsDaFamilia(familiaVeneno, semAntidoto)).not.toContain('antidote')
    expect(idsDaFamilia(familiaVeneno, {})).toContain('antidote')
  })

  it('status sem NENHUMA cura habilitada sai da lista de uso', () => {
    // O jogador desmarcou tudo que cura aquilo: o bot não vai tentar, então não
    // há suprimento a acompanhar.
    const todasAsCurasDesligadas = Object.fromEntries(
      Object.values(ITEMS).filter((i) => i.kind === 'status_heal').map((i) => [i.id, false]),
    )
    const ids = itensEmUso(estado({ autoStatusConfig: todasAsCurasDesligadas }))
    expect(ids.some((id) => id.startsWith(FAMILIA_STATUS))).toBe(false)
  })

  it('com tudo habilitado, cada status curável vira uma família', () => {
    const ids = itensEmUso(estado()).filter((id) => id.startsWith(FAMILIA_STATUS))
    // Uma por status, e não uma família só: Antídoto e Despertar NÃO se
    // substituem, e somar os seis esconderia "tenho 50 Despertar e nada pra
    // veneno".
    expect(ids.length).toBeGreaterThan(1)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('automação desligada não gera aviso (PH-144)', () => {
  it.each([
    ['autoRevive', FAMILIA_REVIVE],
    ['autoCatch', 'poke_ball'],
  ] as const)('%s desligado tira o item de uso', (toggle, id) => {
    const ids = itensEmUso(estado({ autoToggles: { ...TUDO_LIGADO, [toggle]: false } }))
    expect(ids).not.toContain(id)
  })
})

describe('rótulos das famílias (PH-144)', () => {
  it('família tem nome próprio, item comum não', () => {
    // O aviso do chat escreve este texto. Sem rótulo, ele imprimiria
    // `familia:status:poison` na cara do jogador.
    expect(rotuloDaFamilia(FAMILIA_REVIVE)).toBe('Revives')
    expect(rotuloDaFamilia(`${FAMILIA_STATUS}poison`)).toContain('veneno')
    expect(rotuloDaFamilia(BEST_POTION_OPTION)).toContain('Poções')
    expect(rotuloDaFamilia('poke_ball')).toBeNull()
  })
})

describe('item comum continua medido sozinho (PH-144)', () => {
  it('bola não vira família', () => {
    // Agrupar tudo seria simples e errado: Poké Ball e Ultra Ball têm taxa de
    // captura diferente, e o jogador escolheu qual quer.
    expect(idsDaFamilia('poke_ball')).toEqual(['poke_ball'])
    expect(estoqueDoItemDeRegra({ poke_ball: 3, ultra_ball: 99 }, 'poke_ball')).toBe(3)
  })
})
