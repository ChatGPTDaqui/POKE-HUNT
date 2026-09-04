// Deriva o encontro selvagem REAL POR LOCAL das tres geracoes do catalogo, com
// TERRENO e NIVEL preservados, e grava `scripts/encontros-por-local.json`.
//
//   node scripts/derivar-encontros-por-local.mjs
//
// POR QUE ELE EXISTE, TENDO `derive-spawn-tiers.js`
// ---------------------------------------------------------------------------
// Aquele script le as MESMAS fontes e joga fora as duas coisas que decidem
// bioma e estagio: ele COLAPSA todos os locais numa media por especie
// (`chanceMedia`) e nao guarda nivel nenhum. O resultado — um tier por especie,
// valido em qualquer lugar do jogo — e o que hoje entra como DESEMPATE dentro
// do tier do PokeRogue.
//
// Este guarda a tupla inteira: (especie, local, terreno, fatia, nivel min/max).
// E dela que sai a resposta pras duas perguntas do redesenho:
//
//   QUEM aparece neste sub-bioma?   o terreno e o arquetipo do local
//   EM QUE ESTAGIO?                 o nivel real em que o jogo o poe
//   COM QUE %?                      a fatia real da vaga naquele local
//
// FONTES (as mesmas do outro script, e o dado do jogo, nao wiki transcrita):
//   pret/pokered      Gen1, Kanto  — data/wild/maps/*.asm, 10 vagas sobre 256
//   pret/pokecrystal  Gen2, Johto+Kanto — grama (7 vagas x 3 periodos), agua
//                     (3 vagas)
//   pret/pokeemerald  Gen3, Hoenn — wild_encounters.json, com as taxas de vaga
//                     declaradas no proprio arquivo
//
// O QUE FICA DE FORA DE PROPOSITO, E O MOTIVO E O MESMO NOS TRES CASOS
// ---------------------------------------------------------------------------
// PESCA E HEADBUTT DO GEN2 (`fish.asm`, `treemons.asm`). Aquelas tabelas nao
// sao indexadas por MAPA: sao indexadas por grupo de vara e por tipo de arvore,
// e o mapa so aponta pro grupo. Sem local, elas nao respondem a pergunta que
// este script existe pra responder — em que sub-bioma a especie mora.
//
// Medido antes de decidir: das 44 especies-assinatura de Johto, 38 ja tem dado
// real aqui sem elas. As 6 que faltam (`qwilfish`, `shuckle`, `magcargo`,
// `tyrogue`, `lanturn`, `pichu`) sao evolucao, cruzamento ou encontro estatico —
// todas cobertas pela heranca da linha evolutiva, que e o mecanismo que o
// gerador de sub-bioma ja usa. A RARIDADE delas continua vindo de
// `derive-spawn-tiers.js`, que le as duas tabelas.
//
// Nao e esquecimento: e que "sem local" e inutil aqui.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CACHE = path.join(RAIZ, '.cache', 'pret')
const SAIDA = path.join(RAIZ, 'scripts', 'encontros-por-local.json')

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// Tabelas de vaga, dos proprios disassemblies.
const GRASS_GSC = [30, 30, 20, 10, 5, 4, 1]
const WATER_GSC = [60, 30, 10]
const SLOTS_RB = [51, 51, 39, 25, 25, 25, 13, 13, 11, 3].map((n) => (n / 256) * 100)

const ARQUIVOS = {
  'crystal-johto-grass.asm': 'https://raw.githubusercontent.com/pret/pokecrystal/master/data/wild/johto_grass.asm',
  'crystal-kanto-grass.asm': 'https://raw.githubusercontent.com/pret/pokecrystal/master/data/wild/kanto_grass.asm',
  'crystal-johto-water.asm': 'https://raw.githubusercontent.com/pret/pokecrystal/master/data/wild/johto_water.asm',
  'crystal-kanto-water.asm': 'https://raw.githubusercontent.com/pret/pokecrystal/master/data/wild/kanto_water.asm',
  'emerald-wild-encounters.json': 'https://raw.githubusercontent.com/pret/pokeemerald/master/src/data/wild_encounters.json',
}

