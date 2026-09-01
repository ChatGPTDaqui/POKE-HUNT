// Bancada: quanto o combate produz por minuto, MEDIDO no motor.
//
// POR QUE ELA EXISTE
// -----------------------------------------------------------------------------
// A PH-376 levou `TURNO_SEGUNDOS` de 2 para 3. A previsao aritmetica e simples —
// o combate inteiro esta escrito em turnos, entao tudo dilata 1,5x de forma
// uniforme e a vazao cai para 1/1,5, ou seja -33%.
//
// Previsao aritmetica nao e medicao. O que ela NAO cobre:
//
//   * o que NAO escala com o turno e continua no mesmo ritmo — o cooldown do
//     treinador (1,5s, mao humana), a espera de troca por desmaio (2s), o delay
//     do golpe pousar (0,5s), a velocidade de andar, o tempo de reuniao do Lure
//     (18s). Todos ficaram com OUTRA proporcao em relacao ao turno, e e nessa
//     mudanca de proporcao que mora o efeito que ninguem previu;
//   * o piso `MIN_ACTION_GAP`, que engole o cooldown de 201 dos 526 golpes: pra
//     esses o turno E o ritmo, e a conta de "1,5x" vale exata; pros outros 325
//     o cooldown proprio manda e a conta e outra;
//   * caminhar entre alvos, que nao dilatou. Menos abates por minuto significa
//     MAIS tempo de luta e MENOS de caminhada na mesma hora, e o resultado
//     liquido nao e obvio no papel.
//
// COMO COMPARAR OS DOIS TURNOS
// -----------------------------------------------------------------------------
// `TURNO_SEGUNDOS` e compilado dentro de `authority/engine/headless.js`, entao a
// comparacao e por rebuild:
//
//   1. medir com o valor atual
//   2. trocar `"TURNO_SEGUNDOS": { "expr": "3" }` por "2" em
//      src/data/generated/formulas.generated.ts
//   3. npm run build:engine  &&  medir de novo
//   4. desfazer os dois e npm run build:engine
//
// A bancada IMPRIME o turno que mediu, justamente pra nao existir resultado
// orfao de configuracao.
//
// COMO RODAR
//   npm run build:engine
//   node scripts/harness/vazao-do-combate.mjs
//
//   SEGUNDOS=240 SEMENTES=20 node scripts/harness/vazao-do-combate.mjs
import { readFileSync } from 'node:fs'
import {
  createRng, createPokeInstance, buildMapWorld, stepWorld, defaultGameStateData,
} from '../../authority/engine/headless.js'

// `headless.js` NAO exporta TURNO_SEGUNDOS, entao o valor sai do gerado. Ler o
// arquivo, e nao aceitar como argumento: o ponto e que o numero impresso seja o
// que o motor esta usando, e nao o que quem rodou acha que esta usando.
const TURNO_SEGUNDOS = Number(
  /"TURNO_SEGUNDOS":\s*\{\s*"expr":\s*"([^"]+)"/
    .exec(readFileSync(new URL('../../src/data/generated/formulas.generated.ts', import.meta.url), 'utf8'))[1],
)

const HUNT = process.env.HUNT ?? 'campo_aberto_faixa1'
const SEGUNDOS = Number(process.env.SEGUNDOS ?? 180)
const SEMENTES = Number(process.env.SEMENTES ?? 12)
const PASSO = 1 / 60

// Dois regimes, porque eles respondem coisas diferentes e o efeito do turno nao
// e o mesmo nos dois:
//
//   APERTADO  o POKE no nivel da faixa. A luta dura varios turnos, entao o
//             cooldown de cada golpe conta e o resultado e sensivel ao turno.
//   FOLGADO   POKE muito acima da faixa (o caso da conta de teste). O inimigo
//             cai no primeiro contato, entao o gargalo passa a ser CAMINHAR — e
//             caminhar nao dilatou.
const REGIMES = [
  { nome: 'apertado (Nv25 charmander)', especie: 'charmander', nivel: 25 },
  { nome: 'folgado  (Nv102 entei)', especie: 'entei', nivel: 102 },
]

function gameStateFalso(poke, contadores) {
  const dados = defaultGameStateData()
  dados.team = [poke]
  dados.autoToggles = { ...dados.autoToggles, autoRevive: true }
  dados.lureConfig = { ligado: false, quantidade: 2 }
  return {
    ...dados,
    hasItem: (id) => id === 'potion' || id === 'revive',
    consumeItem: () => { contadores.itens++; return true },
    // Interceptado, e nao descartado: ouro e XP sao a vazao que a issue promete
    // cair 33%, e o gameState de verdade e quem os recebe.
    addGold: (n) => { contadores.ouro += n },
    grantTrainerExp: (n) => { contadores.xp += n },
    addItem: () => {}, setPokedexKillEntry: () => {}, setBiomaProgress: () => {},
    updatePokeInstance: () => {}, setActiveIndex: () => {}, setTrainer: () => {},
    unlockContinent: () => {}, isContinentUnlocked: () => true, addCapturedPoke: () => {},
    incrementPerfStats: () => {}, isItemLocked: () => false, removeItem: () => {},
    addPokeToTeam: () => {}, moveTeamToBag: () => {},
  }
}

