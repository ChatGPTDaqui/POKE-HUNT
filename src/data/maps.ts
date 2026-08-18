// Hunt map definitions: the 5 lowest-average-level wild locations from the
// spreadsheet (see scripts/sync-planilha.js#pickTopHunts), with world
// bounds/spawn points/background that are our own idle-game concept (the
// spreadsheet has no equivalent for those).
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from './generated/formulas.generated'
import { COLLISION_GRIDS, COLLISION_GRID_CELL_SIZE } from './generated/collisionGrids.generated'
import { WATER_COLLISION_GRID, WATER_SPAWN_POINT } from './generated/waterCollisionMask.generated'
import { COLISAO_POR_ARTE } from './generated/subBiomaCollision.generated'
import { FAIXAS, huntId, SUB_BIOMA_POR_CHAVE } from './biomas'
import type { HuntMapDef } from './huntTypes'

// Modo Pesadelo hunts (see nightmareMaps.js) and the hand-picked spawn-pool
// edits (see huntSpawnOverrides.js) are merged in at runtime, not part of
// the spreadsheet sync — huntSpawnOverrides.js is the one place that does
// this merge, since it needs to patch both this file's enemyPools AND
// data/enemies.js's encounters together.
import { MAPS } from './huntSpawnOverrides'
export { MAPS }

export interface MapDef extends HuntMapDef {
  collisionGrid: string[] | null
  /**
   * A grade de colisao desta sala e pintada a mao (scripts/build-sub-bioma-collision.js)
   * e JA define os limites reais do espaco jogavel — o vermelho da
   * referencia e a fronteira, nao so um extra por cima do circulo padrao.
   * Setado por `mapDefParaSala`; consumido por `mapWalkRadius` (devolve um
   * raio grande o bastante pra nunca recortar celula nenhuma da grade, em
   * vez do circulo inscrito no retangulo que toda outra hunt usa) — pedido
   * explicito do usuario: a pintura manda, o circulo generico nao pode
   * cortar area que ela marca como andavel.
   */
  colisaoDefineLimite?: boolean
}

const formulaEngine = createFormulaEngine(FORMULAS)
// Spreadsheet-editable (see CLAUDE.md's "Balanceamento de economia" section),
// fallback matches the old hardcoded value — enemies spawn 75% faster than
// the spreadsheet's raw respawnDelay by default.
const RESPAWN_DELAY_MULTIPLIER = formulaEngine.evalOrDefault('MOB_RESPAWN_DELAY_MULTIPLIER', 0.25)

// Explicit user request: temporarily pause the wall/obstacle collision
// system (the per-background grid baked by scripts/build-collision-grids.js
// — water banks, cave walls, cliffs) so every POKE can walk freely across
// the whole map with nothing blocking them, while leaving the rest of the
// system in place to flip back on later (just set this back to true).
// Doesn't touch the separate circular map-edge clamp (mapWalkRadius below /
// MovementSystem.js), which is what actually keeps POKEs inside the hunt at
// all and isn't part of "wall block".
const WALL_BLOCK_ENABLED = false

// Explicit user request: reactivate wall-block EXCLUSIVELY for the real
// Water hunts, using a hand-painted mask
// (scripts/build-water-collision-mask.js) instead of the pixel-heuristic
// grid above.
//
// Keyed by BIOME, not by `bg.image`: art is shared between themes (see
// data/biomas.ts#ARTE), so keying by image would leak the water collision
// onto whatever else happens to reuse water.png. Derived from the biome list
// rather than a hand-typed id list so a new level band never silently misses
// the mask.
const WATER_BIOMAS = ['marinho', 'aguas_interiores']
const WATER_HUNT_IDS = new Set(
  WATER_BIOMAS.flatMap((bioma) => FAIXAS.map((faixa) => huntId(bioma, faixa.id))),
)

// Only the 7 hunt themes with real background art (see
// scripts/build-collision-grids.js) have a grid — every other hunt gets
// `collisionGrid: null` and keeps the old fully-open walkable circle
// (js/systems/MovementSystem.js treats a null grid as "no extra blocking").
export function getMap(id: string): MapDef | null {
  const map = MAPS[id]
  if (!map) return null
  if (WATER_HUNT_IDS.has(id)) {
    return {
      ...map,
      respawnDelay: map.respawnDelay * RESPAWN_DELAY_MULTIPLIER,
      collisionGrid: WATER_COLLISION_GRID,
      playerSpawn: WATER_SPAWN_POINT,
    }
  }
  const collisionGrid = WALL_BLOCK_ENABLED
    ? (map.bg && map.bg.image && COLLISION_GRIDS[map.bg.image]) || null
    : null
  return { ...map, respawnDelay: map.respawnDelay * RESPAWN_DELAY_MULTIPLIER, collisionGrid }
}

