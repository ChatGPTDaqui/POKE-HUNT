// PH-480/PH-485: o selo de mudanca de atributo nao ocupa espaco de mais ninguem.
//
// O DEFEITO QUE ISTO TRAVA JA ACONTECEU DUAS VEZES, e as duas em silencio — a
// arte continua aparecendo, so que por cima de outra coisa:
//
//   PH-480  a peca tinha 48x48 e era desenhada no MEIO DO CORPO, no mesmo lugar
//           e tamanho da arte de impacto de um golpe de dano. Pedido do dono:
//           "estao sendo aplicados como se fossem sprites de ataque".
//   PH-485  movida pra ACIMA DA CABECA, ela caiu em cima da PLACA DE NOME — a
//           barra de HP (-13 a -8 do topo da cabeca) e o numero do nivel (-15).
//           Achado so em QA ao vivo, porque nenhum teste olhava coordenada.
//
// Entao o que este arquivo mede e GEOMETRIA, e nao "desenhou": as coordenadas do
// `drawImage` sao observaveis, e sao elas que dizem se a peca pisa em alguem.
//
// POR QUE O `document` FALSO. `sprites.ts` cria o canvas de tinta no
// carregamento do modulo (`canvasDeEstagio`), e sem ele `drawSeloDeEstagio`
// desiste antes de desenhar. O ambiente padrao da suite e `node`, e jsdom nao
// serve tambem: o `getContext('2d')` dele devolve `null` sem a dependencia
// nativa `canvas`, o que daria o MESMO falso verde por outro caminho.
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

// O ALVO. `battleAnim: null` de propósito: nesse caminho `visualTopOffset` e
// `visualHalfWidth` devolvem os dois o `radius`, entao a geometria inteira sai
// de um numero so e o teste nao depende de folha de sprite nenhuma.
const RAIO = 14
const ALVO = { id: 'alvo-1', x: 200, y: 150, radius: RAIO, battleAnim: null }
/** O topo visivel da cabeca — a origem de todas as medidas do renderer. */
const TOPO = ALVO.y - RAIO

// A PLACA DE NOME, lida de `drawHpBar` e do comentario dela ("acima ficam o
// nivel (-15) e o nome (-26)"). Copiada aqui de propósito: se alguem mexer nos
// numeros de la sem olhar pra ca, o teste ainda mede a faixa que ELE afirma —
// e a divergencia aparece na tela, que e onde ela importa.
const HP_BAR_HEIGHT = 5
const PLACA_BAIXO = TOPO - 8
const PLACA_CIMA = TOPO - 26 - 11 // topo do texto do nome

function efeitoDeStatus(direcao: 'aumenta' | 'diminui', idade = 0.1) {
  return {
    id: 'e1', type: 'abilityEffect' as const, x: ALVO.x, y: ALVO.y,
    targetX: ALVO.x, targetY: ALVO.y - RAIO * 0.6,
    radius: RAIO, color: '#b8b8d0', duration: 1, delay: 0, age: idade,
    elementType: 'NORMAL' as never, abilityId: 'growl', anguloDeAtaque: 0,
    statusDirection: direcao, statusStat: 'atkFis' as const,
    seguirId: ALVO.id,
    isAoe: false, laneSize: 1, ownerId: null, lane: 0,
  } as never
}

const mundo = { player: null, enemies: [ALVO] } as never

// Aquecimento fora de qualquer `it` (PH-129/PH-411): a primeira importacao de
// `sprites.ts` custa ~550ms e cairia dentro do primeiro caso.
const { drawEffect } = await import('./sprites')

/** O desenho do selo e o unico com destino do tamanho exato da peca. */
function retanguloDoSelo() {
  const d = desenhos.find((x) => x[7] === SELO_LARGURA && x[8] === SELO_ALTURA)
  if (!d) return null
  const [x, y] = [d[5] as number, d[6] as number]
  return { x, y, direita: x + SELO_LARGURA, baixo: y + SELO_ALTURA }
}

