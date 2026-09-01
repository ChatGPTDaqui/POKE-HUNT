// Onde as hunts sao montadas de verdade.
//
// DESENHO ATUAL: 12 biomas (data/biomas.ts) x 3 faixas de nivel = 36 hunts.
// Cada bioma tem de 1 a 4 SUB-BIOMAS (data/generated/subBiomas.generated.ts,
// derivado das pools do PokeRogue), e a hunt sorteia um sub-bioma por sala.
//
// O QUE ISTO SUBSTITUIU, E POR QUE: antes eram 69 hunts montadas por "1 tipo
// elemental = 1 bioma" x zona de 10 niveis x regiao (Johto/Kanto). O recorte
// por regiao NAO sobrevive a pools tematicas: medido nas 209 especies
// alocadas, 12 dos 33 sub-biomas ficariam com menos de 3 especies numa das
// regioes (Praia e Dojo sem NENHUMA de Johto, Floresta Nevada sem nenhuma de
// Kanto). E a escada de 9 zonas nao sobrevive ao elenco: a zona 2 fica vazia
// em 11 dos 12 biomas.
//
// ---------------------------------------------------------------------------
// A REGRA CENTRAL: UMA LINHA EVOLUTIVA, ESTAGIOS EM FAIXAS DISJUNTAS
// ---------------------------------------------------------------------------
// Uma faixa cobre 30 niveis. Jogar a linha inteira dentro dela produzia coisa
// absurda: medido, 228 pares especie x hunt em que a especie ja deveria ter
// evoluido (Caterpie, que evolui no 7, nascendo Lv60).
//
// Entao cada ESTAGIO da linha entra com a sub-faixa de nivel em que ele e o
// estagio correto, e essas sub-faixas nao se sobrepoem:
//
//   linha Caterpie na faixa I  (Lv 1-30):  Caterpie 1-6 | Metapod 7-9 | Butterfree 10-30
//   linha Pidgey   na faixa II (Lv 31-60): Pidgeotto 31-35 | Pidgeot 36-60
//   linha Pidgey   na faixa III (Lv 61-90): Pidgeot 61-90
//
// Duas consequencias que sao o ponto, nao efeito colateral:
//
//   - Nenhum nivel absurdo, em nenhuma faixa.
//   - O peso de spawn continua sendo o `spawn_tier` real do Gen1/Gen2 DO
//     PROPRIO ESTAGIO. A alternativa (auto-evoluir no spawn, como o PokeRogue
//     faz) faria o Gyarados herdar o peso `muito_comum` do Magikarp — o dado
//     mais bem fundamentado do projeto destruido em silencio.
import { SPECIES } from './pokes'
import { SUB_BIOMA_ESPECIES } from './generated/subBiomas.generated'
import { SPAWN_WEIGHT_BY_SPECIES } from './generated/spawnTiers.generated'
import { buildNightmareMirror, BOSS_MAPS_DATA, BOSS_ENCOUNTERS_DATA } from './nightmareMaps'
import { TRAINING_MAP, TRAINING_MAP_ID, TRAINING_ENCOUNTER } from './trainingDummy'
import {
  BIOMAS, FAIXAS, GEOMETRIA, LOOT, MAX_INIMIGOS_HUNT_INICIAL, huntId,
  type BiomaDef, type FaixaDef,
} from './biomas'
import { zonaMinimaDaEspecie } from './spawnStrength'
import type { HuntMapDef, HuntEncounter } from './huntTypes'

// ---------------------------------------------------------------------------
// Hunt inicial
// ---------------------------------------------------------------------------
// Nao e um bioma: e a primeira tela do jogo, elenco curado a mao, e fica FORA
// do sistema de salas. Rattata e de Kanto e isso e deliberado — o pedido
// original nomeou os tres primeiros.
export const STARTER_HUNT_ID = 'route_46'

