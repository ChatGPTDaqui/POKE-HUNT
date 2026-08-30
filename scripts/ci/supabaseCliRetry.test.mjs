// PH-106 — `scripts/ci/supabase-cli.sh` re-linka e repete SO na colisao de
// credencial, e propaga o resto sem mexer.
//
// POR QUE ISTO MERECE TESTE
//
// O script roda em 3 workflows e nao roda em lugar nenhum antes disso: um erro
// nele so aparece num deploy, e o modo de falhar e silencioso nas duas direcoes.
// Retry de menos deixa o bug original de pe (28P01 mata o deploy, migration nao
// aplicada, PR ja mesclada). Retry de mais transforma erro de SQL de verdade em
// 3 tentativas identicas, com o log util enterrado no meio e o codigo de saida
// trocado.
//
// A ARMADILHA QUE ELE JA TEVE: `if cmd; then ...; fi` sem `else` devolve 0
// quando a condicao FALHA, entao ler `$?` depois do `fi` daria sempre sucesso e
// o script engoliria todo erro do CLI. O caso "erro de SQL preserva o codigo 7"
// abaixo e o que trava isso.
//
// O `supabase` real e substituido por uma FUNCAO exportada do bash (`export -f`),
// e nao por um arquivo em `PATH`: no Git Bash do Windows um executavel sem
// extensao nao e encontrado pelo `PATH`, e a bancada passaria a medir nada.
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'

const SCRIPT = join(import.meta.dirname, 'supabase-cli.sh')

let dir

/** Um comando falso que escreve no contador e devolve o que o caso pedir. */
function comando(nome, corpo) {
  const caminho = join(dir, nome).replace(/\\/g, '/')
  writeFileSync(caminho, `#!/usr/bin/env bash\n${corpo}\n`)
  // 0o755 e obrigatorio: no Linux do CI um arquivo sem bit de execucao devolve
  // exit 126 ("found but not executable") e a bancada passa a medir o erro do
  // bash em vez do caso. No Git Bash do Windows o bit e ignorado, entao os 4
  // casos passavam local e reprovavam no CI.
  chmodSync(caminho, 0o755)
  return caminho
}

/**
 * Roda o wrapper com um `supabase` falso. Devolve saida, codigo, e quantas
 * vezes o comando e o `link` foram chamados.
 */
function rodar(cmd) {
  const contador = join(dir, 'ct').replace(/\\/g, '/')
  const links = join(dir, 'lk').replace(/\\/g, '/')
  writeFileSync(contador, '0')
  writeFileSync(links, '')

  const script = [
    `export CONTADOR='${contador}' CONTADOR_LINK='${links}'`,
    'supabase() { if [ "$1" = link ]; then echo x >> "$CONTADOR_LINK"; return 0; fi; return 0; }',
    'export -f supabase',
    `bash '${SCRIPT.replace(/\\/g, '/')}' '${cmd}'`,
  ].join('\n')

  let stdout = ''
  let status = 0
  try {
    stdout = execFileSync('bash', ['-c', script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SUPABASE_PROJECT_REF: 'fake',
        SUPABASE_ACCESS_TOKEN: 'fake',
        SUPABASE_CLI_ESPERA: '0',
      },
    })
  } catch (e) {
    status = e.status
    stdout = e.stdout ?? ''
  }
  return {
    stdout: stdout.trim(),
    status,
    tentativas: Number(readFileSync(contador, 'utf8').trim()),
    links: readFileSync(links, 'utf8').split('\n').filter(Boolean).length,
  }
}

const CONTA = 'N=$(cat "$CONTADOR"); echo $((N+1)) > "$CONTADOR"'
const ERRO_28P01 = 'FATAL: password authentication failed for user "cli_login_postgres" (SQLSTATE 28P01)'

// Sem bash no PATH nao ha o que medir — melhor pular alto que passar no vazio.
const TEM_BASH = (() => {
  try { execFileSync('bash', ['-c', 'true'], { stdio: 'ignore' }); return true } catch { return false }
})()

describe.skipIf(!TEM_BASH)('supabase-cli.sh (PH-106)', () => {
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ph106-')) })
  afterEach(() => { if (existsSync(dir)) rmSync(dir, { recursive: true, force: true }) })

  it('o script existe e e o que a bancada esta medindo', () => {
    expect(existsSync(SCRIPT), 'scripts/ci/supabase-cli.sh sumiu').toBe(true)
  })

  it('sucesso de primeira: 1 link, saida do comando intacta no stdout', () => {
    // O stdout precisa passar LIMPO: `migration list --output-format json` e
    // capturado em variavel e `gen types` e redirecionado pra arquivo. Uma
    // linha de diagnostico vazando pro stdout quebraria o `jq` e o `diff`.
    const r = rodar(comando('ok', `${CONTA}\necho SAIDA-UTIL`))
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('SAIDA-UTIL')
    expect(r.links).toBe(1)
    expect(r.tentativas).toBe(1)
  })

  it('28P01 duas vezes e depois passa: re-linka a cada tentativa e devolve a saida boa', () => {
    const r = rodar(comando('flaky', [
      CONTA,
      'N=$(cat "$CONTADOR")',
      `if [ "$N" -le 2 ]; then echo '${ERRO_28P01}' >&2; exit 1; fi`,
      'echo SAIDA-DEPOIS-DO-RETRY',
    ].join('\n')))
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('SAIDA-DEPOIS-DO-RETRY')
    expect(r.tentativas).toBe(3)
    // Re-linkar E o conserto: sem isso as 3 tentativas usariam a mesma
    // credencial velha e falhariam identicas, que era o retry antigo do
    // supabase-check.yml.
    expect(r.links).toBe(3)
  })

  it('erro de SQL de verdade: UMA tentativa e o codigo de saida preservado', () => {
    // Trava a armadilha do `$?` depois do `fi` (ver cabecalho): com ela de
    // volta, o script sairia 0 e o deploy passaria por cima de uma migration
    // que estourou.
    const r = rodar(comando('sql', [
      CONTA,
      `echo 'ERROR: duplicate key value violates unique constraint "schema_migrations_pkey" (SQLSTATE 23505)' >&2`,
      'exit 7',
    ].join('\n')))
    expect(r.status).toBe(7)
    expect(r.tentativas, 'gastou retry num erro que nao e de credencial').toBe(1)
  })

  it('28P01 em todas: para nas 3 tentativas e reprova', () => {
    const r = rodar(comando('sempre', `${CONTA}\necho '${ERRO_28P01}' >&2\nexit 1`))
    expect(r.status).not.toBe(0)
    expect(r.tentativas).toBe(3)
  })
})
