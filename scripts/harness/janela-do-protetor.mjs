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
// ATENCAO: A VERSAO ANTERIOR DESTA BANCADA NAO MEDIA NADA (achado na PH-331)
// -----------------------------------------------------------------------------
// Ela concluia, em texto, que "em toda janela testada o protetor morre na
// PRIMEIRA janela" e que "a duracao da janela sozinha nao explica nada". Essa
// conclusao esta ERRADA e nao deve ser reaproveitada: ela foi medida sobre um
// cenario que nao tinha protetor nenhum. Tres defeitos, os tres silenciosos:
//
//   1. `sala` e `protetorPendente` iam no TERCEIRO argumento de `buildMapWorld`
//      (`carry`), e nao no quarto (`progresso`). Os dois eram ignorados: a sala
//      era sorteada do zero com `abates: 0`, entao o mundo nascia com SEIS MOBS
//      COMUNS. O que a bancada cronometrava era o tempo de matar seis mobs.
//   2. O modo "protetor longe" escrevia em `mapDef.width`/`height`, que nao
//      existem (`MapDef` tem `bounds.width`). A posicao virava `NaN`.
//   3. Corrigido o (2), o canto do mapa ficava FORA do circulo andavel: o alvo
//      nao era distante, era inalcancavel, e a bancada media 0/12 em toda janela.
//
// O QUE ELA MEDE AGORA (2026-08-31, com os tres corrigidos)
// -----------------------------------------------------------------------------
// Com o protetor onde o jogo de fato o poe (250-550 unidades, cone de `facing`),
// o protetor cai e a sala avanca em toda janela testada — nos dois extremos de
// poder (Entei Lv102 e Charmander Lv25). O que a bancada ACHOU foi outra coisa:
// antes da correcao da PH-331, a coluna "sala trocou na janela" dava 0/12 em
// janela de 5s, porque `SALA_TRANSITION_COUNTDOWN` (3s) nao caberia no que
// sobrava dela e a transicao era descartada com a janela. Depois: 12/12 em todas.
//
// A MEDICAO NO JOGO REAL (conta de teste, jogo-dev, 2026-08-29), bloqueando o
// flush do cliente pra forcar janelas de tamanhos diferentes na MESMA sessao —
// esta continua valendo, foi feita no jogo e nao aqui:
//
//   janela de   5s  ->  0 abates (dezenas seguidas; `hp_atual` do protetor
//                                 `ponyta` parado em 72 por mais de 10 minutos)
//   janela de  35s  -> 10 abates, 415 de ouro, e a sala avancou
//   janela de  82s  -> 25 abates, 950 de ouro
//   janela de 111s  -> 24 abates, 6.880 de ouro, protetor morto
//
// LICAO, e ela e a razao de este cabecalho ser tao longo: uma bancada que passa
// o argumento no lugar errado nao da erro — ela devolve um numero, e o numero
// entra na documentacao como fato. Antes de confiar numa medicao daqui, confira
// que o cenario existe: `world.enemies.some(e => e.isProtetor)` e
// `world.sala.abates === 30`.
//
// COMO RODAR
//   npm run build:engine
//   node scripts/harness/janela-do-protetor.mjs
//
//   NIVEL=25 ESPECIE=charmander node scripts/harness/janela-do-protetor.mjs
//   LURE=0 node ...            (lure desligado)
//   DISTANTE=1 node ...        (protetor no canto — cenario NAO alcancavel, ver acima)
import {
  createRng, createPokeInstance, buildMapWorld, stepWorld, defaultGameStateData,
} from '../../authority/engine/headless.js'

