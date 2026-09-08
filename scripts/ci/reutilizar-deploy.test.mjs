import { describe, it, expect } from 'vitest'
import reutilizar from './reutilizar-deploy.cjs'

async function verificar({ pai = 'T', publicado = 'T', conclusion = 'success', status = 'completed', erro = false } = {}) {
  const outputs = {}
  const github = { rest: {
    repos: { getCommit: async ({ ref }) => {
      if (erro) throw new Error('indisponível')
      return { data: { parents: [{ sha: 'pai' }], commit: { tree: { sha: ref === 'pai' ? pai : ref === 'publicado' ? publicado : 'T' } } } }
    } },
    actions: { listWorkflowRuns: async () => ({ data: { workflow_runs: [
      { id: 10 }, { id: 9, head_sha: 'publicado', conclusion, status },
      { id: 8, head_sha: 'publicado', conclusion: 'success', status: 'completed' },
    ] } }) },
  } }
  await reutilizar({ github, context: { repo: {}, sha: 'atual', runId: 10 },
    core: { setOutput: (k, v) => { outputs[k] = v }, info() {}, warning() {} } })
  return outputs.reutilizar
}

describe('reutilização de deploy com prova', () => {
  it('aceita apenas árvore igual ao pai e ao último deploy bem-sucedido', async () => {
    expect(await verificar()).toBe('true')
  })
  it.each([{ pai: 'nova' }, { publicado: 'atrasado' }, { conclusion: 'failure' },
    { status: 'in_progress' }, { erro: true }])('publica normalmente sem prova: %j', async caso => {
    expect(await verificar(caso)).toBe('false')
  })
})
