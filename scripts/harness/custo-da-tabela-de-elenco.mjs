// Bancada: quanto custou trocar a chance-por-tier pela tabela de elenco (PH-504).
//
// POR QUE ELA E GATE, E NAO CONFERENCIA OPCIONAL
// -----------------------------------------------------------------------------
// `src/data/huntSpawnOverrides.ts` monta as 120 hunts em TEMPO DE IMPORT, e o
// modulo esta no grafo do cliente E no da Edge Function. Na Edge isso acontece a
// cada COLD START, dentro da janela de flush que e o recurso escasso do projeto:
// se a montagem custar caro, ela come tempo de simulacao de todo jogador que
// pegar um isolate frio.
//
// A PH-502 acrescentou 330 tabelas (4.266 linhas) a esse grafo e trocou o
// caminho de sorteio. Ninguem tinha medido.
//
// COMO ELA CONSEGUE UM A/B DE VERDADE
// -----------------------------------------------------------------------------
// O bundle da Edge (`supabase/functions/jogo/servidor.js`) e VERSIONADO. Entao
// os dois artefatos existem prontos: o de `origin/dev` (antes) e o da arvore
// (depois). Da pra importar os dois e cronometrar o mesmo trabalho.
//
// Isso e melhor que reconstruir o motor num checkout antigo por duas razoes: o
// artefato e o que a Edge de fato carregava (nao uma reconstrucao que pode
// divergir), e nao precisa mexer no diretorio de trabalho, que neste projeto e
// compartilhado por varias sessoes.
//
// TRES CUIDADOS DE MEDICAO, cada um cobrindo um jeito de errar aqui
// -----------------------------------------------------------------------------
// 1. PROCESSO NOVO por rodada. O cache de modulo do Node faz o segundo import do
//    mesmo arquivo custar zero — medir num laco daria a resposta errada com
//    muita confianca. A Edge tambem paga o preco cheio a cada isolate frio.
// 2. ORDEM ALTERNADA entre as duas versoes. Rodar todas de uma e depois todas da
//    outra deixa o aquecimento da maquina (cache de disco, turbo da CPU) cair
//    inteiro num dos lados.
// 3. MEDIANA e nao media. Uma rodada engolida pelo GC ou por outro processo
//    desta maquina (o diretorio e compartilhado) move a media e nao a mediana.
//
// COMO RODAR
//   node scripts/harness/custo-da-tabela-de-elenco.mjs
//   node scripts/harness/custo-da-tabela-de-elenco.mjs --rodadas=15
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const RAIZ = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const args = process.argv.slice(2)
const opcao = (nome, padrao) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`))
  return a ? a.slice(nome.length + 3) : padrao
}
const RODADAS = Number(opcao('rodadas', 9))
const BASE = opcao('base', 'origin/dev')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'custo-elenco-'))
const CAMINHO = path.join(RAIZ, 'supabase/functions/jogo/servidor.js')

// O bundle de ANTES sai do git; o de DEPOIS e o da arvore.
const antes = path.join(tmp, 'antes.mjs')
fs.writeFileSync(antes, execFileSync('git', ['show', `${BASE}:supabase/functions/jogo/servidor.js`], {
  cwd: RAIZ, maxBuffer: 64 * 1024 * 1024,
}))
const depois = path.join(tmp, 'depois.mjs')
fs.copyFileSync(CAMINHO, depois)

// O medidor roda em processo NOVO e imprime uma linha de JSON.
//
// `pathToFileURL` E OBRIGATORIO NO WINDOWS: `import('C:\\...')` estoura com
// `ERR_UNSUPPORTED_ESM_URL_SCHEME`, porque o Node le `C:` como esquema de URL.
const medidor = path.join(tmp, 'medir.mjs')
fs.writeFileSync(medidor, [
  "import { pathToFileURL } from 'node:url'",
  'const alvo = pathToFileURL(process.argv[2]).href',
  'const t0 = performance.now()',
  'await import(alvo)',
  'const ms = performance.now() - t0',
  'const heap = process.memoryUsage().heapUsed',
  'process.stdout.write(JSON.stringify({ ms, heap }))',
].join('\n'))

function medir(alvo) {
  const saida = execFileSync(process.execPath, [medidor, alvo], { cwd: RAIZ, encoding: 'utf8' })
  return JSON.parse(saida)
}

const amostras = { antes: [], depois: [] }
// Uma rodada de aquecimento em cada, descartada: a primeira paga cache de disco.
medir(antes); medir(depois)
for (let i = 0; i < RODADAS; i++) {
  // Alterna a ordem a cada rodada.
  const ordem = i % 2 === 0 ? ['antes', 'depois'] : ['depois', 'antes']
  for (const lado of ordem) amostras[lado].push(medir(lado === 'antes' ? antes : depois))
}

const mediana = (v) => {
  const s = [...v].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
// zlib do proprio Node, e nao `gzip` do shell: esta bancada roda no Windows e
// nao pode depender de qual shell esta no PATH.
const gzip = (arquivo) => zlib.gzipSync(fs.readFileSync(arquivo), { level: 9 }).length

const linhas = []
for (const lado of ['antes', 'depois']) {
  const ms = mediana(amostras[lado].map((x) => x.ms))
  const heap = mediana(amostras[lado].map((x) => x.heap)) / 1024 / 1024
  const arquivo = lado === 'antes' ? antes : depois
  const bruto = fs.statSync(arquivo).size / 1024
  linhas.push({ lado, ms, heap, bruto, gzip: gzip(arquivo) / 1024 })
}

process.stdout.write(`bundle da Edge, ${RODADAS} rodadas por lado, processo novo, ordem alternada\n`)
process.stdout.write(`base do A/B: ${BASE}\n\n`)
for (const l of linhas) {
  process.stdout.write(
    `${l.lado.padEnd(7)} import ${l.ms.toFixed(1).padStart(6)} ms | heap ${l.heap.toFixed(1).padStart(5)} MB | ` +
    `bruto ${l.bruto.toFixed(0).padStart(5)} KB | gzip ${l.gzip.toFixed(0).padStart(4)} KB\n`,
  )
}
const [a, d] = linhas
const pct = (x, y) => `${y > 0 ? ((x / y - 1) * 100).toFixed(1) : '-'}%`
process.stdout.write(
  `\ndelta    import ${(d.ms - a.ms).toFixed(1)} ms (${pct(d.ms, a.ms)}) | ` +
  `heap ${(d.heap - a.heap).toFixed(1)} MB (${pct(d.heap, a.heap)}) | ` +
  `gzip ${(d.gzip - a.gzip).toFixed(0)} KB (${pct(d.gzip, a.gzip)})\n`,
)
process.stdout.write(
  '\nA REGUA: a janela de flush e de 30 s e o cold start paga o import UMA vez.\n' +
  'A PH-433 mediu +46 ms quando as hunts foram de 36 pra 120 e considerou que cabia.\n',
)
fs.rmSync(tmp, { recursive: true, force: true })
