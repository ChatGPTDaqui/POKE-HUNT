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
import { distribuicaoDeSala } from '@/engine/systems/salaSystem'
import { bestOffensiveMultiplier } from '@/data/typeMatchups'
import { SPECIES } from '@/data/pokes'
import { elencoDoEstagio } from './elencoDoEstagio'
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
  // ESTE TITULO ERA FALSO ATE A PH-476, e o caso abaixo e a correcao dele.
  //
  // A versao original comparava `composicaoDoEstagio` (tela) com
  // `pesosDoEstagio` (tabela) e se chamava "sai da MESMA funcao que o sorteio
  // de sala consome". As duas sempre concordaram — a tela LE a tabela. O
  // sorteio, que e a terceira ponta e a unica que decide, ponderava pelo peso
  // ESTATICO de `data/biomas.ts` e nunca abria a tabela: no Marinho 10 a tela
  // dizia "Praia 0%" e o jogo entregava Praia em 32% das salas. Um teste que
  // confirma o esperado contra o esperado passa verde por anos.
  //
  // Agora a comparacao e contra `distribuicaoDeSala`, que descreve o que
  // `sortearSala` FAZ — e ha amostragem do sorteio de verdade em
  // `src/engine/sorteioDeSalaSegueOEstagio.test.ts`.
  it('sai da distribuicao que o SORTEIO aplica, nos 120 estagios', () => {
    for (const bioma of BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        const daTela = composicaoDoEstagio(bioma, e)
        const doSorteio = distribuicaoDeSala(estagioId(bioma.chave, e))
        for (const s of daTela) {
          expect(s.pct, `${bioma.chave} e${e} ${s.chave}`).toBeCloseTo((doSorteio[s.chave] ?? 0) * 100, 4)
        }
        // E o inverso: nada que o sorteio produz fica FORA da tela. Sem esta
        // metade, a tela poderia omitir um sub-bioma inteiro e continuar
        // "concordando" com o sorteio nos que ela mostra.
        for (const chave of Object.keys(doSorteio)) {
          expect(daTela.some((s) => s.chave === chave), `${bioma.chave} e${e}: ${chave} sorteado e nao exibido`).toBe(true)
        }
        // A soma do que a tela mostra fecha 100%: o que ela esconde e so o
        // sub-bioma de peso zero, que nao e sorteado neste estagio.
        const soma = daTela.reduce((a, s) => a + s.pct, 0)
        expect(soma, `${bioma.chave} e${e}`).toBeCloseTo(100, 4)
      }
    }
  })

  it('a tabela de dados e a distribuicao do sorteio nao divergem', () => {
    // Caso auxiliar, e declarado como tal: ele confere as DUAS pontas que ja
    // concordavam antes da PH-476 (`composicaoDoEstagio` le `pesosDoEstagio`).
    // Ele nao substitui o caso acima; ele impede que a curva seja mexida em
    // `estagios.ts` sem o sorteio acompanhar.
    for (const bioma of BIOMAS) {
      for (let e = 1; e <= ESTAGIOS_POR_BIOMA; e++) {
        const daCurva = pesosDoEstagio(bioma, e)
        const doSorteio = distribuicaoDeSala(estagioId(bioma.chave, e))
        for (const [chave, peso] of Object.entries(daCurva)) {
          expect(doSorteio[chave] ?? 0, `${bioma.chave} e${e} ${chave}`).toBeCloseTo(peso, 6)
        }
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
    //
    // PH-470: a fileira de chips de sub-bioma virou a fileira de ABAS, e a
    // porcentagem continua no rotulo. O texto "POKEs deste estágio" virou
    // "N POKEs neste estágio", com o numero, porque a lista deixou de ser chips
    // de nome e passou a ser linha por especie.
    const doEstagio = composicaoDoEstagio(BIOMA_POR_CHAVE['marinho'], 10)
    expect(doEstagio[0].chave).toBe('seabed')
    expect(screen.getByText(/POKEs neste estágio/)).toBeTruthy()
    const abaDoDominante = screen.getByRole('button', {
      name: new RegExp(`^${doEstagio[0].nome} \\d+%$`),
    })
    expect(abaDoDominante).toBeTruthy()
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

  it('o botao de entrar fica no topo do painel, ancorado a direita (PH-491)', async () => {
    // MUDOU NA PH-491, por pedido do dono: "mover o botão 'entrar' para o topo
    // direito do quadro onde fica os sub-biomas". Até aqui ele fechava o painel
    // com `w-full`.
    //
    // O que este caso trava NÃO é a posição por si — é que a volta pro
    // cabeçalho não desfaça o que a PH-469 comprou. Lá ele estava inline entre
    // "3 salas" e o selo de estado, com o mesmo peso visual do texto ao lado, e
    // a única ação da tela era o elemento mais discreto dela.
    const user = userEvent.setup()
    comEquipe({ ...progressoPorBiomaDefault(), marinho: 3 })
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))

    const entrar = screen.getByRole('button', { name: 'Entrar' })
    // Ancorado à direita, e sem encolher quando os rótulos à esquerda apertam —
    // a 390px ele desce pra própria linha (o cabeçalho é `flex-wrap`) em vez de
    // virar uma pílula espremida.
    expect(entrar.className).toContain('ml-auto')
    expect(entrar.className).toContain('shrink-0')
    expect(entrar.className, 'voltou a fechar o painel').not.toContain('w-full')
    // O PESO fica. `font-black` + caixa alta + borda de 2px é o que o separa
    // dos quatro rótulos da mesma linha.
    expect(entrar.className).toContain('font-black')
    expect(entrar.className).toContain('uppercase')
    expect(entrar.className).toContain('border-2')
    // Ele e o gancho do alvo minimo de toque — sem a classe, o botao principal
    // da tela e o unico que ignora a regra de dedo (`[data-toque]`, index.css).
    expect(entrar.className).toContain('jogo-botao')

    // E ele está DENTRO do cabeçalho, junto do rótulo do estágio — não solto
    // no fim do painel. `Estágio 4` e o botão dividem o mesmo pai.
    const rotulo = screen.getByText('Estágio 4')
    expect(rotulo.parentElement, 'o botão saiu da linha do cabeçalho')
      .toBe(entrar.parentElement)
  })

  it('o painel do estagio traz o "avançar ao concluir" (PH-490)', async () => {
    // Ele morava no painel de Automações, a dois menus daqui. A decisão que ele
    // governa — repito este estágio ou vou pro seguinte? — é tomada olhando a
    // trilha, escolhendo o estágio pela espécie que se caça nele.
    const user = userEvent.setup()
    comEquipe({ ...progressoPorBiomaDefault(), marinho: 3 })
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))

    expect(screen.getByText('Avançar de estágio ao concluir')).toBeTruthy()
  })
})

