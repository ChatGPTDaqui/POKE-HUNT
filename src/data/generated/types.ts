// Tipos compartilhados pelos arquivos *.generated.ts escritos por
// `scripts/sync-planilha.js`. Este arquivo NAO e gerado — e escrito a mao
// uma vez e reaproveitado pelas assinaturas `export const X: Tipo = ...` de
// cada .generated.ts. Ver CLAUDE.md "Fonte de dados: a planilha e a verdade".

export interface FormulaEntry {
  expr: string
  vars: string[]
}
export type FormulasData = Record<string, FormulaEntry>

export type TypeChartRow = Record<string, number>
export type TypeChartData = Record<string, TypeChartRow>

export type ItemKind = 'ball' | 'potion' | 'revive' | 'status_heal' | 'rod'

export interface ItemDataEntry {
  id: string
  name: string
  kind: ItemKind
  description: string
  buyPrice: number
  captureRate?: number
  healAmount?: number
  reviveHpPercent?: number
  // Sempre lista, mesmo com um alvo so: o Full Heal cura seis status de uma
  // vez, e um array unico evita um caso especial em quem consome.
  healsStatus?: StatusCondition[]
}

// Os status "de verdade" do jogo: os cinco nao-volateis (persistem depois da
// batalha) mais a confusao, que e volatil mas e a unica volatil que tem item de
// cura (Full Heal). O resto das condicoes volateis (flinch, trap, seed) nao tem
// item e nao aparece aqui.
export type StatusCondition = 'poison' | 'burn' | 'paralysis' | 'sleep' | 'freeze' | 'confusion'

// Regras dos status, geradas de scripts/usum/status.json (Gen VII, conferidas
// na Bulbapedia — a citacao de cada numero fica no JSON, fora do bundle).
//
// Campo ausente = aquele status nao tem aquele efeito. `duracaoEmTurnos: null`
// = nao passa sozinho: so sai por item ou pelo Centro Pokemon, exatamente como
// nos jogos.
export interface StatusRule {
  duracaoEmTurnos: [number, number] | null
  imunidadesPorTipo: ElementType[]
  danoPorTurnoFracaoDoMaximo?: number
  multiplicadorDeDanoFisico?: number
  multiplicadorDeVelocidade?: number
  chanceDePerderOTurno?: number
  chanceDeDescongelarPorTurno?: number
  bloqueiaAcao?: boolean
  descongelaComTipo?: ElementType
  chanceDeSeAtacar?: number
  poderDoAutoDano?: number
}

export interface StatusRules {
  naoVolateis: Record<string, StatusRule>
  volateis: Record<string, StatusRule>
  nomes: Record<string, string>
  golpesDePo: { imunesPorTipo: ElementType[]; golpes: string[] }
  reaplicacao: { turnosDeImunidade: number }
}
export type ItemsData = Record<string, ItemDataEntry>

export interface AbilityRef {
  key: string
  levelReq: number
}

// Os 18 tipos da Gen VI em diante — a base de dados do jogo passou a ser
// Pokemon Ultra Sun (Gen VII), que inclui FAIRY. Ver CLAUDE.md.
export type ElementType =
  | 'NORMAL' | 'FIRE' | 'WATER' | 'ELECTRIC' | 'GRASS' | 'ICE' | 'FIGHTING'
  | 'POISON' | 'GROUND' | 'FLYING' | 'PSYCHIC' | 'BUG' | 'ROCK' | 'GHOST'
  | 'DRAGON' | 'DARK' | 'STEEL' | 'FAIRY'

// Os 6 grupos de experiencia reais. ERRATIC e FLUCTUATING substituem
// SLIGHTLY_FAST/SLIGHTLY_SLOW, que nao correspondiam a grupo nenhum dos jogos
// (eram curvas inventadas herdadas da planilha) — ver scripts/usum/formulas.json.
export type GrowthCurve = 'FAST' | 'MEDIUM_FAST' | 'MEDIUM_SLOW' | 'SLOW' | 'ERRATIC' | 'FLUCTUATING'

