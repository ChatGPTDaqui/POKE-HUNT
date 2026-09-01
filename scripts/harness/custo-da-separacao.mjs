// Bancada: quanto custa a separacao de corpos (PH-384) no passo do motor.
//
// POR QUE ISTO PRECISA DE MEDICAO, E NAO DE ARGUMENTO
// -----------------------------------------------------------------------------
// `separarCorpos` roda em TODO tick de `updateMovement`, e `updateMovement` roda
// tanto no cliente (60 fps) quanto no resim da autoridade — que faz ate 250 mil
// passos por chamada (offlineSimSystem#DEFAULT_MAX_STEPS) dentro de um orcamento
// de tempo real de 2,5s. Nesse regime, o preco nao e "o custo do algoritmo": e
// QUANTOS PASSOS deixam de caber no orcamento. Passo mais caro nao aparece como
// lentidao, aparece como simulacao mais grossa.
//
// O algoritmo e O(n²) em pares, com ate `PASSADAS_DE_SEPARACAO` varreduras por
// tick e saida antecipada quando nenhum par sobrou sobreposto. Ou seja: o caso
// barato (campo folgado) e uma varredura, e o caso caro (campo cheio, corpos
// encostados de verdade) e quatro. A pergunta que importa e a diferenca entre os
// dois — e ela nao se responde lendo o codigo, porque o resto do passo (combate,
// A*, status, clima) tambem custa, e e contra esse total que a conta se paga.
//
// O QUE ELA COMPARA
// -----------------------------------------------------------------------------
// O mesmo numero de passos em quatro campos, do mais folgado ao mais apertado.
// Nenhum deles precisa de codigo modificado — a diferenca vem so da posicao
// inicial dos corpos, que e o que decide quantas passadas a separacao gasta:
//
//   sem inimigo        — 1 corpo, nenhum par: piso do passo
//   1 inimigo longe    — 1 par, sem sobreposicao: uma varredura que nao empurra
//   6 inimigos longe   — 21 pares, sem sobreposicao: o caso comum da hunt
//   6 inimigos colados — 21 pares sobrepostos: o pior caso, 4 varreduras/tick
//
// COMO RODAR
//   npm run build:engine
//   node scripts/harness/custo-da-separacao.mjs
import {
  createRng, createPokeInstance, buildMapWorld, stepWorld, defaultGameStateData,
} from '../../authority/engine/headless.js'

const HUNT = 'route_46'
const PASSO = 0.1
const PASSOS = 20000

function gameStateFalso(poke) {
  const dados = defaultGameStateData()
  dados.team = [poke]
  // Auto-revive ligado pelo mesmo motivo da bancada de divergencia de quota: sem
  // ele a corrida acaba na primeira morte e a medicao vira "tempo ate morrer".
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

/**
 * `colados`: todos os inimigos em campo vao pro ponto do jogador, que e o
 * arranjo que forca a separacao a gastar as 4 passadas.
 */
function corrida({ quantosInimigos, colados }) {
  const rng = createRng(11)
  const poke = createPokeInstance(rng, 'typhlosion', 30)
  const gameState = gameStateFalso(poke)
  const world = buildMapWorld(HUNT, poke, {
    seed: 0, rng, counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  // O mapa nasce com o proprio spawn de inimigos; recorta pra quantidade pedida.
  world.enemies = world.enemies.slice(0, quantosInimigos)
  if (colados) {
    for (const inimigo of world.enemies) {
      inimigo.x = world.player.x
      inimigo.y = world.player.y
    }
  }

  const t0 = process.hrtime.bigint()
  for (let i = 0; i < PASSOS; i++) stepWorld(world, PASSO, gameState, { silent: true })
  const t1 = process.hrtime.bigint()
  return Number(t1 - t0) / 1e6
}

const casos = [
  { nome: 'sem inimigo', quantosInimigos: 0, colados: false },
  { nome: '1 inimigo', quantosInimigos: 1, colados: false },
  { nome: '6 inimigos espalhados', quantosInimigos: 6, colados: false },
  { nome: '6 inimigos COLADOS', quantosInimigos: 6, colados: true },
]

// Aquece o JIT antes de medir: a primeira corrida paga a compilacao do motor
// inteiro e sairia 3-4x mais lenta que as outras sem nenhuma razao real.
corrida({ quantosInimigos: 6, colados: true })

console.log(`hunt ${HUNT}, ${PASSOS} passos de ${PASSO}s por caso (= ${(PASSOS * PASSO / 60).toFixed(0)} min de jogo)\n`)
console.log('campo                  |    ms |  us/passo | passos/2,5s de orcamento')
console.log('-----------------------+-------+-----------+-------------------------')
for (const caso of casos) {
  const ms = corrida(caso)
  const usPorPasso = (ms * 1000) / PASSOS
  const passosNoOrcamento = Math.round(2500 / (ms / PASSOS))
  console.log(
    `${caso.nome.padEnd(22)} | ${ms.toFixed(0).padStart(5)} | ${usPorPasso.toFixed(2).padStart(9)} | ${passosNoOrcamento.toLocaleString('pt-BR').padStart(23)}`,
  )
}
console.log(`
Leitura: a ultima coluna e o que importa pro servidor — quantos passos cabem no
orcamento de 2,5s de `.trim() + ' `offlineSimSystem`. A separacao so pode ser considerada barata se\no campo COLADO nao derrubar esse numero de forma relevante contra o espalhado,\nque e o arranjo do jogo de verdade.')
