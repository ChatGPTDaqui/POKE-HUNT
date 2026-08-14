// Ability (move) definitions. `power`/`type`/`category`/`pp` all come from
// the spreadsheet sync (see abilities.generated.js) — `power` is the real
// Gen2 base-power number fed into DAMAGE_BASE (CombatSystem), `type` drives
// STAB/effectiveness, and `pp` drives `cooldown`: fewer PP means a slower-
// recharging move — cooldown = TURNO_SEGUNDOS * (PP_REFERENCE / pp). Each ability's
// cooldown is tracked individually (CombatSystem.js), further scaled by the
// user's Speed stat.
//
// Level-to-learn is per SPECIES now, not per move (the real data has the
// same move learned at different levels by different species) — see
// data/pokes.js's `species.abilities` list of {key, levelReq}.
//
// BASIC_ATTACK is the one hand-authored exception: a universal fallback
// (not in the spreadsheet) so a species whose only learned moves so far are
// all 0-power status moves (e.g. a low-level Hoppip only knows Splash/
// Synthesis/Tail Whip until level 10) is never completely unable to fight —
// the same role "Struggle" plays in the real games. Being the one move every
// single POKE always has, its cooldown is a fixed BASE_ATTACK_INTERVAL (see
// CombatSystem.js) — not PP-based, and not Speed-scaled like the rest.
//
// Status/0-power moves are excluded from combat and from every player-facing
// list (isDamagingAbility) — they stay in the data below untouched, in case
// their mechanics (stat drops, etc) get implemented later.
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from './generated/formulas.generated'
import { ABILITIES_DATA } from './generated/abilities.generated'
import { TYPED_AOE_MOVES } from './typedAoeMoves'
import type { AbilityCategory, ElementType, StatusCondition, StatChange } from './generated/types'

export type AbilityTarget = 'single' | 'aoe'

export interface Ability {
  id: string
  name: string
  type: ElementType
  category: AbilityCategory | 'dynamic'
  power: number
  pp: number
  target: AbilityTarget
  radius?: number
  cooldown?: number
  // Efeitos, vindos do catalogo do Ultra Sun (ver AbilityDataEntry). Ausente =
  // o golpe nao tem aquele efeito. `accuracy` e o unico sempre presente.
  accuracy: number
  status?: StatusCondition
  statusChance?: number
  statChanges?: StatChange[]
  statChance?: number
  statTarget?: 'self'
  flinchChance?: number
  critStages?: number
  drainPercent?: number
  healPercent?: number
}

const formulaEngine = createFormulaEngine(FORMULAS)
// O turno do jogo, em segundos. E a MESMA constante que o cooldown global do
// combate (combatSystem#MIN_ACTION_GAP) — antes eram dois numeros diferentes
// (TICK_MS=1.4s aqui, 2s la), e o menor nunca teve efeito: nenhum POKE conseguia
// agir antes de 2s, entao golpe com cooldown calculado em 1.4s so exibia um
// numero que o combate ignorava.
export const TURNO_SEGUNDOS = formulaEngine.eval('TURNO_SEGUNDOS')
const PP_REFERENCE = 20 // PP que recarrega em exatamente um turno

function cooldownFromPp(pp: number): number {
  return TURNO_SEGUNDOS * (PP_REFERENCE / Math.max(1, pp))
}

export const BASIC_ATTACK: Ability = {
  id: 'basic_attack',
  name: 'Ataque Basico',
  category: 'physical',
  type: 'NORMAL',
  target: 'single',
  power: 40,
  pp: 35,
  // Sempre acerta. E o Struggle deste jogo — o golpe que sobra quando nenhum
  // outro esta pronto; errar com ele deixaria o POKE sem NADA a fazer no turno.
  accuracy: 100,
}

