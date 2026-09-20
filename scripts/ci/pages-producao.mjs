// Deployments de PRODUCAO do Cloudflare Pages (projeto poke-hunt) e retry do
// ultimo que falhou.
//
//   node scripts/ci/pages-producao.mjs            # lista os ultimos deployments de producao
//   node scripts/ci/pages-producao.mjs --retry    # refaz o ultimo de producao se ele falhou
//
// Por que existe (PH-566): em 20/09/2026 o deploy de producao de `main` falhou
// em `clone_repo` (infra do Cloudflare) e nada avisou — o check "Cloudflare
// Pages" no commit mostrava o build da branch `sync/main-para-dev-*` (mesmo
// sha, mesmo nome de check, o ultimo sobrescreve) e `status-publicacao.mjs`
// so dizia `client-pending`. Producao ficou 1 h servindo o bundle anterior.
// Le CLOUDFLARE_API_TOKEN do .env raiz (ou do ambiente).
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CONTA = 'afcba46ce039e450a9136dc96e8032b1'
const PROJETO = 'poke-hunt'
const BASE = `https://api.cloudflare.com/client/v4/accounts/${CONTA}/pages/projects/${PROJETO}/deployments`

function lerEnv(caminho) {
  if (!existsSync(caminho)) return {}
  const env = {}
  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    const t = linha.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return env
}

const token = process.env.CLOUDFLARE_API_TOKEN || lerEnv(join(RAIZ, '.env')).CLOUDFLARE_API_TOKEN
if (!token) {
  console.error('Faltando CLOUDFLARE_API_TOKEN (ambiente ou .env)')
  process.exit(1)
}

async function cf(caminho, init = {}) {
  const r = await fetch(`${BASE}${caminho}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } })
  const j = await r.json()
  if (!j.success) throw new Error(`Cloudflare ${r.status}: ${JSON.stringify(j.errors)}`)
  return j.result
}

function resumo(d) {
  const meta = d.deployment_trigger?.metadata ?? {}
  return {
    id: d.id,
    quando: d.created_on,
    ambiente: d.environment,
    branch: meta.branch ?? '',
    commit: (meta.commit_hash ?? '').slice(0, 7),
    etapa: d.latest_stage?.name ?? '',
    status: d.latest_stage?.status ?? '',
    url: d.url,
  }
}

const lista = (await cf('?per_page=25')).map(resumo)
const producao = lista.filter((d) => d.ambiente === 'production')
for (const d of producao.slice(0, 5)) {
  console.log(`${d.quando.slice(0, 19)}  ${d.branch.padEnd(12)} ${d.commit}  ${d.etapa}/${d.status}  ${d.id}`)
}

if (!process.argv.includes('--retry')) process.exit(0)

const ultimo = producao[0]
if (!ultimo) { console.log('Nenhum deployment de producao encontrado.'); process.exit(1) }
if (ultimo.status !== 'failure' && ultimo.status !== 'canceled') {
  console.log(`Ultimo deployment de producao (${ultimo.commit}) esta ${ultimo.etapa}/${ultimo.status}; nada a refazer.`)
  process.exit(0)
}

const novo = resumo(await cf(`/${ultimo.id}/retry`, { method: 'POST' }))
console.log(`Retry disparado: ${novo.id} (${novo.commit}) ${novo.etapa}/${novo.status}`)
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 15_000))
  const atual = resumo(await cf(`/${novo.id}`))
  console.log(`  ${atual.etapa}/${atual.status}`)
  if (atual.etapa === 'deploy' && atual.status === 'success') process.exit(0)
  if (atual.status === 'failure' || atual.status === 'canceled') process.exit(1)
}
console.log('Retry ainda em andamento apos 10 min; confira de novo.')
process.exit(1)
