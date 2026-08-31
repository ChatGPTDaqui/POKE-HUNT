// Bancada: a hunt inicial aguenta Lv3 e o elenco de 9 especies?
//
// O QUE ESTA SENDO DECIDIDO
// -----------------------------------------------------------------------------
// A hunt inicial saiu de 3 especies Lv1-2 pra 9 especies Lv1-3. As duas
// mudancas empurram na mesma direcao perigosa, e o perigo e conhecido: um POKE
// inicial Lv1 tem 12 HP, e a UNICA janela em que conta nova morre sao os
// primeiros 30-60 segundos (ver data/biomas.ts#MAX_INIMIGOS_HUNT_INICIAL, que
// foi decidido medindo exatamente isso).
//
// `spawn-da-hunt-inicial.mjs` responde outra pergunta (quantos inimigos cabem em
// campo) e mede 20 sementes, o que nao separa 0/20 de 1/20. Esta aqui roda a
// configuracao do catalogo com amostra grande e, principalmente, DIZ QUEM MATOU:
// especie e nivel do golpe fatal. Sem isso a resposta a uma morte a mais e
// chutar entre "abaixa o peso do Lv3" e "tira a especie mais forte".
//
// COMO RODAR
//   npm run build:engine
//   node scripts/harness/hunt-inicial-lv3.mjs [sementes]
import {
  createRng, createPokeInstance, buildMapWorld, stepWorld, defaultGameStateData,
} from '../../authority/engine/headless.js'

const HUNT = 'route_46'
const PASSO = 1 / 30
const SEGUNDOS_DE_RISCO = 60
const SEMENTES = Number(process.argv[2] ?? 200)

function gameStateFalso(poke) {
  const dados = defaultGameStateData()
  dados.team = [poke]
  return {
    ...dados,
    hasItem: (id) => id === 'potion' || id === 'revive',
    consumeItem: () => true,
    addGold: () => {}, addItem: () => {}, grantTrainerExp: () => {},
    setPokedexKill: () => {}, setBiomaProgress: () => {}, recordPerf: () => {},
    updatePokeInstance: () => {}, setActiveIndex: () => {}, setTrainer: () => {},
    unlockContinent: () => {}, isContinentUnlocked: () => true,
    setPokedexKillEntry: () => {}, addCapturedPoke: () => {}, incrementPerfStats: () => {},
    isItemLocked: () => false, removeItem: () => {}, addPokeToTeam: () => {}, moveTeamToBag: () => {},
  }
}

/** Uma vida: devolve se morreu e, se morreu, quem estava em campo no momento. */
function medir(semente, inicial) {
  const rng = createRng(semente)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const poke = createPokeInstance(rng, inicial, 1)
  const world = buildMapWorld(HUNT, poke, { seed: semente, rng, counters })
  const gameState = gameStateFalso(poke)

  const vistos = new Map()
  for (let t = 0; t < SEGUNDOS_DE_RISCO / PASSO; t++) {
    stepWorld(world, PASSO, gameState, { silent: true })
    for (const e of world.enemies) {
      if (e.poke.hp > 0) vistos.set(e.id, `${e.poke.speciesId} Lv${e.poke.level}`)
    }
    if (world.player?.fainted) {
      // Quem estava vivo e em cima do jogador quando ele caiu.
      const carrascos = world.enemies
        .filter((e) => e.poke.hp > 0)
        .map((e) => `${e.poke.speciesId} Lv${e.poke.level}`)
      return { morreu: true, carrascos, segundo: (t * PASSO).toFixed(0) }
    }
  }
  return { morreu: false, vistos: [...vistos.values()] }
}

// Os TRES iniciais, e nao so o Charmander: o tipo do inicial muda quem consegue
// machucar quem, e a hunt agora tem BUG e DARK alem de NORMAL.
const INICIAIS = ['charmander', 'squirtle', 'bulbasaur']

console.log(`hunt ${HUNT} — ${SEMENTES} sementes x ${INICIAIS.length} iniciais = ${SEMENTES * INICIAIS.length} vidas\n`)

const porNivel = new Map()
const mortesPorCarrasco = new Map()
let mortes = 0
let vidas = 0

for (const inicial of INICIAIS) {
  let mortesDoInicial = 0
  for (let s = 0; s < SEMENTES; s++) {
    const r = medir(3000 + s, inicial)
    vidas++
    for (const v of r.vistos ?? r.carrascos ?? []) {
      const nivel = v.slice(v.lastIndexOf('Lv'))
      porNivel.set(nivel, (porNivel.get(nivel) ?? 0) + 1)
    }
    if (r.morreu) {
      mortes++
      mortesDoInicial++
      for (const c of r.carrascos) mortesPorCarrasco.set(c, (mortesPorCarrasco.get(c) ?? 0) + 1)
    }
  }
  console.log(`  ${inicial.padEnd(12)} mortes ${String(mortesDoInicial).padStart(3)}/${SEMENTES}  (${(100 * mortesDoInicial / SEMENTES).toFixed(1)}%)`)
}

console.log(`\nTOTAL  ${mortes}/${vidas} vidas  (${(100 * mortes / vidas).toFixed(2)}%)`)
console.log('\ninimigos vistos por nivel:')
for (const [n, q] of [...porNivel].sort()) {
  console.log(`  ${n.padEnd(6)} ${String(q).padStart(5)}  (${(100 * q / [...porNivel.values()].reduce((a, b) => a + b, 0)).toFixed(1)}%)`)
}
if (mortesPorCarrasco.size) {
  console.log('\nem campo no momento da morte:')
  for (const [c, q] of [...mortesPorCarrasco].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.padEnd(20)} ${q}`)
  }
}
