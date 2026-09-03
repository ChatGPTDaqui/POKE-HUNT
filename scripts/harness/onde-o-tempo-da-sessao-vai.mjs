// PH-455 — a bancada que mede onde o tempo da sessao vai.
//
// POR QUE ISTO EXISTE
// ---------------------------------------------------------------------------
// O plano de aceleracao do ciclo de trabalho (03/09) foi inteiro justificado por
// numeros medidos nos transcripts: 50% do tempo ativo e espera de shell, e 45%
// dessa espera e vitest. O codigo que produziu esses numeros rodou uma vez e
// nao foi versionado — exatamente o erro que a PH-189 ja tinha cobrado uma vez,
// e que a regra de harness do projeto existe pra impedir.
//
// Sem esta bancada, a pergunta que fecha o plano ("a razao caiu de 50%?") so se
// responde refazendo a investigacao do zero.
//
// COMO ELE MEDE
// ---------------------------------------------------------------------------
// Cada chamada de ferramenta aparece no `.jsonl` como um bloco `tool_use`
// (dentro de uma mensagem `assistant`, com `id`) e depois como um `tool_result`
// (dentro de uma mensagem `user`, com `tool_use_id` apontando de volta). A
// espera de UMA chamada e a diferenca entre os dois `timestamp`.
//
// DUAS SOMAS, e a diferenca importa:
//
//   SOMADA   soma a espera de todas as chamadas. E o custo total pago, mas
//            superestima o relogio quando varias chamadas saem no mesmo turno
//            (chamadas paralelas esperam ao mesmo tempo, nao em fila).
//   RELOGIO  uniao dos intervalos. E o tempo de parede de verdade.
//
// A medicao original do plano usou a SOMADA. As duas ficam na tabela pra
// comparacao com aquele numero continuar possivel, sem esconder que ela infla.
//
// TEMPO ATIVO e a soma dos intervalos entre eventos consecutivos da sessao,
// descartando buraco maior que `--ocioso` (padrao 300s) — buraco grande e o
// operador tendo saido, nao a sessao trabalhando.
//
//   node scripts/harness/onde-o-tempo-da-sessao-vai.mjs
//   node scripts/harness/onde-o-tempo-da-sessao-vai.mjs --sessoes=40
//   node scripts/harness/onde-o-tempo-da-sessao-vai.mjs --json
//
// Escreve em `process.stdout.write` e nao `console.log`: o vitest engole
// `console.log`, e esta bancada precisa funcionar dentro e fora dele.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const escrever = (s) => process.stdout.write(s + '\n')

