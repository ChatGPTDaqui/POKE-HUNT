// Bancada: o que o prazo de 18s no estagio de atributo faz com a vazao e com a
// sobrevivencia, por regime de nivel (PH-420).
//
// POR QUE ELA E OBRIGATORIA, E NAO OPCIONAL
// -----------------------------------------------------------------------------
// A PH-420 e GATE DE PROMOCAO da PH-418: a issue diz, com estas palavras, que a
// PH-418 nao vai para producao sem este numero. O motivo esta escrito no
// `combatSystem`: o reset de fim de batalha que a PH-418 mexe existe por
// medicao, porque sem ele o debuff empilhado custava 27% das kills/hora.
//
// Trocar aquele reset por um prazo move os DOIS lados, e em sentidos opostos:
//
//   BUFF PROPRIO     hoje morre em ~1s (o "fim de batalha" deste motor e
//                    *nenhum inimigo engajado*, o que acontece no vao entre dois
//                    spawns), e passa a durar 18s renovaveis. Isso ACELERA.
//   DEBUFF RECEBIDO  Screech recarrega em 1,5s e baixa Defesa em -2. Se ele
//                    tambem passar a durar 18s renovaveis, a Defesa do jogador
//                    fica em 50% de forma permanente, e somada a Leer (-1) em
//                    40%. Isso DESACELERA.
//
// O sinal liquido depende do elenco de cada hunt, entao nao e questao de
// intuicao. Ja mordeu uma vez: a primeira versao da PH-418 deu prazo aos dois
// lados e mediu 100 mortes do jogador contra 15, com os 50 Revives queimados
// numa hora (`farmOffline`). O corte por AUTORIA nasceu dessa medicao.
//
// A METRICA QUE FALTAVA, E QUE E O PONTO DESTA BANCADA
// -----------------------------------------------------------------------------
// `abates/h` e `mortes/h` sozinhos NAO fecham o gate, e e facil se enganar com
// eles: depois do corte por autoria os dois voltaram exatamente ao valor de
// antes da issue (786 e 15, em route_46 com Charmander Lv25). Parece perfeito, e
// nao prova nada — aquele POKE nao usa golpe de buff, entao a medicao mostrou
// que o DEBUFF sarou e ficou muda sobre o buff.
//
// Dai a terceira coluna: FRACAO DO TEMPO COM ESTAGIO PROPRIO POSITIVO. Ela e a
// unica que responde "o buff dura o que a issue promete?". Se ela ficar perto de
// zero, a PH-418 nao entregou o pedido, por verde que o resto esteja.
//
// A quarta coluna (estagio de TERCEIRO negativo) e o outro lado: e ela que mostra
// o mecanismo dos -27% acontecendo ou nao. As duas juntas dizem se o corte por
// autoria separou o que devia separar.
//
// COMO COMPARAR ANTES E DEPOIS
// -----------------------------------------------------------------------------
// A mudanca e no motor, que entra aqui compilado em `authority/engine/headless.js`.
// Nao existe flag pra ligar e desligar, e isso e de proposito: uma bancada que
// reimplementa "o comportamento antigo" por dentro mede a reimplementacao, nao o
// jogo. Foi exatamente esse defeito que a PH-423 achou em `divergencia-de-quota`.
//
// Entao a comparacao e por CHECKOUT, e as duas colunas saem do MESMO arquivo:
//
//   1. npm run build:engine  &&  node scripts/harness/prazo-do-estagio.mjs
//   2. git checkout <merge-base> -- src/    (o commit anterior a issue)
//   3. npm run build:engine  &&  node scripts/harness/prazo-do-estagio.mjs
//   4. git checkout HEAD -- src/  &&  npm run build:engine
//
// O passo 4 nao e opcional: `headless.js` fica com o motor da medicao anterior e
// toda bancada rodada depois dele mediria o codigo errado, sem aviso nenhum.
//
// O ACHADO QUE OBRIGOU A SEGUNDA TABELA
// -----------------------------------------------------------------------------
// A primeira versao desta bancada mediu BUFF PROPRIO 0,0% nos tres regimes e
// quase virou "a PH-418 nao entrega o pedido". Era artefato do elenco: o
// Charmander Lv25 de `vazao-do-combate` leva fire_fang, ember, scratch e
// dragon_rage — nenhum golpe de buff. Uma coluna estruturalmente zero nao mede
// nada, e o zero se confunde com defeito.
//
// Ao procurar quem TEM buff no set ativo apareceu o resto do achado, e ele vale
// mais que a medicao original: entre as 27 especies com golpe de buff aprendido,
// o buff esta no set ativo PADRAO no Lv25 e sai dele do Lv40 pra cima. Medido em
// typhlosion, slaking, ampharos, quagsire e hypno: nas cinco, o buff aparece no
// 25 e nao aparece no 40, 60, 80 nem 102 — golpes melhores tomam os 4 slots.
//
// Isso NAO e um teto do jogo: `golpesUtilizaveis` respeita
// `poke.activeAbilities`, entao o jogador que escolher manter Danca das Espadas
// no set mantem. E o PADRAO que nao carrega buff em nivel alto. Consequencia
// pratica pro alcance da PH-418: no elenco default ela toca o POKE de nivel
// baixo e passa longe do de nivel alto.
//
// Dai as duas tabelas, e nenhuma delas responde sozinha:
//
//   PADRAO   o elenco que o jogador recebe sem mexer em nada. Diz o alcance REAL
//            da feature, e e a tabela que conversa com `vazao-do-combate`.
//   FORCADO  o buff empurrado no set ativo de proposito. Diz se a feature
//            FUNCIONA quando o golpe esta na mao — sem ela, "0,0%" nao distingue
//            "o prazo nao dura" de "ninguem usou buff".
//
// COMO RODAR
//   npm run build:engine
//   node scripts/harness/prazo-do-estagio.mjs
//   SEGUNDOS=900 SEMENTES=8 node scripts/harness/prazo-do-estagio.mjs
import {
  createRng, createPokeInstance, buildMapWorld, stepWorld, defaultGameStateData,
  golpesUtilizaveis, SPECIES,
} from '../../authority/engine/headless.js'

