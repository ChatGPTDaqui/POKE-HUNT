// POKE species. All data (stats, type, catch rate, EXP, growth curve, real
// moveset) comes straight from the spreadsheet sync — see pokes.generated.js
// and `npm run planilha:aplicar`. This file only adds runtime logic: the
// stat-at-level formula, IV rolling, and a deterministic placeholder
// shape/color per species (real spritesheets can replace this later without
// touching any other file — see render/Sprites.js).
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from './generated/formulas.generated'
import { SPECIES_DATA } from './generated/pokes.generated'
import { colorForType } from './typeColors'
import { randInt, rollChance } from '@/core/random'
import { RARITIES, rollRarity, type RarityKey } from './rarity'
import { LEGENDARY_SPECIES_IDS } from './legendaries'
import { multiplicadorDeNatureza, NATURE_LIST, type NatureKey } from './natures'
import { sortearTrait } from './traits'
import type { Rng } from '@/core/rng'
import { typedAoeMoveKey, TYPED_AOE_LEVEL } from './typedAoeMoves'
import { activeAbilitiesPadrao, golpesAprendidosAte } from './activeAbilities'
import type { StatusAtivo } from './statusEffects'
import type { ElementType, GrowthCurve, SpeciesBaseStats, SpeciesDataEntry } from './generated/types'

export type StatKey = keyof SpeciesBaseStats
export type StatBlock = SpeciesBaseStats

export interface Species extends SpeciesDataEntry {
  shape: string
  color: string
  isSpecialEvolution?: boolean
  /**
   * TODOS os destinos de evolucao desta especie (PH-139).
   *
   * `evolvesTo` continua existindo e aponta pro PRIMEIRO — e o que todo o
   * codigo antigo le, e trocar aquele campo por uma lista significaria mexer em
   * cada leitor de uma vez. Aqui a lista e a fonte; la e a conveniencia.
   *
   * Ausente = a especie tem no maximo um destino, e `evolvesTo` basta.
   */
  evolutionOptions?: OpcaoDeEvolucao[]
}

/**
 * Um destino de evolucao, com o gate que ele exige.
 *
 * Gate POR OPCAO, e nao por especie: Slowpoke vira Slowbro no nivel 37 e
 * Slowking so com pedras — sao caminhos com precos diferentes, e um gate por
 * especie nao conseguiria representar isso.
 */
export interface OpcaoDeEvolucao {
  /** Especie de destino. */
  to: string
  /** Nivel minimo. */
  atLevel: number
  /** Cobra pedras (ver `evolutionStoneRequirement`). */
  isSpecial: boolean
  /**
   * De que TIPO e a pedra. Ausente = tipo primario da especie de ORIGEM, que e
   * o comportamento historico. Presente so em especie com ramo, e ai e o tipo
   * primario do DESTINO — Flareon custa FOGO, Jolteon ELETRICO, Umbreon
   * SOMBRIO, e a escolha do Eevee vira uma decisao legivel em vez de cinco
   * botoes com o mesmo preco.
   */
  stoneType?: ElementType
}

