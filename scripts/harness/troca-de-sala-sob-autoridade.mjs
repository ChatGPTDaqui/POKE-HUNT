// Bancada: quanto tempo o jogador fica parado em 30/30 esperando a sala nova
// (PH-386).
//
// O QUE ESTA SENDO MEDIDO, E POR QUE ISSO NAO SAI DE LEITURA DE CODIGO
// -----------------------------------------------------------------------------
// Sob autoridade remota o cliente NAO sorteia sala: ele conta abate pra barra do
// HUD andar e para em 30/30 (`salaSystem#registrarAbate`). A sala seguinte chega
// pelo flush, por `reconciliarSalaDaAutoridade`. Ou seja, o tempo que o jogador
// enxerga como "a sala nao troca" e a SOMA de tres coisas independentes:
//
//   1. divergencia de contagem — as duas simulacoes tem sequencia de sorteio
//      propria (o cliente nao tem a semente da sessao, ver core/rng.ts) e matam
//      quantidades diferentes no mesmo intervalo de relogio;
//   2. o protetor do SERVIDOR — a sala so avanca quando ELE morre (PH-202/203),
//      e o servidor reconstroi o mundo a cada janela, com o POKE de volta no
//      ponto de entrada;
//   3. o intervalo de flush — 30s, e a resposta so chega no proximo.
//
// `divergencia-de-quota.mjs` mediu SO a primeira (mediana 32,6s, pior caso
// 112s). Nenhuma bancada media a soma, que e o unico numero que o jogador sente.
// E a soma nao e derivavel das partes: o pedido de flush ao fechar a quota, o
// protetor que nasce so quando a quota fecha e a regra de "nunca para tras" da
// reconciliacao interagem.
//
// A PERGUNTA QUE ELA RESPONDE
// -----------------------------------------------------------------------------
// O relato ("ao completar os 30 a sala nao troca") e espera longa ou TRAVAMENTO?
// As duas leem igual na tela e pedem consertos opostos: espera longa e problema
// de percepcao/protocolo, travamento e defeito. A coluna que decide e a ultima —
// uma sala que nunca troca dentro do teto de tempo aparece como `travou`.
//
// COMO ELA E FIEL AO JOGO
// -----------------------------------------------------------------------------
//   - cliente: um mundo continuo com `salaSobAutoridade = true`, passo de 0,1s;
//   - servidor: um mundo NOVO por janela (`buildMapWorld` com o progresso
//     persistido: sala, abates, protetor vivo, estado do rng), simulando so a
//     duracao da janela, `silent: true` — o mesmo que `authority/src/progresso.ts`
//     faz;
//   - flush: a cada `JANELA_S` de tempo simulado, a sala do servidor entra no
//     cliente por `reconciliarSalaDaAutoridade`, que e a MESMA funcao que o
//     worldStore chama.
//
// O que ela NAO modela, de proposito: latencia de rede (a contagem regressiva de
// 3s cobre, e o pior caso medido da Edge e 1,6s) e o intervalo adaptativo de
// flush (`ajustarRitmoDeFlush` dobra ate 90s so em janela SEM evento, e janela
// de hunt tem abate).
//
// COMO RODAR
//   npm run build:engine
//   node scripts/harness/troca-de-sala-sob-autoridade.mjs
//   node scripts/harness/troca-de-sala-sob-autoridade.mjs --hunt=igneo_faixa1 --nivel=40
import {
  createRng, restoreRng, createPokeInstance, buildMapWorld, stepWorld,
  reconciliarSalaDaAutoridade, defaultGameStateData, novaSala, ABATES_POR_SALA,
} from '../../authority/engine/headless.js'

