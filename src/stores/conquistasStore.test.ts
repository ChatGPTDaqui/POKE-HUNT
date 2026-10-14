// O store so repassa o que o servidor fechou: guarda e celebra, UMA vez.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/data/remote/conquistasRpc', () => ({
  lerMinhasConquistas: vi.fn(), conquistasPublicas: vi.fn(), definirTitulo: vi.fn(), definirVitrine: vi.fn(),
}))

const { useConquistasStore } = await import('./conquistasStore')
const { celebracaoStore } = await import('./celebracaoStoreVanilla')

beforeEach(() => {
  useConquistasStore.getState().limpar()
  celebracaoStore.getState().limpar()
})

describe('conquistasStore.receberNovas', () => {
  it('guarda e celebra as novas num cartao so', () => {
    useConquistasStore.getState().receberNovas(['cacador', 'primeiro_abate'])
    expect(Object.keys(useConquistasStore.getState().desbloqueadas).sort()).toEqual(['cacador', 'primeiro_abate'])
    const fila = celebracaoStore.getState().fila
    expect(fila).toHaveLength(1)
    expect(fila[0].celebracao).toEqual({ tipo: 'conquista', ids: ['cacador', 'primeiro_abate'] })
  })

  it('a mesma conquista nao celebra duas vezes (flush repetido)', () => {
    useConquistasStore.getState().receberNovas(['cacador'])
    celebracaoStore.getState().limpar()
    useConquistasStore.getState().receberNovas(['cacador'])
    expect(celebracaoStore.getState().fila).toHaveLength(0)
  })

  it('conquistas que chegam com o cartao na tela entram no MESMO cartao', () => {
    useConquistasStore.getState().receberNovas(['cacador'])
    useConquistasStore.getState().receberNovas(['exterminador'])
    const fila = celebracaoStore.getState().fila
    expect(fila).toHaveLength(1)
    expect(fila[0].celebracao).toEqual({ tipo: 'conquista', ids: ['cacador', 'exterminador'] })
  })

  it('resposta sem o campo (servidor antigo) nao faz nada', () => {
    useConquistasStore.getState().receberNovas(undefined)
    expect(celebracaoStore.getState().fila).toHaveLength(0)
  })
})

describe('conquistasStore.alternarVitrine', () => {
  it('liga ate 3 e nao passa disso; desligar libera vaga', async () => {
    const s = useConquistasStore.getState()
    await s.alternarVitrine('a')
    await s.alternarVitrine('b')
    await s.alternarVitrine('c')
    await s.alternarVitrine('d')
    expect(useConquistasStore.getState().vitrine).toEqual(['a', 'b', 'c'])
    await s.alternarVitrine('b')
    await s.alternarVitrine('d')
    expect(useConquistasStore.getState().vitrine).toEqual(['a', 'c', 'd'])
  })
})
