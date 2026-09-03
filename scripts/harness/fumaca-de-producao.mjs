// PH-300 — a verificacao pos-promocao que o `CLAUDE.md` exige, como ferramenta.
//
// POR QUE ISTO EXISTE
// ---------------------------------------------------------------------------
// Desde a PH-298 a promocao `dev`->`main` nao pede confirmacao de ninguem, e a
// regra que entrou no lugar manda, depois de todo merge em `main`, **abrir o
// jogo em producao e confirmar que ele CARREGA — nao que a tela sobe**.
//
// A distincao nao e retorica: e literalmente o defeito da PH-293. O cliente de
// staging subia a tela de login, deixava logar, e morria depois com uma
// mensagem que culpava o bloqueador de anuncios do jogador. Quem abrisse a
// pagina e olhasse veria um site funcionando. Duas levas passaram assim (PH-134
// e PH-293), as duas com deploy VERDE.
//
// Regra obrigatoria sem ferramenta vira uma de duas coisas: cada sessao
// reescreve o script diferente — e "verificado" passa a significar coisas
// diferentes a cada promocao —, ou a verificacao e pulada e alguem escreve
// "conferido" por ter visto a tela de login. Por isso ela e versionada, como
// manda a regra de harness do projeto (a PH-189 ja perdeu uma bancada assim).
//
// O QUE ELE MEDE, e por que as tres coisas juntas
// ---------------------------------------------------------------------------
// Faz o caminho que o cliente faz por baixo ao abrir o jogo:
//
//   STATUS   a rota respondeu 200. Sozinho nao basta: um 200 sem CORS o
//            navegador descarta antes de o JS ver.
//   CORS     o header veio para a origem DAQUELE cliente. Sozinho nao basta:
//            era o que faltava na PH-293, mas o header presente com corpo vazio
//            tambem nao carrega jogo nenhum.
//   CORPO    o `estado` do jogador veio junto. E o que o jogo precisa pra
//            desenhar a primeira tela de verdade.
//
// OS DOIS AMBIENTES, sempre. `jogo` com a origem de producao e `jogo-dev` com a
// de staging. Testar so um repete o erro da PH-293, em que a correcao alcancava
// so uma das duas cascas de Edge e o deploy saiu verde.
//
//   node scripts/harness/fumaca-de-producao.mjs             # os dois
//   node scripts/harness/fumaca-de-producao.mjs --producao  # so producao
//   node scripts/harness/fumaca-de-producao.mjs --staging   # so staging
//
// Sai com codigo != 0 se qualquer ambiente pedido reprovar — da pra usar em
// script de deploy sem ler a saida.
//
// NAO IMPRIME SEGREDO: nem token, nem senha, nem o corpo da resposta (que
// carrega a equipe inteira do jogador). So o veredito de cada condicao.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Mesmo leitor de `.env` dos outros scripts — o projeto nao usa dotenv. */
function lerEnv(caminho) {
  const m = {}
  try {
    for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
      const t = linha.trim()
      if (!t || t.startsWith('#') || !t.includes('=')) continue
      const i = t.indexOf('=')
      m[t.slice(0, i).trim()] = t.slice(i + 1).trim()
    }
  } catch { /* ausente e caso tratado abaixo */ }
  return m
}

// O `.env` da raiz e o mesmo de local e remoto (ver CLAUDE.md); o worktree pode
// nao ter copia propria, entao cai no diretorio principal — mesmo padrao de
// `badge-do-correio.mjs`.
const PRINCIPAL = 'C:/Users/Mark2/Documents/NOVO POKE IDLE'
const env = { ...lerEnv(join(RAIZ, '.env')), ...lerEnv(join(PRINCIPAL, '.env')) }
const local = { ...lerEnv(join(RAIZ, '.env.local')), ...lerEnv(join(PRINCIPAL, '.env.local')) }

/**
 * Arquivo primeiro, `process.env` depois (PH-460).
 *
 * A ORDEM NAO E ARBITRARIA. Trocada, uma variavel esquecida no shell de quem
 * opera passaria por cima do `.env` sem avisar — e este script aponta pra
 * PRODUCAO. Com o arquivo na frente, o comportamento local continua exatamente
 * o de antes e o `process.env` so entra onde nao havia nada.
 *
 * Ele existe porque no runner do Actions nao ha `.env` NENHUM: nem o do
 * worktree, nem o caminho absoluto de Windows logo acima (que la nao existe e
 * `lerEnv` engole em silencio). Sem este fallback o passo de fumaca do
 * `supabase-deploy.yml` sairia com "Faltando ..." em toda promocao.
 */