const args = process.argv.slice(2)
const opcao = (nome, padrao) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`))
  return a ? a.slice(nome.length + 3) : padrao
}

const HUNT = opcao('hunt', 'mata_faixa1')
const NIVEL = Number(opcao('nivel', 25))
const ESPECIE = opcao('especie', 'typhlosion')
const PASSO = 0.1
const JANELA_S = Number(opcao('janela', 30))
/** Teto por sala. Passar disto e o que esta bancada chama de `travou`. */
const TETO_POR_SALA_S = Number(opcao('teto', 600))
const SALAS = Number(opcao('salas', 6))
const SEMENTES = Number(opcao('sementes', 8))

function gameStateFalso(poke) {
  const dados = defaultGameStateData()
  dados.team = [poke]
  // Auto-revive LIGADO pelo mesmo motivo de `divergencia-de-quota.mjs`: sem ele
  // a corrida acaba na primeira morte e a medicao vira "tempo ate morrer".
  dados.autoToggles = { ...dados.autoToggles, autoRevive: true }
  return {
    ...dados,
    hasItem: (id) => id === 'potion' || id === 'revive',
    consumeItem: () => true,
    addGold: () => {}, addItem: () => {}, grantTrainerExp: () => {},
    setPokedexKillEntry: () => {}, setBiomaProgress: () => {}, updatePokeInstance: () => {},
    setActiveIndex: () => {}, moveTeamIndexToFront: () => {}, setTrainer: () => {},
    unlockContinent: () => {}, isContinentUnlocked: () => true, addCapturedPoke: () => {},
    incrementPerfStats: () => {}, isItemLocked: () => false, removeItem: () => {},
    addPokeToTeam: () => {}, moveTeamToBag: () => {},
  }
}

const chaveDaSala = (sala) => (sala ? `${sala.ciclos}:${sala.indice}` : 'nenhuma')

/**
 * Uma janela do servidor: mundo reconstruido do progresso, simulado por
 * `JANELA_S`, e o progresso lido de volta.
 *
 * O rng atravessa por `restoreRng` (as colunas `rng_state`/`rng_draws` de
 * `game_sessions`), e o POKE e o MESMO objeto entre janelas — o servidor grava
 * hp/level/exp, entao o dano nao volta atras na borda da janela.
 */
function janelaDoServidor(estadoDoServidor, gameState, duracaoS) {
  const rng = restoreRng(estadoDoServidor.rngState, estadoDoServidor.rngDraws)
  const world = buildMapWorld(
    HUNT,
    estadoDoServidor.poke,
    { seed: estadoDoServidor.seed, rng, counters: { entity: 1, effect: 1, pendingHit: 1 } },
    { sala: estadoDoServidor.sala, protetorPendente: estadoDoServidor.protetorPendente },
  )
  for (let t = 0; t < Math.round(duracaoS / PASSO); t++) {
    stepWorld(world, PASSO, gameState, { silent: true })
  }
  estadoDoServidor.sala = world.sala ? { ...world.sala } : null
  estadoDoServidor.protetorPendente = world.protetorPendente ?? null
  estadoDoServidor.rngState = rng.state
  estadoDoServidor.rngDraws = rng.draws
  return estadoDoServidor.sala
}

/**
 * Uma corrida: um cliente e um servidor partindo da MESMA sala inicial (é o que
 * `/sessao/abrir` garante), até completar `SALAS` trocas ou estourar o teto.
 */
function corrida(semente) {
  const rngDaSessao = createRng(semente)
  const salaInicial = novaSala(rngDaSessao, HUNT, 0, 0)

  // Cliente: POKE e rng PROPRIOS. A predicao nao conhece a semente da sessao —
  // e isso, e nao um detalhe da bancada, e a origem da divergencia medida.
  const rngCliente = createRng(semente * 7919 + 13)
  const pokeCliente = createPokeInstance(rngCliente, ESPECIE, NIVEL)
  const gameStateCliente = gameStateFalso(pokeCliente)
  const cliente = buildMapWorld(
    HUNT, pokeCliente,
    { seed: 0, rng: rngCliente, counters: { entity: 1, effect: 1, pendingHit: 1 } },
    { sala: salaInicial },
  )
  cliente.salaSobAutoridade = true

  const pokeServidor = createPokeInstance(createRng(semente), ESPECIE, NIVEL)
  const gameStateServidor = gameStateFalso(pokeServidor)
  const estadoDoServidor = {
    seed: semente,
    poke: pokeServidor,
    sala: { ...salaInicial },
    protetorPendente: null,
    rngState: rngDaSessao.state,
    rngDraws: rngDaSessao.draws,
  }

  const esperas = []
  let salaAtual = chaveDaSala(cliente.sala)
  let quotaFechadaEm = null
  let abatesDoServidorNaQuota = null
  let t = 0
  const passosPorJanela = Math.round(JANELA_S / PASSO)
  const tetoDePassos = Math.round(TETO_POR_SALA_S / PASSO)
  let passosNestaSala = 0
  let ultimoFlush = 0
  let pediuNestaSala = false

  while (esperas.length < SALAS) {
    stepWorld(cliente, PASSO, gameStateCliente, { silent: false })
    t += 1
    passosNestaSala += 1

    if (quotaFechadaEm == null && (cliente.sala?.abates ?? 0) >= ABATES_POR_SALA) {
      quotaFechadaEm = t
      abatesDoServidorNaQuota = estadoDoServidor.sala?.abates ?? 0
    }

    // O PEDIDO NA HORA (autoridade.ts#observarQuotaDeSala): quota fechada
    // dispara `liquidar()` imediatamente em vez de esperar o proximo intervalo.
    // Modelar isto e obrigatorio — sem ele a bancada mediria um jogo que espera
    // sempre o ciclo cheio, e o piso da espera sairia inflado em ate 30s. UMA
    // vez por sala, e depois a repeticao volta ao intervalo normal
    // (`REPETIR_PEDIDO_DE_SALA_MS` = `INTERVALO_FLUSH_MS`).
    const pedidoAgora = quotaFechadaEm === t && !pediuNestaSala
    if (pedidoAgora) pediuNestaSala = true

    if (pedidoAgora || t - ultimoFlush >= passosPorJanela) {
      const duracaoS = (t - ultimoFlush) * PASSO
      ultimoFlush = t
      const salaDoServidor = janelaDoServidor(estadoDoServidor, gameStateServidor, duracaoS)
      reconciliarSalaDaAutoridade(cliente, salaDoServidor ? { ...salaDoServidor } : null, undefined)
    }

    const agora = chaveDaSala(cliente.sala)
    if (agora !== salaAtual) {
      esperas.push({
        sala: salaAtual,
        // A espera que o JOGADOR sente: da barra cheia ate a cena trocar. Sala
        // que trocou sem a quota fechar (servidor adiante) entra como 0 — e o
        // outro lado da mesma divergencia, e nao uma espera.
        esperaS: quotaFechadaEm == null ? 0 : ((t - quotaFechadaEm) * PASSO),
        quotaFechou: quotaFechadaEm != null,
        abatesDoServidorNaQuota,
        travou: false,
      })
      salaAtual = agora
      quotaFechadaEm = null
      abatesDoServidorNaQuota = null
      passosNestaSala = 0
      pediuNestaSala = false
      continue
    }

    if (passosNestaSala >= tetoDePassos) {
      esperas.push({
        sala: salaAtual,
        esperaS: quotaFechadaEm == null ? TETO_POR_SALA_S : ((t - quotaFechadaEm) * PASSO),
        quotaFechou: quotaFechadaEm != null,
        abatesDoServidorNaQuota,
        travou: true,
      })
      break
    }
  }

  return esperas
}

function percentil(valores, p) {
  if (valores.length === 0) return 0
  const ordenado = [...valores].sort((a, b) => a - b)
  const i = Math.min(ordenado.length - 1, Math.floor((p / 100) * ordenado.length))
  return ordenado[i]
}

console.log(`hunt ${HUNT}, POKE ${ESPECIE} Lv${NIVEL}, janela de flush ${JANELA_S}s, ${SEMENTES} sementes x ate ${SALAS} salas`)
console.log(`teto por sala: ${TETO_POR_SALA_S}s (passar disto conta como travou)\n`)

const todas = []
for (let s = 1; s <= SEMENTES; s++) {
  const esperas = corrida(s * 101)
  todas.push(...esperas)
  const resumo = esperas
    .map((e) => (e.travou ? 'TRAVOU' : `${e.esperaS.toFixed(1)}s`))
    .join('  ')
  console.log(`semente ${String(s).padStart(2)} | ${resumo}`)
}

const comQuota = todas.filter((e) => e.quotaFechou && !e.travou).map((e) => e.esperaS)
const semQuota = todas.filter((e) => !e.quotaFechou).length
const travadas = todas.filter((e) => e.travou).length

console.log(`\n${todas.length} trocas de sala observadas`)
console.log(`  barra CHEIA esperando o servidor: ${comQuota.length}`)
console.log(`  sala trocou ANTES de a barra fechar (servidor adiante): ${semQuota}`)
console.log(`  travadas (nunca trocaram em ${TETO_POR_SALA_S}s): ${travadas}`)
if (comQuota.length > 0) {
  console.log(`\ntempo parado em ${ABATES_POR_SALA}/${ABATES_POR_SALA}:`)
  console.log(`  mediana ${percentil(comQuota, 50).toFixed(1)}s`)
  console.log(`  p90     ${percentil(comQuota, 90).toFixed(1)}s`)
  console.log(`  pior    ${Math.max(...comQuota).toFixed(1)}s`)
}
process.exit(travadas > 0 ? 2 : 0)