/**
 * Fundo que a cena REALMENTE mostra: sub-bioma com arte propria manda, senao
 * vale a arte da hunt (que e a do bioma). Sub-bioma sem `bg` proprio e a
 * maioria — so os que ganharam arte nas levas de background novo tem.
 *
 * Mora aqui, e nao no renderer que a inventou, porque virou regra de DADO e
 * nao de desenho: e ela que decide qual walk-block pintado vale (ver
 * `mapDefParaSala` logo abaixo). Uma segunda copia da regra em `render/` ia
 * divergir em silencio — a grade de colisao passaria a ser de uma imagem e o
 * pixel na tela de outra, que e a classe de bug mais cara deste sistema.
 * `render/renderer.ts` importa daqui.
 */
export function backgroundParaSala(map: MapDef, sala: { chave: string } | null): MapDef['bg'] {
  return (sala && SUB_BIOMA_POR_CHAVE[sala.chave]?.sub.bg) || map.bg
}

/**
 * Colisao/spawn pintados a mao (scripts/build-sub-bioma-collision.js),
 * resolvidos pela ARTE que a cena mostra.
 *
 * POR QUE PELA ARTE, E NAO PELA CHAVE DA SALA. Ate 2026-08-18 a tabela era
 * indexada por chave de sub-bioma, e isso deixava um furo silencioso: toda
 * hunt que nao passa pelo sistema de salas — Modo Pesadelo, BOSS, Campeao
 * Lance, treino, e qualquer conteudo futuro — nao tem `sala` nenhuma, entao
 * nao casava com nada e rodava SEM body-block, atravessando exatamente as
 * mesmas paredes que a hunt normal respeita. O `route_46` so escapava por um
 * special-case escrito a mao aqui (`mapId === STARTER_HUNT_ID -> 'forest'`),
 * que agora sai: ele mostra forest.jpg, entao herda a grade de forest.jpg
 * sozinho.
 *
 * A regra vira: quem MOSTRA a imagem herda o walk-block dela. Sub-bioma com
 * arte propria, sub-bioma sem arte (que mostra a do bioma) e hunt sem salas
 * caem todos no mesmo caminho, sem cadastro paralelo pra alguem esquecer de
 * atualizar quando entrar conteudo novo.
 *
 * `sala` aceita a forma minima (so `chave`) pra nao importar SalaAtiva de
 * engine/types.ts, que ja importa MapDef DESTE arquivo — ciclo de tipo e
 * seguro em TS (apagado na compilacao), mas a interface estrutural evita
 * depender disso.
 */
export function mapDefParaSala(mapId: string, sala: { chave: string } | null): MapDef | null {
  const map = getMap(mapId)
  if (!map) return null
  const arte = backgroundParaSala(map, sala).image
  const pintada = arte ? COLISAO_POR_ARTE[arte] : undefined
  if (!pintada) return map
  return { ...map, collisionGrid: pintada.grid, colisaoDefineLimite: true }
}

/**
 * Ponto de nascimento pintado pra cena atual, ou `null` se aquela arte nao
 * tem referencia. Recebe `mapId` (e nao so a sala) pelo mesmo motivo acima:
 * hunt sem sala tambem tem arte, e tambem merece o spawn pintado dela.
 */
export function spawnPointParaSala(mapId: string, sala: { chave: string } | null): { x: number; y: number } | null {
  const map = getMap(mapId)
  if (!map) return null
  const arte = backgroundParaSala(map, sala).image
  return (arte ? COLISAO_POR_ARTE[arte]?.spawnPoint : undefined) ?? null
}

