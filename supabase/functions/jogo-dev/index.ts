// Casca de plataforma da function de STAGING (schema `dev`) — espelha
// `supabase/functions/jogo/index.ts` (producao, schema `public`). Mesmo
// bundle: importa `servidor.js` de dentro da pasta `jogo/` em vez de ter
// copia propria, pra nao duplicar 900KB+ gerado por `npm run build:edge` e
// evitar as duas copias saindo de sincronia (`jogo-dev` sempre teria o bundle
// da ultima vez que alguem lembrou de copiar). Deploy CLI segue imports
// relativos mesmo fora da pasta da propria function, entao isto funciona sem
// flag especial.
import { criarApp } from '../jogo/servidor.js'
// Mesma lista de CORS da producao, do MESMO arquivo (PH-293). Ela ja esteve
// duplicada aqui, e foi assim que o cliente de staging continuou recusado depois
// da primeira correcao: ela levou a lista pra `jogo/index.ts`, e esta casca
// seguiu com a propria leitura do secret — sem a origem do staging. Ver o
// cabecalho de `../jogo/origens.ts`.
import { origensPermitidas } from '../jogo/origens.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Var com nome DIFERENTE de JOGO_SCHEMA (usada por jogo/index.ts) de proposito:
// secrets do Supabase sao por PROJETO, nao por function — as duas functions
// leem o mesmo secret store. Se ambas lessem `JOGO_SCHEMA`, setar um valor
// pra uma mudaria a outra junto (mesma classe do incidente de 13/08, schema
// trocado). Nome dedicado evita a colisao sem precisar de isolamento nativo
// que o CLI/dashboard nao oferece.
const schema = Deno.env.get('JOGO_SCHEMA_DEV') ?? 'dev'

const listaDeOrigens = origensPermitidas(Deno.env.get('ORIGENS_PERMITIDAS'))

const jwksJson = Deno.env.get('JOGO_JWKS') ?? undefined

const handler = criarApp({
  supabaseUrl, serviceRoleKey, schema, jwksJson,
  origensPermitidas: listaDeOrigens,
})

Deno.serve((req: Request) => {
  const url = new URL(req.url)
  url.pathname = url.pathname.replace(/^\/[^/]+/, '') || '/'
  return handler(new Request(url.toString(), req))
})
