import { describe, expect, it } from 'vitest'
import { BIOMAS } from './biomas'
import { marcosDaJornada, proximoBioma } from './jornada'

describe('jornada do treinador', () => {
  it('conta nova tem metas sem inventar progresso', () => {
    expect(marcosDaJornada({}, false).every(m => m.atual === 0)).toBe(true)
    expect(proximoBioma({}, 1)?.chave).toBe(BIOMAS[0].chave)
  })
  it('preparação libera o marco de Lance, mas não presume vitória', () => {
    const progresso = Object.fromEntries(BIOMAS.map(b => [b.chave, 5]))
    const marcos = marcosDaJornada(progresso, false)
    expect(marcos.find(m => m.id === 'preparacao')?.atual).toBe(BIOMAS.length)
    expect(marcos.find(m => m.id === 'lance')?.atual).toBe(0)
    expect(marcos.find(m => m.id === 'pesadelo')?.atual).toBe(0)
  })
  it('vitória sobre Lance não concede estágios do Mundo ou Pesadelo', () => {
    const marcos = marcosDaJornada({}, true)
    expect(marcos.find(m => m.id === 'lance')?.atual).toBe(1)
    expect(marcos.find(m => m.id === 'mundo')?.atual).toBe(0)
    expect(marcos.find(m => m.id === 'dominio')?.atual).toBe(0)
  })
  it('reconhece saves antigos avançados sem resgate ou regressão', () => {
    const progresso = Object.fromEntries(BIOMAS.flatMap(b => [[b.chave, 10], [`nightmare_${b.chave}`, 10]]))
    expect(marcosDaJornada(progresso, true).every(m => m.atual === m.alvo)).toBe(true)
    expect(proximoBioma(progresso, 10)).toBeNull()
  })
  it('sugere próximo estágio de um bioma avançado sem saltar gates', () => {
    const progresso = { [BIOMAS[0].chave]: 2, [BIOMAS[1].chave]: 4, [BIOMAS[2].chave]: 5 }
    expect(proximoBioma(progresso, 5)?.chave).toBe(BIOMAS[1].chave)
    expect(proximoBioma(progresso, 1, true)?.chave).toBe(BIOMAS[0].chave)
  })
  it('dados inválidos não completam marcos', () => {
    expect(marcosDaJornada({ [BIOMAS[0].chave]: Number.NaN }, false)[0].atual).toBe(0)
  })
})
