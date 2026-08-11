// Port de js/systems/CombatSystem.js. Opera sobre um draft imer do
// WorldState inteiro (mesma forma que o `world` original), mutando direto.
//
// Nota (ver engine/types.ts): `entity.target`/`effect.owner`/
// `pendingHit.attacker`/`pendingHit.target` eram referencia direta no
// original — aqui viram id + lookup via findEntityById, unica mudanca de
// forma permitida no port (risco de referencia obsoleta sob Immer).
import { deriveRng, nextFloat, type Rng } from '@/core/rng'
import { getAbility, BASIC_ATTACK, isDamagingAbility, type Ability } from '@/data/abilities'
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
  startCooldown, canAct, startGlobalCooldown, takeDamage, releaseEffectLane, findEntityById,
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
const MIN_ACTION_GAP = 2 // cooldown global: nenhum atacante age de novo antes disso
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
    const atk = isPhysical ? attackerPoke.stats.atkFis : attackerPoke.stats.atkEsp
    const def = isPhysical ? defenderPoke.stats.def : defenderPoke.stats.defEsp
    const power = special && special.mode === 'dynamicPower' ? special.power : ability.power

    dmg = formulaEngine.eval('DAMAGE_BASE', { level: attackerPoke.level, power, atk, def })

    const isStab = Boolean(ability.type) && (ability.type === attackerSpecies.type || ability.type === attackerSpecies.type2)
    if (isStab) dmg *= STAB_MULTIPLIER

    dmg *= effectivenessMultiplier

    isCrit = pessimista ? false : rollChance(rng, CRIT_CHANCE)
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
  const candidateIds = [...entity.poke.unlockedAbilities, BASIC_ATTACK.id].filter((id) => !disabled[id])
  const ready = candidateIds
    .map((id) => (id === BASIC_ATTACK.id ? basicAttackFor(attackerSpecies) : getAbility(id)))
    .filter((ability): ability is Ability => ability != null && isDamagingAbility(ability) && isAbilityReady(entity, ability.id))

  if (ready.length === 0) return null

  const aoeReady = ready.filter((a) => a.target === 'aoe' && aoeTargetCounter(a) >= 2)
  const pool = aoeReady.length > 0 ? aoeReady : ready
  return pool.reduce((best, a) => (
    estimateDamage(rng, entity, defenderEntity, a) > estimateDamage(rng, entity, defenderEntity, best) ? a : best
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

function executePlayerAction(world: WorldState, player: PlayerEntity, engagedEnemies: EnemyEntity[]): void {
  if (!canAct(player)) return

  const primaryTarget = engagedEnemies[0]
  const allEnemies = nearbyAliveEnemies(world)
  const ability = pickAbility(world.rng, player, primaryTarget, (a) =>
    allEnemies.filter((e) => Math.hypot(e.x - player.x, e.y - player.y) <= (a.radius ?? 0)).length,
  )
  if (!ability) return

  startCooldown(player, ability.id, scaledCooldown(ability, player.poke.stats.speed))
  startGlobalCooldown(player, MIN_ACTION_GAP)
  triggerAttackAnim(player, ability.target === 'aoe', primaryTarget)
  announceAbility(world, player, ability)

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

function executeEnemyAction(world: WorldState, enemy: EnemyEntity, player: PlayerEntity): void {
  if (!canAct(enemy)) return

  const ability = pickAbility(world.rng, enemy, player, () => 1) // inimigos so miram no jogador unico
  if (!ability) return

  startCooldown(enemy, ability.id, scaledCooldown(ability, enemy.poke.stats.speed))
  startGlobalCooldown(enemy, MIN_ACTION_GAP)
  triggerAttackAnim(enemy, ability.target === 'aoe', player)
  announceAbility(world, enemy, ability)

  // Mesma ordem de executePlayerAction acima — dano real antes do recoil de
  // AOE (PH-10).
  queueHit(world, enemy, player, ability)
  if (ability.target === 'aoe') queueAoeVisual(world, enemy, ability)
}

// Aplica o dano/texto/efeito-de-golpe/tratamento-de-derrota de um hit
// enfileirado — chamado quando seu timer chega a 0, ou seja, quando a pose
// Shoot/Charge do atacante ja terminou de tocar.
function resolveHit(world: WorldState, hit: PendingHit, defeatedEnemyIds: string[], onPlayerFainted: () => void): void {
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
    // proprio.
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

    if (SELF_DESTRUCT_ABILITY_KEYS.has(ability.id) && !isDead(attacker)) {
      const recoil = Math.round(attacker.poke.hp * SELF_DESTRUCT_HP_LOSS_PERCENT)
      takeDamage(attacker, recoil)
      spawnDamageNumber(world, attacker, { amount: recoil, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
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
  takeDamage(target, result.amount, resolveAbilityCategory(ability, attacker.poke))
  spawnDamageNumber(world, target, result)

  const isPlayerAttacker = attacker.kind === 'player'
  const isAoe = ability.target === 'aoe'
  if (!isAoe) {
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
export function updateCombat(world: WorldState, dt: number): CombatResult {
  const { player, enemies } = world
  if (!player) return { defeatedEnemyIds: [], playerJustFainted: false }

  tickCooldowns(player, dt)
  for (const enemy of enemies) tickCooldowns(enemy, dt)
  for (const effect of world.effects) tickEffect(effect, dt)
  for (const effect of world.effects) {
    if (effectDone(effect) && effect.ownerId) {
      const owner = findEntityById(player, enemies, effect.ownerId)
      if (owner) releaseEffectLane(owner, effect.id)
    }
  }
  world.effects = world.effects.filter((e) => !effectDone(e))

  const defeatedEnemyIds: string[] = []
  let playerJustFainted = false

  for (const hit of world.pendingHits) hit.timer -= dt
  const landed = world.pendingHits.filter((hit) => hit.timer <= 0)
  world.pendingHits = world.pendingHits.filter((hit) => hit.timer > 0)
  for (const hit of landed) {
    resolveHit(world, hit, defeatedEnemyIds, () => {
      playerJustFainted = true
    })
  }

  if (player.fainted) {
    return { defeatedEnemyIds, playerJustFainted }
  }

  const engagedEnemies = enemies.filter((e) => !isDead(e) && e.state === 'engaged' && e.targetId === player.id)

  if (engagedEnemies.length > 0) {
    executePlayerAction(world, player, engagedEnemies)

    for (const enemy of engagedEnemies) {
      if (isDead(enemy) || player.fainted) continue
      executeEnemyAction(world, enemy, player)
    }
  }

  return { defeatedEnemyIds, playerJustFainted }
}
