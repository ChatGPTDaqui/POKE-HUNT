// Bancada: quanto custou passar de 36 pra 120 hunts (PH-433).
//
// O QUE ESTA SENDO MEDIDO, E POR QUE ELE IMPORTA
// -----------------------------------------------------------------------------
// As hunts NAO vao prontas no bundle. `src/data/huntSpawnOverrides.ts` monta
// tudo em TEMPO DE IMPORT — percorre os 12 biomas x 10 estagios, recorta cada
// linha evolutiva por sub-bioma, cria os encontros e ainda espelha o Modo
// Pesadelo inteiro por cima. E o mesmo modulo esta no grafo do cliente E no da
// Edge Function.
//
// Na Edge isso acontece a CADA COLD START, dentro da janela de flush que ja e o
// recurso escasso do projeto. Se a montagem custasse caro, ela comeria tempo de
// simulacao de todo jogador que pegasse um isolate frio.
//
// A PH-426 passou de 36 pra 120 hunts — mais de 3x o trabalho de montagem.
// "Conferir peso antes, nao depois" foi item explicito do desenho, e ninguem
// tinha medido.
//
// COMO ESTA BANCADA CONSEGUE UM A/B DE VERDADE
// -----------------------------------------------------------------------------
// O bundle da Edge (`supabase/functions/jogo/servidor.js`) e VERSIONADO, e o
// commit da PH-425 guarda a versao de 36 hunts. Entao os dois artefatos existem,
// prontos, e da pra importar os dois e cronometrar.
//
// Isso e melhor que reconstruir o motor num checkout antigo por duas razoes: o
// artefato e o que a Edge de fato carregava naquele dia (nao uma reconstrucao
// que pode divergir), e nao precisa mexer no diretorio de trabalho, que neste
// projeto e compartilhado por varias sessoes.
//
// O bundle e alvo Deno, mas importa em Node: ele so DEFINE o handler, e quem
// chama `Deno.serve` e o entrypoint da function, que fica fora do bundle.
//
// TRES CUIDADOS DE MEDICAO, e cada um cobre um jeito de errar aqui
// -----------------------------------------------------------------------------
// 1. PROCESSO NOVO por rodada. O cache de modulo do Node faz o segundo import do
//    mesmo arquivo custar zero — medir num laco daria a resposta errada com
//    muita confianca. A Edge tambem paga o preco cheio a cada isolate frio.
// 2. ORDEM ALTERNADA entre as duas versoes. Rodar todas de uma e depois todas da
//    outra deixa o aquecimento da maquina (cache de disco, turbo da CPU) cair
//    inteiro num dos lados.
// 3. MEDIANA, e nao media. A primeira rodada de qualquer processo carrega o
//    disco frio; uma media com um outlier de 900ms mente.
//
// COMO RODAR
// -----------------------------------------------------------------------------
//   node scripts/harness/custo-das-120-hunts.mjs
import { execFileSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const RAIZ = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const EDGE = join(RAIZ, 'supabase', 'functions', 'jogo', 'servidor.js')

/** O commit da PH-425: o ultimo com 36 hunts, antes de a PH-426 montar as 120. */
const SHA_DE_36_HUNTS = '1fe06c22'
const CAMINHO_NO_GIT = 'supabase/functions/jogo/servidor.js'

// 15, E NAO 7. Com 7 o delta medido (+90ms) ficou MENOR que a dispersao de
// cada lado (±270ms) — nao dava pra distinguir sinal de ruido, e um numero
// nao-conclusivo apresentado como conclusao e pior que nao medir.
const RODADAS = 15

const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

// ---------------------------------------------------------------------------
// Os dois artefatos
// ---------------------------------------------------------------------------
const agora = readFileSync(EDGE)
let antes
try {
  antes = execFileSync('git', ['show', `${SHA_DE_36_HUNTS}:${CAMINHO_NO_GIT}`], {
    cwd: RAIZ, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024,
  })
} catch (erro) {
  console.error(
    `Nao consegui ler o bundle de ${SHA_DE_36_HUNTS} (${erro.message}).\n`
    + 'Sem ele nao ha A/B — a bancada mediria so o estado atual.',
  )
  process.exit(1)
}

// Os dois vao pra um diretorio temporario com extensao `.mjs`: o bundle nao tem
// `package.json` do lado dele, e sem a extensao o Node o trataria como CommonJS.
const tmp = mkdtempSync(join(tmpdir(), 'ph433-'))
const ARQ_ANTES = join(tmp, 'servidor-36.mjs')
const ARQ_AGORA = join(tmp, 'servidor-120.mjs')
writeFileSync(ARQ_ANTES, antes)
writeFileSync(ARQ_AGORA, agora)

function medirImport(caminho) {
  const codigo = `
    const t0 = process.hrtime.bigint()
    const m = await import(${JSON.stringify(pathToFileURL(caminho).href)})
    const t1 = process.hrtime.bigint()
    void m
    console.log(JSON.stringify({
      ms: Number(t1 - t0) / 1e6,
      heap: process.memoryUsage().heapUsed,
    }))
  `
  const saida = execFileSync(process.execPath, ['--input-type=module', '-e', codigo], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  })
  return JSON.parse(saida.trim().split('\n').pop())
}

