// Baixa os retratos dos treinadores que representam os bots do PvP (PH-548)
// do acervo de sprites de treinador do Pokemon Showdown — a mesma familia de
// fonte de `assets/gen5ani` — para `assets/treinadores/<id>.png`.
//
// A lista de ids e a de `src/data/avatares.ts`; o arquivo remoto pode ter
// sufixo de geracao (Agatha e Maxie nao tem versao sem sufixo no acervo), por
// isso o mapa explicito abaixo em vez de `${id}.png` cego. Idempotente: pula
// o que ja existe, `--forcar` rebaixa tudo.
//
// Run: node scripts/importar-retratos-de-treinador.mjs [--forcar]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DESTINO = join(ROOT, 'assets', 'treinadores')
const BASE = 'https://play.pokemonshowdown.com/sprites/trainers/'
const FORCAR = process.argv.includes('--forcar')

/** id do avatar -> nome do arquivo no acervo (sem .png). */
const ARQUIVO_REMOTO = {
  red: 'red',
  blue: 'blue',
  giovanni: 'giovanni',
  lance: 'lance',
  agatha: 'agatha-gen3',
  blaine: 'blaine',
  steven: 'steven',
  wallace: 'wallace',
  maxie: 'maxie-gen3',
  ash: 'ash',
}

mkdirSync(DESTINO, { recursive: true })
let baixados = 0
for (const [id, remoto] of Object.entries(ARQUIVO_REMOTO)) {
  const alvo = join(DESTINO, `${id}.png`)
  if (existsSync(alvo) && !FORCAR) { console.log(`= ${id} (ja existe)`); continue }
  const res = await fetch(`${BASE}${remoto}.png`)
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status} em ${remoto}.png`)
  writeFileSync(alvo, Buffer.from(await res.arrayBuffer()))
  baixados += 1
  console.log(`+ ${id} <- ${remoto}.png`)
}
console.log(`${baixados} retrato(s) baixado(s) em assets/treinadores/`)
