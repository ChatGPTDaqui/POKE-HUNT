// Bancada: quanto o LURE (PH-235) custa na RESIMULAÇÃO do servidor.
//
// POR QUE ISTO EXISTE
// -----------------------------------------------------------------------------
// O lure muda para onde o jogador anda, e "para onde ele anda" é a entrada do
// `moveToward` — que, em mapa com grade de colisão, pode cair no A* real
// (`core/pathfinding.ts`) em vez do atalho de linha limpa. Durante a reunião o
// destino é um selvagem do outro lado do mapa, longe e possivelmente atrás de
// body-block, ou seja, exatamente o caso que mais chama o A*.
//
// Isso importa porque o MESMO motor roda no servidor: `/estado` e `/sessao/flush`
// resimulam a janela inteira (até horas de ausência) num passo fixo. Um custo por
// tick que dobre ali vira timeout de request, não frame perdido — e o sintoma
// chega como "Nao foi possivel carregar seu progresso / signal timed out", que não
// aponta para o motor.
//
// COMO RODAR
//   npm run build:engine    # gera authority/engine/headless.js (gitignored)
//   node scripts/harness/custo-do-lure.mjs
//
// A bancada usa o bundle do motor (`authority/engine/headless.js`) e não o TS
// direto: é o mesmo artefato que a Edge Function carrega, então o número medido é
// o do servidor, não o de um build de teste.
import { createRng, createPokeInstance, buildMapWorld, stepWorld, defaultGameStateData, OFFLINE_SIM_STEP_SECONDS } from '../../authority/engine/headless.js'

const HUNT = 'mata_e1'
const SEGUNDOS = 1800 // 30 min de ausência: a janela típica de um `/estado` atrasado
const PASSO = OFFLINE_SIM_STEP_SECONDS

function medir(rotulo, lureConfig) {
  const rng = createRng(4242)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const poke = createPokeInstance(rng, 'charmander', 40)
  const world = buildMapWorld(HUNT, poke, { seed: 7, rng, counters })
  world.pessimista = true // mesmo regime do farm offline no servidor

  const dados = defaultGameStateData()
  dados.team = [poke]
  dados.lureConfig = lureConfig
  // Adaptador mínimo: `stepWorld` só lê config e mexe em item/ouro/exp. Um
  // Proxy resolveria em menos linhas e esconderia QUAL campo o motor tocou —
  // aqui interessa que a bancada falhe alto se o motor passar a exigir algo novo.
  const store = {
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

  let abates = 0
  const t0 = process.hrtime.bigint()
  for (let t = 0; t < SEGUNDOS; t += PASSO) {
    abates += stepWorld(world, PASSO, store, { silent: true, offline: true }).length
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  const ticks = Math.ceil(SEGUNDOS / PASSO)
  console.log(
    `${rotulo.padEnd(22)} ${ms.toFixed(0).padStart(6)} ms  `
    + `${(ms / ticks * 1000).toFixed(1).padStart(6)} us/tick  ${String(abates).padStart(5)} abates`,
  )
  return { ms, abates }
}

console.log(`${SEGUNDOS}s de resim em passo de ${PASSO}s, hunt ${HUNT}, regime pessimista\n`)
const desligado = medir('lure desligado', { ligado: false, quantidade: 2 })
const dois = medir('lure ligado (2)', { ligado: true, quantidade: 2 })
const quatro = medir('lure ligado (4)', { ligado: true, quantidade: 4 })

console.log('')
for (const [rotulo, r] of [['lure 2', dois], ['lure 4', quatro]]) {
  const custo = ((r.ms / desligado.ms - 1) * 100).toFixed(0)
  const kills = ((r.abates / desligado.abates - 1) * 100).toFixed(0)
  console.log(`${rotulo}: ${custo > 0 ? '+' : ''}${custo}% de tempo de CPU, ${kills > 0 ? '+' : ''}${kills}% de abates`)
}