/**
 * Liga quando a bancada acha fonte de estagio SEM prazo, ou seja motor anterior
 * a PH-418 (ver `estagioPorAutoria`). As colunas de autoria viram `n/d` no
 * relatorio inteiro, e nao so na linha onde apareceu.
 */
let modeloAntigo = false

const SEGUNDOS = Number(process.env.SEGUNDOS ?? 600)
const SEMENTES = Number(process.env.SEMENTES ?? 6)
const PASSO = 0.1

// Os MESMOS tres regimes de `vazao-do-combate.mjs`, com os mesmos POKEs e as
// mesmas hunts. Nao e economia de digitacao: comparar sobrevivencia entre duas
// bancadas que definiram "acima do nivel" de formas diferentes nao vale, e a
// coluna de mortes desta aqui conversa direto com a de la.
//
//   APERTADO  no nivel da faixa. O caso comum.
//   FOLGADO   MUITO acima da faixa: o inimigo cai no primeiro contato, entao
//             quase nao ha debuff entrando e o gargalo e caminhar.
//   SOFRIDO   ABAIXO da faixa, em outra hunt. E o regime em que o jogador
//             realmente apanha, e por isso o unico em que o debuff recebido tem
//             chance de virar espiral.
const REGIMES = [
  { nome: 'apertado', especie: 'charmander', nivel: 25, hunt: 'campo_aberto_e1' },
  { nome: 'folgado', especie: 'entei', nivel: 102, hunt: 'campo_aberto_e1' },
  { nome: 'sofrido', especie: 'charmander', nivel: 25, hunt: 'campo_aberto_e4' },
]

/**
 * Os mesmos tres regimes com o buff FORCADO no set ativo.
 *
 * Typhlosion nos tres porque ele aprende `defense_curl` cedo (entao forcar e
 * legitimo: `sanearEscolhaDeGolpes` recusaria golpe nao aprendido) e porque e o
 * POKE que `troca-de-sala-sob-autoridade.mjs` ja usa — dois numeros do mesmo
 * bicho conversam.
 */
const REGIMES_COM_BUFF = [
  { nome: 'apertado', especie: 'typhlosion', nivel: 25, hunt: 'campo_aberto_e1', forcar: 'defense_curl' },
  { nome: 'folgado', especie: 'typhlosion', nivel: 102, hunt: 'campo_aberto_e1', forcar: 'defense_curl' },
  { nome: 'sofrido', especie: 'typhlosion', nivel: 25, hunt: 'campo_aberto_e4', forcar: 'defense_curl' },
]

/**
 * A terceira tabela existe porque a segunda NAO exercita a PH-419, e isso so
 * apareceu ao medir.
 *
 * `defense_curl` vale +1, e `ESTAGIO_ALVO_DA_IA` e 2. Um POKE em +1 esta ABAIXO
 * do alvo, entao a guarda antiga da IA ja queria reaplicar sempre — o buraco que
 * a PH-419 fecha ("no alvo, nunca renova, o buff cai aos 18s") nunca acontece
 * com ele. Medido: ligar a renovacao preventiva mexeu 8,1% -> 7,9%, 42,1% ->
 * 42,1% e 62,9% -> 60,9%, ou seja ruido. Concluir "a PH-419 nao serve" dali
 * seria concluir do cenario errado.
 *
 * `agility` vale +2 e fecha o alvo em UM uso, entao ele e o cenario da issue.
 * Spearow porque aprende agility cedo e a mantem no nivel alto, o que deixa os
 * tres regimes com a MESMA especie.
 *
 * O que a fracao de uptime mede aqui, e que a segunda tabela nao separa: com
 * golpe de +1 o limite e a SELECAO DE ACAO (a IA prefere golpe de dano, e luta
 * curta acaba antes de sobrar turno pra buff), e nao o prazo. Com golpe de +2 o
 * limite passa a ser o prazo, que e o que a PH-419 endereca.
 */
