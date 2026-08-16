// Port de js/systems/CombatSystem.js. Opera sobre um draft imer do
// WorldState inteiro (mesma forma que o `world` original), mutando direto.
//
// Nota (ver engine/types.ts): `entity.target`/`effect.owner`/
// `pendingHit.attacker`/`pendingHit.target` eram referencia direta no
// original — aqui viram id + lookup via findEntityById, unica mudanca de
// forma permitida no port (risco de referencia obsoleta sob Immer).
import { deriveRng, nextFloat, type Rng } from '@/core/rng'
import { getAbility, BASIC_ATTACK, isDamagingAbility, TURNO_SEGUNDOS, CLIMA_DO_GOLPE, type Ability } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import {
  multiplicadorDeVelocidade, multiplicadorDeDanoFisico, multiplicadorDeStat,
  multiplicadorDeAccuracyOuEvasion, nomeDoStatus, type StatusCondition, type StatDeEstagio,
} from '@/data/statusEffects'
import { corDoStatus } from '@/data/statusColors'
import type { StatChange, ElementType } from '@/data/generated/types'
import {
  tickStatus, tentarAgir, aplicarEfeitosDoGolpe, statusVaiPegar, aplicarMudancasDeStat,
  limparEstadoVolatil, aplicarStatus, aplicarEstagioUnico,
} from './statusSystem'
import { traitOf, type TraitId } from '@/data/traits'
import { resolveAbilityCategory } from '@/data/abilityCategory'
import { SPECIES } from '@/data/pokes'
import type { PokeInstance } from '@/data/pokes'
import { colorForType } from '@/data/typeColors'
import { direcaoDoGolpeDeStatus } from '@/data/statusVfx'
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from '@/data/generated/formulas.generated'
import { getEffectiveness } from '@/data/generated/typeChart.generated'
import { rollChance, randRange } from '@/core/random'
import { triggerAttackAnim, ATTACK_ANIM_DURATION } from './animationSystem'
import { createWorldEffect, effectDone, tickEffect } from '../effect'
import {
  isDead, getGroundOffset, tickCooldowns, isAbilityReady,
  startCooldown, canAct, startGlobalCooldown, takeDamage, heal, getMaxHp, releaseEffectLane, findEntityById,
} from '../entity'
import type { ClimaTipo, EnemyEntity, Escudos, PendingHit, PlayerEntity, WorldEntity, WorldState } from '../types'

// Dano/efeitos/tratamento-de-derrota acontecem esse tempo depois do golpe
// disparar, pra aparecerem em sincronia com a pose Shoot/Charge terminando
// em vez de no instante em que o golpe e usado.
const HIT_LAND_DELAY = ATTACK_ANIM_DURATION

// Duracoes procedurais de efeito de golpe por tipo (ver Sprites.ts):
// single-target e um "burst fluido" rapido; AOE e um anel que expande ate o
// raio real do splash, entao precisa de mais tempo pra terminar de crescer
// antes de sumir.
const IMPACT_EFFECT_DURATION = 0.35
const AOE_EFFECT_DURATION = 0.55

const formulaEngine = createFormulaEngine(FORMULAS)
const STAB_MULTIPLIER = formulaEngine.eval('STAB_MULTIPLIER')
const CRIT_CHANCE = formulaEngine.eval('CRIT_CHANCE')
const CRIT_MULTIPLIER = formulaEngine.eval('CRIT_MULTIPLIER')

// Habilidades passivas condicionadas a fracao de HP (Gen VI+): abaixo de 1/3
// do HP maximo, o atacante ganha +50% de dano nos golpes do seu tipo
// correspondente. Mapa trait -> tipo porque cada trait so amplifica o
// proprio elemento (blaze/FIRE, torrent/WATER, overgrow/GRASS, swarm/BUG).
const LOW_HP_TRAIT_TYPE_MULTIPLIER: Record<string, string> = {
  blaze: 'FIRE',
  torrent: 'WATER',
  overgrow: 'GRASS',
  swarm: 'BUG',
}
const LOW_HP_TRAIT_HP_FRACTION = 1 / 3
const LOW_HP_TRAIT_MULTIPLIER = 1.5

// Multiscale: dano recebido pela metade enquanto o HP esta CHEIO (nao so
// alto) — perde o efeito no primeiro hit que tirar HP.
const MULTISCALE_MULTIPLIER = 0.5

// --- Imunidade de tipo por Trait (permanente) + por golpe (temporaria) ----
//
// Trait -> tipo do qual ela e imune. Cobre as 8 Traits pedidas: Levitate (sem
// efeito colateral), Volt Absorb/Water Absorb (curam 1/4 do HP maximo em vez
// de zerar so o dano), Flash Fire (liga `flashFireAtivo`, +50% nos PROPRIOS
// golpes FIRE dali em diante — ver o multiplicador logo abaixo de
// LOW_HP_TRAIT em computeDamage/estimateDamage), Sap Sipper/Lightning
// Rod/Storm Drain/Motor Drive (+1 estagio no defensor). Redirecionamento de
// golpe em dupla (o que Lightning Rod/Storm Drain tambem fazem nos jogos) NAO
// e modelado — este motor nao tem multiplos aliados em campo, so
// atacante-vs-alvo — por isso as duas so dao o +1 de estagio, sem redirect.
const IMUNIDADE_POR_TRAIT: Partial<Record<TraitId, ElementType>> = {
  levitate: 'GROUND',
  volt_absorb: 'ELECTRIC',
  water_absorb: 'WATER',
  flash_fire: 'FIRE',
  sap_sipper: 'GRASS',
  lightning_rod: 'ELECTRIC',
  storm_drain: 'WATER',
  motor_drive: 'ELECTRIC',
}
// Qual stat cada Trait de absorcao sobe (+1 estagio) no proprio defensor.
// Levitate e Flash Fire ficam de fora de proposito: a primeira nao tem efeito
// colateral nenhum, a segunda vira buff de ataque (`flashFireAtivo`), nao
// estagio.
const ESTAGIO_DE_ABSORCAO: Partial<Record<TraitId, 'atkFis' | 'atkEsp' | 'speed'>> = {
  sap_sipper: 'atkFis',
  lightning_rod: 'atkEsp',
  storm_drain: 'atkEsp',
  motor_drive: 'speed',
}
const HP_CURADO_POR_ABSORCAO = 1 / 4
// ~5 turnos de imunidade a GROUND (Magnet Rise), self-target.
const MAGNET_RISE_TURNOS = 5
// Fire absorvido por Flash Fire amplifica os PROPRIOS golpes FIRE do
// defensor dali em diante — mesmo formato de multiplicador condicional que
// LOW_HP_TRAIT_MULTIPLIER, so que gatilho e "ja absorveu 1 vez", nao HP baixo.
const FLASH_FIRE_MULTIPLIER = 1.5

export interface ResultadoImunidadeDeTipo {
  imune: boolean
  curou?: boolean
  buffouEstagio?: boolean
}

/**
 * Resolve as DUAS fontes de imunidade a um TIPO de golpe que a tabela de
 * tipos (`getEffectiveness`) nao sabe: imunidade TEMPORARIA concedida por um
 * golpe (Magnet Rise, self-target) e imunidade PERMANENTE de Trait (Levitate
 * e as 7 Traits de absorcao). Chamada de dentro de computeDamage E
 * estimateDamage — a IA usa a segunda pra ranquear golpes, e sem isto ela
 * escolheria Terremoto contra um Levitate achando que causa dano de verdade.
 *
 * `aplicarEfeitos=false` e o modo LEITURA usado por `estimateDamage`: ela
 * documentadamente nao pode mutar nada (nem avancar o rng principal nem
 * curar/buffar de verdade) — so devolve SE seria imune, pra ranquear. So
 * `computeDamage`, resolvendo o hit de verdade, cura o HP / sobe o estagio /
 * liga `flashFireAtivo`.
 */
function resolverImunidadeDeTipo(
  rng: Rng,
  tipoDoGolpe: ElementType,
  defensor: WorldEntity,
  aplicarEfeitos: boolean,
): ResultadoImunidadeDeTipo {
  // (a) Imunidade temporaria por golpe (Magnet Rise) — so o tipo marcado, so
  // enquanto o timer nao zerar (tickCooldowns em entity.ts derruba o campo).
  if (defensor.imuneAoTipoVolatil && defensor.imuneAoTipoVolatil.tipo === tipoDoGolpe) {
    return { imune: true }
  }

  // (b) Imunidade permanente de Trait.
  const trait = traitOf(defensor.poke.speciesId)
  if (!trait || IMUNIDADE_POR_TRAIT[trait] !== tipoDoGolpe) return { imune: false }

  if (trait === 'levitate') return { imune: true }

  if (trait === 'volt_absorb' || trait === 'water_absorb') {
    if (aplicarEfeitos) heal(defensor, Math.round(getMaxHp(defensor) * HP_CURADO_POR_ABSORCAO))
    return { imune: true, curou: true }
  }

  if (trait === 'flash_fire') {
    if (aplicarEfeitos) defensor.flashFireAtivo = true
    return { imune: true }
  }

  const stat = ESTAGIO_DE_ABSORCAO[trait]
  if (stat) {
    if (aplicarEfeitos) {
      // Reaproveita aplicarMudancasDeStat (clamp de -6/+6 incluso) em vez de
      // duplicar a matematica de estagio — so precisa de um `Ability` valido
      // pro formato, daí o spread de BASIC_ATTACK com os 3 campos que
      // importam sobrescritos.
      aplicarMudancasDeStat(rng, defensor, defensor, {
        ...BASIC_ATTACK,
        statChanges: [{ stat, estagios: 1 }],
        statChance: 100,
        statTarget: 'self',
      })
    }
    return { imune: true, buffouEstagio: true }
  }

  return { imune: true }
}

// Foresight/Miracle Eye/Odor Sleuth: golpes de status sem statChanges (nao
// mexem em estagio nenhum) — o efeito deles e todo em `entity.revelado`, ver
// BaseEntity#revelado. Cada chave diz qual imunidade NATURAL de tipo (nao a
// de Trait acima) aquele golpe remove do alvo pelo resto da luta.
const REVELA_IMUNIDADE: Partial<Record<string, 'ghost' | 'dark'>> = {
  foresight: 'ghost',
  miracle_eye: 'dark',
  // Golpe desta leva: mesmo efeito de Foresight (ignora Fantasma vs
  // Normal/Lutador) — ver moveDescriptions.ts#odor_sleuth.
  odor_sleuth: 'ghost',
}

/**
 * Multiplicador de efetividade de tipo, mas ignorando UMA imunidade NATURAL
 * (nao a de Trait) se o defensor foi "revelado" (Foresight/Miracle
 * Eye/Odor Sleuth). So entra quando o multiplicador cru JA DEU ZERO — nao
 * mexe em resistencia parcial (0.5x), so em imunidade total, exatamente como
 * os golpes reais funcionam.
 *
 * A outra metade do efeito real (ignorar a PROPRIA Evasao do defensor contra
 * este atacante) mora em `golpeErrou`, que ja consulta `defensor.revelado`
 * direto — nao repetido aqui.
 */
function efetividadeConsiderandoRevelado(
  multiplicadorCru: number,
  ability: Ability,
  defenderEntity: WorldEntity,
  defenderSpecies: { type: ElementType; type2: ElementType | null },
): number {
  if (multiplicadorCru !== 0 || !defenderEntity.revelado) return multiplicadorCru
  const ehFantasma = defenderSpecies.type === 'GHOST' || defenderSpecies.type2 === 'GHOST'
  const ehSombrio = defenderSpecies.type === 'DARK' || defenderSpecies.type2 === 'DARK'
  if (defenderEntity.revelado === 'ghost' && ehFantasma && (ability.type === 'NORMAL' || ability.type === 'FIGHTING')) return 1
  if (defenderEntity.revelado === 'dark' && ehSombrio && ability.type === 'PSYCHIC') return 1
  return multiplicadorCru
}

// Clima de combate (Gen3+, sem item): Chuva favorece WATER e enfraquece FIRE,
// Sol faz o oposto. Afeta os dois lados por igual -- computeDamage e o mesmo
// pipeline pro jogador e pro inimigo, entao nao ha lado "dono" do clima.
const CLIMA_MULTIPLICADOR_FAVORECIDO = 1.5
const CLIMA_MULTIPLICADOR_DESFAVORECIDO = 0.5

// Golpes reais de auto-KO Gen1/2 — bug relatado explicitamente pelo usuario:
// causavam dano no ALVO sem nenhum recoil no usuario, diferente dos jogos
// reais. Corrigido por spec explicita: usar qualquer um dos dois custa ao
// usuario 50% do seu PROPRIO hp atual (nao um desmaio completo como nos
// jogos reais — um debuff mais leve, independente da planilha), aplicado
// uma vez por uso, nao importa quantos inimigos o AOE realmente acerte (ver
// branch isAoeVisual de resolveHit abaixo, que ja dispara exatamente uma
// vez por uso).
const SELF_DESTRUCT_ABILITY_KEYS = new Set(['explosion', 'selfdestruct'])
const SELF_DESTRUCT_HP_LOSS_PERCENT = 0.5

