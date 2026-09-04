// O catalogo e o grafo de evolucao, para os scripts de geracao.
//
// UMA IMPLEMENTACAO, pelo mesmo motivo de `animdata.mjs`: a resolucao da linha
// evolutiva NAO e detalhe de parse — ela decide quem herda casa de quem.
//
// `gerar-subbiomas.mjs` espalha a casa de um sub-bioma pela FAMILIA inteira
// (componente conexo do grafo), e `gerar-elenco-por-estagio.mjs` atribui a
// fatia de aparicao a RAIZ da linha. As duas coisas dependem do mesmo grafo, e
// esse grafo nao sai inteiro do catalogo: `evolvesTo` so cobre evolucao por
// NIVEL. As nove ex-evolucoes por troca (Kadabra -> Alakazam) e as duas por
// pedra/felicidade que o catalogo nao declara vivem em `ELOS_EXTRA`.
//
// Duas copias desse grafo divergiriam em silencio no primeiro elo novo, e o
// sintoma nao seria erro: seria uma especie perdendo a casa da familia num
// gerador e mantendo no outro. Foi assim que Sunflora saiu orfa na primeira
// medicao da PH-145.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))

// NAO HA `ELOS_EXTRA` AQUI, E ISSO FOI MEDIDO ANTES DE SER OMITIDO.
//
// `gerar-subbiomas.mjs` mantem uma tabela `ELOS_EXTRA` com dez elos ("evolucoes
// que o catalogo nao declara em `evolvesTo` porque nao sao por nivel"). Essa
// afirmacao deixou de ser verdade em algum ponto: conferido especie por
// especie no catalogo de hoje, os dez ja estao declarados (Kadabra tem
// `evolvesTo: alakazam`, com `evolvesAtLevel: 80`, que e a regra do JOGADOR pra
// ex-evolucao por troca).
//
// Somar os elos aqui nao mudaria nada (o construtor abaixo so acrescentaria elo
// ausente) e criaria um segundo lugar afirmando o que o catalogo ja diz. Pior:
// o unico elo que DIVERGE do catalogo e `poliwhirl -> politoed`, e o catalogo
// diz `poliwhirl -> poliwrath`. Herdar a tabela antiga aqui trocaria a raiz de
// uma linha em relacao ao que o jogo usa.
//
// O guarda abaixo e o que mantem isso honesto: se um dia o catalogo voltar a
// deixar elo de fora, ele quebra em vez de silenciosamente separar uma familia.

/** O catalogo cru, lido de `pokes.generated.ts`. */
export function lerCatalogo() {
  const fonte = fs.readFileSync(path.join(RAIZ, 'src/data/generated/pokes.generated.ts'), 'utf8')
  const MARCA = 'SPECIES_DATA: SpeciesData = '
  const i = fonte.indexOf(MARCA)
  if (i < 0) throw new Error('SPECIES_DATA nao encontrado em pokes.generated.ts')
  return JSON.parse(fonte.slice(i + MARCA.length, fonte.lastIndexOf('}') + 1))
}

/**
 * O grafo de evolucao e as consultas que os geradores fazem sobre ele.
 *
 * `familia` e o componente conexo (union-find), que e o que responde "quem mora
 * junto"; `raiz` e o inicio da cadeia, que e o que responde "de quem e a fatia
 * de aparicao". Sao coisas DIFERENTES numa linha com ramo: Gloom, Vileplume e
 * Bellossom estao na mesma familia, e a raiz das tres e Oddish.
 */
