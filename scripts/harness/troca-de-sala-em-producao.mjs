// PH-495 — QUANTO TEMPO a sala leva pra trocar em producao, medido.
//
// POR QUE ISTO EXISTE
// ---------------------------------------------------------------------------
// O relato foi "ao completar 30 abates nao esta mudando de sala". Ele tem DUAS
// leituras que exigem trabalhos opostos, e nenhuma se decide olhando codigo:
//
//   1. E A ESPERA NORMAL, lida como travamento. Sob autoridade quem decide a
//      sala e o servidor, e o cliente so descobre no flush seguinte. A bancada
//      `troca-de-sala-sob-autoridade.mjs` mediu isso NO MOTOR (48 trocas, 8
//      sementes): mediana de 33,0s com a barra cheia. Se e isso, o trabalho e
//      de FEEDBACK — a espera precisa de contagem visivel, nao de um texto
//      estatico.
//   2. E TRAVAMENTO DE VERDADE, e ai ha um bug de avanco de sala pra cacar.
//
// A diferenca entre as duas e UM NUMERO, e este arquivo produz esse numero
// contra PRODUCAO — nao contra o motor headless, que e onde a bancada anterior
// mediu. Os dois ja discordaram por quase 6x neste projeto no dimensionamento
// da hunt inicial, entao medir no motor e concluir sobre producao seria repetir
// um erro conhecido.
//
// O QUE ELE NAO E: um gate de CI. Ele leva minutos de relogio de parede (a
// quota de 30 abates precisa acontecer de verdade, simulada pelo servidor a
// partir do tempo real decorrido) e roda contra a conta de teste. Rodar isto em
// toda promocao seria pagar minutos por uma pergunta que nao muda a cada
// deploy.
//
// COMO ELE MEDE. Abre uma hunt COM salas, e depois so faz o que o cliente faz:
// chama `/sessao/flush` na cadencia do jogo e le a `sala` que volta. Nao
// escreve nada no banco por fora, nao chama RPC de atalho e nao empurra abate
// nenhum — se ele precisasse fazer isso pra a sala andar, a medicao nao diria
// nada sobre o jogador.
//
// O VEREDITO E EXPLICITO, e ele existe pra ninguem ter que interpretar a saida:
//
//   ESPERA NORMAL   a sala trocou dentro de `TETO_DE_ESPERA_NORMAL_S`
//   LENTO           trocou, mas depois disso — vale investigar, nao e travamento
//   TRAVADA         a quota fechou e a sala nao trocou dentro do teto total
//   INCONCLUSIVO    nao deu pra chegar na quota no tempo do teste
//
// NAO IMPRIME SEGREDO: nem token, nem senha, nem o corpo do estado.
//
// FECHA A SESSAO SEMPRE, inclusive em erro — sessao aberta na conta de teste
// derruba a aba de quem estiver usando ela (trava de sessao dupla).
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
      m[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* ausente e caso tratado abaixo */ }
  return m
}

const env = lerEnv(join(RAIZ, '.env'))
const local = lerEnv(join(RAIZ, '.env.local'))
const doAmbiente = (nome) => {
  const v = process.env[nome]
  return v && v.trim() ? v.trim() : undefined
}

const URL_BASE = local.VITE_SUPABASE_URL || env.SUPABASE_URL || doAmbiente('VITE_SUPABASE_URL') || doAmbiente('SUPABASE_URL')
const ANON = local.VITE_SUPABASE_ANON_KEY || doAmbiente('VITE_SUPABASE_ANON_KEY')
const SENHA = env.CONTA_TESTE_SENHA || doAmbiente('CONTA_TESTE_SENHA')
const CONTA = 'claude@teste.pokehunt.local'
const ORIGEM = 'https://poke-hunt-euj.pages.dev'
const FUNCAO = 'jogo'

if (!URL_BASE || !ANON || !SENHA) {
  console.error('Falta VITE_SUPABASE_URL/SUPABASE_URL, VITE_SUPABASE_ANON_KEY ou CONTA_TESTE_SENHA')
  process.exit(1)
}

