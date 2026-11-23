// Copia a arte do jogo pra dentro do build.
//
// Em desenvolvimento, `assets/` (na RAIZ do repo, fora de web/) e servida por um
// plugin do Vite — ver vite.config.ts. Esse plugin nao existe no site publicado:
// o Cloudflare Pages serve arquivo estatico e nada mais. Sem esta copia, o site
// sobe com o codigo certo e ZERO sprite, todo /assets/* dando 404 — falha que
// nao aparece em nenhum teste local, porque local o plugin cobre.
//
// A copia fica fora de `web/public/` de proposito: 281MB e 6.300 arquivos
// dentro de public/ fariam o dev server indexar tudo a cada boot.
//
// LIMITE DE 20.000 ARQUIVOS DO PAGES (23/11/2026). Um deploy do Cloudflare
// Pages aceita no maximo 20.000 arquivos. `assets/` passou disso com os icones
// de golpe (#1171) e todo deploy do jogo comecou a falhar na validacao. O maior
// desperdicio estava nas pastas de GIF animado (`gen5ani`, `gen5ani-shiny`):
// ~1.250 GIFs cada, um por Pokemon da franquia inteira, mas o jogo so referencia
// as especies do proprio catalogo (todo acesso passa por `gen5SpriteUrl(id)`).
// Essas duas pastas agora levam so as especies de `pokes.generated.ts`.
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { basename, join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const origem = join(raiz, 'assets')
const destino = join(raiz, 'dist', 'assets')
const LIMITE_DO_PAGES = 20000
const FOLGA_MINIMA = 500

if (!existsSync(origem)) {
  console.error(`Arte nao encontrada em ${origem} — o site subiria sem sprite nenhum.`)
  process.exit(1)
}

// Mesmo normalize de `src/data/gen5Sprites.ts#normalize`.
const normalizar = (id) => id.toLowerCase().replace(/[^a-z0-9]/g, '')
const catalogo = readFileSync(join(raiz, 'src', 'data', 'generated', 'pokes.generated.ts'), 'utf8')
const especies = new Set([...catalogo.matchAll(/^ {2}"([^"]+)": \{$/gm)].map((m) => normalizar(m[1])))
if (especies.size < 100) {
  console.error(`So ${especies.size} especies lidas de pokes.generated.ts — o formato mudou? Abortando para nao publicar sem sprite.`)
  process.exit(1)
}
const PASTAS_POR_ESPECIE = new Set(['gen5ani', 'gen5ani-shiny'])

function copiar(caminho) {
  const rel = relative(origem, caminho)
  const pasta = rel.split(sep)[0]
  if (!PASTAS_POR_ESPECIE.has(pasta) || rel === pasta) return true
  return especies.has(basename(caminho).replace(/\.gif$/i, ''))
}

rmSync(destino, { recursive: true, force: true })
cpSync(origem, destino, { recursive: true, filter: copiar })

const contar = (dir) => readdirSync(dir).reduce((n, f) => {
  const p = join(dir, f)
  return n + (statSync(p).isDirectory() ? contar(p) : 1)
}, 0)
const total = contar(join(raiz, 'dist'))
console.log(`arte copiada para dist/assets (${especies.size} especies nos GIFs) — dist tem ${total} arquivos`)
if (total > LIMITE_DO_PAGES) {
  console.error(`dist passou do limite de ${LIMITE_DO_PAGES} arquivos do Cloudflare Pages: o deploy vai falhar.`)
  process.exit(1)
}
if (total > LIMITE_DO_PAGES - FOLGA_MINIMA) {
  console.warn(`AVISO: dist tem ${total} arquivos, a menos de ${FOLGA_MINIMA} do limite de ${LIMITE_DO_PAGES} do Pages.`)
}
