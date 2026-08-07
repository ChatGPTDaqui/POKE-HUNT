// Adaptador Node: liga o handler `fetch` (app.ts) ao `node:http`.
//
// E o unico arquivo com codigo especifico de plataforma. Trocar Node por
// Cloudflare Workers e apagar este arquivo e escrever
// `export default { fetch: criarApp(env) }` — foi pra isso que o app virou um
// handler de Fetch em vez de um app de framework.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { criarApp } from './app.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// Le o `.env` da raiz do projeto — o mesmo que os scripts de catalogo usam. A
// `SUPABASE_SERVICE_ROLE_KEY` mora so ali: ela ignora RLS por completo, entao
// nunca pode aparecer em nada com prefixo `VITE_` (isso iria dentro do bundle
// do navegador).
function lerEnv(): Record<string, string> {
  try {
    const texto = readFileSync(join(RAIZ, '.env'), 'utf8')
    return Object.fromEntries(
      texto.split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => {
          const i = l.indexOf('=')
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
        }),
    )
  } catch {
    return {}
  }
}

const env = { ...lerEnv(), ...process.env } as Record<string, string>
const supabaseUrl = env.SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env da raiz).')
  process.exit(1)
}

const PORTA = Number(env.PORTA_SERVIDOR || 8787)
// Origens permitidas explicitas: `*` junto de `Authorization` deixaria qualquer
// site chamar o servico com o token do jogador.
const origensPermitidas = (env.ORIGENS_PERMITIDAS || 'http://localhost:5173').split(',').map((o) => o.trim())

const handler = criarApp({ supabaseUrl, serviceRoleKey, origensPermitidas })

createServer(async (reqNode, resNode) => {
  const url = `http://${reqNode.headers.host ?? 'localhost'}${reqNode.url ?? '/'}`
  const corpo = ['GET', 'HEAD'].includes(reqNode.method ?? 'GET')
    ? undefined
    : await new Promise<string>((resolve) => {
      let dado = ''
      reqNode.on('data', (c) => { dado += c })
      reqNode.on('end', () => resolve(dado))
    })

  const req = new Request(url, {
    method: reqNode.method,
    headers: reqNode.headers as HeadersInit,
    body: corpo || undefined,
  })

  const res = await handler(req)
  resNode.writeHead(res.status, Object.fromEntries(res.headers))
  resNode.end(Buffer.from(await res.arrayBuffer()))
}).listen(PORTA, () => {
  console.log(`servidor de autoridade em http://localhost:${PORTA}`)
  console.log(`origens permitidas: ${origensPermitidas.join(', ')}`)
})
