// Bancada isolada: nunca importar esta configuração no build publicável (ESM).
import { defineConfig, mergeConfig } from 'vite'
import path from 'node:path'
import base from '../../vite.config.ts'

export default mergeConfig(base, defineConfig({
  resolve: { alias: [{ find: '@/data/remote/pvpRpc', replacement: path.resolve(import.meta.dirname, 'menus-rpg-pvp.ts') }] },
  optimizeDeps: { entries: ['scripts/harness/menus-rpg.html'] },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
}))
