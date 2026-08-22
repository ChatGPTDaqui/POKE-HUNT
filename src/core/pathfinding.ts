// A* route search over a hunt's collision grid (data/generated/collisionGrids.generated.ts).
// Cells are COLLISION_GRID_CELL_SIZE world units square and an entity's
// footprint is exactly one cell (see MovementSystem.js#canOccupy), so a route
// is simply the chain of walkable cell-centers from the start cell to the
// goal cell. Used by MovementSystem.js whenever a straight line to the
// target is blocked, so a POKE can route around a wall/void/water patch
// instead of sliding along it (or freezing) forever.
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

// Safety cap: this grid is at most ~800 cells, so a real search never gets
// close to this — it only matters if start/goal are somehow degenerate
// (e.g. entirely surrounded), where it stops the search instead of hanging.
const MAX_EXPANSIONS = 4000

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

  let expansions = 0
  while (open.size > 0) {
    if (++expansions > MAX_EXPANSIONS) return null

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
