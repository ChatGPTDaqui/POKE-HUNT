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
  ICE: [16, 37, 75, 138, 234],
  FIGHTING: [4, 10, 20, 36, 61],
  POISON: [6, 13, 26, 49, 83],
  GROUND: [16, 37, 75, 138, 234],
  FLYING: [8, 19, 37, 69, 117],
  PSYCHIC: [16, 37, 75, 138, 234],
  BUG: [4, 8, 16, 31, 52],
  ROCK: [16, 37, 75, 138, 234],
  GHOST: [5, 11, 21, 40, 68],
  DRAGON: [8, 19, 37, 69, 117],
  DARK: [3, 6, 13, 24, 41],
  STEEL: [16, 37, 75, 138, 234],
  FAIRY: [3, 7, 13, 24, 42],
}
