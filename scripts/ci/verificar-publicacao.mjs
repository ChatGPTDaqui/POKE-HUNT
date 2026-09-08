import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function resumir({ commit, migrations, edge, smokes, client }) {
  const status = migrations !== 'success' || edge !== 'success' ? 'deployment-failure'
    : smokes?.status === 'functional-failure' ? 'functional-failure'
      : smokes?.status !== 'verified' ? 'configuration-inconclusive'
        : client?.status !== 'verified' ? 'client-pending' : 'verified'
  return { version: 1, commit, status, migrations, edge, smokes: smokes ?? { status: 'not-run' }, client: client ?? { status: 'not-run' } }
}

export async function conferirCliente(commit, { request = fetch, wait = ms => new Promise(r => setTimeout(r, ms)), attempts = 20, origin = 'https://poke-hunt-euj.pages.dev' } = {}) {
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('Commit esperado inválido')
  let observedCommit = null
  for (let n = 0; n < attempts; n++) {
    try {
      const get = async path => {
        const response = await request(`${origin}${path}${path.includes('?') ? '&' : '?'}verificar=${commit}-${n}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response
      }
      const info = await (await get('/build-info.json')).json()
      observedCommit = info.commit ?? null
      if (info.commit === commit && /^\/build\/[A-Za-z0-9_-]+\.js$/.test(info.entry) && /^[a-f0-9]{64}$/.test(info.sha256)) {
        const html = await (await get('/')).text()
        if (html.includes(`src="${info.entry}"`) || html.includes(`src='${info.entry}'`)) {
          const code = await (await get(info.entry)).arrayBuffer()
          if (createHash('sha256').update(Buffer.from(code)).digest('hex') === info.sha256) return { status: 'verified', observedCommit, entry: info.entry, attempts: n + 1 }
        }
      }
    } catch { /* Propagação, HTML fallback ou rede: permanece pendente, sem falso sucesso. */ }
    if (n + 1 < attempts) await wait(30000)
  }
  return { status: 'client-pending', observedCommit, attempts }
}

export async function conferirBancadas({ env = process.env, run = file => spawnSync(process.execPath, [file], { stdio: 'inherit', timeout: 180000 }).status, wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  if (['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'CONTA_TESTE_SENHA'].some(k => !env[k]?.trim())) return { status: 'configuration-inconclusive', reason: 'missing-credentials', results: [] }
  const results = []
  for (const file of ['scripts/harness/fumaca-de-producao.mjs', 'scripts/harness/abrir-hunt-em-producao.mjs']) {
    let code = run(file)
    if (code !== 0 && code !== 2) { await wait(15000); code = run(file) }
    results.push({ file, code, status: code === 0 ? 'verified' : code === 2 ? 'configuration-inconclusive' : 'functional-failure' })
  }
  const status = results.some(r => r.status === 'functional-failure') ? 'functional-failure'
    : results.some(r => r.status === 'configuration-inconclusive') ? 'configuration-inconclusive' : 'verified'
  return { status, results }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2]
  let result
  if (mode === 'smokes') result = await conferirBancadas()
  else if (mode === 'client') result = await conferirCliente(process.env.GITHUB_SHA)
  else if (mode === 'resumo') {
    const read = file => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
    result = resumir({ commit: process.env.GITHUB_SHA, migrations: process.env.MIGRATIONS_OUTCOME,
      edge: process.env.EDGE_OUTCOME, smokes: read('smokes-result.json'), client: read('client-result.json') })
  } else throw new Error('Modo esperado: smokes, client ou resumo')
  const file = mode === 'resumo' ? 'publicacao-status.json' : `${mode}-result.json`
  writeFileSync(file, JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Publicação: ${result.status}\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`)
  if (result.status === 'functional-failure' || result.status === 'deployment-failure') process.exitCode = 1
}
