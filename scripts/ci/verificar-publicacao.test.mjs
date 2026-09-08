import { it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { resumir, conferirCliente, conferirBancadas } from './verificar-publicacao.mjs'

const commit = 'a'.repeat(40)
const good = { status: 'verified' }
it.each([
  ['success', 'success', good, good, 'verified'],
  ['failure', 'skipped', good, good, 'deployment-failure'],
  ['success', 'success', { status: 'functional-failure' }, good, 'functional-failure'],
  ['success', 'success', { status: 'configuration-inconclusive' }, good, 'configuration-inconclusive'],
  ['success', 'success', good, null, 'client-pending'],
])('publicação distingue %s/%s/%j/%j', (migrations, edge, smokes, client, expected) => {
  expect(resumir({ commit, migrations, edge, smokes, client }).status).toBe(expected)
})
it('não confunde credencial recusada com regressão nem deixa de executar a segunda bancada', async () => {
  const calls = []
  const result = await conferirBancadas({ env: { VITE_SUPABASE_URL: 'x', VITE_SUPABASE_ANON_KEY: 'x', CONTA_TESTE_SENHA: 'x' }, run: f => { calls.push(f); return 2 } })
  expect(calls).toHaveLength(2)
  expect(result.status).toBe('configuration-inconclusive')
})
it('repete falha transitória uma vez e não repete credencial', async () => {
  const codes = [1, 0, 0]
  const result = await conferirBancadas({ env: { VITE_SUPABASE_URL: 'x', VITE_SUPABASE_ANON_KEY: 'x', CONTA_TESTE_SENHA: 'x' }, run: () => codes.shift(), wait: async () => {} })
  expect(result.status).toBe('verified')
  expect(codes).toEqual([])
})
it('segredo em branco é inconclusivo sem executar', async () => {
  expect((await conferirBancadas({ env: {}, run: () => { throw new Error('não deve executar') } })).status).toBe('configuration-inconclusive')
})
it.each(['old-commit', 'wrong-bundle', 'wrong-hash', 'valid'])('confere SHA, HTML e conteúdo: %s', async mode => {
  const code = 'console.log(1)', entry = '/build/index-abc.js'
  const request = async url => {
    if (url.includes('build-info.json')) return Response.json({ commit: mode === 'old-commit' ? 'b'.repeat(40) : commit, entry, sha256: createHash('sha256').update(code).digest('hex') })
    if (url.includes(entry)) return new Response(mode === 'wrong-hash' ? 'old' : code)
    return new Response(`<script src="${mode === 'wrong-bundle' ? '/build/old.js' : entry}"></script>`)
  }
  expect((await conferirCliente(commit, { request, attempts: 2, wait: async () => {} })).status).toBe(mode === 'valid' ? 'verified' : 'client-pending')
})
