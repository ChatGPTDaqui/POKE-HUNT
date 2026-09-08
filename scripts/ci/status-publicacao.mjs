// Consulta única: run + artefato do SHA solicitado (default: main atual).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim()
const repo = 'ChatGPTDaqui/POKE-HUNT'
const commit = process.argv[2] || JSON.parse(gh('api', `repos/${repo}/commits/main`)).sha
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Informe SHA completo de 40 caracteres')
const runs = JSON.parse(gh('api', `repos/${repo}/actions/workflows/supabase-deploy.yml/runs?head_sha=${commit}&per_page=5`)).workflow_runs
const run = runs[0]
if (!run) console.log(JSON.stringify({ commit, status: 'not-started' }))
else if (run.status !== 'completed') console.log(JSON.stringify({ commit, status: run.status, url: run.html_url }))
else {
  try {
    const directory = mkdtempSync(join(tmpdir(), 'poke-publicacao-'))
    gh('run', 'download', String(run.id), '--repo', repo, '--name', 'publicacao-status', '--dir', directory)
    const result = JSON.parse(readFileSync(join(directory, 'publicacao-status.json'), 'utf8'))
    if (result.commit !== commit) throw new Error('Artefato de outro commit')
    console.log(JSON.stringify({ ...result, conclusion: run.conclusion, url: run.html_url }, null, 2))
  } catch {
    console.log(JSON.stringify({ commit, status: 'status-unavailable', conclusion: run.conclusion, url: run.html_url }))
    process.exitCode = 1
  }
}
