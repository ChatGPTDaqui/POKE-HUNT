// PH-227: gate sequencial de bioma em abrirSessao. `bloqueioDeBiomaPendente`
// e extraida pura de proposito — testa a regra de negocio isolada, sem
// mockar db.js/HTTP inteiro so pra exercitar uma checagem de indice.
import { describe, expect, it } from 'vitest'
import { biomaProgressDefault } from '#engine'
import { bloqueioDeBiomaPendente, herancaDaLinha } from './appSessao.js'
import type { LinhaSessao } from './progresso.js'

describe('bloqueioDeBiomaPendente (PH-227)', () => {
  it('primeiro bioma da ordem (campo_aberto, indice 0) libera automatico', () => {
    expect(bloqueioDeBiomaPendente('campo_aberto_e1', 'faixa1', biomaProgressDefault())).toBeNull()
  })

  it('bioma seguinte (subterraneo, indice 1) bloqueado com biomaProgress zerado', () => {
    const bloqueio = bloqueioDeBiomaPendente('subterraneo_e1', 'faixa1', biomaProgressDefault())
    expect(bloqueio).not.toBeNull()
    expect(bloqueio).toContain('Campo Aberto') // nome do bioma ANTERIOR (indice 0)
  })

  it('bioma seguinte libera quando biomaProgress ja bate com o indice esperado', () => {
    const progresso = { ...biomaProgressDefault(), faixa1: 1 }
    expect(bloqueioDeBiomaPendente('subterraneo_e1', 'faixa1', progresso)).toBeNull()
  })

  it('progresso alem do necessario tambem libera (jogador ja passou dali)', () => {
    const progresso = { ...biomaProgressDefault(), faixa1: 5 }
    expect(bloqueioDeBiomaPendente('subterraneo_e1', 'faixa1', progresso)).toBeNull()
  })

  it('bioma com underscore no proprio nome (aguas_interiores) nao quebra o parse do sufixo', () => {
    // aguas_interiores e indice 5 na ordem — precisa de faixa1=5 pra liberar.
    const bloqueado = bloqueioDeBiomaPendente('aguas_interiores_e1', 'faixa1', biomaProgressDefault())
    expect(bloqueado).not.toBeNull()

    const liberado = bloqueioDeBiomaPendente(
      'aguas_interiores_e1', 'faixa1', { ...biomaProgressDefault(), faixa1: 5 },
    )
    expect(liberado).toBeNull()
  })

  it('faixas sao independentes — progresso da faixa1 nao libera nada na faixa2', () => {
    const progresso = { ...biomaProgressDefault(), faixa1: 5 }
    const bloqueio = bloqueioDeBiomaPendente('subterraneo_e4', 'faixa2', progresso)
    expect(bloqueio).not.toBeNull()
  })

  it('mapId de bioma sem protetor habilitado (fora de ORDEM_DOS_BIOMAS) libera automatico', () => {
    // Modo Pesadelo/BOSS nao seguem o padrao huntId(bioma, faixa) — indice
    // -1, nunca bloqueia (defesa: sem protetor, nao ha o que exigir).
    expect(bloqueioDeBiomaPendente('boss_lance', 'nightmare', biomaProgressDefault())).toBeNull()
  })
})

// PH-266: F5 no meio da hunt tem que voltar NA MESMA SALA.
//
// `/sessao/abrir` sempre gravava sala 1 / ciclo 1 / 0 abates, e o boot fecha a
// sessao pendente antes de reentrar (bootDaSessao.ts) — entao recarregar a
// pagina na sala 7 devolvia o jogador pra sala 1. A regra que decide se herda e
// pura de proposito (`herancaDaLinha`); o filtro de MAPA fica no `where` da
// consulta e nao aparece aqui.
describe('herancaDaLinha (PH-266)', () => {
  const AGORA = Date.parse('2026-08-29T12:00:00.000Z')

  function linha(patch: Partial<LinhaSessao> = {}): LinhaSessao {
    return {
      id: 's1', user_id: 'u1', map_id: 'mata_e1',
      sala_indice: 6, sala_chave: 'obra', sala_abates: 17, ciclos: 2,
      closed_at: new Date(AGORA - 3000).toISOString(),
      sala_protetor: null,
    } as unknown as LinhaSessao & typeof patch
  }

  it('herda sala, contagem de abates e ciclo da sessao recem-fechada', () => {
    const heranca = herancaDaLinha(linha(), AGORA)
    // Os quatro campos juntos: herdar so o indice devolveria o jogador pra sala
    // certa com a quota zerada, que e outra perda de progresso.
    expect(heranca?.sala).toEqual({ indice: 6, chave: 'obra', abates: 17, ciclos: 2 })
  })

  it('nao herda de sessao fechada ha mais de 5 minutos', () => {
    const velha = { ...linha(), closed_at: new Date(AGORA - 6 * 60 * 1000).toISOString() }
    expect(herancaDaLinha(velha as LinhaSessao, AGORA)).toBeNull()
  })

  it('herda de sessao ainda aberta (closed_at nulo) — e a mais recente possivel', () => {
    const aberta = { ...linha(), closed_at: null }
    expect(herancaDaLinha(aberta as LinhaSessao, AGORA)?.sala.indice).toBe(6)
  })

  it('sem sala gravada (hunt sem salas: inicial, BOSS, Lance) nao herda nada', () => {
    const semSala = { ...linha(), sala_chave: null }
    expect(herancaDaLinha(semSala as LinhaSessao, AGORA)).toBeNull()
  })

  it('sem sessao anterior nenhuma nao herda nada', () => {
    expect(herancaDaLinha(undefined, AGORA)).toBeNull()
  })

  it('data de fechamento ilegivel nao herda — o lado seguro e o comportamento antigo', () => {
    const torta = { ...linha(), closed_at: 'nao e uma data' }
    expect(herancaDaLinha(torta as LinhaSessao, AGORA)).toBeNull()
  })

  it('o protetor pendente vem junto com a sala', () => {
    // Sem isto, dar F5 no meio da luta contra o Guardian herdaria a sala e
    // APAGARIA o protetor — trocaria a perda de progresso por um jeito de se
    // livrar do bicho.
    const comProtetor = {
      ...linha(),
      sala_protetor: { session_id: 's1', uid: 'p1', species_id: 'onix', hp_atual: 42 },
    }
    const heranca = herancaDaLinha(comProtetor as unknown as LinhaSessao, AGORA)
    expect(heranca?.protetor?.uid).toBe('p1')
    expect(heranca?.protetor?.hp_atual).toBe(42)
  })
})
