import { writeFileSync, appendFileSync } from 'node:fs'
const env = process.env
const reused = env.REUSED === 'true'
const types = reused ? 'previously-verified' : env.STALE === '1' ? 'drift'
  : env.TYPES === 'success' && env.STALE === '0' ? 'verified' : 'inconclusive'
const result = { commit: env.GITHUB_SHA, reusedRun: reused ? env.REUSED_RUN : null,
  migrations: reused ? 'previously-applied' : env.MIGRATIONS,
  edge: reused ? 'previously-published' : env.EDGE, health: env.HEALTH, types }
writeFileSync('schema-deploy-status.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result))
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `\n### Deploy dev: etapas independentes\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`)
