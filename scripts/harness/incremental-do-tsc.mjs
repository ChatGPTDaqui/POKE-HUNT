// PH-458 — o `tsc -b` esta mesmo aproveitando o cache incremental?
//
// POR QUE ISTO EXISTE
// ---------------------------------------------------------------------------
// `tsc -b` sao 204 invocacoes e 165 min de espera nas 20 sessoes medidas em
// 02/09 — e o terceiro maior consumidor de relogio do projeto. A regra do
// `CLAUDE.md` manda roda-lo em toda tarefa, entao ele e custo fixo: qualquer
// segundo economizado aqui e multiplicado por todas as tarefas.
//
// A suspeita era que ele NAO incrementa: medido a olho em 02/09, 66s com o
// `.tsbuildinfo` quente contra 64s depois de `--clean`. Igual, dentro do ruido.
//
// O QUE ELE MEDE, e por que os tres estados
// ---------------------------------------------------------------------------
//   FRIO    depois de `tsc -b --clean`. E o teto: compilar tudo.
//   QUENTE  logo em seguida, sem tocar em arquivo nenhum. Se o incremental
//           funciona, este e o caso mais rapido de todos — nao ha o que refazer.
//   TOCADO  com UM arquivo modificado (mtime novo, conteudo identico). E o caso
//           real de quem edita: um arquivo mexeu, o resto nao.
//
// Comparar so FRIO com QUENTE nao basta pra concluir: os dois podem ser iguais
// porque o incremental esta desligado, ou porque o custo mora todo em carregar
// e checar os .d.ts das dependencias, que nenhum incremental evita. TOCADO
// separa as duas explicacoes — se TOCADO ~= QUENTE << FRIO, o incremental
// funciona e o custo restante e de partida.
//
//   node scripts/harness/incremental-do-tsc.mjs
//   node scripts/harness/incremental-do-tsc.mjs --repeticoes=3
//
// Escreve em `process.stdout.write` e nao `console.log`: o vitest engole
// `console.log`.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const escrever = (s) => process.stdout.write(s + '\n')
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const args = process.argv.slice(2)
const opcao = (nome, padrao) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`))
  return a ? a.slice(nome.length + 3) : padrao
}
const REPETICOES = Number(opcao('repeticoes', '2'))

// Arquivo tocado no estado TOCADO. `src/main.tsx` de proposito: e a raiz do
// grafo do app, entao tocar nele e o pior caso plausivel de invalidacao.
const TOCAR = path.join(RAIZ, 'src', 'main.tsx')

function rodar(argumentos) {
  const inicio = Date.now()
  const r = spawnSync('npx', ['tsc', ...argumentos], {
    cwd: RAIZ,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  return { ms: Date.now() - inicio, codigo: r.status, saida: (r.stdout || '') + (r.stderr || '') }
}

function tamanhoDoCache() {
  const dir = path.join(RAIZ, 'node_modules', '.tmp')
  let total = 0
  const achados = []
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.tsbuildinfo')) continue
      const b = fs.statSync(path.join(dir, f)).size
      total += b
      achados.push(`${f} ${(b / 1024).toFixed(1)}KB`)
    }
  } catch { /* sem cache ainda */ }
  return { total, achados }
}

function contarArquivos() {
  let n = 0
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) andar(path.join(d, e.name))
      else if (/\.(ts|tsx)$/.test(e.name)) n++
    }
  }
  try { andar(path.join(RAIZ, 'src')) } catch { /* ignora */ }
  return n
}

const seg = (ms) => (ms / 1000).toFixed(1) + 's'

escrever('')
escrever('INCREMENTAL DO TSC — tres estados')
escrever(`raiz: ${RAIZ}`)
escrever(`arquivos .ts/.tsx em src/: ${contarArquivos()}`)
const versao = rodar(['--version'])
escrever(`tsc: ${versao.saida.trim()}`)
escrever('')

const medidas = { frio: [], quente: [], tocado: [] }

for (let i = 1; i <= REPETICOES; i++) {
  escrever(`--- rodada ${i} de ${REPETICOES} ---`)

  const limpo = rodar(['-b', '--clean'])
  if (limpo.codigo !== 0) escrever(`  (aviso: --clean saiu com ${limpo.codigo})`)

  const frio = rodar(['-b'])
  medidas.frio.push(frio.ms)
  escrever(`  FRIO    ${seg(frio.ms)}   codigo ${frio.codigo}`)
  if (frio.codigo !== 0) escrever(frio.saida.split('\n').slice(0, 5).join('\n'))

  const cache = tamanhoDoCache()
  escrever(`          cache gravado: ${cache.achados.join(', ') || '(nenhum)'}`)

  const quente = rodar(['-b'])
  medidas.quente.push(quente.ms)
  escrever(`  QUENTE  ${seg(quente.ms)}   codigo ${quente.codigo}`)

  // mtime novo, conteudo identico: invalida pelo carimbo sem mudar o programa,
  // que e o caso de quem salva um arquivo sem alterar nada de fato.
  const agora = new Date()
  fs.utimesSync(TOCAR, agora, agora)
  const tocado = rodar(['-b'])
  medidas.tocado.push(tocado.ms)
  escrever(`  TOCADO  ${seg(tocado.ms)}   codigo ${tocado.codigo}   (${path.relative(RAIZ, TOCAR)})`)
  escrever('')
}

const media = (a) => a.reduce((s, x) => s + x, 0) / a.length

escrever('=== media ===')
escrever(`  FRIO    ${seg(media(medidas.frio))}`)
escrever(`  QUENTE  ${seg(media(medidas.quente))}`)
escrever(`  TOCADO  ${seg(media(medidas.tocado))}`)
escrever('')

const ganho = 1 - media(medidas.quente) / media(medidas.frio)
escrever(`  QUENTE economiza ${(ganho * 100).toFixed(0)}% do FRIO`)
if (ganho < 0.15) {
  escrever('  -> o incremental NAO esta economizando nada relevante.')
} else {
  escrever('  -> o incremental esta funcionando.')
}
escrever('')
