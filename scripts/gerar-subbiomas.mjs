// Cruza as pools do PokeRogue (`scripts/pokerogue/biomas.json`) com o NOSSO
// catalogo e emite `src/data/generated/subBiomas.generated.ts`.
//
//   node scripts/gerar-subbiomas.mjs
//
// POR QUE E GERADO E NAO ESCRITO A MAO: sao 33 sub-biomas com ate 44 especies
// cada. A mao, a lista diverge do roster no primeiro import de sprite nova —
// e a divergencia e silenciosa (a especie some das hunts sem erro nenhum, que
// e exatamente o bug do Dratini registrado no CLAUDE.md).
//
// ------------------------------------------------------------------------
// AS DUAS TRANSFORMACOES QUE ESTE SCRIPT FAZ, E POR QUE
// ------------------------------------------------------------------------
//
// 1. O POOL DE CHEFE ENTRA NO POOL NORMAL.
//    No PokeRogue, forma final quase nunca e encontro selvagem: ela e o chefe
//    da 10a wave do bioma. Importando so o pool selvagem, 97 das nossas 226
//    especies ficavam sem casa nenhuma — Gyarados, Tyranitar, Alakazam,
//    Blastoise. Aqui quem cumpre o papel do slot de chefe e a FAIXA DE NIVEL
//    da hunt (ver data/spawnStrength.ts), entao juntar os dois pools nao
//    solta forma final no inicio do jogo.
//
// 2. QUEM NAO ESTA EM POOL NENHUMA HERDA O LOCAL DA PROPRIA LINHA EVOLUTIVA.
//    O PokeRogue nunca faz spawnar estagio do MEIO: Metapod, Kakuna, Graveler,
//    Kadabra, Haunter, Wartortle, Croconaw, Seadra, Machoke, Nidorina. Sao 33
//    no nosso roster. Sem herdar, sumiriam do jogo.
//
// Fora: os 11 lendarios (exclusivos das hunts BOSS — o PokeRogue da casa pra
// eles, e a informacao fica no JSON pro dia que a gente quiser usar), os 3
// iniciais base (so a tela de escolha) e NON_WILD_SPECIES (cassino/presente).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENTRADA = path.join(RAIZ, 'scripts/pokerogue/biomas.json')
const SAIDA = path.join(RAIZ, 'src/data/generated/subBiomas.generated.ts')

// Biomas do PokeRogue que nao entram: as pools deles sao 100% de geracoes que
// nao temos (Alola em `island`, lendario de Gen 4+ em `end`). Verificado —
// zero especie do nosso roster nos dois.
const DESCARTADOS = new Set(['island', 'end'])

// TERCEIRA copia da lista de lendarios (as outras sao
// `src/data/legendaries.ts#LEGENDARY_SPECIES_IDS` e
// `scripts/sync-planilha.js#LEGENDARY_SHEET_KEYS`). As tres sao comparadas por
// `src/data/lendariosEmDuasListas.test.ts`.
//
// PH-332: sem os 10 de Hoenn aqui, este script ESTOURA — e o erro e ate
// legivel ("2 especie(s) sem sub-bioma nenhum: jirachi, deoxys"), porque o
// PokeRogue nao da bioma pra mitico. O que ele NAO diria, se o dado do
// PokeRogue por acaso cobrisse os 10, e que oito lendarios acabaram de ganhar
// sub-bioma de hunt comum.
const LENDARIOS = new Set([
  'articuno', 'zapdos', 'moltres', 'raikou', 'entei', 'suicune',
  'lugia', 'ho_oh', 'celebi', 'mewtwo', 'mew',
  'regirock', 'regice', 'registeel', 'latias', 'latios',
  'kyogre', 'groudon', 'rayquaza', 'jirachi', 'deoxys',
])
const INICIAIS_BASE = new Set(['charmander', 'squirtle', 'bulbasaur'])
const NAO_SELVAGENS = new Set(['porygon', 'porygon2', 'eevee'])

