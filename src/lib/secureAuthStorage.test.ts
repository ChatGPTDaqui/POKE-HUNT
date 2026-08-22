// @vitest-environment jsdom
//
// PH-50: varredura de chaves orfas no localStorage. `limparStorageOrfao()`
// roda automaticamente no import do modulo (efeito colateral no boot real),
// entao aqui ela e chamada de novo, explicitamente, apos popular o
// localStorage do jsdom com o cenario de cada teste.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { limparStorageOrfao } from './secureAuthStorage'

describe('limparStorageOrfao() — varredura de chaves orfas (PH-50)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://uogmhqbyjgafjujbqdty.supabase.co')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    window.localStorage.clear()
  })

  it('remove sb-<ref>-auth-token de um projeto antigo', () => {
    window.localStorage.setItem('sb-cffbihbmhiuudahsgjsn-auth-token', '{"access_token":"velho"}')
    limparStorageOrfao()
    expect(window.localStorage.getItem('sb-cffbihbmhiuudahsgjsn-auth-token')).toBeNull()
  })

  it('NUNCA remove a chave sb-<ref>-auth-token do projeto atual (sessao teria que sobreviver ao reload)', () => {
    window.localStorage.setItem('sb-uogmhqbyjgafjujbqdty-auth-token', 'enc:token-atual')
    limparStorageOrfao()
    expect(window.localStorage.getItem('sb-uogmhqbyjgafjujbqdty-auth-token')).toBe('enc:token-atual')
  })

  it('remove novo-poke-idle:save (save legado, ninguem le mais)', () => {
    window.localStorage.setItem('novo-poke-idle:save', '{"version":1,"data":{},"savedAt":123}')
    limparStorageOrfao()
    expect(window.localStorage.getItem('novo-poke-idle:save')).toBeNull()
  })

  it('mantem intactas as chaves de preferencia vivas', () => {
    window.localStorage.setItem('novo-poke-idle:tutoriais-vistos', '["intro"]')
    window.localStorage.setItem('novo-poke-idle:hud-scale', '1.2')
    window.localStorage.setItem('novo-poke-idle:vidro-fosco', 'true')
    limparStorageOrfao()
    expect(window.localStorage.getItem('novo-poke-idle:tutoriais-vistos')).toBe('["intro"]')
    expect(window.localStorage.getItem('novo-poke-idle:hud-scale')).toBe('1.2')
    expect(window.localStorage.getItem('novo-poke-idle:vidro-fosco')).toBe('true')
  })

  it('sem VITE_SUPABASE_URL legivel, nao mexe em NENHUMA chave sb-*-auth-token (evita deslogar por engano)', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    window.localStorage.setItem('sb-uogmhqbyjgafjujbqdty-auth-token', 'enc:token-atual')
    window.localStorage.setItem('sb-cffbihbmhiuudahsgjsn-auth-token', '{"access_token":"velho"}')
    limparStorageOrfao()
    expect(window.localStorage.getItem('sb-uogmhqbyjgafjujbqdty-auth-token')).toBe('enc:token-atual')
    expect(window.localStorage.getItem('sb-cffbihbmhiuudahsgjsn-auth-token')).not.toBeNull()
  })

  it('cenario completo: mistura de chaves orfas e vivas, so as orfas somem', () => {
    window.localStorage.setItem('sb-cffbihbmhiuudahsgjsn-auth-token', '{"access_token":"velho"}')
    window.localStorage.setItem('sb-uogmhqbyjgafjujbqdty-auth-token', 'enc:token-atual')
    window.localStorage.setItem('novo-poke-idle:save', '{"version":1}')
    window.localStorage.setItem('novo-poke-idle:hud-scale', '1')
    const removidas = limparStorageOrfao()
    expect(removidas.sort()).toEqual(['novo-poke-idle:save', 'sb-cffbihbmhiuudahsgjsn-auth-token'].sort())
    expect(window.localStorage.getItem('sb-uogmhqbyjgafjujbqdty-auth-token')).toBe('enc:token-atual')
    expect(window.localStorage.getItem('novo-poke-idle:hud-scale')).toBe('1')
  })
})
