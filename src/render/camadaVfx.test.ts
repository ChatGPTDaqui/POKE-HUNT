// A camada de VFX faz o que a PH-190 pede, e nao faz o que ela proibe.
//
// O que estes testes trancam, em ordem de quanto custa perder:
//
//  - LIMPA TODO QUADRO, inclusive sem pintor. Sem isso o ultimo quadro de um
//    efeito que acabou fica congelado ACIMA do trilho pra sempre, com o jogo se
//    mexendo por baixo.
//  - `save`/`restore` por pintor. Um pintor que deixa `globalAlpha` sujo
//    contaminaria o proximo — ja aconteceu no prototipo (o rastro aditivo das
//    moedas vazava pro texto do pulso).
//  - `centroDaAncora` devolve `null` pra ancora ausente, e NUNCA (0,0). Aquele
//    e um ponto valido da tela: um efeito indo pro canto superior esquerdo le
//    como bug de posicao, e nao como "o elemento nao esta na tela".
//  - Resolucao SEM `devicePixelRatio`, igual ao <GameCanvas>. E o que faz as
//    coordenadas casarem 1:1 entre as duas superficies.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ajustarTamanhoDaCamada, camadaVazia, centroDaAncora, definirAncora, desenharVfx,
  registrarCanvasDeVfx, registrarPintor, reiniciarCamadaVfx,
} from './camadaVfx'

/** Contexto 2D falso que anota as chamadas que importam. */
function ctxFalso() {
  const chamadas: string[] = []
  const alvo = {
    chamadas,
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    clearRect: vi.fn(() => { chamadas.push('clear') }),
    save: vi.fn(() => { chamadas.push('save') }),
    restore: vi.fn(() => { chamadas.push('restore') }),
  }
  return alvo
}

type CanvasFalso = HTMLCanvasElement & { _ctx: ReturnType<typeof ctxFalso> }

function canvasFalso(larguraCss = 390, alturaCss = 844): CanvasFalso {
  const ctx = ctxFalso()
  const el = {
    _ctx: ctx,
    width: 0,
    height: 0,
    clientWidth: larguraCss,
    clientHeight: alturaCss,
    getContext: () => ctx,
    getBoundingClientRect: () => ({
      left: 0, top: 0, width: larguraCss, height: alturaCss,
      right: larguraCss, bottom: alturaCss, x: 0, y: 0, toJSON: () => ({}),
    }),
  }
  return el as unknown as CanvasFalso
}

function caixa(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left, top, width, height,
    right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}),
  } as DOMRect
}

beforeEach(() => reiniciarCamadaVfx())
afterEach(() => reiniciarCamadaVfx())

describe('camada de VFX: registro e ciclo do quadro (PH-190)', () => {
  it('sem canvas registrado, desenhar e um no-op silencioso', () => {
    // O <GameCanvas> chama `desenharVfx` a cada quadro sem saber se a camada
    // esta montada — ela nao existe antes do mount, e no Hospital o mount pode
    // chegar depois do primeiro quadro. Estourar aqui derrubaria o laco de
    // desenho do jogo inteiro por causa de uma camada opcional.
    expect(() => desenharVfx(1 / 60)).not.toThrow()
  })

  it('chama o pintor registrado, com largura, altura e dt', () => {
    const canvas = canvasFalso(390, 844)
    registrarCanvasDeVfx(canvas)
    const pintor = vi.fn()
    registrarPintor(pintor)

    desenharVfx(0.016)

    expect(pintor).toHaveBeenCalledTimes(1)
    expect(pintor.mock.calls[0][1]).toEqual({ largura: 390, altura: 844, dt: 0.016 })
  })

  it('a funcao devolvida por registrarPintor remove o pintor', () => {
    registrarCanvasDeVfx(canvasFalso())
    const pintor = vi.fn()
    const remover = registrarPintor(pintor)

    desenharVfx(1 / 60)
    expect(pintor).toHaveBeenCalledTimes(1)

    remover()
    desenharVfx(1 / 60)
    expect(pintor).toHaveBeenCalledTimes(1) // nao subiu
    expect(camadaVazia()).toBe(true)
  })

  it('pinta na ordem de registro', () => {
    registrarCanvasDeVfx(canvasFalso())
    const ordem: string[] = []
    registrarPintor(() => ordem.push('primeiro'))
    registrarPintor(() => ordem.push('segundo'))

    desenharVfx(1 / 60)

    expect(ordem).toEqual(['primeiro', 'segundo'])
  })

  it('LIMPA o quadro mesmo sem pintor nenhum', () => {
    // O caso que parece dispensavel e nao e: quando o ultimo efeito termina, o
    // pintor sai e a camada fica vazia. Se o `clearRect` fosse pulado nesse
    // quadro, o ultimo desenho ficaria congelado sobre o trilho pra sempre.
    const canvas = canvasFalso()
    registrarCanvasDeVfx(canvas)

    desenharVfx(1 / 60)

    expect(canvas._ctx.clearRect).toHaveBeenCalledWith(0, 0, 390, 844)
  })

  it('limpa ANTES de pintar', () => {
    const canvas = canvasFalso()
    registrarCanvasDeVfx(canvas)
    registrarPintor(() => canvas._ctx.chamadas.push('pintou'))

    desenharVfx(1 / 60)

    expect(canvas._ctx.chamadas.indexOf('clear'))
      .toBeLessThan(canvas._ctx.chamadas.indexOf('pintou'))
  })

  it('isola cada pintor num save/restore proprio', () => {
    const canvas = canvasFalso()
    registrarCanvasDeVfx(canvas)
    registrarPintor(() => canvas._ctx.chamadas.push('a'))
    registrarPintor(() => canvas._ctx.chamadas.push('b'))

    desenharVfx(1 / 60)

    expect(canvas._ctx.chamadas).toEqual([
      'clear', 'save', 'a', 'restore', 'save', 'b', 'restore',
    ])
  })

  it('pintor que estoura nao impede o restore nem o pintor seguinte', () => {
    // Sem o `finally`, uma excecao num pintor deixaria o contexto dentro de um
    // `save` sem par — e o proximo quadro herdaria transform e alpha sujos, num
    // canvas que fica ACIMA do trilho. O erro sobe (nao vale engolir), mas o
    // contexto fica limpo.
    const canvas = canvasFalso()
    registrarCanvasDeVfx(canvas)
    registrarPintor(() => { throw new Error('pintor quebrado') })

    expect(() => desenharVfx(1 / 60)).toThrow('pintor quebrado')
    expect(canvas._ctx.save).toHaveBeenCalledTimes(1)
    expect(canvas._ctx.restore).toHaveBeenCalledTimes(1)
  })

  it('desliga a suavizacao, igual ao canvas do jogo', () => {
    const canvas = canvasFalso()
    registrarCanvasDeVfx(canvas)
    expect(canvas._ctx.imageSmoothingEnabled).toBe(false)
  })
})

