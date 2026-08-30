// Bancada: quanto o servidor PERDE por reconstruir o mundo a cada janela (PH-278).
//
// O QUE ESTA SENDO MEDIDO
// -----------------------------------------------------------------------------
// O servidor nao guarda posicao. A cada flush ele monta o mundo do zero com
// `buildMapWorld` (authority/src/progresso.ts): o POKE volta pro ponto de
// entrada, os inimigos sao recriados nos pontos de spawn e `world.lure` nasce
// vazio. O que atravessa a janela e so o progresso que tem coluna — `rng_state`,
// `sala`, `sequence_index`, `sala_protetor`.
//
// A hipotese da PH-278 e que isso cria um CUSTO FIXO por janela, pago em toda
// janela e nao uma vez por hunt, com duas parcelas:
//
//   CAMINHADA  o POKE nasce no `playerSpawn` e anda ate o primeiro alvo antes
//              de bater a primeira vez.
//   REUNIAO    com o Lure ligado, `world.lure` volta pra fase `reunindo` com o
//              relogio cheio (18s), e desde PH-264 o golpe do jogador fica
//              SEGURADO durante a reuniao. Janela mais curta que a reuniao =
//              janela inteira andando sem bater.
//
// O QUE A BANCADA ACHOU, E POR QUE ELA PRECISOU DE VARIAS SEMENTES
// -----------------------------------------------------------------------------
// A reconstrucao tem DOIS efeitos de sinais opostos, e a issue so contava um:
//
//   CONTRA  o custo fixo acima (rampa ate o primeiro abate).
//   A FAVOR  a janela nova nasce com o campo CHEIO — 6 selvagens de pe na hora,
//            sem pagar o `respawnDelay` que a janela continua pagaria.
//
// Com uma semente so os dois se cancelam dentro do ruido, e o ruido de corrida
// unica passa de 15%: a primeira versao desta bancada mediu perdas NEGATIVAS
// (janela curta rendendo MAIS que a continua) em 4 dos 6 tamanhos. Por isso ela
// roda N sementes e reporta a media — conclusao tirada de uma corrida so aqui
// seria sorteio, nao medicao.
//
// COMO ELA MEDE
// -----------------------------------------------------------------------------
// Mesmo total de tempo simulado (`SEGUNDOS_TOTAIS`), fatiado em janelas de
// tamanhos diferentes, repetido por semente. A janela unica e a referencia: e o
// que a hunt renderia se o mundo nunca fosse reconstruido.
//
// `rampa` isola a parcela do custo fixo que a compensacao NAO esconde: a soma
// dos segundos de cada janela ate o primeiro abate DAQUELA janela. Ela mede o
// pedagio bruto; a coluna de abates mede o saldo depois da compensacao.
//
// A reconstrucao imita `simularJanela` de progresso.ts, inclusive retomar o RNG
// com `restoreRng` (e nao `createRng(seed)`, que faria toda janela repetir os
// mesmos inimigos) e carregar `sala` de volta.
//
// COMO RODAR
//   npm run build:engine    # gera authority/engine/headless.js (gitignored)
//   node scripts/harness/custo-fixo-por-janela.mjs
//
// Usa o bundle do motor (`authority/engine/headless.js`), o MESMO artefato que a
// Edge carrega — o numero medido e o do servidor, nao o de um build de teste.
import {
  createRng, restoreRng, createPokeInstance, buildMapWorld, stepWorld,
  defaultGameStateData, LIVE_SIM_STEP_SECONDS,
} from '../../authority/engine/headless.js'

const HUNT = 'mata_faixa1'
const SEGUNDOS_TOTAIS = 900 // 15 min de hunt
const SEMENTES = [7, 101, 2029, 4242, 31337, 55555, 8080, 90210]
const JANELAS = [3, 5, 8, 10, 12, 15, 20, 30, SEGUNDOS_TOTAIS]
const PASSO = LIVE_SIM_STEP_SECONDS // jogo ao vivo: o regime que o flush de 30s usa

// Adaptador minimo do store — mesmo do custo-do-lure.mjs. Escrito por extenso,
// e nao via Proxy, pra a bancada quebrar alto se o motor passar a exigir algo
// novo em vez de silenciosamente devolver `undefined`.
function criarStore(poke, lureConfig) {
  const dados = defaultGameStateData()
  dados.team = [poke]
  dados.lureConfig = lureConfig
  return {
    ...dados,
    setActiveIndex() {}, addItem() {}, hasItem: () => true, removeItem: () => true,
    addGold() {}, spendGold: () => true, addDiamonds() {}, spendDiamonds: () => true,
    addCapturedPoke: () => 'bag', toggleItemLock() {}, isItemLocked: () => false,
    unlockMap() {}, isMapUnlocked: () => true, unlockContinent() {}, isContinentUnlocked: () => true,
    healTeamFully() {}, setCurrentMapId() {}, addPokeToTeam() {}, moveTeamIndexToFront() {},
    reordenarReservas() {}, removeBagPokes: () => [], updatePokeInstance() {}, setTrainer() {},
    resetPerfStats() {}, incrementPerfStats() {}, setPokedexKillEntry() {},
    setMissaoReivindicada() {}, setEspecialidadeNivel() {}, setBiomaProgress() {},
    setAutoToggle() {}, setAutoStatusItem() {}, addAutoPotRule() {}, updateAutoPotRule() {},
    removeAutoPotRule() {}, setAutoCatchConfig() {}, setAutoSellConfig() {}, setLureConfig() {},
    addAutoCatchRule() {}, updateAutoCatchRule() {}, removeAutoCatchRule() {},
    resetToDefaults() {},
  }
}