export interface SpeciesBaseStats {
  hp: number
  atkFis: number
  atkEsp: number
  def: number
  defEsp: number
  speed: number
}

export interface SpeciesDataEntry {
  id: string
  name: string
  description: string
  type: ElementType
  type2: ElementType | null
  catchRate: number
  baseExp: number
  growthCurve: GrowthCurve
  /**
   * Peso em HECTOGRAMAS, como a PokeAPI entrega (`pokemon.weight`: Machamp =
   * 1300, ou seja 130,0 kg). Cru, sem converter — as formulas dos jogos que
   * dependem de peso sao escritas em kg, e quem usa divide por 10 na hora
   * (combatSystem.ts: Low Kick e Heavy Slam).
   */
  pesoHg: number
  base: SpeciesBaseStats
  abilities: AbilityRef[]
  /**
   * PRIMEIRO destino de evolucao, e o nivel dele. Compatibilidade: e o que
   * `evolutionOptions` ja diz no indice 0, e o que todo leitor que nao conhece
   * ramo continua lendo (Pokedex, estagio de evolucao, save antigo).
   *
   * CUIDADO ao ler isto sozinho: desde PH-145 ele tambem aponta pra evolucao
   * que cobra pedras, e o nivel nao e o preco todo. Quem precisa do gate
   * inteiro le `evolutionOptions` (ou `pokes.ts#opcoesDeEvolucao`).
   */
  evolvesTo: string | null
  evolvesAtLevel: number | null
  /**
   * TODAS as arestas de evolucao da especie, cada uma com seu gate (PH-145).
   *
   * Ausente = a especie nao evolui. Presente com um item so = destino unico —
   * a lista existe mesmo assim porque e ela que carrega `isSpecial`, que os
   * dois campos acima nao conseguem representar.
   */
  evolutionOptions?: OpcaoDeEvolucaoGerada[]
}
export interface OpcaoDeEvolucaoGerada {
  to: string
  atLevel: number
  isSpecial: boolean
  /**
   * De que TIPO e a pedra que esta opcao cobra. So sai em especie com mais de
   * um destino, e ai vale o tipo primario do DESTINO — e o que torna a escolha
   * do Eevee legivel (Flareon custa pedra de FOGO, Vaporeon de AGUA).
   *
   * Ausente = cobra o tipo primario da especie de ORIGEM, que e como a
   * evolucao especial sempre funcionou. Manter esse default e o que impede a
   * pedra de `onix -> steelix` de virar ACO e encarecer quem ja estava
   * juntando ROCHA.
   */
  stoneType?: ElementType
}
export type SpeciesData = Record<string, SpeciesDataEntry>

// 'status' entrou com a base de dados do Ultra Sun: a divisao fisico/especial
// deixou de ser por TIPO (regra da Gen I-III, que a planilha herdava) e passou
// a ser por GOLPE, e a terceira categoria real e Status. Neste jogo golpe de
// status continua inerte (`isDamagingAbility` filtra por poder > 0) — o que
// muda e que agora ele se declara como o que e, em vez de aparecer como
// "fisico com 0 de poder".
export type AbilityCategory = 'physical' | 'special' | 'status'

// Uma mudanca de estagio de atributo. `estagios` vai de -6 a +6, como nos
// jogos; positivo sobe, negativo desce.
export interface StatChange {
  stat: 'atkFis' | 'atkEsp' | 'def' | 'defEsp' | 'speed' | 'accuracy' | 'evasion'
  estagios: number
}

