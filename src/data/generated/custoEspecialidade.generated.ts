// AUTO-GERADO por `npm run custo:especialidade`. Nao editar a mao.
//
// Custo em Stone por tipo e por nivel (PH-198/PH-246). Escala com a OFERTA de
// Stone de cada tipo, medida por `src/data/ofertaDeStone.ts` sobre os
// `enemyPool` de verdade. O par de migrations `*_custo_especialidade_*.sql` sai
// do MESMO laco, e `custoDeEspecialidade.test.ts` reprova se os dois sairem de
// sincronia.
import type { ElementType } from './types'

/** Ouro por nivel — igual pros 18 tipos: ouro nao tem oferta por tipo. */
export const ESPECIALIDADE_GOLD_POR_NIVEL: readonly number[] = [500, 1000, 2000, 3500, 6000, 10000, 15000, 22000, 32000, 45000]

export const ESPECIALIDADE_STONE_POR_NIVEL: Record<ElementType, readonly number[]> = {
  NORMAL: [3, 5, 7, 11, 15, 21, 29, 37, 47, 62],
  FIRE: [6, 10, 15, 23, 33, 45, 60, 77, 100, 131],
  WATER: [6, 10, 15, 23, 33, 45, 60, 77, 100, 131],
  ELECTRIC: [6, 10, 15, 23, 33, 45, 60, 77, 100, 131],
  GRASS: [3, 5, 8, 11, 16, 22, 30, 39, 50, 66],
  ICE: [6, 10, 15, 23, 33, 45, 60, 77, 100, 131],
  FIGHTING: [2, 3, 4, 7, 9, 13, 17, 22, 29, 38],
  POISON: [2, 3, 4, 6, 9, 12, 17, 21, 28, 36],
  GROUND: [6, 10, 15, 23, 33, 45, 60, 77, 100, 131],
  FLYING: [3, 5, 8, 11, 16, 22, 30, 39, 50, 66],
  PSYCHIC: [6, 10, 15, 23, 33, 45, 60, 77, 100, 131],
  BUG: [1, 2, 4, 5, 8, 11, 14, 18, 24, 31],
  ROCK: [6, 10, 15, 23, 33, 45, 60, 77, 100, 131],
  GHOST: [2, 3, 4, 7, 9, 13, 17, 23, 29, 38],
  DRAGON: [3, 5, 8, 11, 16, 22, 30, 39, 50, 66],
  DARK: [1, 2, 2, 4, 5, 8, 10, 13, 17, 22],
  STEEL: [6, 10, 15, 23, 33, 45, 60, 77, 100, 131],
  FAIRY: [1, 1, 1, 1, 2, 3, 4, 5, 7, 9],
}
