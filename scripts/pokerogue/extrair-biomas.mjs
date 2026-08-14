// Extrai as pools de Pokemon de cada bioma do PokeRogue e grava
// `scripts/pokerogue/biomas.json`.
//
// POR QUE O JSON E COMMITADO E ESTE SCRIPT E OPCIONAL: o build do jogo nao
// pode depender de rede nem do estado do repositorio de terceiros. O JSON e a
// fonte versionada; este script so existe pra poder REGERAR quando o PokeRogue
// mudar as pools, e pra provar de onde o dado veio.
//
// O que sai aqui e o dado CRU do PokeRogue — nomes de especie deles, os 9
// tiers deles, sem nenhum recorte pelo nosso elenco. Filtrar e trabalho do
// `scripts/gerar-subbiomas.mjs`, que le o nosso catalogo: assim, importar arte
// de uma especie nova basta re-rodar o gerador, sem tocar em rede.
//
// Fonte: https://github.com/pagefaultgames/pokerogue  (src/data/balance/biomes)
//
//   node scripts/pokerogue/extrair-biomas.mjs            # usa o cache local
//   node scripts/pokerogue/extrair-biomas.mjs --baixar   # rebaixa do GitHub
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const CACHE = path.join(AQUI, '.cache')
const SAIDA = path.join(AQUI, 'biomas.json')
const BASE = 'https://raw.githubusercontent.com/pagefaultgames/pokerogue/HEAD/src/data/balance/biomes'

const BIOMAS = [
  'abyss', 'badlands', 'beach', 'cave', 'construction-site', 'desert', 'dojo', 'end',
  'factory', 'fairy-cave', 'forest', 'grass', 'graveyard', 'ice-cave', 'island', 'jungle',
  'laboratory', 'lake', 'meadow', 'metropolis', 'mountain', 'plains', 'power-plant', 'ruins',
  'sea', 'seabed', 'slum', 'snowy-forest', 'space', 'swamp', 'tall-grass', 'temple', 'town',
  'volcano', 'wasteland',
]

// Os 9 tiers do PokeRogue. Os 4 de BOSS existem porque la a forma final quase
// nunca e encontro selvagem: ela e o chefe da 10a wave do bioma.
const TIERS = [
  'COMMON', 'UNCOMMON', 'RARE', 'SUPER_RARE', 'ULTRA_RARE',
  'BOSS', 'BOSS_RARE', 'BOSS_SUPER_RARE', 'BOSS_ULTRA_RARE',
]
// As pools do PokeRogue sao segmentadas por hora do dia. Nao ha ciclo
// dia/noite neste jogo (decisao registrada no CLAUDE.md), entao a uniao dos
// periodos e o dado certo pra nos: quem so aparece de noite la nao pode virar
// "nunca selvagem" aqui.
const PERIODOS = ['DAWN', 'DAY', 'DUSK', 'NIGHT', 'ALL']

async function baixar() {
  fs.mkdirSync(CACHE, { recursive: true })
  for (const b of BIOMAS) {
    const resp = await fetch(`${BASE}/${b}.ts`)
    if (!resp.ok) throw new Error(`falha ao baixar ${b}.ts: HTTP ${resp.status}`)
    fs.writeFileSync(path.join(CACHE, `${b}.ts`), await resp.text())
    process.stdout.write('.')
  }
  console.log(' ok')
}

// Recorta o trecho entre o marcador e o proximo marcador irmao. Feito por
// indexOf e nao por regex de bloco: os arquivos tem chaves aninhadas e
// contar chaves com regex quebra em silencio no primeiro comentario com `}`.
function fatiar(texto, marcadores, alvo) {
  const ini = texto.indexOf(alvo)
  if (ini < 0) return ''
  let fim = texto.length
  for (const m of marcadores) {
    if (m === alvo) continue
    const p = texto.indexOf(m)
    if (p > ini && p < fim) fim = p
  }
  return texto.slice(ini, fim)
}

function extrair(nome) {
  const txt = fs.readFileSync(path.join(CACHE, `${nome}.ts`), 'utf8')
  const ini = txt.indexOf('const pokemonPool')
  const fim = txt.indexOf('const trainerPool')
  const bloco = ini >= 0 ? txt.slice(ini, fim > ini ? fim : txt.length) : ''

  const marcasTier = TIERS.map((t) => `[BiomePoolTier.${t}]:`)
  const marcasPer = PERIODOS.map((p) => `[TimeOfDay.${p}]:`)

  const pools = {}
  for (const t of TIERS) {
    const trecho = fatiar(bloco, marcasTier, `[BiomePoolTier.${t}]:`)
    const nomes = new Set()
    for (const p of PERIODOS) {
      const sub = fatiar(trecho, marcasPer, `[TimeOfDay.${p}]:`)
      for (const m of sub.matchAll(/SpeciesId\.([A-Z0-9_]+)/g)) nomes.add(m[1])
    }
    pools[t] = [...nomes]
  }

  // Grafo de vizinhanca. `[BiomeId.X, n]` = 1/n de chance de X APARECER como
  // opcao; depois o PokeRogue sorteia uniforme entre as que apareceram.
  // Guardado aqui porque e a fundacao do modo Expedicao (ainda nao feito) e
  // nao custa nada preservar agora que o parser ja esta escrito.
  const lm = txt.match(/const biomeLinks: BiomeLinks = (\[[\s\S]*?\]);/)
  const links = lm
    ? [...lm[1].matchAll(/\[BiomeId\.([A-Z_]+),\s*(\d+)\]|BiomeId\.([A-Z_]+)/g)]
      .map((m) => (m[1] ? { bioma: m[1].toLowerCase().replace(/_/g, '-'), peso: Number(m[2]) } : { bioma: m[3].toLowerCase().replace(/_/g, '-'), peso: 1 }))
    : []

  return { pools, links }
}

if (process.argv.includes('--baixar') || !fs.existsSync(CACHE)) await baixar()

const saida = {}
for (const b of BIOMAS) saida[b] = extrair(b)

const total = new Set(Object.values(saida).flatMap((x) => Object.values(x.pools).flat())).size
fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 2) + '\n')
console.log(`${BIOMAS.length} biomas, ${total} especies distintas -> ${path.relative(process.cwd(), SAIDA)}`)