const doAmbiente = (nome) => {
  const v = process.env[nome]
  return v && v.trim() ? v.trim() : undefined
}

const URL_BASE = local.VITE_SUPABASE_URL || env.SUPABASE_URL || doAmbiente('VITE_SUPABASE_URL') || doAmbiente('SUPABASE_URL')
const ANON = local.VITE_SUPABASE_ANON_KEY || doAmbiente('VITE_SUPABASE_ANON_KEY')
const SENHA = env.CONTA_TESTE_SENHA || doAmbiente('CONTA_TESTE_SENHA')
const CONTA = 'claude@teste.pokehunt.local'

if (!URL_BASE || !ANON || !SENHA) {
  console.error('Faltando VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / CONTA_TESTE_SENHA')
  console.error(`Procurei no .env/.env.local de ${RAIZ} e de ${PRINCIPAL}, e depois no ambiente.`)
  process.exit(1)
}

/**
 * Um ambiente = uma casca de Edge mais a origem do cliente que fala com ela.
 *
 * O par importa: a funcao so devolve o header de CORS pra origem que ela
 * conhece, e foi a origem de staging que faltava na lista por duas levas.
 */
const AMBIENTES = [
  { nome: 'producao', funcao: 'jogo', origem: 'https://poke-hunt-euj.pages.dev' },
  { nome: 'staging', funcao: 'jogo-dev', origem: 'https://dev.poke-hunt-euj.pages.dev' },
]

async function entrar(origem) {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json', Origin: origem },
    body: JSON.stringify({ email: CONTA, password: SENHA }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`login HTTP ${r.status}: ${j.error_description || j.msg || ''}`)
  return j.access_token
}

async function conferir({ nome, funcao, origem }) {
  console.log(`\n--- ${nome} (${funcao}) ---`)
  console.log(`  origem: ${origem}`)

  let token
  try {
    token = await entrar(origem)
  } catch (e) {
    console.log(`  LOGIN  FALHOU — ${e.message}`)
    return false
  }
  console.log('  login  ok')

  const r = await fetch(`${URL_BASE}/functions/v1/${funcao}/estado?parcial=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, Origin: origem },
  })
  const corpo = await r.text()
  const cors = r.headers.get('access-control-allow-origin')
  // `"estado"` e a chave que o cliente le pra montar a primeira tela. Procurar a
  // chave, e nao "corpo nao vazio": uma pagina de erro tambem tem corpo.
  const temEstado = corpo.includes('"estado"')

  const ok = { status: r.ok, cors: cors === origem, corpo: temEstado }
  console.log(`  status ${r.ok ? 'ok' : `FALHOU — HTTP ${r.status}`}`)
  console.log(`  cors   ${ok.cors ? 'ok' : `FALHOU — recebeu ${cors ?? '(nenhum header)'}`}`)
  console.log(`  corpo  ${ok.corpo ? 'ok — o estado do jogador veio' : 'FALHOU — sem "estado" na resposta'}`)

  const passou = ok.status && ok.cors && ok.corpo
  if (!passou) {
    // A causa por extenso, porque a decisao que vem depois disto e "reverte ou
    // conserta", e ela depende de QUAL condicao quebrou.
    if (!ok.status) console.log('  -> a rota nao respondeu. Ver o run do deploy: a Edge subiu?')
    else if (!ok.cors) console.log('  -> CORS. A origem nao esta na lista da Edge publicada (ver supabase/functions/jogo/origens.ts).')
    else console.log('  -> respondeu e passou pelo CORS, mas sem o estado do jogador. Olhar o corpo na mao.')
  }
  return passou
}

const argv = process.argv.slice(2)
const pedidos = argv.includes('--producao') ? ['producao']
  : argv.includes('--staging') ? ['staging']
    : ['producao', 'staging']

console.log(`Banco: ${URL_BASE}`)
console.log(`Conta: ${CONTA}`)

let todosOk = true
for (const amb of AMBIENTES.filter((a) => pedidos.includes(a.nome))) {
  const ok = await conferir(amb)
  todosOk = todosOk && ok
}

console.log(`\n=== ${todosOk ? 'TUDO OK — o jogo CARREGA nos ambientes conferidos' : 'REPROVOU — ver a linha marcada FALHOU acima'} ===`)
process.exit(todosOk ? 0 : 1)
