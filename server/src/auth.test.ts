import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autenticar, limparCacheDeAutenticacao } from './auth.js'
import type { Config } from './db.js'

const cfg: Config = { supabaseUrl: 'https://fake.supabase.co', serviceRoleKey: 'chave-fake' }

// JWT de mentira: so o payload importa aqui (o cache le `exp` dele pra encurtar
// a propria validade). Assinatura e cabecalho nao sao verificados por este
// codigo — quem valida assinatura e o gateway das Edge Functions.
function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.assinatura`
}

function req(token: string): Request {
  return new Request('https://exemplo/sessao/flush', { headers: { authorization: `Bearer ${token}` } })
}

function respostaUsuario(id: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ id, email: `${id}@exemplo.com` }),
  } as Response
}

describe('autenticar()', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    limparCacheDeAutenticacao()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // Um token distante da expiracao, pra o TTL ser o que manda.
  const tokenLongo = () => jwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 })

  it('sem header devolve 401 e nao fala com o Supabase', async () => {
    await expect(autenticar(cfg, new Request('https://exemplo/'))).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('primeira chamada consulta o Supabase e devolve o jogador', async () => {
    fetchMock.mockResolvedValueOnce(respostaUsuario('u1'))
    await expect(autenticar(cfg, req(tokenLongo()))).resolves.toEqual({ id: 'u1', email: 'u1@exemplo.com' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('o MESMO token nao paga uma segunda ida de rede', async () => {
    const token = tokenLongo()
    fetchMock.mockResolvedValueOnce(respostaUsuario('u1'))

    await autenticar(cfg, req(token))
    await autenticar(cfg, req(token))
    await autenticar(cfg, req(token))

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('10 flushes de 30s (a janela real do cliente) custam 1 verificacao', async () => {
    const token = tokenLongo()
    fetchMock.mockResolvedValue(respostaUsuario('u1'))

    for (let i = 0; i < 10; i++) {
      await autenticar(cfg, req(token))
      vi.advanceTimersByTime(30_000)
    }

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('tokens de jogadores diferentes nao se misturam', async () => {
    fetchMock.mockResolvedValueOnce(respostaUsuario('u1')).mockResolvedValueOnce(respostaUsuario('u2'))

    const a = await autenticar(cfg, req(jwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 })))
    const b = await autenticar(cfg, req(jwt({ sub: 'u2', exp: Math.floor(Date.now() / 1000) + 3600 })))

    expect(a.id).toBe('u1')
    expect(b.id).toBe('u2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('passado o TTL de 5 min, verifica de novo — e a janela de revogacao', async () => {
    const token = tokenLongo()
    fetchMock.mockResolvedValue(respostaUsuario('u1'))

    await autenticar(cfg, req(token))
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    await autenticar(cfg, req(token))

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('token que vence antes do TTL encurta o cache — nao o estende', async () => {
    // Vence em 60s: bem antes dos 5 min de TTL.
    const token = jwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 60 })
    fetchMock.mockResolvedValue(respostaUsuario('u1'))

    await autenticar(cfg, req(token))
    vi.advanceTimersByTime(61_000)
    await autenticar(cfg, req(token))

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('`exp` absurdo no payload nao fura o TTL', async () => {
    const token = jwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600 })
    fetchMock.mockResolvedValue(respostaUsuario('u1'))

    await autenticar(cfg, req(token))
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    await autenticar(cfg, req(token))

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('401 do Supabase nao fica grudado: a proxima tentativa consulta de novo', async () => {
    const token = tokenLongo()
    fetchMock.mockResolvedValueOnce(respostaUsuario('', 401)).mockResolvedValueOnce(respostaUsuario('u1'))

    await expect(autenticar(cfg, req(token))).rejects.toMatchObject({ status: 401 })
    await expect(autenticar(cfg, req(token))).resolves.toMatchObject({ id: 'u1' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falha de rede tambem nao fica cacheada', async () => {
    const token = tokenLongo()
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(respostaUsuario('u1'))

    await expect(autenticar(cfg, req(token))).rejects.toThrow('fetch failed')
    await expect(autenticar(cfg, req(token))).resolves.toMatchObject({ id: 'u1' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('requests concorrentes do mesmo token compartilham UMA ida de rede', async () => {
    const token = tokenLongo()
    fetchMock.mockResolvedValue(respostaUsuario('u1'))

    const [a, b, c] = await Promise.all([
      autenticar(cfg, req(token)),
      autenticar(cfg, req(token)),
      autenticar(cfg, req(token)),
    ])

    expect([a.id, b.id, c.id]).toEqual(['u1', 'u1', 'u1'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('token sem `exp` legivel continua funcionando, so perde o corte extra', async () => {
    fetchMock.mockResolvedValue(respostaUsuario('u1'))
    const opaco = 'nao-e-um-jwt'

    await autenticar(cfg, req(opaco))
    await autenticar(cfg, req(opaco))

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
