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
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BIOMAS, BIOMA_POR_CHAVE } from '@/data/biomas'
import { ESTAGIOS_POR_BIOMA, estagioId, pesosDoEstagio } from '@/data/estagios'
import { bloqueioDoEstagio, progressoPorBiomaDefault } from '@/data/progressoDeBioma'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { useUiStore } from '@/stores/uiStore'
import { HuntMenu } from './HuntMenu'
import {
  BIOMA_RECOMENDADO, CAMINHO_PADRAO, caminhoDoBioma, composicaoDoEstagio,
  especiesDoEstagio, estadoDoEstagio,
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
    expect(BIOMA_POR_CHAVE[BIOMA_RECOMENDADO]).toBeTruthy()
  })

  it('clicar no bioma abre a trilha dele, com os 10 nos, e da pra voltar', async () => {
    const user = userEvent.setup()
    render(<HuntMenu />)

    await user.click(screen.getByText('Marinho'))

    // PH-442: os estagios sao NOS sobre o mapa, e nao dez cartoes empilhados.
    // O nome de cada um vem do `aria-label` — o no desenha so o numero.
    for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
      expect(screen.getByRole('button', { name: `Estágio ${e}` }), `no ${e}`).toBeTruthy()
    }
    // A trilha e do bioma escolhido, e so dele.
    expect(screen.queryByText('Mata')).toBeNull()

    await user.click(screen.getByText('← Biomas'))
    expect(screen.getByText('Mata')).toBeTruthy()
  })
})

// PH-442: A FORMA E O PONTO DESTA ISSUE, entao ela precisa de teste proprio.
// Uma lista vertical passaria em todo teste de conteudo acima — o que distingue
// as duas e onde os nos estao, e so isso pega uma regressao pra lista.
describe('a trilha e ESPACIAL, e nao uma lista', () => {
  it('os 10 nos ficam posicionados sobre o mapa, cada um num lugar diferente', async () => {
    const user = userEvent.setup()
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))

    const posicoes = new Set<string>()
    for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
      const no = screen.getByRole('button', { name: `Estágio ${e}` }) as HTMLElement
      // Posicao absoluta em % — numa lista, `left`/`top` nem existiriam.
      expect(no.style.left, `no ${e} sem left`).toMatch(/%$/)
      expect(no.style.top, `no ${e} sem top`).toMatch(/%$/)
      posicoes.add(`${no.style.left}|${no.style.top}`)
    }
    // Dez lugares DISTINTOS: dois nos no mesmo ponto seriam invisiveis um sobre
    // o outro, e um caminho reto vertical (todos com o mesmo `left`) e
    // literalmente a lista que esta issue substitui.
    expect(posicoes.size).toBe(ESTAGIOS_POR_BIOMA)
    const colunas = new Set([...posicoes].map((p) => p.split('|')[0]))
    expect(colunas.size, 'todos os nos na mesma coluna: isso e uma lista').toBeGreaterThan(3)
  })

  it('o caminho DESCE, na mesma direcao em que o bioma afunda', () => {
    // As artes foram desenhadas com o raso em cima e o fundo embaixo. Um
    // caminho que subisse poria o estagio 10 na praia — a arte contando o
    // contrario da mecanica.
    for (let i = 1; i < CAMINHO_PADRAO.length; i++) {
      expect(CAMINHO_PADRAO[i][1], `no ${i + 1} nao desce`).toBeGreaterThan(CAMINHO_PADRAO[i - 1][1])
    }
  })

  it('todo no cabe dentro do mapa, com folga pro corte da arte', () => {
    // A arte e quadrada e a caixa e 4/3, entao `object-cover` corta topo e
    // base. No colado na borda cairia no pedaco cortado.
    for (const [x, y] of CAMINHO_PADRAO) {
      expect(x).toBeGreaterThanOrEqual(0.08)
      expect(x).toBeLessThanOrEqual(0.92)
      expect(y).toBeGreaterThanOrEqual(0.08)
      expect(y).toBeLessThanOrEqual(0.92)
    }
  })

  it('ha um caminho por bioma, sempre com 10 pontos', () => {
    for (const bioma of BIOMAS) {
      expect(caminhoDoBioma(bioma.chave).length, bioma.chave).toBe(ESTAGIOS_POR_BIOMA)
    }
  })
})