console.log('CUSTO DE MONTAR AS HUNTS — 36 contra 120 (PH-433)')
console.log('='.repeat(72))
console.log('')
console.log(`Import a frio do bundle da Edge, ${RODADAS} processos novos de cada,`)
console.log('em ordem alternada.')
console.log('')

const resultados = { antes: [], agora: [] }
for (let i = 0; i < RODADAS; i++) {
  // Alterna quem vai primeiro pra o aquecimento nao cair sempre no mesmo lado.
  if (i % 2 === 0) {
    resultados.antes.push(medirImport(ARQ_ANTES))
    resultados.agora.push(medirImport(ARQ_AGORA))
  } else {
    resultados.agora.push(medirImport(ARQ_AGORA))
    resultados.antes.push(medirImport(ARQ_ANTES))
  }
}

const linha = (rotulo, rs, buf) => {
  const ms = rs.map((r) => r.ms)
  const gz = gzipSync(buf, { level: 9 }).length
  console.log(
    `  ${rotulo.padEnd(20)}`
    + `${`${mediana(ms).toFixed(0)} ms`.padStart(9)}`
    + `${`(${Math.min(...ms).toFixed(0)}-${Math.max(...ms).toFixed(0)})`.padStart(13)}`
    + `${`${kb(rs[0].heap)}`.padStart(12)}`
    + `${kb(gz).padStart(12)}`,
  )
  return { ms: mediana(ms), min: Math.min(...ms), gz }
}

console.log(
  `  ${'versao'.padEnd(20)}${'mediana'.padStart(9)}${'(min-max)'.padStart(13)}`
  + `${'heap'.padStart(12)}${'gzip'.padStart(12)}`,
)
console.log('  ' + '-'.repeat(70))
const a = linha(`36 hunts (${SHA_DE_36_HUNTS})`, resultados.antes, antes)
const b = linha('120 hunts (agora)', resultados.agora, agora)

const deltaMs = b.ms - a.ms
const deltaGz = (b.gz / a.gz - 1) * 100

console.log('')
console.log(`  tempo:  ${deltaMs >= 0 ? '+' : ''}${deltaMs.toFixed(0)} ms  `
  + `(${deltaMs >= 0 ? '+' : ''}${((b.ms / a.ms - 1) * 100).toFixed(1)}%)`)
console.log(`  gzip:   ${deltaGz >= 0 ? '+' : ''}${deltaGz.toFixed(1)}%`)

// O DELTA DOS MINIMOS E O QUE TORNA O SINAL LEGIVEL. A dispersao de cada lado
// (dezenas a centenas de ms) e maior que o delta das medianas, entao a mediana
// sozinha nao distingue sinal de ruido. O MINIMO e a rodada menos poluida — a
// que pegou a maquina mais limpa — e o delta entre os dois minimos e uma
// segunda leitura independente: quando ele CONVERGE com o das medianas, o sinal
// e real; quando diverge, o que se mediu foi a maquina, nao o codigo.
const deltaMin = b.min - a.min
console.log(`  minimos: ${deltaMin >= 0 ? '+' : ''}${deltaMin.toFixed(0)} ms  ` +
  `(a mediana deu ${deltaMs >= 0 ? '+' : ''}${deltaMs.toFixed(0)} ms — ` +
  `${Math.abs(deltaMin - deltaMs) < Math.max(20, Math.abs(deltaMs) * 0.4) ? 'CONVERGEM' : 'divergem'})`)
console.log('')

rmSync(tmp, { recursive: true, force: true })

console.log('='.repeat(72))
console.log('COMO LER')
console.log('')
console.log('  A pergunta da issue e se a montagem precisa virar dado gerado')
console.log('  (.generated.ts) em vez de trabalho de import. A resposta esta na')
console.log('  linha `tempo` acima:')
console.log('')
console.log('  - se o delta for da ordem da dispersao (min-max) das proprias')
console.log('    medidas, o trabalho EXTRA de montar 84 hunts a mais e ruido, e')
console.log('    o meio segundo que o import custa estava la antes — ele e do')
console.log('    catalogo (386 especies, golpes, tiers, sprites), nao das hunts.')
console.log('    Trocar a montagem por dado gerado nao mexeria nele.')
console.log('')
console.log('  - se o delta for muitas vezes a dispersao, a montagem e o custo, e')
console.log('    ai vale gerar.')
console.log('')
console.log('  gzip e nao byte cru de proposito: o byte cru ja superestimou ganho')
console.log('  por 4x neste projeto, e o que trafega no deploy e o comprimido.')
console.log('')