// O ELENCO SAIU DE 3 PRA 9, E OS 6 NOVOS VIERAM DO SUB-BIOMA `town`.
//
// A hunt inicial e a primeira tela do jogo e mostrava tres especies. O `town`
// do PokeRogue, que e o bioma de entrada dele, tinha 17 especies no tier
// COMMON — todas forma base de primeira rota — e no nosso desenho isso caia
// num sub-bioma de Campo Aberto que o jogador so ve depois. Os seis mais
// reconheciveis como "primeira rota" mudaram de casa: `gerar-subbiomas.mjs`
// (SAI_DO_SUB_BIOMA) tira os seis do `town`, e eles entram aqui.
//
// O CRITERIO NAO FOI TEMATICO SO. Toda especie daqui tem BST <= 251, que e a
// faixa que a hunt JA tinha (rattata 253, hoothoot 262) — entao o teto de
// dificuldade nao subiu, a media desceu. Ficaram de fora spearow (262) e
// taillow (270), que sao os agressivos, e sunkern (evolui no Lv80, ficaria pra
// sempre). Nenhuma delas evolui antes do Lv7, entao todas continuam sendo o
// estagio certo em Lv1-3.
//
// A HUNT DEIXOU DE SER SO-NORMAL, e isso e consequencia aceita e nao descuido:
// caterpie e weedle sao BUG, poochyena e DARK. O invariante antigo ("todos
// NORMAL") era descricao das tres especies escolhidas, nunca uma regra de
// desenho — o que a hunt precisa garantir e nivel baixo e inimigo fraco, e isso
// esta medido acima.
//
// As seis saem do `town` de verdade (nao ficam nos dois lugares) e nenhuma some
// do jogo: as tres linhas de inseto continuam com casa em `forest` pela forma
// final (butterfree, beedrill, beautifly), e pidgey, zigzagoon e poochyena tem
// casa direta em mountain/plains/metropolis/volcano.
const STARTER_HUNT_SPECIES = [
  'sentret', 'hoothoot', 'rattata',
  'pidgey', 'caterpie', 'weedle', 'zigzagoon', 'poochyena', 'wurmple',
]

// Lv1-3, com o 3 raro. O 3 e 3% E ESSE NUMERO FOI MEDIDO, nao arredondado.
//
// O teto era Lv2. Subir pra 3 tem um risco conhecido: um POKE inicial Lv1 tem
// 12 HP, e a UNICA janela em que conta nova morre sao os primeiros 30-60
// segundos (ver a nota de MAX_INIMIGOS_HUNT_INICIAL em data/biomas.ts, decidida
// medindo exatamente isso).
//
// Bancada: scripts/harness/hunt-inicial-lv3.mjs, 200 sementes x os 3 iniciais =
// 600 vidas por configuracao, 60 segundos cada.
//
//   3 especies, Lv1-2  80/20  (era) ..... 2,50%  (15/600)
//   9 especies, Lv1-2  80/20  ........... 1,17%  ( 7/600)
//   9 especies, Lv1-3  70/22/8 .......... 4,67%  (28/600)
//   9 especies, Lv1-3  74/22/4 .......... 2,67%  (16/600)
//   9 especies, Lv1-3  76/21/3  (este) .. 2,00%  (12/600)
//
// DUAS COISAS QUE SO APARECERAM PORQUE A BANCADA DIZ QUEM MATOU:
//
// 1. O ELENCO MAIOR TORNA A HUNT MAIS SEGURA, nao menos — 2,50% -> 1,17% so de
//    trocar 3 especies por 9. O carrasco e o Rattata (atk 56, spd 72, o mais
//    forte e o mais rapido do elenco): ele era 22 de 28 mortes na configuracao
//    mais letal, e passar de 1/3 do pool pra 1/6 dilui isso. As seis especies
//    novas somadas aparecem em 4 das 28.
//
// 2. Todo o custo do Lv3 e do Rattata Lv3, que sozinho fez metade das mortes
//    (14 de 28) com 8% de peso. Foi por isso que a calibragem mexeu no peso do
//    nivel, e nao no elenco.
//
// O resultado escolhido deixa a hunt MAIS SEGURA do que ela esta no ar hoje
// (2,00% contra 2,50%) e ainda assim com Lv3 dentro. Nao ha troca aqui.
//
// A ressalva que toda bancada headless carrega vale: ela ja discordou do
// servidor real por quase 6x em taxa de morte absoluta. O que ela responde bem
// e a comparacao RELATIVA, e a comparacao relativa e favoravel.
const STARTER_LEVEL_WEIGHTS = [
  { level: 1, weight: 76 },
  { level: 2, weight: 21 },
  { level: 3, weight: 3 },
]

