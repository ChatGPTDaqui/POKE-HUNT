// Shared "full hunt map/encounter" shapes — a superset of the spreadsheet-
// generated MapDataEntry/EncounterDataEntry (generated/types.ts) plus every
// optional field that hand-authored layers (nightmareMaps.ts, the Lance
// sequence-boss hunt, huntSpawnOverrides.ts) attach on top at runtime. Kept
// in one place so maps.ts/nightmareMaps.ts/huntSpawnOverrides.ts all agree
// on the same public shape instead of drifting ad hoc `extends` clauses.
import type { MapDataEntry, EncounterDataEntry, SpeciesBaseStats } from './generated/types'
import type { RarityKey } from './rarity'

export type StatBlock = SpeciesBaseStats

// Raio de "lure" (aggro) do POKE selvagem: distancia em que ele nota e vem
// pra cima do jogador (ver engine/entity.ts#createEnemyEntity,
// AGGRO_RADIUS_MULTIPLIER=1 la aplica esse valor sem boost, pedido explicito
// do usuario). Hardcoded nos 3 pontos que constroem `HuntEncounter`
// (huntSpawnOverrides.ts, nightmareMaps.ts x2) — trazido pra ca so pra
// `data/abilities.ts#AOE_RADIUS` ter uma fonte compartilhada em vez de
// reescrever o mesmo numero magico uma 4a vez (pedido: raio de AOE = raio de
// lure do selvagem).
export const WILD_AGGRO_RADIUS = 175

export interface HuntMapDef extends MapDataEntry {
  collisionGrid?: string[] | null
  noRespawn?: boolean
  noCatch?: boolean
  autoSwitchTeamOnFaint?: boolean
  sequence?: string[]
  /**
   * Grupos de gate (`MapDataEntry['continent']`) liberados quando a
   * `sequence` inteira desta hunt cai. Lista, e nao um valor so, porque o
   * Campeao Lance abre dois de uma vez: a faixa de nivel seguinte e o Modo
   * Pesadelo.
   */
  unlocksContinentOnClear?: string[]
  startCountdown?: number
  keepCorpses?: boolean
  // Hunt-alvo de teste (ver data/trainingDummy.ts): abate nao concede EXP,
  // ouro, item nem captura. `handleEnemyDefeated` sai cedo com um resumo
  // zerado antes de tocar em qualquer uma dessas quatro coisas.
  noRewards?: boolean
  // Mesma hunt de teste: o inimigo NUNCA revida (`executeEnemyAction` sai
  // antes de `pickAbility`). IV de ataque no minimo sozinho nao bastava —
  // o gap de NIVEL na formula de dano ainda deixava passar dano real.
  passiveEnemies?: boolean
  /**
   * Distancia minima entre dois selvagens desta hunt no spawn, sobrepondo o
   * `SPAWN_ENTRE_INIMIGOS` padrao (simulation.ts). Ausente = o padrao.
   *
   * Existe pra hunt inicial (PH-259): la a quantidade de inimigos em campo
   * subiu, pra o POKE nao precisar atravessar o mapa entre um abate e o
   * proximo, e o unico jeito de fazer isso sem devolver a morte de conta nova e
   * garantir que eles nascam LONGE UNS DOS OUTROS. Com o padrao de 170 — menor
   * que o raio de aggro de 175 (`WILD_AGGRO_RADIUS`) — dois vizinhos notam o
   * jogador no mesmo instante, e um inicial Lv1 com 12 HP enfrenta os dois.
   */
  spawnEntreInimigos?: number
  /**
   * Faixa `[min, max]` de distancia do JOGADOR em que o selvagem desta hunt
   * nasce, sobrepondo `SPAWN_CONE_MIN_DISTANCE`/`SPAWN_CONE_MAX_DISTANCE`
   * (simulation.ts). Ausente = a padrao, 250-550.
   *
   * A padrao existe pra "criar a ideia de explorar o mapa" (pedido antigo). Na
   * hunt inicial ela cobra caro demais: e uma hunt de UM inimigo em campo, e
   * medindo com o motor headless o POKE passa metade do tempo so andando. Ver
   * scripts/harness/spawn-da-hunt-inicial.mjs.
   */
  spawnDistancia?: [number, number]
  /**
   * Degraus de `maxEnemies` por NIVEL do POKE em campo, do menor pro maior
   * nivel. Ausente = `maxEnemies` vale sempre.
   *
   * A hunt inicial e a unica que usa (PH-259). O que mata conta nova ali e uma
   * janela estreita e conhecida — os primeiros 30-60 segundos, com o POKE Lv1 e
   * 12 HP; passada ela, o POKE atravessa os 20 minutos inteiros. Um numero fixo
   * tem que escolher entre proteger essa janela (1 inimigo, e o resto da hunt
   * fica vazio) e dar ritmo (mais inimigos, e a conta morre no primeiro minuto,
   * medido 4/10 com dois). Os degraus atendem os dois: a janela critica segue
   * com um inimigo, e o campo enche quando o POKE ja aguenta.
   */
  maxEnemiesPorNivel?: { nivel: number; max: number }[]
}

export interface HuntEncounter extends EncounterDataEntry {
  rarity?: RarityKey
  ivs?: StatBlock
  // Distribuicao de nivel ponderada, quando o sorteio uniforme entre
  // minLevel/maxLevel nao serve. Usado hoje so pela hunt inicial, que por
  // pedido explicito sai 80% nivel 1 e 20% nivel 2 (uniforme daria 50/50).
  // Ausente = uniforme, como sempre foi.
  levelWeights?: { level: number; weight: number }[]
}

/**
 * Segundos entre um POKE cair e o substituto entrar em campo, NOS DOIS LADOS
 * de uma arena de duelo.
 *
 * Vive aqui, e nao em cada ponta, porque as duas pontas sao arquivos que nao
 * podem se importar: `nightmareMaps.ts` usa como `respawnDelay` da arena do
 * Campeao Lance (o lado dele) e `engine/simulation.ts` usa como espera da
 * troca por desmaio (o lado do jogador). Duplicar o numero deixaria os dois
 * lados sairem de sincronia sem nada acusar — o pedido foi explicitamente a
 * MESMA espera pros dois.
 */
export const ESPERA_DE_TROCA_SEGUNDOS = 2
