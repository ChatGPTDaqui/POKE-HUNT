import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function planejar(baseFiles, changes) {
  const migrations = changes.filter(c => c.path.startsWith('supabase/migrations/'))
  if (migrations.some(c => c.status !== 'A')) throw new Error('Migration histórica não pode ser alterada, removida ou renomeada')
  const versions = baseFiles.map(p => p.split('/').at(-1).slice(0, 14))
  const newest = versions.sort().at(-1) ?? ''
  const seen = new Set(versions)
  for (const c of migrations) {
    const name = c.path.split('/').at(-1)
    const version = name.slice(0, 14)
    if (!/^\d{14}_.+\.sql$/.test(name) || version <= newest || seen.has(version)) throw new Error(`Timestamp inválido, repetido ou anterior à base: ${name}`)
    seen.add(version)
    const side = name.match(/_(dev|public)\.sql$/)?.[1]
    if (side) {
      const pair = name.slice(15).replace(/_(dev|public)\.sql$/, `_${side === 'dev' ? 'public' : 'dev'}.sql`)
      if (!migrations.some(other => other.path.split('/').at(-1).slice(15) === pair)) throw new Error(`Falta par dev/public para ${name}`)
    } else if (/\b(public|dev)\./.test(c.sql ?? '') && !(/\bpublic\./.test(c.sql) && /\bdev\./.test(c.sql))) {
      throw new Error(`Migration do jogo precisa do par nomeado _dev/_public ou cobrir os dois schemas: ${name}`)
    }
  }
  return { migrations: migrations.map(c => c.path), schema: migrations.length > 0 || changes.some(c => c.path === 'src/lib/database.types.ts'),
    harness: changes.some(c => c.path.startsWith('scripts/ci/schema-') || c.path === '.github/workflows/supabase-check.yml') }
}

export function conferirBaseAplicada(baseFiles, remoteVersions) {
  const expected = new Set(baseFiles.map(p => p.split('/').at(-1).slice(0, 14)))
  const actual = new Set(remoteVersions)
  if (expected.size !== actual.size || [...expected].some(v => !actual.has(v))) throw new Error('Banco não corresponde às migrations da base; aguarde o deploy ou reconcilie a divergência antes da PR de schema')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  const base = process.env.SCHEMA_BASE || 'origin/dev'
  const baseFiles = git('ls-tree', '-r', '--name-only', base, '--', 'supabase/migrations/')
  if (process.argv[2] === 'baseline') {
    const list = JSON.parse(readFileSync('schema-remote.json', 'utf8'))
    if (!Array.isArray(list.migrations)) throw new Error('CLI não retornou migrations')
    conferirBaseAplicada(baseFiles, list.migrations.map(m => m.remote).filter(Boolean))
  } else {
    const changes = git('diff', '--name-status', '--no-renames', `${base}...HEAD`).map(line => {
      const [status, path] = line.split('\t')
      return { status, path, sql: path.startsWith('supabase/migrations/') && status === 'A' ? readFileSync(path, 'utf8') : '' }
    })
    const plan = planejar(baseFiles, changes)
    writeFileSync('schema-plan.json', JSON.stringify(plan))
    writeFileSync('schema-new.txt', plan.migrations.join('\n') + (plan.migrations.length ? '\n' : ''))
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `schema=${plan.schema}\nharness=${plan.harness}\n`)
    console.log(JSON.stringify(plan))
  }
}