// ---------------------------------------------------------------------------
// Peso de spawn
// ---------------------------------------------------------------------------
// Tier real do Gen1/Gen2 (scripts/derive-spawn-tiers.js), o MESMO pra especie
// em qualquer hunt. Vem do arquivo gerado proprio, e nao raspado dos encontros
// da estrutura de hunts antiga: aquela dependencia era silenciosa — parar de
// emitir o arquivo velho nao daria erro, so zeraria todos os pesos.
// Especie sem tier cai em 10 = "incomum", o meio da escala de 5 tiers.
const DEFAULT_WEIGHT = 10

// ---------------------------------------------------------------------------
// Cadeia de evolucao
// ---------------------------------------------------------------------------
const PRE_EVOLUCAO: Record<string, string> = {}
for (const especie of Object.values(SPECIES)) {
  if (especie.evolvesTo && SPECIES[especie.evolvesTo]) PRE_EVOLUCAO[especie.evolvesTo] = especie.id
}

/**
 * Em que FAIXA uma zona minima cai — o indice, nao a faixa, porque quem chama
 * precisa poder pedir "a seguinte".
 *
 * Zona acima de toda `zonaMaxima` devolve o indice da ultima faixa: e o topo do
 * jogo, nao ha mais pra onde empurrar.
 */
function indiceDeFaixa(zona: number): number {
  const i = FAIXAS.findIndex((f) => zona <= f.zonaMaxima)
  return i === -1 ? FAIXAS.length - 1 : i
}

/** A faixa que contem este nivel. Nivel acima da ultima cai na ultima. */
function indiceDeFaixaPorNivel(nivel: number): number {
  const i = FAIXAS.findIndex((f) => nivel <= f.niveis[1])
  return i === -1 ? FAIXAS.length - 1 : i
}

/**
 * A partir de que nivel `speciesId` deixa de ser o estagio correto da linha.
 *
 * Evolucao por NIVEL usa o nivel real do catalogo. As 9 evolucoes ESPECIAIS
 * (ex-troca: Kadabra->Alakazam, Onix->Steelix...) carregam
 * `evolvesAtLevel = 80`, que e a regra do JOGADOR (Nivel 80 + 20 Pedras, ver
 * data/pokes.ts) e nao faz sentido pro selvagem: usar 80 aqui trancaria
 * Alakazam, Gengar, Machamp, Steelix, Golem, Kingdra, Politoed e Scizor em
 * Lv80-90, uma fatia minuscula do jogo. Pro selvagem o gatilho e a FORCA — a
 * forma evoluida aparece a partir da primeira faixa que a zona minima dela
 * alcanca.
 */
