// Bancada: a distribuicao de spawn das 1.815 salas do jogo, e quem a decide.
//
// A PERGUNTA, E POR QUE ELA PRECISOU DE BANCADA
// -----------------------------------------------------------------------------
// A chance de aparicao nunca foi um numero escrito em lugar nenhum: ela era o
// produto de quatro camadas (peso de sub-bioma, faixa de tier do PokeRogue,
// desempate pelo `spawn_tier` real limitado a 4:1, e o teto de fatia). Ninguem
// tinha olhado o RESULTADO delas juntas.
//
// O QUE ELA ACHOU, e que abriu a PH-498
// -----------------------------------------------------------------------------
//   1.355 das 1.815 salas (75%) com a especie mais comum travada em EXATAMENTE
//   35% — o `TETO_DE_FATIA`. Mediana da fatia do top-1 no jogo inteiro: 35,0%.
//
// Ou seja: o numero que o jogador via era o teto, e nao o dado. O tier do
// PokeRogue e o `spawn_tier` real dos jogos — o dado melhor fundamentado do
// projeto — eram engolidos em tres quartos do jogo.
//
// Achou tambem os pools degenerados: `urbano_e3/dojo` na sala 4 com pool de UM
// (Meditite 100%) e 11 salas com pool <= 2, isentas do teto por construcao
// (`POOL_MINIMO_PRA_TETO` e 3), com `industrial_e5/factory` em Machoke 93,8%.
//
// DEPOIS DA PH-502/503: 567 salas no teto (31%), mediana 27,3%, nenhuma sala
// com pool abaixo de 3.
//
// POR QUE ELA NAO E UM TESTE
// -----------------------------------------------------------------------------
// Ela e o instrumento de LEITURA — dumpa o JSON inteiro pra inspecao e ordena
// pelo pior caso. A guarda que reprova regressao mora em
// `src/data/elencoPorEstagio.test.ts` ("o teto de fatia nao decide a chance na
// maioria das salas"), que e onde o CI a le.
//
// COMO RODAR
//   node scripts/harness/folha-de-spawn.mjs
// O JSON completo sai em `scripts/harness/saida/spawn-por-sala.json` (gitignorado).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const RAIZ = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const SAIDA = path.join(RAIZ, 'scripts/harness/saida/spawn-por-sala.json')

const servidor = await createServer({
  root: RAIZ, configFile: false, logLevel: 'error',
  resolve: { alias: { '@': path.resolve(RAIZ, 'src') } },
  server: { middlewareMode: true },
})
const sala = await servidor.ssrLoadModule('/src/engine/systems/salaSystem.ts')
const est = await servidor.ssrLoadModule('/src/data/estagios.ts')
const bio = await servidor.ssrLoadModule('/src/data/biomas.ts')
const { MAPS } = await servidor.ssrLoadModule('/src/data/maps.ts')
const { POOL_POR_SALA, TETO_DE_FATIA } = await servidor.ssrLoadModule('/src/data/huntSpawnOverrides.ts')
const { getEncounter } = await servidor.ssrLoadModule('/src/data/enemies.ts')

const linhas = []
for (const bioma of bio.BIOMAS) {
  for (let estagio = 1; estagio <= est.ESTAGIOS_POR_BIOMA; estagio++) {
    const id = est.estagioId(bioma.chave, estagio)
    const faixa = est.niveisDoEstagio(estagio)
    const pesosSub = est.pesosDoEstagio(bioma, estagio)
    for (const chave of Object.keys(POOL_POR_SALA[id] ?? {})) {
      for (let indice = 0; indice < est.salasDoEstagio(estagio); indice++) {
        const ctx = sala.contextoDeSpawn(
          id, faixa, { chave, indice, abates: 0, ciclos: 0 }, MAPS[id].enemyPool,
        )
        const soma = ctx.pool.reduce((s, x) => s + ctx.peso(x), 0)
        if (!(soma > 0)) continue
        linhas.push({
          bioma: bioma.chave, estagio, sub: chave, sala: indice,
          pesoSub: pesosSub[chave] ?? 0, janela: ctx.janela, n: ctx.pool.length,
          itens: ctx.pool.map((encId) => {
            const enc = getEncounter(encId)
            return { sp: enc.speciesId, pct: ctx.peso(encId) / soma, lv: [enc.minLevel, enc.maxLevel] }
          }).sort((a, b) => b.pct - a.pct),
        })
      }
    }
  }
}

fs.mkdirSync(path.dirname(SAIDA), { recursive: true })
fs.writeFileSync(SAIDA, JSON.stringify(linhas))

const out = (s) => process.stdout.write(s)
const tops = linhas.map((l) => l.itens[0].pct).sort((a, b) => a - b)
const q = (p) => (tops[Math.floor(tops.length * p)] * 100).toFixed(1)
const noTeto = linhas.filter((l) => l.itens[0].pct >= TETO_DE_FATIA - 1e-3).length

out(`${linhas.length} salas medidas | pool medio ${(linhas.reduce((a, l) => a + l.n, 0) / linhas.length).toFixed(1)}\n`)
out(`fatia do top-1: p10 ${q(0.1)}% | mediana ${q(0.5)}% | p90 ${q(0.9)}% | teto ${(TETO_DE_FATIA * 100).toFixed(0)}%\n`)
out(`salas com o top-1 NO TETO: ${noTeto} (${(100 * noTeto / linhas.length).toFixed(0)}%)  <- era 1.355 (75%) antes da PH-502\n`)
for (const limite of [1, 2, 3]) {
  out(`salas com pool <= ${limite}: ${linhas.filter((l) => l.n <= limite).length}\n`)
}

out('\nTOP 12 salas mais concentradas:\n')
for (const l of [...linhas].sort((a, b) => b.itens[0].pct - a.itens[0].pct).slice(0, 12)) {
  out(`  ${`${l.bioma}_e${l.estagio}`.padEnd(22)} ${l.sub.padEnd(14)} sala ${l.sala}  ` +
      `${l.itens[0].sp.padEnd(12)} ${(l.itens[0].pct * 100).toFixed(1)}%  (pool ${l.n})\n`)
}

// A OUTRA PONTA, e ela e a que o teto de fatia protege: especie cujo MELHOR caso
// no jogo inteiro e desprezivel saiu do jogo na pratica, com sprite e Bestiario
// no lugar. O piso que `hunts.test.ts` cobra e 0,05%.
const melhor = new Map()
for (const l of linhas) for (const it of l.itens) {
  if (it.pct > (melhor.get(it.sp) ?? 0)) melhor.set(it.sp, it.pct)
}
const invisiveis = [...melhor].filter(([, p]) => p < 0.02).sort((a, b) => a[1] - b[1])
out(`\n${melhor.size} especies aparecem em alguma sala.\n`)
out(`${invisiveis.length} tem o MELHOR caso abaixo de 2% (era 37 antes da PH-502):\n`)
for (const [sp, p] of invisiveis.slice(0, 12)) out(`  ${sp.padEnd(14)} ${(p * 100).toFixed(2)}%\n`)
out(`\nJSON completo em ${path.relative(RAIZ, SAIDA)}\n`)

await servidor.close()