export interface PokeInstance {
  uid: string
  speciesId: string
  level: number
  isShiny: boolean
  rarity: RarityKey
  exp: number
  ivs: StatBlock
  stats: StatBlock
  hp: number
  /**
   * NATUREZA (data/natures.ts): +10% num atributo, -10% em outro, sorteada no
   * nascimento. Opcional porque POKE salvo antes de 2026-08-18 nao tem uma —
   * nesses, `computeStatsAtLevel` trata a ausencia como natureza neutra, e a
   * migration de backfill escolheu justamente uma das 5 neutras pra que
   * ninguem acordasse com o time 10% pior.
   */
  nature?: NatureKey
  /**
   * HABILIDADE passiva (data/traits.ts — chamada "Trait" aqui pra nao colidir
   * com o GOLPE, que ja e `Ability` em todo o codigo). Sorteada entre os slots
   * normais da especie, com chance pequena de sair a oculta.
   *
   * Opcional pelo mesmo motivo da natureza: save antigo nao tem, e
   * `traitDoPoke` cai no slot 1 da especie nesses casos.
   */
  trait?: string
  unlockedAbilities: string[]
  // Os no maximo 4 golpes que o POKE leva pra luta (data/activeAbilities.ts).
  // Diferente de `unlockedAbilities`, que e DERIVAVEL de especie+nivel, este e
  // escolha do jogador — e o unico dos dois que precisa ser gravado.
  // Ausente = nunca configurado; o leitor cai no padrao. Array vazio e
  // escolha valida (desligar tudo e cair no Ataque Basico) e NAO e o mesmo que
  // ausente.
  activeAbilities?: string[]
  // Status NAO-VOLATIL (veneno, queimadura, paralisia, sono, congelamento).
  // Mora no POKE, e nao na entidade de combate, porque sobrevive a hunt e e
  // gravado — nos jogos ele so sai por item ou pelo Centro Pokemon. A
  // confusao, que e volatil, mora na entidade (ver engine/types.ts).
  status?: StatusAtivo | null
  // Setados fora deste arquivo, em runtime (nao no momento da criacao) —
  // opcionais aqui pra todo call site existente continuar valido.
  locked?: boolean // BagMenu.js — trava contra venda (EconomySystem.js)
  disabledAbilities?: Record<string, boolean> // AbilityHUD.js — golpe desligado manualmente
  // ProgressionSystem.js#evolvePokeInstance — nivel minimo pos-evolucao, pra
  // applyDeathExpPenalty nunca conseguir de-evoluir o poke.
  minLevel?: number
  // Quando a linha entrou em `pokemon_instances` (o `created_at` do Postgres).
  // So de leitura: nunca e gravado de volta, e nao existe em POKE recem-criado
  // que ainda nao passou pelo banco. Alimenta o "Log de capturas" do Perfil do
  // Treinador — sem ele nao ha nenhuma ordem temporal no save (o array da
  // mochila e ordem de insercao do PostgREST, nao de captura).
  capturedAt?: string
  // Nome do treinador no momento da CAPTURA (coluna `original_trainer`).
  // Imutavel: nao acompanha renomeacao do jogador e nao seria derivavel do
  // dono se algum dia existir troca entre jogadores. Opcional porque POKE
  // recem-criado em memoria pode ainda nao ter passado pelo banco, e save
  // anterior a coluna nao tem valor real (ver a migration para o backfill).
  originalTrainer?: string
}

const MAX_CATCH_RATE = 255

const formulaEngine = createFormulaEngine(FORMULAS)

// A chance de shiny escala com a facilidade de captura da especie: uma
// especie comum (catchRate 255) sai na taxa real do Gen2 (1/8192) vezes o
// multiplicador abaixo; especies mais raras saem proporcionalmente mais
// raras. Esta E a formula original do projeto, inalterada.
//
// O multiplicador virou knob editavel (mesmo mecanismo do "Balanceamento de
// economia": basta colar a linha `SHINY_RATE_MULTIPLIER` na aba "Formulas" e
// rodar o sync) porque ele e o unico numero aqui que e decisao de
// balanceamento, nao formula.
//
// Era 200 (o valor historico do projeto) e caiu pra 100: pedido explicito de
// cortar a chance de shiny pela metade. A FORMULA nao mudou — so o
// multiplicador —, entao a proporcionalidade por `catchRate` continua igual:
// especie facil de capturar segue tendo mais chance de shiny que especie rara,
// a taxa toda so ficou 2x mais dura.
const REAL_GEN2_SHINY_RATE = 1 / 8192
const SHINY_RATE_MULTIPLIER = formulaEngine.evalOrDefault('SHINY_RATE_MULTIPLIER', 100)
const SHINY_CHANCE_AT_MAX_CATCH_RATE = REAL_GEN2_SHINY_RATE * SHINY_RATE_MULTIPLIER
const SHAPES = ['triangle', 'circle', 'square', 'diamond']

