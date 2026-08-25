// Quem, no grafo de imports do bundle da Edge Function, puxa um pacote.
//
//   node scripts/quem-puxa-no-edge.mjs react
//   node scripts/quem-puxa-no-edge.mjs zustand immer
//
// PH-148. Existe porque descobrir isso a mao custou meia dúzia de tentativas: o
// bundle diz O QUE entrou (`//#region node_modules/react/...`) e nao COMO, e a
// cadeia real tinha quatro saltos —
//
//   edge.ts -> progresso.ts -> headless.ts -> simulation.ts
//           -> worldStore/toastStore -> zustand -> react
//
// Nenhum `grep` de import acha isso, porque nenhum arquivo do servidor escreve
// `from 'react'` em lugar nenhum.
//
// O caminho que NAO funciona, pra ninguem tentar de novo: um plugin com hook
// `resolveId` nao ve nada. Os plugins internos do Vite resolvem antes e nao
// repassam, entao o hook so e chamado pro que sobra. O que funciona e ler o
// GRAFO ja montado, no `buildEnd`, com `this.getModuleInfo(id).importers`.
import { build } from 'vite'

const ALVOS = process.argv.slice(2).filter((a) => !a.startsWith('-'))
if (!ALVOS.length) {
  console.error('uso: node scripts/quem-puxa-no-edge.mjs <pacote> [outro...]')
  console.error('exemplo: node scripts/quem-puxa-no-edge.mjs react')
  process.exit(1)
}

// Normaliza a barra ANTES de cortar a raiz: no Windows `process.cwd()` vem com
// `\` e os ids do Rollup vêm com `/`, então cortar direto não casa nada e a
// saída fica com o caminho absoluto inteiro em cada linha.
const RAIZ = process.cwd().split('\\').join('/')
const curto = (id) => String(id).split('\\').join('/').split(RAIZ).join('.')

const arestas = []

await build({
  configFile: 'vite.edge.config.ts',
  logLevel: 'error',
  // Mesma razao do teste do bundle: sem isto o build sai em modo de
  // desenvolvimento e o grafo difere do que `npm run build:edge` produz.
  mode: 'production',
  build: { outDir: 'node_modules/.tmp-quem-puxa', emptyOutDir: true },
  plugins: [{
    name: 'quem-puxa',
    buildEnd() {
      // Sobe a partir de cada modulo do alvo ate a entrada, colhendo as
      // arestas. Largura em vez de profundidade: a cadeia mais curta ate a
      // entrada e a que interessa, e ela aparece primeiro.
      const interessa = (id) => ALVOS.some((a) => id.includes(`node_modules/${a}/`) || id.includes(`node_modules\\${a}\\`))
      const fila = [...this.getModuleIds()].filter(interessa)
      const vistos = new Set()

      while (fila.length) {
        const id = fila.shift()
        if (vistos.has(id)) continue
        vistos.add(id)
        const info = this.getModuleInfo(id)
        if (!info) continue
        for (const importador of info.importers) {
          arestas.push({ de: importador, para: id })
          // Nao sobe dentro de `node_modules`: a cadeia que se quer consertar
          // e a do NOSSO codigo. Onde o pacote de terceiro importa outro
          // pacote de terceiro nao ha o que decidir.
          if (!/node_modules/.test(importador)) fila.push(importador)
        }
      }
    },
  }],
})

if (!arestas.length) {
  console.log(`Nenhum dos alvos (${ALVOS.join(', ')}) esta no bundle da Edge Function.`)
  process.exit(0)
}

// Agrupa por quem IMPORTA, que e o lado acionavel: e o arquivo que alguem vai
// ter que abrir e mudar.
const porImportador = new Map()
for (const { de, para } of arestas) {
  const lista = porImportador.get(de) ?? new Set()
  lista.add(para)
  porImportador.set(de, lista)
}

console.log(`Quem puxa ${ALVOS.join(' / ')} no bundle da Edge Function:\n`)

const nossos = [...porImportador.entries()].filter(([de]) => !/node_modules/.test(de))
const terceiros = [...porImportador.entries()].filter(([de]) => /node_modules/.test(de))

console.log('NO NOSSO CODIGO (e aqui que se conserta):')
for (const [de, paras] of nossos) {
  console.log(`  ${curto(de)}`)
  for (const para of paras) console.log(`      -> ${curto(para)}`)
}

if (terceiros.length) {
  console.log('\nDENTRO DE node_modules (contexto, nao acionavel):')
  for (const [de, paras] of terceiros) {
    console.log(`  ${curto(de)}`)
    for (const para of paras) console.log(`      -> ${curto(para)}`)
  }
}

console.log('\n`src/engine/reactForaDoServidor.test.ts` guarda o resultado.')
