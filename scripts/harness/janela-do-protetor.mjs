// Bancada: quanto o servidor consegue machucar o protetor da sala em UMA janela
// de flush, e o que acontece quando essa janela e curta (PH-273).
//
// O QUE ESTA SENDO MEDIDO, E POR QUE
// -----------------------------------------------------------------------------
// A sala so avanca quando o protetor dela morre (PH-202/203), e quem tem que
// mata-lo e o SERVIDOR — o cliente nao decide sala. Mas o servidor nao guarda
// posicao: a cada janela ele reconstroi o mundo com `buildMapWorld`, o POKE
// volta pro ponto de partida e o protetor volta pra entrada do mapa. O unico
// estado que atravessa a janela e o `hp_atual` da linha em `sala_protetor`.
//
// Ou seja, cada janela paga de novo o pedagio da caminhada. Se a janela for
// menor que o tempo de atravessar o mapa, o dano por janela e ZERO — e zero
// vezes N janelas continua zero: a sala nunca avanca.
//
// Isso vira o caso comum por causa de um detalhe do cliente: com a quota
// fechada, `observarQuotaDeSala` (data/remote/autoridade.ts) pedia flush a cada
// 5 segundos. Quanto mais o cliente insistia, MENOR a janela do servidor e menos
// ele avancava — um livelock em que a pressa e a causa.
//
// O QUE ESTA BANCADA MOSTROU — E O QUE ELA NAO REPRODUZIU
// -----------------------------------------------------------------------------
// Ela NAO reproduz o travamento, e isso e resultado, nao falha. Em toda janela
// testada (5s inclusive), com lure ligado e desligado, o protetor morre na
// PRIMEIRA janela. Ou seja: com o alvo ao alcance, a duracao da janela sozinha
// nao explica nada — o motor de combate nao precisa de janela longa.
//
// O que trava no jogo e a condicao de campo que esta bancada nao monta: o POKE
// longe do protetor, a caminhada consumindo a janela inteira, e (com lure
// ligado) a fase `reunindo` recomecando do zero a cada reconstrucao de mundo,
// sem nunca alcancar o teto de 18s que a encerraria.
//
// A MEDICAO QUE VALEU foi no jogo real (conta de teste, jogo-dev, 2026-08-29),
// bloqueando o flush do cliente pra forcar janelas de tamanhos diferentes na
// MESMA sessao:
//
//   janela de   5s  ->  0 abates (dezenas seguidas; `hp_atual` do protetor
//                                 `ponyta` parado em 72 por mais de 10 minutos)
//   janela de  35s  -> 10 abates, 415 de ouro, e a sala avancou
//   janela de  82s  -> 25 abates, 950 de ouro
//   janela de 111s  -> 24 abates, 6.880 de ouro, protetor morto
//
// Guardar a bancada mesmo sem repro serve pra proxima pessoa nao gastar a
// investigacao de novo na hipotese que ela ja descartou.
//
// COMO RODAR
//   npm run build:engine
//   node scripts/harness/janela-do-protetor.mjs
import {
  createRng, createPokeInstance, buildMapWorld, stepWorld, defaultGameStateData,
} from '../../authority/engine/headless.js'

const HUNT = 'campo_aberto_faixa1'
const NIVEL = 102
const PASSO = 1 / 60
const ABATES_POR_SALA = 30
// As janelas testadas: 5s e a que o pedido repetido de sala produz, 30s e o
// flush periodico, 90s e o teto do intervalo esticado.
const JANELAS = [5, 15, 30, 60, 90]
const SEMENTES = 12
// Lure ligado: e o estado real da conta em que o travamento foi observado.
const LURE_LIGADO = process.env.LURE !== '0'
// Protetor no canto oposto (condicao de campo) — DISTANTE=0 poe ele na entrada.
const DISTANTE = process.env.DISTANTE !== '0'

