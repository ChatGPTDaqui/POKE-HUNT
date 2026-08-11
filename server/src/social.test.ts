import { describe, expect, it, vi, beforeEach } from 'vitest'
import { atualizar, comClaimAtomico, ErroHttp, type Config } from './db.js'
import { enfileirarEntregas } from './entregas.js'
import { coletarAnexo } from './social.js'

const cfg: Config = { supabaseUrl: 'https://fake.supabase.co', serviceRoleKey: 'chave-fake' }

// `comClaimAtomico` e o proprio `atualizar` sao mockados aqui: o contrato do
// helper (claim/undo de verdade) ja e coberto em db.test.ts. Aqui o alvo e a
// FIACAO de coletarAnexo() — filtro/patch certos, tratamento do resultado, e
// principalmente (PH-21) que `estado`/`read_at` so sao gravados DEPOIS de
// enfileirarEntregas confirmar, nunca antes.
vi.mock('./db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./db.js')>()
  return {
    ...real,
    comClaimAtomico: vi.fn(),
    atualizar: vi.fn(async () => {}),
  }
})

vi.mock('./entregas.js', () => ({
  enfileirarEntregas: vi.fn(async () => {}),
}))

const comClaimAtomicoMock = vi.mocked(comClaimAtomico)
const atualizarMock = vi.mocked(atualizar)
const enfileirarEntregasMock = vi.mocked(enfileirarEntregas)

describe('coletarAnexo() — claim com desfazer (PH-21)', () => {
  beforeEach(() => {
    comClaimAtomicoMock.mockReset()
    atualizarMock.mockReset().mockResolvedValue(undefined)
    enfileirarEntregasMock.mockReset().mockResolvedValue(undefined)
  })

  it('caminho feliz: reivindica so anexo_coletado_em, enfileira e so ai marca lido', async () => {
    comClaimAtomicoMock.mockImplementation(async (_cfg, _tabela, _filtroClaim, _patchClaim, _patchDesfazer, fn) =>
      fn({ id: 'msg1', anexo_itens: [{ itemId: 'pokeball', quantity: 3 }] } as never),
    )

    const resultado = await coletarAnexo(cfg, 'user1', 'msg1')

    expect(comClaimAtomicoMock).toHaveBeenCalledTimes(1)
    const [, tabela, filtroClaim, patchClaim, patchDesfazer] = comClaimAtomicoMock.mock.calls[0]
    expect(tabela).toBe('mail_messages')
    expect(filtroClaim).toContain('id=eq.msg1')
    expect(filtroClaim).toContain('para_id=eq.user1')
    expect(filtroClaim).toContain('anexo_coletado_em=is.null')
    expect(Object.keys(patchClaim)).toEqual(['anexo_coletado_em']) // NAO leva estado/read_at junto
    expect(patchDesfazer).toEqual({ anexo_coletado_em: null })

    expect(enfileirarEntregasMock).toHaveBeenCalledWith(cfg, [
      { userId: 'user1', itemId: 'pokeball', quantity: 3, motivo: 'correio:msg1' },
    ])
    expect(atualizarMock).toHaveBeenCalledWith(cfg, 'mail_messages?id=eq.msg1', expect.objectContaining({ estado: 'lido' }))
    expect(resultado.ok).toBe(true)
    expect(resultado.itens).toHaveLength(1)
  })

  it('corrida perdida: comClaimAtomico rejeita 409, nada mais roda', async () => {
    comClaimAtomicoMock.mockRejectedValueOnce(new ErroHttp(409, 'Nada para coletar nesta mensagem.'))

    await expect(coletarAnexo(cfg, 'user1', 'msg1')).rejects.toMatchObject({ status: 409 })

    expect(enfileirarEntregasMock).not.toHaveBeenCalled()
    expect(atualizarMock).not.toHaveBeenCalled()
  })

  it('regressao PH-21: enfileirarEntregas falha depois do claim -> erro original propaga, "lido" nunca e gravado', async () => {
    const erroOriginal = new ErroHttp(502, 'falha ao falar com o banco')
    enfileirarEntregasMock.mockRejectedValueOnce(erroOriginal)
    comClaimAtomicoMock.mockImplementation(async (_cfg, _tabela, _filtroClaim, _patchClaim, _patchDesfazer, fn) =>
      fn({ id: 'msg1', anexo_itens: [{ itemId: 'pokeball', quantity: 1 }] } as never),
    )

    await expect(coletarAnexo(cfg, 'user1', 'msg1')).rejects.toBe(erroOriginal)

    // Se isto tivesse rodado, o item apareceria "lido" com o anexo perdido —
    // exatamente o bug do PH-21. O undo de verdade do claim e coberto em
    // db.test.ts; aqui a garantia e que coletarAnexo nao segue em frente.
    expect(atualizarMock).not.toHaveBeenCalled()
  })
})
