// Emite `src/data/generated/spawnTiers.generated.ts` a partir de
// `scripts/spawn-tiers.json`.
//
//   node scripts/gerar-spawn-tiers.mjs
//
// POR QUE ISTO EXISTE: o peso de spawn por especie vinha sendo RASPADO de
// `enemies.generated.ts` (`for (const enc of ENCOUNTERS_DATA) weight[...] =
// enc.weight`), um arquivo de ENCONTROS da estrutura de hunts ANTIGA. Com as
// hunts remontadas por bioma, aquele arquivo virou legado — e a dependencia
// era silenciosa: parar de emiti-lo nao daria erro, so zeraria os pesos e todo
// spawn viraria o fallback "incomum" sem ninguem notar.
//
// O peso e dado do PROJETO, nao da estrutura de hunts: e o tier real de
// encontro selvagem do Gen1/Gen2, derivado dos disassemblies por
// `scripts/derive-spawn-tiers.js`. Agora ele viaja sozinho.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENTRADA = path.join(RAIZ, 'scripts/spawn-tiers.json')
const SAIDA = path.join(RAIZ, 'src/data/generated/spawnTiers.generated.ts')

const dados = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'))
const pesoPorTier = Object.fromEntries(dados.tiers.map((t) => [t.chave, t.peso]))

const linhas = []
for (const [especie, info] of Object.entries(dados.especies).sort(([a], [b]) => a.localeCompare(b))) {
  const peso = pesoPorTier[info.tier]
  if (peso == null) throw new Error(`Especie "${especie}" com tier desconhecido: ${info.tier}`)
  linhas.push(`  '${especie}': ${peso}, // ${info.tier} (${info.origem})`)
}

const saida = [
  '// AUTO-GERADO por `node scripts/gerar-spawn-tiers.mjs` a partir de',
  '// scripts/spawn-tiers.json. Nao editar a mao.',
  '//',
  '// Peso de spawn por especie: o TIER real de encontro selvagem do Gen1/Gen2,',
  '// derivado dos disassemblies pret/pokecrystal, pret/pokegold e pret/pokered',
  '// (ver scripts/derive-spawn-tiers.js). A escala espelha a `GrassMonProbTable`',
  `// do Gen2: ${dados.tiers.map((t) => `${t.chave}=${t.peso}`).join(', ')}.`,
  '//',
  '// NAO e a taxa de captura, e nao muda com a estrutura de hunts — quem e comum',
  '// nos jogos reais aparece mais, em qualquer hunt onde apareca.',
  '',
  `export const SPAWN_WEIGHT_BY_SPECIES: Record<string, number> = {`,
  ...linhas,
  '};',
  '',
].join('\n')

fs.writeFileSync(SAIDA, saida)
console.log(`${linhas.length} especies -> ${path.relative(process.cwd(), SAIDA)}`)
