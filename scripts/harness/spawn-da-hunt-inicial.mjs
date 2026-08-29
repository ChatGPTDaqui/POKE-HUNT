// Bancada: quantos inimigos a HUNT INICIAL aguenta ter em campo (PH-259).
//
// O QUE ESTA SENDO DECIDIDO
// -----------------------------------------------------------------------------
// A hunt inicial tinha UM inimigo em campo (`MAX_INIMIGOS_HUNT_INICIAL`), e o
// numero foi medido contra o servidor real pra impedir a morte de conta nova no
// primeiro minuto: 6 inimigos matavam 10/10, 2 matavam 4/10, 1 matava 0/10.
//
// O problema que sobrou e outro, e e o relato do usuario: com um inimigo so no
// mapa inteiro, o POKE passa a maior parte do tempo ANDANDO ate o proximo alvo
// em vez de lutando. A pergunta desta bancada e se da pra subir a quantidade
// mantendo os selvagens LONGE UNS DOS OUTROS — a mais de um raio de aggro
// (`WILD_AGGRO_RADIUS` = 175) de distancia —, de modo que so um por vez alcance
// o jogador.
//
// O QUE ELA MEDE, POR CONFIGURACAO
//   - mortes do POKE nos primeiros 60 segundos (o unico intervalo em que conta
//     nova morre; passada essa janela ela atravessa os 20 minutos inteiros);
//   - abates em 5 minutos (o ritmo que o usuario reclamou);
//   - fracao do tempo em que o POKE estava ANDANDO em vez de lutando;
//   - quantos inimigos ficaram com aggro no jogador ao mesmo tempo (o pico e o
//     que mata: e ele que a folga de spawn existe pra segurar).
//
// LIMITE CONHECIDO, E ELE E GRANDE
// -----------------------------------------------------------------------------
// Isto e o motor HEADLESS. O comentario de `MAX_INIMIGOS_HUNT_INICIAL` registra
// que headless e servidor real discordaram por quase 6x na taxa de morte (~7%
// contra 40%) — entao o numero de mortes daqui NAO substitui a medicao com conta
// nova no jogo. O que esta bancada serve pra responder e a comparacao RELATIVA
// entre as configuracoes, e principalmente o pico de aggro simultaneo, que e
// geometria e nao sorte.
//
// COMO RODAR
//   npm run build:engine
//   node scripts/harness/spawn-da-hunt-inicial.mjs
import {
  createRng, createPokeInstance, buildMapWorld, stepWorld, defaultGameStateData,
} from '../../authority/engine/headless.js'

const HUNT = 'route_46'
const PASSO = 1 / 30
const SEMENTES = 20
const SEGUNDOS_DE_RISCO = 60
const SEGUNDOS_DE_RITMO = 300

/** Adaptador minimo de gameState: `stepWorld` so le config e mexe em item/ouro/exp. */
function gameStateFalso(poke) {
  const dados = defaultGameStateData()
  dados.team = [poke]
  return {
    ...dados,
    // Conta nova comeca com 500 Potion e 50 Revive (gameStateDefaults#STARTING_ITEMS).
    // Sem isto a bancada mediria um POKE Lv1 SEM cura nenhuma — e ai qualquer
    // configuracao mata 20/20, que foi o primeiro resultado desta bancada.
    hasItem: (id) => id === 'potion' || id === 'revive',
    consumeItem: () => true,
    addGold: () => {},
    addItem: () => {},
    grantTrainerExp: () => {},
    setPokedexKill: () => {},
    setBiomaProgress: () => {},
    recordPerf: () => {},
    updatePokeInstance: () => {},
    setActiveIndex: () => {},
    setTrainer: () => {},
    unlockContinent: () => {},
    isContinentUnlocked: () => true,
    setPokedexKillEntry: () => {},
    addCapturedPoke: () => {},
    incrementPerfStats: () => {},
    isItemLocked: () => false,
    removeItem: () => {},
    addPokeToTeam: () => {},
    moveTeamToBag: () => {},
  }
}

