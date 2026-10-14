// Gerador do catalogo de conquistas.
//
//   npm run conquistas:gerar -- <timestamp>     (ex.: 20261014130100)
//
// Escreve src/data/generated/conquistas.generated.ts e a migration
// supabase/migrations/<timestamp>_catalogo_de_conquistas.sql. Mudou o catalogo
// em src/data/conquistas.ts? Rode de novo com um timestamp NOVO (migration
// aplicada nao se edita) e commite os dois arquivos juntos.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sqlDoCatalogo, tsDoCatalogo } from './resolver'

const raiz = process.cwd()
const timestamp = process.argv[2]
if (!timestamp || !/^\d{14}$/.test(timestamp)) {
  console.error('uso: npm run conquistas:gerar -- <timestamp de 14 digitos>')
  process.exit(1)
}

writeFileSync(join(raiz, 'src/data/generated/conquistas.generated.ts'), tsDoCatalogo())
writeFileSync(
  join(raiz, 'supabase/migrations', `${timestamp}_catalogo_de_conquistas.sql`),
  [
    '-- Catalogo de conquistas — GERADO por `npm run conquistas:gerar` a partir de',
    '-- src/data/conquistas.ts (resolvido por scripts/conquistas/resolver.ts).',
    '-- Nao edite: scripts/conquistas/catalogo.test.ts compara esta migration com o autoral.',
    '-- Remover do catalogo uma conquista que alguem ja tem FALHA (FK sem cascade):',
    '-- conquista e permanente, e apagar desbloqueio precisa ser decisao explicita.',
    'begin;',
    '',
    sqlDoCatalogo(),
    'commit;',
    '',
  ].join('\n'),
)
console.log(`catalogo gerado (${timestamp})`)
