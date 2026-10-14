// Build SSR do gerador de conquistas (scripts/conquistas/gerar.ts).
//
// Mesmo motivo de vite.custo-especialidade.config.ts: o catalogo resolve
// grupos de especies contra o runtime de verdade (`SPECIES`, `traits`), que e
// TS com alias `@/` — Node nao carrega sozinho. A saida e gitignored.
import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  publicDir: false,
  ssr: { noExternal: true },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  build: {
    ssr: 'scripts/conquistas/gerar.ts',
    outDir: 'scripts/.gerado/conquistas',
    emptyOutDir: true,
    target: 'es2023',
    minify: false,
    rollupOptions: { output: { entryFileNames: '[name].mjs' } },
  },
})
