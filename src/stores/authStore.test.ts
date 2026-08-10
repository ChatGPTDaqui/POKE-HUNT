import { describe, expect, it, vi, beforeEach } from 'vitest'

const { signOutMock, flushAgoraMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(async () => ({ error: null })),
  flushAgoraMock: vi.fn(async () => {}),
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
})
