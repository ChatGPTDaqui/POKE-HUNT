// A* route search over a hunt's collision grid
// (data/generated/subBiomaCollision.generated.ts, via data/maps.ts).
//
// Cada celula tem COLLISION_GRID_CELL_SIZE unidades de mundo de lado e a grade
// diz onde o CENTRO de um POKE pode estar — a pegada dele
// (POKE_COLLISION_FOOTPRINT) ja foi descontada na geracao, por erosao. Uma rota
// e entao so a cadeia de centros de celula andavel do inicio ao destino. Usado
// por movementSystem.ts sempre que a linha reta ate o alvo esta bloqueada, pra
// o POKE contornar a parede/agua em vez de deslizar nela (ou congelar) pra
// sempre.
//
// PERFORMANCE, SABIDA E NAO CORRIGIDA AQUI: o conjunto aberto e um `Map` e a
// escolha do menor `f` e uma varredura LINEAR a cada expansao, o que faz a
// busca ser O(n^2) no numero de celulas; as chaves de celula tambem sao
// strings (`"col,row"`), uma alocacao por vizinho visitado. Medido no PH-94: a
// grade 4x mais fina custou +75% no teste de simulacao offline mais pesado
// (33s -> 58s). Nao chega em producao — `FARM_OFFLINE_PAUSADO` deixa o resim
// offline do servidor sem simular nada, e o flush ao vivo sao ~1.800 passos —
// mas o desenho continua errado. Trocar por heap binario + chave numerica muda
// o desempate entre rotas de mesmo custo, ou seja muda a simulacao, e por isso
// nao entra de carona numa mudanca de grade.
import { COLLISION_GRID_CELL_SIZE } from '@/data/collisionConstants'
import { mapWalkRadius } from '@/data/maps'

export interface PathfindingMapDef {
  collisionGrid: string[] | null
  bounds: { width: number; height: number }
}

export interface Waypoint {
  x: number
  y: number
}

// 8-directional neighbors, orthogonal first (cheaper, and A* explores them
// before diagonals get a chance to matter much on a heuristic tie anyway).
const NEIGHBORS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
]

// Safety cap, DERIVADO da grade em vez de fixo.
//
// Era `4000` com o comentario "this grid is at most ~800 cells, so a real
// search never gets close to this". Isso deixou de ser verdade sem ninguem
// mexer aqui: desde que o mundo virou o recorte da area pintada (PH-80) as
// grades passaram a ter tamanhos proprios, e `dragon` ja tinha 2.808 celulas
// com celula de 40. Com a celula de 20 do PH-94 ela tem 10.605 — ou seja o
// teto de seguranca ficou ABAIXO do tamanho da grade, e uma busca longa
// legitima batia nele e devolvia `null`.
//
// O sintoma disso nao e travamento: `null` faz o chamador cair no movimento
// direto (`slideToward`), e o POKE passa a deslizar na parede em vez de
// contornar — o mesmo comportamento de "sem rota" que o pathfinder existe pra
// eliminar. Silencioso, e so no mapa grande.
//
// A* nunca expande a mesma celula duas vezes (`closed`), entao o numero de
// expansoes e limitado pelo numero de celulas andaveis. Uma folga de 2x sobre
// o total de celulas e um teto que uma busca real nao alcanca e que continua
// cortando o caso degenerado.
function tetoDeExpansoes(grid: string[]): number {
  return grid.length * grid[0].length * 2
}

function cellKey(col: number, row: number): string {
  return `${col},${row}`
}

interface Circle {
  cx: number
  cy: number
  radius: number
}

// Unlike data/maps.js#isCellBlocked (which treats a query outside the grid
// as open — a safe default for one-off point checks near the map's edge),
// the SEARCH must treat outside-the-grid as blocked: otherwise A* discovers
// that going around the edge of the defined grid entirely (including through
// negative columns/rows, since nothing outside it ever costs more) is a
// "free" detour, producing waypoints far outside the map's actual bounds —
// a real bug caught live (a chased enemy routed through row 23/col -1, well
// past the 35x23 grid, ending up hundreds of units outside the walkable
// circle).
//
// Also blocks any cell whose center falls outside the map's own circular
// walkable area (`circle`, see data/maps.js#mapWalkRadius) — the collision
// grid only encodes the source image's dark/water pixels, it has no idea
// the game only ever intends the inscribed circle to be walkable, so a
// pixel-wise-open cell out near a rectangular corner (past the circle) reads
// as perfectly free to A*. Caught live: a wild POKE with a huge aggro/leash
// radius chased the player through such a corner, ending up ~700 units from
// the map center (radius is only 450) — every other system in this game
// (wander, spawn, MovementSystem's own clampToMapCircle) already treats
// that circle as the hard boundary, so the pathfinder needs to match it.
function isBlocked(grid: string[], col: number, row: number, circle: Circle | null): boolean {
  if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) return true
  if (grid[row][col] === '1') return true
  if (circle) {
    const x = col * COLLISION_GRID_CELL_SIZE + COLLISION_GRID_CELL_SIZE / 2
    const y = row * COLLISION_GRID_CELL_SIZE + COLLISION_GRID_CELL_SIZE / 2
    if (Math.hypot(x - circle.cx, y - circle.cy) > circle.radius) return true
  }
  return false
}

