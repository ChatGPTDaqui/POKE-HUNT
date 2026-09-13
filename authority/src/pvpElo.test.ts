import { describe, expect, it } from 'vitest'
import { calcularResultadoRanqueado, ESCADA_DIVISOES, type EntradaJogador } from './pvpElo.js'

function jogador(overrides: Partial<EntradaJogador> = {}): EntradaJogador {
  return { mmr: 1000, partidas: 20, pdl: 50, divisao: 'ouro_2', ...overrides }
}

describe('calcularResultadoRanqueado', () => {
  it('mmr iguais: vencedor ganha, perdedor perde, soma zero (K simetrico)', () => {
    const r = calcularResultadoRanqueado(jogador(), jogador(), 'vitoria')
    expect(r.anfitriao.mmr).toBeGreaterThan(1000)
    expect(r.convidado.mmr).toBeLessThan(1000)
    expect(r.anfitriao.mmr - 1000).toBe(1000 - r.convidado.mmr)
  })

  it('empate nao muda PDL nem MMR de ninguem com mmr igual', () => {
    const r = calcularResultadoRanqueado(jogador(), jogador(), 'empate')
    expect(r.anfitriao.mmr).toBe(1000)
    expect(r.convidado.mmr).toBe(1000)
    expect(r.anfitriao.pdlDelta).toBe(0)
    expect(r.convidado.pdlDelta).toBe(0)
  })

  it('azarao (mmr bem menor) ganha mais PDL vencendo que o favorito perderia', () => {
    const azarao = jogador({ mmr: 700 })
    const favorito = jogador({ mmr: 1300 })
    const r = calcularResultadoRanqueado(azarao, favorito, 'vitoria')
    expect(r.anfitriao.pdlDelta).toBeGreaterThan(15)
    expect(r.anfitriao.pdlDelta).toBeLessThanOrEqual(25)
  })

  it('favorito vencendo azarao ganha o minimo de PDL (15)', () => {
    const favorito = jogador({ mmr: 1300 })
    const azarao = jogador({ mmr: 700 })
    const r = calcularResultadoRanqueado(favorito, azarao, 'vitoria')
    expect(r.anfitriao.pdlDelta).toBe(15)
  })

  it('K-factor maior nas primeiras 10 partidas (placement) que depois', () => {
    const novato = jogador({ partidas: 3 })
    const veterano = jogador({ partidas: 50 })
    const rNovato = calcularResultadoRanqueado(novato, jogador(), 'vitoria')
    const rVeterano = calcularResultadoRanqueado(veterano, jogador(), 'vitoria')
    expect(rNovato.anfitriao.mmr - novato.mmr).toBeGreaterThan(rVeterano.anfitriao.mmr - veterano.mmr)
  })

  it('mmr nunca cai abaixo do minimo mesmo perdendo muito', () => {
    const fraco = jogador({ mmr: 105, partidas: 2 })
    const forte = jogador({ mmr: 2000, partidas: 2 })
    const r = calcularResultadoRanqueado(fraco, forte, 'derrota')
    expect(r.anfitriao.mmr).toBeGreaterThanOrEqual(100)
  })

  it('PDL >= 100 promove pra proxima divisao e sobra o resto', () => {
    const quaseSubindo = jogador({ divisao: 'bronze_1', pdl: 90, mmr: 700 })
    const r = calcularResultadoRanqueado(quaseSubindo, jogador({ mmr: 500 }), 'vitoria')
    expect(r.anfitriao.divisao).toBe('bronze_2')
    expect(r.anfitriao.pdl).toBeGreaterThanOrEqual(0)
    expect(r.anfitriao.pdl).toBeLessThan(100)
  })

  it('PDL < 0 rebaixa pra divisao anterior, exceto no piso (bronze_1)', () => {
    const quaseCaindo = jogador({ divisao: 'prata_1', pdl: 5, mmr: 500 })
    const r = calcularResultadoRanqueado(quaseCaindo, jogador({ mmr: 700 }), 'derrota')
    expect(r.anfitriao.divisao).toBe('bronze_3')
  })

  it('bronze_1 nao rebaixa abaixo do piso: PDL trava em 0', () => {
    const piso = jogador({ divisao: 'bronze_1', pdl: 5, mmr: 400 })
    const r = calcularResultadoRanqueado(piso, jogador({ mmr: 700 }), 'derrota')
    expect(r.anfitriao.divisao).toBe('bronze_1')
    expect(r.anfitriao.pdl).toBe(0)
  })

  it('mestre (topo da escada) nunca promove, so acumula PDL sem teto de divisao', () => {
    const mestre = jogador({ divisao: 'mestre', pdl: 95, mmr: 2200 })
    const r = calcularResultadoRanqueado(mestre, jogador({ mmr: 2200 }), 'vitoria')
    expect(r.anfitriao.divisao).toBe('mestre')
    expect(r.anfitriao.pdl).toBeGreaterThanOrEqual(95)
  })

  it('ESCADA_DIVISOES tem bronze_1 primeiro e mestre por ultimo', () => {
    expect(ESCADA_DIVISOES[0]).toBe('bronze_1')
    expect(ESCADA_DIVISOES.at(-1)).toBe('mestre')
  })
})
