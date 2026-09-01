// PH-375: o que a arte faz DEPOIS de tocar uma vez.
//
// Na velocidade autorada (10 fps) quase metade do acervo dura menos de 1,5s — a
// mais curta tem 4 quadros, 0,4s. Prolongar nao pode ser "tocar mais devagar":
// 4 quadros num turno de 3s dariam 750ms por quadro, um slideshow, que e o
// defeito oposto ao que a leva veio consertar. Dai os tres modos.
//
// O QUE ESTE ARQUIVO TRANCA, e por que cada um precisa de teste:
//
//   boomerang  a sequencia tem que ser `0..N-1` e depois `N-2..1`. Repetir as
//              PONTAS trava a animacao dois quadros em cada virada — nao quebra
//              nada, so engasga, e passa despercebido numa revisao de codigo.
//   repetir    volta pro quadro 0 sem pular nenhum.
//   segurar    (padrao) trava no ultimo. Coberto em
//              `arteNaVelocidadeAutorada.test.ts`.
//
// Observado pelo `sx` do `drawImage`, mesmo motivo do arquivo irmao: o modo de
// cauda vive dentro de `faseDaTira`, que nao e exportada — e exporta-la so pro
// teste deixaria de fora o recorte, que e onde a conta vira pixel.
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { VFX_POR_GOLPE } from '@/data/moveVfx'
import { FPS_DA_ARTE_DE_EFEITO, PISO_DE_PROLONGAMENTO } from '@/data/vfxTiras'

const LARGURA_DA_TIRA = 1200

class ImagemPronta {
  complete = true
  naturalWidth = LARGURA_DA_TIRA
  naturalHeight = 10
  #src = ''
  set src(v: string) { this.#src = v }
  get src() { return this.#src }
  addEventListener() {}
  removeEventListener() {}
}

vi.stubGlobal('Image', ImagemPronta)

let sxObservados: number[] = []

function ctxEspiao() {
  return new Proxy({}, {
    get: (_a, prop) => {
      if (prop === 'canvas') return { width: 300, height: 300 }
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
        return () => ({ addColorStop() {} })
      }
      if (prop === 'drawImage') {
        return (_img: unknown, sx: number) => {
          if (typeof sx === 'number') sxObservados.push(sx)
        }
      }
      return () => {}
    },
  }) as unknown as CanvasRenderingContext2D
}

const mundoVazio = { player: null, enemies: [] } as never

await import('./sprites')
const { drawEffect } = await import('./sprites')

function efeito(golpe: string, tipo: string, idade: number) {
  return {
    id: 'e1', type: 'abilityEffect' as const, x: 100, y: 100, targetX: 140, targetY: 100,
    radius: 14, color: '#ffffff', duration: 3.0, delay: 0, age: idade,
    elementType: tipo as never, abilityId: golpe, anguloDeAtaque: 0,
    laneSize: 1, ownerId: null, lane: 0,
  }
}

/** A sequencia de quadros desenhada, um por 100ms, ao longo de `passos`. */
function sequencia(golpe: string, tipo: string, quadros: number, passos: number): number[] {
  const larguraDoQuadro = LARGURA_DA_TIRA / quadros
  const saida: number[] = []
  for (let i = 0; i < passos; i++) {
    sxObservados = []
    // +meio quadro pra cair no MEIO do intervalo e nao na borda, onde
    // arredondamento de ponto flutuante decidiria o resultado.
    const idade = (i + 0.5) / FPS_DA_ARTE_DE_EFEITO
    drawEffect(ctxEspiao(), efeito(golpe, tipo, idade), mundoVazio)
    expect(sxObservados.length, `nada desenhado no passo ${i}`).toBeGreaterThan(0)
    saida.push(Math.round(sxObservados[0] / larguraDoQuadro))
  }
  return saida
}

describe('modo de cauda da arte de golpe', () => {
  beforeEach(() => { sxObservados = [] })

  it('bite usa boomerang, e a arte dele nao e direcional', () => {
    // Guarda de sanidade dupla: se a atribuicao mudar, o teste abaixo passaria
    // a medir outro modo em silencio. E boomerang em arte direcional e o erro
    // que a issue proibe.
    const arte = VFX_POR_GOLPE.bite.single
    expect(arte.cauda).toBe('boomerang')
    expect(arte.direcional).toBeUndefined()
    expect(arte.quadros).toBe(6)
  })

  it('boomerang vai 0..N-1 e volta N-2..1, sem repetir as pontas', () => {
    // Com 6 quadros a volta tem 2N-2 = 10 passos. O que NAO pode aparecer e
    // `...4,5,5,4...` (ultimo repetido) nem `...1,0,0,1...` (primeiro).
    const q = VFX_POR_GOLPE.bite.single.quadros
    expect(sequencia('bite', 'DARK', q, 10)).toEqual([0, 1, 2, 3, 4, 5, 4, 3, 2, 1])
  })

  it('o boomerang emenda a segunda volta sem engasgo', () => {
    // O passo 10 volta pro quadro 0. Se a volta fosse `2N` em vez de `2N-2`,
    // aqui apareceria um 0 repetido ou um 1 fora de hora.
    const q = VFX_POR_GOLPE.bite.single.quadros
    expect(sequencia('bite', 'DARK', q, 14).slice(9)).toEqual([1, 0, 1, 2, 3])
  })

  it('repetir volta pro quadro 0 sem pular nenhum', () => {
    // `fire_spin` tem 5 quadros e e chama girando — primeiro e ultimo quadro
    // com a mesma massa, entao a emenda nao aparece.
    const arte = VFX_POR_GOLPE.fire_spin.single
    expect(arte.cauda).toBe('repetir')
    expect(sequencia('fire_spin', 'FIRE', arte.quadros, 12))
      .toEqual([0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1])
  })

  it('nenhuma arte e prolongada alem do piso, e o piso e menor que o turno', () => {
    // A regra escrita na issue: prolongar ate perto da mediana do acervo
    // (1,30s), nao ate o turno. Silencio entre golpes e legibilidade.
    expect(PISO_DE_PROLONGAMENTO).toBeLessThan(3.0)
    expect(PISO_DE_PROLONGAMENTO).toBeGreaterThanOrEqual(1.0)
  })

  it('so arte CURTA ganha modo de cauda — nada longo foi marcado', () => {
    // Marcar arte longa nao faria mal hoje (`tempoVisivelDaTira` devolve o
    // tempo natural e ignora o modo), mas seria uma promessa falsa no cadastro:
    // quem lesse `cauda: 'repetir'` numa tira de 3s esperaria que ela
    // repetisse.
    const longas = Object.entries(VFX_POR_GOLPE)
      .filter(([, v]) => v.single.cauda
        && v.single.quadros / FPS_DA_ARTE_DE_EFEITO >= PISO_DE_PROLONGAMENTO)
      .map(([id]) => id)
    expect(longas).toEqual([])
  })
})
