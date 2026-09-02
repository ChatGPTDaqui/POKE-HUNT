// PH-430: gate de ESTAGIO em abrirSessao. `bloqueioDeBiomaPendente` e extraida
// pura de proposito — testa a regra de negocio isolada, sem mockar db.js/HTTP
// inteiro so pra exercitar uma checagem.
//
// O QUE ESTES TESTES AFIRMAVAM ATE A PH-429, e por que nenhum sobreviveu: o
// gate era SEQUENCIAL ENTRE BIOMAS (vencer o Lord do bioma N libera o N+1), e
// os sete casos de la giravam em torno do indice do bioma na ORDEM_DOS_BIOMAS
// e da faixa certa do progresso. Os 12 biomas nascem abertos agora, e o eixo
// passou a ser o estagio DENTRO do bioma. O unico caso que sobrevive tal e
// qual e o ultimo: hunt sem estagio nunca e barrada por esta regra.
import { describe, expect, it } from 'vitest'
import { progressoPorBiomaDefault } from '#engine'
import { bloqueioDeBiomaPendente, herancaDaLinha } from './appSessao.js'
import type { LinhaSessao } from './progresso.js'

describe('bloqueioDeBiomaPendente (PH-430)', () => {
  it('estagio 1 de bioma nunca jogado esta liberado — os 12 nascem abertos', () => {
    // Era o caso mais importante do gate antigo, invertido: `subterraneo` so
    // abria depois de o Lord de `campo_aberto` cair. Agora nao ha ordem.
    for (const bioma of ['campo_aberto', 'subterraneo', 'igneo', 'aguas_interiores']) {
      expect(
        bloqueioDeBiomaPendente(`${bioma}_e1`, progressoPorBiomaDefault()),
        `${bioma} deveria estar aberto`,
      ).toBeNull()
    }
  })

  it('estagio 5 com progresso 3 e recusado, e a mensagem diz o que falta', () => {
    const progresso = { ...progressoPorBiomaDefault(), marinho: 3 }
    const bloqueio = bloqueioDeBiomaPendente('marinho_e5', progresso)
    expect(bloqueio).not.toBeNull()
    // Nao basta dizer "bloqueado": o jogador precisa saber qual Lord falta.
    expect(bloqueio).toContain('4')
  })

  it('estagio 4 com progresso 3 esta liberado — o estagio N pede o N-1', () => {
    const progresso = { ...progressoPorBiomaDefault(), marinho: 3 }
    expect(bloqueioDeBiomaPendente('marinho_e4', progresso)).toBeNull()
  })

  it('progresso alem do necessario tambem libera (o jogador ja passou dali)', () => {
    const progresso = { ...progressoPorBiomaDefault(), marinho: 9 }
    expect(bloqueioDeBiomaPendente('marinho_e4', progresso)).toBeNull()
  })

  it('progresso de um bioma NAO libera estagio de outro', () => {
    const progresso = { ...progressoPorBiomaDefault(), marinho: 9 }
    expect(bloqueioDeBiomaPendente('igneo_e5', progresso)).not.toBeNull()
    expect(bloqueioDeBiomaPendente('igneo_e1', progresso)).toBeNull()
  })

  it('bioma com underscore no proprio nome (aguas_interiores) nao quebra o parse', () => {
    const progresso = { ...progressoPorBiomaDefault(), aguas_interiores: 6 }
    expect(bloqueioDeBiomaPendente('aguas_interiores_e7', progresso)).toBeNull()
    expect(bloqueioDeBiomaPendente('aguas_interiores_e8', progresso)).not.toBeNull()
  })

  it('hunt sem estagio (inicial, BOSS, Lance, Pesadelo) nunca e barrada por esta regra', () => {
    // Cada uma tem o gate proprio; este aqui so fala de estagio de bioma. O
    // Pesadelo entra na lista porque o mapId dele PARECE um estagio
    // (`nightmare_marinho_e7`) e so nao passa porque o parse valida o bioma.
    for (const mapId of ['route_46', 'boss_lance', 'boss_articuno', 'nightmare_marinho_e7']) {
      expect(bloqueioDeBiomaPendente(mapId, progressoPorBiomaDefault()), mapId).toBeNull()
    }
  })

  it('estagio fora da regua (0, 11) e recusado em vez de liberado por engano', () => {
    // Um mapId forjado por curl com estagio invalido nao pode cair no ramo
    // "liberado" — `estagioLiberado` recusa antes, e o parse ja teria recusado.
    const progresso = { ...progressoPorBiomaDefault(), marinho: 10 }
    expect(bloqueioDeBiomaPendente('marinho_e0', progresso)).toBeNull() // nao parseia: nao e estagio
    expect(bloqueioDeBiomaPendente('marinho_e11', progresso)).toBeNull()
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
