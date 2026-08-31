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
  NORMAL: [8, 18, 35, 66, 111],
  FIRE: [16, 37, 75, 138, 234],
  WATER: [16, 37, 75, 138, 234],
  ELECTRIC: [16, 37, 75, 138, 234],
  GRASS: [8, 19, 37, 69, 117],
  ICE: [16, 37, 75, 138, 234],
  FIGHTING: [5, 12, 25, 45, 77],
  POISON: [6, 13, 26, 48, 82],
  GROUND: [16, 37, 75, 138, 234],
  FLYING: [8, 19, 37, 69, 117],
  PSYCHIC: [16, 37, 75, 138, 234],
  BUG: [4, 10, 20, 36, 62],
  ROCK: [16, 37, 75, 138, 234],
  GHOST: [6, 14, 28, 53, 89],
  DRAGON: [8, 19, 37, 69, 117],
  DARK: [4, 9, 19, 35, 58],
  STEEL: [16, 37, 75, 138, 234],
  FAIRY: [2, 5, 11, 19, 33],
}
