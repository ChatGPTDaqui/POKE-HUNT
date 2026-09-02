// @vitest-environment jsdom
// PH-285 — o clima mora no TRILHO, nas tres larguras, e nunca em duas
// superficies ao mesmo tempo.
//
// O DEFEITO QUE ISTO IMPEDE DE VOLTAR
// -----------------------------------------------------------------------------
// O chip de clima nasceu numa fileira propria abaixo do cabecalho, junto do chip
// de sala e do chip do Lure. Depois a sala subiu pro trilho (PH-272) e o Lure
// saiu (PH-279) — e o clima ficou sozinho ali, boiando no meio do campo de jogo,
// sem nada em volta que justificasse aquele lugar.
//
// No celular era pior, e por um motivo que so aparece medindo: o chip de sala
// gasta 385px dos 390, entao o `flex-wrap` daquela fileira jogava o clima pra
// uma SEGUNDA linha. Duas fileiras de HUD sobre o cenario, por causa de um chip
// de 88px.
//
// Nada disso da erro. Um chip no lugar errado compila, renderiza e passa em
// qualquer teste de comportamento — por isso a regra precisa estar escrita em
// algum lugar que reprove.
//
// AS DUAS COISAS SOB TESTE
// -----------------------------------------------------------------------------
//  1. `HudLayer` NAO renderiza o clima. Nao "renderiza so no compacto": nao
//     renderiza. Uma segunda copia atras de um `mode` seria a mesma armadilha
//     que o proprio arquivo documenta — dois lugares pra manter de acordo, e
//     nenhum erro quando eles divergem.
//
//  2. O `soIcone` continua ANUNCIANDO o clima. Ele existe porque o vao central
//     do trilho tem 73px em 390px e o chip com o nome pede 88px; o preco e o
//     nome sair da tela. Se o `aria-label` sair junto, o clima deixa de existir
//     pra quem usa leitor de tela — e essa perda seria silenciosa.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

import { useWorldStore } from '@/stores/worldStore'
import { ClimaChip } from './ClimaChip'
import { TURNO_SEGUNDOS } from '@/data/abilities'

import fonteDoHudLayer from '@/features/game/HudLayer.tsx?raw'
import fonteDoStatusRail from '@/components/hud/StatusRail.tsx?raw'

