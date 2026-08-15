// Port de js/systems/CombatSystem.js. Opera sobre um draft imer do
// WorldState inteiro (mesma forma que o `world` original), mutando direto.
//
// Nota (ver engine/types.ts): `entity.target`/`effect.owner`/
// `pendingHit.attacker`/`pendingHit.target` eram referencia direta no
// original — aqui viram id + lookup via findEntityById, unica mudanca de
// forma permitida no port (risco de referencia obsoleta sob Immer).
import { deriveRng, nextFloat, type Rng } from '@/core/rng'
import { getAbility, BASIC_ATTACK, isDamagingAbility, TURNO_SEGUNDOS, type Ability } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import {
  multiplicadorDeVelocidade, multiplicadorDeDanoFisico, multiplicadorDeStat,
  nomeDoStatus, type StatusCondition,
} from '@/data/statusEffects'
import { corDoStatus } from '@/data/statusColors'
import type { StatChange } from '@/data/generated/types'
import {
  tickStatus, tentarAgir, aplicarEfeitosDoGolpe, statusVaiPegar, aplicarMudancasDeStat,
  limparEstadoVolatil, aplicarStatus,
} from './statusSystem'
import { traitOf } from '@/data/traits'
import { resolveAbilityCategory } from '@/data/abilityCategory'
import { SPECIES } from '@/data/pokes'
import type { PokeInstance } from '@/data/pokes'
import { colorForType } from '@/data/typeColors'
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from '@/data/generated/formulas.generated'
import { getEffectiveness } from '@/data/generated/typeChart.generated'
import { rollChance, randRange } from '@/core/random'
import { triggerAttackAnim, ATTACK_ANIM_DURATION } from './animationSystem'
import { createWorldEffect, effectDone, tickEffect } from '../effect'
import {
  isDead, getGroundOffset, tickCooldowns, isAbilityReady,
  startCooldown, canAct, startGlobalCooldown, takeDamage, heal, releaseEffectLane, findEntityById,
} from '../entity'
import type { EnemyEntity, PendingHit, PlayerEntity, WorldEntity, WorldState } from '../types'

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
  const effectivenessMultiplier = getEffectiveness(ability.type, defenderSpecies.type, defenderSpecies.type2)
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

/**
 * Vale a pena usar este golpe de APOIO puro (sem dano, sem status) agora?
 *
 * Cobre os dois lados: buff em si mesmo (Danca das Espadas) e debuff no
 * oponente (Rosnado). Em ambos, so vale se o estagio ainda nao chegou no alvo
 * da IA — repetir um buff no teto e um turno jogado fora, e o jogador ve o POKE
 * "dancando" em vez de atacar.
 */