function heuristic(col: number, row: number, goalCol: number, goalRow: number): number {
  return Math.hypot(goalCol - col, goalRow - row)
}

function reconstructPath(cameFrom: Map<string, string>, goalKey: string, startKey: string): Waypoint[] {
  const cellPath: string[] = []
  let key: string | undefined = goalKey
  while (key && key !== startKey) {
    cellPath.push(key)
    key = cameFrom.get(key)
  }
  cellPath.reverse()
  return cellPath.map((k) => {
    const [col, row] = k.split(',').map(Number)
    return { x: col * COLLISION_GRID_CELL_SIZE + COLLISION_GRID_CELL_SIZE / 2, y: row * COLLISION_GRID_CELL_SIZE + COLLISION_GRID_CELL_SIZE / 2 }
  })
}

// Returns:
// - null when there's no grid (caller should just walk straight), the goal
//   cell itself is blocked, or no route exists (goal is unreachable —
//   caller falls back to direct movement rather than freeze waiting for a
//   route that will never appear).
// - [] when start and goal are already the same cell.
// - otherwise an ordered array of {x,y} world-space cell-centers from the
//   first step away from the start to the goal, with the final entry
//   snapped to the exact (goalX, goalY) instead of its cell-center for
//   precise arrival.
export function findPath(mapDef: PathfindingMapDef, startX: number, startY: number, goalX: number, goalY: number): Waypoint[] | null {
  const grid = mapDef.collisionGrid
  if (!grid) return null
  const circle: Circle = { cx: mapDef.bounds.width / 2, cy: mapDef.bounds.height / 2, radius: mapWalkRadius(mapDef) }

  const toCol = (x: number) => Math.floor(x / COLLISION_GRID_CELL_SIZE)
  const toRow = (y: number) => Math.floor(y / COLLISION_GRID_CELL_SIZE)
  const startCol = toCol(startX), startRow = toRow(startY)
  const goalCol = toCol(goalX), goalRow = toRow(goalY)

  if (startCol === goalCol && startRow === goalRow) return []
  if (isBlocked(grid, goalCol, goalRow, circle)) return null

  const startKey = cellKey(startCol, startRow)
  const goalKey = cellKey(goalCol, goalRow)

  const cameFrom = new Map<string, string>()
  const gScore = new Map<string, number>([[startKey, 0]])
  const open = new Map<string, number>([[startKey, heuristic(startCol, startRow, goalCol, goalRow)]])
  const closed = new Set<string>()

  const maxExpansions = tetoDeExpansoes(grid)
  let expansions = 0
  while (open.size > 0) {
    if (++expansions > maxExpansions) return null

    let currentKey: string | null = null
    let bestF = Infinity
    for (const [key, f] of open) {
      if (f < bestF) { bestF = f; currentKey = key }
    }
    if (!currentKey) break
    open.delete(currentKey)
    if (currentKey === goalKey) {
      const path = reconstructPath(cameFrom, goalKey, startKey)
      return path.map((wp, i, arr) => (i === arr.length - 1 ? { x: goalX, y: goalY } : wp))
    }
    closed.add(currentKey)

    const [curCol, curRow] = currentKey.split(',').map(Number)
    for (const [dc, dr] of NEIGHBORS) {
      const nCol = curCol + dc, nRow = curRow + dr
      const nKey = cellKey(nCol, nRow)
      if (closed.has(nKey) || isBlocked(grid, nCol, nRow, circle)) continue
      // Never cut a diagonal corner between two blocked orthogonal cells —
      // keeps every straight-line step between consecutive waypoints
      // genuinely walkable, so the follower in MovementSystem.js never needs
      // its own collision re-check along a route.
      if (dc !== 0 && dr !== 0 && (isBlocked(grid, curCol + dc, curRow, circle) || isBlocked(grid, curCol, curRow + dr, circle))) continue

      const stepCost = (dc !== 0 && dr !== 0) ? Math.SQRT2 : 1
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + stepCost
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, currentKey)
        gScore.set(nKey, tentativeG)
        open.set(nKey, tentativeG + heuristic(nCol, nRow, goalCol, goalRow))
      }
    }
  }
  return null
}
