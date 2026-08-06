// Port de js/ui/panels/typeMatchups.js — so a logica pura (bucketing de
// multiplicador de efetividade), sem geracao de HTML. O componente React
// (components/shared/TypeWeaknessSection.tsx) consome o dado daqui.
import { TYPE_COLORS } from './typeColors'
import { getEffectiveness } from './generated/typeChart.generated'
import type { ElementType } from './generated/types'
import type { Species } from './pokes'

const ALL_TYPES = Object.keys(TYPE_COLORS) as ElementType[]

export interface TypeMatchups {
  weak4x: ElementType[]
  weak2x: ElementType[]
  resist2x: ElementType[]
  resist4x: ElementType[]
  immune: ElementType[]
}

// Multiplicador real de cada tipo atacante contra esta especie (combinando
// os 2 tipos dela via getEffectiveness — a mesma funcao que CombatSystem usa
// pro dano de verdade, entao isso sempre bate com o que acontece numa luta).
// `weak4x` e reportado separado (pedido explicito do usuario: destacar
// quando os 2 tipos da especie sao fracos ao mesmo tipo atacante, empilhando
// num 4x de verdade) em vez de ir junto da lista normal de fraqueza 2x.
export function typeMatchups(species: Species): TypeMatchups {
  const weak4x: ElementType[] = []
  const weak2x: ElementType[] = []
  const resist2x: ElementType[] = []
  const resist4x: ElementType[] = []
  const immune: ElementType[] = []
  for (const atkType of ALL_TYPES) {
    const m = getEffectiveness(atkType, species.type, species.type2)
    if (m === 4) weak4x.push(atkType)
    else if (m === 2) weak2x.push(atkType)
    else if (m === 0.5) resist2x.push(atkType)
    else if (m === 0.25) resist4x.push(atkType)
    else if (m === 0) immune.push(atkType)
  }
  return { weak4x, weak2x, resist2x, resist4x, immune }
}

export interface TypeAdvantages {
  advantage2x: ElementType[]
}

// Lado ofensivo: quais tipos oponentes o(s) proprio(s) tipo(s) desta especie
// acertam com 2x (vantagem de STAB relevante pra levar essa especie pra uma
// luta).
export function typeAdvantages(species: Species): TypeAdvantages {
  const atkTypes = [species.type, species.type2].filter((t): t is ElementType => Boolean(t))
  const advantage2x: ElementType[] = []
  for (const defType of ALL_TYPES) {
    const best = Math.max(...atkTypes.map((atkType) => getEffectiveness(atkType, defType, null)))
    if (best === 2) advantage2x.push(defType)
  }
  return { advantage2x }
}