function golpeDeApoioUtil(entity: WorldEntity, defenderEntity: WorldEntity, ability: Ability): boolean {
  // Cura pura (Recover): so quando ha HP de verdade a recuperar. O limiar existe
  // pra o POKE nao gastar turno curando 5 de HP com a vida quase cheia.
  if (ability.healPercent) {
    return entity.poke.hp / entity.poke.stats.hp <= 1 - ability.healPercent / 100
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

function computeDamage(rng: Rng, attackerEntity: WorldEntity, defenderEntity: WorldEntity, ability: Ability, pessimista = false): DamageResult {
  const attackerPoke = attackerEntity.poke
  const defenderPoke = defenderEntity.poke
  const attackerSpecies = SPECIES[attackerPoke.speciesId]
  const defenderSpecies = SPECIES[defenderPoke.speciesId]
  const effectivenessMultiplier = getEffectiveness(ability.type, defenderSpecies.type, defenderSpecies.type2)
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

    dmg *= effectivenessMultiplier

    // Estagio de critico: Slash/Razor Leaf e outros 16 golpes tem +1 estagio,
    // que na Gen VII e 1/8 em vez de 1/24. A tabela real vai ate +3 (1/2), mas
    // nenhum golpe deste elenco passa de +1 — o `Math.min` existe pra ela nao
    // virar um multiplicador solto se algum dia passar.
    const chanceDeCritico = CRIT_CHANCE * Math.pow(3, Math.min(3, ability.critStages ?? 0))
    isCrit = pessimista ? false : rollChance(rng, Math.min(0.5, chanceDeCritico))
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
function pickAbility(rng: Rng, entity: WorldEntity, defenderEntity: WorldEntity, aoeTargetCounter: (a: Ability) => number): Ability | null {
  const attackerSpecies = SPECIES[entity.poke.speciesId]
  const disabled = entity.poke.disabledAbilities || {}
  // No maximo 4 golpes (+ o AOE de nivel 50 pro POKE do jogador). Selvagem usa
  // os 4 ultimos que a especie aprenderia naquele nivel, sem AOE — ver
  // data/activeAbilities.ts.
  const candidateIds = golpesUtilizaveis(entity.poke, attackerSpecies, entity.kind === 'enemy')
    .filter((id) => !disabled[id])
  const prontos = candidateIds
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
  const statusPronto = prontos.filter((a) => (
    a.power === 0 && (
      (a.status != null && statusVaiPegar(defenderEntity, a.status, a.id))
      || golpeDeApoioUtil(entity, defenderEntity, a)
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
 */
function golpeErrou(rng: Rng, ability: Ability): boolean {
  const precisao = ability.accuracy ?? 100
  if (precisao >= 100) return false
  return nextFloat(rng) * 100 >= precisao
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
  const ability = pickAbility(world.rng, player, primaryTarget, (a) =>
    allEnemies.filter((e) => Math.hypot(e.x - player.x, e.y - player.y) <= (a.radius ?? 0)).length,
  )
  if (!ability) return

  startCooldown(player, ability.id, scaledCooldown(ability, velocidadeEfetiva(player)))
  startGlobalCooldown(player, MIN_ACTION_GAP)
  triggerAttackAnim(player, ability.target === 'aoe', primaryTarget)
  announceAbility(world, player, ability)

  if (golpeErrou(world.rng, ability)) {
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

  const ability = pickAbility(world.rng, enemy, player, () => 1) // inimigos so miram no jogador unico
  if (!ability) return

  startCooldown(enemy, ability.id, scaledCooldown(ability, velocidadeEfetiva(enemy)))
  startGlobalCooldown(enemy, MIN_ACTION_GAP)
  triggerAttackAnim(enemy, ability.target === 'aoe', player)
  announceAbility(world, enemy, ability)

  if (golpeErrou(world.rng, ability)) {
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

  const result = computeDamage(world.rng, attacker, target, ability, world.pessimista)
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

  // Efeito de status DEPOIS do dano, como nos jogos: um golpe que mata nao
  // chega a envenenar. `aplicarEfeitosDoGolpe` tambem descongela o alvo quando
  // o golpe e de FIRE.
  if (!isDead(target)) {
    const aplicado = aplicarEfeitosDoGolpe(world.rng, target, ability)
    if (aplicado && !silent) anunciarStatus(world, target, aplicado.tipo, 'entrou')

    // Mudanca de atributo. O anuncio vai em quem RECEBEU (o proprio usuario num
    // Danca das Espadas, o alvo num Rosnado) — mostrar "+Ataque" flutuando
    // sobre o inimigo quando quem se fortaleceu foi voce leria como o contrario
    // do que aconteceu.
    const mudancas = aplicarMudancasDeStat(world.rng, attacker, target, ability)
    if (mudancas.length && !silent) {
      anunciarEstagios(world, ability.statTarget === 'self' ? attacker : target, mudancas)
    }
  }

  // CURA PURA (Recover, Synthesis, Soft-Boiled — 10 golpes). Cura sempre o
  // ATACANTE, nunca o alvo do hit: todos eles tem `target: 'user'` no catalogo,
  // e o "alvo" so existe aqui porque a fila de hits deste motor sempre tem um.
  if (ability.healPercent) {
    const quanto = Math.max(1, Math.round(attacker.poke.stats.hp * ability.healPercent / 100))
    heal(attacker, quanto)
    if (!silent) spawnDamageNumber(world, attacker, { amount: -quanto, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
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
  if (!isAoe && !silent) {
    world.effects.push(createWorldEffect(world.counters, {
      type: 'abilityEffect',
      x: target.x, y: target.y,
      targetX: target.x, targetY: target.y - target.radius * 0.6,
      color: colorForType(ability.type),
      isAoe: false,
      duration: IMPACT_EFFECT_DURATION,
      elementType: ability.type,
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

  // Status ANTES das acoes: veneno/queimadura podem derrubar o POKE neste
  // frame, e um POKE derrubado nao age. Passa pelo mesmo caminho de morte que
  // o dano de golpe (loot, EXP, desmaio) — dano de veneno que matasse sem
  // creditar o kill seria um buraco silencioso na economia.
  for (const entity of [player, ...enemies]) {
    if (isDead(entity)) continue
    const { dano, expirados } = tickStatus(world.rng, entity, dt)
    if (!silent) {
      for (const tipo of expirados) anunciarStatus(world, entity, tipo, 'saiu')
    }
    if (dano <= 0) continue

    takeDamage(entity, dano)
    if (!silent) spawnDamageNumber(world, entity, { amount: dano, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
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

  if (player.fainted) {
    return { defeatedEnemyIds, playerJustFainted }
  }

  const engagedEnemies = enemies.filter((e) => !isDead(e) && e.state === 'engaged' && e.targetId === player.id)

  if (engagedEnemies.length > 0) {
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
  }

  return { defeatedEnemyIds, playerJustFainted }
}