// Escudos ("Screens"): golpe -> chave de `Escudos` que ele liga em quem usou.
// Todos os 6 SEMPRE afetam quem usou (`attacker` do hit), nunca `hit.target`
// — mesmo padrao de cura pura (`ability.healPercent`, ver resolveHit): o
// catalogo (ABILITIES em data/abilities.ts) forca `target: 'single'|'aoe'`
// pra todo golpe sem excecao, entao golpe self-target continua chegando aqui
// com `target: 'single'` e um `hit.targetId` que e o INIMIGO, nao quem usou.
//
// quick_guard (bloqueia golpe de prioridade) fica DE FORA de proposito: este
// motor nao tem conceito de prioridade de golpe (todo golpe "pousa" no mesmo
// pipeline de hit, sem ordem de turno), entao nao ha nada pra quick_guard
// bloquear. Fica no catalogo/kit como golpe de status comum, mas sem
// nenhum efeito mecanico — golpe morto de verdade, e nao um esquecimento.
const ESCUDO_ABILITIES: Record<string, keyof Escudos> = {
  reflect: 'reflect',
  light_screen: 'lightScreen',
  safeguard: 'safeguard',
  mist: 'mist',
  lucky_chant: 'luckyChant',
  wide_guard: 'wideGuard',
}
const ESCUDO_DURACAO_TURNOS = 5 // igual aos jogos reais (Gen2-VII, fora de Dobrado item/Light Clay)
const ESCUDO_DURACAO_SEGUNDOS = ESCUDO_DURACAO_TURNOS * TURNO_SEGUNDOS

// Golpes de disable/lock (imprison/embargo descartados por decisao anterior,
// nao entram). Duracao em SEGUNDOS, nao turnos -- mesma convencao de
// imunidadeDeStatus, decrementada por dt em statusSystem#tickStatus, com
// TURNO_SEGUNDOS so pra manter a leitura em "quantos turnos" o resto do
// balanceamento do jogo usa.
const TAUNT_DURATION = TURNO_SEGUNDOS * 3 // Taunt: 3 turnos sem golpe de status (Gen6+)
const DISABLE_DURATION = TURNO_SEGUNDOS * 4 // Disable: 4 turnos travando 1 golpe especifico
const ENCORE_DURATION = TURNO_SEGUNDOS * 3 // Encore: 3 turnos forcando repetir o ultimo golpe
// Torment nos jogos reais dura ate o POKE trocar de campo -- sem troca nesta
// hunt continua, 3 turnos e a aproximacao (mesma janela de Taunt/Encore).
const TORMENT_DURATION = TURNO_SEGUNDOS * 3
// Spite: "reduz 4 PP do ultimo golpe" mapeado pro cooldown deste motor (PP e
// cooldown sao o mesmo conceito aqui, ver TURNO_SEGUNDOS acima) -- 4 PP vira
// 4 turnos de cooldown extra.
const SPITE_COOLDOWN_BONUS = TURNO_SEGUNDOS * 4

// Golpes novos de tick volatil (leech_seed/curse/nightmare/ingrain/aqua_ring/
// wish) — nenhum vem com campo dedicado no catalogo (ver
// data/generated/abilities.generated.ts: todos sao so {type, category:
// 'status', power:0}), entao o efeito de cada um e por `ability.id`, mesmo
// padrao de SELF_DESTRUCT_ABILITY_KEYS acima.
//
// Curse (variante Ghost): diferente de SELF_DESTRUCT_HP_LOSS_PERCENT (que e
// sobre o HP ATUAL do atacante), este custo e sobre o HP MAXIMO — variante
// dedicada porque o helper de cima esta hardcoded pro HP atual.
const CURSE_SELF_MAX_HP_LOSS_PERCENT = 0.5
// Ingrain/Aqua Ring: mesmo campo `regenPercent` pros dois, mesma fracao.
const INGRAIN_AQUA_RING_REGEN_PERCENT = 1 / 16
// Wish: 50% do HP MAXIMO de quem lanca, virando cura atrasada 2 turnos.
const WISH_HEAL_PERCENT = 0.5

// Ambos editaveis pela planilha (ver CLAUDE.md "Balanceamento de economia")
// com fallback batendo o valor hardcoded antigo.
const SPEED_REFERENCE = formulaEngine.evalOrDefault('ATTACK_SPEED_REFERENCE', 100)
const BASE_ATTACK_INTERVAL = formulaEngine.evalOrDefault('BASIC_ATTACK_COOLDOWN', 2)
// O turno. Um numero so, em vez dos dois que existiam antes: o `TICK_MS` de
// 1400ms (que convertia PP em cooldown) e este cooldown global de 2s, que na
// pratica ja engolia o outro — 61% dos golpes de dano batiam no piso de 2s com
// Velocidade 100, entao o ritmo real do combate sempre foi 2s, e o 1.4 so
// mentia nos numeros de cooldown mostrados. Ver data/abilities.ts.
const MIN_ACTION_GAP = TURNO_SEGUNDOS
const MELEE_RANGE_PADDING = 10

// Quao perto `attacker` precisa estar de `defender` pra lutar — sempre
// toque corpo-a-corpo, fisico ou especial. Golpes especiais tinham 3x esse
// alcance antes (mecanica de "conjurar a distancia"), mas isso lia como o
// POKE atacando sem realmente se aproximar — agora todo atacante precisa
// chegar bem perto do alvo primeiro, seja qual for o golpe usado.
export function engageRangeFor(attacker: WorldEntity, defender: WorldEntity): number {
  return attacker.radius + defender.radius + MELEE_RANGE_PADDING
}

// Cooldown de BASIC_ATTACK e um flat 1.5s pra todo POKE, sem escala por
// Velocidade (e o golpe que todo POKE sempre tem); todo outro golpe mantem
// seu proprio cooldown individual derivado de PP, escalado por Velocidade.
function scaledCooldown(ability: Ability, speed: number): number {
  if (ability.id === BASIC_ATTACK.id) return BASE_ATTACK_INTERVAL
  return (ability.cooldown ?? 0) * (SPEED_REFERENCE / Math.max(1, speed))
}

// A Velocidade que conta pro cooldown, ja com o efeito de status. Paralisia
// corta pela metade na Gen VII (era 75% antes) — e aqui, onde Velocidade vira
// ritmo de acao, isso significa literalmente agir na metade da frequencia.
function velocidadeEfetiva(entity: WorldEntity): number {
  return entity.poke.stats.speed
    * multiplicadorDeVelocidade(entity.poke.status?.tipo ?? null)
    * multiplicadorDeStat(entity.estagios, 'speed')
}

// Dano que o POKE causa em si mesmo quando confuso: golpe fisico SEM TIPO de
// poder 40, sem critico e sem STAB (Bulbapedia). Passa pelo mesmo DAMAGE_BASE
// do resto do combate, usando o proprio Ataque contra a propria Defesa.
function danoDeConfusao(entity: WorldEntity, poder: number): number {
  if (poder <= 0) return 0
  const p = entity.poke
  return Math.max(1, Math.round(formulaEngine.eval('DAMAGE_BASE', {
    level: p.level, power: poder, atk: p.stats.atkFis, def: p.stats.def,
  })))
}

function averageIv(ivs: PokeInstance['ivs'] | undefined): number {
  const vals = ivs ? Object.values(ivs) : []
  if (!vals.length) return 0
  return vals.reduce((sum, v) => sum + v, 0) / vals.length
}

// Roll real de Magnitude Gen2: 7 magnitudes possiveis (4-10), cada uma com
// sua propria probabilidade e poder fixo.
const MAGNITUDE_TABLE = [
  { chance: 5, power: 10 }, { chance: 10, power: 30 }, { chance: 20, power: 50 },
  { chance: 30, power: 70 }, { chance: 20, power: 90 }, { chance: 10, power: 110 },
  { chance: 5, power: 150 },
]
function rollMagnitudePower(rng: Rng): number {
  let roll = nextFloat(rng) * 100
  for (const tier of MAGNITUDE_TABLE) {
    if (roll < tier.chance) return tier.power
    roll -= tier.chance
  }
  return MAGNITUDE_TABLE[MAGNITUDE_TABLE.length - 1].power
}

// Reversal/Flail: poder sobe conforme o hp restante do proprio usuario cai.
function hpRatioPower(attackerPoke: PokeInstance): number {
  const ratio = Math.max(0, attackerPoke.hp) / attackerPoke.stats.hp
  if (ratio <= 0.04) return 200
  if (ratio <= 0.09) return 150
  if (ratio <= 0.16) return 100
  if (ratio <= 0.32) return 80
  if (ratio <= 0.48) return 40
  return 20
}

// O 4o resultado real de Present (curar o alvo) nao tem equivalente neste
// motor (nao existe mecanica de curar o oponente) — suas chances sao
// dobradas proporcionalmente nos 3 tiers de dano em vez disso.
function rollPresentPower(rng: Rng): number {
  const roll = nextFloat(rng)
  if (roll < 0.4) return 40
  if (roll < 0.7) return 80
  return 120
}

// Este elenco usa IVs em escala 0-31 (convencao Gen3+), nao os DVs 0-15 que
// a formula real de tipo/poder de Hidden Power da Gen2 le — sem dado DV pra
// derivar um tipo "real", mantem o placeholder NORMAL da planilha e so
// deixa o poder dinamico (faixa 30-70, escalado por quao perto do maximo
// esta a media de IV do POKE), documentado como simplificacao deliberada,
// nao port fiel da formula Gen2.
function hiddenPowerPower(attackerPoke: PokeInstance): number {
  return 30 + Math.round((averageIv(attackerPoke.ivs) / 31) * 40)
}

// Psywave real Gen1/2: dano aleatorio entre ~0.5x-1.5x o nivel do usuario,
// ignorando ATK/DEF por completo.
function psywaveDamage(rng: Rng, attackerPoke: PokeInstance): number {
  return Math.max(1, Math.round(attackerPoke.level * randRange(rng, 0.5, 1.5)))
}

const DYNAMIC_POWER_ABILITIES: Record<string, (rng: Rng, attackerPoke: PokeInstance) => number> = {
  magnitude: (rng) => rollMagnitudePower(rng),
  reversal: (_rng, attackerPoke) => hpRatioPower(attackerPoke),
  flail: (_rng, attackerPoke) => hpRatioPower(attackerPoke),
  present: (rng) => rollPresentPower(rng),
  hidden_power: (_rng, attackerPoke) => hiddenPowerPower(attackerPoke),
}

// Counter/Mirror Coat refletem 2x o ultimo golpe daquela categoria que o
// PROPRIO usuario sofreu — o Counter real Gen2 so lembra "este turno";
// aproximado aqui como uma janela recente curta, ja que o combate nao e
// estritamente por turno. Sem nada recente pra refletir, o Counter real so
// falha (0 de dano), mas um golpe hard-0 que a IA de um auto-battler
// idle poderia ranquear bem alto pareceria quebrado — entao o chamador
// (specialDamageFor) cai pra um hit comum em vez disso.
const COUNTER_MEMORY_WINDOW = 3 // segundos
function counterDamage(attackerEntity: WorldEntity, category: 'physical' | 'special'): number | null {
  const memory = attackerEntity.lastDamageTaken[category]
  if (memory.amount > 0 && memory.age <= COUNTER_MEMORY_WINDOW) return memory.amount * 2
  return null
}

const FIXED_DAMAGE_ABILITIES: Record<string, (attackerPoke: PokeInstance, defenderPoke: PokeInstance, attackerEntity: WorldEntity, rng: Rng) => number | null> = {
  // horn_drill/fissure continuam aqui (a regra existe e funciona se o golpe
  // chegar), mas `isDamagingAbility` nao os deixa ser escolhidos enquanto nao
  // houver precisao — ver a nota em data/abilities.ts.
  seismic_toss: (attackerPoke) => attackerPoke.level,
  night_shade: (attackerPoke) => attackerPoke.level,
  dragon_rage: () => 40,
  super_fang: (_a, defenderPoke) => Math.max(1, Math.floor(defenderPoke.hp / 2)),
  horn_drill: (_a, defenderPoke) => defenderPoke.hp,
  fissure: (_a, defenderPoke) => defenderPoke.hp,
  psywave: (attackerPoke, _d, _e, rng) => psywaveDamage(rng, attackerPoke),
  counter: (_a, _d, attackerEntity) => counterDamage(attackerEntity, 'physical'),
  mirror_coat: (_a, _d, attackerEntity) => counterDamage(attackerEntity, 'special'),
}

type SpecialDamage = { mode: 'dynamicPower'; power: number } | { mode: 'fixed'; amount: number } | null

