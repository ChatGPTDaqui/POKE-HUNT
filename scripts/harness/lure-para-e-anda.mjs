// Bancada: o POKE anda travando com o Lure ligado? (PH-280)
//
// O RELATO
// -----------------------------------------------------------------------------
// "o pokemon fica andando travando quando o lure esta ligado". Travar e uma
// palavra visual, e a correcao precisa de numero: sem medir, qualquer mudanca no
// lure vira troca de um comportamento intencional por outro sem saber se
// melhorou.
//
// O QUE PODE ESTAR PARANDO O POKE, lendo `engine/systems/lureSystem.ts`
// -----------------------------------------------------------------------------
//  1. `esperandoRetardatario`: quando um selvagem JA reunido passa de 0,8x da
//     coleira, o lure zera o destino de proposito — o jogador segura a posicao
//     pra nao arrastar o grupo. Destino nulo vira `player.state = 'idle'` em
//     `updateMovement`: ele PARA. Se essa condicao pisca, o efeito na tela e
//     parar-andar-parar.
//  2. Troca de candidato: o destino e sempre o selvagem vivo mais proximo que
//     ainda nao esta atras do jogador. No instante em que o candidato entra em
//     `chase`, ele sai da lista e o destino salta pra outro, as vezes na direcao
//     oposta. Cada salto e uma virada brusca.
//
// As duas sao intencionais e estao documentadas. O que esta bancada mede e o
// EFEITO COMBINADO delas.
//
// O QUE ELA CONTA, por corrida de 60s:
//   - trocas de destino nulo <-> nao-nulo (as paradas de verdade);
//   - quantos ticks o POKE passou parado com o lure em reuniao;
//   - trocas de candidato (as viradas);
//   - distancia percorrida contra o deslocamento liquido (o quanto serpenteia).
//
// COMO RODAR
//   npm run build:engine
//   node scripts/harness/lure-para-e-anda.mjs
import {
  createRng, createPokeInstance, buildMapWorld, stepWorld, defaultGameStateData,
} from '../../authority/engine/headless.js'

const HUNT = 'campo_aberto_faixa1'
const NIVEL = 25
const PASSO = 1 / 60
const SEGUNDOS = 60
const SEMENTES = 12

function gameStateFalso(poke, lureLigado, quantidade) {
  const dados = defaultGameStateData()
  dados.team = [poke]
  dados.autoToggles = { ...dados.autoToggles, autoRevive: true }
  dados.lureConfig = { ligado: lureLigado, quantidade }
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

function corrida(semente, lureLigado, quantidade) {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', NIVEL)
  const world = buildMapWorld(HUNT, poke, {
    seed: semente, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  const gameState = gameStateFalso(poke, lureLigado, quantidade)

  let paradasComDestinoNulo = 0
  let ticksParadoNaReuniao = 0
  let ticksEmReuniao = 0
  let trocasDeCandidato = 0
  let percorrido = 0
  let tinhaDestino = null
  let candidatoAnterior = null
  const inicioX = world.player.x
  const inicioY = world.player.y
  let anteriorX = inicioX
  let anteriorY = inicioY

  for (let t = 0; t * PASSO < SEGUNDOS; t++) {
    stepWorld(world, PASSO, gameState, { silent: true })
    const p = world.player
    if (!p) break
    percorrido += Math.hypot(p.x - anteriorX, p.y - anteriorY)
    anteriorX = p.x
    anteriorY = p.y

    const lure = world.lure
    if (lure?.fase !== 'reunindo') {
      tinhaDestino = null
      candidatoAnterior = null
      continue
    }
    ticksEmReuniao++
    const temDestino = lure.destino != null
    if (!temDestino) ticksParadoNaReuniao++
    if (tinhaDestino !== null && tinhaDestino !== temDestino) paradasComDestinoNulo++
    tinhaDestino = temDestino

    // Identidade do candidato pela posicao do destino: o lure nao publica o id,
    // e um salto de destino MAIOR que um passo de caminhada so acontece quando
    // ele troca de alvo (o alvo tambem se move, mas devagar).
    if (lure.destino) {
      const chave = `${Math.round(lure.destino.x)}:${Math.round(lure.destino.y)}`
      if (candidatoAnterior && chave !== candidatoAnterior) {
        const [ax, ay] = candidatoAnterior.split(':').map(Number)
        if (Math.hypot(lure.destino.x - ax, lure.destino.y - ay) > 40) trocasDeCandidato++
      }
      candidatoAnterior = chave
    }
  }

  const liquido = Math.hypot(anteriorX - inicioX, anteriorY - inicioY)
  return {
    paradasComDestinoNulo,
    ticksParadoNaReuniao,
    ticksEmReuniao,
    trocasDeCandidato,
    percorrido,
    liquido,
  }
}

function media(lista, campo) {
  if (!lista.length) return 0
  return lista.reduce((s, r) => s + r[campo], 0) / lista.length
}

console.log(`hunt ${HUNT}, POKE Lv${NIVEL}, ${SEGUNDOS}s por corrida, ${SEMENTES} sementes\n`)
for (const [rotulo, ligado, quantidade] of [
  ['lure DESLIGADO', false, 2],
  ['lure ligado, 2', true, 2],
  ['lure ligado, 3', true, 3],
  ['lure ligado, 4', true, 4],
]) {
  const corridas = []
  for (let s = 0; s < SEMENTES; s++) corridas.push(corrida(500 + s * 37, ligado, quantidade))
  const reuniao = media(corridas, 'ticksEmReuniao')
  const parado = media(corridas, 'ticksParadoNaReuniao')
  const pctParado = reuniao > 0 ? (parado / reuniao) * 100 : 0
  console.log(
    `${rotulo.padEnd(16)} | paradas ${media(corridas, 'paradasComDestinoNulo').toFixed(1).padStart(5)}`
    + ` | ${pctParado.toFixed(0).padStart(3)}% do tempo de reuniao parado`
    + ` | trocas de alvo ${media(corridas, 'trocasDeCandidato').toFixed(1).padStart(5)}`
    + ` | andou ${media(corridas, 'percorrido').toFixed(0).padStart(5)}px pra sair ${media(corridas, 'liquido').toFixed(0).padStart(4)}px do lugar`,
  )
}
console.log(
  '\nLeitura: "paradas" e quantas vezes o POKE trocou entre andar e ficar parado'
  + '\ndurante a reuniao. Cada uma dessas trocas e um solavanco na tela.',
)
