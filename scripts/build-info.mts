import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

// Pages fornece o SHA do build: https://developers.cloudflare.com/pages/configuration/build-configuration/
export function buildInfo(): Plugin {
  return {
    name: 'build-info',
    apply: 'build',
    generateBundle(_options, bundle) {
      const commit = process.env.CF_PAGES_COMMIT_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('SHA inválido para identificar o build')
      const entry = Object.values(bundle).find(item => item.type === 'chunk' && item.isEntry)
      if (!entry || entry.type !== 'chunk') throw new Error('Build sem entrada JavaScript')
      this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify({
        commit, entry: `/${entry.fileName}`, sha256: createHash('sha256').update(entry.code).digest('hex'),
      }) })
    },
  }
}