// PH-470 — o elenco do estagio volta a dizer alguma coisa.
//
// A trilha listava o elenco por NOME, em chips cinza. O cartao de hunt antigo
// mostrava face, tipo, chance e efetividade; a navegacao em dois niveis
// (PH-431) tirou as 120 hunts de bioma daquela lista e deixou as quatro
// informacoes so pro conteudo de fim de jogo — que e onde o jogador menos
// precisa escolher.
//
// A conta em si tem teste proprio, contra o SORTEIO amostrado, em
// `elencoDoEstagio.test.ts`. Aqui o alvo e a tela.
describe('o elenco do estagio (PH-470)', () => {
  async function abrirMarinho(estagio: number, progresso = 9) {
    const user = userEvent.setup()
    comEquipe({ ...progressoPorBiomaDefault(), marinho: progresso })
    render(<HuntMenu />)
    await user.click(screen.getByText('Marinho'))
    await user.click(screen.getByRole('button', { name: `Estágio ${estagio}` }))
    return user
  }

  it('cada especie vem com face, chance e o badge de efetividade do POKE em campo', async () => {
    await abrirMarinho(3)
    const marinho = BIOMA_POR_CHAVE['marinho']
    const elenco = elencoDoEstagio(marinho, 3)
    // Guarda anti-vacuo: o estagio tem elenco de verdade.
    expect(elenco.length).toBeGreaterThan(3)

    const primeira = elenco[0]
    const nome = screen.getByText(primeira.species.name)
    const linha = nome.parentElement!
    // FACE: `faceIconUrl` devolve `null` pra especie sem arte e a linha cai num
    // quadrado colorido — as duas formas contam como "tem retrato", e o que
    // nao pode e a linha ser so texto, que era o estado anterior.
    const face = linha.querySelector('img')
    expect(face?.getAttribute('src') ?? '', `${primeira.species.name} sem face`)
      .toContain(primeira.species.id)
    // CHANCE: com uma decimal, do jeito que a linha formata.
    expect(linha.textContent).toContain(`${primeira.pct.toFixed(1)}%`)
    // EFETIVIDADE: o time do helper e um charmander (FIRE). Contra o elenco
    // aquatico do Marinho ha pelo menos uma linha com multiplicador != 1, e o
    // badge so aparece nesses casos de proposito.
    const comBadge = elenco
      .map((e) => bestOffensiveMultiplier(SPECIES['charmander'], e.species))
      .filter((m) => m !== 1)
    expect(comBadge.length, 'nenhuma especie deste estagio tem efetividade != 1x').toBeGreaterThan(0)
    expect(screen.getAllByText(/^(4x|2x|½x|¼x|imune)$/).length).toBeGreaterThan(0)
  })

  it('a tag de protetor aparece, e o vocabulario e GUARDIAN/LORD', async () => {
    // Nunca "boss" nem "chefe" em texto de UI de bioma: "boss" nomeia TRES
    // sistemas distintos neste projeto (ver CLAUDE.md), e este e o unico dos
    // tres que usa estes dois nomes.
    const marinho = BIOMA_POR_CHAVE['marinho']
    // Acha um estagio do Marinho que de fato marca alguem — depender do 3 seria
    // amarrar o teste a um dado de balanceamento.
    const estagio = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      .find((e) => elencoDoEstagio(marinho, e).some((x) => x.guardian || x.lord))
    expect(estagio, 'nenhum estagio do Marinho marca protetor').toBeTruthy()

    await abrirMarinho(estagio!, 10)
    const tags = screen.getAllByText(/★ (GUARDIAN|LORD)/)
    expect(tags.length).toBeGreaterThan(0)
    // E NAO em todas as linhas: o pool degradado de `contextoDoProtetor` faria
    // isso, e a tag deixaria de informar.
    const elenco = elencoDoEstagio(marinho, estagio!)
    expect(tags.length).toBeLessThan(elenco.length)
    expect(document.body.textContent).not.toMatch(/\bBOSS\b|\bchefe\b/i)
  })

  it('clicar na aba de um sub-bioma recalcula a lista e a chance', async () => {
    const user = await abrirMarinho(3)
    const marinho = BIOMA_POR_CHAVE['marinho']
    const doEstagio = elencoDoEstagio(marinho, 3)
    const daPraia = elencoDoEstagio(marinho, 3, 'beach')
    // O ALVO E A PRIMEIRA ESPECIE CUJA % DE FATO MUDA entre as duas contas, e
    // nao a primeira da lista (PH-503). A mais comum da Praia e justamente a
    // que bate no `TETO_DE_FATIA` nos dois calculos, entao ela renderiza o mesmo
    // numero nas duas telas e nao serve pra provar que a aba recalculou —
    // escolher `daPraia[0]` deixava o teste vermelho por um motivo que nao e o
    // dele.
    const par = daPraia
      .map((x) => ({ alvo: x, noEstagio: doEstagio.find((e) => e.encounterId === x.encounterId) }))
      .find((p) => p.noEstagio != null && p.alvo.pct > p.noEstagio.pct + 1e-9)
    // Guarda anti-vacuo: as duas contas TEM que diferir em ALGUEM, senao a aba
    // nao faz nada e o teste passaria sem medir nada.
    expect(par, 'nenhuma especie muda de % entre o estagio e a Praia').toBeTruthy()
    const alvo = par!.alvo
    const noEstagio = par!.noEstagio!

    const linhaDe = (nome: string) => screen.getByText(nome).parentElement!.textContent
    expect(linhaDe(alvo.species.name)).toContain(`${noEstagio.pct.toFixed(1)}%`)

    const aba = screen.getByRole('button', { name: /^Praia \d+%$/ })
    await user.click(aba)

    expect(screen.getByText(/POKEs em Praia/)).toBeTruthy()
    expect(linhaDe(alvo.species.name)).toContain(`${alvo.pct.toFixed(1)}%`)
  })

  it('trocar de estagio volta a aba pro estagio inteiro', async () => {
    // Sem o reset, clicar no estagio 10 com a aba "Praia" aberta manteria
    // "Praia" — e no fundo do Marinho a Praia tem peso ZERO, o que deixaria a
    // lista vazia sem nada explicando.
    const user = await abrirMarinho(3, 10)
    await user.click(screen.getByRole('button', { name: /^Praia \d+%$/ }))
    expect(screen.getByText(/POKEs em Praia/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Estágio 10' }))
    expect(screen.getByText(/POKEs neste estágio/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Praia \d+%$/ })).toBeNull()
  })
})
