// @vitest-environment jsdom
//
// A camada de VFX nao pode roubar o toque do jogo (PH-190).
//
// Este e o teste que justifica um arquivo com jsdom (que custa ~10x pra subir):
// a camada cobre a tela INTEIRA e fica ACIMA do trilho e da doca. Se ela
// capturar ponteiro, todo destino da barra de navegacao e todo slot de golpe
// ficam inalcancaveis — o jogo inteiro para de responder ao toque, e o sintoma
// nao aparece em teste de modulo nenhum porque `pointer-events` e CSS.
//
// O `z-index` tambem entra aqui, e por um motivo concreto: `25` e uma escolha, e
// nao "o mais alto possivel". Ele poe o efeito sobre a HUD (18-22) e o deixa
// abaixo de painel/sheet/modal (30+), pra que ouro voando nao passe na frente da
// Mochila aberta. O prototipo usava 58 e estava errado.
import { render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { CamadaVfx } from './CamadaVfx'
import { reiniciarCamadaVfx } from '@/render/camadaVfx'

// `ResizeObserver` vem do `setupFiles` global (ver
// `src/testes/apiDoBrowserQueOJsdomNaoTem.ts`) — o stub morava aqui e subiu pra
// lá quando esta issue quebrou os testes do PH-157 pelo mesmo motivo.
beforeAll(() => {
  // O jsdom nao implementa `getContext` e grita "Not implemented" a cada mount.
  // O codigo ja trata contexto nulo, entao o aviso e puro ruido — e ruido na
  // saida do CI e o que faz ninguem mais ler a saida do CI. Devolve `null` de
  // proposito: e exatamente o caso que a camada precisa suportar.
  HTMLCanvasElement.prototype.getContext = () => null
})

afterEach(() => reiniciarCamadaVfx())

describe('camada de VFX nao rouba o toque (PH-190)', () => {
  function montar(): HTMLCanvasElement {
    const { container } = render(<CamadaVfx />)
    const canvas = container.querySelector('canvas')
    expect(canvas, 'a camada precisa render um <canvas>').not.toBeNull()
    return canvas as HTMLCanvasElement
  }

  it('e `pointer-events-none`', () => {
    expect(montar().className).toContain('pointer-events-none')
  })

  it('fica ACIMA da HUD (18-22) e ABAIXO de painel/sheet/modal (30+)', () => {
    const z = Number(montar().className.match(/z-\[(\d+)\]/)?.[1])
    expect(z, 'z-index da camada precisa ser um numero literal na classe').not.toBeNaN()
    expect(z, 'abaixo de 23 a camada volta a sumir atras do trilho').toBeGreaterThan(22)
    expect(z, 'de 30 pra cima a camada passa na frente de painel e modal').toBeLessThan(30)
  })

  it('cobre a tela inteira sem entrar no fluxo', () => {
    const classe = montar().className
    for (const esperada of ['absolute', 'inset-0', 'h-full', 'w-full']) {
      expect(classe, `sem \`${esperada}\` a camada nao casa com o canvas do jogo`).toContain(esperada)
    }
  })

  it('e invisivel pra leitor de tela', () => {
    // Canvas decorativo: nao ha nada nele que um leitor de tela possa narrar, e
    // sem `aria-hidden` ele entra na arvore de acessibilidade como no vazio.
    expect(montar().getAttribute('aria-hidden')).toBe('true')
  })

  it('desregistra o canvas ao desmontar', () => {
    // Sem isto, `desenharVfx` continuaria pintando num canvas fora da arvore
    // (troca de conta, logout, StrictMode remontando) — trabalho a cada quadro
    // num alvo que ninguem ve.
    const { unmount, container } = render(<CamadaVfx />)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    unmount()
    // O canvas saiu do documento; o registro tambem precisa ter saido, senao a
    // camada guardaria uma referencia viva a um no orfao.
    expect(canvas.isConnected).toBe(false)
  })
})