const REGIMES_NO_TETO = [
  { nome: 'apertado', especie: 'spearow', nivel: 25, hunt: 'campo_aberto_e1', forcar: 'agility' },
  { nome: 'folgado', especie: 'spearow', nivel: 102, hunt: 'campo_aberto_e1', forcar: 'agility' },
  { nome: 'sofrido', especie: 'spearow', nivel: 25, hunt: 'campo_aberto_e4', forcar: 'agility' },
]

function gameStateFalso(poke) {
  const dados = defaultGameStateData()
  dados.team = [poke]
  // Auto-revive e auto-pocao LIGADOS: sem eles a corrida acaba na primeira morte
  // e a medicao vira "tempo ate morrer", que nao e o que o jogador vive. Mesmo
  // motivo de `vazao-do-combate.mjs` e `troca-de-sala-sob-autoridade.mjs`.
  dados.autoToggles = { ...dados.autoToggles, autoRevive: true, autoPot: true }
  dados.lureConfig = { ligado: false, quantidade: 2 }
  return {
    ...dados,
    hasItem: (id) => id === 'potion' || id === 'revive' || id === 'antidote',
    consumeItem: () => true,
    removeItem: () => true,
    addGold: () => {}, addItem: () => {}, grantTrainerExp: () => {},
    setPokedexKillEntry: () => {}, setBiomaProgress: () => {}, updatePokeInstance: () => {},
    setActiveIndex: () => {}, moveTeamIndexToFront: () => {}, setTrainer: () => {},
    unlockContinent: () => {}, isContinentUnlocked: () => true, addCapturedPoke: () => {},
    incrementPerfStats: () => {}, isItemLocked: () => false,
    addPokeToTeam: () => {}, moveTeamToBag: () => {},
  }
}

/**
 * Le o estagio do jogador SEPARADO POR AUTORIA, que e o corte que a PH-418 faz.
 *
 * Soma por `proprio` em vez de olhar `estagios[stat]`, porque o cache ja e a
 * SOMA dos dois lados: um Howl +1 com um Rosnado -1 aparece como zero ali, e as
 * duas colunas desta bancada precisam justamente distinguir esse caso.
 */
function estagioPorAutoria(entity) {
  let proprioPositivo = 0
  let terceiroNegativo = 0
  const porStat = entity?.estagiosFonte
  if (!porStat) return { proprioPositivo, terceiroNegativo }
  for (const fontes of Object.values(porStat)) {
    for (const f of fontes ?? []) {
      // MOTOR PRE-PH-418 DETECTADO, e esta guarda nao e paranoia. Antes da issue
      // a fonte guardava so a procedencia (id, tipo, proprio, deQuem) — sem
      // contribuicao e sem prazo, porque o total morava no cache e ninguem sabia
      // qual fonte tinha posto quanto.
      //
      // Rodar esta bancada no motor antigo pra levantar a coluna "antes" e o
      // procedimento descrito no topo. Sem esta linha, as duas colunas de autoria
      // sairiam 0,0% la — nao porque nao havia estagio, mas porque a soma le um
      // campo que nao existe e toda comparacao da falso. Esse zero seria lido
      // como "antes o jogador nunca ficava debuffado", o oposto do que a medicao
      // dos -27% diz. As duas metricas NAO EXISTEM no modelo antigo, e a bancada
      // recusa o numero em vez de inventar um.
      if (f.expiraEm === undefined) { modeloAntigo = true; continue }
      if (f.proprio && f.estagios > 0) proprioPositivo += f.estagios
      if (!f.proprio && f.estagios < 0) terceiroNegativo += f.estagios
    }
  }
  return { proprioPositivo, terceiroNegativo }
}