/**
 * Simula `SEGUNDOS_TOTAIS` em janelas de `janela` segundos, reconstruindo o
 * mundo entre uma e outra exatamente como o servidor faz.
 */
function medir(janela, lureConfig, semente) {
  const poke = createPokeInstance(createRng(semente), 'charmander', 40)
  const store = criarStore(poke, lureConfig)
  let rngEstado = { state: semente, draws: 0 }
  let sala = null
  let abates = 0
  let rampa = 0

  for (let inicio = 0; inicio < SEGUNDOS_TOTAIS; inicio += janela) {
    const duracao = Math.min(janela, SEGUNDOS_TOTAIS - inicio)
    const world = buildMapWorld(
      HUNT, poke,
      { rng: restoreRng(rngEstado.state, rngEstado.draws), seed: semente, counters: { entity: 1, effect: 1, pendingHit: 1 } },
      { sequenceIndex: 0, sequenceCleared: false, sala, protetorPendente: null },
      [],
    )

    let abatesNaJanela = 0
    for (let t = 0; t < duracao; t += PASSO) {
      const mortos = stepWorld(world, PASSO, store, { silent: true }).length
      abates += mortos
      abatesNaJanela += mortos
      if (abatesNaJanela === 0) rampa += PASSO
    }

    sala = world.sala ? { ...world.sala } : null
    rngEstado = { state: world.rng.state, draws: world.rng.draws }
  }

  return { abates, rampa }
}

const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const desvio = (xs) => {
  const m = media(xs)
  return Math.sqrt(media(xs.map((x) => (x - m) ** 2)))
}

const CENARIOS = process.env.SO_LURE4 ? [['lure ligado (4)', { ligado: true, quantidade: 4 }]] : [
  ['lure desligado', { ligado: false, quantidade: 2 }],
  ['lure ligado (2)', { ligado: true, quantidade: 2 }],
  ['lure ligado (4)', { ligado: true, quantidade: 4 }],
]

console.log(
  `${SEGUNDOS_TOTAIS}s de hunt em ${HUNT}, passo de ${PASSO.toFixed(4)}s (jogo ao vivo).\n`
  + `${SEMENTES.length} sementes por celula; mundo reconstruido a cada janela, igual ao flush do servidor.\n`
  + 'rampa = segundos somados, por janela, do inicio ate o primeiro abate daquela janela.\n',
)

for (const [rotulo, lureConfig] of CENARIOS) {
  console.log(`--- ${rotulo} ---`)
  console.log('janela  janelas   abates (dp)   abates/min   saldo vs janela unica     rampa   rampa/janela')

  const piso = SEMENTES.map((s) => medir(SEGUNDOS_TOTAIS, lureConfig, s))
  const pisoAbates = media(piso.map((r) => r.abates))

  for (const janela of JANELAS) {
    const rs = janela === SEGUNDOS_TOTAIS ? piso : SEMENTES.map((s) => medir(janela, lureConfig, s))
    const n = Math.ceil(SEGUNDOS_TOTAIS / janela)
    const abates = media(rs.map((r) => r.abates))
    const dp = desvio(rs.map((r) => r.abates))
    const rampa = media(rs.map((r) => r.rampa))
    const saldo = pisoAbates > 0 ? (abates / pisoAbates - 1) * 100 : 0
    console.log(
      `${String(janela).padStart(5)}s`
      + `${String(n).padStart(9)}`
      + `${`${abates.toFixed(1)} (${dp.toFixed(1)})`.padStart(14)}`
      + `${(abates / (SEGUNDOS_TOTAIS / 60)).toFixed(1).padStart(13)}`
      + `${(janela === SEGUNDOS_TOTAIS ? 'referencia' : `${saldo >= 0 ? '+' : ''}${saldo.toFixed(1)}%`).padStart(24)}`
      + `${`${rampa.toFixed(0)}s`.padStart(10)}`
      + `${`${(rampa / n).toFixed(1)}s`.padStart(15)}`,
    )
  }
  console.log('')
}
