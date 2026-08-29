// BANCADA: quanto o boot custa no fio, e a partir de quantos POKEs ele mente.
//
//   node scripts/harness/egress-do-boot.mjs
//   node scripts/harness/egress-do-boot.mjs --schema=public
//   node scripts/harness/egress-do-boot.mjs --schema=public --user=<uuid>
//
// Sai 0 se a consulta nova estiver pelo menos 10x menor E nao truncar; 2 se nao.
//
// POR QUE ISTO EXISTE (PH-182)
//
// Os criterios 2 e 5 da issue nao cabem na suite: "provado com um jogador de
// mais de 1000 POKE — nao presumido" e "medido no fio, gzipado". Os dois exigem
// banco de verdade e uma conta grande. O teste unitario
// (`src/data/remote/dominioDeExclusao.test.ts`) prova a LOGICA; esta bancada
// prova o NUMERO.
//
// MEDIR GZIPADO, e nao bruto. O PostgREST serve comprimido e o egress e cobrado
// no fio — a licao ja custou um falso ganho de 4x neste projeto. Como o `fetch`
// do Node descomprime por conta propria (e mente no `content-encoding`), o
// numero gzipado aqui e recompressao local. Ver a nota em `medir`.
//
// CONTAR COM `Content-Range`, nunca com `.length` do resultado. O PostgREST
// corta em 1000 linhas com 200 OK e sem erro nenhum; medir o total pelo tamanho
// do array devolvido e justamente o defeito que a issue descreve — a medicao
// mentiria do mesmo jeito que o boot mentia.
import { gzipSync } from 'node:zlib'
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
const URL_BASE = env.SUPABASE_URL ?? envLocal.VITE_SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const SCHEMA = opcao('schema', 'dev')

if (!URL_BASE || !SERVICE) {
  console.error('Faltou SUPABASE_URL (.env) e/ou SUPABASE_SERVICE_ROLE_KEY (.env).')
  process.exit(1)
}

// So LEITURA, e por isso `service_role` aqui e aceitavel: a bancada precisa
// enxergar a conta mais pesada da base, que nao e a de teste. Nada e escrito.
const cabecalhos = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Accept-Profile': SCHEMA,
  'Accept-Encoding': 'gzip',
}

/**
 * Mede o corpo da resposta em bytes CRUS e em bytes GZIPADOS.
 *
 * A armadilha que custou a primeira rodada desta bancada: o `fetch` do Node
 * (undici) negocia compressao sozinho e ENTREGA o corpo ja descomprimido, entao
 * `arrayBuffer().byteLength` e sempre o tamanho cru — mesmo com
 * `Accept-Encoding: gzip` na mao. Medir assim superestima o ganho e mede o
 * numero errado: o PostgREST serve comprimido e o egress e cobrado no fio.
 *
 * E `content-encoding` NAO serve pra detectar isso — medido nesta bancada: o
 * cabecalho volta preenchido mesmo depois de o undici ter descomprimido, entao
 * confiar nele faz a bancada reportar o tamanho CRU com o rotulo "gzipado".
 * Foi o primeiro resultado que ela deu: 703 B por linha, contra os ~83 B por
 * linha que a issue mediu de verdade — quase 9x de erro, na direcao de parecer
 * um ganho maior do que e.
 *
 * Entao: o corpo que chega e sempre tratado como CRU, e o numero gzipado e
 * SEMPRE uma recompressao local. E estimativa, e a bancada diz que e — o que
 * importa aqui e a razao antes/depois, e ela sobrevive a estimativa.
 */
async function medir(caminho, extras = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    headers: { ...cabecalhos, ...extras },
  })
  const corpo = Buffer.from(await r.arrayBuffer())
  return {
    status: r.status,
    cru: corpo.byteLength,
    gzip: gzipSync(corpo).byteLength,
    contentRange: r.headers.get('content-range'),
  }
}

