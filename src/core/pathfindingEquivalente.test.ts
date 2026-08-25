// PH-102 — a rota nova é a MESMA rota, célula por célula.
//
// A issue previa que trocar a varredura linear por heap mudaria o desempate
// entre rotas de mesmo custo, e portanto a simulação:
//
//   > Rota diferente = movimento diferente = sequência de sorteio diferente =
//   > simulação diferente. Isso não pode entrar de carona (...) seriam duas
//   > causas possíveis para qualquer divergência que aparecesse depois.
//
// Num jogo cujo servidor RE-SIMULA o que o cliente fez, isso não é estética: é
// divergência de autoridade. PH-37 já custou isso uma vez.
//
// O que permite a troca sem mudar nada é uma observação sobre a versão antiga:
// a varredura usava `f < bestF` **estrito**, então em empate ela ficava com o
// primeiro da ordem de iteração do `Map` — a ordem da PRIMEIRA inserção daquela
// chave, que o `Map` preserva mesmo quando o valor é atualizado depois. O heap
// reproduz isso usando essa ordem como segundo critério.
//
// Este arquivo carrega a implementação ANTIGA inteira, aqui embaixo, e compara
// as duas em grades aleatórias. Não é duplicação a ser removida: é o oráculo. O
// dia em que ele puder ser apagado é o dia em que ninguém mais se importar se a
// rota mudou — e esse dia não chegou.
import { describe, expect, it } from 'vitest'

import { findPath, type PathfindingMapDef, type Waypoint } from './pathfinding'
import { COLLISION_GRID_CELL_SIZE } from '@/data/collisionConstants'
import { mapWalkRadius } from '@/data/maps'

// ---------------------------------------------------------------------------
// A implementação ANTIGA, copiada de `pathfinding.ts` antes de PH-102.
// Só o motor de busca — `isBlocked` e a heurística são reusados do módulo real
// via re-implementação idêntica, para o oráculo não depender do que ele testa.
// ---------------------------------------------------------------------------
interface Circle { cx: number; cy: number; radius: number }

const NEIGHBORS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
]

function bloqueada(grid: string[], col: number, row: number, circle: Circle | null): boolean {
  if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) return true
  if (grid[row][col] === '1') return true
  if (circle) {
    const x = col * COLLISION_GRID_CELL_SIZE + COLLISION_GRID_CELL_SIZE / 2
    const y = row * COLLISION_GRID_CELL_SIZE + COLLISION_GRID_CELL_SIZE / 2
    if (Math.hypot(x - circle.cx, y - circle.cy) > circle.radius) return true
  }
  return false
}

const h = (col: number, row: number, gc: number, gr: number) => Math.hypot(gc - col, gr - row)

function findPathAntigo(mapDef: PathfindingMapDef, startX: number, startY: number, goalX: number, goalY: number): Waypoint[] | null {
  const grid = mapDef.collisionGrid
  if (!grid) return null
  const circle: Circle = { cx: mapDef.bounds.width / 2, cy: mapDef.bounds.height / 2, radius: mapWalkRadius(mapDef) }

  const toCol = (x: number) => Math.floor(x / COLLISION_GRID_CELL_SIZE)
  const toRow = (y: number) => Math.floor(y / COLLISION_GRID_CELL_SIZE)
  const startCol = toCol(startX), startRow = toRow(startY)
  const goalCol = toCol(goalX), goalRow = toRow(goalY)

  if (startCol === goalCol && startRow === goalRow) return []
  if (bloqueada(grid, goalCol, goalRow, circle)) return null

  const cellKey = (col: number, row: number) => `${col},${row}`
  const startKey = cellKey(startCol, startRow)
  const goalKey = cellKey(goalCol, goalRow)

  const cameFrom = new Map<string, string>()
  const gScore = new Map<string, number>([[startKey, 0]])
  const open = new Map<string, number>([[startKey, h(startCol, startRow, goalCol, goalRow)]])
  const closed = new Set<string>()

  const maxExpansions = grid.length * grid[0].length * 2
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
      const cellPath: string[] = []
      let key: string | undefined = goalKey
      while (key && key !== startKey) { cellPath.push(key); key = cameFrom.get(key) }
      cellPath.reverse()
      const path = cellPath.map((k) => {
        const [col, row] = k.split(',').map(Number)
        return {
          x: col * COLLISION_GRID_CELL_SIZE + COLLISION_GRID_CELL_SIZE / 2,
          y: row * COLLISION_GRID_CELL_SIZE + COLLISION_GRID_CELL_SIZE / 2,
        }
      })
      return path.map((wp, i, arr) => (i === arr.length - 1 ? { x: goalX, y: goalY } : wp))
    }
    closed.add(currentKey)

    const [curCol, curRow] = currentKey.split(',').map(Number)
    for (const [dc, dr] of NEIGHBORS) {
      const nCol = curCol + dc, nRow = curRow + dr
      const nKey = cellKey(nCol, nRow)
      if (closed.has(nKey) || bloqueada(grid, nCol, nRow, circle)) continue
      if (dc !== 0 && dr !== 0 && (bloqueada(grid, curCol + dc, curRow, circle) || bloqueada(grid, curCol, curRow + dr, circle))) continue

      const stepCost = (dc !== 0 && dr !== 0) ? Math.SQRT2 : 1
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + stepCost
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, currentKey)
        gScore.set(nKey, tentativeG)
        open.set(nKey, tentativeG + h(nCol, nRow, goalCol, goalRow))
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Gerador de grades. `mulberry32` para o caso ser reproduzível pelo número da
// semente quando um falhar.
// ---------------------------------------------------------------------------
function rng(semente: number): () => number {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gerarMapa(semente: number, colunas: number, linhas: number, densidade: number): PathfindingMapDef {
  const r = rng(semente)
  const grid: string[] = []
  for (let row = 0; row < linhas; row++) {
    let linha = ''
    for (let col = 0; col < colunas; col++) linha += r() < densidade ? '1' : '0'
    grid.push(linha)
  }
  return {
    collisionGrid: grid,
    bounds: { width: colunas * COLLISION_GRID_CELL_SIZE, height: linhas * COLLISION_GRID_CELL_SIZE },
  }
}

function mesmaRota(a: Waypoint[] | null, b: Waypoint[] | null): boolean {
  if (a === null || b === null) return a === b
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false
  }
  return true
}