// Devolve null (usa o `power` fixo do golpe pelo pipeline normal) ou uma das
// formas acima.
function specialDamageFor(rng: Rng, ability: Ability, attackerEntity: WorldEntity, defenderEntity: WorldEntity): SpecialDamage {
  const attackerPoke = attackerEntity.poke
  const defenderPoke = defenderEntity.poke

  const dynamic = DYNAMIC_POWER_ABILITIES[ability.id]
  if (dynamic) return { mode: 'dynamicPower', power: dynamic(rng, attackerPoke) }

  const fixed = FIXED_DAMAGE_ABILITIES[ability.id]
  if (fixed) {
    const amount = fixed(attackerPoke, defenderPoke, attackerEntity, rng)
    if (amount === null) return { mode: 'dynamicPower', power: 40 } // Counter/Mirror Coat sem nada pra refletir
    return { mode: 'fixed', amount }
  }

  return null
}

// Estimativa aproximada de dano (sem crit, sem variacao de roll) usada so
// pra ranquear golpes candidatos contra um alvo especifico — espelha o
// pipeline de computeDamage menos os 2 passos aleatorios.
// Recebe o rng so pra DERIVAR um scratch: estimar dano nao pode consumir a
// sequencia principal. Ranquear candidatos e uma decisao interna da IA e o
// numero de candidatos varia por nivel/cooldown — se a estimativa gastasse
// sorteios, a sequencia que o servidor verifica dependeria de detalhes que nao
// sao eventos de jogo.  le o estado sem avanca-lo.
function estimateDamage(rng: Rng, attackerEntity: WorldEntity, defenderEntity: WorldEntity, ability: Ability): number {
  const attackerPoke = attackerEntity.poke
  const defenderPoke = defenderEntity.poke
  const attackerSpecies = SPECIES[attackerPoke.speciesId]
  const defenderSpecies = SPECIES[defenderPoke.speciesId]
  const effectivenessMultiplier = efetividadeConsiderandoRevelado(
    getEffectiveness(ability.type, defenderSpecies.type, defenderSpecies.type2),
    ability, defenderEntity, defenderSpecies,
  )
  // Leitura, nao aplica efeito (`aplicarEfeitos=false`): estimar dano nao pode
  // curar/buffar de verdade, so responder "esse golpe seria inutil aqui" pra
  // IA nao rankear Terremoto contra um Levitate como se causasse dano.
  if (resolverImunidadeDeTipo(deriveRng(rng.state, 'estimate-imunidade'), ability.type, defenderEntity, false).imune) return 0
  if (effectivenessMultiplier === 0) return 0

  const special = specialDamageFor(deriveRng(rng.state, 'estimate'), ability, attackerEntity, defenderEntity)
  if (special && special.mode === 'fixed') return special.amount

  const isPhysical = resolveAbilityCategory(ability, attackerPoke) === 'physical'
  const atk = isPhysical ? attackerPoke.stats.atkFis : attackerPoke.stats.atkEsp
  const def = isPhysical ? defenderPoke.stats.def : defenderPoke.stats.defEsp
  const power = special && special.mode === 'dynamicPower' ? special.power : ability.power

  let dmg = formulaEngine.eval('DAMAGE_BASE', { level: attackerPoke.level, power, atk, def })

  const isStab = Boolean(ability.type) && (ability.type === attackerSpecies.type || ability.type === attackerSpecies.type2)
  if (isStab) dmg *= STAB_MULTIPLIER

  const attackerTraitEstimate = traitOf(attackerSpecies.id)
  if (attackerTraitEstimate && LOW_HP_TRAIT_TYPE_MULTIPLIER[attackerTraitEstimate] === ability.type
    && attackerPoke.hp / attackerPoke.stats.hp < LOW_HP_TRAIT_HP_FRACTION) {
    dmg *= LOW_HP_TRAIT_MULTIPLIER
  }
  // Flash Fire: buff permanente-ate-fim-de-luta no ATACANTE (nao no
  // defensor), ligado quando ele mesmo absorveu um golpe FIRE antes — ver
  // resolverImunidadeDeTipo.
  if (attackerEntity.flashFireAtivo && ability.type === 'FIRE') dmg *= FLASH_FIRE_MULTIPLIER

  dmg *= effectivenessMultiplier
  return dmg
}

// Ate que estagio a IA se da ao trabalho de buffar/debuffar.
//
// O teto NAO e +6 de proposito. Cada uso de Danca das Espadas custa um turno
// inteiro, e o ganho por estagio cai rapido: de 0 pra +2 o Ataque dobra, de +4
// pra +6 sobe 33%. Sem teto o POKE gastaria seis turnos se preparando enquanto
// apanha — que e um jeito de perder a luta com a stat mais alta da hunt.
const ESTAGIO_ALVO_DA_IA = 2

// Teto de `estagioDeCritico` (Focus Energy) que a IA persegue. Nao e um valor
// arbitrario tipo ESTAGIO_ALVO_DA_IA: a formula de critico (computeDamage) usa
// `Math.pow(3, Math.min(3, critStagesTotal))`, entao qualquer total >= 3 JA
// SATURA no teto de 50% de chance (CRIT_CHANCE=1/24, 3^3=27 -> 27/24 > 0.5).
// Cada uso soma +2: comecando de 0, a IA usa em 0 (0<3), fica em 2, usa nao
// de novo (2<3), fica em 4 -- primeiro total >= 3, para. Um teto menor (ex:
// 2) pararia em 37.5% pra sempre sem nunca saturar; um teto maior (ex: 6)
// gastaria mais um turno inteiro depois de ja estar saturado.
const FOCUS_ENERGY_TETO_DA_IA = 3

/**
 * Vale a pena usar este golpe de APOIO puro (sem dano, sem status) agora?
 *
 * Cobre buff em si mesmo (Danca das Espadas), debuff no oponente (Rosnado) e
 * ARMADILHA DE CAMPO (Spikes/Toxic Spikes/Stealth Rock/Sticky Web). Nos dois
 * primeiros, so vale se o estagio ainda nao chegou no alvo da IA — repetir um
 * buff no teto e um turno jogado fora, e o jogador ve o POKE "dancando" em
 * vez de atacar. No terceiro, so vale enquanto o teto daquela armadilha (3
 * camadas de Spikes, 2 de Toxic Spikes, 1 flag de Stealth Rock/Sticky Web)
 * ainda nao foi atingido do lado INIMIGO.
 *
 * Focus Energy e Laser Focus NAO usam StatChange (contador/flag paralelos, ver
 * types.ts), entao caem fora do `ability.statChanges` generico abaixo e
 * precisam de um `if` proprio cada. Golpe de clima (Rain Dance/Sunny
 * Day/Hail/Sandstorm) entra pelo mesmo crivo: so vale usar se o clima ativo
 * agora NAO for o que este golpe ligaria — sem isso a IA repetiria Chuva a
 * cada cooldown com Chuva ja ativa, jogando o turno fora (e sobrescrevendo os
 * mesmos 5 turnos por cima dos que ja tinha).
 */
function golpeDeApoioUtil(
  world: WorldState,
  entity: WorldEntity,
  defenderEntity: WorldEntity,
  ability: Ability,
  golpesDeDanoProntos: Ability[],
  clima: ClimaTipo | null,
): boolean {
  // Golpes de disable/lock (Taunt/Spite/Disable/Encore/Torment): nenhum tem
  // `status` nem `statChanges` no catalogo, entao sem este bloco eles NUNCA
  // entrariam em statusPronto -- ficariam catalogados mas inalcancaveis pela
  // IA. So vale a pena se o efeito ainda vai pegar em algo (senao e um turno
  // jogado fora re-taunting quem ja esta calado, por exemplo).
  if (ability.id === 'taunt') return !(defenderEntity.silenciadoAte && defenderEntity.silenciadoAte > 0)
  if (ability.id === 'torment') return !(defenderEntity.tormentedUntil && defenderEntity.tormentedUntil > 0)
  if (ability.id === 'disable') {
    return !!defenderEntity.lastUsedAbilityId
      && !(defenderEntity.disabledAbilityUntil && defenderEntity.disabledAbilityUntil > 0)
  }
  if (ability.id === 'encore') {
    return !!defenderEntity.lastUsedAbilityId
      && !(defenderEntity.forcedAbilityUntil && defenderEntity.forcedAbilityUntil > 0)
  }
  if (ability.id === 'spite') return !!defenderEntity.lastUsedAbilityId

  // Golpes novos de tick volatil (leech_seed/curse/nightmare/ingrain/aqua_ring/
  // wish): nenhum usa `ability.status`/`statChanges`/`healPercent` do
  // catalogo — o efeito inteiro e custom (ver resolveHit) — entao a
  // heuristica de "vale a pena usar" tambem precisa ser custom por golpe.
  // SEM ISTO os 6 nunca sairiam do papel: `pickAbility` so considera um golpe
  // power:0 quando `ability.status` pega OU `golpeDeApoioUtil` diz sim — e
  // nenhum dos 6 tem `ability.status` setado.
  switch (ability.id) {
    case 'leech_seed': {
      if (defenderEntity.seeded) return false
      const especie = SPECIES[defenderEntity.poke.speciesId]
      return especie.type !== 'GRASS' && especie.type2 !== 'GRASS'
    }
    case 'curse': {
      // So vale se o alvo ainda nao tiver, e o atacante sobreviver ao custo
      // de 50% do proprio HP MAXIMO — sem este segundo check o POKE Ghost se
      // suicidaria toda vez que Curse saisse do cooldown.
      if (defenderEntity.curseDot) return false
      return entity.poke.hp > entity.poke.stats.hp * CURSE_SELF_MAX_HP_LOSS_PERCENT
    }
    case 'nightmare':
      // So e util se o alvo JA estiver dormindo agora — nao ha timer aqui pra
      // "esperar ele dormir depois".
      return !defenderEntity.nightmareDot && defenderEntity.poke.status?.tipo === 'sleep'
    case 'ingrain':
    case 'aqua_ring':
      return !entity.regenPercent && entity.poke.hp < entity.poke.stats.hp
    case 'wish':
      // Mesmo limiar que healPercent usa embaixo (so vale gastar o turno se
      // realmente falta HP pra recuperar), com a fracao equivalente de Wish.
      return entity.poke.hp / entity.poke.stats.hp <= 1 - WISH_HEAL_PERCENT
    default:
      break
  }

  // Cura pura (Recover): so quando ha HP de verdade a recuperar. O limiar existe
  // pra o POKE nao gastar turno curando 5 de HP com a vida quase cheia.
  if (ability.healPercent) {
    return entity.poke.hp / entity.poke.stats.hp <= 1 - ability.healPercent / 100
  }
  // Escudo (Screen): so vale usar se o proprio escudo daquele golpe ainda nao
  // esta de pe — repetir Reflect com 4s restantes de 10s e turno jogado fora.
  const chaveDeEscudo = ESCUDO_ABILITIES[ability.id]
  if (chaveDeEscudo) {
    return (entity.escudos?.[chaveDeEscudo] ?? 0) <= 0
  }
  // Magnet Rise: self-buff sem statChanges (nao ativa nenhum estagio) — so
  // vale enquanto a imunidade a GROUND nao esta ativa nele mesmo. Sem esta
  // checagem o golpe nunca entraria em `statusPronto` (nao tem `.status` nem
  // `.statChanges`) e ficaria inerte mesmo escolhido pro moveset.
  if (ability.id === 'magnet_rise') {
    return !entity.imuneAoTipoVolatil || entity.imuneAoTipoVolatil.tipo !== 'GROUND'
  }
  // Odor Sleuth: so vale contra um alvo Fantasma ainda nao revelado — e o
  // unico caso em que ele desbloqueia dano de verdade (Normal/Lutador contra
  // Fantasma, ver REVELA_IMUNIDADE/efetividadeConsiderandoRevelado).
  if (ability.id === 'odor_sleuth') {
    const especieAlvo = SPECIES[defenderEntity.poke.speciesId]
    const ehFantasma = especieAlvo.type === 'GHOST' || especieAlvo.type2 === 'GHOST'
    return ehFantasma && defenderEntity.revelado !== 'ghost'
  }
  // Focus Energy: so vale enquanto o estagio de critico nao saturou (ver
  // FOCUS_ENERGY_TETO_DA_IA acima).
  if (ability.id === 'focus_energy') {
    return (entity.estagioDeCritico ?? 0) < FOCUS_ENERGY_TETO_DA_IA
  }
  // Laser Focus: so vale se tiver um golpe de DANO pronto pra render o
  // critico garantido no proximo turno — gastar o turno nisso sem golpe de
  // dano pronto pra seguir e um turno perdido esperando cooldown, o mesmo
  // raciocinio de "so abre status se o alvo for sobreviver" mais abaixo em
  // pickAbility.
  if (ability.id === 'laser_focus') {
    return golpesDeDanoProntos.length > 0
  }
  const climaDoGolpe = CLIMA_DO_GOLPE[ability.id]
  if (climaDoGolpe) return clima !== climaDoGolpe
  if (ability.hazard) {
    // So a IA do JOGADOR planta armadilha — ela mira o campo INIMIGO
    // (`world.enemyHazards`), que so faz sentido do lado de quem caca. O
    // selvagem nao tem conceito de "seu proprio lado" pra isto.
    if (entity.kind !== 'player') return false
    const hazards = world.enemyHazards
    switch (ability.hazard) {
      case 'spikes': return (hazards?.spikes ?? 0) < 3
      case 'toxic_spikes': return (hazards?.toxicSpikes ?? 0) < 2
      case 'stealth_rock': return !hazards?.stealthRock
      case 'sticky_web': return !hazards?.stickyWeb
    }
  }
  if (!ability.statChanges || !ability.statChanges.length) return false
  const destino = ability.statTarget === 'self' ? entity : defenderEntity
  return ability.statChanges.some((m) => {
    const atual = destino.estagios[m.stat] ?? 0
    return m.estagios > 0 ? atual < ESTAGIO_ALVO_DA_IA : atual > -ESTAGIO_ALVO_DA_IA
  })
}

