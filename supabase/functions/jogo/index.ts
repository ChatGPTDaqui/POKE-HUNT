// O servico de autoridade rodando como Supabase Edge Function (Deno).
//
// Toda a regra vive em `servidor.js`, o bundle gerado por
// `npm run build:edge` (motor + servico num arquivo so). Este arquivo e apenas
// a casca de plataforma — o equivalente Deno do `server/src/node.ts`. Nenhuma
// regra de jogo aqui.
//
// Por que Edge Function e nao um host separado: o limite real e 2s de CPU por
// invocacao, e o pior caso medido (6h de farm offline) fica em ~310ms. Cabe com
// folga, e evita mais uma conta/servico/fatura pra manter.
import { criarApp } from './servidor.js'

// Injetadas pela plataforma — nao ha segredo pra subir a mao. A service_role
// ignora RLS, e por isso ela so pode viver aqui dentro, nunca no bundle do
// navegador.
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Schema alvo (Content-Profile/Accept-Profile do PostgREST). SEM isto o
// db.ts cai no default do PostgREST ('public') — que neste projeto e
// PRODUCAO REAL, nao o ambiente de trabalho. `dev` por padrao: promover pra
// `public` e decisao separada, explicita, nunca implicita por falta de env
// var (ver _Architecture.md, migracao RPC-everything).
//
// NAO chama a var de SUPABASE_SCHEMA: o prefixo SUPABASE_ e reservado pela
// plataforma (injetado automaticamente), `supabase secrets set` recusa
// qualquer nome que comece assim — essa var nunca foi setavel, o fallback
// 'dev' rodava sempre, sem jeito de promover pra public (achado real, 2026-08-13).
const schema = Deno.env.get('JOGO_SCHEMA') ?? 'dev'

// Origens do jogo. `*` junto de `Authorization` deixaria qualquer site chamar
// isto com o token do jogador, entao a lista e explicita.
//
// PH-293: AS ORIGENS DO PROPRIO JOGO SAO A BASE, e o secret so ACRESCENTA.
//
// Antes a lista vinha inteira do secret `ORIGENS_PERMITIDAS`, com fallback pra
// `localhost:5173`. Secret nao aparece em code review, nao entra em teste e nao
// tem historico: quando o cliente de staging subiu, ninguem lembrou de
// acrescenta-lo, e o ambiente inteiro passou a carregar a tela sem nunca
// carregar o jogo — com a mensagem de erro culpando o bloqueador de anuncios do
// jogador. Foi a segunda vez que esse cliente quebrou em silencio (a primeira
// foi a PH-134, por variavel de ambiente ausente).
//
// A lista continua explicita e continua sem curinga. O que mudou e que o que e
// NOSSO esta versionado, e o secret passa a servir pro que nao da pra prever
// daqui: dominio proprio, preview especifico, um cliente novo.
//
// ESTA LISTA E COPIA de `src/data/origensDoJogo.ts` — este arquivo roda no Deno
// e nao importa de `src/`. `origensDoJogo.test.ts` compara as duas lendo o fonte
// daqui, e reprova se divergirem.
const ORIGENS_DO_JOGO = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://poke-hunt-euj.pages.dev',
  'https://dev.poke-hunt-euj.pages.dev',
]

const origensPermitidas = [...new Set([
  ...ORIGENS_DO_JOGO,
  ...(Deno.env.get('ORIGENS_PERMITIDAS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
])]

// Chave PUBLICA do projeto (JWKS), usada por auth.ts pra conferir a assinatura
// do token sem ida de rede. Nao e segredo — e o mesmo JSON servido em
// `/auth/v1/.well-known/jwks.json`, aberto pra qualquer um. Esta aqui so pra
// economizar a busca: sem a var, auth.ts busca sozinho e funciona igual.
//
//   supabase secrets set JOGO_JWKS="$(curl -s https://SEU-PROJETO.supabase.co/auth/v1/.well-known/jwks.json)"
//
// Se a chave do projeto girar e esta var ficar velha, nao quebra: o `kid` novo
// nao vai estar aqui e auth.ts cai no fallback de busca sozinho.
const jwksJson = Deno.env.get('JOGO_JWKS') ?? undefined

const handler = criarApp({ supabaseUrl, serviceRoleKey, schema, origensPermitidas, jwksJson })

// O gateway das Edge Functions prefixa a rota com o nome da funcao
// (`/jogo/sessao/flush`, ou `/jogo-dev/sessao/flush` na function de staging). O
// app conhece as rotas sem esse prefixo, entao o PRIMEIRO segmento e removido
// aqui, generico — nao hardcoded pro nome `jogo`, pra servir as duas functions
// sem duplicar este arquivo (achado real: `/^\/jogo/` batia so o literal
// "jogo", quebrando `jogo-dev` ao deixar sobrar "-dev/..." no path).
Deno.serve((req: Request) => {
  const url = new URL(req.url)
  url.pathname = url.pathname.replace(/^\/[^/]+/, '') || '/'
  return handler(new Request(url.toString(), req))
})
