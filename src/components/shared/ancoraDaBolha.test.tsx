// @vitest-environment jsdom
// PH-296 — a bolha de card ancora NO CARD, e nao na origem da janela.
//
// O DEFEITO
// -----------------------------------------------------------------------------
// `envolve="bloco"` renderiza o gatilho como `display: contents`, de proposito:
// ele envolve um card inteiro e nao pode mudar o layout dele. So que elemento
// com `contents` NAO GERA CAIXA. O positioner do base-ui mede a ancora, recebe
// `0 x 0`, e passa a posicionar tudo a partir de `(0,0)`:
//
//     --anchor-width: 0px; --anchor-height: 0px;
//     transform: translate(-16px, 4px);
//
// Medido em 390px, no chip de sala: gatilho em `y = 206`, bolha em
// `x = -13, y = 4`. Treze pixels fora da tela, e a duzentos do que ela explica.
//
// Valia pra TODA bolha de card do jogo — golpe, item, POKE no chat, clima, sala,
// carteira. Passou despercebido porque a cobertura antiga era quase toda
// `envolve="inline"`, que gera caixa e nunca teve o problema.
//
// A CORRECAO, E POR QUE NAO E TROCAR O `display`
// -----------------------------------------------------------------------------
// Trocar `contents` por `flex`/`block` mudaria o layout de TODOS os consumidores
// de uma vez, e a regressao seria visual — o tipo que teste nao pega. Em vez
// disso o positioner recebe uma ANCORA explicita: o primeiro filho do gatilho,
// que e o card de verdade.
//
// jsdom nao faz layout (todo rect e zero), entao este teste NAO mede posicao.
// Ele mede o que o jsdom sabe responder e o que de fato quebrou: que a funcao de
// ancora existe, que ela aponta pro filho, e que o gatilho inline — que nao tem
// o problema — continua sem ela. A prova de posicao foi feita no navegador, com
// os numeros no cabecalho acima e na PR.
import { describe, expect, it, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

import { Explicacao } from './Explicacao'

import fonteDaExplicacao from './Explicacao.tsx?raw'
import fonteDoTooltip from '@/components/ui/tooltip.tsx?raw'

const ancoras: unknown[] = []

// O `TooltipContent` real monta o portal do base-ui, que em jsdom nao posiciona
// nada. O que interessa aqui e o ARGUMENTO que ele recebe, entao o dublê guarda
// a `anchor` e devolve o conteudo sem portal nenhum.
vi.mock('@/components/ui/tooltip', async (original) => {
  const real = await original<typeof import('@/components/ui/tooltip')>()
  return {
    ...real,
    TooltipContent: ({ anchor, children }: { anchor?: unknown; children?: React.ReactNode }) => {
      ancoras.push(anchor)
      return <div data-testid="bolha">{children}</div>
    },
  }
})

afterEach(() => {
  cleanup()
  ancoras.length = 0
})

describe('a bolha de BLOCO recebe ancora explicita (PH-296)', () => {
  it('a ancora e uma funcao, e ela devolve o card que o gatilho envolve', () => {
    render(
      <Explicacao envolve="bloco" conteudo="oi">
        <div data-testid="card">conteudo do card</div>
      </Explicacao>,
    )
    const ancora = ancoras.at(-1)
    expect(typeof ancora, 'sem funcao de ancora o positioner mede o gatilho sem caixa').toBe('function')
    const alvo = (ancora as () => Element | null)()
    expect(alvo).toBe(screen.getByTestId('card'))
  })

  it('o gatilho INLINE nao recebe ancora — ele ja tem caixa', () => {
    // Passar ancora aqui tambem nao quebraria nada, mas mascararia a regra: o
    // problema e do `contents`, e so dele.
    render(<Explicacao conteudo="oi"><span>palavra</span></Explicacao>)
    expect(ancoras.at(-1)).toBeUndefined()
  })

  it('sem filho ELEMENTO a ancora cai no proprio gatilho, e nao em `null`', () => {
    // `children` de texto puro nao tem `firstElementChild`. Devolver `null` ali
    // faria o positioner voltar ao comportamento padrao sem aviso; devolver o
    // gatilho mantem a medida que existia antes.
    const { container } = render(<Explicacao envolve="bloco" conteudo="oi">so texto</Explicacao>)
    const alvo = (ancoras.at(-1) as () => Element | null)()
    expect(alvo).not.toBeNull()
    expect(alvo).toBe(container.querySelector('span'))
  })
})

describe('a fiacao continua ligada nos dois arquivos (PH-296)', () => {
  it('`Explicacao` so passa ancora no regime de bloco', () => {
    const codigo = fonteDaExplicacao.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(codigo).toContain("envolve === 'bloco'")
    expect(codigo).toContain('firstElementChild')
  })

  it('`TooltipContent` repassa a ancora pro positioner', () => {
    // Sem este repasse a prop chega e morre — o defeito voltaria inteiro, e o
    // caso de cima continuaria verde porque ele so olha o argumento.
    const codigo = fonteDoTooltip.replace(/^\s*\/\/.*$/gm, '')
    expect(codigo).toContain('anchor={anchor}')
    expect(codigo).toContain('"anchor"')
  })
})
