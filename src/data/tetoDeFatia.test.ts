// A conta do teto de fatia, isolada.
//
// Ela ganhou teste proprio quando deixou de ser aproximacao sucessiva e virou
// solucao fechada (ver `aparaOTeto`). A versao iterativa passava por 99% dos
// pools e falhava exatamente no caso dificil — dois encontros empatados no topo
// de um pool pequeno —, e o unico jeito de ver isso era rodar o motor inteiro.
import { describe, expect, it } from 'vitest'
import { aparaOTeto, TETO_DE_FATIA, POOL_MINIMO_PRA_TETO } from './huntSpawnOverrides'

const fatias = (pesos: Map<string, number>) => {
  const total = [...pesos.values()].reduce((s, w) => s + w, 0)
  return Object.fromEntries([...pesos].map(([id, w]) => [id, w / total]))
}
const maiorFatia = (pesos: Map<string, number>) => Math.max(...Object.values(fatias(pesos)))

describe('aparaOTeto', () => {
  it('nao mexe em pool que ja respeita o teto', () => {
    const antes = new Map([['a', 10], ['b', 10], ['c', 10]])
    expect([...aparaOTeto(new Map(antes))]).toEqual([...antes])
  })

  it('apara um dominante sozinho ate exatamente o teto', () => {
    const pesos = aparaOTeto(new Map([['a', 100], ['b', 1], ['c', 1]]))
    expect(fatias(pesos).a).toBeCloseTo(TETO_DE_FATIA, 12)
    expect(fatias(pesos).b).toBeCloseTo(fatias(pesos).c, 12)
  })

  // O CASO QUE A VERSAO ITERATIVA ERRAVA. Com dois empatados no topo, cada volta
  // recalculava um assumindo o outro parado; as 10 voltas paravam em 35,05%.
  it('apara DOIS empatados no topo, os dois exatamente no teto', () => {
    const pesos = aparaOTeto(new Map([['a', 30], ['b', 30], ['c', 5]]))
    const f = fatias(pesos)
    expect(f.a).toBeCloseTo(TETO_DE_FATIA, 12)
    expect(f.b).toBeCloseTo(TETO_DE_FATIA, 12)
    expect(f.c).toBeCloseTo(1 - 2 * TETO_DE_FATIA, 12)
  })

  it('apara so quem passa, e nao o pool inteiro', () => {
    const pesos = aparaOTeto(new Map([['a', 100], ['b', 100], ['c', 1], ['d', 1]]))
    const f = fatias(pesos)
    expect(f.a).toBeCloseTo(TETO_DE_FATIA, 12)
    expect(f.b).toBeCloseTo(TETO_DE_FATIA, 12)
    // Os dois de baixo mantem a proporcao entre si e dividem o que sobra.
    expect(f.c).toBeCloseTo(f.d, 12)
    expect(f.c + f.d).toBeCloseTo(1 - 2 * TETO_DE_FATIA, 12)
  })

  // Com 3 encontros o minimo possivel e 33,3%, que cabe no teto de 35%. Com 2 o
  // minimo ja e 50% e nao ha apara que resolva — o pool sai como entrou, em vez
  // de sair com peso deformado por uma conta impossivel.
  it('deixa em paz o pool pequeno demais pro teto', () => {
    const antes = new Map([['a', 100], ['b', 1]])
    expect([...aparaOTeto(new Map(antes))]).toEqual([...antes])
    expect(POOL_MINIMO_PRA_TETO).toBe(3)
  })

  it('nunca deixa ninguem acima do teto, em pool nenhum', () => {
    // Varredura: todo pool de 3 a 8 encontros com pesos da escala real de tier.
    const escala = [1, 5, 10, 20, 30]
    const erros: string[] = []
    for (let n = 3; n <= 8; n++) {
      for (let semente = 0; semente < 500; semente++) {
        const pesos = new Map<string, number>()
        let x = semente * 2654435761 % 4294967296
        for (let i = 0; i < n; i++) {
          x = (x * 1103515245 + 12345) % 2147483648
          pesos.set(`e${i}`, escala[x % escala.length])
        }
        const maior = maiorFatia(aparaOTeto(new Map(pesos)))
        if (maior > TETO_DE_FATIA + 1e-9) erros.push(`n=${n} semente=${semente} -> ${(maior * 100).toFixed(2)}%`)
      }
    }
    expect(erros).toEqual([])
  })
})
