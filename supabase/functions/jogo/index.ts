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

// Origens do jogo. `*` junto de `Authorization` deixaria qualquer site chamar
// isto com o token do jogador, entao a lista e explicita — configure com
// `supabase secrets set ORIGENS_PERMITIDAS=https://seu-dominio`.
const origensPermitidas = (Deno.env.get('ORIGENS_PERMITIDAS') ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())

const handler = criarApp({ supabaseUrl, serviceRoleKey, origensPermitidas })

// O gateway das Edge Functions prefixa a rota com o nome da funcao
// (`/jogo/sessao/flush`). O app conhece as rotas sem esse prefixo, entao ele e
// removido aqui — de novo, casca de plataforma, nao regra.
Deno.serve((req: Request) => {
  const url = new URL(req.url)
  url.pathname = url.pathname.replace(/^\/jogo/, '') || '/'
  return handler(new Request(url.toString(), req))
})