/**
 * Dano estimado JA DESCONTADA a chance de errar.
 *
 * `estimateDamage` responde "quanto isso tira se acertar", que era a pergunta
 * certa enquanto todo golpe sempre acertava. Com precisao valendo, ranquear por
 * ela faz o POKE escolher Blizzard (110 de poder, 70% de precisao) em vez de um
 * golpe de 100% quase tao forte — e perder o turno inteiro em 3 de cada 10
 * tentativas.
 *
 * Medido: so essa troca vale 15% das kills/hora numa hunt onde o jogador esta
 * muito acima do nivel, que e onde os golpes fortes e imprecisos dominam o
 * moveset.
 */
function danoEsperado(rng: Rng, atacante: WorldEntity, defensor: WorldEntity, ability: Ability): number {
  return estimateDamage(rng, atacante, defensor, ability) * ((ability.accuracy ?? 100) / 100)
}

export type Effectiveness = 'normal' | 'immune' | 'super' | 'effective' | 'weak'

export interface DamageResult {
  amount: number
  effectiveness: Effectiveness
  effectivenessLabel: string | null
  isCrit: boolean
}

// Pipeline de dano real Gen2: DAMAGE_BASE -> STAB -> efetividade de tipo ->
// crit -> variacao 85-100%. Golpes de dano fixo (ver specialDamageFor) vao
// direto pro valor bruto e pulam STAB/crit/variancia, igual ao real — mas
// ainda zerados por imunidade total de tipo.
// `DANO_VARIACAO_MINIMA` e o piso da formula DAMAGE_VARIATION da planilha
// ((floor(random()*16)+85)/100). Repetido aqui como constante, e nao lido de la,
// porque o que o modo pessimista precisa e o MINIMO da distribuicao — a formula
// so sabe sortear dentro dela.
const DANO_VARIACAO_MINIMA = 0.85

function computeDamage(rng: Rng, attackerEntity: WorldEntity, defenderEntity: WorldEntity, ability: Ability, pessimista = false, clima: ClimaTipo | null = null): DamageResult {
  const attackerPoke = attackerEntity.poke
  const defenderPoke = defenderEntity.poke
  const attackerSpecies = SPECIES[attackerPoke.speciesId]
  const defenderSpecies = SPECIES[defenderPoke.speciesId]
  let effectivenessMultiplier = efetividadeConsiderandoRevelado(
    getEffectiveness(ability.type, defenderSpecies.type, defenderSpecies.type2),
    ability, defenderEntity, defenderSpecies,
  )
  // Hit de verdade (`aplicarEfeitos=true`): imunidade de Trait/golpe zera o
  // multiplicador igual a imunidade natural de tipo, e AQUI de fato cura o
  // HP / sobe o estagio / liga `flashFireAtivo` quando a Trait pedir.
  if (resolverImunidadeDeTipo(rng, ability.type, defenderEntity, true).imune) effectivenessMultiplier = 0
  const special = specialDamageFor(rng, ability, attackerEntity, defenderEntity)

  let dmg: number
  let isCrit = false

  if (special && special.mode === 'fixed') {
    dmg = effectivenessMultiplier === 0 ? 0 : special.amount
  } else {
    const isPhysical = resolveAbilityCategory(ability, attackerPoke) === 'physical'
    // Estagios entram MULTIPLICANDO a stat crua, nao alterando-a: a ficha do
    // POKE continua mostrando o Ataque de verdade, e o buff some quando ele sai
    // de campo. E como os jogos fazem.
    const atk = (isPhysical ? attackerPoke.stats.atkFis : attackerPoke.stats.atkEsp)
      * multiplicadorDeStat(attackerEntity.estagios, isPhysical ? 'atkFis' : 'atkEsp')
    const def = (isPhysical ? defenderPoke.stats.def : defenderPoke.stats.defEsp)
      * multiplicadorDeStat(defenderEntity.estagios, isPhysical ? 'def' : 'defEsp')
    const power = special && special.mode === 'dynamicPower' ? special.power : ability.power

    dmg = formulaEngine.eval('DAMAGE_BASE', { level: attackerPoke.level, power, atk, def })

    // Queimadura corta o dano FISICO do atacante pela metade (Gen VII). Entra
    // aqui, e nao na stat de Ataque, exatamente como nos jogos desde a Gen IV:
    // "a burn now technically halves the damage a burned Pokemon does with
    // physical moves" — a diferenca importa porque a stat crua continua sendo
    // a exibida na ficha do POKE.
    if (isPhysical) dmg *= multiplicadorDeDanoFisico(attackerPoke.status?.tipo ?? null)

    const isStab = Boolean(ability.type) && (ability.type === attackerSpecies.type || ability.type === attackerSpecies.type2)
    if (isStab) dmg *= STAB_MULTIPLIER

    const attackerTrait = traitOf(attackerSpecies.id)
    if (attackerTrait && LOW_HP_TRAIT_TYPE_MULTIPLIER[attackerTrait] === ability.type
      && attackerPoke.hp / attackerPoke.stats.hp < LOW_HP_TRAIT_HP_FRACTION) {
      dmg *= LOW_HP_TRAIT_MULTIPLIER
    }
    // Flash Fire: buff permanente-ate-fim-de-luta no ATACANTE, ligado quando
    // ele mesmo absorveu um golpe FIRE antes (ver resolverImunidadeDeTipo).
    if (attackerEntity.flashFireAtivo && ability.type === 'FIRE') dmg *= FLASH_FIRE_MULTIPLIER

    dmg *= effectivenessMultiplier

    // Clima: Chuva/Sol -- entra depois da efetividade de tipo, igual ao
    // Multiscale logo abaixo (mais um multiplicador de "estado do combate"
    // empilhando sobre o resto). So mexe em golpe WATER/FIRE; qualquer outro
    // tipo passa ileso pelos dois climas.
    if (clima === 'chuva') {
      if (ability.type === 'WATER') dmg *= CLIMA_MULTIPLICADOR_FAVORECIDO
      else if (ability.type === 'FIRE') dmg *= CLIMA_MULTIPLICADOR_DESFAVORECIDO
    } else if (clima === 'sol') {
      if (ability.type === 'FIRE') dmg *= CLIMA_MULTIPLICADOR_FAVORECIDO
      else if (ability.type === 'WATER') dmg *= CLIMA_MULTIPLICADOR_DESFAVORECIDO
    }

    // Multiscale: HP do defensor CHEIO (nao so alto) corta o dano recebido
    // pela metade. Depois da efetividade de tipo, igual ao pipeline real —
    // um multiplicador de "estado do defensor" empilha sobre o resto.
    const defenderTrait = traitOf(defenderSpecies.id)
    if (defenderTrait === 'multiscale' && defenderPoke.hp === defenderPoke.stats.hp) {
      dmg *= MULTISCALE_MULTIPLIER
    }

    // Reflect/Light Screen: escudo do DEFENSOR corta pela metade o dano da
    // categoria correspondente. Reflect cobre fisico, Light Screen cobre
    // especial — os dois podem estar de pe ao mesmo tempo sem se somar (cada
    // um so mexe na sua propria categoria).
    if (isPhysical && (defenderEntity.escudos?.reflect ?? 0) > 0) dmg *= 0.5
    if (!isPhysical && (defenderEntity.escudos?.lightScreen ?? 0) > 0) dmg *= 0.5

    // Estagio de critico: Slash/Razor Leaf e outros 16 golpes tem +1 estagio,
    // que na Gen VII e 1/8 em vez de 1/24. A tabela real vai ate +3 (1/2), mas
    // nenhum golpe deste elenco passa de +1 — o `Math.min` existe pra ela nao
    // virar um multiplicador solto se algum dia passar.
    //
    // Focus Energy soma `estagioDeCritico` (contador PARALELO, ver types.ts)
    // ao estagio do PROPRIO golpe antes do teto — mesma formula, so mais
    // estagio somado. O `Math.min(3, ...)` de baixo ja tampa os dois juntos.
    const critStagesTotal = (ability.critStages ?? 0) + (attackerEntity.estagioDeCritico ?? 0)
    const chanceDeCritico = CRIT_CHANCE * Math.pow(3, Math.min(3, critStagesTotal))

    // Lucky Chant: escudo do DEFENSOR ignora o sorteio inteiro E o critico
    // garantido de Laser Focus — nunca critico contra quem esta protegido,
    // nao so "chance reduzida".
    const protegidoPorLuckyChant = (defenderEntity.escudos?.luckyChant ?? 0) > 0

    // Laser Focus: flag de uso unico que forca o PROXIMO golpe de DANO
    // (power > 0) a sair critico garantido — bypass completo do roll e do
    // teto de 50% logo abaixo. So conta pra golpe de DANO de verdade: este
    // mesmo pipeline roda ate pra golpe de status (power 0, dmg fica 0), e
    // esse caso nao pode consumir a flag (ver types.ts#proximoGolpeCriticoGarantido).
    // Consumida mesmo se Lucky Chant bloquear o critico — senao a flag
    // ficaria pendurada pra sempre contra um defensor com o escudo de pe.
    // Nao gated por `pessimista` de proposito: e uma garantia determinada
    // pela propria entidade, nao um sorteio de sorte — pessimista so zera
    // ALEATORIEDADE (ver PH-15), e aplica identico nos dois modos, entao nao
    // quebra a invariante de "farm offline nunca renderiza melhor que ao vivo".
    const criticoGarantido = ability.power > 0 && attackerEntity.proximoGolpeCriticoGarantido === true
    if (criticoGarantido) attackerEntity.proximoGolpeCriticoGarantido = false
    if (protegidoPorLuckyChant) {
      isCrit = false
    } else if (criticoGarantido) {
      isCrit = true
    } else {
      isCrit = pessimista ? false : rollChance(rng, Math.min(0.5, chanceDeCritico))
    }
    if (isCrit) dmg *= CRIT_MULTIPLIER

    dmg *= pessimista ? DANO_VARIACAO_MINIMA : formulaEngine.eval('DAMAGE_VARIATION', {}, rng)
  }

  let effectiveness: Effectiveness = 'normal'
  let effectivenessLabel: string | null = null
  if (effectivenessMultiplier === 0) {
    effectiveness = 'immune'
    effectivenessLabel = 'Imune!'
  } else if (effectivenessMultiplier > 2) {
    effectiveness = 'super'
    effectivenessLabel = 'Super efetivo!'
  } else if (effectivenessMultiplier > 1) {
    effectiveness = 'effective'
    effectivenessLabel = 'Efetivo!'
  } else if (effectivenessMultiplier < 1) {
    effectiveness = 'weak'
    effectivenessLabel = 'Pouco efetivo'
  }

  return {
    amount: effectivenessMultiplier === 0 ? 0 : Math.max(1, Math.round(dmg)),
    effectiveness,
    effectivenessLabel,
    isCrit,
  }
}

// Cor do numero de dano segue a efetividade de tipo, nao o crit.
const EFFECTIVENESS_COLORS: Record<Effectiveness, string> = {
  super: '#ff8c1a',
  effective: '#ffe14d',
  normal: '#ffffff',
  weak: '#5a5a5a',
  immune: '#000000',
}

// Texto de combate flutuante acima do alvo. Hits com rotulo de efetividade
// (ex: "Super efetivo!") desenham 2 linhas empilhadas, entao reservam 2
// slots de raia em vez de 1.
function spawnDamageNumber(world: WorldState, target: WorldEntity, result: DamageResult): void {
  world.effects.push(createWorldEffect(world.counters, {
    type: 'damageNumber',
    x: target.x, y: target.y,
    targetX: target.x, targetY: target.y - target.radius - 40,
    color: EFFECTIVENESS_COLORS[result.effectiveness],
    duration: 0.9,
    value: result.amount,
    effectiveness: result.effectiveness !== 'normal' ? result.effectiveness : undefined,
    effectivenessLabel: result.effectivenessLabel,
    owner: target,
    laneSize: result.effectivenessLabel ? 2 : 1,
  }))
}

// BASIC_ATTACK e um unico objeto module-level compartilhado — mutar seu
// `.type` direto corromperia pra qualquer outra entidade usando ele no meio
// de outra luta. Isso monta um override por-ataque tipado pro tipo primario
// do atacante.
function basicAttackFor(attackerSpecies: { type: Ability['type'] }): Ability {
  return { ...BASIC_ATTACK, type: attackerSpecies.type }
}

