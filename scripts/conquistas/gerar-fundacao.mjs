// Gera o par public/dev da fundacao de conquistas a partir de um molde so.
//
//   node scripts/conquistas/gerar-fundacao.mjs <timestamp-public> <timestamp-dev> [molde] [nome]
//
// Sem [molde]/[nome], gera a fundacao (molde-fundacao.sql -> conquistas_fundacao).
// Ex.: node scripts/conquistas/gerar-fundacao.mjs 20261014140000 20261014140001 molde-titulos.sql conquistas_titulos
//
// Molde e nao copia a mao: as duas versoes precisam ser identicas fora o schema,
// e editar duas vezes e o jeito classico de elas divergirem.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const [tsPublic, tsDev, arquivoDoMolde = 'molde-fundacao.sql', nome = 'conquistas_fundacao'] = process.argv.slice(2)
const molde = readFileSync(join(raiz, 'scripts/conquistas', arquivoDoMolde), 'utf8')
if (!tsPublic || !tsDev) {
  console.error('uso: node scripts/conquistas/gerar-fundacao.mjs <timestamp-public> <timestamp-dev>')
  process.exit(1)
}

for (const [schema, searchPath, ts] of [['public', 'public', tsPublic], ['dev', 'dev, public', tsDev]]) {
  const sql = molde.replaceAll('__SP__', searchPath).replaceAll('__S__', schema)
  const arquivo = join(raiz, 'supabase/migrations', `${ts}_${nome}_${schema}.sql`)
  writeFileSync(arquivo, sql)
  console.log(arquivo)
}
