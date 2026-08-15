// Port de js/systems/ProgressionSystem.js.
//
// Desvio deliberado do original (ver nota geral da Fase 4): grantExp/
// applyDeathExpPenalty/evolvePokeInstance mutavam `pokeInstance` EM LUGAR.
// Como pokeInstance agora vive dentro de gameStateStore.team/bagPokes (um
// array de estado Zustand, sem middleware immer), mutacao em lugar nao
// dispararia re-render nem seria persistida corretamente — cada funcao
// abaixo devolve um POKE NOVO (`{...pokeInstance, ...}`), e o chamador
// escreve de volta via `gameState.updatePokeInstance(uid, () => novoPoke)`.
import { SPECIES, computeStatsAtLevel, totalExpForLevel, pokeExpForLevel, SPECIAL_EVOLUTION_STONE_COUNT, type PokeInstance, type StatBlock } from '@/data/pokes'
import { getAbility, type Ability } from '@/data/abilities'
import { activeAbilitiesPadrao, encaixarNovosGolpes, golpesAprendidosAte, nivelDeAprendizado } from '@/data/activeAbilities'
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
// 0.14 -> 0.10 junto com a troca de EXP_GAIN pela formula ESCALADA da Gen VII.
// Nao e mudanca de balanceamento: e o fator que mantem o XP por abate IGUAL ao
// de antes quando o POKE luta contra alvo do PROPRIO nivel. A formula antiga
// (Gen I-IV) era `baseExp*L/7`; a da Gen VII e `baseExp*L/5 * (...)^2.5`, e o
// termo escalado vale exatamente 1 quando os niveis empatam — logo o ganho
// bruto subiu 7/5 = 1.4x, e 0.14/1.4 = 0.10 desfaz isso.
//
// O que MUDA de verdade e o resto da curva, e isso e a regra da Gen VII, nao
// um knob: farmar muito abaixo do proprio nivel passa a render cada vez menos
// (um POKE Lv90 num mob Lv5 recebe ~1.6% do que receberia contra um Lv90).
const XP_GLOBAL_MULTIPLIER = formulaEngine.evalOrDefault('XP_GLOBAL_MULTIPLIER', 0.1)
// 0.05 = pedido explicito do usuario: morrer custa 5% do EXP necessario pro
// NIVEL ATUAL (o "needed" de expProgressForInstance), nao 5% do EXP
// cumulativo total.
const DEATH_EXP_LOSS_PERCENT = formulaEngine.evalOrDefault('DEATH_EXP_LOSS_PERCENT', 0.05)

/**
 * XP por abate, pela formula escalada da Gen VII.
 *
 * `winnerLevel` (o `Lp` da formula) e o nivel de QUEM VENCEU — o POKE em campo,
 * nao o Treinador. E parametro obrigatorio de proposito: um default aqui
 * (`= enemyPoke.level`, por exemplo) faria a formula parecer funcionar em todo
 * call site novo enquanto silenciosamente devolvia sempre o valor de nivel
 * empatado, que e o MAXIMO da curva — o erro renderia XP a mais e ninguem
 * notaria.
 *
 * O Treinador recebe a MESMA quantia (`simulation.ts` soma o mesmo valor nos
 * dois), como sempre foi: o nivel do Treinador nao entra na conta.
 */
export function expRewardForEnemy(enemyPoke: PokeInstance, winnerLevel: number): number {
  const species = SPECIES[enemyPoke.speciesId]
  const base = formulaEngine.eval('EXP_GAIN', {
    baseExp: species.baseExp,
    level: enemyPoke.level,
    winnerLevel,
  })
  return Math.max(1, Math.round(base * XP_GLOBAL_MULTIPLIER))
}

