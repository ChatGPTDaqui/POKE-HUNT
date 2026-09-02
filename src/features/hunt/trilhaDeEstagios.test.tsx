// @vitest-environment jsdom
//
// PH-431 — a navegacao do mundo em dois niveis, e a trilha.
//
// O QUE ESTES TESTES SEGURAM, e por que cada um. A tela e a unica superficie
// onde as duas mecanicas do redesenho ficam visiveis, e as duas falham em
// silencio se a tela mentir:
//
//   1. O bioma AFUNDA. Se a porcentagem de sub-bioma exibida nao for a MESMA
//      que o sorteio de sala usa, o jogador escolhe o estagio 10 do Marinho
//      esperando Leito Oceanico e recebe Praia. Nada estoura: ele so acha que o
//      jogo mente.
//   2. A cacada e DIRECIONADA. Se o estado do no nao distinguir "limpo" de
//      "bloqueado", voltar a um estagio antigo — que e o ponto do desenho —
//      parece retrocesso em vez de escolha.
//
// E o gate: a mensagem de bloqueio da tela tem que ser a MESMA que o servidor
// devolve. Quando as duas eram escritas a mao em arquivos diferentes (PH-227/
// 229), a nota de cada um pedia que ninguem as deixasse divergir.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BIOMAS, BIOMA_POR_CHAVE } from '@/data/biomas'
import { ESTAGIOS_POR_BIOMA, estagioId, pesosDoEstagio } from '@/data/estagios'
import { bloqueioDoEstagio, progressoPorBiomaDefault } from '@/data/progressoDeBioma'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { useUiStore } from '@/stores/uiStore'
import { HuntMenu } from './HuntMenu'
import {
  BIOMA_RECOMENDADO, composicaoDoEstagio, especiesDoEstagio, estadoDoEstagio,
} from './TrilhaDeEstagios'

function comEquipe(progresso = progressoPorBiomaDefault()) {
  useGameStateStore.setState({
    team: [{ uid: 'p1', speciesId: 'charmander', level: 5, hp: 20, maxHp: 20 }],
    activeIndex: 0,
    unlockedMaps: [],
    unlockedContinents: ['biomas'],
    biomaProgress: progresso,
  } as never, false)
  useWorldStore.setState({ mapDef: null } as never, false)
  useUiStore.setState({ huntContinent: 'biomas', huntSearchTerm: '', huntType: 'all' } as never, false)
}

beforeEach(() => { comEquipe() })
afterEach(() => { cleanup() })

describe('estadoDoEstagio (a regra por tras do no)', () => {
  it('separa limpo, atual, liberado e bloqueado', () => {
    const p = { ...progressoPorBiomaDefault(), marinho: 3 }
    expect(estadoDoEstagio(p, 'marinho', 1)).toBe('limpo')
    expect(estadoDoEstagio(p, 'marinho', 3)).toBe('limpo')
    // O PROXIMO a fazer tem estado proprio: sem ele o jogador precisa ler os
    // dez nos pra achar onde continuar.
    expect(estadoDoEstagio(p, 'marinho', 4)).toBe('atual')
    expect(estadoDoEstagio(p, 'marinho', 5)).toBe('bloqueado')
  })

  it('bioma nunca jogado tem o estagio 1 como atual, e os outros bloqueados', () => {
    const p = progressoPorBiomaDefault()
    expect(estadoDoEstagio(p, 'igneo', 1)).toBe('atual')
    for (let e = 2; e <= ESTAGIOS_POR_BIOMA; e++) {
      expect(estadoDoEstagio(p, 'igneo', e), `estagio ${e}`).toBe('bloqueado')
    }
  })
})