/** Linhas de codigo, sem os comentarios — que aqui falam MUITO de `ClimaChip`. */
function codigo(fonte: string): string {
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')  // comentario JSX
    .replace(/\/\*[\s\S]*?\*\//g, '')      // bloco
    .replace(/^\s*\/\/.*$/gm, '')          // linha
}

describe('o clima nao volta pra fileira de chips (PH-285)', () => {
  it('HudLayer nao renderiza `ClimaChip` — nem atras de um `mode`', () => {
    expect(codigo(fonteDoHudLayer)).not.toContain('ClimaChip')
  })

  it('HudLayer tambem nao IMPORTA `ClimaChip`', () => {
    // Import sem uso passa no `tsc` do projeto? Nao — mas o oxlint e o `tsc`
    // param no import morto, e nao em alguem reintroduzindo o JSX depois. Esta
    // linha e a que da a mensagem certa quando isso acontecer.
    expect(fonteDoHudLayer).not.toMatch(/^import .*ClimaChip.*$/m)
  })

  it('StatusRail renderiza o clima nos DOIS regimes — com nome e so o simbolo', () => {
    const fonte = codigo(fonteDoStatusRail)
    // No compacto entra so o simbolo; na faixa central entra o chip inteiro.
    expect(fonte).toContain('<ClimaChip embutido soIcone />')
    expect(fonte).toContain('<ClimaChip embutido />')
  })
})

describe('o `soIcone` esconde o nome sem esconder o clima (PH-285)', () => {
  beforeEach(() => {
    useWorldStore.setState({
      clima: { tipo: 'granizo', origem: 'ambiente', turnosRestantes: Infinity },
    } as never, false)
  })
  afterEach(() => {
    cleanup()
    useWorldStore.setState({ clima: null } as never, false)
  })

  it('sem `soIcone` o nome esta escrito na tela', () => {
    render(<ClimaChip embutido />)
    expect(screen.getByText('Granizo')).toBeTruthy()
  })

  it('com `soIcone` o nome sai do texto mas continua no rotulo', () => {
    const { container } = render(<ClimaChip embutido soIcone />)
    expect(container.textContent).not.toContain('Granizo')
    // O simbolo vira o unico conteudo, entao ele precisa se anunciar.
    expect(screen.getByLabelText('Granizo')).toBeTruthy()
  })

  it('com `soIcone` a bolha ainda abre no dedo, com os efeitos inteiros', () => {
    // E o ponto todo do `soIcone`: o nome e a duracao nao sumiram do jogo, eles
    // passaram pro balao. Se ele nao abrir aqui, o compacto fica sem nenhum
    // canal — pior que a fileira que esta issue removeu.
    const { container } = render(<ClimaChip embutido soIcone />)
    const chip = container.querySelector('[aria-label="Granizo"]') as HTMLElement
    fireEvent.pointerDown(chip, { pointerType: 'touch' })
    fireEvent.click(chip)
    expect(screen.getByText(/1\/16 do HP/)).toBeTruthy()
    expect(screen.getByText(/Blizzard nunca erra/)).toBeTruthy()
  })

  it('o contador de prazo sai no `soIcone` — numero nu ao lado de um emoji nao diz o que e', () => {
    // A assercao do contador virou SEGUNDOS na PH-422 (era `5 turnos`). O que
    // este teste guarda nao mudou: no compacto o numero SAI, porque numero solto
    // ao lado de uma nuvem nao diz se e prazo, pilha ou intensidade — quem
    // carrega a duracao ali e o balao.
    cleanup()
    useWorldStore.setState({
      clima: { tipo: 'chuva', origem: 'golpe', turnosRestantes: 5 },
    } as never, false)

    const comNome = render(<ClimaChip embutido />)
    expect(comNome.container.textContent).toContain(`${5 * TURNO_SEGUNDOS}s`)
    cleanup()

    const soIcone = render(<ClimaChip embutido soIcone />)
    expect(soIcone.container.textContent).not.toContain('5')
  })
})

describe('a duracao aparece no balao, e ela e diferente por origem (PH-285)', () => {
  afterEach(() => {
    cleanup()
    useWorldStore.setState({ clima: null } as never, false)
  })

  function abrir() {
    const { container } = render(<ClimaChip />)
    const chip = container.querySelector('[aria-label], span') as HTMLElement
    fireEvent.pointerDown(chip, { pointerType: 'touch' })
    fireEvent.click(chip)
  }

  it('clima de GOLPE conta o que falta EM SEGUNDOS (PH-422)', () => {
    // TESTE INVERTIDO NA PH-422, e a inversao e o pedido: ele exigia "Dura mais
    // 3 turnos". O jogador nao tem intuicao de quanto vale um turno deste motor,
    // e a conversao e literal — o relogio de turno aqui e tempo puro
    // (`proximoTurnoDeStatus -= dt`), nao "por acao", entao 1 turno = 3s sem
    // ressalva e dizer em segundos nao esconde nada.
    useWorldStore.setState({
      clima: { tipo: 'chuva', origem: 'golpe', turnosRestantes: 3 },
    } as never, false)
    abrir()
    expect(screen.getByText(new RegExp(`Dura mais ${3 * TURNO_SEGUNDOS}s`))).toBeTruthy()
    expect(screen.getByText(/o clima do lugar volta/)).toBeTruthy()
  })

  it('nao existe mais singular/plural pra errar — a unidade e fixa', () => {
    // O teste anterior garantia que 1 turno nao virava "1 turnos". Com segundos o
    // problema deixou de existir, porque "s" nao pluraliza. Mantido INVERTIDO em
    // vez de apagado: a pergunta continua valida (o texto de um passo restante
    // tem que sair correto), so a armadilha e outra.
    useWorldStore.setState({
      clima: { tipo: 'chuva', origem: 'golpe', turnosRestantes: 1 },
    } as never, false)
    abrir()
    expect(screen.getByText(new RegExp(`Dura mais ${TURNO_SEGUNDOS}s\\.`))).toBeTruthy()
  })

  it('clima de AMBIENTE nao inventa contagem — ele vale enquanto voce estiver na area', () => {
    // O erro que isto impede: escrever "duracao" pros dois casos. O clima da
    // sala nao tem fim previsto, e um numero ali seria mentira com cara de dado.
    useWorldStore.setState({
      clima: { tipo: 'granizo', origem: 'ambiente', turnosRestantes: Infinity },
    } as never, false)
    abrir()
    expect(screen.getByText(/enquanto você estiver nesta área/)).toBeTruthy()
    expect(screen.queryByText(/Dura mais/)).toBeNull()
  })
})
