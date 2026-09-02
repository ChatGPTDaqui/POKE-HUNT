// Bancada: o quanto DUAS SEQUENCIAS DE SORTEIO do mesmo motor divergem no ritmo
// de abate dentro de uma sala (PH-258).
//
// ATENCAO AO QUE ELA NAO MEDE (PH-423)
// -----------------------------------------------------------------------------
// Ela NAO mede a divergencia cliente-contra-servidor, e o nome do arquivo mais o
// cabecalho original diziam que sim. `corrida()` e uma simulacao CONTINUA, e as
// duas pontas comparadas abaixo sao duas chamadas dela com sementes diferentes —
// uma apelidada de "servidor". Nenhum dos dois lados reconstroi o mundo por
// janela, que e exatamente o que o servidor de verdade faz (`buildMapWorld` a
// cada flush, POKE de volta no ponto de entrada). Logo:
//
//   - a RAMPA por janela nao entra na conta. Ela e o efeito dominante do
//     problema real — medida em 3,5 a 6,0s por janela em
//     custo-fixo-por-janela.mjs, o que come de 12% (janela de 30s) a 60%
//     (janela de 10s) do tempo do servidor;
//   - `Math.abs()` abaixo apaga a DIRECAO, e direcao era o achado que faltava:
//     na bancada fiel o cliente esta a frente em 119 de 119 trocas na janela
//     padrao, nunca atras. Aqui isso seria invisivel.
//
// O que ela mede de fato, e continua util pra isso: o piso de ruido que vem SO
// da semente. Serve pra separar "e ruido de sorteio, some sozinho" de "e
// estrutural" — mas o numero dela nao pode ser citado como a divergencia que o
// jogador sente. Para essa, usar `troca-de-sala-sob-autoridade.mjs`, que
// reconstroi a janela.
//
// POR QUE O RUIDO DE SEMENTE PRECISA SER MEDIDO
// -----------------------------------------------------------------------------
// As duas pontas rodam o MESMO motor, mas com sequencias de sorteio diferentes:
// a do servidor sai da semente da sessao (que nunca sai de la, ver core/rng.ts)
// e a do cliente e predicao. Ou seja, os dois matam quantidades diferentes de
// selvagens no mesmo intervalo de relogio.
//
// A quota de sala e 30 abates, e quem decide a troca e o servidor. Os dois
// sintomas relatados sao os dois lados dessa mesma divergencia:
//
//   servidor ADIANTE  -> a sala troca com a barra do jogador na metade
//                        ("mudou de bioma sem completar as 30 kills")
//   servidor ATRASADO -> a barra fica em 30/30 esperando
//                        ("nao passa da sala 2")
//
// O que esta bancada responde: qual e o tamanho tipico e o PIOR caso dessa
// diferenca, em abates e em segundos. Sem esse numero nao da pra escolher entre
// "e ruido de um ou dois abates, some sozinho" e "e estrutural, precisa de
// conserto no protocolo".
//
// COMO RODAR
//   npm run build:engine
//   node scripts/harness/divergencia-de-quota.mjs
import {
  createRng, createPokeInstance, buildMapWorld, stepWorld, defaultGameStateData,
} from '../../authority/engine/headless.js'

const HUNT = 'mata_faixa1'
const NIVEL = 25
const PASSO = 0.1
const ABATES_POR_SALA = 30
const PARES = 30

function gameStateFalso(poke) {
  const dados = defaultGameStateData()
  dados.team = [poke]
  // Auto-revive LIGADO: sem ele o POKE que cai encerra a corrida e a medicao
  // vira "quanto tempo ate morrer", nao "quantos abates por janela". Medido com
  // o default (desligado): 59 de 60 corridas terminaram em morte.
  dados.autoToggles = { ...dados.autoToggles, autoRevive: true }
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

/** Segundos ate fechar a quota de 30 abates, e os abates a cada 30s. */
function corrida(semente, tetoDeSegundos = 900) {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', NIVEL)
  const world = buildMapWorld(HUNT, poke, {
    seed: semente, rng, counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  // Sem sistema de sala nesta medicao: o que interessa e o RITMO de abates, e a
  // troca de sala e justamente a variavel dependente.
  world.sala = null
  const gameState = gameStateFalso(poke)

  let abates = 0
  let segundosAteAQuota = null
  let quedas = 0
  let caidoNoTickAnterior = false
  const porJanela = []
  for (let t = 0; t * PASSO < tetoDeSegundos; t++) {
    abates += stepWorld(world, PASSO, gameState, { silent: true }).length
    if (segundosAteAQuota == null && abates >= ABATES_POR_SALA) segundosAteAQuota = t * PASSO
    if (t > 0 && (t * PASSO) % 30 < PASSO / 2) porJanela.push(abates)
    // Conta a QUEDA (transicao), e nao interrompe: com Auto-Revive ligado o
    // POKE volta em 5 segundos e a hunt continua — parar no primeiro desmaio
    // mediria "tempo ate cair", que e outra pergunta.
    const caido = world.player?.fainted === true
    if (caido && !caidoNoTickAnterior) quedas++
    caidoNoTickAnterior = caido
  }
  return { abates, segundosAteAQuota, porJanela, quedas }
}

const diffsDeTempo = []
let mortes = 0
let somaDeAbates = 0
const diffsEm30s = []
let ambosFecharam = 0

for (let i = 0; i < PARES; i++) {
  // Duas sementes diferentes pro MESMO cenario: e exatamente a relacao entre a
  // sequencia do servidor e a predicao do cliente.
  const servidor = corrida(1000 + i * 2)
  const cliente = corrida(1001 + i * 2)
  if (servidor.segundosAteAQuota != null && cliente.segundosAteAQuota != null) {
    ambosFecharam++
    diffsDeTempo.push(Math.abs(servidor.segundosAteAQuota - cliente.segundosAteAQuota))
  }
  mortes += servidor.quedas + cliente.quedas
  somaDeAbates += servidor.abates + cliente.abates
  const j = Math.min(servidor.porJanela.length, cliente.porJanela.length)
  for (let k = 0; k < j; k++) diffsEm30s.push(Math.abs(servidor.porJanela[k] - cliente.porJanela[k]))
}

function resumo(lista) {
  if (!lista.length) return 'sem amostra'
  const ordenada = [...lista].sort((a, b) => a - b)
  const mediana = ordenada[Math.floor(ordenada.length / 2)]
  const p90 = ordenada[Math.floor(ordenada.length * 0.9)]
  return `mediana ${mediana.toFixed(1)} | p90 ${p90.toFixed(1)} | pior ${ordenada[ordenada.length - 1].toFixed(1)}`
}

console.log(`hunt ${HUNT}, POKE Lv${NIVEL}, ${PARES} pares de sequencias\n`)
console.log(`pares em que os dois fecharam a quota: ${ambosFecharam}/${PARES}`)
console.log(`diferenca de TEMPO ate fechar a quota (s): ${resumo(diffsDeTempo)}`)
console.log(`diferenca de ABATES a cada janela de 30s: ${resumo(diffsEm30s)}`)
console.log(
  `quedas somadas: ${mortes} em ${PARES * 2} corridas`
  + ` | abates medios em 900s: ${(somaDeAbates / (PARES * 2)).toFixed(1)}`,
)