export interface AbilityDataEntry {
  id: string
  name: string
  type: ElementType
  category: AbilityCategory
  power: number
  pp: number
  // Precisao real do golpe (1-100). Sempre presente: e o que separa "sempre
  // acerta" de "campo nao preenchido", e e ela que segura Horn Drill/Fissure,
  // que causam KO instantaneo com 30% de precisao.
  accuracy: number
  // --- Efeitos. Ausente = o golpe nao tem aquele efeito. -------------------
  // Status que o golpe causa e a chance disso (100 para golpe de status puro).
  status?: StatusCondition
  statusChance?: number
  // Mudancas de estagio de atributo e a chance (100 para golpe que so faz isso).
  statChanges?: StatChange[]
  statChance?: number
  // Ausente = o efeito vai no ALVO (Growl baixa o Ataque de quem levou).
  // 'self' = vai em quem usou (Swords Dance sobe o proprio Ataque).
  statTarget?: 'self'
  flinchChance?: number
  // Estagios de critico ACIMA do normal, nao porcentagem (Slash tem 1).
  critStages?: number
  // % do dano causado que volta como cura (positivo) ou recuo (negativo).
  drainPercent?: number
  // % do HP maximo curada por golpe de cura pura (Recover = 50).
  healPercent?: number
  // 'aoe' = o golpe acerta mais de um Pokemon de uma vez nos jogos originais
  // (alvo `all-opponents`/`all-other-pokemon`/`all`). Substituiu uma lista de 6
  // chaves escrita a mao em data/abilities.ts, que ja tinha se desatualizado em
  // silencio na troca de grafia de `selfdestruct` para `self_destruct`.
  target: 'single' | 'aoe'
}
export type AbilitiesData = Record<string, AbilityDataEntry>

export interface MapBackground {
  primary: string
  secondary: string
  image: string | null
}

export interface MapItemDrop {
  itemId: string
  chance: number
}

// O GRUPO DE GATE de uma hunt — o que decide se o jogador ja pode entrar
// nela. Era a regiao ('johto' | 'kanto'), que deixou de existir quando as
// hunts passaram a ser montadas por bioma tematico (ver data/biomas.ts): as
// pools do PokeRogue misturam as duas regioes e recortar por elas esvaziava
// 12 dos 33 sub-biomas.
//
// PH-432: SOBRARAM DOIS. As tres faixas eram grupos de gate — `faixa1` e
// `faixa2` nasciam abertas, `faixa3` e `nightmare` saiam do Campeao Lance — e
// nas hunts de bioma esse eixo morreu: quem responde "este conteudo esta
// liberado?" la e o ESTAGIO (data/progressoDeBioma.ts#estagioLiberado). O que
// `continent` ainda decide de verdade e uma coisa so:
//
//   biomas      nasce aberto — as 120 hunts de estagio, a inicial e o Lance
//   nightmare   o Modo Pesadelo e as 11 hunts BOSS, premio do Campeao Lance
//
// Os tres nomes de faixa continuam no tipo porque SAVE ANTIGO os carrega em
// `players.unlocked_continents`, e a carga os traduz (gameStateStore). Eles
// saem quando nao houver mais save com eles — ver PH-434.
export type Continent = 'biomas' | 'nightmare' | 'faixa1' | 'faixa2' | 'faixa3'

export interface MapDataEntry {
  id: string
  name: string
  description: string
  levelRange: [number, number]
  unlockCost: number | null
  continent: Continent
  bounds: { width: number; height: number }
  playerSpawn: { x: number; y: number }
  bg: MapBackground
  maxEnemies: number
  respawnDelay: number
  spawnPoints: { x: number; y: number }[]
  enemyPool: string[]
  itemDrops: MapItemDrop[]
}
export type MapsData = Record<string, MapDataEntry>

export interface EncounterDataEntry {
  id: string
  speciesId: string
  minLevel: number
  maxLevel: number
  aggroRadius: number
  wanderRadius: number
  weight: number
}
export type EncountersData = Record<string, EncounterDataEntry>

// Escritos por `scripts/gerar-subbiomas.mjs` (tambem fora do pipeline da
// planilha — cruza as pools do PokeRogue com o nosso catalogo).
export type SubBiomaEspecies = Record<string, string[]>
export type SubBiomaLinks = Record<string, { bioma: string; peso: number }[]>

