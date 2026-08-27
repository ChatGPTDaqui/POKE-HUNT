// BANCADA: o flush ainda credita, e o claim ainda serializa?
//
//   node scripts/harness/fumaca-credito.mjs
//   node scripts/harness/fumaca-credito.mjs --espera=20
//   node scripts/harness/fumaca-credito.mjs --mapa=route_46
//   node scripts/harness/fumaca-credito.mjs --funcao=jogo --confirmar-public
//
// Sai com codigo 0 se creditou e o claim serializou; 2 se nao. Serve como
// checagem pos-deploy: uma rodada de ~2min responde a pergunta que nenhum teste
// automatizado do projeto responde.
//
// POR QUE ISTO EXISTE (PH-220)
//
// O CAS que reivindica o intervalo do flush (`aplicarFlush`, progresso.ts) manda
// `PATCH game_sessions` com `Prefer: return=representation` e le o resultado como
// SINAL: resposta nao-vazia = "este intervalo e meu", resposta vazia = outro
// request chegou primeiro. A PH-219 estreitou essa representacao pra `&select=id`.
//
// O teste unitario (`authority/src/claimDoFlush.test.ts`) cobre as duas pontas
// contra MOCK. O que ele nao pode cobrir e o comportamento do PostgREST de
// verdade: se um upgrade dele passar a devolver `[]` pra um PATCH com `select`,
// TODO flush vira `FLUSH_OCUPADO` — e `FLUSH_OCUPADO` responde HTTP 200 com
// `segundosCreditados: 0`. O jogo para de creditar ouro e XP e NADA emite erro.
// Nao e hipotese: a PH-194 foi um upgrade de PostgREST reprovando o projeto
// inteiro sem ninguem ter tocado em nada.
//
// A LICAO DE MEDICAO, que custou um falso alarme nesta investigacao: OURO E UM
// SINAL RUIM pra "creditou duas vezes". A auto-venda de POKE capturado cai na
// mesma carteira, entao duas janelas seguidas rendem 80 e 25 de ouro pra 4 e 5
// abates — variancia de 2,5x por abate que parece bug e nao e. O sinal limpo esta
// na propria linha da sessao: `simulated_seconds` (o servidor SOMA a janela nele)
// e `rng_draws` (uma janela simulada avanca a sequencia UMA vez). E por isso que
// o caso da corrida le o banco, e nao a carteira.
//
// SO A CONTA CANONICA DE TESTE, e sem flag pra burlar: as credenciais saem de
// `CONTA_TESTE_EMAIL`/`CONTA_TESTE_SENHA` do `.env` raiz (ver
// scripts/conta-de-teste.js). A bancada ABRE E FECHA sessao de verdade e credita
// ouro de verdade — em conta de jogador isso e mexer no save de alguem.
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const args = process.argv.slice(2)
const opcao = (nome, padrao) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`))
  return a ? a.slice(nome.length + 3) : padrao
}

function lerEnv(nome) {
  const arquivo = join(RAIZ, nome)
  if (!existsSync(arquivo)) return {}
  const env = {}
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const t = linha.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const env = lerEnv('.env')
const envLocal = lerEnv('.env.local')

// A function decide o schema: `jogo` roda em `public` (jogadores reais),
// `jogo-dev` em `dev`. Mesmo padrao de recusa de scripts/lib/schema-alvo.cjs —
// o default seguro de um script que ESCREVE nao e escolher producao em silencio.
const FUNCAO = opcao('funcao', 'jogo-dev')
const SCHEMA = FUNCAO === 'jogo' ? 'public' : 'dev'
if (SCHEMA === 'public' && !args.includes('--confirmar-public')) {
  console.error('')
  console.error(`  RECUSADO: --funcao=${FUNCAO} roda contra o schema public, o dado dos jogadores reais.`)
  console.error('  Esta bancada ABRE sessao e CREDITA ouro de verdade na conta de teste.')
  console.error('  Para mirar producao mesmo assim, repita com --confirmar-public no fim.')
  console.error('')
  process.exit(1)
}

const URL_BASE = env.SUPABASE_URL ?? envLocal.VITE_SUPABASE_URL
const ANON = envLocal.VITE_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = env.CONTA_TESTE_EMAIL ?? 'claude@teste.pokehunt.local'
const SENHA = env.CONTA_TESTE_SENHA
const ESPERA_S = Number(opcao('espera', '35'))

const faltando = [
  !URL_BASE && 'SUPABASE_URL (.env) ou VITE_SUPABASE_URL (.env.local)',
  !ANON && 'VITE_SUPABASE_ANON_KEY (.env.local)',
  !SERVICE && 'SUPABASE_SERVICE_ROLE_KEY (.env)',
  !SENHA && 'CONTA_TESTE_SENHA (.env) — rode `node scripts/conta-de-teste.js --criar`',
].filter(Boolean)
if (faltando.length) {
  console.error(`Faltou no ambiente:\n  - ${faltando.join('\n  - ')}`)
  process.exit(1)
}
if (!Number.isFinite(ESPERA_S) || ESPERA_S < 5) {
  console.error('--espera precisa ser um numero de segundos >= 5 (o flush precisa ter janela pra creditar).')
  process.exit(1)
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const num = (v) => Number(v ?? 0)

async function login() {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`login de ${EMAIL} falhou (${r.status}): ${JSON.stringify(j).slice(0, 240)}`)
  return { token: j.access_token, userId: j.user.id }
}

function clienteDaFuncao(token) {
  return async function chamar(caminho, init = {}) {
    const r = await fetch(`${URL_BASE}/functions/v1/${FUNCAO}${caminho}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, apikey: ANON, 'content-type': 'application/json' },
    })
    const texto = await r.text()
    try { return { status: r.status, corpo: JSON.parse(texto) } } catch { return { status: r.status, corpo: texto } }
  }
}

