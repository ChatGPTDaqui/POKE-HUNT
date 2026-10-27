// Preco medio do Mercado (27/10/2026): faixas de IV, sugestao, aviso e lote.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PrecoDeReferencia } from '@/data/remote/mercadoRpc'
import { chaveDeItem, chaveDePoke, faixaDeIv, LIMITES_DE_FAIXA } from './faixaDeIv'
import { avisoDePreco, buscarPreco, precoSugerido, referenciaDe, textoDaReferencia } from './precoDeReferencia'


const rpc = vi.hoisted(() => ({ precoDeReferencia: vi.fn() }))
vi.mock('@/data/remote/mercadoRpc', async (orig) => ({ ...(await orig<object>()), precoDeReferencia: rpc.precoDeReferencia }))

function preco(p: Partial<PrecoDeReferencia>): PrecoDeReferencia {
  return { chave: 'x', currency: 'gold', medianaDe7Dias: null, vendasDe7Dias: 0, aPartirDe: null, anuncios: 0, ...p }
}

describe('faixa de IV', () => {
  it('limites: 59/60, 79/80, 94/95', () => {
    expect([0, 59, 60, 79, 80, 94, 95, 100].map(faixaDeIv)).toEqual(['f0', 'f0', 'f60', 'f60', 'f80', 'f80', 'f95', 'f95'])
  })

  it('o SQL usa os MESMOS limites (par cliente x servidor)', () => {
    // Ver o cabecalho de faixaDeIv.ts: faixa divergente faz o "ver no mercado"
    // abrir um grupo e o preco vir de outro.
    const dir = join(process.cwd(), 'supabase/migrations')
    for (const arq of readdirSync(dir).filter((f) => /preco_de_referencia_do_mercado_(public|dev)\.sql$/.test(f))) {
      const sql = readFileSync(join(dir, arq), 'utf8')
      for (const [faixa, minimo] of LIMITES_DE_FAIXA) {
        if (minimo === 0) continue
        expect(sql, `${arq}: ${faixa}`).toContain(`when p >= ${minimo} then '${faixa}'`)
      }
    }
  })

  it('chaves no formato que a RPC aceita', () => {
    expect(chaveDePoke('charizard', true, 96)).toBe('poke:charizard:1:f95')
    expect(chaveDePoke('pichu', false, 12)).toBe('poke:pichu:0:f0')
    expect(chaveDeItem('potion')).toBe('item:potion')
  })
})

describe('sugestao e aviso de preco', () => {
  it('sugere a mediana; sem ela, um abaixo do mais barato; sem nada, nada', () => {
    expect(precoSugerido(preco({ medianaDe7Dias: 500, aPartirDe: 300 }))).toBe(500)
    expect(precoSugerido(preco({ aPartirDe: 300 }))).toBe(299)
    expect(precoSugerido(preco({ aPartirDe: 1 }))).toBe(1)
    expect(precoSugerido(preco({}))).toBeNull()
    expect(precoSugerido(null)).toBeNull()
  })

  it('referencia: mediana antes do "a partir de"', () => {
    expect(referenciaDe(preco({ medianaDe7Dias: 500, aPartirDe: 300 }))).toBe(500)
    expect(referenciaDe(preco({ aPartirDe: 300 }))).toBe(300)
  })

  it('avisa abaixo de 50% e acima de 200%, nunca no meio', () => {
    const p = preco({ medianaDe7Dias: 1000 })
    expect(avisoDePreco(499, p)).toEqual({ tipo: 'baixo', referencia: 1000 })
    expect(avisoDePreco(500, p)).toBeNull()
    expect(avisoDePreco(2000, p)).toBeNull()
    expect(avisoDePreco(2001, p)).toEqual({ tipo: 'alto', referencia: 1000 })
    expect(avisoDePreco(10, preco({}))).toBeNull()
    expect(avisoDePreco(null, p)).toBeNull()
  })

  it('texto: preco medio com vendas; sem vendas diz isso e nunca mostra zero', () => {
    expect(textoDaReferencia(preco({ medianaDe7Dias: 1200, vendasDe7Dias: 1 }), 'gold')).toContain('Preço médio 🪙 1.200 (1 venda em 7 dias)')
    expect(textoDaReferencia(preco({ aPartirDe: 800 }), 'diamond')).toBe('Sem vendas recentes · à venda a partir de ◆ 800')
    expect(textoDaReferencia(null, 'gold')).toBe('Sem vendas recentes')
  })
})

describe('busca em lote', () => {
  afterEach(() => { rpc.precoDeReferencia.mockReset() })

  it('chaves pedidas no mesmo tique viram UMA chamada, e cada uma recebe so as suas linhas', async () => {
    rpc.precoDeReferencia.mockResolvedValue([
      preco({ chave: 'item:potion', medianaDe7Dias: 10 }),
      preco({ chave: 'poke:pichu:0:f0', aPartirDe: 50, currency: 'diamond' }),
    ])
    const [a, b, c] = await Promise.all([buscarPreco('item:potion'), buscarPreco('poke:pichu:0:f0'), buscarPreco('item:potion')])
    expect(rpc.precoDeReferencia).toHaveBeenCalledTimes(1)
    expect(rpc.precoDeReferencia.mock.calls[0][0].sort()).toEqual(['item:potion', 'poke:pichu:0:f0'])
    expect(a.map((l) => l.chave)).toEqual(['item:potion'])
    expect(b[0].currency).toBe('diamond')
    expect(c).toEqual(a)
  })

  it('erro do servidor chega em todos os pedidos do lote', async () => {
    rpc.precoDeReferencia.mockRejectedValue(new Error('caiu'))
    await expect(Promise.all([buscarPreco('item:a'), buscarPreco('item:b')])).rejects.toThrow('caiu')
  })
})