const HUNT = 'campo_aberto_e1'
// NIVEL do POKE do jogador. 102 era fixo no codigo e e MUITO acima do que a
// hunt pede (`campo_aberto_e1`) — nesse nivel o protetor cai no
// primeiro contato e a bancada nao mede nada. `NIVEL=25 node ...` reproduz a
// condicao de quem esta jogando a faixa de verdade. Ver a sweep no fim.
const NIVEL = Number(process.env.NIVEL ?? 102)
const ESPECIE = process.env.ESPECIE ?? 'entei'
const PASSO = 1 / 60
const ABATES_POR_SALA = 30
// As janelas testadas: 5s e a que o pedido repetido de sala produz, 30s e o
// flush periodico, 90s e o teto do intervalo esticado.
const JANELAS = [5, 15, 30, 60, 90]
const SEMENTES = 12
// Lure ligado: e o estado real da conta em que o travamento foi observado.
const LURE_LIGADO = process.env.LURE !== '0'
/**
 * `DISTANTE=1` empurra o protetor pro canto do mapa; o padrao (0) deixa ele
 * onde o jogo o poe.
 *
 * O PADRAO MUDOU PRA 0 (PH-331), e isso e correcao de medicao. O canto
 * (`bounds.width - 64`, `bounds.height - 64`) fica FORA do circulo andavel
 * destas hunts (`mapWalkRadius`), entao o protetor ali nao esta "longe": esta
 * inalcancavel. O jogador anda ate a borda e para, e a bancada mede 0/12 em toda
 * janela — inclusive 90s — que le como "a janela nao resolve" quando o que
 * aconteceu foi o alvo nao existir de forma jogavel.
 *
 * A distancia REAL do jogo e outra e ja vem de graca: `entradaDoInimigo` devolve
 * `null` em hunt com `maxEnemies > 1`, entao o protetor nasce por
 * `randomSpawnPoint` — 250 a 550 unidades, no cone pra onde o POKE olha.
 */
const DISTANTE = process.env.DISTANTE === '1'

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
  const poke = createPokeInstance(rng, ESPECIE, NIVEL)
  // TRES ARGUMENTOS, e nao dois (PH-331). `buildMapWorld(mapId, poke, carry,
  // progresso)`: `sala` e `protetorPendente` moram no QUARTO argumento. A versao
  // original desta bancada empilhava os quatro campos num objeto so e passava
  // como `carry` — `progresso` chegava `undefined`, entao `sala` era sorteada do
  // zero com `abates: 0` e o mundo nascia com SEIS MOBS COMUNS e nenhum
  // protetor. Ver a nota "o que esta bancada mediu de verdade" no cabecalho.
  const world = buildMapWorld(
    HUNT, poke,
    { seed: semente, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 } },
    { sala, protetorPendente: protetorSalvo },
  )
  // O protetor no CANTO OPOSTO do mapa, e nao onde o sorteio o poe.
  // E a condicao de campo: no jogo o POKE precisa atravessar a sala pra chegar
  // nele, e e essa caminhada que a janela curta nao paga.
  //
  // `bounds.width`, e nao `width`: `MapDef` nao tem `width`/`height` no topo. A
  // versao original lia `undefined - 64` e escrevia `NaN` na posicao — o que nao
  // "poe o protetor longe", poe ele em lugar nenhum.
  const prot = world.enemies.find((e) => e.isProtetor)
  if (prot && DISTANTE) {
    prot.x = world.mapDef.bounds.width - 64
    prot.y = world.mapDef.bounds.height - 64
    prot.spawnPoint = { x: prot.x, y: prot.y }
  }
  const gameState = gameStateFalso(poke)
  for (let t = 0; t * PASSO < segundos; t++) stepWorld(world, PASSO, gameState, { silent: true })
  // COMO SE SABE QUE O PROTETOR MORREU — e por que nenhum sinal sozinho serve.
  //
  // `protetorPendente == null` nao basta: o cao de guarda do impasse (PH-301)
  // zera o MESMO campo quando o protetor passa `PROTETOR_SEM_DANO_LIMITE`
  // segundos engajado sem perder HP — ali ele e descartado e outro toma o lugar,
  // com a sala igualmente travada. A versao anterior desta bancada contava as
  // duas coisas como vitoria.
  //
  // `protetorResolvido` tambem nao basta, e este e o erro mais traicoeiro:
  // `aplicarTransicaoDeSala` (salaSystem.ts, PH-230) o volta pra `false` quando a
  // sala nova entra, porque a marca vale por SALA e nao pela sessao. Ou seja, num
  // window que caiba "matar + SALA_TRANSITION_COUNTDOWN", o sinal de vitoria e
  // apagado pela propria vitoria — e o que sobra ao fim da janela e
  // indistinguivel de troca por impasse. Medido: com janela de 5s o flag
  // sobrevive e a bancada lia 12/12; com 15s ou mais a transicao completava e a
  // bancada lia 0/12 com 480 "trocas".
  //
  // O sinal robusto e a SALA TER MUDADO. Ela e a consequencia que a issue de
  // fato pergunta por ("o guardiao caiu, a sala trocou?"), e nao e apagada por
  // nada depois.
  const salaFinal = world.sala
  const avancouDeSala = salaFinal != null
    && (salaFinal.indice !== sala.indice || salaFinal.ciclos !== sala.ciclos)
  const transicaoArmada = world.salaPendente != null || world.salaCountdownRemaining != null
  const venceu = avancouDeSala || transicaoArmada || world.protetorResolvido === true
  return {
    pendente: world.protetorPendente,
    hp: world.protetorPendente?.hpAtual ?? 0,
    venceu,
    // Sala trocada de fato dentro desta janela (nao so armada).
    avancou: avancouDeSala,
    trocouDeProtetor: !venceu && world.protetorPendente == null,
    sala: salaFinal,
  }
}