/**
 * A linha da sessao lida DIRETO no Postgres, com `service_role` e o
 * `Accept-Profile` do schema da function.
 *
 * E leitura, nunca escrita: a bancada nao mexe no banco por fora do servidor —
 * se ela "consertasse" a sessao a mao, deixaria de medir o que o servidor faz.
 */
async function lerSessaoAberta(userId) {
  const colunas = 'id,simulated_seconds,last_flush_at,rng_draws,flushing_since,sala_abates'
  const r = await fetch(
    `${URL_BASE}/rest/v1/game_sessions?user_id=eq.${userId}&closed_at=is.null&select=${colunas}`,
    { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Accept-Profile': SCHEMA } },
  )
  if (!r.ok) throw new Error(`leitura de game_sessions falhou (${r.status}): ${(await r.text()).slice(0, 200)}`)
  return (await r.json())[0] ?? null
}

const CORPO_PARCIAL = JSON.stringify({ parcial: true })
const falhas = []
const reprovar = (msg) => { falhas.push(msg); console.log(`  FALHOU: ${msg}`) }

/**
 * A rodada nao pode responder a pergunta — e diferente de responder "nao".
 *
 * POKE desmaiado no meio, sessao sumindo, `/sessao/abrir` recusando: nada disso
 * e evidencia sobre o claim. Sai com 1, nao com 2, pra quem usa isto como
 * checagem pos-deploy nao confundir "inconclusivo" com "quebrou".
 */
class Inconcluso extends Error {}

function resumoLegivel(resumo) {
  if (!resumo) return '(sem resumo)'
  const auto = num(resumo.ouroDeAutoVenda)
  return `${num(resumo.kills)} abates, ouro +${num(resumo.gold)}`
    + (auto ? ` (${auto} de auto-venda em ${num(resumo.autoVendidos)} POKE)` : '')
    + `, xp +${num(resumo.xp)}`
}

const { token, userId } = await login()
const chamar = clienteDaFuncao(token)

const saude = await chamar('/saude')
if (saude.status !== 200) { console.error(`/saude de ${FUNCAO} respondeu ${saude.status}`); process.exit(1) }
console.log(`funcao ${FUNCAO} viva, schema declarado: ${saude.corpo?.schema}`)
if (saude.corpo?.schema !== SCHEMA) {
  console.error(`  ABORTADO: a function declara schema "${saude.corpo?.schema}" e esta bancada leria "${SCHEMA}".`)
  console.error('  Medir o banco errado produz numero que parece certo e nao e (ver docs/15).')
  process.exit(1)
}
console.log(`conta ${EMAIL} (${userId})`)

const inicial = await chamar('/estado?parcial=1')
if (inicial.status !== 200) { console.error(`GET /estado falhou (${inicial.status}):`, inicial.corpo); process.exit(1) }
const eIni = inicial.corpo.estado
console.log(`ouro ${eIni.wallet.gold} | xp ${eIni.trainer.exp} | ${eIni.team.length} POKE na equipe | ${eIni.unlockedMaps.length} hunts`)

const poke = eIni.team.find((p) => p.hp > 0)
if (!poke) {
  console.error('Nenhum POKE da equipe esta de pe. Cure na Enfermeira ou rode:')
  console.error('  node scripts/poke-de-teste.mjs --especie=scizor --nivel=20')
  process.exit(1)
}
const mapId = opcao('mapa', eIni.unlockedMaps[0])
if (!mapId) { console.error('Conta sem hunt liberada. Passe --mapa=<id> explicitamente.'); process.exit(1) }

let sessaoAberta = false
let inconcluso = null
try {
  const abriu = await chamar('/sessao/abrir', { method: 'POST', body: JSON.stringify({ mapId, pokeUid: poke.uid }) })
  if (abriu.status !== 200) throw new Inconcluso(`/sessao/abrir respondeu ${abriu.status}: ${JSON.stringify(abriu.corpo).slice(0, 240)}`)
  sessaoAberta = true
  console.log(`\nsessao ${abriu.corpo.sessaoId} em ${mapId} com ${poke.speciesId} nv${poke.level} (hp ${poke.hp})`)

  // -------------------------------------------------------------------
  // CASO 1 — o flush credita.
  console.log(`\n[1/3] credito — esperando ${ESPERA_S}s de tempo real`)
  await dormir(ESPERA_S * 1000)
  const f1 = await chamar('/sessao/flush', { method: 'POST', body: CORPO_PARCIAL })
  if (f1.status !== 200) throw new Inconcluso(`/sessao/flush respondeu ${f1.status}: ${JSON.stringify(f1.corpo).slice(0, 240)}`)
  console.log(`  segundosCreditados=${f1.corpo.segundosCreditados} | ${resumoLegivel(f1.corpo.resumo)}`)

  if (f1.corpo.sessaoEncerrada) {
    // O servidor encerrou a hunt sozinho (POKE desmaiado). Nao e falha do claim:
    // e falta de POKE de pe. Distinguir importa — sem isto a bancada acusaria
    // "nao credita" e mandaria alguem investigar o CAS por nada.
    sessaoAberta = false
    throw new Inconcluso(
      `o servidor encerrou a cacada (${f1.corpo.sessaoEncerrada}) no primeiro flush.`
      + ' Isto nao diz nada sobre o claim — cure o POKE (ou use um de nivel maior) e repita.',
    )
  }
  if (!(f1.corpo.segundosCreditados > 0)) reprovar('flush nao creditou segundo nenhum — todo flush virando FLUSH_OCUPADO e o claim e o primeiro suspeito')

  const dep1 = (await chamar('/estado?parcial=1')).corpo.estado
  const dOuro = dep1.wallet.gold - eIni.wallet.gold
  const dXp = dep1.trainer.exp - eIni.trainer.exp
  console.log(`  ouro ${dOuro >= 0 ? '+' : ''}${dOuro} | xp ${dXp >= 0 ? '+' : ''}${dXp}`)
  if (dOuro <= 0 && dXp <= 0) reprovar('nem ouro nem xp subiram no estado devolvido depois do flush')

  // -------------------------------------------------------------------
  // CASO 2 — dois flushes simultaneos: exatamente um credita.
  console.log(`\n[2/3] corrida — esperando ${ESPERA_S}s, depois 2 flushes ao mesmo tempo`)
  await dormir(ESPERA_S * 1000)
  const antesDaCorrida = await lerSessaoAberta(userId)
  if (!antesDaCorrida) throw new Inconcluso('a sessao sumiu do banco antes da corrida')
  const [a, b] = await Promise.all([
    chamar('/sessao/flush', { method: 'POST', body: CORPO_PARCIAL }),
    chamar('/sessao/flush', { method: 'POST', body: CORPO_PARCIAL }),
  ])
  const sa = num(a.corpo?.segundosCreditados)
  const sb = num(b.corpo?.segundosCreditados)
  console.log(`  A: ${a.status} ${sa}s | B: ${b.status} ${sb}s`)
  const depoisDaCorrida = await lerSessaoAberta(userId)
  const avanco = num(depoisDaCorrida?.simulated_seconds) - num(antesDaCorrida.simulated_seconds)
  const sorteios = num(depoisDaCorrida?.rng_draws) - num(antesDaCorrida.rng_draws)
  console.log(`  simulated_seconds +${avanco.toFixed(3)}s (soma relatada A+B: ${(sa + sb).toFixed(3)}s) | rng_draws +${sorteios}`)
  console.log(`  flushing_since depois = ${depoisDaCorrida?.flushing_since ?? 'null'}`)

  const quantosCreditaram = [sa, sb].filter((s) => s > 0).length
  if (quantosCreditaram !== 1) {
    reprovar(quantosCreditaram === 0
      ? 'os DOIS flushes voltaram com 0 — nenhum ganhou o claim'
      : 'os DOIS flushes creditaram — o CAS parou de serializar, e e assim que POKE duplica')
  }
  // A soma relatada e o avanco no banco tem que ser a MESMA janela. Se o banco
  // avancou o dobro, alguem creditou escondido relatando 0.
  if (Math.abs(avanco - (sa + sb)) > 0.5) {
    reprovar(`o banco avancou ${avanco.toFixed(3)}s mas os flushes relataram ${(sa + sb).toFixed(3)}s — janela creditada sem ninguem assumir`)
  }
  if (depoisDaCorrida?.flushing_since) reprovar('`flushing_since` sobreviveu ao flush — o `finally` de aplicarFlush nao rodou, e todo request seguinte vai esperar o teto')

  // -------------------------------------------------------------------
  // CASO 3 — a ancora avancou: o flush seguinte credita de novo.
  console.log(`\n[3/3] ancora — esperando ${ESPERA_S}s pro flush seguinte`)
  await dormir(ESPERA_S * 1000)
  const f3 = await chamar('/sessao/flush', { method: 'POST', body: CORPO_PARCIAL })
  console.log(`  segundosCreditados=${num(f3.corpo?.segundosCreditados)} | ${resumoLegivel(f3.corpo?.resumo)}`)
  if (f3.corpo?.sessaoEncerrada) {
    console.log(`  (servidor encerrou a cacada: ${f3.corpo.sessaoEncerrada} — o caso 3 nao conclui nada)`)
    sessaoAberta = false
  } else if (!(num(f3.corpo?.segundosCreditados) > 0)) {
    reprovar('o flush seguinte nao creditou — o `last_flush_at` novo nao esta casando com o claim seguinte')
  }
} catch (erro) {
  // Nada de `process.exit` dentro do `try`: ele mata o processo na hora e o
  // `finally` NAO roda, o que deixaria a sessao aberta na conta de teste.
  inconcluso = erro
} finally {
  // Sessao aberta que sobra deixa a conta de teste "em cacada" pra proxima
  // rodada e pra quem abrir o jogo na conta. Fechar tambem no caminho de erro.
  if (sessaoAberta) {
    const fechou = await chamar('/sessao/fechar', { method: 'POST', body: CORPO_PARCIAL }).catch((e) => ({ status: 0, corpo: String(e) }))
    console.log(`\nsessao fechada (${fechou.status}).`)
  }
}

if (inconcluso) {
  console.log(`\n=== INCONCLUSIVO ===\n  ${inconcluso instanceof Inconcluso ? inconcluso.message : String(inconcluso)}`)
  if (!(inconcluso instanceof Inconcluso)) console.log(inconcluso?.stack ?? '')
  process.exit(1)
}
if (falhas.length) {
  console.log(`\n=== NAO CREDITA / NAO SERIALIZA — ${falhas.length} falha(s) ===`)
  for (const f of falhas) console.log(`  - ${f}`)
  process.exit(2)
}
console.log('\n=== CREDITA, E O CLAIM SERIALIZA ===')