function medir(maxEnemies, folgaDeSpawn, segundos, semente, distancia, respawn) {
  const rng = createRng(semente)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const poke = createPokeInstance(rng, 'charmander', 1)
  const world = buildMapWorld(HUNT, poke, { seed: semente, rng, counters })
  // A bancada mexe no mapDef DA INSTANCIA, e nao no catalogo: assim ela compara
  // configuracoes sem depender de qual valor esta commitado hoje.
  // `undefined` em qualquer parametro = usa o que o CATALOGO diz — e assim que a
  // ultima linha mede a configuracao escolhida de verdade, degraus inclusive.
  world.mapDef = {
    ...world.mapDef,
    maxEnemies: maxEnemies ?? world.mapDef.maxEnemies,
    spawnEntreInimigos: folgaDeSpawn ?? world.mapDef.spawnEntreInimigos,
    spawnDistancia: distancia ?? world.mapDef.spawnDistancia,
    respawnDelay: respawn ?? world.mapDef.respawnDelay,
    maxEnemiesPorNivel: maxEnemies == null ? world.mapDef.maxEnemiesPorNivel : undefined,
  }
  const gameState = gameStateFalso(poke)

  let abates = 0
  let ticksAndando = 0
  let ticks = 0
  let picoDeAggro = 0
  let morreu = false

  for (let t = 0; t < segundos / PASSO; t++) {
    const mortos = stepWorld(world, PASSO, gameState, { silent: true })
    abates += mortos.length
    ticks++
    if (world.player?.state === 'chase' || world.player?.state === 'wander') ticksAndando++
    const perseguindo = world.enemies.filter(
      (e) => e.poke.hp > 0 && e.targetId === world.player?.id
        && (e.state === 'chase' || e.state === 'engaged'),
    ).length
    picoDeAggro = Math.max(picoDeAggro, perseguindo)
    if (world.player?.fainted) { morreu = true; break }
  }

  return { abates, morreu, andando: ticksAndando / Math.max(1, ticks), picoDeAggro }
}

function rodar(rotulo, maxEnemies, folgaDeSpawn, distancia, respawn) {
  let mortes = 0
  let picoMax = 0
  for (let s = 0; s < SEMENTES; s++) {
    const risco = medir(maxEnemies, folgaDeSpawn, SEGUNDOS_DE_RISCO, 1000 + s, distancia, respawn)
    if (risco.morreu) mortes++
    picoMax = Math.max(picoMax, risco.picoDeAggro)
  }

  let abates = 0
  let andando = 0
  for (let s = 0; s < SEMENTES; s++) {
    const ritmo = medir(maxEnemies, folgaDeSpawn, SEGUNDOS_DE_RITMO, 2000 + s, distancia, respawn)
    abates += ritmo.abates
    andando += ritmo.andando
  }

  console.log(
    `${rotulo.padEnd(28)} mortes ${String(mortes).padStart(2)}/${SEMENTES}`
    + `  abates/5min ${(abates / SEMENTES).toFixed(1).padStart(5)}`
    + `  andando ${(100 * andando / SEMENTES).toFixed(0).padStart(3)}%`
    + `  pico de aggro ${picoMax}`,
  )
}

console.log(`hunt ${HUNT} — ${SEMENTES} sementes por configuracao\n`)
rodar('1 inimigo, spawn 250-550 (era)', 1, 170, [250, 550])
rodar('2 inimigos, spawn 250-550', 2, 170, [250, 550])
rodar('4 inimigos, spawn 250-550', 4, 170, [250, 550])
rodar('4 inimigos, folga 380, 250-550', 4, 380, [250, 550])
rodar('6 inimigos, folga 380, 250-550', 6, 380, [250, 550])
rodar('1 inimigo, spawn 150-350', 1, undefined, [150, 350])
rodar('2 inimigos, spawn 150-350', 2, 380, [150, 350])
rodar('3 inimigos, spawn 150-350', 3, 380, [150, 350])
rodar('1 inimigo, 150-350, resp 3s', 1, undefined, [150, 350], 3)
rodar('2 inimigos, 150-350, folga 500', 2, 500, [150, 350])
rodar('2 inimigos, 200-400, folga 500', 2, 500, [200, 400])

// A CONFIGURACAO ESCOLHIDA, medida como o jogo vai rodar: os degraus por nivel
// entram pelo proprio catalogo (a bancada nao sobrescreve nada aqui).
rodar('ESCOLHIDA (catalogo)', undefined, undefined, undefined)
