// Deriva o TIER DE SPAWN das 135 especies de Hoenn (dex 252-386) a partir do
// dado real de encontro selvagem da Geracao III, e grava
// `scripts/spawn-tiers-gen3.json`.
//
//   node scripts/derive-spawn-tiers-gen3.mjs
//
// Precisa de rede uma vez (baixa o JSON do pret/pokeemerald); o resultado e
// COMMITADO, entao nenhum build depende de rede.
//
// ---------------------------------------------------------------------------
// POR QUE UM SCRIPT SEPARADO, E NAO UMA FLAG NO ORIGINAL
// ---------------------------------------------------------------------------
// `scripts/derive-spawn-tiers.js` le tres disassemblies de Game Boy em
// ASSEMBLY (`pret/pokecrystal`, `pokegold`, `pokered`) e tem um parser de .asm
// por tipo de encontro. A Gen III e outra maquina: o `pret/pokeemerald` publica
// os encontros em JSON estruturado, com as taxas por slot declaradas no proprio
// arquivo. Enfiar os dois no mesmo script significaria dois parsers sem nada em
// comum atras da mesma flag.
//
// O que os dois COMPARTILHAM — e onde compartilhar importa — e a ESCALA e o
// criterio: os mesmos cinco tiers, os mesmos cortes de chance, a mesma regra de
// fallback por estagio evolutivo. Isso esta duplicado aqui de propósito e com o
// numero copiado a vista; ver `TIERS` abaixo.
//
// ---------------------------------------------------------------------------
// A FONTE, E O QUE ELA COBRE
// ---------------------------------------------------------------------------
// `pret/pokeemerald/src/data/wild_encounters.json` — o dado do jogo, nao uma
// tabela de wiki transcrita. Cada mapa declara ate quatro tabelas (grama, agua,
// quebra-pedra, pesca) e o grupo declara `encounter_rates`: a chance de CADA
// SLOT, em ordem. A chance de uma especie num mapa e a soma dos slots que ela
// ocupa.
//
// Emerald sozinho cobre Hoenn inteira e e a versao mais completa da geracao
// (Ruby/Sapphire tem exclusivos que Emerald reune). Ficam de fora as tres
// tabelas de instalacao (`gBattlePyramid...`, `gBattlePike...`): sao desafios
// pos-jogo com elenco curado, e a chance ali nao tem nada a ver com raridade no
// mundo.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const SAIDA = join(RAIZ, 'scripts', 'spawn-tiers-gen3.json')
const CACHE = join(RAIZ, '.cache', 'pret', 'emerald-wild-encounters.json')
const FONTE = 'https://raw.githubusercontent.com/pret/pokeemerald/master/src/data/wild_encounters.json'

const DEX_MIN = 252
const DEX_MAX = 386

// CÓPIA de `scripts/derive-spawn-tiers.js#TIERS`, e a cópia é o ponto: os dois
// arquivos precisam produzir a MESMA escala, senão uma espécie de Hoenn com 30%
// de chance viria com peso diferente de uma de Johto com 30%. Divergir aqui não
// dá erro — dá um jogo em que uma geração inteira aparece mais (ou menos) que a
// outra sem que nada explique.
const TIERS = [
  { chave: 'muito_comum', peso: 30, minChance: 25 },
  { chave: 'comum', peso: 20, minChance: 15 },
  { chave: 'incomum', peso: 10, minChance: 7.5 },
  { chave: 'raro', peso: 5, minChance: 3 },
  { chave: 'muito_raro', peso: 1, minChance: -Infinity },
]

// Lendários e singulares de Hoenn. Mesma regra do original: hunt BOSS, nunca
// spawn normal — o tier existe só para a tabela não ter buraco.
const LENDARIOS = new Set([
  'regirock', 'regice', 'registeel', 'latias', 'latios',
  'kyogre', 'groudon', 'rayquaza', 'jirachi', 'deoxys',
])

// ---------------------------------------------------------------------------
async function baixarEncontros() {
  if (existsSync(CACHE)) return JSON.parse(readFileSync(CACHE, 'utf8'))
  const r = await fetch(FONTE)
  if (!r.ok) throw new Error(`${FONTE} respondeu ${r.status}`)
  const texto = await r.text()
  mkdirSync(dirname(CACHE), { recursive: true })
  writeFileSync(CACHE, texto)
  return JSON.parse(texto)
}

/** `SPECIES_MR_MIME` -> `mr__mime`, a mesma chave que o catálogo usa. */
function chaveDeEspecie(constante) {
  return constante.replace(/^SPECIES_/, '').toLowerCase()
}

// ---------------------------------------------------------------------------
const dados = await baixarEncontros()
const grupo = dados.wild_encounter_groups.find((g) => g.label === 'gWildMonHeaders')
if (!grupo) throw new Error('pokeemerald mudou de formato: nao achei gWildMonHeaders')

const taxasPorTabela = Object.fromEntries(grupo.fields.map((f) => [f.type, f.encounter_rates]))

// especie -> { total de chance somada, número de mapas, categorias }
const medido = new Map()

