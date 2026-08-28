// BANCADA: a concessao do Eevee concede UMA vez, e a coleta entrega UM POKE?
//
//   node scripts/harness/eevee-do-lance.mjs
//   node scripts/harness/eevee-do-lance.mjs --funcao=jogo --confirmar-public
//
// Sai com 0 se todos os casos passarem, 2 se algum falhar. Rodar DEPOIS do
// deploy da migration — ela precisa estar aplicada no schema alvo.
//
// POR QUE ISTO EXISTE (PH-164)
//
// Os criterios de aceite 2, 4 e 5 da issue sao sobre CONCORRENCIA e AUTORIDADE:
//
//   2. a segunda vitoria nao concede — garantido no servidor, nao no cliente
//   4. duplo-clique / duas abas coletando entregam UM Eevee, nao dois
//   5. time cheio devolve erro tratado e o presente CONTINUA no correio
//
// Nenhum dos tres cabe num teste da suite. Eles vivem inteiros em PL/pgSQL — o
// trigger de `hall_da_fama`, o `insert ... on conflict do nothing` do marcador e
// o `update ... where anexo_coletado_em is null returning` do claim. Um teste
// com mock de banco provaria que os mocks concordam entre si.
// `src/data/eeveeDoLance.test.ts` tranca o TEXTO dessas clausulas; quem prova o
// COMPORTAMENTO e esta bancada.
//
// O caso mais importante e o 3 aqui: apagar a linha do Hall e reinserir. A PK de
// `hall_da_fama` sozinha ja impede a segunda concessao no caminho normal, entao
// um teste que so reinsere passaria mesmo SEM o marcador `recompensa_concedida`
// — e o marcador e justamente a trava que a issue pediu. Apagar e recriar e o
// unico jeito de fazer o trigger disparar de novo de verdade.
//
// Esse mesmo caso 3 e o que cobre a CONCESSAO RETROATIVA (20260828233000). A
// migration dos veteranos e um `DO` de uma vez so, entao nao ha o que chamar
// duas vezes aqui — mas ela chama exatamente a mesma
// `_conceder_eevee_do_lance`, e a garantia de que ela nao concede em dobro e
// justamente o marcador que o caso 3 exercita. Provado ali, vale pros dois
// caminhos.
//
// SO A CONTA CANONICA DE TESTE. As credenciais saem de
// `CONTA_TESTE_EMAIL`/`CONTA_TESTE_SENHA` do `.env` raiz (ver
// scripts/conta-de-teste.js). A bancada MEXE no correio e na equipe da conta —
// em conta de jogador isso e mexer no save de alguem.
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

// Mesmo default seguro de `fumaca-credito.mjs`: um script que ESCREVE nao
// escolhe producao em silencio.
const FUNCAO = opcao('funcao', 'jogo-dev')
const SCHEMA = FUNCAO === 'jogo' ? 'public' : 'dev'
if (SCHEMA === 'public' && !args.includes('--confirmar-public')) {
  console.error('')
  console.error(`  RECUSADO: --funcao=${FUNCAO} roda contra o schema public, o dado dos jogadores reais.`)
  console.error('  Esta bancada escreve no correio e na equipe da conta de teste.')
  console.error('  Para mirar producao mesmo assim, repita com --confirmar-public no fim.')
  console.error('')
  process.exit(1)
}

const URL_BASE = env.SUPABASE_URL ?? envLocal.VITE_SUPABASE_URL
const ANON = envLocal.VITE_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = env.CONTA_TESTE_EMAIL ?? 'claude@teste.pokehunt.local'
const SENHA = env.CONTA_TESTE_SENHA

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

const CHAVE_DA_RECOMPENSA = 'eevee_do_lance'
const CONQUISTA = 'boss_lance'

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

/** REST com `service_role` — o papel da AUTORIDADE, o unico que escreve no Hall. */
async function comoServidor(caminho, init = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'content-type': 'application/json',
      'Accept-Profile': SCHEMA,
      'Content-Profile': SCHEMA,
      ...(init.headers ?? {}),
    },
  })
  const texto = await r.text()
  let corpo = texto
  try { corpo = JSON.parse(texto) } catch { /* resposta vazia */ }
  return { status: r.status, corpo }
}

/** RPC com o token do JOGADOR — o papel do cliente. */
async function comoJogador(token, funcao, params) {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${funcao}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'Accept-Profile': SCHEMA,
      'Content-Profile': SCHEMA,
    },
    body: JSON.stringify(params),
  })
  const texto = await r.text()
  let corpo = texto
  try { corpo = JSON.parse(texto) } catch { /* resposta vazia */ }
  return { status: r.status, corpo }
}

async function cartasDoLance(userId) {
  const { corpo } = await comoServidor(
    `mail_messages?para_id=eq.${userId}&assunto=eq.Um%20presente%20do%20Campeao%20Lance`
    + '&select=id,anexo_poke,anexo_coletado_em,estado&order=created_at.asc',
  )
  return Array.isArray(corpo) ? corpo : []
}

async function equipe(userId) {
  const { corpo } = await comoServidor(
    `pokemon_instances?user_id=eq.${userId}&location=eq.team&select=id,species_id,level,team_slot`,
  )
  return Array.isArray(corpo) ? corpo : []
}

