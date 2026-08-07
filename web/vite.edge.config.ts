// Empacota motor + servico num arquivo so, pra rodar como Supabase Edge Function.
//
// Por que empacotar em vez de deixar Deno resolver os imports: o codigo do
// servidor usa `#engine` (subpath import do Node) e especificadores `.js`
// apontando pra `.ts` — duas coisas que o resolvedor do Deno nao aceita. Um
// bundle unico elimina resolucao de modulo do problema, e de quebra e o formato
// que a Edge Function prefere.
import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  publicDir: false,
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '#engine': path.resolve(import.meta.dirname, 'src/engine/headless.ts'),
    },
  },
  build: {
    ssr: '../server/src/edge.ts',
    outDir: '../supabase/functions/jogo',
    emptyOutDir: false,
    target: 'es2022',
    rollupOptions: { output: { entryFileNames: 'servidor.js' } },
  },
  ssr: { noExternal: true, target: 'webworker' },
})
