import { describe, expect, it } from 'vitest'
import { farmOfflineSemServidorEhConfiavel, deveSerPessimista } from './GameShell'
import { LIMIAR_OFFLINE_SEGUNDOS } from '@/engine/simulation'

describe('farmOfflineSemServidorEhConfiavel (PH-14)', () => {
  it('bloqueia em producao — relogio do dispositivo nao e confiavel sem servidor', () => {
    expect(farmOfflineSemServidorEhConfiavel(true)).toBe(false)
  })

  it('permite fora de producao — unico caminho que funciona sem subir o servico (dev)', () => {
    expect(farmOfflineSemServidorEhConfiavel(false)).toBe(true)
  })
})

describe('deveSerPessimista (PH-15)', () => {
  it('gap curto (jogo ao vivo/rede atrasada) nao liga o modo pessimista', () => {
    expect(deveSerPessimista(LIMIAR_OFFLINE_SEGUNDOS - 1)).toBe(false)
  })

  it('gap acima do limiar (ausencia real) liga o modo pessimista — mesmo limiar do servidor', () => {
    expect(deveSerPessimista(LIMIAR_OFFLINE_SEGUNDOS + 1)).toBe(true)
  })
})