/** Estado inicial limpo pra bancada: sem carta do Lance, sem marcador, sem Hall. */
async function limpar(userId) {
  await comoServidor(`mail_messages?para_id=eq.${userId}&assunto=eq.Um%20presente%20do%20Campeao%20Lance`, { method: 'DELETE' })
  await comoServidor(`recompensa_concedida?user_id=eq.${userId}&chave=eq.${CHAVE_DA_RECOMPENSA}`, { method: 'DELETE' })
  await comoServidor(`hall_da_fama?user_id=eq.${userId}&conquista=eq.${CONQUISTA}`, { method: 'DELETE' })
  await comoServidor(`pokemon_instances?user_id=eq.${userId}&species_id=eq.eevee`, { method: 'DELETE' })
}

async function registrarConquista(userId, { upsert = false } = {}) {
  return comoServidor('hall_da_fama', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, conquista: CONQUISTA }),
    headers: upsert ? { Prefer: 'resolution=merge-duplicates' } : {},
  })
}

const casos = []
function checar(nome, ok, detalhe = '') {
  casos.push({ nome, ok, detalhe })
  console.log(`  ${ok ? 'OK  ' : 'FALHA'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
}

async function main() {
  console.log(`\nBancada do Eevee do Lance — schema ${SCHEMA}\n`)
  const { token, userId } = await login()
  console.log(`conta: ${EMAIL} (${userId})\n`)

  await limpar(userId)

  // --- 1. a primeira vitoria concede -----------------------------------------
  const primeira = await registrarConquista(userId)
  if (primeira.status >= 300) throw new Error(`insert no hall falhou (${primeira.status}): ${JSON.stringify(primeira.corpo).slice(0, 200)}`)
  let cartas = await cartasDoLance(userId)
  checar('a primeira vitoria gera UMA carta', cartas.length === 1, `${cartas.length} carta(s)`)
  checar('a carta traz o Eevee anexado', cartas[0]?.anexo_poke?.speciesId === 'eevee',
    JSON.stringify(cartas[0]?.anexo_poke ?? null))

  // --- 2. a segunda vitoria nao concede ---------------------------------------
  await registrarConquista(userId, { upsert: true })
  cartas = await cartasDoLance(userId)
  checar('a segunda vitoria NAO gera carta nova', cartas.length === 1, `${cartas.length} carta(s)`)

  // --- 3. o marcador segura mesmo com o Hall recriado --------------------------
  // Este e o caso que a PK de `hall_da_fama` sozinha NAO cobre.
  await comoServidor(`hall_da_fama?user_id=eq.${userId}&conquista=eq.${CONQUISTA}`, { method: 'DELETE' })
  await registrarConquista(userId)
  cartas = await cartasDoLance(userId)
  checar('apagar e recriar a conquista NAO gera carta nova', cartas.length === 1, `${cartas.length} carta(s)`)

  // --- 4. time cheio: erro tratado e o presente fica ---------------------------
  const equipeAntes = await equipe(userId)
  if (equipeAntes.length >= 6) {
    const cheio = await comoJogador(token, 'coletar_anexo_correio', { p_mensagem_id: cartas[0].id })
    const mensagem = String(cheio.corpo?.message ?? '')
    checar('time cheio devolve erro tratado (nao 5xx)', cheio.status === 400 && mensagem.includes('equipe esta cheia'),
      `HTTP ${cheio.status}: ${mensagem.slice(0, 80)}`)
    const depois = await cartasDoLance(userId)
    checar('e o presente continua no correio', depois[0]?.anexo_coletado_em == null,
      `coletado_em=${depois[0]?.anexo_coletado_em ?? 'null'}`)
  } else {
    console.log(`  PULADO  time cheio — a conta tem ${equipeAntes.length}/6 POKE em equipe.`)
    console.log('          Para exercitar o caso 5 da issue, encha a equipe e rode de novo.\n')
  }

  // --- 5. duas coletas ao mesmo tempo entregam UM Eevee -------------------------
  const eeveesAntes = (await equipe(userId)).filter((p) => p.species_id === 'eevee').length
  const [a, b] = await Promise.all([
    comoJogador(token, 'coletar_anexo_correio', { p_mensagem_id: cartas[0].id }),
    comoJogador(token, 'coletar_anexo_correio', { p_mensagem_id: cartas[0].id }),
  ])
  const oks = [a, b].filter((r) => r.status < 300).length
  const eeveesDepois = (await equipe(userId)).filter((p) => p.species_id === 'eevee').length
  const criados = eeveesDepois - eeveesAntes

  if (equipeAntes.length >= 6) {
    checar('com o time cheio, nenhuma das duas coletas cria POKE', criados === 0, `criados: ${criados}`)
  } else {
    checar('duas coletas simultaneas: so UMA e aceita', oks === 1, `aceitas: ${oks}`)
    checar('e so UM Eevee entra na equipe', criados === 1, `criados: ${criados}`)
  }

  const falhou = casos.filter((c) => !c.ok)
  console.log(`\n${casos.length - falhou.length}/${casos.length} casos passaram.\n`)
  if (falhou.length > 0) process.exit(2)
}

main().catch((e) => {
  console.error(`\nbancada abortou: ${e.message}\n`)
  process.exit(2)
})