describe('a composicao exibida e a que o jogo sorteia', () => {
  it('sai da MESMA funcao que o sorteio de sala consome, nos 120 estagios', () => {
    // Se a tela recalculasse a porcentagem por conta propria, ela poderia
    // divergir do motor sem nada quebrar — e o jogador so descobriria caçando.
    for (const bioma of BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        const daTela = composicaoDoEstagio(bioma, e)
        const doMotor = pesosDoEstagio(bioma, e)
        for (const s of daTela) {
          expect(s.pct, `${bioma.chave} e${e} ${s.chave}`).toBeCloseTo(doMotor[s.chave] * 100, 6)
        }
        // A soma do que a tela mostra fecha 100%: o que ela esconde e so o
        // sub-bioma de peso zero, que nao e sorteado neste estagio.
        const soma = daTela.reduce((a, s) => a + s.pct, 0)
        expect(soma, `${bioma.chave} e${e}`).toBeCloseTo(100, 4)
      }
    }
  })

  it('o Marinho AFUNDA na leitura da trilha: Praia some, Leito domina', () => {
    // O caso que o redesenho usa como exemplo. Se a tela nao mostrar isso, a
    // alavanca de imersao inteira fica invisivel.
    const marinho = BIOMA_POR_CHAVE['marinho']
    const primeiro = composicaoDoEstagio(marinho, 1)
    const ultimo = composicaoDoEstagio(marinho, ESTAGIOS_POR_BIOMA)

    expect(primeiro.some((s) => s.chave === 'beach')).toBe(true)
    expect(primeiro.some((s) => s.chave === 'seabed')).toBe(false)
    // Praia sumiu da lista do fundo, e o Leito e o primeiro (a lista vem
    // ordenada do maior pro menor).
    expect(ultimo.some((s) => s.chave === 'beach')).toBe(false)
    expect(ultimo[0].chave).toBe('seabed')
    expect(ultimo[0].pct).toBeGreaterThan(50)
  })

  it('todo estagio tem elenco pra mostrar', () => {
    // Um no que abre e nao lista POKE nenhum le como bug, e seria: a guarda de
    // pool vazio (hunts.test.ts) ja garante que nao acontece, mas a tela usa
    // outro caminho pra chegar na lista.
    for (const bioma of BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        const especies = especiesDoEstagio(estagioId(bioma.chave, e))
        expect(especies.length, `${bioma.chave} e${e}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('navegacao em dois niveis', () => {
  it('o nivel 1 mostra os 12 biomas, e nao as 120 hunts', () => {
    render(<HuntMenu />)
    for (const bioma of BIOMAS) {
      expect(screen.getByText(bioma.nome), bioma.chave).toBeTruthy()
    }
    // Nenhum cartao de estagio de bioma na lista — eles moram na trilha.
    expect(screen.queryByText('Marinho 4')).toBeNull()
    expect(screen.queryByText('Mata 1')).toBeNull()
  })

  it('marca UM bioma como recomendado pra conta nova, e nao doze', () => {
    render(<HuntMenu />)
    expect(screen.getAllByText('COMECE AQUI').length).toBe(1)
    const recomendado = BIOMA_POR_CHAVE[BIOMA_RECOMENDADO]
    expect(recomendado).toBeTruthy()
  })

  it('clicar no bioma abre a trilha dele, com os 10 estagios, e da pra voltar', async () => {
    const user = userEvent.setup()
    render(<HuntMenu />)

    await user.click(screen.getByText('Marinho'))

    for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
      expect(screen.getByText(`Estágio ${e}`), `estagio ${e}`).toBeTruthy()
    }
    // A trilha e do bioma escolhido, e so dele.
    expect(screen.queryByText('Mata')).toBeNull()

    await user.click(screen.getByText('← Biomas'))
    expect(screen.getByText('Mata')).toBeTruthy()
  })
})

describe('os estados do no na tela', () => {
  it('o estagio limpo aparece como farm livre e o bloqueado diz o que falta', async () => {
    const user = userEvent.setup()
    comEquipe({ ...progressoPorBiomaDefault(), marinho: 3 })
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))

    // Tres limpos.
    expect(screen.getAllByText('LIMPO · FARM LIVRE').length).toBe(3)
    // Um "continue aqui" — o proximo.
    expect(screen.getAllByText('CONTINUE AQUI').length).toBe(1)

    // E o bloqueado mostra a MESMA mensagem que o servidor devolveria.
    const doServidor = bloqueioDoEstagio(
      { ...progressoPorBiomaDefault(), marinho: 3 }, 'marinho', 5,
    )
    expect(doServidor).toBeTruthy()
    expect(screen.getAllByText(doServidor!).length).toBeGreaterThan(0)
  })

  it('o estagio bloqueado nao tem botao de entrar clicavel', async () => {
    const user = userEvent.setup()
    comEquipe({ ...progressoPorBiomaDefault(), marinho: 1 })
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))

    const bloqueados = screen.getAllByRole('button', { name: 'Bloqueado' })
    // Estagios 3 a 10 estao bloqueados com progresso 1.
    expect(bloqueados.length).toBe(8)
    for (const b of bloqueados) expect((b as HTMLButtonElement).disabled).toBe(true)
  })

  it('abrir um no mostra a composicao e o elenco daquele estagio', async () => {
    const user = userEvent.setup()
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))
    await user.click(screen.getByText('Estágio 1'))

    const doEstagio = composicaoDoEstagio(BIOMA_POR_CHAVE['marinho'], 1)
    const detalhe = screen.getByText(/POKEs deste estágio/)
    expect(detalhe).toBeTruthy()
    // A porcentagem do maior sub-bioma aparece escrita, nao so no resumo.
    const maior = doEstagio[0]
    expect(screen.getAllByText(new RegExp(`${maior.nome}`)).length).toBeGreaterThan(0)
  })
})

describe('a hunt em andamento continua visivel na trilha', () => {
  it('o no da hunt ativa troca o botao pra "Voltar"', async () => {
    const user = userEvent.setup()
    comEquipe({ ...progressoPorBiomaDefault(), marinho: 5 })
    useWorldStore.setState({ mapDef: { id: estagioId('marinho', 2) } } as never, false)
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))

    expect(screen.getByText('EM CAÇADA')).toBeTruthy()
    const no = screen.getByText('Estágio 2').closest('div')!
    expect(within(no.parentElement!.parentElement!).getByRole('button', { name: 'Voltar' })).toBeTruthy()
  })
})
