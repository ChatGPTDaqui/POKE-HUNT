// Gera o par public/dev da fundacao de conquistas a partir de um molde so.
//
//   node scripts/conquistas/gerar-fundacao.mjs <timestamp-public> <timestamp-dev>
//
// Molde e nao copia a mao: as duas versoes precisam ser identicas fora o schema,
// e editar duas vezes e o jeito classico de elas divergirem.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const molde = readFileSync(join(raiz, 'scripts/conquistas/molde-fundacao.sql'), 'utf8')
const [tsPublic, tsDev] = process.argv.slice(2)
if (!tsPublic || !tsDev) {
  console.error('uso: node scripts/conquistas/gerar-fundacao.mjs <timestamp-public> <timestamp-dev>')
  process.exit(1)
}

for (const [schema, searchPath, ts] of [['public', 'public', tsPublic], ['dev', 'dev, public', tsDev]]) {
  const sql = molde.replaceAll('__SP__', searchPath).replaceAll('__S__', schema)
  const arquivo = join(raiz, 'supabase/migrations', `${ts}_conquistas_fundacao_${schema}.sql`)
  writeFileSync(arquivo, sql)
  console.log(arquivo)
}
