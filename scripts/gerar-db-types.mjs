// Gera `src/lib/database.types.ts` a partir do schema remoto.
//
// ---------------------------------------------------------------------------
// POR QUE ISTO EXISTE, EM VEZ DO REDIRECIONAMENTO DIRETO
// ---------------------------------------------------------------------------
// O script era, no `package.json`:
//
//     npx supabase gen types typescript --linked > src/lib/database.types.ts
//
// O `>` do shell TRUNCA o arquivo ANTES de o comando rodar. Então qualquer falha
// do CLI — token expirado, rede caída, projeto não linkado, o 28P01 da corrida de
// workflow — deixava `database.types.ts` VAZIO, e o próximo `tsc` desabava com
// centenas de erros que não têm nada a ver com o que a pessoa estava fazendo.
// Recuperar exigia `git checkout` do arquivo, e quem não soubesse disso ia
// procurar o erro no lugar errado (PH-107).
//
// Aqui a saída vai pra memória primeiro. O arquivo só é reescrito depois de o
// CLI sair com 0 E a saída passar por uma checagem mínima de sanidade.
//
// ---------------------------------------------------------------------------
// O TOKEN
// ---------------------------------------------------------------------------
// `SUPABASE_ACCESS_TOKEN` explícito quando `POKE_HUNT_CI` existe no `.env`:
// sem ele, o CLI local usa a sessão interativa de `supabase login`, que é outra
// credencial — e quando as duas discordam o erro que sai é de autenticação, sem
// dizer qual das duas ele tentou usar.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const SAIDA = join(RAIZ, 'src', 'lib', 'database.types.ts')

/** Lê o `.env` da raiz sem dotenv — mesmo leitor dos outros scripts. */
function lerEnv() {
  const arquivo = join(RAIZ, '.env')
  const env = {}
  if (!existsSync(arquivo)) return env
  for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
    const t = linha.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return env
}

const env = lerEnv()
const ambiente = { ...process.env }
if (!ambiente.SUPABASE_ACCESS_TOKEN && env.POKE_HUNT_CI) {
  ambiente.SUPABASE_ACCESS_TOKEN = env.POKE_HUNT_CI
}

// Comando como STRING UNICA com `shell: true`, e nao programa + array de
// argumentos. Duas tentativas antes desta falharam por razoes opostas:
// `spawnSync('npx', [...], { shell: true })` avisa DEP0190 (com shell, os
// argumentos vao concatenados sem escape), e `spawnSync('npx.cmd', [...])` sem
// shell estoura EINVAL no Windows desde o Node 20, que bloqueia `.cmd` fora de
// shell. String unica nao tem nem um nem outro problema, e aqui e seguro: nao
// entra nada de fora neste comando.
const r = spawnSync('npx supabase gen types typescript --linked', {
  cwd: RAIZ,
  env: ambiente,
  encoding: 'utf8',
  shell: true,
  maxBuffer: 64 * 1024 * 1024,
})

if (r.error) {
  console.error(`Nao consegui rodar o CLI do Supabase: ${r.error.message}`)
  console.error(`${SAIDA} ficou INTACTO.`)
  process.exit(1)
}
if (r.status !== 0) {
  process.stderr.write(r.stderr ?? '')
  console.error(`\nCLI saiu com codigo ${r.status}. ${SAIDA} ficou INTACTO.`)
  process.exit(1)
}

const saida = r.stdout ?? ''
// Checagem de sanidade mínima. Um CLI que sai 0 e imprime nada (ou imprime aviso
// no lugar do tipo) é o mesmo estrago do `>`: arquivo válido pro shell, inútil
// pro `tsc`. As duas marcas abaixo estão em TODA saída real do gerador.
if (!saida.includes('export type Json') || !saida.includes('Database')) {
  process.stderr.write(r.stderr ?? '')
  console.error(`\nSaida do CLI nao parece com os tipos (${saida.length} bytes).`)
  console.error(`${SAIDA} ficou INTACTO.`)
  process.exit(1)
}

const anterior = existsSync(SAIDA) ? readFileSync(SAIDA, 'utf8') : ''
// Compara e grava com a MESMA quebra de linha do arquivo em disco. O CLI emite
// LF; num checkout Windows o arquivo esta em CRLF. Sem isto, toda execucao
// reescrevia o arquivo inteiro so pra trocar as quebras — o `git diff` ficava
// vazio (o git normaliza), mas qualquer comparacao byte a byte (md5, cache de
// build, watcher) via o arquivo mudar sem nada mudar.
const crlf = anterior.includes('\r\n')
const paraGravar = crlf ? saida.split('\n').join('\r\n') : saida
if (anterior === paraGravar) {
  console.log('database.types.ts já estava em sincronia — nada reescrito.')
  process.exit(0)
}

writeFileSync(SAIDA, paraGravar)
console.log(`database.types.ts atualizado (${paraGravar.length} bytes).`)