const args = process.argv.slice(2)
const opcao = (nome, padrao) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`))
  return a ? a.slice(nome.length + 3) : padrao
}
const SESSOES = Number(opcao('sessoes', '20'))
const OCIOSO_S = Number(opcao('ocioso', '300'))
const JSON_PURO = args.includes('--json')

// Os transcripts ficam em ~/.claude/projects/<caminho com - no lugar de \ e :>.
// O projeto tem varios diretorios (checkout principal + worktrees), e todos
// contam: o trabalho e o mesmo, so o diretorio muda.
const RAIZ_TRANSCRIPTS = path.join(os.homedir(), '.claude', 'projects')
const PADRAO_PROJETO = /POKE-HUNT|NOVO-POKE-IDLE/i

function diretoriosDoProjeto() {
  if (!fs.existsSync(RAIZ_TRANSCRIPTS)) return []
  return fs
    .readdirSync(RAIZ_TRANSCRIPTS)
    .filter((d) => PADRAO_PROJETO.test(d))
    .map((d) => path.join(RAIZ_TRANSCRIPTS, d))
    .filter((d) => fs.statSync(d).isDirectory())
}

function sessoesRecentes(limite) {
  const todas = []
  for (const dir of diretoriosDoProjeto()) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue
      const p = path.join(dir, f)
      const st = fs.statSync(p)
      // Sessao minuscula e ruido (abriu e fechou); nao move nenhum numero e
      // ainda diluiria a media.
      if (st.size < 64 * 1024) continue
      todas.push({ caminho: p, mtime: st.mtimeMs, tamanho: st.size })
    }
  }
  todas.sort((a, b) => b.mtime - a.mtime)
  return todas.slice(0, limite)
}

/**
 * Categoria de um comando de shell. A ordem importa: `npm run build` precisa
 * ser testado antes de `npm`, e `npx vitest` antes de `npx`.
 */
function categoriaDoComando(cmd) {
  const c = (cmd || '').toLowerCase()
  if (/\bvitest\b/.test(c)) return 'vitest'
  if (/npm run build\b|\bvite build\b/.test(c)) return 'npm run build'
  if (/\btsc\b/.test(c)) return 'tsc'
  if (/^\s*gh\b|[;&|]\s*gh\b/.test(c)) return 'gh'
  if (/^\s*git\b|[;&|]\s*git\b/.test(c)) return 'git'
  if (/\bsupabase\b/.test(c)) return 'supabase'
  return 'outros (shell)'
}

function categoriaDaChamada(nome, input) {
  if (nome === 'Bash' || nome === 'PowerShell') return categoriaDoComando(input && input.command)
  return 'outros (nao-shell)'
}

/** Uniao de intervalos [ini, fim] em ms. */
function uniaoMs(intervalos) {
  if (!intervalos.length) return 0
  const ord = [...intervalos].sort((a, b) => a[0] - b[0])
  let total = 0
  let [ini, fim] = ord[0]
  for (let i = 1; i < ord.length; i++) {
    const [a, b] = ord[i]
    if (a > fim) {
      total += fim - ini
      ini = a
      fim = b
    } else if (b > fim) {
      fim = b
    }
  }
  return total + (fim - ini)
}

function lerSessao(caminho) {
  const chamadas = []
  const carimbos = []
  const abertas = new Map() // tool_use_id -> { nome, categoria, inicio }

  let bruto
  try {
    bruto = fs.readFileSync(caminho, 'utf8')
  } catch {
    return { chamadas, carimbos }
  }

  for (const linha of bruto.split('\n')) {
    if (!linha) continue
    let o
    try {
      o = JSON.parse(linha)
    } catch {
      continue
    }
    const t = o.timestamp ? Date.parse(o.timestamp) : NaN
    if (!Number.isNaN(t)) carimbos.push(t)

    const conteudo = o.message && o.message.content
    if (!Array.isArray(conteudo)) continue

    for (const b of conteudo) {
      if (b.type === 'tool_use' && b.id && !Number.isNaN(t)) {
        abertas.set(b.id, { nome: b.name, categoria: categoriaDaChamada(b.name, b.input), inicio: t })
      } else if (b.type === 'tool_result' && b.tool_use_id && !Number.isNaN(t)) {
        const a = abertas.get(b.tool_use_id)
        if (!a) continue
        abertas.delete(b.tool_use_id)
        // Chamada que "durou" mais de 30 min quase sempre e sessao retomada com
        // a resposta chegando depois, nao ferramenta rodando meia hora.
        const ms = t - a.inicio
        if (ms < 0 || ms > 30 * 60 * 1000) continue
        chamadas.push({ categoria: a.categoria, nome: a.nome, inicio: a.inicio, fim: t, ms })
      }
    }
  }
  return { chamadas, carimbos }
}

function tempoAtivoMs(carimbos) {
  if (carimbos.length < 2) return 0
  const ord = [...carimbos].sort((a, b) => a - b)
  const teto = OCIOSO_S * 1000
  let total = 0
  for (let i = 1; i < ord.length; i++) {
    const d = ord[i] - ord[i - 1]
    if (d > 0 && d <= teto) total += d
  }
  return total
}

const min = (ms) => Math.round(ms / 60000)
const seg = (ms) => Math.round(ms / 1000)

function principal() {
  const sessoes = sessoesRecentes(SESSOES)
  if (!sessoes.length) {
    escrever('Nenhum transcript encontrado em ' + RAIZ_TRANSCRIPTS)
    escrever('Esperado um diretorio casando com ' + PADRAO_PROJETO)
    process.exit(1)
  }

  let ativoMs = 0
  const todas = []
  for (const s of sessoes) {
    const { chamadas, carimbos } = lerSessao(s.caminho)
    ativoMs += tempoAtivoMs(carimbos)
    todas.push(...chamadas)
  }

  const porCategoria = new Map()
  for (const c of todas) {
    let g = porCategoria.get(c.categoria)
    if (!g) porCategoria.set(c.categoria, (g = { n: 0, somaMs: 0, intervalos: [] }))
    g.n++
    g.somaMs += c.ms
    g.intervalos.push([c.inicio, c.fim])
  }

  const linhas = [...porCategoria.entries()]
    .map(([categoria, g]) => ({
      categoria,
      invocacoes: g.n,
      somaMs: g.somaMs,
      relogioMs: uniaoMs(g.intervalos),
      mediaMs: g.somaMs / g.n,
    }))
    .sort((a, b) => b.somaMs - a.somaMs)

  const esperaSomaMs = linhas.reduce((s, l) => s + l.somaMs, 0)
  const esperaRelogioMs = uniaoMs(todas.map((c) => [c.inicio, c.fim]))
  const razao = ativoMs ? esperaRelogioMs / ativoMs : 0

  if (JSON_PURO) {
    escrever(
      JSON.stringify(
        { sessoes: sessoes.length, ativoMin: min(ativoMs), esperaSomaMin: min(esperaSomaMs), esperaRelogioMin: min(esperaRelogioMs), razao: Number(razao.toFixed(3)), linhas },
        null,
        2,
      ),
    )
    return
  }

  escrever('')
  escrever(`ONDE O TEMPO DA SESSAO VAI — ${sessoes.length} sessoes mais recentes`)
  escrever(`(ocioso acima de ${OCIOSO_S}s nao conta como tempo ativo)`)
  escrever('')
  escrever(`  tempo ativo        ${min(ativoMs)} min`)
  escrever(`  espera (relogio)   ${min(esperaRelogioMs)} min   <- tempo de parede`)
  escrever(`  espera (somada)    ${min(esperaSomaMs)} min   <- custo somado, infla com chamada paralela`)
  escrever(`  RAZAO espera/ativo ${(razao * 100).toFixed(0)}%`)
  escrever('')

  const larg = Math.max(18, ...linhas.map((l) => l.categoria.length))
  escrever(
    '  ' +
      'categoria'.padEnd(larg) +
      '  ' +
      'invoc'.padStart(6) +
      '  ' +
      'somada'.padStart(9) +
      '  ' +
      'relogio'.padStart(9) +
      '  ' +
      'media'.padStart(7),
  )
  escrever('  ' + '-'.repeat(larg + 38))
  for (const l of linhas) {
    escrever(
      '  ' +
        l.categoria.padEnd(larg) +
        '  ' +
        String(l.invocacoes).padStart(6) +
        '  ' +
        `${min(l.somaMs)} min`.padStart(9) +
        '  ' +
        `${min(l.relogioMs)} min`.padStart(9) +
        '  ' +
        `${seg(l.mediaMs)}s`.padStart(7),
    )
  }
  escrever('')
}

principal()