describe('a geometria do selo de estagio (PH-480/PH-485)', () => {
  beforeEach(() => { desenhos = [] })

  it('desenha 1:1, no tamanho do arquivo', () => {
    // 1:1 nao e economia: e pixel art com traco de 1px, e escala nao-inteira
    // racha o traco (a mesma licao de `CAPTURE_ANIM_DRAW_SCALE`).
    drawEffect(ctxEspiao(), efeitoDeStatus('diminui'), mundo)
    const d = desenhos.find((x) => x[7] === SELO_LARGURA && x[8] === SELO_ALTURA)
    expect(d, 'o selo nao foi desenhado').toBeDefined()
    expect([d![3], d![4]], 'recorte de origem').toEqual([SELO_LARGURA, SELO_ALTURA])
  })

  it('NAO invade a faixa da placa de nome — o defeito da PH-485', () => {
    // Este e o caso que faltava. O selo da PH-480 ficava em -23 a -10 do topo da
    // cabeca, ou seja em cima da barra de HP e do nivel, e nenhum teste da suite
    // olhava coordenada — so apareceu abrindo o jogo.
    for (const direcao of ['aumenta', 'diminui'] as const) {
      for (const idade of [0, 0.25, 0.5, 0.75, 0.99]) {
        desenhos = []
        drawEffect(ctxEspiao(), efeitoDeStatus(direcao, idade), mundo)
        const s = retanguloDoSelo()!
        const invade = s.y < PLACA_BAIXO && s.baixo > PLACA_CIMA
        expect(invade, `${direcao} em t=${idade}: selo ${s.y}..${s.baixo} x placa ${PLACA_CIMA}..${PLACA_BAIXO}`)
          .toBe(false)
      }
    }
  })

  it('fica INTEIRO a esquerda do corpo, sem encostar nele', () => {
    // O flanco e o lugar escolhido porque os tres vizinhos estao noutro canto: a
    // coluna de numeros a esquerda mas de -44 pra cima, a porcentagem de HP a
    // direita da barra, e o nome do golpe abaixo do corpo.
    drawEffect(ctxEspiao(), efeitoDeStatus('diminui'), mundo)
    const s = retanguloDoSelo()!
    expect(s.direita, 'o selo encosta no corpo').toBeLessThanOrEqual(ALVO.x - RAIO)
  })

  it('nao cobre a barra de HP nem por acidente de largura', () => {
    // A barra tem 32 de largura centrada no POKE. O selo passa a esquerda dela;
    // com raio pequeno ele chegaria perto, e e a faixa VERTICAL que separa os
    // dois — esta assercao existe pra deixar isso explicito e nao virar sorte.
    drawEffect(ctxEspiao(), efeitoDeStatus('aumenta', 0.99), mundo)
    const s = retanguloDoSelo()!
    const barra = { cima: TOPO - 8 - HP_BAR_HEIGHT, baixo: TOPO - 8 }
    const cruzaNaVertical = s.y < barra.baixo && s.baixo > barra.cima
    expect(cruzaNaVertical).toBe(false)
  })

  it('sobe quando o atributo sobe e desce quando ele desce', () => {
    // O deslocamento e o unico movimento que sobrou depois de a tira de 16
    // quadros virar quadro unico. Se ele sumir, o selo fica plantado e o par
    // aumenta/diminui vira a mesma coisa em movimento.
    drawEffect(ctxEspiao(), efeitoDeStatus('aumenta', 0.1), mundo)
    const cedoSubindo = retanguloDoSelo()!.y
    desenhos = []
    drawEffect(ctxEspiao(), efeitoDeStatus('aumenta', 0.5), mundo)
    expect(retanguloDoSelo()!.y, 'aumenta tem que subir na tela (y menor)').toBeLessThan(cedoSubindo)

    desenhos = []
    drawEffect(ctxEspiao(), efeitoDeStatus('diminui', 0.1), mundo)
    const cedoDescendo = retanguloDoSelo()!.y
    desenhos = []
    drawEffect(ctxEspiao(), efeitoDeStatus('diminui', 0.5), mundo)
    expect(retanguloDoSelo()!.y, 'diminui tem que descer na tela (y maior)').toBeGreaterThan(cedoDescendo)
  })

  it('sem a entidade em campo (alvo abatido no mesmo quadro) ainda desenha', () => {
    // O alvo pode morrer no golpe que aplicou o status. Sem o fallback, o selo
    // sumiria justo ai — e o jogador perderia a unica indicacao do que mudou.
    desenhos = []
    drawEffect(ctxEspiao(), efeitoDeStatus('diminui'), { player: null, enemies: [] } as never)
    expect(retanguloDoSelo(), 'o selo sumiu quando o alvo saiu de campo').not.toBeNull()
  })
})
