// BANCADA: quanto UM FLUSH custa no fio, leitura por leitura.
//
//   npm run build:engine        (nao e necessario — esta bancada nao usa o motor)
//   node scripts/harness/egress-por-flush.mjs
//   node scripts/harness/egress-por-flush.mjs --schema=public --user=<uuid>
//
// POR QUE ESTA E SEPARADA DE `egress-do-boot.mjs` (PH-333)
// -----------------------------------------------------------------------------
// A do boot mede o que acontece UMA vez por sessao. Esta mede o que acontece a
// cada 30 segundos, para sempre, por jogador online — e e por isso que o flush,
// e nao o boot, e quem decide a conta do mes. As duas medicoes de PH-185/186
// atacaram justamente isto e derrubaram o egress de PostgREST de ~425 MB/dia
// pra ~40 MB/dia; esta bancada existe pra a proxima pessoa poder conferir se
// ainda esta la, em vez de reabrir a investigacao.
//
// MEDIR GZIPADO, e nao bruto. O PostgREST serve comprimido e o egress e cobrado
// no fio. Byte cru ja superestimou um ganho em 4x neste projeto. Como o `fetch`
// do Node descomprime sozinho, o numero aqui e recompressao local — mesma
// convencao de `egress-do-boot.mjs`.
//
// O QUE ELA NAO MEDE, e faz diferenca: o `player_pokedex` do flush REAL nao le a
// Pokedex inteira (PH-186) — le so as especies que a janela vai gravar, 2 a 5
// numa janela tipica. A coluna "tudo" abaixo esta ali como referencia do que
// seria pago sem aquele corte, nao como custo atual.
//
// O CORTE QUE DECIDE A ORDEM DE GRANDEZA e `comBag`
// (`authority/src/progresso.ts#lerSnapshot`): cliente que declara
// `parcial: true` no corpo do flush faz o servidor ler SO a equipe. Esta bancada
// mostra os dois lados na mesma corrida, porque a diferenca entre eles e de 16x
// e ela desaparece silenciosamente se alguem mexer no `parcial`.
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
const URL_BASE = env.SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const SCHEMA = opcao('schema', 'dev')

if (!URL_BASE || !SERVICE) {
  console.error('Faltou SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env da raiz.')
  process.exit(1)
}

// As mesmas listas de coluna que `authority/src/progresso.ts` usa. Copiadas, e
// nao importadas, porque este arquivo roda sem build — se elas divergirem, o
// numero aqui passa a ser otimista, e e por isso que estao nomeadas.
const COLUNAS_ITENS = 'user_id,item_id,quantity,locked'
const COLUNAS_POKEDEX = 'user_id,species_id,normal_kills,shiny_kills'
const COLUNAS_AUTO_CATCH = 'user_id,species_id,ball_item_id'

async function pedir(caminho) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Accept-Profile': SCHEMA,
      Prefer: 'count=exact',
    },
  })
  const texto = await r.text()
  let linhas = null
  try {
    const j = JSON.parse(texto)
    linhas = Array.isArray(j) ? j.length : 1
  } catch { /* corpo de erro nao e JSON de array */ }
  return { status: r.status, texto, gz: gzipSync(Buffer.from(texto)).length, linhas }
}

function linha(rotulo, m) {
  const aviso = m.status >= 400 ? `  <-- HTTP ${m.status}` : ''
  console.log(
    `  ${rotulo.padEnd(34)} ${String(m.gz).padStart(7)} B gz `
    + `${String(m.texto.length).padStart(9)} B cru `
    + `${String(m.linhas ?? '?').padStart(6)} linhas${aviso}`,
  )
}