describe('camada de VFX: resolucao (PH-190)', () => {
  it('a resolucao acompanha o tamanho em CSS', () => {
    const canvas = canvasFalso(390, 844)
    registrarCanvasDeVfx(canvas)

    ajustarTamanhoDaCamada()

    expect(canvas.width).toBe(390)
    expect(canvas.height).toBe(844)
  })

  it('NAO multiplica por devicePixelRatio', () => {
    // O <GameCanvas> usa `clientWidth` cru. Igualar e o que faz um efeito que
    // nasce sobre um POKE pousar no mesmo pixel nas duas superficies. Se alguem
    // "corrigir" isto pra dpr aqui e nao la, todo efeito sai com o dobro da
    // resolucao e metade da escala.
    // `globalThis` e nao `window`: este arquivo roda no ambiente `node` (o
    // padrao do projeto — jsdom custa ~10x pra subir e so testes de componente
    // o pedem, ver a nota em vite.config.ts). O modulo nao toca `window`, e o
    // teste tambem nao precisa.
    const alvo = globalThis as { devicePixelRatio?: number }
    const original = alvo.devicePixelRatio
    alvo.devicePixelRatio = 3
    try {
      const canvas = canvasFalso(390, 844)
      registrarCanvasDeVfx(canvas)
      ajustarTamanhoDaCamada()
      expect(canvas.width).toBe(390)
    } finally {
      if (original === undefined) delete alvo.devicePixelRatio
      else alvo.devicePixelRatio = original
    }
  })

  it('acompanha mudanca de tamanho entre quadros', () => {
    // Troca de regime (compacto/deitado/amplo), barra de endereco recolhendo,
    // teclado virtual abrindo: a camada muda de tamanho sem a janela mudar.
    const canvas = canvasFalso(390, 844)
    registrarCanvasDeVfx(canvas)
    desenharVfx(1 / 60)
    expect(canvas.width).toBe(390)

    ;(canvas as unknown as { clientWidth: number }).clientWidth = 844
    ;(canvas as unknown as { clientHeight: number }).clientHeight = 390
    desenharVfx(1 / 60)

    expect(canvas.width).toBe(844)
    expect(canvas.height).toBe(390)
  })
})

describe('camada de VFX: ancoras da HUD (PH-190)', () => {
  it('ancora ausente devolve null, e nunca (0,0)', () => {
    registrarCanvasDeVfx(canvasFalso())
    expect(centroDaAncora('carteira')).toBeNull()
  })

  it('devolve o CENTRO da ancora em px de canvas', () => {
    const canvas = canvasFalso(390, 844)
    registrarCanvasDeVfx(canvas)
    ajustarTamanhoDaCamada()
    definirAncora('carteira', caixa(300, 20, 60, 30))

    expect(centroDaAncora('carteira')).toEqual({ x: 330, y: 35 })
  })

  it('converte pela escala quando o canvas tem resolucao diferente do CSS', () => {
    // Nao acontece hoje (`ajustarTamanhoDaCamada` iguala os dois), mas a conta
    // precisa ser a certa: se alguem passar a usar dpr, a ancora tem que
    // acompanhar em vez de apontar pra metade da tela.
    const canvas = canvasFalso(390, 844)
    registrarCanvasDeVfx(canvas)
    canvas.width = 780
    canvas.height = 1688
    definirAncora('carteira', caixa(300, 20, 60, 30))

    expect(centroDaAncora('carteira')).toEqual({ x: 660, y: 70 })
  })

  it('definirAncora com null remove a ancora', () => {
    registrarCanvasDeVfx(canvasFalso())
    ajustarTamanhoDaCamada()
    definirAncora('carteira', caixa(0, 0, 10, 10))
    expect(centroDaAncora('carteira')).not.toBeNull()

    definirAncora('carteira', null)
    expect(centroDaAncora('carteira')).toBeNull()
  })

  it('sem canvas, ancora registrada ainda devolve null', () => {
    definirAncora('carteira', caixa(300, 20, 60, 30))
    expect(centroDaAncora('carteira')).toBeNull()
  })

  it('canvas de tamanho zero devolve null em vez de dividir por zero', () => {
    // Primeiro quadro antes do layout: `getBoundingClientRect` devolve 0x0 e a
    // escala sairia `Infinity`/`NaN`, plantando um efeito em coordenada
    // invalida sem nenhum erro.
    registrarCanvasDeVfx(canvasFalso(0, 0))
    definirAncora('carteira', caixa(300, 20, 60, 30))
    expect(centroDaAncora('carteira')).toBeNull()
  })
})