// ESPECIES QUE MUDARAM DE CASA A MAO, POR SUB-BIOMA.
//
// O `town` do PokeRogue e o bioma de ENTRADA dele: 17 das nossas especies caem
// no tier COMMON de la, todas forma base de primeira rota. No nosso desenho o
// `town` e um sub-bioma de Campo Aberto, que o jogador so alcanca depois de
// passar pela hunt inicial — entao o elenco de "primeira rota" estava do lado
// errado da primeira tela.
//
// As seis abaixo passaram pra hunt inicial
// (huntSpawnOverrides.ts#STARTER_HUNT_SPECIES, onde o criterio de escolha esta
// registrado). Sair daqui e o outro lado dessa mudanca: elas MUDAM de casa, nao
// ficam nas duas.
//
// Nenhuma some do jogo, e isso foi conferido especie por especie antes de
// escrever a lista — as tres linhas de inseto continuam com casa em `forest`
// pela forma final (butterfree, beedrill, beautifly), e as outras tres tem casa
// direta em mountain/plains/metropolis/volcano. O teste "toda especie selvagem
// tem pelo menos uma hunt onde spawna" (hunts.test.ts) e quem garante isso pra
// valer, inclusive pros estagios do meio que herdam a casa da familia.
//
// EFEITO COLATERAL QUE E O PONTO: tirar a raiz tira a linha INTEIRA do `town`,
// porque a casa e espalhada por familia (ver a nota logo abaixo). Pidgeot e
// Nidoking nao tem o que fazer num vilarejo mesmo — o `town` cai de 92 pra
// menos especies, e as que ficam sao as que a hunt inicial nao levou.
//
// `silcoon` e `cascoon` entram na lista mesmo NAO indo pra hunt inicial (sao
// estagio do meio, e a hunt inicial vai ate o Lv3 — Wurmple so evolui no 7).
// Eles estao aqui porque o PokeRogue da casa DIRETA aos dois no `town`, e a
// casa e espalhada por familia: tirar so o Wurmple nao tirava a linha, o
// Silcoon devolvia o `town` pra ela inteira e o Wurmple voltava por heranca.
// Conferido na saida do gerador — a primeira versao desta lista deixou o
// Wurmple no `town` exatamente assim. Os dois continuam com casa em `grass`.
const SAI_DO_SUB_BIOMA = {
  town: new Set([
    'pidgey', 'caterpie', 'weedle', 'zigzagoon', 'poochyena',
    'wurmple', 'silcoon', 'cascoon',
  ]),
}

// Evolucoes que o catalogo nao declara em `evolvesTo` porque nao sao por
// nivel (troca, pedra). Sem elas a linha evolutiva quebra e o herdeiro nao
// acha a familia — foi assim que Sunflora saiu orfa na primeira medicao.
// As 9 primeiras sao as mesmas de data/pokes.ts#SPECIAL_EVOLUTIONS.
const ELOS_EXTRA = {
  kadabra: 'alakazam', machoke: 'machamp', haunter: 'gengar', graveler: 'golem',
  onix: 'steelix', scyther: 'scizor', seadra: 'kingdra', poliwhirl: 'politoed',
  porygon: 'porygon2', sunkern: 'sunflora',
}

// ---------------------------------------------------------------------------
// catalogo
// ---------------------------------------------------------------------------
const fonte = fs.readFileSync(path.join(RAIZ, 'src/data/generated/pokes.generated.ts'), 'utf8')
const MARCA = 'SPECIES_DATA: SpeciesData = '
const SPECIES = JSON.parse(fonte.slice(fonte.indexOf(MARCA) + MARCA.length, fonte.lastIndexOf('}') + 1))

// `MR__MIME` (underscore duplo, ver CLAUDE.md), `farfetch_d`, `ho_oh`,
// `nidoran_f`. Normalizar os dois lados pra so-alfanumerico cobre as 226 sem
// tabela de excecao — conferido contra o roster inteiro.
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const PORNORM = new Map(Object.keys(SPECIES).map((k) => [norm(k), k]))

const dex = (k) => {
  const m = SPECIES[k].description.match(/Nº\s*(\d+)/)
  if (!m) throw new Error(`Especie "${k}" sem numero de Pokedex na descricao`)
  return Number(m[1])
}

const elegivel = (k) => !LENDARIOS.has(k) && !INICIAIS_BASE.has(k) && !NAO_SELVAGENS.has(k)

// familia = componente conexo do grafo de evolucao (union-find)
const evolui = {}
for (const [k, v] of Object.entries(SPECIES)) if (v.evolvesTo) evolui[k] = v.evolvesTo
for (const [k, v] of Object.entries(ELOS_EXTRA)) if (!evolui[k] && SPECIES[v]) evolui[k] = v
const pai = Object.fromEntries(Object.keys(SPECIES).map((k) => [k, k]))
const acha = (x) => (pai[x] === x ? x : (pai[x] = acha(pai[x])))
for (const [a, b] of Object.entries(evolui)) if (SPECIES[b]) pai[acha(a)] = acha(b)

// ---------------------------------------------------------------------------
// cruzamento
// ---------------------------------------------------------------------------
const PR = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'))
const chaves = Object.keys(PR).filter((k) => !DESCARTADOS.has(k)).sort()

