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
// ---------------------------------------------------------------------------
// PERFORMANCE (PH-102), E POR QUE A ROTA NAO MUDOU
// ---------------------------------------------------------------------------
// Ate PH-102 o conjunto aberto era um `Map` e a escolha do menor `f` uma
// varredura LINEAR a cada expansao — busca O(n^2) no numero de celulas — e a
// chave de celula era uma string (`"col,row"`), uma alocacao por vizinho
// visitado mais um `split(',').map(Number)` duas vezes por expansao. Medido no
// PH-94: a grade 4x mais fina custou +75% no teste de simulacao offline mais
// pesado (33s -> 58s), passando do `testTimeout` de 45s.
//
// Agora: HEAP BINARIO e chave NUMERICA (`row * cols + col`). Nenhuma string e
// alocada por celula visitada.
//
// A PARTE QUE IMPORTA MAIS QUE A VELOCIDADE: a rota devolvida e IDENTICA a de
// antes, celula por celula. A issue previa que nao seria — "trocar por heap
// muda o desempate entre rotas de mesmo custo, ou seja muda a simulacao" —, e
// isso era verdade para um heap comum. Rota diferente = movimento diferente =
// sequencia de sorteio diferente = simulacao diferente, e num jogo cujo
// servidor RE-SIMULA o que o cliente fez, isso e divergencia de autoridade.
//
// O que salva e uma observacao sobre o codigo antigo: a varredura usava `f <
// bestF` (estrito), entao em empate ela ficava com o PRIMEIRO da ordem de
// iteracao do `Map` — a ordem da PRIMEIRA insercao daquela chave, que o `Map`
// preserva mesmo quando o valor e atualizado depois. Reproduzir isso e so
// guardar a ordem de primeira insercao por celula (`ordemDeEntrada`) e usa-la
// como segundo criterio do heap. `pathfindingEquivalente.test.ts` compara as
// duas implementacoes celula a celula em 2.000 buscas sobre grades aleatorias,
// e carrega a versao antiga inteira pra isso — ela e o oraculo, nao
// duplicacao a ser removida.
//
// MEDIDO. Maior grade real (`dragon`, 10.605 celulas), 2.000 buscas:
//
//   1.028ms -> 277ms   (0,514ms -> 0,138ms por busca), 3,7x
//
// E no teste de simulacao mais pesado do projeto (`engine/pessimista.test.ts`,
// 40 sementes x 1h de mundo nos dois modos): 58s -> 30s, abaixo dos 33s que
// ele levava ANTES da grade fina do PH-94.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Heap binario de minimos, ordenado por (f, ordem de primeira entrada)
// ---------------------------------------------------------------------------
// Tres arrays paralelos em vez de um array de objetos: a busca roda dezenas de
// milhares de vezes por simulacao offline, e um objeto por no seria lixo pro
// coletor a cada expansao.
//
// DELECAO PREGUICOSA: quando uma celula ja no aberto ganha um `g` melhor, uma
// entrada NOVA e empilhada e a antiga fica. Quem tira do heap descarta o que ja
// esta fechado. E o padrao normal de A* com heap, e aqui ele nao muda nada: a
// entrada obsoleta tem `f` MAIOR, entao ela so sairia depois da boa, que ja
// fechou a celula.
class HeapDeCelulas {
  private celula: number[] = []
  private f: number[] = []
  private ordem: number[] = []
  private tamanho = 0

  get vazio(): boolean { return this.tamanho === 0 }

  limpar(): void { this.tamanho = 0 }

  /** `ordem` e o desempate: menor primeiro, igual a ordem de iteracao do Map. */
  inserir(celula: number, f: number, ordem: number): void {
    let i = this.tamanho++
    this.celula[i] = celula
    this.f[i] = f
    this.ordem[i] = ordem
    while (i > 0) {
      const pai = (i - 1) >> 1
      if (!this.menor(i, pai)) break
      this.trocar(i, pai)
      i = pai
    }
  }

  /** Remove e devolve a celula de menor (f, ordem). `-1` quando vazio. */
  remover(): number {
    if (this.tamanho === 0) return -1
    const topo = this.celula[0]
    this.tamanho -= 1
    if (this.tamanho > 0) {
      this.celula[0] = this.celula[this.tamanho]
      this.f[0] = this.f[this.tamanho]
      this.ordem[0] = this.ordem[this.tamanho]
      let i = 0
      for (;;) {
        const esq = i * 2 + 1
        const dir = esq + 1
        let menor = i
        if (esq < this.tamanho && this.menor(esq, menor)) menor = esq
        if (dir < this.tamanho && this.menor(dir, menor)) menor = dir
        if (menor === i) break
        this.trocar(i, menor)
        i = menor
      }
    }
    return topo
  }

  private menor(a: number, b: number): boolean {
    if (this.f[a] !== this.f[b]) return this.f[a] < this.f[b]
    return this.ordem[a] < this.ordem[b]
  }

  private trocar(a: number, b: number): void {
    let t = this.celula[a]; this.celula[a] = this.celula[b]; this.celula[b] = t
    t = this.f[a]; this.f[a] = this.f[b]; this.f[b] = t
    t = this.ordem[a]; this.ordem[a] = this.ordem[b]; this.ordem[b] = t
  }
}

