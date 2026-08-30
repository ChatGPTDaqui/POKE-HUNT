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
 * Quanto a captura do PROTETOR da sala (Guardian e Lord) vale, em fracao da
 * chance normal (PH-205).
 *
 * O protetor e o unico inimigo que aparece UMA VEZ por sala e que precisa cair
 * pra a sala avancar. Captura-lo na chance de um selvagem comum tornaria o
 * premio do ciclo a coisa mais barata da hunt: ele nasce no teto de nivel da
 * faixa e com IV 20-31 (`rollIvsDoProtetor`), atributos que selvagem nenhum tem.
 *
 * 0,5 — MEDIDO, nao chutado. As chances base ja sao baixas
 * (`GLOBAL_CATCH_MULTIPLIER` = 0,0925); o que a metade faz nos casos reais:
 *
 *   catchRate  bola     normal   protetor
 *         255  ultra     20,9%      14,1%
 *         190  poke      12,0%       8,1%
 *          90  great      9,9%       6,7%
 *          45  poke       5,3%       3,6%
 *           3  poke       1,2%       0,8%
 *
 * Um terco (0,35) foi considerado e recusado: leva a especie de catchRate 3 a
 * 0,6%, e o jogador tem UMA tentativa por ciclo de 10 salas — na pratica isso
 * le como "nao da pra capturar", que e justamente o que a issue proibe. A
 * metade e custo claro sem virar parede.
 */
export const MULTIPLICADOR_DE_CAPTURA_DO_PROTETOR = 0.5

/**
 * Piso da chance de captura do protetor.
 *
 * A regra e "captura sempre possivel, so reduzida". Hoje nenhuma combinacao
 * chega perto deste piso (o pior caso medido e 0,8%), entao ele nao esta ativo
 * em lugar nenhum — existe pra que mexer no multiplicador acima, ou na formula
 * da Gen VII, nao transforme reducao em proibicao sem ninguem perceber. E
 * guarda estrutural, nao afinacao de balanceamento.
 */
export const CHANCE_MINIMA_DE_CAPTURA_DO_PROTETOR = 0.005

/**
 * Chance de captura pela cadeia da Gen VII: taxa modificada -> probabilidade de
 * uma sacudida -> tres sacudidas.
 *
 * `hpAtual`/`hpMax` importam de verdade na Gen VII (alvo machucado e mais
 * facil). Neste jogo a bola so e jogada DEPOIS do POKE selvagem cair, entao o
 * termo de HP vale sempre 1 (o maximo) — mas ele fica na formula, e nao
 * simplificado pra 1, porque e o que torna a conta a mesma dos jogos e porque
 * qualquer captura futura com o alvo vivo passa a funcionar sozinha.
 *
 * `ehProtetor` entra no `catchMultiplier` (PH-205), e nao numa multiplicacao do
 * RESULTADO: a cadeia da Gen VII nao e linear — `CATCH_SHAKE_PROBABILITY` tira
 * raiz da taxa e `CATCH_CHANCE` eleva a `CATCH_SHAKES` —, entao meter a reducao
 * no fim daria um numero que nao corresponde a taxa de captura de nada. Na
 * entrada, ela significa exatamente "este POKE e metade tao capturavel".
 */
export function catchChance(
  catchRate: number,
  ballMultiplier: number,
  hpAtual: number,
  hpMax: number,
  ehProtetor = false,
): number {
  const a = formulaEngine.eval('CATCH_MODIFIED_RATE', {
    hpMax: Math.max(1, hpMax),
    hpAtual: clamp(hpAtual, 0, Math.max(1, hpMax)),
    catchRate,
    ballMultiplier,
    statusBonus: STATUS_BONUS_SEM_STATUS,
    catchMultiplier: GLOBAL_CATCH_MULTIPLIER * (ehProtetor ? MULTIPLICADOR_DE_CAPTURA_DO_PROTETOR : 1),
  })
  const shakeProbability = formulaEngine.eval('CATCH_SHAKE_PROBABILITY', { a })
  const shakes = formulaEngine.eval('CATCH_SHAKES')
  const chance = clamp(formulaEngine.eval('CATCH_CHANCE', { shakeProbability, shakes }), 0, 1)
  return ehProtetor ? Math.max(CHANCE_MINIMA_DE_CAPTURA_DO_PROTETOR, chance) : chance
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

export function attemptCapture(
  rng: Rng,
  gameState: GameStateStore,
  defeatedPoke: PokeInstance,
  ballItemId: string,
  // PH-205: o protetor da sala captura com metade da chance. Chega por
  // parametro, e nao lido do POKE, porque `isProtetor` e propriedade da
  // ENTIDADE em campo (`EnemyEntity`) e nao do POKE — o mesmo POKE, capturado,
  // vira um POKE comum na mochila.
  ehProtetor = false,
): CaptureResult {
  const ball = getItem(ballItemId)
  if (!ball || ball.kind !== 'ball' || ball.captureRate == null) return { success: false, reason: 'invalid_ball' }
  if (!gameState.removeItem(ballItemId, 1)) return { success: false, reason: 'no_ball' }

  const species = SPECIES[defeatedPoke.speciesId]
  const chance = catchChance(species.catchRate, ball.captureRate, defeatedPoke.hp, defeatedPoke.stats.hp, ehProtetor)
  const captured = rollChance(rng, chance)

  if (!captured) return { success: false, reason: 'roll_failed', chance, ballItemId }

  // `defeatedPoke.nature` NAO pode faltar aqui (PH-92). O POKE capturado herda
  // a natureza do selvagem pelo spread abaixo, entao omitir o argumento gravava
  // a linha com natureza na ficha e stats que a ignoram — nada nulo, nada de
  // erro, so numeros que nao batem com o que a ficha promete. Pegou 74% dos
  // POKE de producao antes de alguem notar.
  const stats = computeStatsAtLevel(
    species, CAPTURE_LEVEL, defeatedPoke.ivs, defeatedPoke.rarity, defeatedPoke.isShiny, defeatedPoke.nature,
  )
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