// BUG REAL CORRIGIDO (relatado como "a barra chega a 100% e o level up nao
// dispara"): esta funcao — que E a barra de EXP — continuou medindo pela curva
// CRUA (`totalExpForLevel`) depois que o requisito de nivel do POKE ganhou o
// multiplicador de +30% (`pokeExpForLevel`, leva anterior). O `grantExp` abaixo
// sobe de nivel em `pokeExpForLevel(level+1)`, entao a barra enchia 30% antes
// do limiar real e ficava parada em 100% ate o POKE juntar o resto. Nao era
// arredondamento nem `>` vs `>=`: eram duas curvas diferentes.
//
// Regra que fecha isso pra sempre: TODO calculo de progresso de POKE passa por
// `pokeExpForLevel`; `totalExpForLevel` cru so serve pro Treinador, que nao tem
// o multiplicador.
export function expProgressForInstance(pokeInstance: PokeInstance, species: Species): { into: number; needed: number } {
  const currentBase = pokeExpForLevel(pokeInstance.level, species.growthCurve)
  const nextTotal = pokeExpForLevel(pokeInstance.level + 1, species.growthCurve)
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
  | { species: Species; newAbilities: Ability[]; updatedPoke: PokeInstance; stoneReq: StoneRequirement | null }

// Calcula a evolucao (stats recalculados da nova especie no mesmo nivel/IVs,
// HP mantido na mesma %) SEM mutar `gameState` — so le (`hasItem`), nunca
// remove item. Devolve `stoneReq` pro chamador decidir QUANDO debitar as
// Stones (server: na hora, ja e a acao confirmada; client otimista: so
// depois que `pedirAcao` confirmar — mutar aqui direto era o bug real da
// PH-12, Stones sumiam de uma evolucao que o servidor recusou).
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
  // `golpesAprendidosAte` e nao `newSpecies.abilities` cru: e a evolucao que
  // traz o bloco de golpes rememoraveis do nivel 1 (ver activeAbilities.ts).
  // Sem isto, evoluir pra Typhlosion entregava Eruption na hora, em qualquer
  // nivel — o caminho mais provavel do relato original.
  for (const key of golpesAprendidosAte(newSpecies, pokeInstance.level)) {
    if (unlockedAbilities.includes(key)) continue
    const ability = getAbility(key)
    if (!ability) continue
    unlockedAbilities.push(key)
    newAbilities.push(ability)
  }

  const updatedPoke: PokeInstance = {
    ...pokeInstance,
    minLevel,
    speciesId: newSpecies.id,
    stats,
    hp,
    unlockedAbilities,
    activeAbilities: encaixarNovosGolpes(
      pokeInstance.activeAbilities ?? activeAbilitiesPadrao(species, pokeInstance.level),
      newAbilities.map((a) => a.id)
    ),
  }
  return { species: newSpecies, newAbilities, updatedPoke, stoneReq }
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

  while (exp >= pokeExpForLevel(level + 1, species.growthCurve)) {
    const previousMaxHp = stats.hp
    level += 1
    leveledUp = true

    stats = computeStatsAtLevel(species, level, pokeInstance.ivs, pokeInstance.rarity, pokeInstance.isShiny)
    const hpGain = stats.hp - previousMaxHp
    hp = Math.min(stats.hp, hp + hpGain)

    // Pelo nivel EXIGIDO de verdade (ver activeAbilities.ts), nao pelo
    // `levelReq` cru: senao um POKE que sobe pro nivel 1... nao existe, mas um
    // que EVOLUI e sobe de nivel receberia o bloco de rememoraveis inteiro.
    for (const [key, exigido] of nivelDeAprendizado(species)) {
      if (exigido !== level || unlockedAbilities.includes(key)) continue
      const ability = getAbility(key)
      if (!ability) continue
      unlockedAbilities.push(key)
      newAbilities.push(ability)
    }
  }

  // Golpe novo so ocupa slot VAZIO — com os 4 cheios, a escolha do jogador
  // manda e a troca e explicita, na tela de Equipes.
  const poke: PokeInstance = {
    ...pokeInstance,
    exp,
    level,
    stats,
    hp,
    unlockedAbilities,
    activeAbilities: encaixarNovosGolpes(
      pokeInstance.activeAbilities ?? activeAbilitiesPadrao(species, pokeInstance.level),
      newAbilities.map((a) => a.id)
    ),
  }
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
  while (level > floor && exp < pokeExpForLevel(level, species.growthCurve)) {
    level -= 1
    leveledDown = true
    stats = computeStatsAtLevel(species, level, pokeInstance.ivs, pokeInstance.rarity, pokeInstance.isShiny)
    hp = Math.min(hp, stats.hp)
  }

  const poke: PokeInstance = { ...pokeInstance, exp, level, stats, hp }
  return { poke, leveledDown, level }
}
