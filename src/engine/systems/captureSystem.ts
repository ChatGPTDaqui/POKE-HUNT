// Port de js/systems/CaptureSystem.js.
import type { Rng } from '@/core/rng'
import { SPECIES, computeStatsAtLevel, pokeExpForLevel, novoPokeUid, type PokeInstance } from '@/data/pokes'
import { getItem } from '@/data/items'
import { activeAbilitiesPadrao, golpesAprendidosAte } from '@/data/activeAbilities'
import { rollChance, clamp } from '@/core/random'
import { pokemonSellValue } from './economySystem'
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from '@/data/generated/formulas.generated'
import type { GameStateStore } from '@/stores/gameStateStore'

const CAPTURE_LEVEL = 1 // POKEs capturados sempre entram na mochila resetados pro Nivel 1

const formulaEngine = createFormulaEngine(FORMULAS)
const GLOBAL_CATCH_MULTIPLIER = formulaEngine.eval('GLOBAL_CATCH_MULTIPLIER')

// Sem condicao de status implementada (dormir/paralisar/congelar estao fora de
// escopo desde o inicio do projeto), o bonus da Gen VII e sempre 1. A variavel
// existe na formula porque e parte dela — trocar por 1 embutido esconderia a
// alavanca no dia em que status existir.
const STATUS_BONUS_SEM_STATUS = 1

/**
 * Chance de captura pela cadeia da Gen VII: taxa modificada -> probabilidade de
 * uma sacudida -> tres sacudidas.
 *
 * `hpAtual`/`hpMax` importam de verdade na Gen VII (alvo machucado e mais
 * facil). Neste jogo a bola so e jogada DEPOIS do POKE selvagem cair, entao o
 * termo de HP vale sempre 1 (o maximo) — mas ele fica na formula, e nao
 * simplificado pra 1, porque e o que torna a conta a mesma dos jogos e porque
 * qualquer captura futura com o alvo vivo passa a funcionar sozinha.
 */
export function catchChance(
  catchRate: number,
  ballMultiplier: number,
  hpAtual: number,
  hpMax: number,
): number {
  const a = formulaEngine.eval('CATCH_MODIFIED_RATE', {
    hpMax: Math.max(1, hpMax),
    hpAtual: clamp(hpAtual, 0, Math.max(1, hpMax)),
    catchRate,
    ballMultiplier,
    statusBonus: STATUS_BONUS_SEM_STATUS,
    catchMultiplier: GLOBAL_CATCH_MULTIPLIER,
  })
  const shakeProbability = formulaEngine.eval('CATCH_SHAKE_PROBABILITY', { a })
  const shakes = formulaEngine.eval('CATCH_SHAKES')
  return clamp(formulaEngine.eval('CATCH_CHANCE', { shakeProbability, shakes }), 0, 1)
}

export type CaptureResult =
  | { success: false; reason: 'invalid_ball' | 'no_ball' }
  | { success: false; reason: 'roll_failed'; chance: number; ballItemId: string }
  | { success: true; location: 'bag'; chance: number; poke: PokeInstance; ballItemId: string }
  // Auto-venda ligada e a raridade marcada: o POKE foi capturado e vendido no
  // mesmo instante, e NUNCA entrou na mochila. O ouro ja esta na carteira; quem
  // chama so precisa disso pra reportar (toast, resumo, taxa de ouro/h).
  | { success: true; location: 'vendido'; vendidoPor: number; chance: number; poke: PokeInstance; ballItemId: string }

/**
 * A auto-venda pega ESTA captura?
 *
 * Shiny fica fora sempre, independente da raridade marcada — decisao explicita
 * do usuario, e a unica regra do bot que nao e configuravel. Um shiny escapando
 * por engano e irreversivel.
 */
export function autoVendeEstaCaptura(config: GameStateStore['autoSellConfig'], poke: PokeInstance): boolean {
  if (!config?.ligado) return false
  if (poke.isShiny) return false
  return config.raridades.includes(poke.rarity)
}

export function attemptCapture(rng: Rng, gameState: GameStateStore, defeatedPoke: PokeInstance, ballItemId: string): CaptureResult {
  const ball = getItem(ballItemId)
  if (!ball || ball.kind !== 'ball' || ball.captureRate == null) return { success: false, reason: 'invalid_ball' }
  if (!gameState.removeItem(ballItemId, 1)) return { success: false, reason: 'no_ball' }

  const species = SPECIES[defeatedPoke.speciesId]
  const chance = catchChance(species.catchRate, ball.captureRate, defeatedPoke.hp, defeatedPoke.stats.hp)
  const captured = rollChance(rng, chance)

  if (!captured) return { success: false, reason: 'roll_failed', chance, ballItemId }

  const stats = computeStatsAtLevel(species, CAPTURE_LEVEL, defeatedPoke.ivs, defeatedPoke.rarity, defeatedPoke.isShiny)
  const newPoke: PokeInstance = {
    ...defeatedPoke,
    // Mesma fonte de uid do createPokeInstance — o uid E a PK no Postgres.
    // Substitui um `Date.now()+Math.random()` que, alem de nao ser uuid,
    // podia colidir em duas capturas no mesmo milissegundo.
    uid: novoPokeUid(),
    level: CAPTURE_LEVEL,
    exp: pokeExpForLevel(CAPTURE_LEVEL, species.growthCurve),
    // Registro de captura: gravado AQUI, no instante em que o POKE muda de
    // dono, e nunca reescrito depois. `defeatedPoke` e o POKE selvagem, que
    // nao tem treinador — o spread acima nao traria nada.
    originalTrainer: gameState.trainer.name,
    stats,
    hp: stats.hp,
    unlockedAbilities: golpesAprendidosAte(species, CAPTURE_LEVEL),
    // O POKE selvagem lutava com os 4 ultimos golpes da especie no nivel dele;
    // capturado, ele volta pro Nivel 1 e o conjunto tem que ser remontado —
    // manter o do selvagem deixaria golpes que ele ainda nao "sabe".
    activeAbilities: activeAbilitiesPadrao(species, CAPTURE_LEVEL),
    // O POKE selvagem podia estar envenenado ou dormindo na hora da captura —
    // `...defeatedPoke` traria o status junto. Como ele entra na mochila
    // resetado pro Nivel 1 e com HP cheio, carregar o status seria a unica
    // coisa da luta a sobreviver, e o jogador comecaria devendo um Antidoto.
    status: null,
  }
  // Auto-venda: o POKE nunca chega a entrar na mochila. Isto e o que impede a
  // mochila de virar um deposito de milhares de POKEs nivel 1 — o problema que
  // originou o bot (uma conta real chegou a 5035, e a mochila e o maior dado do
  // jogador). Vender aqui, e nao varrendo a mochila depois, tambem e o unico
  // desenho que nao obriga o flush a carregar a mochila de volta.
  if (autoVendeEstaCaptura(gameState.autoSellConfig, newPoke)) {
    const valor = pokemonSellValue(newPoke.level, species.baseExp, newPoke.rarity)
    gameState.addGold(valor)
    return { success: true, location: 'vendido', vendidoPor: valor, chance, poke: newPoke, ballItemId }
  }

  gameState.addCapturedPoke(newPoke)
  return { success: true, location: 'bag', chance, poke: newPoke, ballItemId }
}