// Os 6 grupos de experiencia reais dos jogos. ERRATIC e FLUCTUATING sao
// funcoes POR PARTES (ver scripts/usum/formulas.json) e entraram no lugar de
// SLIGHTLY_FAST/SLIGHTLY_SLOW, que nao correspondiam a grupo nenhum. Nenhuma
// especie do dex 1-251 usa os dois novos — eles existem para o enum descrever
// o conjunto real, em vez de dois nomes inventados.
const GROWTH_FORMULA_BY_CURVE: Record<GrowthCurve, string> = {
  MEDIUM_FAST: 'GROWTH_MEDIUM_FAST',
  MEDIUM_SLOW: 'GROWTH_MEDIUM_SLOW',
  FAST: 'GROWTH_FAST',
  SLOW: 'GROWTH_SLOW',
  ERRATIC: 'GROWTH_ERRATIC',
  FLUCTUATING: 'GROWTH_FLUCTUATING',
}

// Total cumulative EXP required to BE at `level` (Gen2 growth-group curves
// are cumulative-from-level-1 formulas, not per-level deltas). Clamped at 0
// since some curves' raw formulas dip negative at very low levels.
export function totalExpForLevel(level: number, growthCurve: GrowthCurve): number {
  const formulaKey = GROWTH_FORMULA_BY_CURVE[growthCurve] || GROWTH_FORMULA_BY_CURVE.MEDIUM_SLOW
  return Math.max(0, Math.round(formulaEngine.eval(formulaKey, { n: level })))
}

/**
 * Requisito de EXP de um POKE — a curva acima, 30% mais cara.
 *
 * POR QUE UMA FUNCAO SEPARADA, E NAO um multiplicador dentro de
 * `totalExpForLevel`: o TREINADOR usa a mesma maquina de curva
 * (`trainerExpProgress`/`grantTrainerExp` chamam `totalExpForLevel` com
 * MEDIUM_SLOW fixo). Encarecer la dentro deixaria o nivel de treinador 30% mais
 * lento junto — coisa que ninguem pediu e que nao tem nada a ver com evolucao.
 *
 * POR QUE ISSO E "XP DE EVOLUCAO": evolucao neste jogo e 100% por NIVEL
 * (`species.evolvesAtLevel`) — nao existe uma barra de EXP de evolucao separada
 * pra encarecer. Encarecer o requisito de nivel do POKE E encarecer a evolucao,
 * e e o unico lugar onde o pedido pode ser aplicado sem inventar mecanica nova.
 *
 * Knob de planilha como todo ajuste de economia: `POKE_EXP_REQUIREMENT_MULTIPLIER`
 * na aba "Fórmulas" substitui o 1.3 sem tocar em codigo.
 */
const POKE_EXP_REQUIREMENT_MULTIPLIER = formulaEngine.evalOrDefault('POKE_EXP_REQUIREMENT_MULTIPLIER', 1.3)

