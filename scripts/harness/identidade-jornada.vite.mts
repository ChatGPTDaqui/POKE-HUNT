// Bancada local isolada: não entra no build do cliente publicado.
import { defineConfig, mergeConfig } from 'vite'
import base from '../../vite.config.ts'

export default mergeConfig(base, defineConfig({
  optimizeDeps: {
    noDiscovery: true,
    entries: ['scripts/harness/identidade-jornada.html'],
    include: ['react', 'react-dom/client', 'react/jsx-runtime', '@phosphor-icons/react'],
  },
  server: { host: '127.0.0.1', port: 5176, strictPort: true },
  build: {
    outDir: 'node_modules/.tmp/identidade-jornada-build',
    rollupOptions: { input: 'scripts/harness/identidade-jornada.html' },
  },
}))