async function jogadorMaisPesado() {
  const escolhido = opcao('user', null)
  if (escolhido) return escolhido
  // O jogador com mais POKE e o pior caso, e pior caso e o que interessa medir.
  const r = await pedir('pokemon_instances?select=user_id&limit=2000')
  const porUsuario = new Map()
  for (const l of JSON.parse(r.texto)) porUsuario.set(l.user_id, (porUsuario.get(l.user_id) ?? 0) + 1)
  const [maior] = [...porUsuario.entries()].sort((a, b) => b[1] - a[1])
  if (!maior) {
    console.error(`Nenhum POKE em ${SCHEMA} — passe --user=<uuid> ou rode contra o outro schema.`)
    process.exit(1)
  }
  return maior[0]
}

const USER = await jogadorMaisPesado()
console.log(`\nBancada de egress POR FLUSH — schema ${SCHEMA}, jogador ${USER}\n`)

console.log('--- o que o flush le em TODA janela (cliente moderno, parcial: true) ---')
const doFlush = {
  players: await pedir(`players?user_id=eq.${USER}&select=*`),
  // MESMO filtro de `appSessao.ts#sessaoAberta`. `closed_at=is.null` nao e
  // detalhe: sem ele a consulta devolve o HISTORICO de sessoes do jogador (37
  // linhas, 4.370 B gz na conta medida) em vez da unica aberta — e o numero da
  // bancada passaria a crescer com a idade da conta, o que faria parecer
  // regressao de egress onde nao ha nenhuma. Foi o primeiro erro desta bancada.
  game_sessions: await pedir(
    `game_sessions?user_id=eq.${USER}&closed_at=is.null&select=*,sala_protetor(*)&order=started_at.desc`,
  ),
  player_items: await pedir(`player_items?user_id=eq.${USER}&select=${COLUNAS_ITENS}`),
  player_especialidades: await pedir(`player_especialidades?user_id=eq.${USER}&select=*`),
  player_auto_catch_rules: await pedir(`player_auto_catch_rules?user_id=eq.${USER}&select=${COLUNAS_AUTO_CATCH}`),
  'pokemon_instances (team)': await pedir(`pokemon_instances?user_id=eq.${USER}&location=eq.team&select=*&order=id`),
}
for (const [k, m] of Object.entries(doFlush)) linha(k, m)
const totalFlush = Object.values(doFlush).reduce((s, m) => s + m.gz, 0)
console.log(`  ${'TOTAL por flush'.padEnd(34)} ${String(totalFlush).padStart(7)} B gz  (~${(totalFlush / 1024).toFixed(1)} KB)`)

console.log('\n--- os dois cortes que sustentam esse numero, e o que eles evitam ---')
const semCortes = {
  'pokemon_instances (team+bag)': await pedir(`pokemon_instances?user_id=eq.${USER}&select=*&order=id`),
  'player_pokedex (INTEIRA)': await pedir(`player_pokedex?user_id=eq.${USER}&select=${COLUNAS_POKEDEX}`),
}
for (const [k, m] of Object.entries(semCortes)) linha(k, m)
const soTeam = doFlush['pokemon_instances (team)'].gz
const teamMaisBag = semCortes['pokemon_instances (team+bag)'].gz
console.log(
  `  comBag (PH-182): ${(teamMaisBag / Math.max(1, soTeam)).toFixed(1)}x mais caro sem o corte`
  + `\n  comDex (PH-186): a Pokedex inteira custa ${semCortes['player_pokedex (INTEIRA)'].gz} B gz;`
  + ' o flush le so as especies que a janela grava (2 a 5 numa janela tipica).',
)

console.log('\n--- extrapolacao ---')
const POR_DIA = Number(opcao('flushes', '9000'))
console.log(
  `  ${POR_DIA} flushes/dia x ${totalFlush} B = ${(totalFlush * POR_DIA / 1024 / 1024).toFixed(1)} MB/dia`
  + `\n  (contagem de flushes medida nos logs: \`select count() from logs where source='edge_logs'`
  + `\n   and log_attributes['request.path']='/rest/v1/rpc/gravar_flush_de_sessao'\`)`,
)
console.log(
  '\n  SEM o corte de comBag o mesmo dia custaria '
  + `${((totalFlush - soTeam + teamMaisBag) * POR_DIA / 1024 / 1024).toFixed(1)} MB/dia.`,
)