// Escolhe o golpe pronto (fora de cooldown) que causa mais dano no
// `defenderEntity`. Golpes de status/nao-dano (power 0) sao excluidos da
// selecao. Golpes que o jogador desligou manualmente (poke.disabledAbilities)
// tambem sao excluidos da auto-selecao — inimigos selvagens nunca tem esse
// campo setado, entao o filtro e um no-op pra eles.
// `aoeTargetCounter` e uma funcao (ability) => numero de alvos que um cast
// AOE atingiria, usada pra preferir AOE quando atingiria 2+ alvos.
function pickAbility(world: WorldState, entity: WorldEntity, defenderEntity: WorldEntity, aoeTargetCounter: (a: Ability) => number): Ability | null {
  const rng = world.rng
  const clima = world.clima?.tipo ?? null
  const attackerSpecies = SPECIES[entity.poke.speciesId]
  const disabled = entity.poke.disabledAbilities || {}
  // No maximo 4 golpes (+ o AOE de nivel 50 pro POKE do jogador). Selvagem usa
  // os 4 ultimos que a especie aprenderia naquele nivel, sem AOE — ver
  // data/activeAbilities.ts.
  const candidateIds = golpesUtilizaveis(entity.poke, attackerSpecies, entity.kind === 'enemy')
    .filter((id) => !disabled[id])
    // Disable: golpe especifico temporariamente fora dos candidatos enquanto
    // o timer nao zera -- mesmo ponto de filtro do "desligado pelo jogador"
    // acima, so que temporario (ver types.ts#disabledAbilityId).
    .filter((id) => !(entity.disabledAbilityUntil && entity.disabledAbilityUntil > 0 && id === entity.disabledAbilityId))
    // Torment: nunca deixa repetir o ultimo golpe usado enquanto o timer nao
    // zera. Recalculado a cada chamada (nao fixado no momento do cast): "o
    // ultimo usado" muda de golpe a cada turno.
    .filter((id) => !(entity.tormentedUntil && entity.tormentedUntil > 0 && id === entity.lastUsedAbilityId))
    // Curse (variante Ghost): a variante pra outros tipos (buff proprio, sem
    // custo de HP) nao esta implementada neste motor — fora do tipo GHOST o
    // golpe fica descartado aqui mesmo, antes de golpeDeApoioUtil decidir se
    // "vale a pena". Sem precedente de golpe restrito por tipo neste arquivo
    // (conferido: nenhum outro golpe filtra `candidateIds` por tipo do
    // atacante) — checagem nova.
    .filter((id) => id !== 'curse' || attackerSpecies.type === 'GHOST' || attackerSpecies.type2 === 'GHOST')

  // Encore: enquanto o timer nao zera, SO o golpe forcado entra na escolha.
  // Se ele estiver em cooldown, `prontos` fica vazio e o fallback pro Ataque
  // Basico (mais abaixo) ja cobre o caso, sem logica nova.
  const encoreAtivo = !!(entity.forcedAbilityUntil && entity.forcedAbilityUntil > 0 && entity.forcedAbilityId)
  const candidatosFinais = encoreAtivo
    ? candidateIds.filter((id) => id === entity.forcedAbilityId)
    : candidateIds

  const prontos = candidatosFinais
    .map((id) => getAbility(id))
    .filter((a): a is Ability => a != null && isAbilityReady(entity, a.id))

  // GOLPE DE STATUS PURO entra na escolha (Leva B). A regra e simples e
  // deliberadamente conservadora: so vale a pena se o status REALMENTE for
  // pegar no alvo agora — nao pegou por imunidade de tipo, por o alvo ja ter
  // status, ou por estar na janela de reaplicacao, e o golpe volta a ser
  // ignorado. Sem essa checagem o POKE gastaria turnos jogando Thunder Wave
  // em quem ja esta paralisado, e a leitura seria "parou de atacar do nada".
  //
  const ready = prontos.filter((ability) => isDamagingAbility(ability))

  // ...MAS SO SE O ALVO FOR SOBREVIVER AO MELHOR GOLPE DE DANO.
  //
  // Sem essa condicao o POKE abre TODA luta com um golpe de status, inclusive
  // contra inimigo que ele mata em um golpe — e ai o status e um turno jogado
  // fora num alvo que nem chega a sofrer o efeito. Medido: sem a checagem, uma
  // hunt onde o jogador esta muito acima do nivel (Clareira Nv85) caiu de 1.308
  // para 997 kills/hora, um quarto do farm, porque metade dos turnos virava
  // abertura de status inutil.
  //
  // Com ela a regra vira a jogada certa do jogo real: paralisar quem vai
  // aguentar a troca, bater em quem nao vai.
  // Taunt: enquanto silenciado, pula INTEIRO o bloco de golpe de status e vai
  // direto pro golpe de dano (ready, abaixo) -- estar calado nos jogos
  // significa exatamente isso, so golpe de dano entra na escolha.
  const estaSilenciado = !!(entity.silenciadoAte && entity.silenciadoAte > 0)
  const statusPronto = estaSilenciado ? [] : prontos.filter((a) => (
    a.power === 0 && (
      (a.status != null && statusVaiPegar(defenderEntity, a.status, a.id))
      || golpeDeApoioUtil(world, entity, defenderEntity, a, ready, clima)
    )
  ))
  if (statusPronto.length > 0) {
    // Dano CRU aqui, nao o esperado: a pergunta e "esse golpe mata se acertar?",
    // nao "quanto ele tira em media". Usar o esperado (ja descontado pela
    // precisao) fazia um golpe de 70% que mata em cheio contar como se nao
    // matasse — e o POKE ia buffar em vez de matar. Medido: com a comparacao
    // errada, a hunt de nivel alto caiu de 1.052 pra 796 kills/hora.
    const maiorDano = ready.reduce(
      (max, a) => Math.max(max, estimateDamage(rng, entity, defenderEntity, a)),
      0,
    )
    if (maiorDano < defenderEntity.poke.hp) {
      return statusPronto.reduce((melhor, a) => (
        (a.statusChance ?? 0) > (melhor.statusChance ?? 0) ? a : melhor
      ))
    }
  }

  // Ataque Basico e o Struggle deste jogo: entra quando NENHUM dos golpes
  // selecionados pode ser usado agora. Nos jogos reais Struggle dispara por
  // falta de PP; aqui o cooldown E o PP, entao "todos em cooldown" e o mesmo
  // estado. Sem isto, um POKE de poucos golpes de dano (Igglybuff tem 1, e
  // Togepi/Unown/Forretress ficam perto disso) passaria metade dos turnos
  // parado.
  if (ready.length === 0) {
    const basico = basicAttackFor(attackerSpecies)
    if (disabled[BASIC_ATTACK.id] || !isAbilityReady(entity, BASIC_ATTACK.id)) return null
    return basico
  }

  const aoeReady = ready.filter((a) => a.target === 'aoe' && aoeTargetCounter(a) >= 2)
  const pool = aoeReady.length > 0 ? aoeReady : ready
  return pool.reduce((best, a) => (
    danoEsperado(rng, entity, defenderEntity, a) > danoEsperado(rng, entity, defenderEntity, best) ? a : best
  ))
}

// Contador no WorldState, nao em modulo — ver a nota em types.ts#WorldCounters.

// Enfileira um hit pra acontecer HIT_LAND_DELAY segundos a partir de agora —
// resolveHit() aplica o dano/efeito/derrota real quando esse timer zera, em
// sincronia com a pose Shoot/Charge terminando.
function queueHit(world: WorldState, attacker: WorldEntity, target: WorldEntity, ability: Ability): void {
  world.pendingHits.push({ id: `hit-${world.counters.pendingHit++}`, timer: HIT_LAND_DELAY, attackerId: attacker.id, targetId: target.id, ability })
}

// Golpes AOE ganham EXATAMENTE UM anel visual, centrado no atacante,
// pousando no mesmo instante que os hits de dano por-alvo. Enfileirado do
// mesmo jeito que um hit de verdade (sem `target`) pra pousar em sincronia
// com a pose de ataque terminando; resolveHit trata `isAoeVisual` como caso
// especial e pula o anel por-alvo abaixo.
function queueAoeVisual(world: WorldState, attacker: WorldEntity, ability: Ability): void {
  world.pendingHits.push({ id: `hit-${world.counters.pendingHit++}`, timer: HIT_LAND_DELAY, attackerId: attacker.id, targetId: null, ability, isAoeVisual: true })
}

// Texto flutuante de status ("Envenenado!", "Acordou"). Reusa o mesmo efeito
// `abilityName` do nome do golpe: o jogador precisa VER o status entrando e
// saindo, senao o POKE simplesmente para de agir sem explicacao — e o tipo de
// coisa que le como travamento do jogo.
function anunciarStatus(world: WorldState, alvo: WorldEntity, tipo: StatusCondition, quando: 'entrou' | 'saiu' = 'entrou'): void {
  world.effects.push(createWorldEffect(world.counters, {
    type: 'abilityName',
    x: alvo.x, y: alvo.y,
    targetX: alvo.x, targetY: alvo.y + getGroundOffset(alvo) + 14,
    text: quando === 'entrou' ? `${nomeDoStatus(tipo)}!` : `${nomeDoStatus(tipo)} passou`,
    color: corDoStatus(tipo),
    duration: 0.8,
    owner: alvo,
  }))
}

// Texto flutuante de mudanca de atributo ("Ataque ↑↑", "Defesa ↓").
// Uma seta por estagio: e o mesmo vocabulario dos jogos, e diz de relance se o
// golpe subiu um ou dois.
const ROTULO_DE_STAT: Record<string, string> = {
  atkFis: 'Ataque', atkEsp: 'Atq. Esp.', def: 'Defesa', defEsp: 'Def. Esp.', speed: 'Velocidade',
  accuracy: 'Precisão', evasion: 'Evasão',
}

function anunciarEstagios(world: WorldState, alvo: WorldEntity, mudancas: StatChange[]): void {
  const texto = mudancas
    .map((m) => `${ROTULO_DE_STAT[m.stat] ?? m.stat} ${(m.estagios > 0 ? '↑' : '↓').repeat(Math.abs(m.estagios))}`)
    .join('  ')
  world.effects.push(createWorldEffect(world.counters, {
    type: 'abilityName',
    x: alvo.x, y: alvo.y,
    targetX: alvo.x, targetY: alvo.y + getGroundOffset(alvo) + 14,
    text: texto,
    color: mudancas[0].estagios > 0 ? '#4ade80' : '#fb7185',
    duration: 0.9,
    owner: alvo,
  }))
}

// Aparece o nome do golpe logo abaixo do usuario no instante em que e
// usado — separado do numero de dano de queueHit, que so aparece quando o
// hit realmente pousa HIT_LAND_DELAY segundos depois.
function announceAbility(world: WorldState, attacker: WorldEntity, ability: Ability): void {
  world.effects.push(createWorldEffect(world.counters, {
    type: 'abilityName',
    x: attacker.x, y: attacker.y,
    targetX: attacker.x, targetY: attacker.y + getGroundOffset(attacker) + 14,
    text: ability.name,
    color: colorForType(ability.type),
    duration: 0.8,
    owner: attacker,
  }))
}

// Mira de AOE precisa alcancar todo inimigo vivo dentro do raio real do
// splash, nao so os que ja estao a distancia de toque melee
// (`engagedEnemies` — o pool que updateCombat usa so pra decidir se o
// jogador pode agir). Bug relatado explicitamente: com um raio de AOE de
// 240 unidades mas alvos pegos so de engagedEnemies (~raio+raio+10), o
// splash nunca alcancava alem de qualquer inimigo unico ja tocando o
// jogador — o raio grande nao tinha efeito real nenhum.
function nearbyAliveEnemies(world: WorldState): EnemyEntity[] {
  return world.enemies.filter((e) => !isDead(e))
}

/**
 * O status deixa este POKE agir agora? Roda ANTES de escolher o golpe, como
 * nos jogos: sono, congelamento e paralisia comem o turno inteiro, e a
 * confusao troca o golpe por uma pancada em si mesmo.
 *
 * Consome o cooldown global mesmo quando o turno e perdido. Sem isso um POKE
 * dormindo tentaria agir a cada frame e o sono viraria um sorteio de 60 vezes
 * por segundo em vez de um por turno.
 */
/**
 * O golpe errou?
 *
 * A precisao existia no catalogo desde a migracao pro Ultra Sun, mas nao era
 * emitida pro cliente nem usada — todo golpe sempre acertava. Passa a valer
 * agora porque sem ela o status nao tem como ser fiel: Hypnosis com 60% de
 * precisao e Sing com 55% viram sono garantido, e um golpe de sono garantido
 * desequilibra o combate inteiro.
 *
 * UM sorteio por USO, nao por alvo. Nos jogos, um golpe de area rola precisao
 * contra cada alvo; aqui o AOE ja e uma aproximacao (raio em pixels, sem
 * posicionamento de batalha), e rolar por alvo so somaria variancia invisivel
 * a uma mecanica que o jogador nem ve alvo a alvo.
 *
 * PRECISAO EFETIVA leva em conta os estagios de Precisao do atacante e Evasao
 * do defensor (Areia-Fina, Fumaca, Duplo Time, ...) — formula real dos jogos,
 * base 3 (`multiplicadorDeAccuracyOuEvasion`), NAO a formula generica de
 * estagio (base 2) que atkFis/def usam. Precisao do atacante SOBE a chance de
 * acerto; Evasao do defensor DESCE. Foresight/Miracle Eye (`revelado`) fazem o
 * defensor ignorar a propria Evasao contra este atacante.
 */