/**
 * Quantas janelas de `segundos` ate o protetor cair, ou null se travou.
 *
 * Devolve tambem se a sala ARMOU a transicao na janela em que o protetor caiu —
 * que e a pergunta que interessa ("o guardiao morreu e a sala trocou?"), e nao
 * so se ele morreu.
 */
function janelasAteMatar(semente, segundos, teto = 40) {
  const salaBase = { indice: 8, chave: 'meadow', abates: ABATES_POR_SALA, ciclos: 1 }
  let protetor = null
  let hpAnterior = null
  let trocas = 0
  for (let i = 0; i < teto; i++) {
    // CÓPIA por janela, e nao o mesmo objeto: `buildMapWorld` usa
    // `progresso.sala` por REFERENCIA, e `registrarAbate`/`aplicarTransicaoDeSala`
    // mutam esse objeto. Reusando um so, a janela 2 comecaria com o que a janela 1
    // escreveu — e a comparacao "a sala mudou?" ficaria sempre falsa, porque o
    // valor de referencia teria mudado junto.
    const r = janelaDoServidor(semente + i, { ...salaBase }, protetor, segundos)
    if (r.venceu) {
      return { janelas: i + 1, segundos: (i + 1) * segundos, travou: false, avancou: r.avancou, trocas }
    }
    if (r.trocouDeProtetor) trocas++
    hpAnterior = r.hp
    protetor = r.pendente
  }
  return { janelas: null, segundos: null, travou: true, hpFinal: hpAnterior, trocas }
}

function medir(janela) {
  const resultados = []
  for (let s = 0; s < SEMENTES; s++) resultados.push(janelasAteMatar(2000 + s * 100, janela))
  const mataram = resultados.filter((r) => !r.travou)
  const medianas = mataram.map((r) => r.janelas).sort((a, b) => a - b)
  return {
    mataram: mataram.length,
    avancaram: mataram.filter((r) => r.avancou).length,
    trocas: resultados.reduce((soma, r) => soma + r.trocas, 0),
    mediana: medianas.length ? medianas[Math.floor(medianas.length / 2)] : null,
  }
}

console.log(
  `hunt ${HUNT}, POKE ${ESPECIE} Lv${NIVEL}, protetor da sala 9, ${SEMENTES} sementes por janela`
  + `\nlure ${LURE_LIGADO ? 'ligado' : 'desligado'}, protetor ${DISTANTE ? 'no canto do mapa' : 'onde o jogo o poe'}\n`,
)
console.log('janela | venceu  | sala trocou na janela | trocas de protetor | janelas ate vencer (mediana)')
console.log('-------+---------+------------------+--------------------+-----------------------------')
for (const janela of JANELAS) {
  const m = medir(janela)
  console.log(
    `${String(janela).padStart(5)}s | ${String(m.mataram).padStart(2)}/${SEMENTES}`
    + `   | ${String(m.avancaram).padStart(2)}/${SEMENTES}`
    + `              | ${String(m.trocas).padStart(3)}`
    + `                | ${m.mediana == null ? '—' : `${m.mediana} (${m.mediana * janela}s de jogo)`}`,
  )
}
console.log(
  '\nLeitura: "travou" e o protetor sobreviver a 40 janelas seguidas. "morreu" conta'
  + '\nSO abate de verdade (protetorResolvido) — troca por impasse (PH-301) vai na'
  + '\ncoluna propria, porque ela deixa a sala travada igual.',
)
