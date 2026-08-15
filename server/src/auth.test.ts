import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { autenticar, limparCacheDeChaves } from './auth.js'
import type { Config } from './db.js'

const URL_PROJETO = 'https://fake.supabase.co'
const ISS = `${URL_PROJETO}/auth/v1`
const KID = 'chave-de-teste'

// Um par de chaves ES256 de verdade, gerado uma vez. Assinar pra valer (em vez
// de stubar `crypto.subtle.verify`) e o unico jeito de os testes cobrirem o que
// importa aqui: token com assinatura trocada, chave errada e `alg` mentiroso.
let privada: CryptoKey
let jwksJson: string
let jwkOutraChave: string

async function parDeChaves(kid: string) {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const publica = { ...(await crypto.subtle.exportKey('jwk', par.publicKey)), kid, alg: 'ES256', use: 'sig' }
  return { privada: par.privateKey, jwks: JSON.stringify({ keys: [publica] }) }
}

beforeAll(async () => {
  const nosso = await parDeChaves(KID)
  privada = nosso.privada
  jwksJson = nosso.jwks
  // Mesmo `kid`, chave diferente: simula um token forjado por quem copiou o
  // cabecalho mas nao tem a chave privada do projeto.
  jwkOutraChave = (await parDeChaves(KID)).jwks
})

const b64url = (bytes: Uint8Array | string) => {
  const b = typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes)
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function assinar(payload: Record<string, unknown>, cabecalho: Record<string, unknown> = {}, chave = privada) {
  const h = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: KID, ...cabecalho }))
  const p = b64url(JSON.stringify(payload))
  const assinatura = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    chave,
    new TextEncoder().encode(`${h}.${p}`),
  )
  return `${h}.${p}.${b64url(new Uint8Array(assinatura))}`
}

const agora = () => Math.floor(Date.now() / 1000)
const payloadValido = (extra: Record<string, unknown> = {}) => ({
  sub: 'u1', email: 'u1@exemplo.com', iss: ISS, aud: 'authenticated', exp: agora() + 3600, ...extra,
})

const req = (token: string) =>
  new Request('https://exemplo/sessao/flush', { headers: { authorization: `Bearer ${token}` } })

describe('autenticar() — verificacao local do JWT', () => {
  let cfg: Config
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    limparCacheDeChaves()
    cfg = { supabaseUrl: URL_PROJETO, serviceRoleKey: 'chave-fake', jwksJson }
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('token valido passa SEM nenhuma ida de rede — o ponto de toda a mudanca', async () => {
    const jogador = await autenticar(cfg, req(await assinar(payloadValido())))

    expect(jogador).toEqual({ id: 'u1', email: 'u1@exemplo.com' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('20 chamadas seguidas continuam custando zero rede', async () => {
    const token = await assinar(payloadValido())
    for (let i = 0; i < 20; i++) await autenticar(cfg, req(token))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sem header devolve 401', async () => {
    await expect(autenticar(cfg, new Request('https://exemplo/'))).rejects.toMatchObject({ status: 401 })
  })

  it('token que nao tem tres partes devolve 401', async () => {
    await expect(autenticar(cfg, req('nao.e-jwt'))).rejects.toMatchObject({ status: 401 })
  })

  // O ataque classico: trocar o algoritmo por um que a verificacao trate de
  // outro jeito. Fixar ES256 e o que fecha isso.
  it('`alg: none` e recusado', async () => {
    const h = b64url(JSON.stringify({ alg: 'none', typ: 'JWT', kid: KID }))
    const p = b64url(JSON.stringify(payloadValido()))
    await expect(autenticar(cfg, req(`${h}.${p}.`))).rejects.toMatchObject({ status: 401 })
  })

  it('`alg: HS256` e recusado mesmo com o resto do token intacto', async () => {
    const token = await assinar(payloadValido(), { alg: 'HS256' })
    await expect(autenticar(cfg, req(token))).rejects.toMatchObject({ status: 401 })
  })

  it('assinatura de outra chave com o mesmo `kid` e recusada', async () => {
    const outra = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const token = await assinar(payloadValido(), {}, outra.privateKey)
    await expect(autenticar(cfg, req(token))).rejects.toMatchObject({ status: 401 })
  })

  it('payload adulterado depois de assinado e recusado', async () => {
    const token = await assinar(payloadValido())
    const [h, , s] = token.split('.')
    const forjado = `${h}.${b64url(JSON.stringify(payloadValido({ sub: 'outro-jogador' })))}.${s}`
    await expect(autenticar(cfg, req(forjado))).rejects.toMatchObject({ status: 401 })
  })

  it('token vencido e recusado — e o que faz o logout eventualmente valer', async () => {
    const token = await assinar(payloadValido({ exp: agora() - 120 }))
    await expect(autenticar(cfg, req(token))).rejects.toMatchObject({ status: 401 })
  })

  it('token vencido ha poucos segundos ainda passa (folga de relogio)', async () => {
    const token = await assinar(payloadValido({ exp: agora() - 5 }))
    await expect(autenticar(cfg, req(token))).resolves.toMatchObject({ id: 'u1' })
  })

  it('token de OUTRO projeto Supabase e recusado', async () => {
    const token = await assinar(payloadValido({ iss: 'https://outro-projeto.supabase.co/auth/v1' }))
    await expect(autenticar(cfg, req(token))).rejects.toMatchObject({ status: 401 })
  })

  it('token que nao e do publico `authenticated` e recusado', async () => {
    const token = await assinar(payloadValido({ aud: 'service_role' }))
    await expect(autenticar(cfg, req(token))).rejects.toMatchObject({ status: 401 })
  })

  it('token sem `sub` e recusado', async () => {
    const token = await assinar(payloadValido({ sub: undefined }))
    await expect(autenticar(cfg, req(token))).rejects.toMatchObject({ status: 401 })
  })

  it('sem JWKS no env, busca no endpoint publico e valida igual', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => JSON.parse(jwksJson) } as Response)

    const jogador = await autenticar({ ...cfg, jwksJson: undefined }, req(await assinar(payloadValido())))

    expect(jogador.id).toBe('u1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/v1/.well-known/jwks.json')
  })

  // A rotacao de chave e o unico caso em que a busca acontece na vida real: o
  // env fica velho, o `kid` novo nao esta nele, e o fallback resolve sozinho.
  it('`kid` fora do JWKS do env cai no fallback de busca', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => JSON.parse(jwksJson) } as Response)

    const jogador = await autenticar({ ...cfg, jwksJson: '{"keys":[]}' }, req(await assinar(payloadValido())))

    expect(jogador.id).toBe('u1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('`kid` que nem o endpoint conhece devolve 401, nao 500', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ keys: [] }) } as Response)
    const token = await assinar(payloadValido())
    await expect(autenticar({ ...cfg, jwksJson: undefined }, req(token))).rejects.toMatchObject({ status: 401 })
  })

  // 503 e nao 401: o token pode estar perfeito e o Auth e que esta fora do ar.
  // Responder 401 aqui mandaria o jogador pra tela de login sem motivo.
  it('endpoint de JWKS fora do ar devolve 503', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 } as Response)
    const token = await assinar(payloadValido())
    await expect(autenticar({ ...cfg, jwksJson: undefined }, req(token))).rejects.toMatchObject({ status: 503 })
  })

  it('JWKS do env que nao bate com a chave que assinou recusa o token', async () => {
    const token = await assinar(payloadValido())
    await expect(autenticar({ ...cfg, jwksJson: jwkOutraChave }, req(token))).rejects.toMatchObject({ status: 401 })
  })
})
