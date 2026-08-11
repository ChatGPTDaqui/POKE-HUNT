import { describe, expect, it } from 'vitest'
import { farmOfflineSemServidorEhConfiavel, deveSerPessimista, segundosCatchUpEfetivos } from './GameShell'
import { LIMIAR_OFFLINE_SEGUNDOS, OFFLINE_FARM_MAX_HOURS } from '@/engine/simulation'

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

describe('segundosCatchUpEfetivos (PH-16)', () => {
  const TETO_SEGUNDOS = OFFLINE_FARM_MAX_HOURS * 3600

  it('gap dentro do teto passa direto', () => {
    expect(segundosCatchUpEfetivos(TETO_SEGUNDOS - 1)).toBe(TETO_SEGUNDOS - 1)
  })

  it('tampa fechada por dias: gap gigante e cortado no mesmo teto do farm offline oficial', () => {
    const dezDias = 10 * 24 * 3600
    expect(segundosCatchUpEfetivos(dezDias)).toBe(TETO_SEGUNDOS)
  })
})
