// Bancada: o RITMO da encarada (PH-397), medido em cima do motor de verdade.
//
// POR QUE ISTO EXISTE, tendo a bancada visual e os testes
//
// `encarada-no-duelo.html` mostra a coreografia com a arte real, e e ela quem
// decide se ficou bonito — animacao se julga na tela. Mas quatro numeros por
// tras do desenho valem ser medidos, porque o olho nao le nenhum deles direito e
// os quatro sao o que a escolha de "arco de 50 graus a 30px/s" apostou:
//
//   1. QUANTO DO DUELO E COREOGRAFIA. Se a pose de ataque e o cooldown global
//      comerem quase tudo, a feature nao aparece — e o esforco foi pra nada.
//      `MIN_ACTION_GAP` e `TURNO_SEGUNDOS` (3s) e a pose dura 0,5s, entao a
//      previsao e "a maior parte do tempo"; previsao nao e medicao.
//   2. A VELOCIDADE QUE O CORPO DE FATO ANDA. A constante diz 30px/s
//      tangenciais, mas o passo passa por `empurrarCorpo`, correcao radial e
//      teto. O que casa (ou nao) com a cadencia fixa do `Walk` do sheet PMD e o
//      valor MEDIDO, nao o declarado.
//   3. QUANTAS VEZES POR SEGUNDO A FILEIRA DO SPRITESHEET TROCA. `facing` gira
//      continuamente e o sheet PMD tem 8 direcoes: cada cruzamento de 45 graus
//      troca a fileira inteira. Acima de ~2 por segundo isso le como estalo, e
//      e o defeito mais provavel desta feature.
//   4. QUANTO A CAMERA BALANCA. `renderer.ts#_computeCamera` trava no jogador
//      sem suavizacao nenhuma. O deslocamento do jogador, vezes o zoom padrao,
//      E o balanco do fundo inteiro em pixels de tela.
//   5. A LARGURA DO PASSO LATERAL (PH-402). O motivo da segunda rodada: a
//      primeira versao girava em torno do ponto medio e cada corpo percorria
//      26px, o que na tela some. Esta e a medida que diz se o conserto pegou.
//   6. A VARIEDADE DAS PERNAS (PH-402, terceira e quarta rodadas). Duas figuras
//      fixas foram reprovadas na tela pelo mesmo motivo: o olho acha o padrao.
//      Arco de pivo fixo leu como barca viking; oito deitado fecha sempre no
//      mesmo ponto. O caminho virou uma sequencia de meia-luas sorteadas, e o
//      que prova que ela e variada e a curvatura MUDAR de perna pra perna e os
//      fins nao se repetirem.
//
// COMO RODAR
//   npm run build:engine
//   node scripts/harness/ritmo-da-encarada.mjs
import {
  createRng, createPokeInstance, buildMapWorld, stepWorld, defaultGameStateData,
} from '../../authority/engine/headless.js'

const ARENA = 'boss_lance'
const PASSO = 1 / 60
const SEGUNDOS = 120
const ZOOM_PADRAO = 1.5 // renderer.ts#DEFAULT_ZOOM — o balanco de camera sai daqui

function gameStateFalso(poke) {
  const dados = defaultGameStateData()
  dados.team = [poke]
  return {
    ...dados,
    hasItem: () => false,
    consumeItem: () => true,
    addGold: () => {}, addItem: () => {}, grantTrainerExp: () => {},
    setPokedexKillEntry: () => {}, setBiomaProgress: () => {}, updatePokeInstance: () => {},
    setActiveIndex: () => {}, moveTeamIndexToFront: () => {}, setTrainer: () => {},
    unlockContinent: () => {}, isContinentUnlocked: () => true, addCapturedPoke: () => {},
    incrementPerfStats: () => {}, isItemLocked: () => false, removeItem: () => {},
    addPokeToTeam: () => {}, moveTeamToBag: () => {},
  }
}

// O jogador precisa aguentar o time inteiro do Lance, senao a medicao vira
// "tempo ate morrer". Nada da coreografia olha HP, entao isto nao mascara nada
// do que esta sendo medido.
function duelista() {
  const poke = createPokeInstance(createRng(11), 'charizard', 100)
  poke.stats = { hp: 99999, atkFis: 1, atkEsp: 1, def: 9999, defEsp: 9999, speed: 100 }
  poke.hp = 99999
  return poke
}

/** Em qual das 8 fileiras do sheet PMD este `facing` cai. Copia de animationSystem#directionRowFromFacing. */
function fileira(facing) {
  const angulo = Math.atan2(facing.y, facing.x)
  return (((Math.round(angulo / (Math.PI / 4)) % 8) + 8) % 8)
}

const poke = duelista()
const gameState = gameStateFalso(poke)
const world = buildMapWorld(ARENA, poke, {
  seed: 0, rng: createRng(7), counters: { entity: 1, effect: 1, pendingHit: 1 },
})

const ticks = Math.round(SEGUNDOS / PASSO)
let ticksComPar = 0
let ticksGirando = 0
let somaVelocidade = 0
let amostrasDeVelocidade = 0
let trocasDeFileira = 0
let distMin = Infinity
let distMax = 0
let fileiraAnterior = null
let ancora = null
let excursaoMax = 0
let ultimaPerna = -1
const curvas = []
const finsDePerna = []

