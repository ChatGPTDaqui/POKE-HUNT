import { describe, expect, it } from 'vitest'
import {
  BALANCOS_DO_OVO, SUSPENSE_DA_EVOLUCAO, SUSPENSE_DO_OVO, TROCAS_DA_EVOLUCAO, quadroDaEvolucao, quadroDoOvo,
} from './roteiroDaCena'

describe('roteiro da evolucao', () => {
  it('a silhueta troca cada vez mais rapido, sempre dentro do suspense', () => {
    const passos = TROCAS_DA_EVOLUCAO.slice(1).map((t, i) => t - TROCAS_DA_EVOLUCAO[i])
    expect(passos.length).toBeGreaterThan(8)
    for (let i = 1; i < passos.length; i++) expect(passos[i]).toBeLessThanOrEqual(passos[i - 1] + 1e-9)
    expect(TROCAS_DA_EVOLUCAO.at(-1)!).toBeLessThan(SUSPENSE_DA_EVOLUCAO)
  })

  it('comeca colorido, vira silhueta e so mostra a forma nova depois de trocar', () => {
    expect(quadroDaEvolucao(0.1, null, false)).toMatchObject({ forma: 'antiga', texto: 'evoluindo' })
    expect(quadroDaEvolucao(0.1, null, false).branco).toBe(0)
    expect(quadroDaEvolucao(1.5, null, false).branco).toBeGreaterThan(0.85)
    expect(quadroDaEvolucao(TROCAS_DA_EVOLUCAO[0] + 0.01, null, false).forma).toBe('nova')
  })

  it('sem resposta do servidor, nao revela: segue em suspense', () => {
    expect(quadroDaEvolucao(SUSPENSE_DA_EVOLUCAO + 3, null, false).texto).toBe('evoluindo')
  })

  it('revela a forma nova com clarao, e volta pra antiga se o servidor recusou', () => {
    const ok = quadroDaEvolucao(6, 5.95, false)
    expect(ok).toMatchObject({ forma: 'nova', texto: 'evoluiu' })
    expect(ok.clarao).toBeGreaterThan(0.5)
    expect(quadroDaEvolucao(8, 5.95, false).branco).toBe(0)
    const recusou = quadroDaEvolucao(7, 5.95, true)
    expect(recusou).toMatchObject({ forma: 'antiga', texto: 'parou', clarao: 0 })
  })

  it('movimento reduzido nao pisca nem alterna', () => {
    for (let t = 0; t < 1; t += 0.05) expect(quadroDaEvolucao(t, null, false, true).forma).toBe('antiga')
    expect(quadroDaEvolucao(1.2, 1, false, true).clarao).toBe(0)
  })
})

describe('roteiro do ovo', () => {
  it('as pausas entre os balancos encurtam', () => {
    const pausas = BALANCOS_DO_OVO.slice(1).map((t, i) => t - BALANCOS_DO_OVO[i])
    for (let i = 1; i < pausas.length; i++) expect(pausas[i]).toBeLessThan(pausas[i - 1])
    expect(BALANCOS_DO_OVO.at(-1)!).toBeLessThan(SUSPENSE_DO_OVO)
  })

  it('as trincas aparecem aos poucos e o ovo fica parado entre os balancos', () => {
    expect(quadroDoOvo(0.5, null, false)).toMatchObject({ trincas: 0, angulo: 0, texto: 'oh' })
    expect(quadroDoOvo(2.5, null, false).trincas).toBe(1)
    expect(quadroDoOvo(4.35, null, false).trincas).toBe(3)
    expect(Math.abs(quadroDoOvo(BALANCOS_DO_OVO[0] + 0.1, null, false).angulo)).toBeGreaterThan(5)
  })

  it('abre, clareia e o bebe entra; erro nao mostra bebe', () => {
    const q = quadroDoOvo(5, 4.5, false)
    expect(q).toMatchObject({ texto: 'nasceu' })
    expect(q.abertura).toBeGreaterThan(0.5)
    expect(q.bebe).toBeGreaterThan(0)
    expect(quadroDoOvo(5, 4.5, true)).toMatchObject({ texto: 'erro', bebe: 0 })
  })
})
