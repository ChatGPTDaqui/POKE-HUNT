// Publica a Edge Function do servidor de autoridade, com o PROJETO FIXADO.
//
//   npm run edge:publicar                 # publica `jogo` (producao)
//   node scripts/publicar-edge.mjs --funcao=jogo-dev
//
// POR QUE ISTO DEIXOU DE SER UMA LINHA NO package.json (PH-187)
// ---------------------------------------------------------------------------
// Era assim:
//
//   "edge:publicar": "npm run build:edge && npx supabase functions deploy jogo"
//
// Sem `--project-ref`. O alvo saia do link local do CLI e da conta logada — dois
// estados que ninguem verifica e que nao estao versionados em lugar nenhum.
//
// Em 26/08 o CLI desta maquina estava autenticado numa conta SEM acesso ao
// projeto atual, e o comando documentado pra publicar a Edge simplesmente nao
// funcionava. A mensagem era um `403: Your account does not have the necessary
// privileges`, que nao sugere "voce esta na conta errada".
//
// O 403 escondeu o risco maior. Aquela conta tem o projeto `Poke Idle Hunt`, um
// POKE-HUNT anterior. Se ele tivesse uma function chamada `jogo`, o deploy teria
// ido pro PROJETO ERRADO, com sucesso e sem aviso — publicando o servidor de um
// jogo em cima do outro. O 403 salvou por acidente, nao por desenho. Mesma
// familia do risco que o CLAUDE.md ja registra pro `.env` da raiz ("errar o
// `.env` roda `db:wipe` contra o ambiente errado sem avisar").
//
// DE ONDE SAI O PROJETO, na ordem:
//
//   1. `SUPABASE_PROJECT_REF` do ambiente — e o que o CI usa (secret).
//   2. O host de `SUPABASE_URL` no `.env` da RAIZ — a mesma fonte que
//      `catalog:migrar` e `db:wipe` usam pra decidir contra qual banco falam.
//      Nao ha uma segunda fonte de verdade sobre "qual e o projeto".
//
// E antes de subir qualquer byte, confere que a conta logada ENXERGA o projeto,
// pra falhar cedo com uma mensagem que diz o que fazer.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Leitor de `.env` dos outros scripts — o projeto nao usa dotenv de proposito. */
export function lerEnv(arquivo = join(RAIZ, '.env')) {
  if (!existsSync(arquivo)) return {}
  const env = {}
  for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
    const limpa = linha.trim()
    if (!limpa || limpa.startsWith('#')) continue
    const i = limpa.indexOf('=')
    if (i < 0) continue
    env[limpa.slice(0, i).trim()] = limpa.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

/**
 * O ref do projeto embutido numa URL do Supabase
 * (`https://<ref>.supabase.co`), ou `null` se a URL nao tem essa forma.
 */
export function refDaUrl(url) {
  const m = /^https?:\/\/([a-z0-9]{20})\.supabase\.(co|in)\/?$/i.exec((url || '').trim())
  return m ? m[1].toLowerCase() : null
}

/**
 * Decide o projeto alvo. Lanca com mensagem acionavel quando nao da pra decidir
 * — publicar "no que estiver linkado" e exatamente o que esta issue proibe.
 */
export function resolverProjeto({ env = process.env, dotenv = lerEnv() } = {}) {
  const doAmbiente = (env.SUPABASE_PROJECT_REF || '').trim()
  if (doAmbiente) return { ref: doAmbiente, origem: 'SUPABASE_PROJECT_REF do ambiente' }

  const url = dotenv.SUPABASE_URL || dotenv.VITE_SUPABASE_URL || ''
  const ref = refDaUrl(url)
  if (ref) return { ref, origem: `SUPABASE_URL do .env da raiz (${url})` }

  throw new Error(
    'nao consegui decidir o projeto alvo.\n'
    + '  Defina SUPABASE_PROJECT_REF no ambiente, ou preencha SUPABASE_URL no .env da raiz\n'
    + `  com a forma https://<ref>.supabase.co (valor lido: ${JSON.stringify(url)}).\n`
    + '  Publicar "no projeto que estiver linkado" e o que a PH-187 proibiu: o alvo\n'
    + '  vinha de estado local invisivel e nao versionado.',
  )
}

/** A funcao a publicar. `jogo` e producao; `jogo-dev` e a staging. */
export function resolverFuncao(argv = process.argv.slice(2)) {
  const arg = argv.find((a) => a.startsWith('--funcao='))
  return arg ? arg.slice('--funcao='.length).trim() : 'jogo'
}

function supabase(args, opcoes = {}) {
  return execFileSync('npx', ['supabase', ...args], {
    cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opcoes,
  })
}

/**
 * A conta logada enxerga este projeto? Falha CEDO e com instrucao, em vez de
 * deixar o 403 generico aparecer no meio do upload.
 */
function conferirAcesso(ref) {
  let saida
  try {
    saida = supabase(['projects', 'list', '--output-format', 'json'])
  } catch (e) {
    console.error('\n  Nao consegui listar os projetos do Supabase.')
    console.error('  Sem login valido no CLI (ou sem SUPABASE_ACCESS_TOKEN) nao da pra publicar.')
    console.error('  Resolver: `npx supabase login` — precisa de TTY, entao nao roda em terminal automatizado.\n')
    throw e
  }

  let projetos
  try {
    projetos = JSON.parse(saida)
  } catch {
    // Formato de saida do CLI mudou. Melhor seguir e deixar o deploy falhar com
    // o erro dele do que abortar uma publicacao valida por causa do parser.
    console.warn('  Aviso: nao consegui interpretar `projects list --output-format json`. Seguindo sem a conferencia previa.')
    return
  }

  if (projetos.some((p) => (p.id || p.ref) === ref)) return

  const visiveis = projetos.map((p) => `${p.name || '?'} (${p.id || p.ref})`).join('\n    ') || '(nenhum)'
  console.error(`\n  RECUSADO: a conta logada no CLI do Supabase nao enxerga o projeto ${ref}.`)
  console.error('  Projetos visiveis nesta conta:')
  console.error(`    ${visiveis}`)
  console.error('\n  Isto quase sempre e "voce esta logado na conta errada". Resolver:')
  console.error('    npx supabase login          # precisa de TTY')
  console.error('  Nao continuo: publicar aqui poderia acertar um projeto ANTIGO que tambem')
  console.error('  tem uma function chamada `jogo`, sobrescrevendo o servidor de outro jogo.\n')
  process.exit(1)
}

export function publicar({ argv = process.argv.slice(2) } = {}) {
  const { ref, origem } = resolverProjeto()
  const funcao = resolverFuncao(argv)

  console.log(`Projeto alvo: ${ref}`)
  console.log(`  origem: ${origem}`)
  console.log(`Function:     ${funcao}\n`)

  conferirAcesso(ref)

  // `--project-ref` SEMPRE. E a linha inteira desta issue: sem ela o alvo sai do
  // link local, que ninguem verifica.
  supabase(['functions', 'deploy', funcao, '--project-ref', ref], { stdio: 'inherit' })
  console.log(`\n${funcao} publicada em ${ref}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    publicar()
  } catch (e) {
    console.error(`\n  ${e.message}\n`)
    process.exit(1)
  }
}
