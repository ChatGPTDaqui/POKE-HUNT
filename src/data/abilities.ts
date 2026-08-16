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

// Golpe de ARMADILHA DE CAMPO (Spikes/Toxic Spikes/Stealth Rock/Sticky Web):
// sem alvo real, so incrementa o placar do lado inimigo (ver
// combatSystem.ts#resolveHit e WorldState#enemyHazards em engine/types.ts).
export type HazardId = 'spikes' | 'toxic_spikes' | 'stealth_rock' | 'sticky_web'

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
  hazard?: HazardId
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

// Patch por cima do catalogo gerado (Ultra Sun): esses 7 golpes vinham como
// stub vazio (so type/power/pp/accuracy, sem nenhum efeito real). Sand Attack/
// Smokescreen/Kinesis baixam Precisao do alvo; Double Team/Minimize sobem a
// propria Evasao. `accuracy` de cada um continua vindo do dado gerado
// (Kinesis e 80%, os outros 100%) — este patch so preenche statChanges.
//
// FORA DE ESCOPO, DESCARTADO: Minimize nao dobra o dano recebido de golpes
// contra alvo minimizado nos jogos reais — nao implementado aqui.
//
// Foresight/Miracle Eye NAO entram aqui: o efeito deles (ignorar uma
// imunidade de tipo + a evasao do alvo) e resolvido em combatSystem.ts via
// `entity.revelado`, fora do vocabulario de statChanges.
const STAT_CHANGE_OVERRIDES: Partial<Record<string, Pick<Ability, 'statChanges' | 'statChance' | 'statTarget'>>> = {
  sand_attack: { statChanges: [{ stat: 'accuracy', estagios: -1 }], statChance: 100 },
  smokescreen: { statChanges: [{ stat: 'accuracy', estagios: -1 }], statChance: 100 },
  kinesis: { statChanges: [{ stat: 'accuracy', estagios: -1 }], statChance: 100 },
  double_team: { statChanges: [{ stat: 'evasion', estagios: 1 }], statChance: 100, statTarget: 'self' },
  minimize: { statChanges: [{ stat: 'evasion', estagios: 2 }], statChance: 100, statTarget: 'self' },
}

// Patch por cima do catalogo gerado (Ultra Sun): estes 4 golpes vinham como
// stub vazio (so type/power/pp/accuracy, sem nenhum efeito real, categoria
// 'status', poder 0) — plantar armadilha nao existe na planilha sincronizada.
// Overlay hand-authored, mesmo espirito do resto deste arquivo: o dado gerado
// nunca e editado direto, so complementado por cima. O efeito de fato (dano/
// status no INIMIGO que nasce depois) nao acontece no HIT — acontece no
// SPAWN do proximo inimigo, ver simulation.ts#aplicarHazardsAoInimigo.
const HAZARD_OVERRIDES: Partial<Record<string, Pick<Ability, 'hazard'>>> = {
  spikes: { hazard: 'spikes' },
  toxic_spikes: { hazard: 'toxic_spikes' },
  stealth_rock: { hazard: 'stealth_rock' },
  sticky_web: { hazard: 'sticky_web' },
}

export const ABILITIES: Record<string, Ability> = Object.fromEntries(
  Object.entries(ALL_ABILITIES_SOURCE).map(([key, ability]) => {
    const isAoe = AOE_ABILITY_KEYS.has(key) || ('target' in ability && ability.target === 'aoe')
    return [
      key,
      {
        ...ability,
        ...STAT_CHANGE_OVERRIDES[key],
        ...HAZARD_OVERRIDES[key],
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

// quick_guard (bloqueia golpe de PRIORIDADE) fica sem implementacao mecanica
// de proposito, ao contrario dos outros 5 golpes do elenco Screens (Reflect,
// Light Screen, Safeguard, Mist, Lucky Chant, Wide Guard — ver `Escudos` em
// engine/types.ts e ESCUDO_ABILITIES em engine/systems/combatSystem.ts). ESTE
// MOTOR NAO TEM CONCEITO DE PRIORIDADE DE GOLPE: todo golpe pousa pelo mesmo
// pipeline de hit (queueHit -> resolveHit), sem ordem de turno nem "golpe que
// age primeiro" pra quick_guard bloquear. Fica no catalogo/kit como golpe de
// status comum — golpe morto de verdade, nao um esquecimento.

// Golpe de status continua inerte ate a Leva B — toda lista voltada pro jogador
// e a IA de combate filtram por aqui.
export function isDamagingAbility(ability: Ability | null | undefined): boolean {
  if (!ability) return false
  return ability.power > 0 || DANO_SEM_PODER_BASE.has(ability.id)
}

// Golpes de clima (Rain Dance/Sunny Day/Hail/Sandstorm): vazios no catalogo
// gerado (so tem type/power/pp/target/accuracy -- nenhum campo de efeito).
// Mesmo padrao das outras camadas hand-authored deste arquivo/pasta
// (DANO_SEM_PODER_BASE acima, traits.ts, typedAoeMoves.ts): patch por cima do
// dado gerado, sem tocar abilities.generated.ts. O tipo do valor casa
// estruturalmente com `ClimaTipo` (engine/types.ts) sem importa-lo daqui --
// engine/types.ts ja importa `Ability` deste arquivo, e o import reverso
// fecharia um ciclo.
export const CLIMA_DO_GOLPE: Record<string, 'chuva' | 'sol' | 'granizo' | 'areia'> = {
  rain_dance: 'chuva',
  sunny_day: 'sol',
  hail: 'granizo',
  sandstorm: 'areia',
}

// `resolveAbilityCategory` mora em data/abilityCategory.ts — ela precisa de
// `computeStatsAtLevel` (data/pokes.ts), e pokes.ts importa ESTE arquivo, entao
// trazer a funcao pra ca fecharia um ciclo de import.
