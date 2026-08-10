import { describe, expect, it } from 'vitest'
import { farmOfflineSemServidorEhConfiavel } from './GameShell'

describe('farmOfflineSemServidorEhConfiavel (PH-14)', () => {
  it('bloqueia em producao — relogio do dispositivo nao e confiavel sem servidor', () => {
    expect(farmOfflineSemServidorEhConfiavel(true)).toBe(false)
  })

  it('permite fora de producao — unico caminho que funciona sem subir o servico (dev)', () => {
    expect(farmOfflineSemServidorEhConfiavel(false)).toBe(true)
  })
})
