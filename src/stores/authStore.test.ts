import { describe, expect, it, vi, beforeEach } from 'vitest'

const { signOutMock, flushAgoraMock, pararFlushPeriodicoMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(async () => ({ error: null })),
  flushAgoraMock: vi.fn(async () => {}),
  pararFlushPeriodicoMock: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: signOutMock,
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}))

vi.mock('@/data/remote/gameStatePersistence', () => ({
  flushAgora: flushAgoraMock,
}))

// Mock do modulo inteiro (nao so a funcao usada): sem isto o import real de
// autoridade.ts arrasta gameStateStore.ts (e toda a arvore dele) pro teste,
// que chama `aoFalharSave` do gameStatePersistence mockado acima e quebra por
// faltar esse export no mock.
vi.mock('@/data/remote/autoridade', () => ({
  pararFlushPeriodico: pararFlushPeriodicoMock,
}))

beforeEach(() => {
  vi.clearAllMocks()
  signOutMock.mockResolvedValue({ error: null })
  flushAgoraMock.mockResolvedValue(undefined)
})

describe('authStore.signOut() — flush com o token ainda valido, antes de invalidar a sessao (PH-17)', () => {
  it('chama flushAgora ANTES de supabase.auth.signOut()', async () => {
    const { useAuthStore } = await import('./authStore')
    const ordem: string[] = []
    flushAgoraMock.mockImplementationOnce(async () => {
      ordem.push('flush')
    })
    signOutMock.mockImplementationOnce(async () => {
      ordem.push('signOut')
      return { error: null }
    })

    await useAuthStore.getState().signOut()

    expect(ordem).toEqual(['flush', 'signOut'])
  })

  it('falha no flush nao impede o logout de completar', async () => {
    const { useAuthStore } = await import('./authStore')
    flushAgoraMock.mockRejectedValueOnce(new Error('falha de rede'))

    await expect(useAuthStore.getState().signOut()).resolves.toBeUndefined()
    expect(signOutMock).toHaveBeenCalledTimes(1)
  })

  it('para o timer de flush da hunt antes de deslogar', async () => {
    // Sem isto, uma hunt aberta deixava `timerFlush` (autoridade.ts) rodando
    // depois do logout — modulo, nao componente, nenhum unmount cancela.
    const { useAuthStore } = await import('./authStore')

    await useAuthStore.getState().signOut()

    expect(pararFlushPeriodicoMock).toHaveBeenCalledTimes(1)
  })
})
