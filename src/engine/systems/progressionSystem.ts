// Port de js/systems/ProgressionSystem.js.
//
// Desvio deliberado do original (ver nota geral da Fase 4): grantExp/
// applyDeathExpPenalty/evolvePokeInstance mutavam `pokeInstance` EM LUGAR.
// Como pokeInstance agora vive dentro de gameStateStore.team/bagPokes (um
// array de estado Zustand, sem middleware immer), mutacao em lugar nao
// dispararia re-render nem seria persistida corretamente — cada funcao
// abaixo devolve um POKE NOVO (`{...pokeInstance, ...}`), e o chamador
// escreve de volta via `gameState.updatePokeInstance(uid, () => novoPoke)`.
import { SPECIES, computeStatsAtLevel, totalExpForLevel, SPECIAL_EVOLUTION_STONE_COUNT, type PokeInstance, type StatBlock } from '@/data/pokes'
import { getAbility, type Ability } from '@/data/abilities'
import { stoneItemId } from '@/data/stones'
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from '@/data/generated/formulas.generated'
import type { GameStateStore, TrainerInfo } from '@/stores/gameStateStore'
import type { Species } from '@/data/pokes'

const formulaEngine = createFormulaEngine(FORMULAS)
// 0.14 = pedido explicito do usuario, corte de 50% em cima do 0.28 anterior
// (que por sua vez era 0.4 * 0.7). Efetivo: -86% da taxa original da planilha.
// Este e o unico ponto de multiplicacao de XP do jogo — `expRewardForEnemy`
// alimenta tanto o XP do POKE quanto o do Treinador (main/simulation somam o
// mesmo valor nos dois), entao o corte vale pros dois de uma vez.
const XP_GLOBAL_MULTIPLIER = formulaEngine.evalOrDefault('XP_GLOBAL_MULTIPLIER', 0.14)
// 0.05 = pedido explicito do usuario: morrer custa 5% do EXP necessario pro
// NIVEL ATUAL (o "needed" de expProgressForInstance), nao 5% do EXP
// cumulativo total.
const DEATH_EXP_LOSS_PERCENT = formulaEngine.evalOrDefault('DEATH_EXP_LOSS_PERCENT', 0.05)

export function expRewardForEnemy(enemyPoke: PokeInstance): number {
  const species = SPECIES[enemyPoke.speciesId]
  const base = formulaEngine.eval('EXP_GAIN', { baseExp: species.baseExp, level: enemyPoke.level })
  return Math.max(1, Math.round(base * XP_GLOBAL_MULTIPLIER))
}

export function expProgressForInstance(pokeInstance: PokeInstance, species: Species): { into: number; needed: number } {
  const currentBase = totalExpForLevel(pokeInstance.level, species.growthCurve)
  const nextTotal = totalExpForLevel(pokeInstance.level + 1, species.growthCurve)
  return { into: pokeInstance.exp - currentBase, needed: Math.max(1, nextTotal - currentBase) }
}

export function canEvolve(pokeInstance: PokeInstance, species: Species): boolean {
  return species.evolvesTo != null && species.evolvesAtLevel != null && pokeInstance.level >= species.evolvesAtLevel
}

export interface StoneRequirement {
  itemId: string
  count: number
  type: Species['type']
}

export function evolutionStoneRequirement(species: Species): StoneRequirement | null {
  if (!species.isSpecialEvolution) return null
  return { itemId: stoneItemId(species.type), count: SPECIAL_EVOLUTION_STONE_COUNT, type: species.type }
}

export type EvolveResult =
  | null
  | { blocked: 'stones'; required: StoneRequirement }
  | { species: Species; newAbilities: Ability[]; updatedPoke: PokeInstance }

// Troca o poke pra especie evoluida (stats recalculados da nova especie no
// mesmo nivel/IVs, HP mantido na mesma %). Devolve o novo pokeInstance
// dentro do resultado (`updatedPoke`) pro chamador escrever via
// gameState.updatePokeInstance.
export function evolvePokeInstance(pokeInstance: PokeInstance, gameState: GameStateStore): EvolveResult {
  const species = SPECIES[pokeInstance.speciesId]
  if (!canEvolve(pokeInstance, species)) return null

  const stoneReq = evolutionStoneRequirement(species)
  if (stoneReq && !gameState.hasItem(stoneReq.itemId, stoneReq.count)) {
    return { blocked: 'stones', required: stoneReq }
  }

  const newSpecies = SPECIES[species.evolvesTo as string]
  const hpRatio = pokeInstance.hp / pokeInstance.stats.hp
  // Piso pra applyDeathExpPenalty abaixo — um POKE evoluido nunca pode
  // de-evoluir, mesmo depois de um level-down por penalidade de morte.
  const minLevel = Math.max(pokeInstance.minLevel || 1, species.evolvesAtLevel as number)
  const stats = computeStatsAtLevel(newSpecies, pokeInstance.level, pokeInstance.ivs, pokeInstance.rarity, pokeInstance.isShiny)
  const hp = Math.max(1, Math.round(stats.hp * hpRatio))

  const unlockedAbilities = [...pokeInstance.unlockedAbilities]
  const newAbilities: Ability[] = []
  for (const entry of newSpecies.abilities) {
    if (entry.levelReq > pokeInstance.level || unlockedAbilities.includes(entry.key)) continue
    const ability = getAbility(entry.key)
    if (!ability) continue
    unlockedAbilities.push(entry.key)
    newAbilities.push(ability)
  }

  if (stoneReq) gameState.removeItem(stoneReq.itemId, stoneReq.count)

  const updatedPoke: PokeInstance = { ...pokeInstance, minLevel, speciesId: newSpecies.id, stats, hp, unlockedAbilities }
  return { species: newSpecies, newAbilities, updatedPoke }
}