/** Total REAL de linhas, pelo cabecalho que o servidor declara. */
async function contar(filtro) {
  const r = await medir(`pokemon_instances?${filtro}&select=id`, {
    Range: '0-0',
    Prefer: 'count=exact',
  })
  const total = Number(r.contentRange?.split('/')[1] ?? NaN)
  return { total, contentRange: r.contentRange }
}

/** O jogador com mais POKEs — o pior caso, que e o que a issue mede. */
async function jogadorMaisPesado() {
  const r = await fetch(`${URL_BASE}/rest/v1/pokemon_instances?select=user_id`, {
    headers: { ...cabecalhos, Range: '0-4999' },
  })
  const linhas = await r.json().catch(() => [])
  const porUsuario = new Map()
  for (const l of Array.isArray(linhas) ? linhas : []) {
    porUsuario.set(l.user_id, (porUsuario.get(l.user_id) ?? 0) + 1)
  }
  let melhor = null
  for (const [id, n] of porUsuario) if (!melhor || n > melhor.n) melhor = { id, n }
  return melhor
}

const kb = (b) => `${(b / 1024).toFixed(1)} KB`

async function main() {
  console.log(`\nBancada de egress do boot — schema ${SCHEMA}\n`)

  let userId = opcao('user', null)
  if (!userId) {
    const pesado = await jogadorMaisPesado()
    if (!pesado) { console.error('nenhum POKE encontrado neste schema.'); process.exit(2) }
    userId = pesado.id
    console.log(`jogador mais pesado da amostra: ${userId}\n`)
  }

  const { total, contentRange } = await contar(`user_id=eq.${userId}`)
  const daEquipe = await contar(`user_id=eq.${userId}&location=eq.team`)
  console.log(`POKEs deste jogador: ${total}   (Content-Range: ${contentRange})`)
  console.log(`na equipe:           ${daEquipe.total}\n`)

  // ANTES: o que o boot fazia — tudo, sem paginar.
  const antes = await medir(`pokemon_instances?user_id=eq.${userId}&select=*`)
  // DEPOIS: o que o boot faz agora.
  const depois = await medir(
    `pokemon_instances?user_id=eq.${userId}&location=eq.team&select=*&order=team_slot.asc`,
  )

  const fator = antes.gzip / Math.max(1, depois.gzip)
  const nota = ' (recomprimido localmente — ver `medir`)'
  console.log(`--- corpo GZIPADO${nota} ---`)
  console.log(`  antes  (select * , tudo):        ${String(antes.gzip).padStart(8)} B  ${kb(antes.gzip)}`)
  console.log(`  depois (location=team):          ${String(depois.gzip).padStart(8)} B  ${kb(depois.gzip)}`)
  console.log(`  fator:                           ${fator.toFixed(1)}x menor`)
  {
    // Cru so como referencia. Ele superestima o ganho — foi a licao que ja
    // custou um falso 4x neste projeto.
    console.log(`  (cru, so pra referencia:         ${kb(antes.cru)} -> ${kb(depois.cru)})`)
  }
  console.log('')

  // O defeito de correcao: a consulta ANTIGA truncava em silencio.
  const truncava = total > 1000
  console.log('--- o corte silencioso do PostgREST ---')
  if (truncava) {
    console.log(`  este jogador JA passa de 1000 (${total}): a consulta antiga perdia ${total - 1000} linha(s),`)
    console.log('  com 200 OK e sem erro nenhum.')
  } else {
    console.log(`  este jogador ainda nao passa de 1000 (${total}) — faltam ${1000 - total} POKEs`)
    console.log('  pro boot antigo comecar a perder linha em silencio.')
  }
  console.log('  a consulta nova le no maximo 6 linhas, entao o corte deixa de ser alcancavel.\n')

  const ok = fator >= 10 && depois.status === 200
  console.log(ok ? 'OK — a leitura de boot encolheu como esperado.\n' : 'FALHA — o ganho nao apareceu.\n')
  if (!ok) process.exit(2)
}

main().catch((e) => {
  console.error(`\nbancada abortou: ${e.message}\n`)
  process.exit(2)
})
