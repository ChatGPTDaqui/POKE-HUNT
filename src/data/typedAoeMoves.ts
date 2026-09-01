// Level-50 signature AoE move: explicit user request — every POKE (any
// species, any type) automatically learns one area move themed to its own
// PRIMARY type once it reaches level 50, with no equivalent in the
// spreadsheet (this is invented content, not real Gen2 data) — same
// "hand-authored layer on top of the sync" pattern as data/stones.js's 17
// per-type items. One entry per real elemental type in this dataset
// (TYPE_COLORS already enumerates exactly those 17, see data/typeColors.js).
//
// `category: 'dynamic'` is NOT a real category — combatSystem/AbilityHud/
// PokeStatDetail all resolve it per-attacker via
// data/abilityCategory.ts#resolveAbilityCategory (physical if the user's Atk
// Fisico stat is higher, special otherwise), per explicit user request
// ("calculado de acordo com o maior atributo do Pokemon"). Since the move is
// learned AT level 50, the comparison uses the stats the POKE has AT level 50
// and not its current ones — see that module for why that is derived instead
// of stored.
import { TYPE_COLORS } from './typeColors'
import type { AbilityCategory, ElementType } from './generated/types'

export interface TypedAoeMove {
  id: string
  name: string
  type: ElementType
  category: AbilityCategory | 'dynamic'
  power: number
  pp: number
  accuracy: number
}

export const TYPED_AOE_LEVEL = 50
const TYPED_AOE_POWER = 70
// 7 PP = pedido explicito do usuario. PP nao e um recurso consumivel aqui: ele
// e a UNICA entrada do cooldown (`cooldownFromPp` em abilities.ts, cooldown =
// TICK_SECONDS * 20/pp), entao baixar de 15 pra 7 mais que dobra o tempo de
// recarga do golpe de nivel 50 — e a alavanca de balanceamento dele.
const TYPED_AOE_PP = 7

export function typedAoeMoveKey(type: ElementType): string {
  return `aoe50_${type.toLowerCase()}`
}

function buildTypedAoeMoves(): Record<string, TypedAoeMove> {
  const moves: Record<string, TypedAoeMove> = {}
  for (const type of Object.keys(TYPE_COLORS) as ElementType[]) {
    const key = typedAoeMoveKey(type)
    moves[key] = {
      id: key,
      name: `Explosão Elemental (${type})`,
      type,
      category: 'dynamic',
      power: TYPED_AOE_POWER,
      pp: TYPED_AOE_PP,
      // Sempre acerta: e conteudo proprio deste jogo (nao vem do catalogo), e
      // uma recompensa de Nivel 50 que erra seria so frustracao.
      accuracy: 100,
    }
  }
  return moves
}

export const TYPED_AOE_MOVES: Record<string, TypedAoeMove> = buildTypedAoeMoves()
