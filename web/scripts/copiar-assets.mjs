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
import { cpSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = dirname(dirname(fileURLToPath(import.meta.url)))
const origem = join(web, '..', 'assets')
const destino = join(web, 'dist', 'assets')

if (!existsSync(origem)) {
  console.error(`Arte nao encontrada em ${origem} — o site subiria sem sprite nenhum.`)
  process.exit(1)
}
rmSync(destino, { recursive: true, force: true })
cpSync(origem, destino, { recursive: true })
console.log(`arte copiada para dist/assets`)
