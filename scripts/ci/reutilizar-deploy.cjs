// Só reutiliza a última execução, nunca procura um verde antigo atrás de falhas.
// Ausência de prova (API, histórico ou conclusão) mantém o deploy normal.
module.exports = async ({ github, context, core }) => {
  core.setOutput('reutilizar', 'false')
  try {
    const repo = context.repo
    const atual = (await github.rest.repos.getCommit({ ...repo, ref: context.sha })).data
    if (!atual.parents.length) return
    const pai = (await github.rest.repos.getCommit({ ...repo, ref: atual.parents[0].sha })).data
    if (atual.commit.tree.sha !== pai.commit.tree.sha) return
    const runs = (await github.rest.actions.listWorkflowRuns({
      ...repo, workflow_id: 'supabase-deploy-dev.yml', branch: 'dev', event: 'push', per_page: 10,
    })).data.workflow_runs
    const anterior = runs.find(r => r.id !== context.runId)
    if (!anterior || anterior.status !== 'completed' || anterior.conclusion !== 'success') return
    const publicado = (await github.rest.repos.getCommit({ ...repo, ref: anterior.head_sha })).data
    if (publicado.commit.tree.sha !== atual.commit.tree.sha) return
    core.setOutput('reutilizar', 'true')
    core.setOutput('run', String(anterior.id))
    core.info(`Árvore já publicada com sucesso no run ${anterior.id}; /saude será conferido novamente.`)
  } catch (e) {
    core.warning(`Sem prova de publicação equivalente; deploy normal. ${e.message}`)
  }
}
