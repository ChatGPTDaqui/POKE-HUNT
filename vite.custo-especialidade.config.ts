// PH-246 — build SSR do gerador de custo de especialidade.
//
// POR QUE UM BUILD, E NAO UM `node scripts/*.mjs` DIRETO: o custo de cada tipo
// sai da OFERTA de Stone daquele tipo, e a oferta so existe depois que
// `huntSpawnOverrides.ts` monta os `enemyPool` — codigo TS com alias `@/`, que
// Node nao carrega sozinho.
//
// A alternativa tentada primeiro foi estimar a oferta em Node lendo
// `subBiomas.generated.ts`. Ela erra: o pool de uma hunt e a uniao das salas do
// bioma, entao dilui a concentracao de um sub-bioma isolado. Medido, a
// estimativa dizia 1,01x de diferenca entre os tipos e a realidade era 39,7x.
// Rodar o gerador contra o runtime de verdade e mais encanamento e menos
// mentira.
//
// A saida e gitignored (`scripts/.gerado/`): o que vai pro git sao os arquivos
// que o gerador ESCREVE, nao o bundle dele.
import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  publicDir: false,
  ssr: { noExternal: true },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  build: {
    ssr: 'scripts/gerar-custo-de-especialidade.ts',
    outDir: 'scripts/.gerado',
    emptyOutDir: true,
    target: 'es2023',
    minify: false,
    // `.mjs`, e nao `.js`: `scripts/package.json` declara `"type": "commonjs"`
    // de proposito (os scripts de pipeline usam `require`), e a saida cai
    // debaixo dele. Com `.js` o Node tenta carregar este bundle como CommonJS
    // e para no primeiro `import`.
    rollupOptions: { output: { entryFileNames: '[name].mjs' } },
  },
})
