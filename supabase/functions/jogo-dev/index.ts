// Casca de plataforma da function de STAGING (schema `dev`) — espelha
// `supabase/functions/jogo/index.ts` (producao, schema `public`). Mesmo
// bundle: importa `servidor.js` de dentro da pasta `jogo/` em vez de ter
// copia propria, pra nao duplicar 900KB+ gerado por `npm run build:edge` e
// evitar as duas copias saindo de sincronia (`jogo-dev` sempre teria o bundle
// da ultima vez que alguem lembrou de copiar). Deploy CLI segue imports
// relativos mesmo fora da pasta da propria function, entao isto funciona sem
// flag especial.
import { criarApp } from '../jogo/servidor.js'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Sem secret setado aqui tambem cai em 'dev' (mesmo fallback do jogo/index.ts)
// — mas nesta function o secret DEVE estar setado como 'dev' explicito
// mesmo assim, documentando intencao (ver task de deploy).
const schema = Deno.env.get('JOGO_SCHEMA') ?? 'dev'

const origensPermitidas = (Deno.env.get('ORIGENS_PERMITIDAS') ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())

const jwksJson = Deno.env.get('JOGO_JWKS') ?? undefined

const handler = criarApp({ supabaseUrl, serviceRoleKey, schema, origensPermitidas, jwksJson })

Deno.serve((req: Request) => {
  const url = new URL(req.url)
  url.pathname = url.pathname.replace(/^\/[^/]+/, '') || '/'
  return handler(new Request(url.toString(), req))
})