function nivelDeTroca(speciesId: string, desde: number): number | null {
  const especie = SPECIES[speciesId]
  const alvo = especie?.evolvesTo
  if (!alvo || !SPECIES[alvo]) return null
  if (especie.isSpecialEvolution) {
    // A forma evoluida tem que comecar pelo menos uma FAIXA acima da origem,
    // senao a origem e espremida pra fora do jogo. Bug real, pego pelo teste
    // "toda especie selvagem tem pelo menos uma hunt": Scyther tem zona minima
    // 5 e Scizor tambem 5, entao o gatilho caia no mesmo Lv31 em que Scyther
    // comeca e a sub-faixa dele virava [31,30] — vazia.
    //
    // O empurrao e em FAIXA, e nao em zona (PH-145). "Zona + 1" resolvia
    // Scyther porque as zonas 5 e 6 caem em faixas diferentes, mas nao resolve
    // quando as duas zonas moram na MESMA faixa: Pichu tem zona 0 e Pikachu
    // zona 1, as duas na primeira faixa, entao `max(1, 0+1) = 1` devolvia Lv1 e
    // Pichu ficava com [1,0]. Igglybuff, Cleffa e Togepi sumiam pelo mesmo
    // motivo. Antes desta issue nao aparecia porque evolucao por amizade nao
    // existia no catalogo e os quatro passavam por "nao evolui".
    //
    // `desde` e o que faz a conta ENCADEAR numa linha de tres estagios onde os
    // dois gatilhos sao especiais. Pichu -> Pikachu -> Raichu: sem ele, Pichu
    // empurra Pikachu pra Lv31 e Pikachu tambem troca em Lv31, entao o estagio
    // do meio fica com [31,30] e some. A faixa da ORIGEM e a maior entre "onde
    // este estagio comeca" e "onde a especie e forte o bastante pra aparecer" —
    // a segunda metade e o caso do Scyther, que nao aparece antes da faixa II
    // mesmo comecando a linha no Lv1.
    const daOrigem = Math.max(indiceDeFaixaPorNivel(desde), indiceDeFaixa(zonaMinimaDaEspecie(speciesId)))
    const doAlvo = indiceDeFaixa(zonaMinimaDaEspecie(alvo))
    const indice = Math.max(doAlvo, daOrigem + 1)
    // Alvo forte demais pra qualquer faixa restante: a origem fica com a linha
    // inteira, e a forma evoluida so aparece por evolucao do POKE do jogador.
    if (indice >= FAIXAS.length) return null
    const pisoDaFaixa = FAIXAS[indice].niveis[0]

    // TETO PELO GATILHO DO ALVO (PH-332): empurrar o alvo pro piso da faixa
    // seguinte assume que ELE tambem tem gatilho de faixa. Quando o alvo evolui
    // por NIVEL — e por nivel baixo —, o empurrao passa por cima dele e o
    // estagio do meio fica sem lugar nenhum.
    //
    // O caso: `azurill -> marill -> azumarill`, que entrou com a Geracao III.
    // Azurill evolui por amizade (vira especial, `evolvesAtLevel: 80`) e Marill
    // evolui em Lv18 pelo catalogo. Sem teto, Azurill ficava com [1,30] e Marill
    // comecava em 31 — depois de o proprio Marill ja ter evoluido. As duas
    // guardas de `hunts.test.ts` pegaram: Marill sumia do jogo, e Azumarill
    // entrava em Lv18-30 na mesma hunt em que Azurill estava em Lv1-30.
    //
    // Antes da Gen III isso nao acontecia: as unicas linhas com estagio especial
    // no MEIO (Pichu/Pikachu/Raichu, Cleffa, Igglybuff, Togepi) tem os DOIS
    // gatilhos especiais, entao os dois usavam piso de faixa e encaixavam.
    //
    // A METADE, e nao `gatilhoDoAlvo - 1`. As duas opcoes mantem todo estagio
    // alcancavel e as duas passam nos testes; a diferenca e o tamanho da janela
    // do estagio do MEIO. Com `-1`, Azurill ficaria com [1,16] e Marill com
    // [17,17] — um unico nivel, o que na pratica e a especie nao existir, que e
    // exatamente o defeito que a guarda de cobertura existe pra impedir. Com a
    // metade: Azurill [1,8], Marill [9,17], Azumarill [18,30]. O `max(2, ...)`
    // garante que a ORIGEM tambem sobreviva quando o gatilho do alvo e 2 ou 3.
    const alvoDef = SPECIES[alvo]
    const gatilhoDoAlvo = alvoDef.isSpecialEvolution ? null : alvoDef.evolvesAtLevel
    if (gatilhoDoAlvo != null && gatilhoDoAlvo <= pisoDaFaixa) {
      return Math.min(pisoDaFaixa, Math.max(2, Math.ceil(gatilhoDoAlvo / 2)))
    }
    return pisoDaFaixa
  }
  // `desde + 1` NAO e defensividade: e o que impede o gatilho de ANDAR PRA TRAS
  // (PH-332).
  //
  // `desde` e o nivel em que este estagio comeca a ser o correto, e ele vem do
  // gatilho do estagio ANTERIOR. Quando o anterior e uma evolucao ESPECIAL, o
  // ramo acima devolve o piso de uma faixa (31, 61, ...) e nao o nivel do
  // catalogo — e o gatilho de nivel do estagio seguinte pode ser MENOR que isso.
  //
  // O caso que revelou: `azurill -> marill -> azumarill`. Azurill entrou no
  // elenco com a Geracao III e evolui por AMIZADE, entao vira especial e empurra
  // Marill pra `desde = 31`; Marill evolui em Lv18 pelo catalogo. Sem o teto,
  // `nivelDeTroca(marill, 31)` devolvia 18 e produzia duas coisas erradas de uma
  // vez:
  //
  //   - Marill ficava com a sub-faixa [31, 17], vazia, em TODA faixa — e
  //     desaparecia do jogo (`hunts.test.ts`: "toda especie selvagem tem pelo
  //     menos uma hunt");
  //   - `desde` regredia de 31 pra 18 e Azumarill entrava em Lv18-30 na MESMA
  //     hunt em que Azurill estava em Lv1-30 — dois estagios da mesma linha
  //     concorrendo ("estagios da mesma linha nao se sobrepoem").
  //
  // Nao afeta linha nenhuma que ja existia: numa linha toda de gatilho por
  // nivel, o nivel do catalogo de um estagio e sempre maior que o do anterior,
  // entao o `max` devolve o proprio `evolvesAtLevel`. Ele so morde quando um
  // gatilho de faixa (do ramo especial) fica acima do gatilho de nivel seguinte,
  // que antes da Gen III nao acontecia — as linhas com estagio especial no MEIO
  // (Pichu/Pikachu/Raichu) tinham os DOIS gatilhos especiais.
  const porNivel = especie.evolvesAtLevel
  return porNivel == null ? null : Math.max(porNivel, desde + 1)
}