describe('o painel de detalhe do estagio', () => {
  it('abre no estagio ATUAL, sem o jogador precisar clicar', async () => {
    const user = userEvent.setup()
    comEquipe({ ...progressoPorBiomaDefault(), marinho: 3 })
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))

    // Progresso 3 -> o painel ja mostra o estagio 4, que e onde continuar.
    expect(screen.getByText('Estágio 4')).toBeTruthy()
    expect(screen.getByText('CONTINUE AQUI')).toBeTruthy()
    expect(screen.getByText('Lv 31-40')).toBeTruthy()
  })

  it('clicar num no troca o painel pra aquele estagio', async () => {
    const user = userEvent.setup()
    comEquipe({ ...progressoPorBiomaDefault(), marinho: 3 })
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))

    await user.click(screen.getByRole('button', { name: 'Estágio 1' }))
    expect(screen.getByText('Estágio 1')).toBeTruthy()
    expect(screen.getByText('LIMPO · FARM LIVRE')).toBeTruthy()
    expect(screen.getByText('Lv 1-10')).toBeTruthy()
  })

  it('o estagio bloqueado diz o que falta, com a MESMA mensagem do servidor', async () => {
    const user = userEvent.setup()
    const progresso = { ...progressoPorBiomaDefault(), marinho: 3 }
    comEquipe(progresso)
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))
    await user.click(screen.getByRole('button', { name: 'Estágio 7' }))

    const doServidor = bloqueioDoEstagio(progresso, 'marinho', 7)
    expect(doServidor).toBeTruthy()
    expect(screen.getByText(doServidor!)).toBeTruthy()
    // E o botao de entrar nao aceita clique.
    const entrar = screen.getByRole('button', { name: 'Bloqueado' }) as HTMLButtonElement
    expect(entrar.disabled).toBe(true)
  })

  it('mostra a composicao de sub-bioma e o elenco do estagio selecionado', async () => {
    const user = userEvent.setup()
    comEquipe({ ...progressoPorBiomaDefault(), marinho: 9 })
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))
    await user.click(screen.getByRole('button', { name: 'Estágio 10' }))

    // No fundo do Marinho o Leito Oceanico domina — a leitura que a trilha
    // inteira existe pra dar.
    const doEstagio = composicaoDoEstagio(BIOMA_POR_CHAVE['marinho'], 10)
    expect(doEstagio[0].chave).toBe('seabed')
    expect(screen.getByText(/POKEs deste estágio/)).toBeTruthy()
    expect(screen.getAllByText(new RegExp(doEstagio[0].nome)).length).toBeGreaterThan(0)
  })

  it('o no da hunt ativa aparece marcado, e o painel dela oferece "Voltar"', async () => {
    const user = userEvent.setup()
    comEquipe({ ...progressoPorBiomaDefault(), marinho: 5 })
    useWorldStore.setState({ mapDef: { id: estagioId('marinho', 2) } } as never, false)
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))
    await user.click(screen.getByRole('button', { name: 'Estágio 2' }))

    expect(screen.getByText('EM CAÇADA')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Voltar ao campo' })).toBeTruthy()
  })
})

