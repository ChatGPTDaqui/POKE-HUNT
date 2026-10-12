// Bancada local isolada: não entra no build do cliente publicado.
import { defineConfig, mergeConfig } from 'vite'
import base from '../../vite.config.ts'

// A bancada não publica index.html nem manifesto de deploy.
const harnessBase = { ...base, plugins: base.plugins?.filter(plugin =>
  !plugin || !('name' in plugin) || plugin.name !== 'build-info') }

export default mergeConfig(harnessBase, defineConfig({
  cacheDir: 'node_modules/.vite-jornada',
  optimizeDeps: {
    noDiscovery: false,
    entries: ['scripts/harness/identidade-jornada.html', 'scripts/harness/jornada-completa.html'],
    include: ['react', 'react-dom/client', 'react/jsx-runtime', '@phosphor-icons/react', 'crypto-js'],
  },
  server: { host: '127.0.0.1', port: 5176, strictPort: true },
  build: {
    outDir: 'node_modules/.tmp/identidade-jornada-build',
    rollupOptions: { input: ['scripts/harness/identidade-jornada.html', 'scripts/harness/jornada-completa.html', 'scripts/harness/treinadores-fieis.html'] },
  },
}))
