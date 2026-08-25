// Onde cada uma das 135 especies de Hoenn CAIRIA se a geracao fosse ligada —
// bioma, sub-bioma, faixa de nivel e peso de spawn.
//
//   node scripts/relatorio-gen3.mjs            (imprime o resumo)
//   node scripts/relatorio-gen3.mjs --json     (grava scripts/usum/distribuicao-gen3.json)
//
// PH-146. Nada aqui toca `src/data/generated/` — e um RELATORIO, e o ponto e
// que ele seja conferivel antes de virar dado.
//
// ---------------------------------------------------------------------------
// POR QUE ESTE ARQUIVO REIMPLEMENTA A REGRA DE ZONA, E POR QUE ISSO E SEGURO
// ---------------------------------------------------------------------------
// A zona minima de uma especie (`src/data/spawnStrength.ts#zonaMinimaDaEspecie`)
// e a faixa em que ela pode aparecer (`src/data/huntSpawnOverrides.ts`) vivem em
// TypeScript que le `SPECIES` — e `SPECIES` e o elenco de 245 do jogo. Importar
// dali significaria que o relatorio so consegue falar de especie que ja esta no
// jogo, que e o oposto do que ele existe pra fazer.
//
// Entao a formula esta copiada abaixo. Copia de regra e divida, e a divida esta
// paga por `src/data/regraDeZonaEspelhada.test.ts`: ele roda ESTA implementacao
// contra as 245 do elenco atual e compara, especie por especie, com a do jogo.
// Divergir reprova. Sem esse teste o relatorio poderia estar descrevendo uma
// distribuicao que o jogo nunca vai produzir — e ninguem descobriria antes de
// ligar a geracao.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const GRAVAR_JSON = process.argv.includes('--json')

const DEX_MIN = 252
const DEX_MAX = 386

// --- Cópias verificadas por src/data/regraDeZonaEspelhada.test.ts -----------
// `src/data/spawnStrength.ts#FAIXAS`
const ZONA_POR_BST = [
  { bstMinimo: 525, zona: 7 },
  { bstMinimo: 475, zona: 5 },
  { bstMinimo: 425, zona: 3 },
  { bstMinimo: 350, zona: 1 },
  { bstMinimo: 0, zona: 0 },
]
// `src/data/spawnStrength.ts#PISO_POR_ESTAGIO`
const PISO_POR_ESTAGIO = [0, 0, 1, 2]
// `src/data/biomas.ts#FAIXAS`
const FAIXAS = [
  { id: 'faixa1', nome: 'I', niveis: [1, 30], zonaMaxima: 2 },
  { id: 'faixa2', nome: 'II', niveis: [31, 60], zonaMaxima: 5 },
  { id: 'faixa3', nome: 'III', niveis: [61, 90], zonaMaxima: 8 },
]