export function grafoDeEvolucao(species) {
  // A ARESTA E `evolvesTo`, E ELA TEM QUE SER A MESMA QUE O JOGO USA.
  //
  // `src/data/pokes.ts` REESCREVE `evolvesTo` na carga, a partir de
  // `evolutionOptions[0]` filtrado pelas especies que existem no elenco. Ler
  // `evolvesTo` cru daria a raiz certa so por coincidencia — e o consumidor
  // desta tabela (`huntSpawnOverrides#raizesDe`) le a versao reescrita.
  //
  // Conferido nas 380 especies do catalogo de hoje: os dois batem em TODAS,
  // nenhum `evolvesTo` aponta pra fora do elenco, e nenhuma especie tem dois
  // pais. O guarda abaixo existe pra o dia em que deixarem de bater.
  const evolui = {}
  for (const [k, v] of Object.entries(species)) {
    const opcoes = (v.evolutionOptions ?? []).filter((o) => species[o.to])
    const primeiro = opcoes.length > 0 ? opcoes[0].to : null
    const cru = v.evolvesTo && species[v.evolvesTo] ? v.evolvesTo : null
    if (primeiro !== cru) {
      throw new Error(
        `${k}: evolvesTo="${cru}" nao bate com evolutionOptions[0]="${primeiro}".\n` +
        'src/data/pokes.ts reescreve evolvesTo a partir de evolutionOptions, entao os ' +
        'dois divergindo significa que a raiz da linha calculada aqui e DIFERENTE da que ' +
        'o jogo usa — a fatia de aparicao iria pra linha errada, sem erro nenhum.',
      )
    }
    if (primeiro) evolui[k] = primeiro
  }

  // union-find pela familia
  const pai = Object.fromEntries(Object.keys(species).map((k) => [k, k]))
  const acha = (x) => (pai[x] === x ? x : (pai[x] = acha(pai[x])))
  for (const [a, b] of Object.entries(evolui)) pai[acha(a)] = acha(b)

  // pre-evolucao: o inverso de `evolui`, para subir ate a raiz
  const anterior = {}
  for (const [a, b] of Object.entries(evolui)) {
    if (anterior[b] != null) {
      throw new Error(
        `${b} tem dois pais no grafo de evolucao (${anterior[b]} e ${a}).\n` +
        'A raiz da linha deixa de ser unica, e a fatia de aparicao passa a depender da ' +
        'ordem de insercao do catalogo. Precisa de decisao explicita, nao de default.',
      )
    }
    anterior[b] = a
  }

  /** O inicio da cadeia evolutiva desta especie. */
  const raiz = (id) => {
    let atual = id
    // Teto de 10 e o mesmo de `huntSpawnOverrides#raizesDe`: a linha mais longa
    // do catalogo tem 3 formas, e o teto existe pra um elo circular novo nao
    // travar o gerador.
    for (let i = 0; i < 10 && anterior[atual]; i++) atual = anterior[atual]
    return atual
  }

  /**
   * Quantos passos esta especie esta da raiz da linha. 0 = forma base.
   *
   * `gerar-subbiomas.mjs` usa isso pra deslocar o tier de uma especie herdada
   * pela diferenca de profundidade evolutiva.
   */
  const profundidade = (id) => {
    let d = 0
    let atual = id
    for (let i = 0; i < 10 && anterior[atual]; i++) { atual = anterior[atual]; d++ }
    return d
  }

  const membros = new Map()
  for (const sp of Object.keys(species)) {
    const f = acha(sp)
    if (!membros.has(f)) membros.set(f, [])
    membros.get(f).push(sp)
  }

  return { evolui, familia: acha, anterior, raiz, profundidade, membros }
}

/**
 * Numero de Pokedex, tirado da descricao. Usado pra ordenar as listas emitidas:
 * ordem de dex e estavel entre rodadas e legivel pra quem confere.
 */
export function numeroDaDex(species, chave) {
  const m = species[chave].description.match(/Nº\s*(\d+)/)
  if (!m) throw new Error(`Especie "${chave}" sem numero de Pokedex na descricao`)
  return Number(m[1])
}

/**
 * Quem NUNCA nasce selvagem, nas tres listas que o projeto ja mantem.
 *
 * Espelha `src/data/legendaries.ts#LEGENDARY_SPECIES_IDS` (lendario: so hunt
 * BOSS), os 3 iniciais base (so a tela de escolha) e
 * `src/data/regions.ts#NON_WILD_SPECIES` (cassino/presente). As copias sao
 * comparadas por `src/data/lendariosEmDuasListas.test.ts` e `hunts.test.ts`.
 */
export const LENDARIOS = new Set([
  'articuno', 'zapdos', 'moltres', 'raikou', 'entei', 'suicune',
  'lugia', 'ho_oh', 'celebi', 'mewtwo', 'mew',
  'regirock', 'regice', 'registeel', 'latias', 'latios',
  'kyogre', 'groudon', 'rayquaza', 'jirachi', 'deoxys',
])
export const INICIAIS_BASE = new Set(['charmander', 'squirtle', 'bulbasaur'])
export const NAO_SELVAGENS = new Set([
  'porygon', 'porygon2',
  'eevee', 'vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon',
])

/** `true` se a especie pode nascer selvagem numa hunt de bioma. */
export function elegivel(chave) {
  return !LENDARIOS.has(chave) && !INICIAIS_BASE.has(chave) && !NAO_SELVAGENS.has(chave)
}