async function baixar(nome, url) {
  const local = path.join(CACHE, nome)
  if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8')
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ao baixar ${url}`)
  const t = await r.text()
  fs.mkdirSync(CACHE, { recursive: true })
  fs.writeFileSync(local, t)
  return t
}

async function baixarPokered() {
  const dir = path.join(CACHE, 'red')
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) {
    return Object.fromEntries(fs.readdirSync(dir).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]))
  }
  fs.mkdirSync(dir, { recursive: true })
  const lista = await (await fetch('https://api.github.com/repos/pret/pokered/contents/data/wild/maps')).json()
  if (!Array.isArray(lista)) throw new Error('listagem de pokered inesperada')
  const textos = {}
  for (const a of lista) {
    const t = await (await fetch(a.download_url)).text()
    fs.writeFileSync(path.join(dir, a.name), t)
    textos[a.name] = t
  }
  return textos
}

// `IF DEF(_GOLD) / ELIF / ELSE / ENDC` — sem resolver, cada mapa sai com o
// dobro das entradas e o parser aceita em silencio.
function preprocessar(texto, defs) {
  const avaliar = (expr) => {
    const m = /DEF\(\s*(\w+)\s*\)/i.exec(expr)
    if (!m) throw new Error(`condicao nao reconhecida: ${expr}`)
    if (!(m[1] in defs)) throw new Error(`simbolo nao reconhecido: ${m[1]}`)
    return defs[m[1]]
  }
  const saida = []
  const pilha = []
  for (const linha of texto.split('\n')) {
    const t = linha.trim()
    let m
    if ((m = /^IF\s+(.+)$/i.exec(t))) { const v = avaliar(m[1]); pilha.push({ ativo: v, jaTomado: v }); continue }
    if ((m = /^ELIF\s+(.+)$/i.exec(t))) {
      const topo = pilha[pilha.length - 1]
      const v = !topo.jaTomado && avaliar(m[1])
      topo.ativo = v; topo.jaTomado = topo.jaTomado || v; continue
    }
    if (/^ELSE$/i.test(t)) { const topo = pilha[pilha.length - 1]; topo.ativo = !topo.jaTomado; topo.jaTomado = true; continue }
    if (/^ENDC$/i.test(t)) { pilha.pop(); continue }
    if (pilha.every((n) => n.ativo)) saida.push(linha)
  }
  if (pilha.length) throw new Error('IF sem ENDC')
  return saida.join('\n')
}

/** `db 5, RATTATA` -> `{ nivel: 5, mon: 'RATTATA' }`, na ordem das vagas. */
const vagasDaLista = (bloco) =>
  [...bloco.matchAll(/^\s*db\s+(\d+)\s*,\s*([A-Z0-9_]+)\s*$/gm)].map((x) => ({ nivel: Number(x[1]), mon: x[2] }))

// Cada registro e uma linha da tabela final.
const registros = []
const push = (geracao, local, terreno, mon, fatia, nivelMin, nivelMax) => {
  registros.push({ geracao, local, terreno, mon, fatia, nivelMin, nivelMax })
}

/** Junta vagas repetidas da mesma especie no mesmo local+terreno. */
function fundir() {
  const chave = (r) => `${r.geracao}|${r.local}|${r.terreno}|${r.mon}`
  const por = new Map()
  for (const r of registros) {
    const k = chave(r)
    const a = por.get(k)
    if (!a) { por.set(k, { ...r }); continue }
    a.fatia += r.fatia
    a.nivelMin = Math.min(a.nivelMin, r.nivelMin)
    a.nivelMax = Math.max(a.nivelMax, r.nivelMax)
  }
  return [...por.values()]
}

// ---------------------------------------------------------------------------
// Gen 2 — grama (3 periodos x 7 vagas) e agua (3 vagas)
// ---------------------------------------------------------------------------
function gen2Grama(src, rotulo) {
  for (const m of src.matchAll(/def_grass_wildmons\s+(\w+)([\s\S]*?)end_grass_wildmons/g)) {
    const vagas = vagasDaLista(m[2])
    if (vagas.length !== 21) throw new Error(`${rotulo} ${m[1]}: ${vagas.length} vagas, esperado 21`)
    // O jogo nao tem ciclo dia/noite: a fatia do local e a media dos 3 periodos.
    for (let p = 0; p < 3; p++) {
      vagas.slice(p * 7, p * 7 + 7).forEach((v, i) => push('gsc', m[1], 'grama', v.mon, GRASS_GSC[i] / 3, v.nivel, v.nivel))
    }
  }
}

function gen2Agua(src, rotulo) {
  for (const m of src.matchAll(/def_water_wildmons\s+(\w+)([\s\S]*?)end_water_wildmons/g)) {
    const vagas = vagasDaLista(m[2])
    if (vagas.length !== 3) throw new Error(`${rotulo} ${m[1]}: ${vagas.length} vagas, esperado 3`)
    vagas.forEach((v, i) => push('gsc', m[1], 'surf', v.mon, WATER_GSC[i], v.nivel, v.nivel))
  }
}

// ---------------------------------------------------------------------------
// Gen 1 — grama e agua, 10 vagas sobre 256
// ---------------------------------------------------------------------------
// Um arquivo por mapa, mas NAO um mapa por arquivo: `SeaRoutes.asm` carrega
// varios rotulos (`Route19WildMons`, `Route20WildMons`, ...). Entao o corte e
// pelo ROTULO, e nao pelo nome do arquivo — cortar por arquivo juntaria rotas
// diferentes num "local" so, e o local e justamente a chave que este script
// existe pra preservar.
//
// `def_grass_wildmons 0` / `def_water_wildmons 0` e tabela AUSENTE (taxa de
// encontro zero), nao tabela vazia: o corpo vem sem nenhuma vaga.
function gen1(textos) {
  for (const [arquivo, texto] of Object.entries(textos)) {
    // `_RED` e a versao de referencia, o mesmo recorte que
    // `derive-spawn-tiers.js` usa. Sem resolver `IF DEF(_RED)/_BLUE` os dois
    // ramos ficam no texto e o mapa sai com 11 vagas em vez de 10.
    const src = preprocessar(texto, { _RED: true, _BLUE: false, _YELLOW: false })
    // Corta por rotulo com `split` e nao com lookahead: `\Z` (fim de texto) nao
    // existe em regex de JS, e `$` com a flag `m` casa fim de LINHA — o
    // lookahead engoliria o ultimo rotulo do arquivo em silencio.
    const pedacos = src.split(/^(\w+)WildMons:\s*$/m)
    for (let i = 1; i < pedacos.length; i += 2) {
      const local = pedacos[i]
      const corpo = pedacos[i + 1] ?? ''
      for (const [tipo, terreno] of [['grass', 'grama'], ['water', 'surf']]) {
        const m = new RegExp(`def_${tipo}_wildmons\\s+(\\d+)[^\\n]*\\n([\\s\\S]*?)end_${tipo}_wildmons`).exec(corpo)
        if (!m) continue
        if (Number(m[1]) === 0) continue
        const vagas = vagasDaLista(m[2])
        if (vagas.length !== 10) {
          throw new Error(`${arquivo}/${local}/${tipo}: ${vagas.length} vagas, esperado 10`)
        }
        vagas.forEach((v, k) => push('rb', local, terreno, v.mon, SLOTS_RB[k], v.nivel, v.nivel))
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Gen 3 — Emerald, JSON estruturado
// ---------------------------------------------------------------------------
const TERRENO_GEN3 = {
  land_mons: 'grama', water_mons: 'surf', rock_smash_mons: 'pedra', fishing_mons: 'pesca',
}

function gen3(json) {
  const grupo = json.wild_encounter_groups.find((g) => g.label === 'gWildMonHeaders')
  if (!grupo) throw new Error('gWildMonHeaders nao encontrado')
  const taxas = Object.fromEntries(grupo.fields.map((f) => [f.type, f.encounter_rates]))
  for (const mapa of grupo.encounters) {
    for (const [campo, terreno] of Object.entries(TERRENO_GEN3)) {
      const tabela = mapa[campo]
      if (!tabela?.mons) continue
      const rates = taxas[campo]
      if (!rates) throw new Error(`sem encounter_rates para ${campo}`)
      if (tabela.mons.length !== rates.length) {
        throw new Error(`${mapa.map}/${campo}: ${tabela.mons.length} vagas x ${rates.length} taxas`)
      }
      const soma = rates.reduce((a, b) => a + b, 0)
      tabela.mons.forEach((mon, i) => push(
        'emerald', mapa.map, terreno,
        mon.species.replace(/^SPECIES_/, ''),
        (rates[i] / soma) * 100, mon.min_level, mon.max_level,
      ))
    }
  }
}

// ---------------------------------------------------------------------------
const textos = {}
for (const [nome, url] of Object.entries(ARQUIVOS)) textos[nome] = await baixar(nome, url)
const red = await baixarPokered()

// Crystal e a versao de referencia do Gen2 (reune Gold e Silver).
const defs = { _CRYSTAL: true, _GOLD: false, _SILVER: false }
gen2Grama(preprocessar(textos['crystal-johto-grass.asm'], defs), 'johto-grass')
gen2Grama(preprocessar(textos['crystal-kanto-grass.asm'], defs), 'kanto-grass')
gen2Agua(preprocessar(textos['crystal-johto-water.asm'], defs), 'johto-water')
gen2Agua(preprocessar(textos['crystal-kanto-water.asm'], defs), 'kanto-water')
gen1(red)
gen3(JSON.parse(textos['emerald-wild-encounters.json']))

const linhas = fundir()

// Casa o nome da constante do disassembly com a chave do nosso catalogo.
const fonte = fs.readFileSync(path.join(RAIZ, 'src/data/generated/pokes.generated.ts'), 'utf8')
const MARCA = 'SPECIES_DATA: SpeciesData = '
const SPECIES = JSON.parse(fonte.slice(fonte.indexOf(MARCA) + MARCA.length, fonte.lastIndexOf('}') + 1))
const PORNORM = new Map(Object.keys(SPECIES).map((k) => [norm(k), k]))

const foraDoRoster = new Set()
const finais = []
for (const l of linhas) {
  const nosso = PORNORM.get(norm(l.mon))
  if (!nosso) { foraDoRoster.add(l.mon); continue }
  finais.push({ especie: nosso, geracao: l.geracao, local: l.local, terreno: l.terreno, fatia: l.fatia, nivelMin: l.nivelMin, nivelMax: l.nivelMax })
}

fs.writeFileSync(SAIDA, JSON.stringify({
  _origem: 'Gerado por scripts/derivar-encontros-por-local.mjs a partir de pret/pokered, pret/pokecrystal e pret/pokeemerald. Nao editar a mao.',
  _colunas: 'especie, geracao (rb|gsc|emerald), local (nome do mapa na fonte), terreno (grama|surf|pesca|pedra), fatia (% daquela vaga naquele local), nivelMin, nivelMax',
  encontros: finais.map((l) => ({
    especie: l.especie, geracao: l.geracao, local: l.local, terreno: l.terreno,
    fatia: Number(l.fatia.toFixed(3)), nivelMin: l.nivelMin, nivelMax: l.nivelMax,
  })),
}))

const especies = new Set(finais.map((l) => l.especie))
const locais = new Set(finais.map((l) => `${l.geracao}|${l.local}`))
console.log(
  `${finais.length} encontros | ${especies.size} especies do roster | ${locais.size} locais | ` +
  `${foraDoRoster.size} nomes fora do roster -> ${path.relative(process.cwd(), SAIDA)}`,
)
