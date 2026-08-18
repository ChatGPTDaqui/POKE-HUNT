// Build do motor pro SERVIDOR (Fase D) — separado do build do app.
//
// Config propria por dois motivos concretos: `publicDir: false` (senao o Vite
// copia favicon/icons pra dentro do pacote do servidor, que nao serve arquivo
// estatico nenhum) e `ssr` explicito, que faz o Vite deixar as dependencias
// como import externo em vez de empacotar o React inteiro junto.
import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  publicDir: false,
  // Bundle AUTOCONTIDO: sem isto o Vite deixa zustand/immer como import externo
  // e o servidor precisaria instalar as mesmas dependencias do cliente, em
  // versoes casadas. Um arquivo so tambem e o formato que Cloudflare Workers
  // espera, o que mantem a escolha de hospedagem em aberto.
  ssr: { noExternal: true },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  build: {
    ssr: 'src/engine/headless.ts',
    outDir: 'authority/engine',
    emptyOutDir: true,
    target: 'es2023',
  },
})
