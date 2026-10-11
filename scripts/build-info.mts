import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/** No staging há duas entradas; a primeira pode ser a bancada de VFX. */
export function entradaDoCliente(entries: string[], html?: string): string {
  if (entries.length === 1) return entries[0]
  const scripts = [...(html ?? '').matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[1].replace(/^\.?\//, ''))
  const candidatas = entries.filter(entry => scripts.includes(entry))
  if (candidatas.length !== 1) throw new Error('Build sem entrada JavaScript inequívoca no index.html')
  return candidatas[0]
}

// Pages fornece o SHA do build: https://developers.cloudflare.com/pages/configuration/build-configuration/
export function buildInfo(): Plugin {
  return {
    name: 'build-info',
    apply: 'build',
    writeBundle(options, bundle) {
      const commit = process.env.CF_PAGES_COMMIT_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('SHA inválido para identificar o build')
      if (!options.dir) throw new Error('Build sem diretório de saída')
      const entries = Object.values(bundle).filter(item => item.type === 'chunk' && item.isEntry).map(item => item.fileName)
      const entry = entradaDoCliente(entries, entries.length > 1 ? readFileSync(resolve(options.dir, 'index.html'), 'utf8') : undefined)
      // Após TODOS os generateBundle: Vite pode finalizar referências e sourcemaps depois deles.
      const code = readFileSync(resolve(options.dir, entry))
      writeFileSync(resolve(options.dir, 'build-info.json'), JSON.stringify({
        commit, entry: `/${entry}`, sha256: createHash('sha256').update(code).digest('hex'),
      }))
    },
  }
}