export function isCellBlocked(mapDef: MapDef, x: number, y: number): boolean {
  const grid = mapDef.collisionGrid
  if (!grid) return false
  const col = Math.floor(x / COLLISION_GRID_CELL_SIZE)
  const row = Math.floor(y / COLLISION_GRID_CELL_SIZE)
  const foraDaGrade = row < 0 || row >= grid.length || col < 0 || col >= grid[0].length
  if (foraDaGrade) {
    // `colisaoDefineLimite` (body-block por sala): a grade JA cobre o
    // retangulo inteiro do mapa (35x23 celulas = 1400x900), entao "fora
    // dela" e fora do mapa de verdade — tem que bloquear. Sem isso,
    // `mapWalkRadius` devolvendo o raio que inscreve o retangulo (pra nao
    // cortar o anel pintado) tambem libera as 4 "pontas" do circulo que
    // ficam FORA do retangulo, e wander/spawn levavam inimigo (e o
    // proprio jogador) pra fora da grade — bug real, achado ao vivo:
    // alvo em (579,1124), fora das 23 linhas da grade, virava perseguicao
    // eterna e impossivel (findPath nunca alcanca fora da grade).
    // Grades ANTIGAS (por hunt inteira, sem este flag) mantem o
    // comportamento leniente de sempre: um check pontual perto da borda
    // do mapa e seguro tratar como aberto, e mudar isso agora arriscaria
    // regressao em algo que ja funciona ha varias levas.
    return Boolean(mapDef.colisaoDefineLimite)
  }
  return grid[row][col] === '1'
}

/**
 * Celula andavel mais proxima de (x,y) nesta grade, em espiral quadrada
 * crescente — devolve o CENTRO dela. `null` se nao achar nenhuma no raio de
 * busca (grade sem nenhuma celula andavel, nao deveria acontecer com uma
 * grade real).
 *
 * Existe pro caso de troca de SALA (ver salaSystem.ts#registrarAbate): uma
 * entidade que estava numa sala SEM colisao (aberta, pode estar em
 * qualquer canto do mapa) pode ficar de pe numa celula que a nova sala
 * marca como bloqueada — e pior, uma celula cujos 8 vizinhos TAMBEM sao
 * bloqueados, sem nenhum passo unico de escape possivel (bug real, achado
 * ao vivo: jogador congelado 40+ segundos numa celula cercada). Nem A*
 * nem slideToward resolvem "comecar dentro da parede" sozinhos; a unica
 * saida e reposicionar pro ponto andavel mais perto ANTES do proximo tick
 * de movimento tentar sair dali.
 */
export function nearestOpenPoint(mapDef: MapDef, x: number, y: number): { x: number; y: number } | null {
  const grid = mapDef.collisionGrid
  if (!grid) return { x, y }
  const cols = grid[0].length, rows = grid.length
  const startCol = Math.floor(x / COLLISION_GRID_CELL_SIZE)
  const startRow = Math.floor(y / COLLISION_GRID_CELL_SIZE)
  const maxRadius = Math.max(cols, rows)
  for (let radius = 0; radius <= maxRadius; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue
        const c = startCol + dc, r = startRow + dr
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue
        if (grid[r][c] === '0') {
          return { x: c * COLLISION_GRID_CELL_SIZE + COLLISION_GRID_CELL_SIZE / 2, y: r * COLLISION_GRID_CELL_SIZE + COLLISION_GRID_CELL_SIZE / 2 }
        }
      }
    }
  }
  return null
}

// The walkable area is a circle (not the full rectangular bounds — those
// just size the background tiling/camera math) inscribed in the shorter of
// the two dimensions, centered on the map. Shared by movement clamping
// (MovementSystem.js) and enemy/wander spawn placement (main.js) so both
// always agree on exactly where the invisible edge is.
//
// `colisaoDefineLimite` (sala com body-block pintado a mao) e a excecao:
// devolve o raio que inscreve o RETANGULO INTEIRO (metade da diagonal),
// grande o bastante pra nunca cortar nenhuma celula da grade — a pintura
// (vermelho = parede) ja e o limite real, sobrepor o circulo padrao por
// cima cortaria area que ela marca como andavel. Mesma funcao/assinatura
// pra todo consumidor existente (pathfinding, wander, spawn) nao precisar
// saber da diferenca.
export function mapWalkRadius(mapDef: { bounds: { width: number; height: number }; colisaoDefineLimite?: boolean }): number {
  if (mapDef.colisaoDefineLimite) {
    return Math.hypot(mapDef.bounds.width, mapDef.bounds.height) / 2
  }
  return Math.min(mapDef.bounds.width, mapDef.bounds.height) / 2
}
