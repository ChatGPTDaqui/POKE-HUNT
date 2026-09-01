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
//   * o que NAO escala com o turno e continua no mesmo ritmo — a espera de
//     troca por desmaio (2s), o delay do golpe pousar (0,5s), a velocidade de
//     andar, o tempo de reuniao do Lure (18s). Todos ficaram com OUTRA proporcao
//     em relacao ao turno, e e nessa mudanca de proporcao que mora o efeito que
//     ninguem previu. O cooldown do Treinador estava nesta lista com 1,5s fixo,
//     e saiu dela na PH-378 justamente por causa dela: virou o turno;
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
// O QUE ELA MEDIU NA PH-378 (o Treinador passou a agir em turnos)
// -----------------------------------------------------------------------------
// Mesmo metodo, mas trocando `COOLDOWN_DO_TREINADOR` em autoSystem.ts (1,5s
// fixo -> TURNO_SEGUNDOS) com rebuild entre as duas. 200 minutos por regime,
// turno em 3s nas duas colunas:
//
//   regime      curas/min 1,5s   curas/min turno   mortes/min 1,5s   turno
//   apertado         2,04             2,04              0,000        0,000
//   folgado          1,55             1,43              0,000        0,000
//   sofrido          8,45             4,22              5,955        7,185
//
// LEITURA. A cura cai a METADE onde ela realmente acontece (sofrido: 8,45 ->
// 4,22), e as mortes sobem 20,7% junto. Nos dois regimes normais nao ha custo
// mensuravel: as mortes ficam em zero nos dois lados e as curas quase nao se
// movem. O preco da regra existe, e ele mora inteiro no jogador que esta
// caçando MUITO acima do nivel dele — o mesmo que ja morria 6 vezes por minuto
// antes da mudanca. Ouro no sofrido cai 1655 -> 1118 por consequencia das
// mortes, e nao por dilatacao de turno (o turno e 3s nas duas medicoes).
//
// A ARMADILHA QUE ESTA MEDICAO QUASE NAO PEGOU, registrada porque ela mentiu
// por completo: o contador de itens nascia pendurado em `consumeItem`, e a
// automacao de cura chama `removeItem`. Resultado: 0,00 item/min em TODO
// regime, inclusive num com o POKE morrendo 7 vezes por minuto — e esse zero
// chegou a ser reportado como se fosse um fato sobre o jogo ("a cura nao
// dispara em regime nenhum"). Ele era fiacao errada da bancada. A coluna
// `piso HP` existe pra que um zero futuro seja diagnosticavel: se o piso nao
// desce de 70%, a regra default de auto-pocao nem acordou.
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
//   SOFRIDO   POKE ABAIXO da faixa, EM OUTRA HUNT. E o unico regime em que a
//             cura automatica dispara: nos outros dois a medicao deu 0,00
//             item/min, e a coluna `piso HP` mostra por que — eles param em 77%
//             e 92%, e a regra default de auto-pocao so acorda abaixo de 70%.
//             Baixar o nivel dentro da faixa1 nao resolve (Nv8 mediu piso 70,8%,
//             ainda por cima da regra): os inimigos da faixa1 sao Nv1-30 e um
//             POKE fraco ainda ganha. A faixa2 comeca em Nv31, e e essa
//             diferenca de faixa que finalmente faz o POKE apanhar.
const REGIMES = [
  { nome: 'apertado (Nv25 charmander)', especie: 'charmander', nivel: 25 },
  { nome: 'folgado  (Nv102 entei)', especie: 'entei', nivel: 102 },
  {
    nome: 'sofrido  (Nv25 charm/faixa2)', especie: 'charmander', nivel: 25,
    hunt: 'campo_aberto_faixa2',
  },
]

function gameStateFalso(poke, contadores) {
  const dados = defaultGameStateData()
  dados.team = [poke]
  dados.autoToggles = { ...dados.autoToggles, autoRevive: true }
  dados.lureConfig = { ligado: false, quantidade: 2 }
  return {
    ...dados,
    // Estoque infinito dos tres itens que a automacao de cura usa. Antidoto
    // entra de proposito: a aresta que a PH-378 cria e HP CRITICO COM STATUS,
    // porque as duas curas passam a disputar a MESMA acao do turno, e sem
    // antidoto no bolso essa disputa nunca acontece na medicao.
    hasItem: (id) => id === 'potion' || id === 'revive' || id === 'antidote',
    consumeItem: () => true,
    // Interceptado, e nao descartado: ouro e XP sao a vazao que a issue promete
    // cair 33%, e o gameState de verdade e quem os recebe.
    addGold: (n) => { contadores.ouro += n },
    grantTrainerExp: (n) => { contadores.xp += n },
    // CONTAR EM `removeItem`, e nao em `consumeItem`. A automacao de cura chama
    // `removeItem` — as quatro acoes do Treinador, sem excecao. O contador
    // nascia pendurado em `consumeItem`, que NINGUEM chama, e por isso a
    // bancada reportava 0,00 item/min em todo regime, inclusive num com o POKE
    // morrendo 7 vezes por minuto. O zero era fiacao errada da bancada, e nao
    // um fato sobre o jogo — anotado aqui porque ele quase virou conclusao.
    //
    // `autoCatch` fica DESLIGADO nesta bancada, entao nao ha ball passando por
    // aqui e todo `removeItem` e cura.
    removeItem: (id) => {
      contadores.itens++
      if (String(id).includes('revive')) contadores.revives++
    },
    addItem: () => {}, setPokedexKillEntry: () => {}, setBiomaProgress: () => {},
    updatePokeInstance: () => {}, setActiveIndex: () => {}, setTrainer: () => {},
    unlockContinent: () => {}, isContinentUnlocked: () => true, addCapturedPoke: () => {},
    incrementPerfStats: () => {}, isItemLocked: () => false,
    addPokeToTeam: () => {}, moveTeamToBag: () => {},
  }
}