function gameStateFalso(poke) {
  const dados = defaultGameStateData()
  dados.team = [poke]
  dados.autoToggles = { ...dados.autoToggles, autoRevive: true }
  dados.lureConfig = { ligado: LURE_LIGADO, quantidade: 3 }
  return {
    ...dados,
    hasItem: (id) => id === 'potion' || id === 'revive',
    consumeItem: () => true,
    addGold: () => {}, addItem: () => {}, grantTrainerExp: () => {},
    setPokedexKillEntry: () => {}, setBiomaProgress: () => {}, updatePokeInstance: () => {},
    setActiveIndex: () => {}, setTrainer: () => {}, unlockContinent: () => {},
    isContinentUnlocked: () => true, addCapturedPoke: () => {}, incrementPerfStats: () => {},
    isItemLocked: () => false, removeItem: () => {}, addPokeToTeam: () => {}, moveTeamToBag: () => {},
  }
}

/**
 * Uma janela do servidor: mundo reconstruido do zero (como `aplicarFlush` faz),
 * com a sala em quota fechada e o protetor recriado a partir do que a linha do
 * banco guarda. Devolve o hp do protetor no fim da janela.
 */
function janelaDoServidor(semente, sala, protetorSalvo, segundos) {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'entei', NIVEL)
  const world = buildMapWorld(HUNT, poke, {
    seed: semente,
    rng: createRng(semente),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
    sala,
    protetorPendente: protetorSalvo,
  })
  // O protetor no CANTO OPOSTO do mapa, e nao onde  o poe.
  // E a condicao de campo: no jogo o POKE precisa atravessar a sala pra chegar
  // nele, e e essa caminhada que a janela curta nao paga.
  const prot = world.enemies.find((e) => e.isProtetor)
  if (prot && DISTANTE) {
    prot.x = world.mapDef.width - 64
    prot.y = world.mapDef.height - 64
  }
  const gameState = gameStateFalso(poke)
  for (let t = 0; t * PASSO < segundos; t++) stepWorld(world, PASSO, gameState, { silent: true })
  // `protetorPendente` nulo = o protetor morreu nesta janela e a sala avancou.
  return {
    pendente: world.protetorPendente,
    hp: world.protetorPendente?.hpAtual ?? 0,
    morreu: world.protetorPendente == null,
    sala: world.sala,
  }
}

/** Quantas janelas de `segundos` ate o protetor cair, ou null se travou. */
function janelasAteMatar(semente, segundos, teto = 40) {
  const sala = { indice: 8, chave: 'meadow', abates: ABATES_POR_SALA, ciclos: 1 }
  let protetor = null
  let hpAnterior = null
  let janelasSemDano = 0
  for (let i = 0; i < teto; i++) {
    const r = janelaDoServidor(semente + i, sala, protetor, segundos)
    if (r.morreu) return { janelas: i + 1, segundos: (i + 1) * segundos, travou: false }
    if (hpAnterior != null && r.hp >= hpAnterior) janelasSemDano++
    else janelasSemDano = 0
    hpAnterior = r.hp
    protetor = r.pendente
  }
  return { janelas: null, segundos: null, travou: true, hpFinal: hpAnterior, janelasSemDano }
}

console.log(`hunt ${HUNT}, POKE Lv${NIVEL}, protetor da sala 9, ${SEMENTES} sementes por janela\n`)
console.log('janela |  matou  |  travou | janelas ate matar (mediana)')
console.log('-------+---------+---------+----------------------------')
for (const janela of JANELAS) {
  const resultados = []
  for (let s = 0; s < SEMENTES; s++) resultados.push(janelasAteMatar(2000 + s * 100, janela))
  const mataram = resultados.filter((r) => !r.travou)
  const medianas = mataram.map((r) => r.janelas).sort((a, b) => a - b)
  const mediana = medianas.length ? medianas[Math.floor(medianas.length / 2)] : null
  console.log(
    `${String(janela).padStart(5)}s | ${String(mataram.length).padStart(2)}/${SEMENTES}`
    + `   | ${String(resultados.length - mataram.length).padStart(2)}/${SEMENTES}`
    + `   | ${mediana == null ? '—' : `${mediana} (${mediana * janela}s de jogo)`}`,
  )
}
console.log(
  '\nLeitura: "travou" e o protetor sobreviver a 40 janelas seguidas. Janela curta'
  + '\nque nao mata nunca vai matar — o mundo recomeca igual toda vez.',
)