for (let i = 0; i < ticks; i++) {
  world.player.poke.hp = world.player.poke.stats.hp
  for (const e of world.enemies) e.poke.hp = e.poke.stats.hp

  const antes = { x: world.player.x, y: world.player.y }
  stepWorld(world, PASSO, gameState, { silent: true })

  const inimigo = world.enemies.find((e) => e.poke.hp > 0)
  if (!inimigo || !world.encarada) continue
  ticksComPar++

  const dist = Math.hypot(inimigo.x - world.player.x, inimigo.y - world.player.y)
  distMin = Math.min(distMin, dist)
  distMax = Math.max(distMax, dist)

  if (!world.player.encarando) continue
  ticksGirando++

  somaVelocidade += Math.hypot(world.player.x - antes.x, world.player.y - antes.y) / PASSO
  amostrasDeVelocidade++

  const agora = fileira(world.player.facing)
  if (fileiraAnterior !== null && agora !== fileiraAnterior) trocasDeFileira++
  fileiraAnterior = agora

  // O envelope e medido a partir do ponto em que CADA encarada comeca (a
  // `parKey` muda a cada POKE novo do Lance), e nao do inicio da corrida — o
  // que interessa e o balanco dentro de um duelo, nao o passeio pela arena ao
  // longo dos seis.
  //
  // O inicio e o MEIO do arco (`desvio` nasce em 0), entao esta distancia e
  // meio passo: o passo lateral cheio, de uma ponta a outra, e o dobro.
  if (!ancora || ancora.chave !== world.encarada.parKey) {
    ancora = { chave: world.encarada.parKey, x: world.player.x, y: world.player.y }
  }
  excursaoMax = Math.max(excursaoMax, Math.hypot(world.player.x - ancora.x, world.player.y - ancora.y))

  // Uma amostra por PERNA nova: a curvatura sorteada e onde ela comecou (que e
  // onde a anterior terminou).
  const enc = world.encarada
  if (enc.perna !== ultimaPerna) {
    ultimaPerna = enc.perna
    curvas.push(enc.raioDaCurva * enc.lado)
    finsDePerna.push({ x: enc.centroX, y: enc.centroY })
  }
}

const velocidadeMedia = amostrasDeVelocidade ? somaVelocidade / amostrasDeVelocidade : 0
const segundosGirando = ticksGirando * PASSO

// Quantos fins de perna caem quase em cima de um anterior. Num caminho fechado
// isto vai a quase 100%; e o numero que distingue "sorteado" de "figura fixa".
const repetidos = finsDePerna.filter((p, i) =>
  finsDePerna.some((q, j) => j < i && Math.hypot(p.x - q.x, p.y - q.y) < 8),
).length
const paraUmLado = curvas.filter((c) => c > 0).length
const curvasAbs = curvas.map(Math.abs)
const mediaDaCurva = curvasAbs.reduce((a, b) => a + b, 0) / Math.max(1, curvasAbs.length)

const linhas = [
  `arena ${ARENA}, ${SEGUNDOS}s de duelo a ${(1 / PASSO).toFixed(0)} fps`,
  '',
  `par em campo                  ${(ticksComPar * PASSO).toFixed(1).padStart(8)} s`,
  `dos quais girando             ${segundosGirando.toFixed(1).padStart(8)} s   (${((ticksGirando / Math.max(1, ticksComPar)) * 100).toFixed(0)}% do duelo)`,
  `quanto o par se afasta        ${excursaoMax.toFixed(0).padStart(8)} px    (raio; a coleira e 170)`,
  `meia-luas percorridas         ${String(curvas.length).padStart(8)}`,
  `  entortando pra um lado      ${String(paraUmLado).padStart(8)}    (metade = sorteio honesto; tudo ou nada = pendulo)`,
  `  curvatura, media            ${mediaDaCurva.toFixed(0).padStart(8)} px    (sorteada entre 32 e 95)`,
  `  terminando em ponto repetido${String(repetidos).padStart(8)}    (caminho fechado poria quase todas aqui)`,
  `velocidade media do corpo     ${velocidadeMedia.toFixed(1).padStart(8)} px/s (teto: 58,5, o andar do inimigo)`,
  `troca de fileira do sheet     ${(trocasDeFileira / Math.max(0.001, segundosGirando)).toFixed(2).padStart(8)} /s   (acima de ~2/s le como estalo)`,
  `distancia entre os dois       ${distMin.toFixed(1).padStart(8)} .. ${distMax.toFixed(1)} px  (tem que caber em 29..39)`,
  `balanco da camera             ${(excursaoMax * ZOOM_PADRAO).toFixed(0).padStart(8)} px de tela (raio, no zoom padrao ${ZOOM_PADRAO})`,
  '',
  'Leitura: o que a tela reprovou duas vezes foi PADRAO, entao os numeros que',
  'importam sao os da variedade — as meia-luas tem que entortar pros dois lados em',
  'proporcao parecida, e os fins de perna nao podem se repetir. Os dois que',
  'condenam a escolha sao a velocidade media ACIMA de 58,5 (a arte de andar fica',
  'lenta pro deslocamento e o POKE patina) e a troca de fileira acima de ~2/s (o',
  'sprite pisca de direcao). A distancia tem que caber em (29, 39) — fora disso o',
  'par desengaja ou briga com a separacao de corpos.',
]
// `console.log` some quando esta bancada e chamada de dentro de um runner;
// `process.stdout.write` sempre sai.
process.stdout.write(linhas.join('\n') + '\n')