export function pokeExpForLevel(level: number, growthCurve: GrowthCurve): number {
  return Math.round(totalExpForLevel(level, growthCurve) * POKE_EXP_REQUIREMENT_MULTIPLIER)
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function withVisuals(species: SpeciesDataEntry): Species {
  return {
    ...species,
    shape: SHAPES[hashString(species.id) % SHAPES.length],
    color: colorForType(species.type),
  }
}

export const SPECIES: Record<string, Species> = Object.fromEntries(
  Object.entries(SPECIES_DATA).map(([key, species]) => [key, withVisuals(species)])
)

// Every species gets the level-50 typed AoE move (typedAoeMoves.js) appended
// to its real learnset, keyed to ITS OWN primary type — explicit user
// request, invented content with no spreadsheet equivalent. Piggybacking on
// the existing `species.abilities` {key, levelReq} shape means grantExp/
// evolvePokeInstance/createPokeInstance (data/pokes.js below, systems/
// ProgressionSystem.js) and the moveset preview table
// (ui/panels/PokeStatDetail.js#buildMovesetTable) all pick it up for free,
// with zero special-casing anywhere else.
for (const species of Object.values(SPECIES)) {
  species.abilities = [...species.abilities, { key: typedAoeMoveKey(species.type), levelReq: TYPED_AOE_LEVEL }]
}

// O NIVEL de toda evolucao que na origem depende de pedra, troca ou amizade.
//
// Ate PH-145 este arquivo tambem carregava a LISTA dessas evolucoes, costurada
// a mao: o catalogo so sabia gatilho de nivel, entao as nove cadeias de troca
// eram remendadas aqui em cima do dado sincronizado. A lista saiu — quem monta
// as arestas agora e `scripts/fetch-usum-catalog.js#extrairEvolucoes`, e elas
// chegam prontas em `SpeciesDataEntry.evolutionOptions`.
//
// Isso importa por um motivo pratico: enquanto a lista morava aqui, ela cobria
// so troca. Evolucao por PEDRA e por AMIZADE nunca entrou, e o efeito nao era
// so a especie parada — o elenco e o fecho transitivo das cadeias, entao a
// aresta ausente tambem mantinha Raichu, as cinco Eeveelutions e outras treze
// especies FORA do jogo.
//
// O numero continua aqui porque e decisao de produto, nao dado da fonte: pedra,
// troca e amizade nao existem como mecanica neste jogo, e as tres caem neste
// gate. `scripts/fetch-usum-catalog.js#NIVEL_DE_EVOLUCAO_ESPECIAL` e o gemeo
// dele do lado do gerador.
export const SPECIAL_EVOLUTION_LEVEL = 80
/**
 * PH-136: era 20.
 *
 * ESTE NUMERO TEM UM GEMEO NO SERVIDOR. A decisao de deixar a evolucao
 * acontecer e da RPC `evoluir_poke` (`v_stone_count`); esta constante so
 * ANTECIPA a resposta pra tela poder dizer "faltam N" antes de chamar. Mudar um
 * sem o outro deixa as duas metades discordando — ver o cabecalho da migration
 * `20260824030000_evolucao_especial_40_pedras_public.sql`, e o teste
 * `evolucaoEspecialCliente...` que compara os dois.
 *
 * Custo real: a pedra cai a 5% por abate e e do tipo do INIMIGO abatido, nao do
 * POKE que vai evoluir — 40 pedras sao ~800 abates do tipo certo.
 */
export const SPECIAL_EVOLUTION_STONE_COUNT = 40
// Os destinos de evolucao, vindos do catalogo (PH-145).
//
// Ate aqui viviam neste arquivo duas tabelas escritas a mao: `SPECIAL_EVOLUTIONS`
// (as nove cadeias de troca) e `EVOLUCOES_RAMIFICADAS` (so Tyrogue). As duas
// existiam pelo mesmo motivo — a fonte tinha uma coluna de destino e um gatilho
// de nivel, e nada mais cabia la. Agora cabe: `evolutionOptions` chega do
// gerador com TODAS as arestas e o gate de cada uma.
//
// Opcao apontando pra especie fora do elenco e descartada aqui, em silencio e
// de proposito: um destino que `SPECIES` nao tem viraria um botao que a tela de
// evolucao nao sabe desenhar. O gerador ja filtra pelo mesmo criterio, entao na
// pratica isto nunca corta nada — e a rede de seguranca de quem recortar o
// elenco por outro criterio um dia.
for (const species of Object.values(SPECIES)) {
  const opcoes = (species.evolutionOptions ?? []).filter((o) => SPECIES[o.to])
  if (!opcoes.length) {
    // Sem destino valido a especie nao evolui, e os campos de compatibilidade
    // precisam dizer isso. Deixar `evolvesTo` apontando pra uma especie que o
    // elenco nao tem daria "especie de destino desconhecida" so na hora de
    // evoluir.
    delete species.evolutionOptions
    species.evolvesTo = null
    species.evolvesAtLevel = null
    continue
  }
  species.evolutionOptions = opcoes
  // `evolvesTo`/`evolvesAtLevel` seguem apontando pro PRIMEIRO destino: e o que
  // todo leitor que ainda nao conhece ramo le (Pokedex, estagio de evolucao,
  // save antigo). `isSpecialEvolution` acompanha, senao `evolvesTo` sozinho
  // diria que Growlithe vira Arcanine no nivel 80 e de graca.
  species.evolvesTo = opcoes[0].to
  species.evolvesAtLevel = opcoes[0].atLevel
  species.isSpecialEvolution = opcoes[0].isSpecial
}

/**
 * Os destinos de evolucao de uma especie, sempre como lista.
 *
 * Especie sem ramo devolve o destino unico; sem evolucao nenhuma devolve vazio.
 * Todo leitor novo usa isto — ler `evolvesTo` direto continua funcionando, mas
 * enxerga so o primeiro caminho.
 */
export function opcoesDeEvolucao(species: Species): OpcaoDeEvolucao[] {
  if (species.evolutionOptions?.length) return species.evolutionOptions
  if (species.evolvesTo && species.evolvesAtLevel != null) {
    return [{
      to: species.evolvesTo,
      atLevel: species.evolvesAtLevel,
      isSpecial: species.isSpecialEvolution === true,
    }]
  }
  return []
}

// Real Gen2 stat formulas: floor((2*base+iv)*level/100)+5 (and the HP variant).
// `rarityKey` is an optional multiplier on top of the real formula (see
// data/rarity.js) — omitted/unrecognized keys default to Comum's 1x, so
// every pre-existing call site keeps working unchanged. `isShiny` applies a
// flat 1.5x on top of the real base stat, BEFORE the rarity multiplier (per
// explicit user request) — the two stack multiplicatively (shiny+Mythic ends
// up at 1.5 * 3 = 4.5x, not additive).
export const SHINY_STAT_MULTIPLIER = 1.5

export function computeStatsAtLevel(species: Species, level: number, ivs: StatBlock, rarityKey?: RarityKey, isShiny?: boolean, nature?: NatureKey | null): StatBlock {
  const lvl = Math.max(1, level)
  const rarityMultiplier = (rarityKey && RARITIES[rarityKey] || RARITIES.comum).statMultiplier
  const stats = {} as StatBlock
  for (const key of Object.keys(species.base) as StatKey[]) {
    const formulaKey = key === 'hp' ? 'HP_FORMULA' : 'STAT_FORMULA'
    const base = formulaEngine.eval(formulaKey, { base: species.base[key], level: lvl, iv: ivs[key] })
    // ORDEM DOS TRES MULTIPLICADORES, e por que ela e essa:
    //
    //   formula base -> NATUREZA -> shiny -> raridade
    //
    // A natureza vem primeiro porque e a unica das tres que existe nos jogos
    // reais, e la ela se aplica sobre o resultado da formula de stat — nao
    // sobre um valor ja inflado. Shiny e raridade sao invencao deste jogo e
    // empilham por cima, do jeito que ja empilhavam entre si. `Math.round` uma
    // vez so, no fim: arredondar a cada etapa acumularia erro em favor do
    // jogador (tres arredondamentos pra cima num Mythic shiny de natureza boa).
    //
    // A natureza NUNCA alcanca HP — quem garante isso e `NATURE_STATS`
    // (data/natures.ts), que so lista os outros cinco.
    const comNatureza = base * multiplicadorDeNatureza(nature, key)
    const shinyBase = isShiny ? comNatureza * SHINY_STAT_MULTIPLIER : comNatureza
    stats[key] = Math.max(1, Math.round(shinyBase * rarityMultiplier))
  }
  return stats
}

const IV_MAX = 31
const IV_STAT_COUNT = 6

// Conferido contra Pokemon Ultra Sun/Ultra Moon (Gen VII), 2026-08-18.
//
// A REGRA GERAL JA ESTAVA CERTA e nao mudou: cada um dos 6 IVs de um encontro
// selvagem e um sorteio UNIFORME e INDEPENDENTE em 0..31. Nao ha media, nao ha
// peso por especie, nao ha correlacao entre os seis, e nao ha piso por nivel ou
// por raridade. O sorteio deste jogo (`randInt(rng, 0, 31)` seis vezes) e
// exatamente isso.
//
// O QUE FALTAVA: a Gen VII garante 3 IVs PERFEITOS (31) em sorteio de
// Lendario/Mitico — a mesma regra que vale para Ultra Beasts e Pokemon Totem
// naqueles jogos. Quais dos 6 stats recebem o 31 e sorteado; os outros 3
// continuam uniformes em 0..31 (e podem, por acaso, sair 31 tambem, o que
// resulta em 4+ perfeitos).
//
// O QUE NAO ENTRA, e por que: as outras duas fontes de IV garantido da Gen VII
// nao tem equivalente aqui. Cadeia de SOS (1 IV perfeito a partir de 5 chamados,
// 2 aos 10, 3 aos 20, 4 aos 25) exige que o inimigo chame reforco, mecanica que
// este motor nao tem; e Criacao (Destiny Knot/Everstone) exige criadouro, que o
// jogo nao tem. Nature e EV tambem sao Gen III+ e continuam FORA de proposito —
// nao existem no save nem na formula de stat deste jogo (ver STAT_FORMULA em
// generated/formulas.generated.ts), e liga-los mudaria o valor de todo POKE ja
// capturado.
const IV_PERFEITOS_DE_LENDARIO = 3

const STAT_KEYS: StatKey[] = ['hp', 'atkFis', 'atkEsp', 'def', 'defEsp', 'speed']

function rollIvs(rng: Rng, speciesId?: string): StatBlock {
  const ivs = {
    hp: randInt(rng, 0, IV_MAX),
    atkFis: randInt(rng, 0, IV_MAX),
    atkEsp: randInt(rng, 0, IV_MAX),
    def: randInt(rng, 0, IV_MAX),
    defEsp: randInt(rng, 0, IV_MAX),
    speed: randInt(rng, 0, IV_MAX),
  }
  if (!speciesId || !LEGENDARY_SPECIES_IDS.includes(speciesId)) return ivs

  // Sorteio dos 3 stats que recebem 31, sem repetir. Fisher-Yates parcial sobre
  // uma copia: sortear "3 numeros de 0 a 5" com repeticao daria as vezes so 2
  // stats perfeitos, e a regra da Gen VII e 3 DISTINTOS.
  const restantes = [...STAT_KEYS]
  for (let i = 0; i < IV_PERFEITOS_DE_LENDARIO; i++) {
    const escolhido = restantes.splice(randInt(rng, 0, restantes.length - 1), 1)[0]
    ivs[escolhido] = IV_MAX
  }
  return ivs
}

// PH-202/204/236: IV do protetor (Guardian/Lord) e sorteado num piso mais
// alto que o selvagem normal, nao 0-31 — design explicito, e ataca de quebra
// o problema de IV nunca sair alto. Consome `world.rng` igual a qualquer
// sorteio de combate, entao reconferivel pelo servidor do mesmo jeito.
export const PROTETOR_IV_MIN = 20
export function rollIvsDoProtetor(rng: Rng): StatBlock {
  return {
    hp: randInt(rng, PROTETOR_IV_MIN, IV_MAX),
    atkFis: randInt(rng, PROTETOR_IV_MIN, IV_MAX),
    atkEsp: randInt(rng, PROTETOR_IV_MIN, IV_MAX),
    def: randInt(rng, PROTETOR_IV_MIN, IV_MAX),
    defEsp: randInt(rng, PROTETOR_IV_MIN, IV_MAX),
    speed: randInt(rng, PROTETOR_IV_MIN, IV_MAX),
  }
}

// Overall IV quality as a 0-100% average across all 6 stats — used for the
// shop's IV filter/sort.
export function averageIvPercent(ivs: StatBlock): number {
  const sum = Object.values(ivs).reduce((total, v) => total + v, 0)
  return (sum / (IV_MAX * IV_STAT_COUNT)) * 100
}

// O uid do POKE E a chave primaria dele no Postgres (`pokemon_instances.id`,
// tipo uuid). Antes era um contador de modulo (`poke-1`), que tinha dois
// problemas ao sair do localStorage: reiniciava a cada carga da pagina (dois
// POKEs diferentes podiam receber o mesmo uid em sessoes distintas) e nao
// servia como PK. Gerar uuid aqui faz `poke.uid === pokemon_instances.id`
// sempre, o que torna o diff de save trivial e dispensa tabela de-para.
//
// `crypto.randomUUID` exige contexto seguro (https ou localhost) — os dois
// unicos jeitos de o jogo rodar, ja que o Supabase so atende https.
export function novoPokeUid(): string {
  return crypto.randomUUID()
}

export interface CreatePokeInstanceOptions {
  ivs?: StatBlock
  rarity?: RarityKey
  nature?: NatureKey
  /**
   * PH-202/204/236: fixar tambem shiny/trait/uid, alem de ivs/rarity/nature
   * acima — pra RECRIAR um protetor persistido sem consumir `rng` de novo
   * (os dois nao tinham parametro pra pular o sorteio antes desta leva).
   */
  isShiny?: boolean
  trait?: string
  uid?: string
}

// `rng` e o primeiro parametro (e obrigatorio) de proposito: os tres sorteios
// aqui — IV, raridade e shiny — sao exatamente os que o servidor precisa poder
// reconferir na Fase D. Um default pra `Math.random()` deixaria um caminho
// silencioso de volta pro nao-verificavel.
export function createPokeInstance(rng: Rng, speciesId: string, level = 1, { ivs: fixedIvs, rarity: fixedRarity, nature: fixedNature, isShiny: fixedIsShiny, trait: fixedTrait, uid: fixedUid }: CreatePokeInstanceOptions = {}): PokeInstance {
  const species = SPECIES[speciesId]
  if (!species) throw new Error(`Espécie desconhecida: ${speciesId}`)
  const ivs = fixedIvs || rollIvs(rng, speciesId)
  const rarity = fixedRarity || rollRarity(rng)
  const shinyChance = (species.catchRate / MAX_CATCH_RATE) * SHINY_CHANCE_AT_MAX_CATCH_RATE
  const isShiny = fixedIsShiny ?? rollChance(rng, shinyChance)
  // Os TRES tracos individuais dos jogos, sorteados aqui e so aqui:
  // NATUREZA (uniforme entre as 25, como nos jogos), HABILIDADE (entre os slots
  // normais da especie, com chance pequena de oculta) e CARACTERISTICA — esta
  // ultima nao e sorteada nem gravada: sai dos IVs (data/characteristics.ts).
  const nature = fixedNature ?? NATURE_LIST[randInt(rng, 0, NATURE_LIST.length - 1)].key
  const trait = fixedTrait ?? sortearTrait(rng, speciesId) ?? undefined
  const stats = computeStatsAtLevel(species, level, ivs, rarity, isShiny, nature)
  return {
    uid: fixedUid ?? novoPokeUid(),
    speciesId,
    level,
    isShiny,
    rarity,
    // Baseline EXP for starting AT `level` (not 0) — otherwise a poke created
    // above level 1 needs to earn the full cumulative EXP of a low-level curve
    // before its progress bar (and grantExp's level-up check) show any movement.
    exp: pokeExpForLevel(level, species.growthCurve),
    ivs,
    nature,
    trait,
    stats,
    hp: stats.hp,
    unlockedAbilities: golpesAprendidosAte(species, level),
    // Selvagem ignora este campo (`golpesUtilizaveis` deriva os 4 ultimos
    // direto da especie), entao aqui vale sempre o padrao de POKE do jogador —
    // e o valor que sobrevive se este POKE for capturado ou for o inicial.
    activeAbilities: activeAbilitiesPadrao(species, level),
  }
}