function medirUmaSemente(regime, semente) {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, regime.especie, regime.nivel)
  const contadores = { ouro: 0, xp: 0, itens: 0, revives: 0 }
  const world = buildMapWorld(
    regime.hunt ?? HUNT, poke,
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
  // MORTES sao a metrica de sobrevivencia (PH-378): contar a TRANSICAO pra
  // `fainted`, e nao o estado, porque o POKE fica desmaiado por varios frames
  // ate o revive e contar o estado inflaria o numero pela duracao da morte.
  let mortes = 0
  let estavaDesmaiado = false
  // O PISO DE HP e o diagnostico que diz se o regime chega perto de precisar de
  // cura. A regra default de auto-pocao dispara em HP < 70%; um regime que nunca
  // desce disso mede 0,00 item/min e nao responde nada sobre sobrevivencia —
  // sem esta coluna, esse 0,00 se confunde com "a cura nao funciona".
  let pisoDeHp = 1
  for (let t = 0; t * PASSO < SEGUNDOS; t++) {
    stepWorld(world, PASSO, gameState, { silent: true })
    passos++
    for (const ph of world.pendingHits ?? []) golpesVistos.add(ph.id)
    if (world.player && (world.player.state === 'engaged' || world.player.attackAnimTimer > 0)) passosEngajado++
    if (world.player && !world.player.fainted) {
      const frac = world.player.poke.hp / world.player.poke.stats.hp
      if (frac < pisoDeHp) pisoDeHp = frac
    }
    const desmaiado = !!world.player?.fainted
    if (desmaiado && !estavaDesmaiado) mortes++
    estavaDesmaiado = desmaiado
    if (world.sala?.indice !== salaAnterior) { salas++; salaAnterior = world.sala?.indice }
  }
  // `abates` zera na troca de sala, entao somar ele direto perderia as salas
  // anteriores. `salas * ABATES_POR_SALA` seria uma aproximacao; o numero fiel e
  // o ouro e o XP, que sao acumulados por abate e e o que o jogador sente.
  return {
    ...contadores, salas, mortes, pisoDeHp,
    golpes: golpesVistos.size,
    fracaoEngajado: passos ? passosEngajado / passos : 0,
  }
}

const linhas = []
for (const regime of REGIMES) {
  const soma = { ouro: 0, xp: 0, itens: 0, revives: 0, salas: 0, golpes: 0, engajado: 0, mortes: 0, pisoDeHp: 0 };
  for (let s = 1; s <= SEMENTES; s++) {
    const r = medirUmaSemente(regime, s * 7919)
    soma.ouro += r.ouro; soma.xp += r.xp; soma.itens += r.itens; soma.salas += r.salas
    soma.golpes += r.golpes; soma.engajado += r.fracaoEngajado; soma.mortes += r.mortes
    soma.pisoDeHp += r.pisoDeHp; soma.revives += r.revives
  }
  const minutos = (SEGUNDOS / 60) * SEMENTES
  linhas.push({
    regime: regime.nome,
    ouroPorMin: soma.ouro / minutos,
    xpPorMin: soma.xp / minutos,
    salasPorMin: soma.salas / minutos,
    golpesPorMin: soma.golpes / minutos,
    engajadoPct: (soma.engajado / SEMENTES) * 100,
    itensPorMin: soma.itens / minutos,
    curasPorMin: (soma.itens - soma.revives) / minutos,
    mortesPorMin: soma.mortes / minutos,
    pisoDeHpPct: (soma.pisoDeHp / SEMENTES) * 100,
  })
}

const saida = [];
saida.push('');
saida.push(`TURNO_SEGUNDOS medido = ${TURNO_SEGUNDOS}`);
saida.push(`hunt=${HUNT} (regime pode trocar)  ${SEGUNDOS}s x ${SEMENTES} sementes = ${(SEGUNDOS / 60) * SEMENTES} minutos por regime`);
saida.push('');
saida.push('regime                        ouro/min   golpes/min  % engajado   curas/min  mortes/min   piso HP');
saida.push('-'.repeat(104));
for (const l of linhas) {
  saida.push(
    l.regime.padEnd(30)
    + l.ouroPorMin.toFixed(1).padStart(9)
    + l.golpesPorMin.toFixed(1).padStart(13)
    + (l.engajadoPct.toFixed(1) + '%').padStart(12)
    + l.curasPorMin.toFixed(2).padStart(12)
    + l.mortesPorMin.toFixed(3).padStart(12)
    + (l.pisoDeHpPct.toFixed(1) + '%').padStart(10),
  );
}
saida.push('');
saida.push('Guarde estes numeros com o TURNO ao lado. Comparar medicao de turnos');
saida.push('diferentes exige rebuild do headless entre as duas — ver o cabecalho.');
saida.push('');
process.stdout.write(saida.join('\n') + '\n');
