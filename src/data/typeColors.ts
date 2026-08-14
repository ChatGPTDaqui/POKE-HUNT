// Placeholder sprite color per elemental type (primary type only). Used to
// auto-generate a colored geometric placeholder for any species coming out
// of the spreadsheet sync, without hand-curating each one.
import type { ElementType } from './generated/types'

export const TYPE_COLORS: Record<ElementType, string> = {
  NORMAL: '#a8a878',
  FIRE: '#ff6b35',
  WATER: '#4fc3f7',
  ELECTRIC: '#ffd23f',
  GRASS: '#4caf50',
  ICE: '#7dd3fc',
  FIGHTING: '#c0392b',
  POISON: '#9b59b6',
  GROUND: '#c9a66b',
  FLYING: '#a8d8ea',
  PSYCHIC: '#ff6b9d',
  BUG: '#8bc34a',
  ROCK: '#8d6e63',
  GHOST: '#6c5b7b',
  DRAGON: '#5b6ee1',
  DARK: '#4a4a4a',
  STEEL: '#b0bec5',
  // 18o tipo, entrou com a base de dados de Pokemon Ultra Sun (Gen VII).
  // Rosa claro na mesma familia dessaturada do resto da paleta — nao o
  // #EE99AC oficial, que sai mais chapado ao lado destes.
  FAIRY: '#f5a9d0',
}

const FALLBACK_COLOR = '#d1c7b7'

export function colorForType(type: ElementType | null | undefined): string {
  return (type && TYPE_COLORS[type]) || FALLBACK_COLOR
}
