// Faixa de IV e chave de grupo do Mercado (27/10/2026, preco medio).
//
// PAR EXATO de `faixa_de_iv(int)` no SQL (migration
// 20261027100000_preco_de_referencia_do_mercado). O preco medio de um POKE e
// por espécie + shiny + FAIXA: se o cliente arredondasse 94 pra uma faixa e o
// servidor pra outra, o "ver no mercado" abriria um grupo e o preco viria de
// outro. `faixaDeIv.test.ts` le os limites direto do arquivo SQL.
import { averageIvPercent, type StatBlock } from '@/data/pokes'

export type FaixaDeIv = 'f0' | 'f60' | 'f80' | 'f95'

/** Limite INFERIOR de cada faixa, da maior pra menor. */
export const LIMITES_DE_FAIXA: ReadonlyArray<readonly [FaixaDeIv, number]> = [
  ['f95', 95],
  ['f80', 80],
  ['f60', 60],
  ['f0', 0],
]

export const ROTULO_DA_FAIXA: Record<FaixaDeIv, string> = {
  f95: 'IV perfeito',
  f80: 'IV ótimo',
  f60: 'IV bom',
  f0: 'IV comum',
}

/** `ivPercent` inteiro 0..100, igual ao `iv_percent` que o servidor grava no anuncio. */
export function faixaDeIv(ivPercent: number): FaixaDeIv {
  for (const [faixa, minimo] of LIMITES_DE_FAIXA) if (ivPercent >= minimo) return faixa
  return 'f0'
}

/**
 * O servidor arredonda a MEDIA dos seis IVs (`round(soma / 186 * 100)`); aqui o
 * mesmo arredondamento, pra a faixa da ficha bater com a do anuncio.
 */
export function ivPercentDoPoke(ivs: StatBlock): number {
  return Math.round(averageIvPercent(ivs))
}

export function chaveDePoke(speciesId: string, shiny: boolean, ivPercent: number): string {
  return `poke:${speciesId}:${shiny ? 1 : 0}:${faixaDeIv(ivPercent)}`
}

export function chaveDeItem(itemId: string): string {
  return `item:${itemId}`
}
