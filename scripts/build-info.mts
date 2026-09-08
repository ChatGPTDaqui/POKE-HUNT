import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

// Pages fornece o SHA do build: https://developers.cloudflare.com/pages/configuration/build-configuration/
export function buildInfo(): Plugin {
  return {
    name: 'build-info',
    apply: 'build',
    writeBundle(options, bundle) {
      const commit = process.env.CF_PAGES_COMMIT_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('SHA inválido para identificar o build')
      const entry = Object.values(bundle).find(item => item.type === 'chunk' && item.isEntry)
      if (!entry || entry.type !== 'chunk') throw new Error('Build sem entrada JavaScript')
      if (!options.dir) throw new Error('Build sem diretório de saída')
      // Após TODOS os generateBundle: Vite pode finalizar referências e sourcemaps depois deles.
      const code = readFileSync(resolve(options.dir, entry.fileName))
      writeFileSync(resolve(options.dir, 'build-info.json'), JSON.stringify({
        commit, entry: `/${entry.fileName}`, sha256: createHash('sha256').update(code).digest('hex'),
      }))
    },
  }
}