/** Raizes das linhas evolutivas presentes em `especies`, sem duplicar. */
function raizesDe(especies: Iterable<string>): string[] {
  const raizes: string[] = []
  for (const id of especies) {
    let atual = id
    for (let i = 0; i < 10 && PRE_EVOLUCAO[atual]; i++) atual = PRE_EVOLUCAO[atual]
    if (!raizes.includes(atual)) raizes.push(atual)
  }
  return raizes
}

interface Trecho {
  speciesId: string
  minLevel: number
  maxLevel: number
}

/**
 * Recorta a linha que comeca em `raiz` na faixa [lo, hi]: um trecho por
 * estagio, com a sub-faixa de nivel em que aquele estagio e o correto.
 *
 * Um estagio e pulado quando (a) nao esta no elenco deste sub-bioma — a
 * heranca por familia do gerador da a mesma casa pra linha toda, mas duas
 * linhas podem se juntar com casas diferentes — ou (b) a zona minima dele
 * passa da faixa, que e o que impede Tyranitar de aparecer numa hunt Lv31-60.
 */
function trechosDaLinha(raiz: string, faixa: FaixaDef, elenco: Set<string>): Trecho[] {
  const [lo, hi] = faixa.niveis
  const trechos: Trecho[] = []
  let atual: string | null = raiz
  let desde = 1
  for (let i = 0; i < 10 && atual; i++) {
    const troca = nivelDeTroca(atual, desde)
    const ate = troca == null ? Number.POSITIVE_INFINITY : troca - 1
    const min = Math.max(lo, desde)
    const max = Math.min(hi, ate)
    if (min <= max && elenco.has(atual) && zonaMinimaDaEspecie(atual) <= faixa.zonaMaxima) {
      trechos.push({ speciesId: atual, minLevel: min, maxLevel: max })
    }
    if (troca == null) break
    desde = troca
    atual = SPECIES[atual].evolvesTo
  }
  return trechos
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------
const maps: Record<string, HuntMapDef> = {}
const encounters: Record<string, HuntEncounter> = {}

/**
 * Encontros de cada SALA: `huntId -> chave do sub-bioma -> ids de encontro`.
 *
 * O `enemyPool` da hunt e a uniao disto. A sala troca o pool ativo em tempo de
 * execucao pelo do sub-bioma sorteado (ver engine/systems/salaSystem.ts).
 */
export const POOL_POR_SALA: Record<string, Record<string, string[]>> = {}

function addEncounter(
  huntKey: string,
  trecho: Trecho,
  levelWeights?: { level: number; weight: number }[],
): string {
  const id = `${huntKey}_${trecho.speciesId}`
  if (!encounters[id]) {
    encounters[id] = {
      id,
      speciesId: trecho.speciesId,
      minLevel: trecho.minLevel,
      maxLevel: trecho.maxLevel,
      // Mesmos valores fixos de todo encontro gerado.
      aggroRadius: 175,
      wanderRadius: 60,
      weight: SPAWN_WEIGHT_BY_SPECIES[trecho.speciesId] ?? DEFAULT_WEIGHT,
      ...(levelWeights ? { levelWeights } : {}),
    }
  }
  return id
}

function montarHunt(bioma: BiomaDef, faixa: FaixaDef): void {
  const id = huntId(bioma.chave, faixa.id)
  const [lo, hi] = faixa.niveis

  const porSala: Record<string, string[]> = {}
  for (const sub of bioma.subBiomas) {
    const doSub = new Set(SUB_BIOMA_ESPECIES[sub.chave] ?? [])
    const ids: string[] = []
    for (const raiz of raizesDe(doSub)) {
      for (const trecho of trechosDaLinha(raiz, faixa, doSub)) ids.push(addEncounter(id, trecho))
    }
    porSala[sub.chave] = ids
  }

  const enemyPool = [...new Set(Object.values(porSala).flat())]
  if (enemyPool.length === 0) {
    throw new Error(
      `Hunt "${id}" nasceria sem nenhum encontro (faixa ${faixa.nome}, Lv ${lo}-${hi}). ` +
      'Hunt vazia não da erro em runtime: ela só nunca spawna nada e o jogador ' +
      'fica num mapa morto.'
    )
  }

  POOL_POR_SALA[id] = porSala
  const nome = `${bioma.nome} ${faixa.nome}`
  maps[id] = {
    id,
    name: nome,
    description: `${bioma.nome} — níveis ${lo} a ${hi}. Sub-biomas: ${bioma.subBiomas.map((s) => s.nome).join(', ')}.`,
    levelRange: [lo, hi],
    unlockCost: null,
    // `continent` deixou de ser regiao e passou a ser o GRUPO DE GATE (ver
    // data/biomas.ts): faixa1 e faixa2 nascem abertas, faixa3 e o Modo
    // Pesadelo sao liberados por derrotar o Campeao Lance.
    continent: faixa.id,
    bounds: { ...GEOMETRIA.bounds },
    playerSpawn: { ...GEOMETRIA.playerSpawn },
    bg: { ...bioma.bg },
    maxEnemies: GEOMETRIA.maxEnemies,
    respawnDelay: GEOMETRIA.respawnDelay,
    spawnPoints: GEOMETRIA.spawnPoints.map((p) => ({ ...p })),
    enemyPool,
    // Loot da hunt = uniao dos perfis dos sub-biomas dela. A sala restringe pro
    // perfil do sub-bioma sorteado; a uniao e o fallback pra quando nao ha sala
    // ativa (hunt BOSS, espelho, ou antes de o servidor responder).
    itemDrops: [...new Map(
      bioma.subBiomas.flatMap((s) => LOOT[s.loot]).map((d) => [d.itemId, d]),
    ).values()],
  }
}

// Hunt inicial primeiro: e a unica que nao vem de bioma.
{
  const pool = STARTER_HUNT_SPECIES.filter((id) => SPECIES[id])
  const lo = STARTER_LEVEL_WEIGHTS[0].level
  const hi = STARTER_LEVEL_WEIGHTS[STARTER_LEVEL_WEIGHTS.length - 1].level
  maps[STARTER_HUNT_ID] = {
    id: STARTER_HUNT_ID,
    name: 'Route 46 (Inicial)',
    description: 'A primeira caçada. Só POKEs de tipo Normal, nível 1 a 2.',
    levelRange: [lo, hi],
    unlockCost: null,
    continent: 'faixa1',
    bounds: { ...GEOMETRIA.bounds },
    playerSpawn: { ...GEOMETRIA.playerSpawn },
    // "hunt inicial e floresta padrão.jpg" — nome literal do arquivo pra essa hunt (leva 2026-08-15).
    bg: { primary: '#3f5a34', secondary: '#4a6a3d', image: 'assets/hunt-backgrounds/forest.jpg' },
    // Menos inimigos em campo que qualquer hunt de bioma: um inicial Lv1 tem
    // 12 HP e nao sobrevive a varios de uma vez. Ver o porque medido em
    // data/biomas.ts#MAX_INIMIGOS_HUNT_INICIAL.
    maxEnemies: MAX_INIMIGOS_HUNT_INICIAL,
    // PH-259, e os tres campos abaixo respondem juntos ao mesmo relato ("tem
    // pouco pokemon e o POKE anda muito ate o proximo"). Os numeros saem de
    // scripts/harness/spawn-da-hunt-inicial.mjs, 20 sementes por configuracao:
    //
    //   1 inimigo, spawn 250-550 (era) ... 0/20 mortes, 19,9 abates/5min, 51% andando
    //   4 inimigos, spawn 250-550 ....... 4/20 mortes, 21,9 abates/5min, 38% andando
    //   1 inimigo, spawn 150-350 ........ 0/20 mortes, 25,1 abates/5min, 41% andando
    //
    // O ganho vem da DISTANCIA, e nao da quantidade: sozinho, aproximar o
    // spawn rendeu +26% de abates sem nenhuma morte, enquanto quadruplicar os
    // inimigos rendeu +10% e trouxe morte de conta nova de volta.
    //
    // O campo mais cheio (o pedido literal) entra pelos DEGRAUS, e nao no
    // numero fixo: a janela em que conta nova morre sao os primeiros 30-60
    // segundos com o POKE Lv1, e ela fica com um inimigo so. Do Lv3 em diante o
    // POKE ja aguenta e o campo enche.
    spawnDistancia: [150, 350],
    maxEnemiesPorNivel: [{ nivel: 3, max: 2 }, { nivel: 5, max: 3 }],
    // Folga entre selvagens maior que a padrao (170): com dois ou tres em campo
    // numa faixa de spawn mais curta, o padrao — que e MENOR que o raio de
    // aggro de 175 — poria os dois em cima do jogador ao mesmo tempo.
    spawnEntreInimigos: 400,
    respawnDelay: GEOMETRIA.respawnDelay,
    spawnPoints: GEOMETRIA.spawnPoints.map((p) => ({ ...p })),
    enemyPool: pool.map((speciesId) =>
      addEncounter(STARTER_HUNT_ID, { speciesId, minLevel: lo, maxLevel: hi }, STARTER_LEVEL_WEIGHTS),
    ),
    itemDrops: [...LOOT.basico],
  }
}

for (const bioma of BIOMAS) {
  for (const faixa of FAIXAS) montarHunt(bioma, faixa)
}

// ---------------------------------------------------------------------------
// Teto de fatia
// ---------------------------------------------------------------------------
// Nenhuma especie passa desta fatia de uma hunt.
//
// O peso continua sendo o `spawn_tier` real do Gen1/Gen2 — o teto so apara o
// caso em que um pool pequeno encontra um tier alto. Medido antes desta regra:
// Unown ocupava 50,8% do Sagrado nas faixas II e III (nos jogos reais ele e
// 100% das Ruinas de Alph, entao o tier esta certo; o que mudou foi o pool
// ficar com 9 especies). Farmar o Sagrado seria farmar Unown.
//
// A conta sai do peso dos OUTROS, e nao de um numero absoluto: `weightedPick`
// usa `peso / soma`, entao peso fixo mudaria de significado a cada mudanca de
// pool. Com fatia alvo `t` e soma `S` no resto:  w/(S+w) = t  =>  w = t*S/(1-t).
export const TETO_DE_FATIA = 0.35
// Abaixo disto o teto e aritmeticamente impossivel: com 2 especies o minimo ja
// e 50%. Com 3 o minimo e 33,3%, que cabe — entao 3 e o menor pool aparavel, e
// nao 5. O 5 anterior era herdado de quando a apara so existia no nivel da
// HUNT, onde pool de 3 ou 4 so acontecia na inicial (curada a mao). No nivel da
// SALA um pool de 4 e corriqueiro — o Leito de Praia tem 4 nas tres faixas — e
// pular esses e pular justamente os casos mais desequilibrados do jogo.
export const POOL_MINIMO_PRA_TETO = 3

/**
 * Apara os pesos ate ninguem passar de `TETO_DE_FATIA`. Muta e devolve o mapa.
 *
 * RESOLVIDO DIRETO, E NAO POR APROXIMACAO SUCESSIVA. A versao anterior reaplicava
 * a formula ate 10 vezes, e ela NAO CONVERGE nesse orcamento quando dois
 * encontros empatam no topo de um pool pequeno: cada volta recalcula o peso de
 * um assumindo que o outro ficou parado, entao os dois se perseguem. Medido no
 * pool que expos isto (Espaco do Pesadelo, sala 10 — Solrock e Lunatone
 * empatados com Claydol atras): as 10 voltas paravam em 35,05%, acima do teto,
 * e so o teste POR SALA viu — no nivel da hunt o pool e maior e a convergencia
 * cabia nas 10 voltas.
 *
 * A conta fechada: se os `k` mais pesados ficam no teto `t` e o resto soma `R`,
 * entao `total = k*w + R` e `w/total = t`, o que da `w = t*R/(1 - k*t)`. O `k`
 * certo e o menor em que o (k+1)-esimo ja nao passa do teto — e como
 * `w/total = t` por construcao, "nao passar" e simplesmente `w_(k+1) <= w`.
 *
 * `k*t >= 1` e o caso aritmeticamente impossivel (com teto 0,35, tres encontros
 * no teto dariam 105%): ai o pool e pequeno demais pro teto e fica como esta.
 *
 * Determinismo importa aqui tanto quanto a exatidao: e o mesmo peso dos dois
 * lados que faz cliente e autoridade concordarem sobre o sorteio (ver a nota de
 * divergencia de sala em systems/salaSystem.ts). Por isso o empate e desfeito
 * pela CHAVE, e nao pela ordem de insercao do mapa.
 */
export function aparaOTeto(pesos: Map<string, number>): Map<string, number> {
  if (pesos.size < POOL_MINIMO_PRA_TETO) return pesos
  const ordenado = [...pesos].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  let resto = ordenado.reduce((s, [, w]) => s + w, 0)
  if (!(resto > 0)) return pesos
  for (let k = 1; k * TETO_DE_FATIA < 1 && k < ordenado.length; k++) {
    resto -= ordenado[k - 1][1]
    const noTeto = (TETO_DE_FATIA * resto) / (1 - k * TETO_DE_FATIA)
    if (ordenado[k][1] > noTeto + 1e-12) continue
    // `k` fechado: os k primeiros passavam do teto, o (k+1)-esimo nao passa mais.
    if (ordenado[k - 1][1] <= noTeto + 1e-12) break // ninguem precisava de apara
    for (let i = 0; i < k; i++) pesos.set(ordenado[i][0], noTeto)
    break
  }
  return pesos
}

// ESTA APARA E A DO FALLBACK, E ELA NAO E A QUE O JOGADOR VE NUMA HUNT DE BIOMA.
//
// `map.enemyPool` e a UNIAO dos pools de sala, e o sorteio real acontece sobre o
// pool da SALA ativa, recortado pela janela de nivel dela
// (`salaSystem#contextoDeSpawn`). Entao aparar aqui nao limita o que nasce:
// medido com o teto ja no lugar, 9 das 99 salas passavam de 35%, com Leito de
// Praia III e Laboratorio II em 50% — uma especie em cada duas. O teste que
// devia pegar isso media a HUNT, nao a sala, e passava verde.
//
// A apara por sala vive em `salaSystem#contextoDeSpawn`. Esta continua aqui
// porque o `enemyPool` da hunt E o pool de sorteio quando nao ha sala: hunt
// inicial, hunts BOSS, Campeao Lance, e a janela entre entrar na hunt e o
// servidor dizer qual e a sala.
for (const map of Object.values(maps)) {
  aparaOTeto(new Map(map.enemyPool.map((id) => [id, encounters[id].weight])))
    .forEach((peso, id) => { encounters[id].weight = peso })
}

// Espelho do Modo Pesadelo tirado do resultado ACIMA, nao do dado gerado cru.
// `POOL_POR_SALA` entra junto: sem ele o espelho nascia sem sistema de salas e o
// Modo Pesadelo era a unica familia de hunt de bioma rodando como arena unica
// (ver a nota em nightmareMaps.ts#buildNightmareMirror).
const nightmare = buildNightmareMirror(maps, encounters, POOL_POR_SALA)
for (const [id, salas] of Object.entries(nightmare.porSala)) POOL_POR_SALA[id] = salas

// Treinamento entra DEPOIS do espelho do Modo Pesadelo de proposito: e um
// fixture de teste, nao teria sentido nenhum um "nightmare_treinamento" a
// +100 niveis — mesmo motivo que BOSS_MAPS_DATA/o Lance ficam de fora do
// mirror.
export const MAPS: Record<string, HuntMapDef> = {
  ...maps, ...nightmare.maps, ...BOSS_MAPS_DATA, [TRAINING_MAP_ID]: TRAINING_MAP,
}
export const ENCOUNTERS: Record<string, HuntEncounter> = {
  ...encounters, ...nightmare.encounters, ...BOSS_ENCOUNTERS_DATA, [TRAINING_ENCOUNTER.id]: TRAINING_ENCOUNTER,
}
