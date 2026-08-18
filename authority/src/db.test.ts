import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { comClaimAtomico, ErroHttp, type Config } from './db.js'

const cfg: Config = { supabaseUrl: 'https://fake.supabase.co', serviceRoleKey: 'chave-fake' }

function respostaJson(corpo: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(corpo),
  } as Response
}

describe('comClaimAtomico()', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('corrida perdida: claim vazio joga 409 e nunca chama fn', async () => {
    fetchMock.mockResolvedValueOnce(respostaJson([]))
    const fn = vi.fn()

    await expect(
      comClaimAtomico(cfg, 'mail_messages', 'id=eq.m1&anexo_coletado_em=is.null', { anexo_coletado_em: 'agora' }, { anexo_coletado_em: null }, fn),
    ).rejects.toMatchObject({ status: 409 })

    expect(fn).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('caminho feliz: claim ok, roda fn e devolve o resultado sem desfazer nada', async () => {
    fetchMock.mockResolvedValueOnce(respostaJson([{ id: 'm1', anexo_coletado_em: 'agora' }]))
    const fn = vi.fn(async (linha: { id: string }) => `processado:${linha.id}`)

    const resultado = await comClaimAtomico(
      cfg,
      'mail_messages',
      'id=eq.m1&anexo_coletado_em=is.null',
      { anexo_coletado_em: 'agora' },
      { anexo_coletado_em: null },
      fn,
    )

    expect(resultado).toBe('processado:m1')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fn lanca depois do claim: desfaz o claim e repropaga o erro ORIGINAL', async () => {
    fetchMock
      .mockResolvedValueOnce(respostaJson([{ id: 'm1', anexo_coletado_em: 'agora' }])) // claim
      .mockResolvedValueOnce(respostaJson([{ id: 'm1', anexo_coletado_em: null }])) // undo

    const erroOriginal = new ErroHttp(502, 'falha ao enfileirar')
    const fn = vi.fn(async () => {
      throw erroOriginal
    })

    await expect(
      comClaimAtomico(cfg, 'mail_messages', 'id=eq.m1&anexo_coletado_em=is.null', { anexo_coletado_em: 'agora' }, { anexo_coletado_em: null }, fn),
    ).rejects.toBe(erroOriginal)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, initDesfazer] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(JSON.parse(initDesfazer.body as string)).toEqual({ anexo_coletado_em: null })
    const [urlDesfazer] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(urlDesfazer).toContain('id=eq.m1')
  })
})