const foraDoRoster = new Set()
const casaDireta = new Map() // especie -> Set(sub-bioma)
const soChefe = new Map()    // especie -> Set(sub-bioma) onde ela SO era chefe

for (const chave of chaves) {
  const pools = PR[chave].pools
  const selvagem = new Set()
  const chefe = new Set()
  for (const [tier, nomes] of Object.entries(pools)) {
    for (const nome of nomes) {
      const nosso = PORNORM.get(norm(nome))
      if (!nosso) { foraDoRoster.add(nome); continue }
      if (!elegivel(nosso)) continue
      if (SAI_DO_SUB_BIOMA[chave]?.has(nosso)) continue
      ;(tier.startsWith('BOSS') ? chefe : selvagem).add(nosso)
    }
  }
  for (const sp of new Set([...selvagem, ...chefe])) {
    if (!casaDireta.has(sp)) casaDireta.set(sp, new Set())
    casaDireta.get(sp).add(chave)
    if (!selvagem.has(sp)) {
      if (!soChefe.has(sp)) soChefe.set(sp, new Set())
      soChefe.get(sp).add(chave)
    }
  }
}

const porFamilia = new Map()
for (const [sp, casas] of casaDireta) {
  const f = acha(sp)
  if (!porFamilia.has(f)) porFamilia.set(f, new Set())
  for (const c of casas) porFamilia.get(f).add(c)
}

// A LINHA EVOLUTIVA INTEIRA MORA NOS MESMOS LUGARES.
//
// A versao anterior so dava casa a quem nao tinha nenhuma. Isso deixava buraco
// por FAIXA DE NIVEL, nao por especie: o Templo tem Gastly, Haunter, Natu e
// Cubone, todos estagios que ja evoluiram antes do Lv31 — e Gengar, Xatu e
// Marowak tem casa propria noutro sub-bioma, entao nunca herdavam o Templo. O
// Templo ficava com pool VAZIO nas faixas II e III: uma sala que sorteasse ele
// nao spawnaria nada, sem erro nenhum.
//
// Espalhar a familia inteira e coerente com o resto do desenho (a hunt mostra
// o estagio compativel com o nivel dela, ver huntSpawnOverrides.ts) e fecha o
// buraco na origem em vez de remendar no consumidor.
const casa = new Map()
const herdadas = []
for (const sp of Object.keys(SPECIES)) {
  if (!elegivel(sp)) continue
  const f = porFamilia.get(acha(sp))
  if (!f?.size) continue
  casa.set(sp, new Set(f))
  if (!casaDireta.has(sp)) herdadas.push(sp)
}

const orfas = Object.keys(SPECIES).filter((k) => elegivel(k) && !casa.has(k))
if (orfas.length) {
  throw new Error(
    `${orfas.length} especie(s) sem sub-bioma nenhum: ${orfas.join(', ')}.\n` +
    'Toda especie elegivel precisa de casa, senao ela existe no Bestiario e ' +
    'com sprite mas nunca aparece — falha silenciosa. Adicione um elo em ' +
    'ELOS_EXTRA (se for evolucao por pedra/troca) ou aloque a mao.'
  )
}

// ---------------------------------------------------------------------------
// emissao
// ---------------------------------------------------------------------------
const porSubBioma = {}
for (const chave of chaves) {
  const lista = [...casa.entries()]
    .filter(([, casas]) => casas.has(chave))
    .map(([sp]) => sp)
    .sort((a, b) => dex(a) - dex(b))
  porSubBioma[chave] = lista
}

const vazios = chaves.filter((c) => porSubBioma[c].length === 0)
if (vazios.length) throw new Error(`sub-bioma sem especie: ${vazios.join(', ')}`)

const links = Object.fromEntries(
  chaves.map((c) => [c, PR[c].links.filter((l) => !DESCARTADOS.has(l.bioma))])
)

const lista = (arr) => (arr.length === 0 ? '[]' : `[\n    ${arr.map((s) => `'${s}'`).join(',\n    ')},\n  ]`)

// WeatherType do PokeRogue -> `ClimaTipo` do nosso motor, mais `limpo` pro
// NONE deles (PH-140). SNOW e HAIL sao climas DIFERENTES e nao viram os dois
// 'granizo': desde a Gen 9 neve da +50% de Defesa pra ICE e nao causa dano
// nenhum, enquanto granizo tira 1/16 por turno. Fundir os dois faria
// `snowy-forest` (87,5% de neve) virar 87,5% de dano continuo.
const CLIMA_DO_POKEROGUE = {
  NONE: 'limpo',
  RAIN: 'chuva',
  SUNNY: 'sol',
  SANDSTORM: 'areia',
  HAIL: 'granizo',
  SNOW: 'neve',
  FOG: 'nevoa',
}

