// AUTO-GERADO por `npm run custo:especialidade`. Nao editar a mao.
//
// Custo em Stone por tipo e por nivel (PH-198/PH-246). Escala com a OFERTA de
// Stone de cada tipo, medida por `src/data/ofertaDeStone.ts` sobre os
// `enemyPool` de verdade. O par de migrations `*_custo_especialidade_*.sql` sai
// do MESMO laco, e `custoDeEspecialidade.test.ts` reprova se os dois sairem de
// sincronia.
import type { ElementType } from './types'

/** Ouro por nivel — igual pros 18 tipos: ouro nao tem oferta por tipo. */
export const ESPECIALIDADE_GOLD_POR_NIVEL: readonly number[] = [500, 1500, 4000, 10000, 25000]

export const ESPECIALIDADE_STONE_POR_NIVEL: Record<ElementType, readonly number[]> = {
  NORMAL: [14, 32, 64, 118, 201],
  FIRE: [16, 37, 75, 138, 234],
  WATER: [16, 37, 75, 138, 234],
  ELECTRIC: [16, 37, 75, 138, 234],
  GRASS: [8, 19, 37, 69, 117],
  ICE: [8, 19, 37, 69, 117],
  FIGHTING: [4, 9, 17, 33, 55],
  POISON: [8, 19, 39, 71, 121],
  GROUND: [10, 24, 48, 89, 150],
  FLYING: [8, 19, 37, 69, 117],
  PSYCHIC: [16, 37, 75, 138, 234],
  BUG: [2, 6, 12, 22, 37],
  ROCK: [4, 9, 17, 32, 54],
  GHOST: [3, 7, 14, 25, 43],
  DRAGON: [4, 9, 19, 35, 58],
  DARK: [4, 9, 19, 35, 58],
  STEEL: [2, 3, 7, 13, 22],
  FAIRY: [2, 6, 11, 21, 35],
}
