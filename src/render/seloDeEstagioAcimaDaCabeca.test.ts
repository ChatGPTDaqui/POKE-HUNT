// PH-480: o selo de mudanca de atributo sai do CORPO do alvo.
//
// O DEFEITO QUE ISTO TRAVA, e ele nao lanca erro nem aparece em tipo nenhum: a
// peca da PH-416 tinha 48x48 e era desenhada em `effect.targetY`, que e o meio
// do corpo — mesmo lugar, mesmo tamanho e mesma duracao da arte de impacto de um
// golpe de dano. Pedido do dono, textual: "eles estao sendo aplicados como se
// fossem sprites de ataque, sobrepondo as sprites de ataque".
//
// Uma regressao aqui e silenciosa: a arte continua aparecendo, so que por cima
// do POKE de novo. Nenhum outro teste da suite olha COORDENADA de desenho de
// efeito, entao ela passaria batida.
//
// POR QUE O `document` FALSO. `sprites.ts` cria o canvas de tinta no carregamento
// do modulo (`canvasDeEstagio`), e sem ele `drawSeloDeEstagio` desiste antes de
// desenhar. O ambiente padrao da suite e `node`, e jsdom nao serve tambem: o
// `getContext('2d')` dele devolve `null` sem a dependencia nativa `canvas`, o
// que daria o MESMO falso verde por outro caminho.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SELO_LARGURA, SELO_ALTURA } from '@/data/estagioVfx'

class ImagemPronta {
  complete = true
  naturalWidth = SELO_LARGURA
  naturalHeight = SELO_ALTURA
  #src = ''
  set src(valor: string) { this.#src = valor }
  get src() { return this.#src }
  addEventListener() {}
  removeEventListener() {}
}

vi.stubGlobal('Image', ImagemPronta)

const ctxDeTinta = new Proxy({}, {
  get: (_alvo, prop) => (prop === 'canvas' ? { width: 64, height: 64 } : () => {}),
})

vi.stubGlobal('document', {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ctxDeTinta,
  }),
})

/** Cada `drawImage` desta corrida, na ordem, com os argumentos crus. */
let desenhos: unknown[][] = []

function ctxEspiao() {
  return new Proxy({}, {
    get: (_alvo, prop) => {
      if (prop === 'canvas') return { width: 300, height: 300 }
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
        return () => ({ addColorStop() {} })
      }
      if (prop === 'drawImage') return (...args: unknown[]) => { desenhos.push(args) }
      return () => {}
    },
  }) as unknown as CanvasRenderingContext2D
}

const ALVO_Y = 150

function efeitoDeStatus(direcao: 'aumenta' | 'diminui', idade = 0.1) {
  return {
    id: 'e1', type: 'abilityEffect' as const, x: 150, y: ALVO_Y, targetX: 150, targetY: ALVO_Y,
    radius: 14, color: '#b8b8d0', duration: 1, delay: 0, age: idade,
    elementType: 'NORMAL' as never, abilityId: 'growl', anguloDeAtaque: 0,
    statusDirection: direcao, statusStat: 'atkFis' as const,
    isAoe: false, laneSize: 1, ownerId: null, lane: 0,
  } as never
}

const mundoVazio = { player: null, enemies: [] } as never

// Aquecimento fora de qualquer `it` (PH-129/PH-411): a primeira importacao de
// `sprites.ts` custa ~550ms e cairia dentro do primeiro caso.
const { drawEffect } = await import('./sprites')

/** O desenho do selo e o unico com destino do tamanho exato da peca. */
function desenhoDoSelo() {
  return desenhos.find((d) => d[7] === SELO_LARGURA && d[8] === SELO_ALTURA)
}

describe('o selo de estagio fica acima da cabeca, nao sobre o corpo (PH-480)', () => {
  beforeEach(() => { desenhos = [] })

  it('desenha 1:1, no tamanho do arquivo', () => {
    // 1:1 nao e economia: e pixel art com traco de 2px, e escala nao-inteira
    // racha o traco (a mesma licao de `CAPTURE_ANIM_DRAW_SCALE`).
    drawEffect(ctxEspiao(), efeitoDeStatus('diminui'), mundoVazio)
    const selo = desenhoDoSelo()
    expect(selo, 'o selo nao foi desenhado').toBeDefined()
    expect([selo![3], selo![4]], 'recorte de origem').toEqual([SELO_LARGURA, SELO_ALTURA])
  })

  it('o selo inteiro fica ACIMA do ponto do efeito', () => {
    drawEffect(ctxEspiao(), efeitoDeStatus('diminui'), mundoVazio)
    const selo = desenhoDoSelo()!
    const topo = selo[6] as number
    // A borda de BAIXO do selo, e nao o topo: e ela que encostaria no corpo.
    expect(topo + SELO_ALTURA).toBeLessThan(ALVO_Y)
  })

  it('sobe quando o atributo sobe e desce quando ele desce', () => {
    // O deslocamento e o unico movimento que sobrou depois de a tira de 16
    // quadros virar quadro unico. Se ele sumir, o selo fica plantado e o par
    // aumenta/diminui vira a mesma coisa em movimento.
    drawEffect(ctxEspiao(), efeitoDeStatus('aumenta', 0.1), mundoVazio)
    const cedoSubindo = desenhoDoSelo()![6] as number
    desenhos = []
    drawEffect(ctxEspiao(), efeitoDeStatus('aumenta', 0.5), mundoVazio)
    const tardeSubindo = desenhoDoSelo()![6] as number
    expect(tardeSubindo, 'aumenta tem que subir na tela (y menor)').toBeLessThan(cedoSubindo)

    desenhos = []
    drawEffect(ctxEspiao(), efeitoDeStatus('diminui', 0.1), mundoVazio)
    const cedoDescendo = desenhoDoSelo()![6] as number
    desenhos = []
    drawEffect(ctxEspiao(), efeitoDeStatus('diminui', 0.5), mundoVazio)
    const tardeDescendo = desenhoDoSelo()![6] as number
    expect(tardeDescendo, 'diminui tem que descer na tela (y maior)').toBeGreaterThan(cedoDescendo)
  })
})
