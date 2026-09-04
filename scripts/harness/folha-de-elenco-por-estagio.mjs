// Folha de conferencia: o que cada um dos 120 estagios entrega, sub-bioma por
// sub-bioma (PH-504).
//
// A PERGUNTA QUE ELA RESPONDE, E QUE NENHUM TESTE RESPONDE
// -----------------------------------------------------------------------------
// Os testes cobram invariante: soma 1, ninguem acima do teto, ninguem sem casa,
// nenhuma sala com menos de tres especies. Nada disso diz se o estagio 10 do
// Marinho FICOU COM CARA de fundo do mar, ou se o estagio 1 da Mata entrega o
// Bosque Viridiana. Essa e uma pergunta de leitura, e ela precisa da lista na
// frente dos olhos.
//
// E o artefato que responde ao pedido de "dar profundidade a cada escolha de
// estagio": da pra ler os dez degraus de um bioma em sequencia e ver o elenco
// afundar.
//
// O QUE CADA LINHA MOSTRA
//   fatia    a chance da LINHA no sub-bioma daquele estagio (a tabela gerada)
//   Lv       a faixa de nivel em que a forma correta daquela linha nasce ali
//   forma    qual forma o estagio de fato entrega (a raiz pode nem spawnar:
//            Bulbasaur e raiz de Ivysaur e existe so na tela de escolha)
//   origem   `real` = vaga de encontro de rb/gsc/emerald; `pr` = pool do
//            PokeRogue, que e a fonte dos 11 sub-biomas sem analogo em Gen I-III
//
// COMO RODAR
//   node scripts/harness/folha-de-elenco-por-estagio.mjs                  (resumo dos 12)
//   node scripts/harness/folha-de-elenco-por-estagio.mjs --bioma=marinho  (os 10 degraus de um)
//   node scripts/harness/folha-de-elenco-por-estagio.mjs --tudo > folha.txt
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const RAIZ = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const args = process.argv.slice(2)
const opcao = (nome, padrao) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`))
  return a ? a.slice(nome.length + 3) : padrao
}
const SO_BIOMA = opcao('bioma', null)
const TUDO = args.includes('--tudo')
const TOPO = Number(opcao('topo', 8))

const servidor = await createServer({
  root: RAIZ, configFile: false, logLevel: 'error',
  resolve: { alias: { '@': path.resolve(RAIZ, 'src') } },
  server: { middlewareMode: true },
})
const { BIOMAS } = await servidor.ssrLoadModule('/src/data/biomas.ts')
const est = await servidor.ssrLoadModule('/src/data/estagios.ts')
const { raizDaLinha } = await servidor.ssrLoadModule('/src/data/huntSpawnOverrides.ts')
const { MAPS } = await servidor.ssrLoadModule('/src/data/maps.ts')
const { contextoDeSpawn } = await servidor.ssrLoadModule('/src/engine/systems/salaSystem.ts')
const { getEncounter } = await servidor.ssrLoadModule('/src/data/enemies.ts')
const { SPECIES } = await servidor.ssrLoadModule('/src/data/pokes.ts')
const { ELENCO_POR_ESTAGIO } = await servidor.ssrLoadModule('/src/data/generated/elencoPorEstagio.generated.ts')

const auditoria = JSON.parse(
  fs.readFileSync(path.join(RAIZ, 'scripts/elenco-por-estagio.auditoria.json'), 'utf8'),
).tabelas

const out = (s) => process.stdout.write(s)

/**
 * A chance de cada LINHA num (estagio, sub-bioma), como o jogador a encontra:
 * media sobre os indices de sala, pelo mesmo `contextoDeSpawn` que o motor usa.
 *
 * Ler a tabela gerada direto daria o numero ANTES do teto e antes da janela de
 * nivel — e o que o jogador ve e depois dos dois.
 */
function chanceReal(mapId, estagio, chave) {
  const map = MAPS[mapId]
  const faixa = est.niveisDoEstagio(estagio)
  const salas = est.salasDoEstagio(estagio)
  const porLinha = new Map()
  for (let indice = 0; indice < salas; indice++) {
    const ctx = contextoDeSpawn(mapId, faixa, { chave, indice, abates: 0, ciclos: 0 }, map.enemyPool)
    const total = ctx.pool.reduce((s, id) => s + ctx.peso(id), 0)
    if (!(total > 0)) continue
    for (const id of ctx.pool) {
      const enc = getEncounter(id)
      const raiz = raizDaLinha(enc.speciesId)
      const atual = porLinha.get(raiz) ?? { fatia: 0, formas: new Map() }
      atual.fatia += (ctx.peso(id) / total) / salas
      const f = atual.formas.get(enc.speciesId) ?? { lo: Infinity, hi: 0 }
      f.lo = Math.min(f.lo, enc.minLevel)
      f.hi = Math.max(f.hi, enc.maxLevel)
      atual.formas.set(enc.speciesId, f)
      porLinha.set(raiz, atual)
    }
  }
  return [...porLinha.entries()].sort((a, b) => b[1].fatia - a[1].fatia)
}

const nome = (id) => SPECIES[id]?.name ?? id

function folhaDoBioma(bioma) {
  out(`\n${'='.repeat(78)}\n${bioma.nome.toUpperCase()}  (${bioma.chave}, tipo ${bioma.tipo})\n${'='.repeat(78)}\n`)
  for (let estagio = 1; estagio <= est.ESTAGIOS_POR_BIOMA; estagio++) {
    const mapId = est.estagioId(bioma.chave, estagio)
    const [lo, hi] = est.niveisDoEstagio(estagio)
    const pesos = est.pesosDoEstagio(bioma, estagio)
    const ativos = bioma.subBiomas.filter((s) => (pesos[s.chave] ?? 0) > 0)
    out(`\n-- estagio ${String(estagio).padStart(2)}  Lv ${lo}-${hi}  `)
    out(`${est.salasDoEstagio(estagio)} salas  |  `)
    out(`${ativos.map((s) => `${s.nome} ${(pesos[s.chave] * 100).toFixed(0)}%`).join('  ')}\n`)
    for (const sub of ativos) {
      const linhas = chanceReal(mapId, estagio, sub.chave)
      const aud = auditoria[`${sub.chave}|${estagio}`]
      const origemDe = new Map((aud?.linhas ?? []).map((l) => [l.linha, l.origem === 'real' ? 'real' : 'pr']))
      const herdado = aud?.herdado ? ` [elenco herdado do estagio ${aud.estagioDaFonte}]` : ''
      out(`   ${sub.nome}${herdado}\n`)
      for (const [raiz, dados] of linhas.slice(0, TOPO)) {
        const formas = [...dados.formas.entries()]
          .sort((a, b) => a[1].lo - b[1].lo)
          .map(([sp, f]) => `${nome(sp)} ${f.lo}-${f.hi}`)
          .join(' / ')
        out(`     ${(dados.fatia * 100).toFixed(1).padStart(5)}%  ${(origemDe.get(raiz) ?? '?').padEnd(4)} ${formas}\n`)
      }
      if (linhas.length > TOPO) {
        const resto = linhas.slice(TOPO).reduce((s, [, d]) => s + d.fatia, 0)
        out(`     ${(resto * 100).toFixed(1).padStart(5)}%  ....  + ${linhas.length - TOPO} linhas\n`)
      }
    }
  }
}

if (SO_BIOMA) {
  const b = BIOMAS.find((x) => x.chave === SO_BIOMA)
  if (!b) {
    out(`bioma "${SO_BIOMA}" nao existe. Os 12: ${BIOMAS.map((x) => x.chave).join(', ')}\n`)
  } else folhaDoBioma(b)
} else if (TUDO) {
  for (const b of BIOMAS) folhaDoBioma(b)
} else {
  // RESUMO: uma linha por estagio, com o topo do bioma. E a visao que deixa ver
  // o elenco AFUNDAR de um degrau pro outro, que e o assunto do redesenho.
  out('RESUMO — o topo de cada estagio, para ler a progressao dos 12 biomas.\n')
  out(`(--bioma=<chave> abre um; --tudo abre os doze; ${Object.keys(ELENCO_POR_ESTAGIO).length} sub-biomas na tabela)\n`)
  for (const bioma of BIOMAS) {
    out(`\n${bioma.nome}\n`)
    for (let estagio = 1; estagio <= est.ESTAGIOS_POR_BIOMA; estagio++) {
      const mapId = est.estagioId(bioma.chave, estagio)
      const pesos = est.pesosDoEstagio(bioma, estagio)
      const ativos = bioma.subBiomas.filter((s) => (pesos[s.chave] ?? 0) > 0)
      const [lo, hi] = est.niveisDoEstagio(estagio)
      const dominante = ativos.reduce((a, b) => (pesos[a.chave] >= pesos[b.chave] ? a : b))
      const linhas = chanceReal(mapId, estagio, dominante.chave)
      // A FORMA MOSTRADA E A DE ENTRADA DO ESTAGIO (menor nivel), e nao a de
      // saida. A primeira versao pegava a ULTIMA e o resumo mentia: a linha do
      // Weedle no estagio 1 da Mata aparecia como "Kakuna 35%", quando o que o
      // jogador encontra ali e Weedle em Lv 1-6 e Kakuna so em Lv 7-9. Quem
      // quiser as duas formas com as faixas abre a folha do bioma.
      const topo = linhas.slice(0, 3).map(([, d]) => {
        const [forma] = [...d.formas.keys()].sort((a, b) => d.formas.get(a).lo - d.formas.get(b).lo)
        const quantas = d.formas.size > 1 ? `+${d.formas.size - 1}` : ''
        return `${nome(forma)}${quantas} ${(d.fatia * 100).toFixed(0)}%`
      }).join(', ')
      out(`  e${String(estagio).padStart(2)} Lv ${String(lo).padStart(2)}-${String(hi).padStart(3)}  `)
      out(`${dominante.nome.padEnd(16)} ${topo}\n`)
    }
  }
}

await servidor.close()