function climaDoSubBioma(chave) {
  const cru = PR[chave].clima || {}
  const pesos = []
  for (const [tipoPr, peso] of Object.entries(cru)) {
    const nosso = CLIMA_DO_POKEROGUE[tipoPr]
    // Estourar, e nao ignorar: um WeatherType novo no PokeRogue (ou renomeado)
    // sumiria da tabela em silencio e o sub-bioma perderia clima sem aviso.
    if (!nosso) throw new Error(`WeatherType desconhecido em ${chave}: ${tipoPr}`)
    pesos.push(`${nosso}: ${peso}`)
  }
  return `{ ${pesos.join(', ')} }`
}

const linhas = [
  '// AUTO-GERADO por `node scripts/gerar-subbiomas.mjs` a partir de',
  '// scripts/pokerogue/biomas.json (pools do PokeRogue) cruzado com o nosso',
  '// catalogo. Nao editar a mao — a proxima geracao sobrescreve.',
  '//',
  `// ${chaves.length} sub-biomas, ${casa.size} especies alocadas`,
  `// (${casaDireta.size} com casa direta no PokeRogue, ${herdadas.length} herdadas da linha evolutiva).`,
  '//',
  '// A CHANCE de aparicao NAO vem daqui: peso de spawn continua sendo o',
  '// `spawn_tier` real do Gen1/Gen2 (scripts/derive-spawn-tiers.js) e a chance',
  '// de a sala cair neste sub-bioma vive em data/biomas.ts, escrita a mao.',
  "import type { SubBiomaClima, SubBiomaEspecies, SubBiomaLinks } from './types';",
  '',
  '/** Especies do nosso catalogo que podem aparecer em cada sub-bioma. */',
  'export const SUB_BIOMA_ESPECIES: SubBiomaEspecies = {',
  ...chaves.map((c) => `  '${c}': ${lista(porSubBioma[c])},`),
  '};',
  '',
  '/**',
  ' * Grafo de vizinhanca do PokeRogue: peso `n` = 1/n de chance de o vizinho',
  ' * APARECER como opcao (depois ele sorteia uniforme entre as que apareceram).',
  ' *',
  ' * NAO e usado pelo jogo hoje. Fica guardado porque e a fundacao do modo',
  ' * Expedicao, e o parser que extrai isso ja esta escrito.',
  ' */',
  '/**',
  ' * Pesos de clima de cada sub-bioma (PH-140), do `weatherPool` do PokeRogue.',
  ' * Sorteado UMA vez ao entrar na sala; `limpo` e um resultado como outro',
  ' * qualquer, nao a ausencia de tabela.',
  ' *',
  ' * E o unico dado de PROBABILIDADE de clima que existe: os jogos principais',
  ' * fixam o clima por rota (Rota 119 sempre chove) e nunca sortearam nada.',
  ' */',
  'export const SUB_BIOMA_CLIMA: SubBiomaClima = {',
  ...chaves.map((c) => `  '${c}': ${climaDoSubBioma(c)},`),
  '};',
  '',
  'export const SUB_BIOMA_LINKS: SubBiomaLinks = {',
  ...chaves.map((c) => `  '${c}': [${links[c].map((l) => `{ bioma: '${l.bioma}', peso: ${l.peso} }`).join(', ')}],`),
  '};',
  '',
  '/**',
  ' * Especies que o PokeRogue so poe no slot de CHEFE deste sub-bioma. Aqui',
  ' * entram no pool normal (a faixa de nivel da hunt cumpre esse papel), mas o',
  ' * dado fica registrado — e a informacao que diz "esta especie e o ponto alto',
  ' * deste lugar", util pra chefe de sala no futuro.',
  ' */',
  'export const SUB_BIOMA_CHEFES: SubBiomaEspecies = {',
  ...chaves.map((c) => {
    const arr = [...casaDireta.keys()]
      .filter((sp) => soChefe.get(sp)?.has(c))
      .sort((a, b) => dex(a) - dex(b))
    return `  '${c}': ${lista(arr)},`
  }),
  '};',
  '',
]

fs.writeFileSync(SAIDA, linhas.join('\n'))
console.log(
  `${chaves.length} sub-biomas | ${casa.size} especies (${casaDireta.size} diretas, ${herdadas.length} herdadas) | ` +
  `${foraDoRoster.size} especies do PokeRogue fora do nosso roster -> ${path.relative(process.cwd(), SAIDA)}`
)
