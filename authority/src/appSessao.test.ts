// PH-227: gate sequencial de bioma em abrirSessao. `bloqueioDeBiomaPendente`
// e extraida pura de proposito — testa a regra de negocio isolada, sem
// mockar db.js/HTTP inteiro so pra exercitar uma checagem de indice.
import { describe, expect, it } from 'vitest'
import { biomaProgressDefault } from '#engine'
import { bloqueioDeBiomaPendente } from './appSessao.js'

describe('bloqueioDeBiomaPendente (PH-227)', () => {
  it('primeiro bioma da ordem (campo_aberto, indice 0) libera automatico', () => {
    expect(bloqueioDeBiomaPendente('campo_aberto_faixa1', 'faixa1', biomaProgressDefault())).toBeNull()
  })

  it('bioma seguinte (subterraneo, indice 1) bloqueado com biomaProgress zerado', () => {
    const bloqueio = bloqueioDeBiomaPendente('subterraneo_faixa1', 'faixa1', biomaProgressDefault())
    expect(bloqueio).not.toBeNull()
    expect(bloqueio).toContain('Campo Aberto') // nome do bioma ANTERIOR (indice 0)
  })

  it('bioma seguinte libera quando biomaProgress ja bate com o indice esperado', () => {
    const progresso = { ...biomaProgressDefault(), faixa1: 1 }
    expect(bloqueioDeBiomaPendente('subterraneo_faixa1', 'faixa1', progresso)).toBeNull()
  })

  it('progresso alem do necessario tambem libera (jogador ja passou dali)', () => {
    const progresso = { ...biomaProgressDefault(), faixa1: 5 }
    expect(bloqueioDeBiomaPendente('subterraneo_faixa1', 'faixa1', progresso)).toBeNull()
  })

  it('bioma com underscore no proprio nome (aguas_interiores) nao quebra o parse do sufixo', () => {
    // aguas_interiores e indice 5 na ordem — precisa de faixa1=5 pra liberar.
    const bloqueado = bloqueioDeBiomaPendente('aguas_interiores_faixa1', 'faixa1', biomaProgressDefault())
    expect(bloqueado).not.toBeNull()

    const liberado = bloqueioDeBiomaPendente(
      'aguas_interiores_faixa1', 'faixa1', { ...biomaProgressDefault(), faixa1: 5 },
    )
    expect(liberado).toBeNull()
  })

  it('faixas sao independentes — progresso da faixa1 nao libera nada na faixa2', () => {
    const progresso = { ...biomaProgressDefault(), faixa1: 5 }
    const bloqueio = bloqueioDeBiomaPendente('subterraneo_faixa2', 'faixa2', progresso)
    expect(bloqueio).not.toBeNull()
  })

  it('mapId de bioma sem boss habilitado (fora de ORDEM_DOS_BIOMAS) libera automatico', () => {
    // Modo Pesadelo/BOSS nao seguem o padrao huntId(bioma, faixa) — indice
    // -1, nunca bloqueia (defesa: sem boss, nao ha o que exigir).
    expect(bloqueioDeBiomaPendente('boss_lance', 'nightmare', biomaProgressDefault())).toBeNull()
  })
})