function golpeErrou(rng: Rng, ability: Ability, atacante: WorldEntity, defensor: WorldEntity): boolean {
  const precisaoBase = ability.accuracy ?? 100
  const multAtacante = multiplicadorDeAccuracyOuEvasion(atacante.estagios.accuracy ?? 0)
  const multDefensor = defensor.revelado ? 1 : multiplicadorDeAccuracyOuEvasion(defensor.estagios.evasion ?? 0)
  const precisaoEfetiva = precisaoBase * multAtacante / multDefensor
  if (precisaoEfetiva >= 100) return false
  return nextFloat(rng) * 100 >= precisaoEfetiva
}

function anunciarErro(world: WorldState, atacante: WorldEntity): void {
  world.effects.push(createWorldEffect(world.counters, {
    type: 'abilityName',
    x: atacante.x, y: atacante.y,
    targetX: atacante.x, targetY: atacante.y + getGroundOffset(atacante) + 14,
    text: 'Errou!',
    color: '#94a3b8',
    duration: 0.7,
    owner: atacante,
  }))
}

function statusImpedeAcao(world: WorldState, entity: WorldEntity, silent: boolean): boolean {
  const r = tentarAgir(world.rng, entity, (poder) => danoDeConfusao(entity, poder))
  if (r.agir) return false

  startGlobalCooldown(entity, MIN_ACTION_GAP)
  if (r.autoDano != null && r.autoDano > 0) {
    takeDamage(entity, r.autoDano, 'physical')
    if (!silent) spawnDamageNumber(world, entity, { amount: r.autoDano, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
  }
  if (!silent) anunciarStatus(world, entity, r.motivo)
  return true
}

function executePlayerAction(world: WorldState, player: PlayerEntity, engagedEnemies: EnemyEntity[], silent: boolean): void {
  if (!canAct(player)) return
  if (statusImpedeAcao(world, player, silent)) return

  const primaryTarget = engagedEnemies[0]
  const allEnemies = nearbyAliveEnemies(world)
  const ability = pickAbility(world, player, primaryTarget, (a) =>
    allEnemies.filter((e) => Math.hypot(e.x - player.x, e.y - player.y) <= (a.radius ?? 0)).length,
  )
  if (!ability) return

  // Registrado no momento da ESCOLHA, nao do acerto: nos jogos o "ultimo
  // golpe usado" (o que Spite/Disable/Encore leem) e fixado quando o golpe e
  // usado, PP gasto ou nao, golpe acertando ou nao. Ataque Basico fica de
  // fora -- e o Struggle deste jogo, nao um golpe de moveset de verdade.
  if (ability.id !== BASIC_ATTACK.id) player.lastUsedAbilityId = ability.id

  startCooldown(player, ability.id, scaledCooldown(ability, velocidadeEfetiva(player)))
  startGlobalCooldown(player, MIN_ACTION_GAP)
  triggerAttackAnim(player, ability.target === 'aoe', primaryTarget)
  announceAbility(world, player, ability)

  if (golpeErrou(world.rng, ability, player, primaryTarget)) {
    if (!silent) anunciarErro(world, player)
    return
  }

  const targets = ability.target === 'aoe'
    ? allEnemies.filter((e) => Math.hypot(e.x - player.x, e.y - player.y) <= (ability.radius ?? 0))
    : [engagedEnemies[0]].filter(Boolean)

  // Dano real primeiro, visual/recoil de AOE depois (PH-10): os dois pousam
  // no MESMO tick (mesmo timer), mas `landed` processa na ordem de insercao
  // e `resolveHit` cancela um hit inteiro se o atacante ja estiver morto
  // (guard contra acao enfileirada antes de um desmaio anterior). Recoil de
  // Explosao/Autodestruicao mata o proprio atacante — enfileirado antes dos
  // hits de dano real, o guard cancelava o dano no(s) alvo(s) sempre que o
  // recoil terminava de matar quem usou o golpe.
  for (const target of targets) {
    queueHit(world, player, target, ability)
  }
  if (ability.target === 'aoe') queueAoeVisual(world, player, ability)
}

function executeEnemyAction(world: WorldState, enemy: EnemyEntity, player: PlayerEntity, silent: boolean): void {
  if (!canAct(enemy)) return
  if (statusImpedeAcao(world, enemy, silent)) return

  const ability = pickAbility(world, enemy, player, () => 1) // inimigos so miram no jogador unico
  if (!ability) return

  // Mesma logica de executePlayerAction acima -- registrado na escolha, nao
  // no acerto.
  if (ability.id !== BASIC_ATTACK.id) enemy.lastUsedAbilityId = ability.id

  startCooldown(enemy, ability.id, scaledCooldown(ability, velocidadeEfetiva(enemy)))
  startGlobalCooldown(enemy, MIN_ACTION_GAP)
  triggerAttackAnim(enemy, ability.target === 'aoe', player)
  announceAbility(world, enemy, ability)

  if (golpeErrou(world.rng, ability, enemy, player)) {
    if (!silent) anunciarErro(world, enemy)
    return
  }

  // Mesma ordem de executePlayerAction acima — dano real antes do recoil de
  // AOE (PH-10).
  queueHit(world, enemy, player, ability)
  if (ability.target === 'aoe') queueAoeVisual(world, enemy, ability)
}

// Aplica o dano/texto/efeito-de-golpe/tratamento-de-derrota de um hit
// enfileirado — chamado quando seu timer chega a 0, ou seja, quando a pose
// Shoot/Charge do atacante ja terminou de tocar.
function resolveHit(world: WorldState, hit: PendingHit, defeatedEnemyIds: string[], onPlayerFainted: () => void, silent: boolean): void {
  const attacker = findEntityById(world.player, world.enemies, hit.attackerId)
  if (!attacker) return
  const { ability } = hit

  // Bug relatado explicitamente: um POKE derrotado entre o enfileiramento
  // de um hit (pose de ataque comeca) e o hit realmente pousar
  // (HIT_LAND_DELAY depois) ainda causava dano. Um atacante desmaiado/morto
  // nao pode mais concretizar nada que enfileirou antes de morrer — cancela
  // a acao inteira, dano incluso.
  if (isDead(attacker)) return

  if (hit.isAoeVisual) {
    // O unico anel deste cast AOE, centrado no atacante — ver
    // queueAoeVisual. Hits individuais por-alvo abaixo pulam desenhar o
    // proprio. Pulado em silent (PH-11): farm offline/flush headless roda
    // isto ate 250k vezes por chamada sem ninguem renderizando.
    if (!silent) {
      world.effects.push(createWorldEffect(world.counters, {
        type: 'abilityEffect',
        x: attacker.x, y: attacker.y,
        targetX: attacker.x, targetY: attacker.y - attacker.radius * 0.6,
        color: colorForType(ability.type),
        isAoe: true,
        duration: AOE_EFFECT_DURATION,
        worldSize: (ability.radius ?? 0) * 2,
        elementType: ability.type,
        // Anel unico do cast AOE inteiro (nao um por alvo) — gate por
        // `power === 0` aqui e o mais fino que da pra fazer sem duplicar
        // a checagem de sucesso por alvo (statusVaiPegar corre depois, por
        // hit individual). Golpe de status em area troca pra arte de
        // buff/debuff mesmo que acerte 0 alvos de verdade — mesmo espirito
        // do resto do jogo, que mostra a animacao do golpe independente do
        // resultado (ver announceAbility).
        statusDirection: ability.power === 0 ? direcaoDoGolpeDeStatus(ability.statChanges) : undefined,
      }))
    }

    if (SELF_DESTRUCT_ABILITY_KEYS.has(ability.id) && !isDead(attacker)) {
      const recoil = Math.round(attacker.poke.hp * SELF_DESTRUCT_HP_LOSS_PERCENT)
      takeDamage(attacker, recoil)
      if (!silent) spawnDamageNumber(world, attacker, { amount: recoil, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
      if (isDead(attacker)) {
        if (attacker.kind === 'player') {
          if (!attacker.fainted) {
            attacker.fainted = true
            onPlayerFainted()
          }
        } else if (!attacker.deathHandled) {
          attacker.deathHandled = true
          defeatedEnemyIds.push(attacker.id)
        }
      }
    }
    return
  }

  const target = findEntityById(world.player, world.enemies, hit.targetId)
  if (!target || isDead(target)) return // ex: um aliado de AOE ja tinha finalizado antes

  // Wide Guard: escudo do ALVO cancela o hit de AREA inteiro nele — sem dano,
  // sem efeito colateral, como se o golpe nunca tivesse pousado. So mexe em
  // AOE (`ability.target === 'aoe'`); golpe de alvo unico passa direto, igual
  // aos jogos reais (Wide Guard nao bloqueia golpe single-target).
  if (ability.target === 'aoe' && (target.escudos?.wideGuard ?? 0) > 0) return

  const result = computeDamage(world.rng, attacker, target, ability, world.pessimista, world.clima?.tipo ?? null)
  // Dano REALMENTE causado, limitado ao HP que o alvo tinha. `result.amount` e
  // o numero cru da formula e pode passar MUITO do HP do alvo (um POKE Nivel 85
  // batendo num Nivel 40 causa varias vezes a vida dele). E o que dreno e recuo
  // precisam usar, como nos jogos: Double-Edge devolve 33% do que TIROU, nao
  // 33% do que teria tirado num alvo infinito.
  //
  // BUG QUE ISTO CORRIGE: sem o teto, um golpe de recuo virava suicidio em
  // qualquer hunt onde o jogador estivesse acima do nivel. Medido, custava um
  // quarto das kills/hora no Nivel 85 — o POKE se matava sozinho.
  const danoCausado = Math.min(result.amount, target.poke.hp)
  // Golpe de status causa 0 de dano — nao mostra "0" flutuando sobre o alvo
  // nem registra "ultimo dano recebido" (Counter/Mirror Coat refletiriam nada).
  if (result.amount > 0) {
    takeDamage(target, result.amount, resolveAbilityCategory(ability, attacker.poke))
    if (!silent) spawnDamageNumber(world, target, result)
  }

  // ARMADILHA DE CAMPO (Spikes/Toxic Spikes/Stealth Rock/Sticky Web): golpe
  // sem alvo real de verdade — o "hit" acima e so o veiculo que o resto do
  // pipeline exige, o efeito de fato e incrementar o placar do lado INIMIGO
  // (`world.enemyHazards`), descarregado no proximo inimigo que nascer (ver
  // simulation.ts#aplicarHazardsAoInimigo). So o JOGADOR planta — golpeDeApoioUtil
  // acima ja restringe a IA a so considerar isto util nesse lado.
  if (ability.hazard && attacker.kind === 'player') {
    world.enemyHazards ??= { spikes: 0, toxicSpikes: 0, stealthRock: false, stickyWeb: false }
    switch (ability.hazard) {
      case 'spikes':
        world.enemyHazards.spikes = Math.min(3, world.enemyHazards.spikes + 1)
        break
      case 'toxic_spikes':
        world.enemyHazards.toxicSpikes = Math.min(2, world.enemyHazards.toxicSpikes + 1)
        break
      case 'stealth_rock':
        world.enemyHazards.stealthRock = true
        break
      case 'sticky_web':
        world.enemyHazards.stickyWeb = true
        break
    }
  }

  // HABILIDADES PASSIVAS DE PUNICAO POR CONTATO (Static, Flame Body, Poison
  // Point, Rough Skin, Aftermath, Effect Spore, Iron Barbs).
  //
  // SIMPLIFICACAO CONSCIENTE: este catalogo de golpes nao tem um campo
  // "contact"/"makesContact" como a PokeAPI real -- `ability.category ===
  // 'physical'` e usado aqui como aproximacao de "golpe de contato" (na
  // Pokedex de verdade a maioria dos golpes fisicos encosta no alvo; os
  // poucos que nao encostam ficam fora de escopo).
  //
  // A Trait pertence a quem FOI ATINGIDO (`target`) e reage contra quem
  // golpeou (`attacker`) -- como nos jogos: encostar num POKE com Static
  // pode paralisar VOCE, nao ele.
  if (ability.category === 'physical' && result.amount > 0) {
    const trait = traitOf(target.poke.speciesId)
    switch (trait) {
      case 'static':
        aplicarStatus(world.rng, attacker, 'paralysis', 30)
        break
      case 'flame_body':
        aplicarStatus(world.rng, attacker, 'burn', 30)
        break
      case 'poison_point':
        aplicarStatus(world.rng, attacker, 'poison', 30)
        break
      case 'effect_spore': {
        // Golpe de po real (Spore/Stun Spore/etc) e imune pra GRASS -- aqui
        // e uma Trait, nao um golpe, entao a checagem de tipo e manual: se o
        // ATACANTE (quem receberia o status) e GRASS, nem sorteia.
        const especieAtacante = SPECIES[attacker.poke.speciesId]
        const atacanteEhGrass = especieAtacante.type === 'GRASS' || especieAtacante.type2 === 'GRASS'
        if (!atacanteEhGrass && nextFloat(world.rng) * 100 < 30) {
          const opcoes: StatusCondition[] = ['poison', 'paralysis', 'sleep']
          const escolhido = opcoes[Math.floor(nextFloat(world.rng) * opcoes.length)]
          aplicarStatus(world.rng, attacker, escolhido, 100)
        }
        break
      }
      case 'rough_skin':
      case 'iron_barbs': {
        // Sempre dispara (nao e chance) -- recoil de 1/8 do HP MAXIMO do
        // atacante, minimo 1. Mesmo guard de morte em cascata que
        // SELF_DESTRUCT_ABILITY_KEYS usa acima: se o recoil matar o
        // atacante, credita o kill/desmaio corretamente.
        const recoil = Math.max(1, Math.round(attacker.poke.stats.hp / 8))
        takeDamage(attacker, recoil)
        if (!silent) spawnDamageNumber(world, attacker, { amount: recoil, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
        if (isDead(attacker)) {
          if (attacker.kind === 'player') {
            if (!attacker.fainted) {
              attacker.fainted = true
              onPlayerFainted()
            }
          } else if (!attacker.deathHandled) {
            attacker.deathHandled = true
            defeatedEnemyIds.push(attacker.id)
          }
        }
        break
      }
      case 'aftermath': {
        // Diferente das outras: so dispara quando o ALVO (portador da
        // Trait) DESMAIA por este hit fisico. `target` ja tomou o dano
        // acima nesta mesma resolveHit, entao isDead(target) aqui reflete
        // o resultado real deste hit.
        if (isDead(target)) {
          const recoil = Math.round(attacker.poke.stats.hp / 4)
          takeDamage(attacker, recoil)
          if (!silent) spawnDamageNumber(world, attacker, { amount: recoil, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
          if (isDead(attacker)) {
            if (attacker.kind === 'player') {
              if (!attacker.fainted) {
                attacker.fainted = true
                onPlayerFainted()
              }
            } else if (!attacker.deathHandled) {
              attacker.deathHandled = true
              defeatedEnemyIds.push(attacker.id)
            }
          }
        }
        break
      }
      default:
        break
    }
  }

  // Golpes de clima (Rain Dance/Sunny Day/Hail/Sandstorm): efeito de CAMPO, nao
  // de status numa entidade -- sobrescreve o clima atual (last-caster-wins,
  // sem empilhar) e passa a afetar os dois lados do combate dali em diante.
  // Fora do `if (!isDead(target))` de proposito: poder 0, nunca mata ninguem,
  // e o efeito nao depende do alvo ter sobrevivido.
  const climaDoGolpe = CLIMA_DO_GOLPE[ability.id]
  if (climaDoGolpe) {
    world.clima = { tipo: climaDoGolpe, turnosRestantes: 5 }
  }

  // Efeito de status DEPOIS do dano, como nos jogos: um golpe que mata nao
  // chega a envenenar. `aplicarEfeitosDoGolpe` tambem descongela o alvo quando
  // o golpe e de FIRE.
  //
  // `statusRecebeuEm` guarda quem de fato recebeu ALGUM efeito (pra decidir,
  // logo abaixo, se mostra o VFX de status e em cima de quem) — nao existia
  // antes desta leva porque nada fora deste `if` precisava saber.
  let statusRecebeuEm: WorldEntity | null = null
  if (!isDead(target)) {
    const aplicado = aplicarEfeitosDoGolpe(world.rng, target, ability)
    if (aplicado) {
      statusRecebeuEm = target
      if (!silent) anunciarStatus(world, target, aplicado.tipo, 'entrou')
    }

    // Mudanca de atributo. O anuncio vai em quem RECEBEU (o proprio usuario num
    // Danca das Espadas, o alvo num Rosnado) — mostrar "+Ataque" flutuando
    // sobre o inimigo quando quem se fortaleceu foi voce leria como o contrario
    // do que aconteceu.
    const mudancas = aplicarMudancasDeStat(world.rng, attacker, target, ability)
    if (mudancas.length) {
      statusRecebeuEm = ability.statTarget === 'self' ? attacker : target
      if (!silent) anunciarEstagios(world, statusRecebeuEm, mudancas)
    }

    // Odor Sleuth/Foresight/Miracle Eye: ignora UMA imunidade natural de tipo
    // do ALVO pelo resto da luta — sem timer, so `limparEstadoVolatil` (fim
    // de luta) tira. Generico por id (mesmo golpe novo que entrar no mapa
    // funciona sem tocar aqui de novo) — ver REVELA_IMUNIDADE.
    const imunidadeRevelada = REVELA_IMUNIDADE[ability.id]
    if (imunidadeRevelada) target.revelado = imunidadeRevelada

    // Magnet Rise: self-target, ~5 turnos de imunidade a GROUND. Golpe de
    // status sem statChanges (nao passa por aplicarMudancasDeStat acima) —
    // por isso o id do golpe e checado direto, mesmo padrao do bloco acima.
    if (ability.id === 'magnet_rise') {
      attacker.imuneAoTipoVolatil = { tipo: 'GROUND', restante: MAGNET_RISE_TURNOS * TURNO_SEGUNDOS }
    }

    // Golpes de disable/lock (Taunt/Spite/Disable/Encore/Torment). Depois do
    // dano, como o resto dos efeitos colaterais acima: golpe que mata nao
    // chega a travar nada. Spite/Disable/Encore agem sobre o ULTIMO golpe que
    // o ALVO usou (`target.lastUsedAbilityId`) -- se o alvo nunca usou nenhum
    // golpe ainda, o efeito falha em silencio, sem VFX (mesmo espirito de
    // statusVaiPegar acima: nao ha "acertou nada" pra anunciar).
    switch (ability.id) {
      case 'taunt':
        target.silenciadoAte = TAUNT_DURATION
        statusRecebeuEm = target
        break
      case 'torment':
        target.tormentedUntil = TORMENT_DURATION
        statusRecebeuEm = target
        break
      case 'spite': {
        const golpeAnterior = target.lastUsedAbilityId
        if (golpeAnterior) {
          target.cooldowns[golpeAnterior] = (target.cooldowns[golpeAnterior] ?? 0) + SPITE_COOLDOWN_BONUS
          statusRecebeuEm = target
        }
        break
      }
      case 'disable': {
        const golpeAnterior = target.lastUsedAbilityId
        if (golpeAnterior) {
          target.disabledAbilityId = golpeAnterior
          target.disabledAbilityUntil = DISABLE_DURATION
          statusRecebeuEm = target
        }
        break
      }
      case 'encore': {
        const golpeAnterior = target.lastUsedAbilityId
        if (golpeAnterior) {
          target.forcedAbilityId = golpeAnterior
          target.forcedAbilityUntil = ENCORE_DURATION
          statusRecebeuEm = target
        }
        break
      }
      default:
        break
    }

    // LEECH_SEED / NIGHTMARE: setam flag volatil no ALVO, sem timer —
    // tickada por tickStatus (statusSystem.ts) a cada turno DELE. Nenhum dos
    // dois usa o sistema de `ability.status` do catalogo (paralysis/poison/
    // etc), entao a aplicacao e toda custom aqui, no mesmo espirito do resto
    // desta secao.
    if (ability.id === 'leech_seed' && !target.seeded) {
      const especieAlvo = SPECIES[target.poke.speciesId]
      const alvoEhGrass = especieAlvo.type === 'GRASS' || especieAlvo.type2 === 'GRASS'
      if (!alvoEhGrass) target.seeded = { sourceId: attacker.id }
    }
    if (ability.id === 'nightmare') target.nightmareDot = true
  }

  // FOCUS ENERGY (self-target): soma +2 num contador PARALELO de estagio de
  // critico (`estagioDeCritico`, ver types.ts), que persiste ate fim de luta
  // sem timer proprio — igual `estagios`, mas NAO e um deles (aqueles estao
  // presos aos 5 stats do catalogo gerado). Consumido pela formula de critico
  // em computeDamage.
  if (ability.id === 'focus_energy') {
    attacker.estagioDeCritico = (attacker.estagioDeCritico ?? 0) + 2
  }

  // LASER FOCUS (self-target): seta a flag de uso unico que garante critico
  // no PROXIMO golpe de DANO deste atacante (ver computeDamage, que consome a
  // flag). Nada acontece aqui alem de setar a flag — o bypass e a chance
  // moram todos no calculo de dano.
  if (ability.id === 'laser_focus') {
    attacker.proximoGolpeCriticoGarantido = true
  }

  // CURA PURA (Recover, Synthesis, Soft-Boiled — 10 golpes). Cura sempre o
  // ATACANTE, nunca o alvo do hit: todos eles tem `target: 'user'` no catalogo,
  // e o "alvo" so existe aqui porque a fila de hits deste motor sempre tem um.
  if (ability.healPercent) {
    const quanto = Math.max(1, Math.round(attacker.poke.stats.hp * ability.healPercent / 100))
    heal(attacker, quanto)
    if (!silent) spawnDamageNumber(world, attacker, { amount: -quanto, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
  }

  // ESCUDOS (Screens: Reflect/Light Screen/Safeguard/Mist/Lucky Chant/Wide
  // Guard). Mesma logica de "self-target" da cura pura acima: liga o timer no
  // proprio ATACANTE, nunca no `target` do hit — ver ESCUDO_ABILITIES no topo
  // do arquivo pro porque disso.
  const chaveDeEscudo = ESCUDO_ABILITIES[ability.id]
  if (chaveDeEscudo) {
    attacker.escudos ??= {}
    attacker.escudos[chaveDeEscudo] = ESCUDO_DURACAO_SEGUNDOS
  }

  // CURSE (variante Ghost): custa 50% do PROPRIO HP MAXIMO do atacante
  // (CURSE_SELF_MAX_HP_LOSS_PERCENT — variante de SELF_DESTRUCT_HP_LOSS_PERCENT
  // com HP maximo em vez de atual). Gate por tipo GHOST ja filtra em
  // pickAbility/candidateIds; repetido aqui como defesa — se por algum motivo
  // um curse escapar do filtro (ex.: chamado direto num teste), fizzla
  // silenciosamente em vez de aplicar o efeito errado num atacante nao-Ghost.
  if (ability.id === 'curse') {
    const especieAtacante = SPECIES[attacker.poke.speciesId]
    const atacanteEhGhost = especieAtacante.type === 'GHOST' || especieAtacante.type2 === 'GHOST'
    if (atacanteEhGhost && !isDead(attacker)) {
      const custo = Math.max(1, Math.round(attacker.poke.stats.hp * CURSE_SELF_MAX_HP_LOSS_PERCENT))
      takeDamage(attacker, custo)
      if (!silent) spawnDamageNumber(world, attacker, { amount: custo, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
      if (!isDead(target)) target.curseDot = true
      if (isDead(attacker)) {
        if (attacker.kind === 'player') {
          if (!attacker.fainted) {
            attacker.fainted = true
            onPlayerFainted()
          }
        } else if (!attacker.deathHandled) {
          attacker.deathHandled = true
          defeatedEnemyIds.push(attacker.id)
        }
      }
    }
  }

  // INGRAIN / AQUA RING: mesmo campo `regenPercent` pros dois (HoT self-target
  // sem timer, dura ate o fim da luta — ver limparEstadoVolatil).
  if (ability.id === 'ingrain' || ability.id === 'aqua_ring') {
    attacker.regenPercent = INGRAIN_AQUA_RING_REGEN_PERCENT
  }

  // WISH: enfileira uma cura atrasada 2 turnos, MESMO PADRAO de pendingHits
  // (tick down em updateCombat, resolve quando timer<=0, lookup por id em vez
  // de referencia direta). `targetId` e o id da ENTIDADE que lancou (nao do
  // poke): world.player mantem o mesmo id mesmo trocando de poke ativo por
  // desmaio (autoSwitchTeamOnFaint em simulation.ts so troca `player.poke`).
  if (ability.id === 'wish') {
    const healAmount = Math.max(1, Math.round(attacker.poke.stats.hp * WISH_HEAL_PERCENT))
    world.pendingWishes.push({ timer: 2 * TURNO_SEGUNDOS, healAmount, targetId: attacker.id })
  }

  // FLINCH: o alvo perde o proximo turno.
  //
  // DESVIO CONSCIENTE. Nos jogos flinch so pega se quem usou agir PRIMEIRO no
  // turno — aqui nao ha ordem de turno pra consultar, o combate e continuo.
  // Modelado como "o alvo leva um cooldown global extra", que e o efeito
  // observavel do flinch. Mais fiel que ignorar (25 golpes voltariam a ser
  // dado morto) e mais honesto que fingir uma ordem de turno que nao existe.
  if (ability.flinchChance && nextFloat(world.rng) * 100 < ability.flinchChance) {
    startGlobalCooldown(target, MIN_ACTION_GAP)
  }

  // DRENO e RECUO, os dois no mesmo campo: `drainPercent` positivo cura o
  // atacante (Absorb = 50% do dano causado), negativo machuca (Double-Edge =
  // -33%). E como a PokeAPI modela, e manter os dois juntos evita que um golpe
  // de recuo passe a curar por engano de sinal.
  if (ability.drainPercent && danoCausado > 0) {
    const quanto = Math.max(1, Math.round(danoCausado * Math.abs(ability.drainPercent) / 100))
    if (ability.drainPercent > 0) {
      heal(attacker, quanto)
      if (!silent) spawnDamageNumber(world, attacker, { amount: -quanto, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
    } else {
      takeDamage(attacker, quanto)
      if (!silent) spawnDamageNumber(world, attacker, { amount: quanto, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
      if (isDead(attacker)) {
        if (attacker.kind === 'player') {
          if (!attacker.fainted) {
            attacker.fainted = true
            onPlayerFainted()
          }
        } else if (!attacker.deathHandled) {
          attacker.deathHandled = true
          defeatedEnemyIds.push(attacker.id)
        }
      }
    }
  }

  const isPlayerAttacker = attacker.kind === 'player'
  const isAoe = ability.target === 'aoe'
  // Golpe de status alvo-unico: SO mostra VFX quando algo de fato pegou
  // (`statusRecebeuEm`) — golpe que falhou (imunidade, ja tinha status,
  // janela de reaplicacao) nao fica com um circulo colorido em cima de nada
  // ter acontecido. Em cima de quem RECEBEU, nao sempre do alvo do hit
  // (Danca das Espadas acerta o proprio atacante).
  if (!isAoe && !silent && (ability.power > 0 || statusRecebeuEm)) {
    const local = ability.power === 0 && statusRecebeuEm ? statusRecebeuEm : target
    world.effects.push(createWorldEffect(world.counters, {
      type: 'abilityEffect',
      x: local.x, y: local.y,
      targetX: local.x, targetY: local.y - local.radius * 0.6,
      color: colorForType(ability.type),
      isAoe: false,
      duration: IMPACT_EFFECT_DURATION,
      elementType: ability.type,
      statusDirection: ability.power === 0 ? direcaoDoGolpeDeStatus(ability.statChanges) : undefined,
    }))
  }

  if (!isDead(target)) return
  if (isPlayerAttacker) {
    if (!target.deathHandled) {
      target.deathHandled = true
      defeatedEnemyIds.push(target.id)
    }
  } else if (target.kind === 'player' && !target.fainted) {
    target.fainted = true
    onPlayerFainted()
  }
}

// Trait -> tipo de clima que ela liga automaticamente (Drizzle/Sand Stream/
// Snow Warning/Drought — ver data/traits.ts). So estas 4 tem efeito aqui.
const TRAIT_CLIMA: Partial<Record<TraitId, ClimaTipo>> = {
  drizzle: 'chuva',
  sand_stream: 'areia',
  snow_warning: 'granizo',
  drought: 'sol',
}

// Clima ligado por TRAIT (Drizzle/Sand Stream/Snow Warning/Drought) e
// INDEFINIDO nos jogos reais — dura ate outra Trait ou golpe de clima
// substituir, sem contagem de turnos (diferente do clima ligado por GOLPE tipo
// Rain Dance, que dura 5 turnos e nao existe neste motor ainda). `Infinity` e
// o mesmo sentinela de "sem timer" que `lastDamageTaken.age` ja usa neste
// motor (ver engine/entity.ts).
const CLIMA_DE_TRAIT_TURNOS = Infinity

/**
 * HOOK DE ENTRADA EM COMBATE: dispara UMA vez, no primeiro frame em que
 * `self` fica engajado (ver updateCombat#entradaProcessada), pra Traits que
 * reagem a "acabou de entrar em campo" — Intimidate, Download, e o clima
 * automatico (Drizzle/Sand Stream/Snow Warning/Drought). Chamado
 * simetricamente: uma vez pro jogador contra o alvo principal, e uma vez por
 * cada inimigo que acabou de engajar contra o jogador.
 */
function resolveEntryHook(world: WorldState, self: WorldEntity, opponent: WorldEntity, silent: boolean): void {
  const trait = traitOf(self.poke.speciesId)
  if (!trait) return

  const climaTipo = TRAIT_CLIMA[trait]
  if (climaTipo) {
    if (world.clima?.tipo !== climaTipo) {
      world.clima = { tipo: climaTipo, turnosRestantes: CLIMA_DE_TRAIT_TURNOS }
    }
    return
  }

  if (trait === 'intimidate') {
    const mudanca = aplicarEstagioUnico(opponent, 'atkFis', -1)
    if (mudanca && !silent) anunciarEstagios(world, opponent, [mudanca])
    return
  }

  if (trait === 'download') {
    // Mesmos valores (stat crua x multiplicador de estagio) que computeDamage
    // usa pro calculo de dano fisico/especial — ver computeDamage#def acima.
    const opponentPoke = opponent.poke
    const defFis = opponentPoke.stats.def * multiplicadorDeStat(opponent.estagios, 'def')
    const defEsp = opponentPoke.stats.defEsp * multiplicadorDeStat(opponent.estagios, 'defEsp')
    const stat: StatDeEstagio = defFis <= defEsp ? 'atkFis' : 'atkEsp'
    const mudanca = aplicarEstagioUnico(self, stat, 1)
    if (mudanca && !silent) anunciarEstagios(world, self, [mudanca])
  }
}

export interface CombatResult {
  defeatedEnemyIds: string[]
  playerJustFainted: boolean
}

// Devolve { defeatedEnemyIds, playerJustFainted } pro chamador (controller.ts)
// distribuir EXP/loot/rolls de captura e disparar reacoes de UI.
export function updateCombat(world: WorldState, dt: number, opts: { silent?: boolean } = {}): CombatResult {
  const silent = opts.silent ?? false
  const { player, enemies } = world
  if (!player) return { defeatedEnemyIds: [], playerJustFainted: false }

  const defeatedEnemyIds: string[] = []
  let playerJustFainted = false

  tickCooldowns(player, dt)
  for (const enemy of enemies) tickCooldowns(enemy, dt)

  // Turno de clima fecha na MESMA cadencia do relogio de status do jogador
  // (`proximoTurnoDeStatus`, mesmo epsilon que tickStatus usa) -- capturado
  // ANTES do loop abaixo mutar esse relogio. Decrementa uma vez por
  // updateCombat, nao por entidade: o clima e do WORLD, nao de cada POKE.
  const turnoDeClimaFechou = !isDead(player) && player.proximoTurnoDeStatus - dt <= 1e-9

  // Status ANTES das acoes: veneno/queimadura podem derrubar o POKE neste
  // frame, e um POKE derrubado nao age. Passa pelo mesmo caminho de morte que
  // o dano de golpe (loot, EXP, desmaio) — dano de veneno que matasse sem
  // creditar o kill seria um buraco silencioso na economia.
  for (const entity of [player, ...enemies]) {
    if (isDead(entity)) continue
    const { dano, expirados, drenoParaOrigem } = tickStatus(world.rng, entity, dt, world.clima?.tipo ?? null)
    if (!silent) {
      for (const tipo of expirados) anunciarStatus(world, entity, tipo, 'saiu')
    }
    if (dano <= 0) continue

    takeDamage(entity, dano)
    if (!silent) spawnDamageNumber(world, entity, { amount: dano, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })

    // LEECH_SEED: dreno vai pra quem plantou a semente, se ela ainda estiver
    // viva. Se a origem ja saiu de campo (derrotada/removida), fizzle
    // parcial — o dano acima ja foi aplicado, so a cura falha em silencio.
    if (drenoParaOrigem) {
      const origem = findEntityById(player, enemies, drenoParaOrigem.sourceId)
      if (origem && !isDead(origem)) {
        heal(origem, drenoParaOrigem.amount)
        if (!silent) spawnDamageNumber(world, origem, { amount: -drenoParaOrigem.amount, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
      }
    }

    if (!isDead(entity)) continue
    if (entity.kind === 'player') {
      if (!player.fainted) {
        player.fainted = true
        playerJustFainted = true
      }
    } else if (!entity.deathHandled) {
      entity.deathHandled = true
      defeatedEnemyIds.push(entity.id)
    }
  }

  if (turnoDeClimaFechou && world.clima) {
    world.clima.turnosRestantes -= 1
    if (world.clima.turnosRestantes <= 0) world.clima = null
  }

  for (const effect of world.effects) tickEffect(effect, dt)
  for (const effect of world.effects) {
    if (effectDone(effect) && effect.ownerId) {
      const owner = findEntityById(player, enemies, effect.ownerId)
      if (owner) releaseEffectLane(owner, effect.id)
    }
  }
  world.effects = world.effects.filter((e) => !effectDone(e))

  for (const hit of world.pendingHits) hit.timer -= dt
  const landed = world.pendingHits.filter((hit) => hit.timer <= 0)
  world.pendingHits = world.pendingHits.filter((hit) => hit.timer > 0)
  for (const hit of landed) {
    resolveHit(world, hit, defeatedEnemyIds, () => {
      playerJustFainted = true
    }, silent)
  }

  // WISH: mesmo padrao de pendingHits acima (tick down, resolve quando
  // timer<=0, lookup por id).
  for (const wish of world.pendingWishes) wish.timer -= dt
  const wishesResolvidas = world.pendingWishes.filter((w) => w.timer <= 0)
  world.pendingWishes = world.pendingWishes.filter((w) => w.timer > 0)
  for (const wish of wishesResolvidas) {
    // Se nao encontrar (lado inimigo, quem lancou ja foi derrotado e removido
    // de world.enemies) ou a entidade estiver morta, a wish fizzla em
    // silencio — sem erro, sem efeito.
    const alvo = findEntityById(player, enemies, wish.targetId)
    if (alvo && !isDead(alvo)) {
      heal(alvo, wish.healAmount)
      if (!silent) spawnDamageNumber(world, alvo, { amount: -wish.healAmount, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
    }
  }

  if (player.fainted) {
    return { defeatedEnemyIds, playerJustFainted }
  }

  // Reset por-entidade do HOOK DE ENTRADA EM COMBATE (ver resolveEntryHook):
  // quem desengajou (perdeu o aggro, ou o jogador se afastou) esquece que ja
  // disparou — a proxima vez que reengajar, Intimidate/Download/clima
  // automatico disparam de novo, como uma troca de POKE nos jogos reais. Roda
  // TODO frame, nao so no fim de luta: um unico inimigo pode desengajar
  // enquanto outros continuam engajados com o jogador.
  if (player.state !== 'engaged' && player.entradaProcessada) player.entradaProcessada = false
  for (const enemy of enemies) {
    if (enemy.state !== 'engaged' && enemy.entradaProcessada) enemy.entradaProcessada = false
  }

  const engagedEnemies = enemies.filter((e) => !isDead(e) && e.state === 'engaged' && e.targetId === player.id)

  if (engagedEnemies.length > 0) {
    const primaryTarget = engagedEnemies[0]

    // HOOK DE ENTRADA EM COMBATE — dispara so no primeiro frame de cada lado
    // engajado (ver resolveEntryHook), simetrico: o jogador contra o alvo
    // principal, e cada inimigo recem-engajado contra o jogador.
    if (!player.entradaProcessada) {
      player.entradaProcessada = true
      resolveEntryHook(world, player, primaryTarget, silent)
    }
    for (const enemy of engagedEnemies) {
      if (!enemy.entradaProcessada) {
        enemy.entradaProcessada = true
        resolveEntryHook(world, enemy, player, silent)
      }
    }

    executePlayerAction(world, player, engagedEnemies, silent)

    for (const enemy of engagedEnemies) {
      if (isDead(enemy) || player.fainted) continue
      executeEnemyAction(world, enemy, player, silent)
    }
  } else {
    // FIM DE BATALHA. Sem nenhum inimigo engajado, a luta acabou — e nos jogos
    // e exatamente ai que TODO estado volatil some: estagios de atributo voltam
    // a zero e a confusao passa.
    //
    // Sem este ponto o jogo nao teria fim de batalha nenhum, e a consequencia
    // nao e teorica: medida, ela custava 27% das kills/hora numa hunt de nivel
    // alto. Cada inimigo novo empilhava mais um Rosnado ou String Shot no
    // jogador, os estagios desciam ate -6 (Velocidade e Ataque a um quarto) e
    // NUNCA voltavam, porque nao existe item que cure estagio nem batalha que
    // termine. O POKE ia ficando permanentemente pior a cada inimigo que
    // matava.
    limparEstadoVolatil(player)
    // Clima e do WORLD, nao da entidade -- por isso reset separado aqui, e
    // nao dentro de `limparEstadoVolatil` (que so mexe em campos de
    // WorldEntity). Mesmo ponto porque e aqui que "fim de batalha" e
    // detectado e quem chama ja tem `world` em maos.
    world.clima = null
  }

  return { defeatedEnemyIds, playerJustFainted }
}