/**
 * A hunt medida. `campo_aberto_e1` porque ela TEM salas (a Rota 46 nao tem, e
 * mediria a ausencia do sistema inteiro) e porque o estagio 1 e sempre
 * liberado — um 403 de gate aqui nao pode ser confundido com sala travada.
 */
const HUNT = 'campo_aberto_e1'

/** Cadencia do cliente de verdade. Flush mais rapido nao acelera o jogo: o
 *  servidor credita o tempo REAL decorrido desde o ultimo flush. */
const INTERVALO_DE_FLUSH_MS = 20_000

/** A regua do veredito, em segundos com a quota JA fechada. */
const TETO_DE_ESPERA_NORMAL_S = 45
/** Teto total antes de declarar travada. */
const TETO_TOTAL_DE_ESPERA_S = 240
/** Teto pra CHEGAR na quota. Passou disso, o teste nao mediu o que queria. */
const TETO_PARA_FECHAR_QUOTA_S = 900

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const agora = () => Date.now()
const seg = (ms) => (ms / 1000).toFixed(1)

async function entrar() {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json', Origin: ORIGEM },
    body: JSON.stringify({ email: CONTA, password: SENHA }),
  })
  const j = await r.json()
  if (!r.ok) {
    const e = new Error(`login HTTP ${r.status}`)
    if (r.status === 400 || r.status === 401 || r.status === 403) e.inconclusivo = true
    throw e
  }
  return j.access_token
}

let cabecalhos = null

async function fecharSessao() {
  if (!cabecalhos) return
  try {
    await fetch(`${URL_BASE}/functions/v1/${FUNCAO}/sessao/fechar`, {
      method: 'POST', headers: cabecalhos, body: JSON.stringify({ parcial: true }),
    })
  } catch { /* limpeza nao mascara a falha real */ }
}

