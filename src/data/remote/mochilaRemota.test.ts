// O PostgREST corta em 1000 linhas SEM ERRO. Duas contas reais ja passam disso
// (1328 e 813 POKEs), e a tela que le esta lista oferece venda em lote — uma
// mochila truncada aqui e indistinguivel de "o jogador vendeu tudo".
//
// Este arquivo tranca as duas metades: paginar de verdade, e ESTOURAR quando o
// que chegou nao bate com o total que o banco declarou.
import { beforeEach, describe, expect, it, vi } from 'vitest'

let linhas: Record<string, unknown>[] = []
let paginasPedidas: [number, number][] = []
// Total que o banco declara no `count` — separado de `linhas.length` de
// proposito, pra dar pra simular a divergencia.
let totalDeclarado: number | null = null

vi.mock('@/lib/supabase', () => {
  const construtor = () => {
    const q: Record<string, unknown> = {}
    for (const metodo of ['select', 'eq', 'in', 'order', 'limit']) {
      q[metodo] = () => q
    }
    q.range = (de: number, ate: number) => {
      paginasPedidas.push([de, ate])
      return Promise.resolve({
        data: linhas.slice(de, ate + 1),
        error: null,
        count: totalDeclarado,
      })
    }
    return q
  }
  return {
    supabase: {
      auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }) },
      from: construtor,
    },
  }
})

vi.mock('./playerMapper', () => ({
  rowToPoke: (row: { id: string }) => ({ uid: row.id }),
  // PH-184: a leitura passou a pedir colunas nomeadas em vez de `select('*')`.
  // O valor nao importa pro que este arquivo julga (paginacao e conferencia do
  // total declarado); a ausencia dele, sim — o mock estoura na primeira request.
  COLUNAS_DE_POKE: 'id',
}))

const { carregarMochilaRemota } = await import('./mochilaRemota')

const gerar = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `poke-${i}` }))

beforeEach(() => {
  paginasPedidas = []
  totalDeclarado = null
})

describe('carregarMochilaRemota()', () => {
  it('traz TODAS as linhas de uma mochila acima do corte de 1000', async () => {
    linhas = gerar(1328)
    totalDeclarado = 1328

    const pokes = await carregarMochilaRemota()

    expect(pokes).toHaveLength(1328)
    expect(paginasPedidas).toEqual([[0, 999], [1000, 1999]])
    // A ultima e a primeira, pra pegar pagina fora de ordem ou repetida.
    expect(pokes[0].uid).toBe('poke-0')
    expect(pokes[1327].uid).toBe('poke-1327')
  })

  it('mochila que cabe numa pagina faz UMA request', async () => {
    linhas = gerar(12)
    totalDeclarado = 12

    const pokes = await carregarMochilaRemota()

    expect(pokes).toHaveLength(12)
    expect(paginasPedidas).toEqual([[0, 999]])
  })

  it('mochila vazia devolve lista vazia sem estourar', async () => {
    linhas = []
    totalDeclarado = 0
    await expect(carregarMochilaRemota()).resolves.toEqual([])
  })

  it('estoura quando o total declarado nao bate com o que chegou', async () => {
    // Exatamente o formato da mordida do PostgREST: 200 OK, lista curta, nenhum
    // erro. Devolver isso em silencio e o que nao pode acontecer.
    linhas = gerar(1000)
    totalDeclarado = 5035

    await expect(carregarMochilaRemota()).rejects.toThrow(/Mochila incompleta/)
  })
})