function corrida(regime, semente) {
  const poke = createPokeInstance(createRng(semente), regime.especie, regime.nivel)
  if (regime.forcar) {
    // Entra no lugar do ULTIMO slot, e nao no primeiro: trocar o golpe de maior
    // dano mudaria a vazao junto e as duas tabelas deixariam de ser comparaveis.
    const atuais = poke.activeAbilities ?? []
    poke.activeAbilities = [...atuais.slice(0, Math.max(0, atuais.length - 1)), regime.forcar]
  }
  const world = buildMapWorld(
    regime.hunt, poke,
    { seed: semente, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 } },
  )
  const gameState = gameStateFalso(poke)

  let abates = 0
  let mortes = 0
  let estavaDesmaiado = false
  let passos = 0
  let passosComBuffProprio = 0
  let passosComDebuffDeTerceiro = 0
  // O PICO de cada lado. A fracao diz "com que frequencia", e o pico diz "quao
  // fundo" — um regime que passa 90% do tempo em -1 e um que passa 90% em -6 dao
  // a mesma fracao e nao sao o mesmo jogo.
  let picoDeBuffProprio = 0
  let picoDeDebuffDeTerceiro = 0

  for (let t = 0; t * PASSO < SEGUNDOS; t++) {
    abates += stepWorld(world, PASSO, gameState, { silent: true }).length
    passos++

    const { proprioPositivo, terceiroNegativo } = estagioPorAutoria(world.player)
    if (proprioPositivo > 0) passosComBuffProprio++
    if (terceiroNegativo < 0) passosComDebuffDeTerceiro++
    if (proprioPositivo > picoDeBuffProprio) picoDeBuffProprio = proprioPositivo
    if (terceiroNegativo < picoDeDebuffDeTerceiro) picoDeDebuffDeTerceiro = terceiroNegativo

    // Contar a TRANSICAO pra desmaiado, e nao o estado: o POKE fica caido varios
    // frames ate o revive, e contar o estado infla o numero pela duracao da morte.
    const desmaiado = !!world.player?.fainted
    if (desmaiado && !estavaDesmaiado) mortes++
    estavaDesmaiado = desmaiado
  }

  const porHora = 3600 / SEGUNDOS
  return {
    // Os golpes que o POKE realmente levou. Sem esta coluna, "buff proprio 0,0%"
    // nao diz se o prazo falhou ou se nao havia golpe de buff no set — foi
    // exatamente essa confusao que quase virou conclusao errada aqui.
    golpes: golpesUtilizaveis(world.player.poke, SPECIES[world.player.poke.speciesId], false),
    abatesPorHora: abates * porHora,
    mortesPorHora: mortes * porHora,
    fracaoComBuffProprio: passos ? passosComBuffProprio / passos : 0,
    fracaoComDebuffDeTerceiro: passos ? passosComDebuffDeTerceiro / passos : 0,
    picoDeBuffProprio,
    picoDeDebuffDeTerceiro,
  }
}

const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const pct = (x) => `${(x * 100).toFixed(1)}%`

console.log(
  `${SEGUNDOS}s x ${SEMENTES} sementes = ${((SEGUNDOS / 60) * SEMENTES).toFixed(0)} minutos por regime, passo de ${PASSO}s\n`
  + 'buff proprio  = fracao do tempo com alguma fonte `proprio` positiva viva (o que a PH-418 promete)\n'
  + 'debuff de 3o  = fracao do tempo com alguma fonte de OUTRO negativa viva (o mecanismo dos -27%)\n',
)
function tabela(titulo, regimes) {
  console.log(`\n--- ${titulo} ---`)
  console.log('regime    abates/h   mortes/h   buff proprio (pico)   debuff de 3o (pico)   golpes ativos')
  for (const regime of regimes) {
    const rs = []
    for (let s = 1; s <= SEMENTES; s++) rs.push(corrida(regime, s * 101))
    const buff = modeloAntigo ? 'n/d'
      : `${pct(media(rs.map((r) => r.fracaoComBuffProprio)))} (+${Math.max(...rs.map((r) => r.picoDeBuffProprio))})`
    const debuff = modeloAntigo ? 'n/d'
      : `${pct(media(rs.map((r) => r.fracaoComDebuffDeTerceiro)))} (${Math.min(...rs.map((r) => r.picoDeDebuffDeTerceiro))})`
    console.log(
      regime.nome.padEnd(10)
      + media(rs.map((r) => r.abatesPorHora)).toFixed(0).padStart(8)
      + media(rs.map((r) => r.mortesPorHora)).toFixed(1).padStart(11)
      + buff.padStart(22)
      + debuff.padStart(22)
      + `   ${rs[0].golpes.join(',')}`,
    )
  }
}

tabela(`elenco PADRAO (${REGIMES.map((r) => r.especie).join('/')})`, REGIMES)
tabela('buff FORCADO de +1, ABAIXO do alvo da IA (typhlosion + defense_curl)', REGIMES_COM_BUFF)
tabela('buff FORCADO de +2, NO alvo da IA (spearow + agility) — cenario da PH-419', REGIMES_NO_TETO)

if (modeloAntigo) {
  console.log(
    '\nMOTOR PRE-PH-418: a fonte de estagio nao tem prazo. As colunas de autoria\n'
    + 'saem `n/d` porque o modelo antigo nao guarda quanto cada fonte contribuiu.\n'
    + 'abates/h e mortes/h continuam validos, e sao a comparacao possivel.',
  )
}
