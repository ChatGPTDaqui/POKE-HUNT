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
// Nenhuma bancada media a soma, que e o unico numero que o jogador sente. E a
// soma nao e derivavel das partes: o pedido de flush ao fechar a quota, o
// protetor que nasce so quando a quota fecha e a regra de "nunca para tras" da
// reconciliacao interagem.
//
// ESTE COMENTARIO CREDITAVA `divergencia-de-quota.mjs` com ter medido a primeira
// (1) — "mediana 32,6s, pior caso 112s". ELE NAO MEDE ISSO (PH-423). Aquela
// bancada roda a MESMA funcao continua duas vezes com sementes diferentes e
// chama uma de "servidor": nao ha reconstrucao de janela em lado nenhum, entao o
// que ela mede e ruido de SEMENTE, nao a divergencia cliente-servidor. E ela usa
// `Math.abs()`, entao nao mostra direcao — e direcao e justamente o achado aqui
// (o cliente nunca e observado atras: 0 de 119 no padrao de 30s).
//
// Os numeros dela sao reais; a etiqueta estava errada. Quem quiser a divergencia
// de verdade tem que usar ESTA bancada, que e a que reconstroi a janela.
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
/**
 * Segundos entre o pedido de quota fechada e o PEDIDO EXTRA (PH-393).
 *
 * `--extra=0` desliga, e e assim que se mede o ANTES na mesma bancada e com as
 * mesmas sementes — comparar contra numero de outra rodada nao vale, porque a
 * divergencia de contagem depende da semente.
 */
const EXTRA_S = Number(opcao('extra', 12))
/** Abates do servidor, na ultima resposta, a partir dos quais o extra vale. */
const LIMIAR_QUASE_FECHADA = Number(opcao('limiar', 24))

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

  const pokeServidor = createPokeInstance(createRng(semente), ESPECIE, NIVEL)

  // Cliente: rng PROPRIO (a predicao nao conhece a semente da sessao — e isso, e
  // nao um detalhe da bancada, e a origem da divergencia de contagem), mas o
  // MESMO POKE.
  //
  // O POKE E CLONE, E NAO UMA SEGUNDA INSTANCIA SORTEADA (PH-423). Ate aqui a
  // bancada fazia `createPokeInstance(rngCliente, ...)` de um lado e
  // `createPokeInstance(createRng(semente), ...)` do outro: dois POKE com IVs e
  // natureza DIFERENTES, logo com stats diferentes. No jogo os dois lados olham a
  // MESMA linha de `pokemon_instances` — o cliente prediz com o POKE que ele tem
  // na mochila, que e o mesmo que o servidor carrega.
  //
  // Isso nao era detalhe: a medicao de travamento em janela curta depende de o
  // servidor conseguir fechar a quota, e um servidor sorteado com IV pior que o
  // do cliente trava por motivo que o jogo nao tem. Clone estrutural mantem a
  // divergencia que interessa (sorteio de combate e de spawn) e tira a que era
  // artefato (stats).
  const pokeCliente = structuredClone(pokeServidor)
  const rngCliente = createRng(semente * 7919 + 13)
  const gameStateCliente = gameStateFalso(pokeCliente)
  const cliente = buildMapWorld(
    HUNT, pokeCliente,
    { seed: 0, rng: rngCliente, counters: { entity: 1, effect: 1, pendingHit: 1 } },
    { sala: salaInicial },
  )
  cliente.salaSobAutoridade = true

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
  let pedidosDesdeQuota = 0
  let extrasPedidos = 0
  // O que a ULTIMA resposta trouxe como contagem do servidor. E o unico dado que
  // o cliente tem pra decidir se vale um pedido extra: `reconciliarSala` escreve
  // `max(local, servidor)` e apaga o numero cru, entao ele precisa ser lido
  // ANTES da reconciliacao (no jogo, dentro de `liquidar`).
  let abatesDoServidorNaResposta = 0

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
    // sempre o ciclo cheio, e o piso da espera sairia inflado em ate 30s.
    const pedidoInicial = quotaFechadaEm === t && pedidosDesdeQuota === 0

    // O PEDIDO EXTRA (PH-393), que e o que esta bancada existe pra dimensionar.
    //
    // O primeiro pedido tipicamente pega o servidor a 1-3 abates de fechar
    // (medido: mediana 27/30), e ai o jogador espera um INTERVALO INTEIRO por
    // quase nada. Um pedido a mais, poucos segundos depois, fecha a conta.
    //
    // TRES GUARDAS, e nenhuma e enfeite:
    //  - `extrasPedidos === 0`: no maximo UM por sala. Repetir e o livelock de
    //    PH-273 — cada pedido fecha a janela do servidor, que reconstroi o mundo
    //    com o POKE no ponto de entrada, e janela curta nao paga a caminhada.
    //  - `abatesDoServidorNaResposta >= LIMIAR`: pedir quando o servidor esta
    //    LONGE (15/30) gasta invocacao de Edge e ainda encurta a janela dele —
    //    piora. Só vale quando ele esta perto.
    //  - a espera propria (`EXTRA_S`): o servidor precisa de ALGUM tempo de
    //    janela pra matar o que falta.
    const pedidoExtra = EXTRA_S > 0
      && quotaFechadaEm != null
      && pedidosDesdeQuota === 1
      && extrasPedidos === 0
      && abatesDoServidorNaResposta >= LIMIAR_QUASE_FECHADA
      && (t - ultimoFlush) * PASSO >= EXTRA_S

    if (pedidoInicial || pedidoExtra || t - ultimoFlush >= passosPorJanela) {
      if (pedidoInicial || pedidoExtra) pedidosDesdeQuota += 1
      if (pedidoExtra) extrasPedidos += 1
      const duracaoS = (t - ultimoFlush) * PASSO
      ultimoFlush = t
      const salaDoServidor = janelaDoServidor(estadoDoServidor, gameStateServidor, duracaoS)
      abatesDoServidorNaResposta = salaDoServidor?.abates ?? 0
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
      pedidosDesdeQuota = 0
      extrasPedidos = 0
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
    .map((e) => (e.travou ? 'TRAVOU' : `${e.esperaS.toFixed(0)}s(srv ${e.abatesDoServidorNaQuota ?? '?'}/30)`))
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