// ---------------------------------------------------------------------------
// Estado reutilizado entre chamadas
// ---------------------------------------------------------------------------
// A busca NAO e reentrante (o sim e de uma thread so, e `findPath` nao chama
// nada que possa chamar `findPath`), entao alocar um `Map` novo por chamada era
// so pressao de GC. Os arrays crescem ate o tamanho da maior grade ja vista e
// param de crescer.
//
// `visitadoEm` e o que dispensa limpar tudo entre chamadas: cada busca tem um
// selo proprio (`buscaAtual`), e uma celula so conta como visitada se o selo
// dela for o desta busca. Limpar 10.605 posicoes por chamada custaria mais que
// a busca em si nos casos curtos, que sao a maioria.
const heap = new HeapDeCelulas()
let gScore: Float64Array = new Float64Array(0)
let cameFrom: Int32Array = new Int32Array(0)
let ordemDeEntrada: Int32Array = new Int32Array(0)
let visitadoEm: Int32Array = new Int32Array(0)
let fechadoEm: Int32Array = new Int32Array(0)
let buscaAtual = 0

function prepararEstado(celulas: number): void {
  if (gScore.length < celulas) {
    gScore = new Float64Array(celulas)
    cameFrom = new Int32Array(celulas)
    ordemDeEntrada = new Int32Array(celulas)
    visitadoEm = new Int32Array(celulas)
    fechadoEm = new Int32Array(celulas)
    // Arrays novos vem zerados, e 0 e um selo valido. Pular pro 1 evita que a
    // primeira busca depois de um crescimento veja tudo como ja visitado.
    buscaAtual = 0
  }
  buscaAtual += 1
  heap.limpar()
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

function reconstruirRota(destino: number, inicio: number, colunas: number): Waypoint[] {
  const celulas: number[] = []
  let celula = destino
  while (celula !== inicio && celula >= 0) {
    celulas.push(celula)
    celula = cameFrom[celula]
  }
  celulas.reverse()
  const meio = COLLISION_GRID_CELL_SIZE / 2
  return celulas.map((c) => ({
    x: (c % colunas) * COLLISION_GRID_CELL_SIZE + meio,
    y: Math.floor(c / colunas) * COLLISION_GRID_CELL_SIZE + meio,
  }))
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

  const colunas = grid[0].length
  const inicio = startRow * colunas + startCol
  const destino = goalRow * colunas + goalCol

  prepararEstado(grid.length * colunas)
  const selo = buscaAtual

  gScore[inicio] = 0
  visitadoEm[inicio] = selo
  cameFrom[inicio] = -1
  // A ordem de entrada e o desempate, e ela e a da PRIMEIRA vez que a celula
  // entrou no aberto — nunca reatribuida quando o `g` melhora. E isso que
  // reproduz a ordem de iteracao do `Map` da versao anterior.
  let proximaOrdem = 0
  ordemDeEntrada[inicio] = proximaOrdem++
  heap.inserir(inicio, heuristic(startCol, startRow, goalCol, goalRow), ordemDeEntrada[inicio])

  const maxExpansions = tetoDeExpansoes(grid)
  let expansions = 0
  while (!heap.vazio) {
    const atual = heap.remover()
    // Entrada obsoleta da delecao preguicosa: a celula ja foi expandida por uma
    // entrada de `f` menor. Nao conta como expansao — o teto mede celulas
    // expandidas, que e o que a versao anterior contava.
    if (fechadoEm[atual] === selo) continue
    if (++expansions > maxExpansions) return null

    if (atual === destino) {
      const rota = reconstruirRota(destino, inicio, colunas)
      // O ultimo ponto vira o alvo exato em vez do centro da celula, pra
      // chegada precisa.
      if (rota.length > 0) rota[rota.length - 1] = { x: goalX, y: goalY }
      return rota
    }
    fechadoEm[atual] = selo

    const curCol = atual % colunas
    const curRow = (atual - curCol) / colunas
    const gAtual = gScore[atual]
    for (const [dc, dr] of NEIGHBORS) {
      const nCol = curCol + dc, nRow = curRow + dr
      if (isBlocked(grid, nCol, nRow, circle)) continue
      const vizinho = nRow * colunas + nCol
      if (fechadoEm[vizinho] === selo) continue
      // Never cut a diagonal corner between two blocked orthogonal cells —
      // keeps every straight-line step between consecutive waypoints
      // genuinely walkable, so the follower in MovementSystem.js never needs
      // its own collision re-check along a route.
      if (dc !== 0 && dr !== 0 && (isBlocked(grid, curCol + dc, curRow, circle) || isBlocked(grid, curCol, curRow + dr, circle))) continue

      const stepCost = (dc !== 0 && dr !== 0) ? Math.SQRT2 : 1
      const tentativeG = gAtual + stepCost
      const novo = visitadoEm[vizinho] !== selo
      if (novo || tentativeG < gScore[vizinho]) {
        if (novo) {
          visitadoEm[vizinho] = selo
          ordemDeEntrada[vizinho] = proximaOrdem++
        }
        cameFrom[vizinho] = atual
        gScore[vizinho] = tentativeG
        heap.inserir(vizinho, tentativeG + heuristic(nCol, nRow, goalCol, goalRow), ordemDeEntrada[vizinho])
      }
    }
  }
  return null
}
