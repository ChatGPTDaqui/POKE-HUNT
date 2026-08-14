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
import { BIOMAS, FAIXAS, GEOMETRIA, LOOT, huntId, type BiomaDef, type FaixaDef } from './biomas'
import { zonaMinimaDaEspecie } from './spawnStrength'
import type { HuntMapDef, HuntEncounter } from './huntTypes'

// ---------------------------------------------------------------------------
// Hunt inicial
// ---------------------------------------------------------------------------
// Nao e um bioma: e a primeira tela do jogo, elenco curado a mao, Lv1-2, e
// fica FORA do sistema de salas. Rattata e de Kanto e isso e deliberado — o
// pedido nomeou os tres.
export const STARTER_HUNT_ID = 'route_46'
const STARTER_HUNT_SPECIES = ['sentret', 'hoothoot', 'rattata']
const STARTER_LEVEL_WEIGHTS = [
  { level: 1, weight: 80 },
  { level: 2, weight: 20 },
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

function primeiroNivelDaZona(zona: number): number {
  const faixa = FAIXAS.find((f) => zona <= f.zonaMaxima) ?? FAIXAS[FAIXAS.length - 1]
  return faixa.niveis[0]
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
function nivelDeTroca(speciesId: string): number | null {
  const especie = SPECIES[speciesId]
  const alvo = especie?.evolvesTo
  if (!alvo || !SPECIES[alvo]) return null
  if (especie.isSpecialEvolution) {
    // `zonaMinima(origem) + 1` e o que impede a origem de ser ESPREMIDA pra
    // fora do jogo. Bug real, pego pelo teste "toda especie selvagem tem pelo
    // menos uma hunt": Scyther tem zona minima 5 (so a partir de Lv31) e
    // Scizor tambem 5, entao o gatilho caia em Lv31 e a faixa de Scyther
    // ficava [1,30] — vazia justamente onde ele podia aparecer. A forma
    // evoluida tem que ficar pelo menos uma faixa acima da origem.
    const zona = Math.max(zonaMinimaDaEspecie(alvo), zonaMinimaDaEspecie(speciesId) + 1)
    return primeiroNivelDaZona(zona)
  }
  return especie.evolvesAtLevel ?? null
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
    const troca = nivelDeTroca(atual)
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
      'Hunt vazia nao da erro em runtime: ela so nunca spawna nada e o jogador ' +
      'fica num mapa morto.'
    )
  }

  POOL_POR_SALA[id] = porSala
  const nome = `${bioma.nome} ${faixa.nome}`
  maps[id] = {
    id,
    name: nome,
    description: `${bioma.nome} — niveis ${lo} a ${hi}. Sub-biomas: ${bioma.subBiomas.map((s) => s.nome).join(', ')}.`,
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
    description: 'A primeira cacada. So POKEs de tipo Normal, nivel 1 a 2.',
    levelRange: [lo, hi],
    unlockCost: null,
    continent: 'faixa1',
    bounds: { ...GEOMETRIA.bounds },
    playerSpawn: { ...GEOMETRIA.playerSpawn },
    bg: { primary: '#3f5a34', secondary: '#4a6a3d', image: 'assets/hunt-backgrounds/forest.png' },
    maxEnemies: GEOMETRIA.maxEnemies,
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
const TETO_DE_FATIA = 0.35
// Pool pequeno demais nao pode respeitar o teto (com 3 especies o minimo
// possivel ja e 33%) e nesses casos o pool e curado a mao — a hunt inicial e o
// unico caso hoje. Aparar ali seria mexer num balanceamento pedido.
const POOL_MINIMO_PRA_TETO = 5

for (const map of Object.values(maps)) {
  if (map.enemyPool.length < POOL_MINIMO_PRA_TETO) continue
  // Iterativo: aparar um encontro muda o denominador dos outros.
  for (let volta = 0; volta < 10; volta++) {
    const total = map.enemyPool.reduce((s, id) => s + encounters[id].weight, 0)
    const acima = map.enemyPool.filter((id) => encounters[id].weight / total > TETO_DE_FATIA + 1e-9)
    if (acima.length === 0) break
    for (const id of acima) {
      const resto = total - encounters[id].weight
      encounters[id].weight = (TETO_DE_FATIA * resto) / (1 - TETO_DE_FATIA)
    }
  }
}

// Espelho do Modo Pesadelo tirado do resultado ACIMA, nao do dado gerado cru.
const nightmare = buildNightmareMirror(maps, encounters)

export const MAPS: Record<string, HuntMapDef> = { ...maps, ...nightmare.maps, ...BOSS_MAPS_DATA }
export const ENCOUNTERS: Record<string, HuntEncounter> = { ...encounters, ...nightmare.encounters, ...BOSS_ENCOUNTERS_DATA }