// PH-469 — a trilha se le de relance.
//
// OS QUATRO CASOS AQUI SAO OS QUATRO CANAIS QUE A ISSUE TROCOU, e cada um falha
// em silencio se a tela regredir: o numero volta a virar `✓` e o jogador para de
// achar onde esta; a miniatura volta a apontar pro `.jpg` de 3 MB e a tela de 12
// cartoes baixa 39 MB sem nada quebrar; a dica deixa de abrir e ninguem nota
// porque o painel continua ali; o botao volta a ser do tamanho do texto ao lado.
describe('a leitura da trilha (PH-469)', () => {
  it('o no do estagio LIMPO mostra o NUMERO, e nunca um check', async () => {
    const user = userEvent.setup()
    comEquipe({ ...progressoPorBiomaDefault(), marinho: 3 })
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))

    // Guarda anti-vacuo: os tres primeiros estao limpos de verdade neste
    // progresso, senao o teste abaixo mediria nos "liberado" e passaria.
    const p = { ...progressoPorBiomaDefault(), marinho: 3 }
    expect(estadoDoEstagio(p, 'marinho', 2)).toBe('limpo')

    const no = screen.getByRole('button', { name: 'Estágio 2' })
    expect(no.textContent).toContain('2')
    expect(no.textContent).not.toContain('✓')
    expect(no.getAttribute('data-estado')).toBe('limpo')
  })

  it('concluido se le pela BORDA, e a borda do limpo nao e a do liberado', async () => {
    const user = userEvent.setup()
    comEquipe({ ...progressoPorBiomaDefault(), marinho: 3 })
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))

    const anelDe = (nome: string) =>
      (screen.getByRole('button', { name: nome }) as HTMLElement).style.boxShadow

    const limpo = screen.getByRole('button', { name: 'Estágio 2' })
    const atual = screen.getByRole('button', { name: 'Estágio 4' })
    expect(limpo.getAttribute('data-estado')).toBe('limpo')
    expect(atual.getAttribute('data-estado')).toBe('atual')
    // O limpo usa o verde; o proximo a fazer usa a cor do bioma (Marinho e
    // WATER). Se os dois anéis ficarem iguais, "concluido" deixa de ter canal.
    expect(anelDe('Estágio 2')).toContain('#22c55e')
    expect(anelDe('Estágio 4')).not.toContain('#22c55e')
    expect(anelDe('Estágio 2')).not.toBe(anelDe('Estágio 4'))
  })

  it('o icone do bioma e a MINIATURA, e nao a arte de 3 MB', () => {
    render(<HuntMenu />)
    const icones = screen.getAllByRole('presentation', { hidden: true })
      .filter((el): el is HTMLImageElement => el.tagName === 'IMG')
    // Guarda anti-vacuo: sao 12 biomas na grade.
    expect(icones.length).toBeGreaterThanOrEqual(BIOMAS.length)
    for (const bioma of BIOMAS) {
      const alvo = icones.find((el) => el.getAttribute('src')?.includes(`/mini/${bioma.chave}.`))
      expect(alvo, `${bioma.chave} sem miniatura no cartao`).toBeTruthy()
      // O `.jpg` grande e o fundo da trilha (nivel 2), nunca o icone do cartao.
      expect(alvo!.getAttribute('src')).not.toBe(`assets/biome-selector/${bioma.chave}.jpg`)
    }
  })

  it('passar o cursor num no abre a dica dele, e sair fecha', async () => {
    const user = userEvent.setup()
    comEquipe({ ...progressoPorBiomaDefault(), marinho: 3 })
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))

    // O painel abre no estagio 4; a dica e do 6, que NAO e o selecionado (o
    // selecionado nao ganha dica de proposito — o painel ja o descreve).
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull()
    await user.hover(screen.getByRole('button', { name: 'Estágio 6' }))
    const dica = screen.getByRole('tooltip', { hidden: true })
    expect(dica.textContent).toContain('Estágio 6')
    expect(dica.textContent).toContain('Lv 51-60')
    await user.unhover(screen.getByRole('button', { name: 'Estágio 6' }))
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull()
  })

  it('o botao de entrar ocupa a largura do painel, e nao a do proprio texto', async () => {
    const user = userEvent.setup()
    comEquipe({ ...progressoPorBiomaDefault(), marinho: 3 })
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))

    const entrar = screen.getByRole('button', { name: 'Entrar' })
    expect(entrar.className).toContain('w-full')
    // Ele e o gancho do alvo minimo de toque — sem a classe, o botao principal
    // da tela e o unico que ignora a regra de dedo (`[data-toque]`, index.css).
    expect(entrar.className).toContain('jogo-botao')
  })
})