/** Os cinco tiers de encontro selvagem do PokeRogue, do mais comum ao mais raro. */
export type TierSelvagem = 'COMMON' | 'UNCOMMON' | 'RARE' | 'SUPER_RARE' | 'ULTRA_RARE'

/** Os quatro tiers de chefe do PokeRogue — aqui viram o elenco de Guardian/Lord. */
export type TierDeProtetor = 'BOSS' | 'BOSS_RARE' | 'BOSS_SUPER_RARE' | 'BOSS_ULTRA_RARE'

export type SubBiomaTiers = Record<string, Record<TierSelvagem | TierDeProtetor, string[]>>

// Escritos por `scripts/gerar-elenco-por-estagio.mjs` (PH-502). Substituem a
// pilha "faixa de tier do PokeRogue + desempate + colapso + teto de 35%" como
// fonte da chance de aparicao dentro de uma sala.
/**
 * Uma linha da tabela de elenco: `[raiz da linha evolutiva, fatia]`.
 *
 * TUPLA E NAO OBJETO, e a razao e o tamanho: sao 4.266 linhas em 330 tabelas, e
 * este modulo esta no grafo da Edge Function — ele e montado a cada cold start,
 * dentro da janela de flush. Nomes de campo repetidos 4.266 vezes custariam
 * mais que a informacao.
 *
 * A `fatia` e da LINHA, e nao da forma. Qual forma nasce sai da janela de nivel
 * da sala; a proveniencia de cada linha (de que local real, de que vaga) vive em
 * `scripts/elenco-por-estagio.auditoria.json`, fora do bundle.
 */
export type LinhaDeElenco = readonly [linha: string, fatia: number]

/** Sub-bioma -> estagio (1..10) -> tabela que soma 1. */
export type ElencoPorEstagio = Record<string, Record<number, readonly LinhaDeElenco[]>>

/** Sub-bioma -> toda especie que pode nascer nele, familias inteiras. */
export type ElencoDoSubBioma = Record<string, readonly string[]>

/**
 * Pesos de clima de cada sub-bioma (PH-140), vindos do `weatherPool` do
 * PokeRogue. `limpo` e o peso de CEU LIMPO — nao a ausencia de tabela: um
 * sub-bioma com `{ limpo: 1 }` tem tabela e ela diz "nunca chove aqui".
 *
 * As chaves sao `ClimaTipo` (engine/types.ts) mais `limpo`. Nao importa o tipo
 * de la pra nao inverter a dependencia — `data/generated` e folha, e o motor
 * que le o dado, nunca o contrario. O teste `climaPorSubBioma.test.ts` amarra
 * as duas pontas.
 */
export type SubBiomaClima = Record<string, Partial<Record<string, number>>>

// TRAIT = habilidade PASSIVA da especie (o que os jogos chamam de "Ability").
// O nome existe porque "Ability" ja e o GOLPE em todo este codigo — ver o
// cabecalho de src/data/traits.ts, que fixou o vocabulario.
export interface TraitCatalogEntry {
  nome: string
  /**
   * `short_effect` da PokeAPI, em ingles, uma linha. E o CONTRATO da
   * implementacao: o flavor text que o jogo mostra e vago de proposito
   * ("Powers up Fire-type moves in a pinch"), o short_effect nao
   * ("Strengthens Fire moves to inflict 1.5x damage at 1/3 max HP or less").
   * A traducao que o jogador le mora em src/data/traitInfo.ts.
   */
  efeito: string | null
}

export interface SpeciesTraits {
  /** Slots 1 e 2 — as habilidades que um encontro selvagem pode sortear. */
  normais: string[]
  /** Habilidade Oculta. `null` quando a especie nao tem uma. */
  oculta: string | null
}

export interface TraitsData {
  catalogo: Record<string, TraitCatalogEntry>
  porEspecie: Record<string, SpeciesTraits>
}