describe('a rota nova é idêntica à antiga (PH-102)', () => {
  it('em 2.000 buscas sobre grades aleatórias', () => {
    let comparadas = 0
    let comRota = 0
    const divergentes: string[] = []

    for (let semente = 1; semente <= 200; semente++) {
      // Densidades diferentes cobrem os três regimes: quase vazio (a heurística
      // manda em tudo e os empates são muitos), meio (contornos reais) e quase
      // cheio (muita busca sem saída, que é onde o teto de expansões age).
      const densidade = [0.05, 0.2, 0.35][semente % 3]
      const mapa = gerarMapa(semente, 24, 18, densidade)
      const r = rng(semente * 7919)

      for (let caso = 0; caso < 10; caso++) {
        const sx = r() * mapa.bounds.width
        const sy = r() * mapa.bounds.height
        const gx = r() * mapa.bounds.width
        const gy = r() * mapa.bounds.height

        const nova = findPath(mapa, sx, sy, gx, gy)
        const antiga = findPathAntigo(mapa, sx, sy, gx, gy)
        comparadas += 1
        if (nova !== null && nova.length > 0) comRota += 1
        if (!mesmaRota(nova, antiga)) {
          divergentes.push(`semente ${semente}, caso ${caso}: nova=${nova?.length ?? 'null'} antiga=${antiga?.length ?? 'null'}`)
        }
      }
    }

    // Guarda anti-teste-vácuo, e ela é o ponto: se as grades saírem tão cheias
    // que toda busca devolve `null`, as duas implementações "concordam" sem
    // nunca terem procurado nada.
    expect(comparadas).toBe(2000)
    expect(comRota, 'nenhuma busca produziu rota — as duas concordaram no vazio').toBeGreaterThan(500)
    expect(divergentes.slice(0, 10)).toEqual([])
  })

  it('nos casos de borda que não são busca', () => {
    const mapa = gerarMapa(42, 20, 20, 0.15)
    // Mesma célula, destino bloqueado, e sem grade — os três atalhos que saem
    // antes do laço. Um heap não muda nada aqui, e é por isso que valem: se um
    // deles quebrar, o erro está na reescrita e não no desempate.
    expect(findPath(mapa, 10, 10, 12, 12)).toEqual(findPathAntigo(mapa, 10, 10, 12, 12))
    expect(findPath({ collisionGrid: null, bounds: mapa.bounds }, 0, 0, 100, 100)).toBeNull()
  })

  it('o estado reutilizado entre chamadas não vaza de uma busca para a outra', () => {
    // O risco real de trocar `Map` novo por array de módulo. A segunda chamada
    // com a MESMA entrada tem que devolver a mesma coisa, e uma chamada no meio
    // com outra grade não pode contaminar.
    const mapaA = gerarMapa(7, 24, 18, 0.2)
    const mapaB = gerarMapa(99, 40, 30, 0.1)

    const primeira = findPath(mapaA, 30, 30, 400, 300)
    findPath(mapaB, 10, 10, 700, 500)
    const segunda = findPath(mapaA, 30, 30, 400, 300)

    expect(mesmaRota(primeira, segunda), 'a mesma busca deu resultado diferente depois de outra no meio').toBe(true)
    expect(mesmaRota(primeira, findPathAntigo(mapaA, 30, 30, 400, 300))).toBe(true)
  })

  it('a grade maior não deixa a menor ver célula visitada de antes', () => {
    // O caso que o selo (`visitadoEm`) existe para cobrir, e que um `fill(0)`
    // esquecido não pegaria: os arrays crescem para a maior grade já vista e
    // ficam grandes. Rodar a menor DEPOIS da maior tem que ser limpo.
    const grande = gerarMapa(3, 60, 40, 0.1)
    const pequena = gerarMapa(3, 12, 9, 0.1)
    findPath(grande, 20, 20, 1000, 700)
    expect(mesmaRota(
      findPath(pequena, 20, 20, 200, 150),
      findPathAntigo(pequena, 20, 20, 200, 150),
    )).toBe(true)
  })
})