// Golpe em area agora vem do DADO (`ability.target`, alvo real do golpe nos
// jogos — ver AbilityDataEntry), nao de uma lista de chaves escrita a mao.
//
// POR QUE A LISTA SAIU: ela tinha 6 chaves e ja estava furada. Na migracao
// para os dados de Pokemon Ultra Sun, `selfdestruct` virou `self_destruct` e a
// entrada parou de casar — Explosao voltaria a ser golpe de alvo unico sem
// nenhum erro em lugar nenhum. E, com o catalogo novo, sao 27 golpes de area
// com dano de verdade (Terremoto, Nevasca, Deslizamento de Rochas, Onda de
// Calor, Voz Encantadora, ...) contra os 6 que a lista conhecia.
//
// Os golpes de nivel 50 continuam sendo AOE por desenho: eles nao vem do
// catalogo, sao conteudo proprio deste jogo.
const AOE_ABILITY_KEYS = new Set(Object.keys(TYPED_AOE_MOVES))
export const AOE_RADIUS = 240 // medium/high splash circle around the attacker (doubled per balance pass)

// Merged in ahead of the spreadsheet moves — TYPED_AOE_MOVES's keys
// (aoe50_fire, aoe50_water, ...) never collide with real spreadsheet move
// keys, so a plain object spread is enough.
const ALL_ABILITIES_SOURCE = { ...ABILITIES_DATA, ...TYPED_AOE_MOVES }

export const ABILITIES: Record<string, Ability> = Object.fromEntries(
  Object.entries(ALL_ABILITIES_SOURCE).map(([key, ability]) => {
    const isAoe = AOE_ABILITY_KEYS.has(key) || ('target' in ability && ability.target === 'aoe')
    return [
      key,
      {
        ...ability,
        target: isAoe ? 'aoe' : 'single',
        radius: isAoe ? AOE_RADIUS : undefined,
        cooldown: cooldownFromPp(ability.pp),
      } satisfies Ability,
    ]
  })
)

export function getAbility(id: string): Ability | null {
  if (id === BASIC_ATTACK.id) return BASIC_ATTACK
  return ABILITIES[id] || null
}

// Golpes que causam dano de verdade mas tem `power` 0 no catalogo, porque o
// dano deles nao vem de poder base — vem de uma regra propria, implementada em
// combatSystem#specialDamageFor (poder dinamico ou dano fixo).
//
// BUG QUE ISTO CORRIGE: `isDamagingAbility` filtrava por `power > 0`, entao
// esses golpes eram descartados de `pickAbility` e das telas — codigo morto.
// Passou a doer de verdade com o limite de 4 golpes: antes um golpe inerte era
// 1 de ~15 na lista, agora seria 1 dos 4 slots.
//
// FORA DA LISTA, DE PROPOSITO: `horn_drill` e `fissure`. Os dois causam
// `defenderPoke.hp` — KO instantaneo. Nos jogos reais o que os equilibra e a
// precisao de 30% e a regra de nunca acertar alvo de nivel maior, e ESTE JOGO
// NAO TEM PRECISAO (nem `Ability` nem o dado gerado tem o campo; todo golpe
// sempre acerta). Liga-los hoje daria um botao de vitoria automatica pra toda
// especie que os aprende. Voltam quando precisao existir.
const DANO_SEM_PODER_BASE = new Set([
  'magnitude', 'reversal', 'flail', 'present', 'hidden_power',
  'seismic_toss', 'night_shade', 'dragon_rage', 'super_fang', 'psywave',
  'counter', 'mirror_coat',
])

// Golpe de status continua inerte ate a Leva B — toda lista voltada pro jogador
// e a IA de combate filtram por aqui.
export function isDamagingAbility(ability: Ability | null | undefined): boolean {
  if (!ability) return false
  return ability.power > 0 || DANO_SEM_PODER_BASE.has(ability.id)
}

// `resolveAbilityCategory` mora em data/abilityCategory.ts — ela precisa de
// `computeStatsAtLevel` (data/pokes.ts), e pokes.ts importa ESTE arquivo, entao
// trazer a funcao pra ca fecharia um ciclo de import.