for (const mapa of grupo.encounters) {
  for (const [tabela, taxas] of Object.entries(taxasPorTabela)) {
    const bloco = mapa[tabela]
    if (!bloco || !bloco.mons) continue
    // Soma por espécie DENTRO do mapa antes de acumular: Wurmple ocupa quatro
    // slots da Rota 101, e contar cada slot como um encontro separado faria a
    // média por mapa despencar exatamente para quem é mais comum.
    const noMapa = new Map()
    bloco.mons.forEach((mon, i) => {
      const taxa = taxas[i]
      if (taxa == null) return
      const chave = chaveDeEspecie(mon.species)
      noMapa.set(chave, (noMapa.get(chave) ?? 0) + taxa)
    })
    for (const [chave, chance] of noMapa) {
      const atual = medido.get(chave) ?? { soma: 0, mapas: 0, categorias: new Set() }
      atual.soma += chance
      atual.mapas += 1
      atual.categorias.add(tabela.replace('_mons', ''))
      medido.set(chave, atual)
    }
  }
}

// ---------------------------------------------------------------------------
// Fallback por estágio evolutivo, para quem não aparece selvagem em Hoenn
// nenhuma (formas evoluídas por pedra, fósseis, Beldum...).
//
// Mesma regra do script de Gen1/Gen2, e pelo mesmo motivo: profundidade 0 junta
// bases que ainda evoluem (Ralts, Beldum) com encontros únicos que nunca
// evoluem (Relicanth, Absol). Sem separar, um Relicanth spawnaria tão fácil
// quanto um Ralts.
const catalogo = JSON.parse(readFileSync(join(RAIZ, 'scripts', 'usum', 'catalog-gen3.json'), 'utf8'))
const porChave = Object.fromEntries(catalogo.especies.map((e) => [e.chave, e]))
const anterior = {}
for (const especie of catalogo.especies) {
  for (const opcao of especie.evolucoes ?? []) anterior[opcao.to] = especie.chave
}
const profundidade = (chave) => {
  let n = 0
  let atual = chave
  while (anterior[atual] && n < 5) { atual = anterior[atual]; n += 1 }
  return n
}
const podeEvoluir = new Set(catalogo.especies.filter((e) => (e.evolucoes ?? []).length).map((e) => e.chave))

const tierPorChance = (c) => TIERS.find((t) => c >= t.minChance).chave
const tierPorRegra = (chave) => {
  const p = profundidade(chave)
  if (p >= 2) return 'muito_raro'
  if (p === 1) return 'raro'
  return podeEvoluir.has(chave) ? 'incomum' : 'raro'
}

const especies = {}
const contagem = { emerald: 0, regra: 0 }
const naoMedidas = []

for (const especie of catalogo.especies) {
  if (especie.dex < DEX_MIN || especie.dex > DEX_MAX) continue
  const chave = especie.chave
  if (LENDARIOS.has(chave)) {
    especies[chave] = { tier: 'muito_raro', origem: 'regra', nota: 'lendario — so aparece em hunt BOSS' }
    contagem.regra += 1
    continue
  }
  const d = medido.get(chave)
  if (d) {
    const media = Math.round((d.soma / d.mapas) * 10) / 10
    especies[chave] = {
      tier: tierPorChance(media),
      origem: 'emerald',
      chanceMedia: media,
      locais: d.mapas,
      nota: `Gen3: ${media}% medio em ${d.mapas} local(is) (${[...d.categorias].sort().join('/')})`,
    }
    contagem.emerald += 1
  } else {
    const p = profundidade(chave)
    const terminal = p === 0 && !podeEvoluir.has(chave)
    especies[chave] = {
      tier: tierPorRegra(chave),
      origem: 'regra',
      nota: `sem encontro selvagem em Emerald; regra por estagio evolutivo (profundidade ${p}${terminal ? ', nao evolui' : ''})`,
    }
    contagem.regra += 1
    naoMedidas.push(chave)
  }
}

// Guarda: espécie medida que o catálogo não conhece é divergência de CHAVE, e
// chave é identidade (save, arte, tabelas). Nunca silenciar.
const orfas = [...medido.keys()].filter((k) => !porChave[k])
if (orfas.length) {
  throw new Error(
    `${orfas.length} chave(s) medidas em Emerald que o catalogo nao tem: ${orfas.slice(0, 20).join(', ')}` +
    `${orfas.length > 20 ? ' ...' : ''}.\nChave e identidade — conferir a normalizacao, nunca remover da medicao.`
  )
}

writeFileSync(SAIDA, `${JSON.stringify({
  _origem: 'Gerado por scripts/derive-spawn-tiers-gen3.mjs a partir de pret/pokeemerald/src/data/wild_encounters.json. Nao editar a mao.',
  _escala: 'Mesma escala de scripts/spawn-tiers.json (30/20/10/5/1) — sem isso as duas geracoes apareceriam em frequencias incomparaveis.',
  _recorte: `dex ${DEX_MIN}-${DEX_MAX}`,
  tiers: TIERS.map((t) => ({ chave: t.chave, peso: t.peso, minChance: t.minChance === -Infinity ? null : t.minChance })),
  especies,
}, null, 2)}\n`)

const porTier = {}
for (const v of Object.values(especies)) porTier[v.tier] = (porTier[v.tier] || 0) + 1
console.log(`${Object.keys(especies).length} especies (dex ${DEX_MIN}-${DEX_MAX})`)
console.log(`origem: emerald=${contagem.emerald} regra=${contagem.regra}`)
console.log(`tiers:  ${TIERS.map((t) => `${t.chave}=${porTier[t.chave] || 0}`).join(' ')}`)
if (naoMedidas.length) {
  console.log(`\nSem encontro selvagem em Emerald (${naoMedidas.length}), tier por regra:`)
  console.log(`  ${naoMedidas.join(', ')}`)
}
console.log(`\n-> ${SAIDA.replace(RAIZ, '.').replace(/\\/g, '/')}`)