async function medir() {
  const token = await entrar()
  cabecalhos = {
    apikey: ANON, Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json', Origin: ORIGEM,
  }
  console.log(`Banco: ${URL_BASE}`)
  console.log(`Conta: ${CONTA}`)
  console.log(`Hunt:  ${HUNT}\n`)

  // Cura antes de abrir, mesma razao de `abrir-hunt-em-producao.mjs`: POKE
  // desmaiado faz `sessao/abrir` recusar com 409 antes de qualquer gate, e a
  // conta de teste vive desmaiada.
  await fetch(`${URL_BASE}/rest/v1/rpc/curar_equipe`, { method: 'POST', headers: cabecalhos, body: '{}' })
  const est = await (await fetch(`${URL_BASE}/functions/v1/${FUNCAO}/estado`, { headers: cabecalhos })).json()
  const equipe = est?.estado?.team ?? []
  if (!equipe.length || equipe[0].hp <= 0) {
    console.log('INCONCLUSIVO: a conta de teste esta sem POKE em pe.')
    return 2
  }
  console.log(`POKE: ${equipe[0].speciesId} Lv${equipe[0].level}, HP ${equipe[0].hp}`)

  // Sessao anterior pendurada faria a abertura herdar sala e sujar a medida.
  await fecharSessao()

  const ab = await fetch(`${URL_BASE}/functions/v1/${FUNCAO}/sessao/abrir`, {
    method: 'POST', headers: cabecalhos,
    body: JSON.stringify({ mapId: HUNT, pokeUid: equipe[0].uid, retomando: false }),
  })
  if (!ab.ok) {
    console.log(`INCONCLUSIVO: sessao/abrir devolveu HTTP ${ab.status}`)
    return 2
  }
  const aberta = await ab.json()
  const salaInicial = aberta?.sala ?? null
  console.log(`Sala inicial: indice ${salaInicial?.indice ?? '?'}, abates ${salaInicial?.abates ?? '?'}\n`)

  const inicio = agora()
  let quotaFechouEm = null
  let indiceDeReferencia = salaInicial?.indice ?? null
  let ultimoAbates = salaInicial?.abates ?? 0
  let flushes = 0

  for (;;) {
    await dormir(INTERVALO_DE_FLUSH_MS)
    const t0 = agora()
    const r = await fetch(`${URL_BASE}/functions/v1/${FUNCAO}/sessao/flush`, {
      method: 'POST', headers: cabecalhos, body: JSON.stringify({ parcial: true }),
    })
    flushes++
    if (!r.ok) {
      console.log(`  flush #${flushes}: HTTP ${r.status} em ${seg(agora() - t0)}s — nao conta pra medida`)
      if (agora() - inicio > TETO_PARA_FECHAR_QUOTA_S * 1000) return 2
      continue
    }
    const j = await r.json()
    const sala = j?.sala ?? j?.estado?.sala ?? null
    const indice = sala?.indice ?? null
    const abates = sala?.abates ?? 0
    const decorrido = agora() - inicio

    console.log(
      `  flush #${flushes} (${seg(decorrido)}s): sala ${indice}, abates ${abates}/30`
      + (quotaFechouEm != null ? `  [quota fechada ha ${seg(agora() - quotaFechouEm)}s]` : ''),
    )

    // A SALA TROCOU. E o unico desfecho que produz o numero que a issue pede.
    if (indiceDeReferencia != null && indice != null && indice !== indiceDeReferencia) {
      if (quotaFechouEm == null) {
        // Trocou sem o teste ver a quota cheia — normal: o abate 30 e a troca
        // podem cair no MESMO flush. Nesse caso o que da pra afirmar e o teto.
        console.log(`\nA sala trocou (${indiceDeReferencia} -> ${indice}) sem passar por um flush com a quota cheia.`)
        console.log(`Isso significa que a espera coube dentro de UM intervalo de flush (${INTERVALO_DE_FLUSH_MS / 1000}s).`)
        return 0
      }
      const espera = (agora() - quotaFechouEm) / 1000
      console.log(`\nA sala trocou (${indiceDeReferencia} -> ${indice}) apos ${espera.toFixed(1)}s com a quota fechada.`)
      return espera <= TETO_DE_ESPERA_NORMAL_S ? 0 : 3
    }

    if (abates >= 30 && quotaFechouEm == null) quotaFechouEm = agora()
    ultimoAbates = abates

    if (quotaFechouEm != null && agora() - quotaFechouEm > TETO_TOTAL_DE_ESPERA_S * 1000) {
      console.log(`\nTRAVADA: ${TETO_TOTAL_DE_ESPERA_S}s com a quota fechada e a sala nao trocou.`)
      return 1
    }
    if (quotaFechouEm == null && decorrido > TETO_PARA_FECHAR_QUOTA_S * 1000) {
      console.log(`\nINCONCLUSIVO: ${TETO_PARA_FECHAR_QUOTA_S}s e a quota nao fechou (parou em ${ultimoAbates}/30).`)
      console.log('O POKE da conta de teste pode estar fraco demais pra hunt, ou morrendo em laco.')
      return 2
    }
  }
}

let codigo = 1
try {
  codigo = await medir()
} catch (e) {
  console.error(`\nERRO: ${e.message}`)
  codigo = e.inconclusivo ? 2 : 1
} finally {
  await fecharSessao()
}

console.log(
  codigo === 0 ? '\n=== ESPERA NORMAL — a sala troca dentro do esperado ==='
  : codigo === 3 ? '\n=== LENTO — a sala troca, mas demora mais que o teto. Ver o numero acima ==='
  : codigo === 2 ? '\n=== INCONCLUSIVO — o teste nao chegou a medir a troca ==='
  : '\n=== TRAVADA — a quota fechou e a sala nao trocou ===',
)

// `process.exitCode` e nao `process.exit()`: com sockets do `fetch` abertos o
// Windows aborta com 3221226505 no lugar do codigo real (licao da PH-463).
process.exitCode = codigo