// Trainer reusa a mesma maquina de curva de EXP cumulativa que um POKE —
// MEDIUM_SLOW e so uma curva de referencia fixa, ja que o Trainer nao tem
// species/growthCurve propria.
const TRAINER_GROWTH_CURVE = 'MEDIUM_SLOW' as const

export function trainerExpProgress(trainer: TrainerInfo): { into: number; needed: number } {
  const currentBase = totalExpForLevel(trainer.level, TRAINER_GROWTH_CURVE)
  const nextTotal = totalExpForLevel(trainer.level + 1, TRAINER_GROWTH_CURVE)
  return { into: trainer.exp - currentBase, needed: Math.max(1, nextTotal - currentBase) }
}

export interface GrantExpResult {
  trainer: TrainerInfo
  leveledUp: boolean
  level: number
}

export function grantTrainerExp(trainer: TrainerInfo, amount: number): GrantExpResult {
  let exp = trainer.exp + amount
  let level = trainer.level
  let leveledUp = false
  while (exp >= totalExpForLevel(level + 1, TRAINER_GROWTH_CURVE)) {
    level += 1
    leveledUp = true
  }
  return { trainer: { ...trainer, exp, level }, leveledUp, level }
}

export interface GrantPokeExpResult {
  poke: PokeInstance
  leveledUp: boolean
  newAbilities: Ability[]
  level: number
  /**
   * Quanto cada atributo subiu no conjunto de level-ups desta chamada
   * (`null` quando nao houve nenhum). Calculado aqui, e nao na tela, porque
   * so aqui existem os dois lados da comparacao: depois que `poke` volta, o
   * estado anterior ja foi substituido.
   *
   * Um kill pode causar MAIS DE UM nivel de uma vez, e o delta e do bloco
   * inteiro — que e o que o jogador quer saber ("subi 3 niveis, ganhei
   * quanto?").
   */
  statGains: StatBlock | null
}

// Aplica EXP a um pokeInstance, tratando (possivelmente varios) level-ups e
// novas habilidades desbloqueadas. `amount` e EXP a somar (nao total).
export function grantExp(pokeInstance: PokeInstance, amount: number): GrantPokeExpResult {
  const species = SPECIES[pokeInstance.speciesId]
  let exp = pokeInstance.exp + amount
  let level = pokeInstance.level
  let stats = pokeInstance.stats
  let hp = pokeInstance.hp
  const unlockedAbilities = [...pokeInstance.unlockedAbilities]
  let leveledUp = false
  const newAbilities: Ability[] = []

  while (exp >= totalExpForLevel(level + 1, species.growthCurve)) {
    const previousMaxHp = stats.hp
    level += 1
    leveledUp = true

    stats = computeStatsAtLevel(species, level, pokeInstance.ivs, pokeInstance.rarity, pokeInstance.isShiny)
    const hpGain = stats.hp - previousMaxHp
    hp = Math.min(stats.hp, hp + hpGain)

    for (const entry of species.abilities) {
      if (entry.levelReq !== level || unlockedAbilities.includes(entry.key)) continue
      const ability = getAbility(entry.key)
      if (!ability) continue
      unlockedAbilities.push(entry.key)
      newAbilities.push(ability)
    }
  }

  const poke: PokeInstance = { ...pokeInstance, exp, level, stats, hp, unlockedAbilities }
  const statGains = leveledUp ? diffStats(pokeInstance.stats, stats) : null
  return { poke, leveledUp, newAbilities, level, statGains }
}

function diffStats(antes: StatBlock, depois: StatBlock): StatBlock {
  const out = {} as StatBlock
  for (const key of Object.keys(depois) as (keyof StatBlock)[]) {
    out[key] = depois[key] - antes[key]
  }
  return out
}

export interface DeathPenaltyResult {
  poke: PokeInstance
  leveledDown: boolean
  level: number
}

// Penalidade de morte: perde DEATH_EXP_LOSS_PERCENT do vao de EXP do nivel
// atual, o que pode cascatear num level-down (espelha o loop ascendente de
// grantExp, so que descendo). Nunca cai abaixo de `pokeInstance.minLevel`
// (setado por evolvePokeInstance no nivel em que evoluiu por ultimo,
// ausente = 1) — um POKE evoluido nunca de-evolui.
export function applyDeathExpPenalty(pokeInstance: PokeInstance): DeathPenaltyResult {
  const species = SPECIES[pokeInstance.speciesId]
  const { needed } = expProgressForInstance(pokeInstance, species)
  let exp = Math.max(0, pokeInstance.exp - Math.round(needed * DEATH_EXP_LOSS_PERCENT))

  const floor = pokeInstance.minLevel || 1
  let level = pokeInstance.level
  let stats = pokeInstance.stats
  let hp = pokeInstance.hp
  let leveledDown = false
  while (level > floor && exp < totalExpForLevel(level, species.growthCurve)) {
    level -= 1
    leveledDown = true
    stats = computeStatsAtLevel(species, level, pokeInstance.ivs, pokeInstance.rarity, pokeInstance.isShiny)
    hp = Math.min(hp, stats.hp)
  }

  const poke: PokeInstance = { ...pokeInstance, exp, level, stats, hp }
  return { poke, leveledDown, level }
}