// `src/data/biomas.ts` — qual sub-bioma pertence a qual bioma. Lido do arquivo
// em vez de copiado: e uma tabela, não uma regra, e ler evita que ela envelheça
// aqui sem ninguém notar.
function biomaPorSubBioma() {
  const texto = readFileSync(join(RAIZ, 'src', 'data', 'biomas.ts'), 'utf8')
  const mapa = {}
  let biomaAtual = null
  for (const linha of texto.split(/\r?\n/)) {
    const chave = linha.match(/^\s{2}\{?\s*chave: '([a-z0-9_-]+)'/)
    if (chave) { biomaAtual = chave[1]; continue }
    const sub = linha.match(/chave: '([a-z0-9_-]+)'/)
    if (sub && biomaAtual && sub[1] !== biomaAtual) mapa[sub[1]] = biomaAtual
  }
  return mapa
}

// ---------------------------------------------------------------------------
const catalogo = JSON.parse(readFileSync(join(RAIZ, 'scripts', 'usum', 'catalog-gen3.json'), 'utf8'))
const tiers = JSON.parse(readFileSync(join(RAIZ, 'scripts', 'spawn-tiers-gen3.json'), 'utf8'))
const pokerogue = JSON.parse(readFileSync(join(RAIZ, 'scripts', 'pokerogue', 'biomas.json'), 'utf8'))

const porChave = Object.fromEntries(catalogo.especies.map((e) => [e.chave, e]))
const pesoPorTier = Object.fromEntries(tiers.tiers.map((t) => [t.chave, t.peso]))

const bst = (chave) => Object.values(porChave[chave].base).reduce((a, b) => a + b, 0)

// ---------------------------------------------------------------------------
// DOIS mapas de pré-evolução, porque o jogo tem dois — e eles DIVERGEM
// ---------------------------------------------------------------------------
// `src/data/evolutionStage.ts` monta o mapa inverso com TODOS os destinos
// (corrigido em PH-139). `src/data/huntSpawnOverrides.ts` monta o dele só com
// `evolvesTo`, o primeiro destino.
//
// A consequência é real e vale registrar: o SEGUNDO destino de um ramo não tem
// pré-evolução do ponto de vista das hunts, então ele vira raiz da própria linha
// e ocupa a sub-faixa inteira, em vez de esperar a origem "deixar de ser o
// estágio correto". Hoje isso não produz nada absurdo porque
// `zonaMinimaDaEspecie` — que usa o estágio CERTO — ainda barra a espécie nas
// faixas baixas. Mas são duas respostas diferentes para "quem evolui em quem",
// e a segunda existe por omissão, não por decisão.
//
// O relatório espelha as duas, cada uma onde o jogo usa a sua. Trocar seria
// descrever uma distribuição que o jogo não produz.
const preEvolucaoCompleta = {}   // evolutionStage.ts
const preEvolucaoPrimeira = {}   // huntSpawnOverrides.ts
for (const especie of catalogo.especies) {
  for (const opcao of especie.evolucoes ?? []) preEvolucaoCompleta[opcao.to] = especie.chave
  const primeiro = (especie.evolucoes ?? [])[0]
  if (primeiro) preEvolucaoPrimeira[primeiro.to] = especie.chave
}
const estagio = (chave) => {
  let n = 1
  let atual = chave
  while (preEvolucaoCompleta[atual] && n < 10) { atual = preEvolucaoCompleta[atual]; n += 1 }
  return n
}

function zonaMinima(chave) {
  const porForca = ZONA_POR_BST.find((f) => bst(chave) >= f.bstMinimo)?.zona ?? 0
  const e = Math.min(estagio(chave), PISO_POR_ESTAGIO.length - 1)
  return Math.max(porForca, PISO_POR_ESTAGIO[e])
}

const indiceDeFaixa = (zona) => {
  const i = FAIXAS.findIndex((f) => zona <= f.zonaMaxima)
  return i === -1 ? FAIXAS.length - 1 : i
}
const indiceDeFaixaPorNivel = (nivel) => {
  const i = FAIXAS.findIndex((f) => nivel <= f.niveis[1])
  return i === -1 ? FAIXAS.length - 1 : i
}

// `src/data/huntSpawnOverrides.ts#nivelDeTroca`, incluindo o encadeamento por
// `desde` que PH-145 acrescentou.
function nivelDeTroca(chave, desde) {
  const especie = porChave[chave]
  const opcao = (especie.evolucoes ?? [])[0]
  if (!opcao || !porChave[opcao.to]) return null
  if (opcao.isSpecial) {
    const daOrigem = Math.max(indiceDeFaixaPorNivel(desde), indiceDeFaixa(zonaMinima(chave)))
    const doAlvo = indiceDeFaixa(zonaMinima(opcao.to))
    const indice = Math.max(doAlvo, daOrigem + 1)
    if (indice >= FAIXAS.length) return null
    return FAIXAS[indice].niveis[0]
  }
  return opcao.atLevel
}

/** As sub-faixas de nível em que cada estágio da linha é o estágio correto. */
function trechosDaLinha(raiz) {
  const trechos = []
  let atual = raiz
  let desde = 1
  for (let i = 0; i < 10 && atual; i++) {
    const troca = nivelDeTroca(atual, desde)
    trechos.push({ chave: atual, de: desde, ate: troca == null ? 90 : troca - 1 })
    if (troca == null) break
    desde = troca
    atual = (porChave[atual].evolucoes ?? [])[0]?.to
  }
  return trechos
}

// --- Casa: cruzamento com as pools do PokeRogue -----------------------------
const DESCARTADOS = new Set(['island', 'end'])
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const porNorm = new Map(Object.keys(porChave).map((k) => [norm(k), k]))

const casaDireta = new Map()
for (const [chave, dados] of Object.entries(pokerogue)) {
  if (DESCARTADOS.has(chave)) continue
  for (const nomes of Object.values(dados.pools)) {
    for (const nome of nomes) {
      const nosso = porNorm.get(norm(nome))
      if (!nosso) continue
      if (!casaDireta.has(nosso)) casaDireta.set(nosso, new Set())
      casaDireta.get(nosso).add(chave)
    }
  }
}

// Herança por família, igual `gerar-subbiomas.mjs`: a linha inteira mora nos
// mesmos lugares, senão o estágio do meio (que o PokeRogue nunca spawna) some.
const pai = Object.fromEntries(Object.keys(porChave).map((k) => [k, k]))
const acha = (x) => (pai[x] === x ? x : (pai[x] = acha(pai[x])))
for (const especie of catalogo.especies) {
  for (const opcao of especie.evolucoes ?? []) {
    if (porChave[opcao.to]) pai[acha(especie.chave)] = acha(opcao.to)
  }
}
const porFamilia = new Map()
for (const [sp, casas] of casaDireta) {
  const f = acha(sp)
  if (!porFamilia.has(f)) porFamilia.set(f, new Set())
  for (const c of casas) porFamilia.get(f).add(c)
}

// ---------------------------------------------------------------------------
const BIOMA_DE = biomaPorSubBioma()
const LENDARIOS = new Set(['regirock', 'regice', 'registeel', 'latias', 'latios',
  'kyogre', 'groudon', 'rayquaza', 'jirachi', 'deoxys'])
// Os três iniciais de Hoenn. No jogo os três iniciais de Kanto ficam fora do
// mato (só a tela de escolha); registrado aqui como a decisão que a issue de
// ligar vai ter que tomar, não como algo já decidido.
const INICIAIS_HOENN = new Set(['treecko', 'torchic', 'mudkip'])

const gen3 = catalogo.especies
  .filter((e) => e.dex >= DEX_MIN && e.dex <= DEX_MAX)
  .sort((a, b) => a.dex - b.dex)

const linhas = []
const semCasa = []

for (const especie of gen3) {
  const chave = especie.chave
  const casas = [...(porFamilia.get(acha(chave)) ?? [])].sort()
  // Raiz pelo mapa das HUNTS (só `evolvesTo`), não pelo completo: é assim que
  // `huntSpawnOverrides.ts#raizesDe` anda, e por isso o segundo destino de um
  // ramo é raiz de si mesmo lá.
  const raiz = (() => {
    let a = chave
    for (let i = 0; i < 10 && preEvolucaoPrimeira[a]; i++) a = preEvolucaoPrimeira[a]
    return a
  })()
  const trecho = trechosDaLinha(raiz).find((t) => t.chave === chave)
  const zona = zonaMinima(chave)
  // A faixa só vale se (a) o estágio tem sub-faixa não-vazia dentro dela e (b) a
  // espécie é fraca o bastante para a faixa — as duas condições de
  // `trechosDaLinha` em huntSpawnOverrides.ts.
  const faixas = FAIXAS.filter((f) => {
    if (zona > f.zonaMaxima) return false
    if (!trecho) return false
    return Math.max(f.niveis[0], trecho.de) <= Math.min(f.niveis[1], trecho.ate)
  }).map((f) => f.nome)

  const tier = tiers.especies[chave]
  const linha = {
    dex: especie.dex,
    chave,
    nome: especie.nome,
    tipo: [especie.tipo1, especie.tipo2].filter(Boolean).join('/'),
    bst: bst(chave),
    estagio: estagio(chave),
    zonaMinima: zona,
    faixas,
    nivel: trecho ? [trecho.de, Math.min(90, trecho.ate)] : null,
    tier: tier?.tier ?? null,
    peso: tier ? pesoPorTier[tier.tier] : null,
    origemDoTier: tier?.origem ?? null,
    subBiomas: casas,
    biomas: [...new Set(casas.map((c) => BIOMA_DE[c]).filter(Boolean))].sort(),
    lendario: LENDARIOS.has(chave),
    inicial: INICIAIS_HOENN.has(chave),
  }
  linhas.push(linha)
  if (!casas.length && !LENDARIOS.has(chave)) semCasa.push(chave)
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------
console.log(`DISTRIBUICAO PROPOSTA — ${gen3.length} especies de Hoenn (dex ${DEX_MIN}-${DEX_MAX})\n`)

const porBioma = {}
for (const l of linhas) {
  for (const b of l.biomas.length ? l.biomas : ['(sem casa)']) {
    (porBioma[b] ??= []).push(l.chave)
  }
}
console.log('Por BIOMA (uma especie pode ter casa em mais de um):')
for (const [b, ids] of Object.entries(porBioma).sort((a, b2) => b2[1].length - a[1].length)) {
  console.log(`  ${b.padEnd(20)} ${String(ids.length).padStart(3)}  ${ids.slice(0, 8).join(' ')}${ids.length > 8 ? ' ...' : ''}`)
}

console.log('\nPor FAIXA de nivel:')
for (const f of FAIXAS) {
  const ids = linhas.filter((l) => l.faixas.includes(f.nome))
  console.log(`  Faixa ${f.nome.padEnd(4)} (Lv ${f.niveis[0]}-${f.niveis[1]})  ${String(ids.length).padStart(3)} especies`)
}
const semFaixa = linhas.filter((l) => !l.faixas.length && !l.lendario)
if (semFaixa.length) {
  console.log(`\n  SEM FAIXA NENHUMA (${semFaixa.length}) — nao apareceriam em hunt nenhuma:`)
  console.log(`    ${semFaixa.map((l) => `${l.chave}(zona ${l.zonaMinima})`).join(', ')}`)
}

console.log('\nPor TIER de spawn:')
for (const t of tiers.tiers) {
  const ids = linhas.filter((l) => l.tier === t.chave)
  const medidos = ids.filter((l) => l.origemDoTier === 'emerald').length
  console.log(`  ${t.chave.padEnd(13)} peso ${String(t.peso).padStart(2)}  ${String(ids.length).padStart(3)} especies (${medidos} medidas em Emerald, ${ids.length - medidos} por regra)`)
}

if (semCasa.length) {
  console.log(`\nSEM SUB-BIOMA NENHUM (${semCasa.length}) — precisam de alocacao a mao antes de ligar:`)
  console.log(`  ${semCasa.join(', ')}`)
} else {
  console.log('\nTodas as especies nao-lendarias tem pelo menos um sub-bioma.')
}

const lendarios = linhas.filter((l) => l.lendario)
console.log(`\nLendarios (${lendarios.length}) — hunt BOSS apenas, fora do spawn normal:`)
console.log(`  ${lendarios.map((l) => l.chave).join(', ')}`)
console.log(`\nIniciais de Hoenn (${INICIAIS_HOENN.size}): ${[...INICIAIS_HOENN].join(', ')}`)
console.log('  DECISAO PENDENTE: os tres iniciais de Kanto ficam fora do mato (so a tela')
console.log('  de escolha). Se a regra valer pra Hoenn, estes tres saem do spawn tambem.')

if (GRAVAR_JSON) {
  const saida = join(RAIZ, 'scripts', 'usum', 'distribuicao-gen3.json')
  writeFileSync(saida, `${JSON.stringify({
    _origem: 'Gerado por scripts/relatorio-gen3.mjs (PH-146). Relatorio de PREPARACAO — nenhum arquivo do jogo le isto.',
    _regra: 'Zona e faixa calculadas pela mesma formula do jogo; a copia e verificada por src/data/regraDeZonaEspelhada.test.ts.',
    especies: linhas,
  }, null, 1)}\n`)
  console.log(`\n-> scripts/usum/distribuicao-gen3.json`)
}