function medirUmaSemente(regime, semente) {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, regime.especie, regime.nivel)
  const contadores = { ouro: 0, xp: 0, itens: 0 }
  const world = buildMapWorld(
    HUNT, poke,
    { seed: semente, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 } },
  )
  const gameState = gameStateFalso(poke, contadores)
  let salas = 0
  let salaAnterior = world.sala?.indice
  // ATAQUES e ENGAJAMENTO, porque so ouro/min nao distingue duas explicacoes
  // opostas para o mesmo numero: "o turno nao importa" e "o turno importa mas o
  // gargalo e outro".
  //
  // A cadencia sai de `pendingHits`, e NAO de `world.effects`: em
  // `silent: true` — o modo do servidor, que e o que esta bancada roda — nao
  // existe efeito visual nenhum, entao contar `abilityEffect` devolvia ZERO e
  // parecia que o POKE nao atacava. `pendingHits` e estado de SIMULACAO (e por
  // ele que o dano pousa), entao existe nos dois modos.
  //
  // O engajamento mede quanto da vida do POKE e luta. Se for pouco, dilatar a
  // luta 1,5x quase nao muda a vazao — e a conta aritmetica de -33% estaria
  // errada.
  const golpesVistos = new Set()
  let passosEngajado = 0
  let passos = 0
  for (let t = 0; t * PASSO < SEGUNDOS; t++) {
    stepWorld(world, PASSO, gameState, { silent: true })
    passos++
    for (const ph of world.pendingHits ?? []) golpesVistos.add(ph.id)
    if (world.player && (world.player.state === 'engaged' || world.player.attackAnimTimer > 0)) passosEngajado++
    if (world.sala?.indice !== salaAnterior) { salas++; salaAnterior = world.sala?.indice }
  }
  // `abates` zera na troca de sala, entao somar ele direto perderia as salas
  // anteriores. `salas * ABATES_POR_SALA` seria uma aproximacao; o numero fiel e
  // o ouro e o XP, que sao acumulados por abate e e o que o jogador sente.
  return {
    ...contadores, salas,
    golpes: golpesVistos.size,
    fracaoEngajado: passos ? passosEngajado / passos : 0,
  }
}

const linhas = []
for (const regime of REGIMES) {
  const soma = { ouro: 0, xp: 0, itens: 0, salas: 0, golpes: 0, engajado: 0 };
  for (let s = 1; s <= SEMENTES; s++) {
    const r = medirUmaSemente(regime, s * 7919)
    soma.ouro += r.ouro; soma.xp += r.xp; soma.itens += r.itens; soma.salas += r.salas
    soma.golpes += r.golpes; soma.engajado += r.fracaoEngajado
  }
  const minutos = (SEGUNDOS / 60) * SEMENTES
  linhas.push({
    regime: regime.nome,
    ouroPorMin: soma.ouro / minutos,
    xpPorMin: soma.xp / minutos,
    salasPorMin: soma.salas / minutos,
    golpesPorMin: soma.golpes / minutos,
    engajadoPct: (soma.engajado / SEMENTES) * 100,
  })
}

const saida = [];
saida.push('');
saida.push(`TURNO_SEGUNDOS medido = ${TURNO_SEGUNDOS}`);
saida.push(`hunt=${HUNT}  ${SEGUNDOS}s x ${SEMENTES} sementes = ${(SEGUNDOS / 60) * SEMENTES} minutos por regime`);
saida.push('');
saida.push('regime                        ouro/min   golpes/min   salas/min   % engajado');
saida.push('-'.repeat(80));
for (const l of linhas) {
  saida.push(
    l.regime.padEnd(30)
    + l.ouroPorMin.toFixed(1).padStart(9)
    + l.golpesPorMin.toFixed(1).padStart(13)
    + l.salasPorMin.toFixed(3).padStart(12)
    + (l.engajadoPct.toFixed(1) + '%').padStart(13),
  );
}
saida.push('');
saida.push('Guarde estes numeros com o TURNO ao lado. Comparar medicao de turnos');
saida.push('diferentes exige rebuild do headless entre as duas — ver o cabecalho.');
saida.push('');
process.stdout.write(saida.join('\n') + '\n');
