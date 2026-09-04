// PH-480/PH-485/PH-493: o selo de mudanca de atributo nao ocupa espaco de
// mais ninguem.
//
// O DEFEITO QUE ISTO TRAVA JA ACONTECEU DUAS VEZES, e as duas em silencio — a
// peca continua aparecendo, so que por cima de outra coisa:
//
//   PH-480  ela tinha 48x48 e era desenhada no MEIO DO CORPO, no mesmo lugar
//           e tamanho da arte de impacto de um golpe de dano. Pedido do dono:
//           "estao sendo aplicados como se fossem sprites de ataque".
//   PH-485  movida pra ACIMA DA CABECA, ela caiu em cima da PLACA DE NOME — a
//           barra de HP (-13 a -8 do topo da cabeca) e o numero do nivel (-15).
//           Achado so em QA ao vivo, porque nenhum teste olhava coordenada.
//
// Entao o que este arquivo mede e GEOMETRIA, e nao "desenhou": as coordenadas
// sao observaveis, e sao elas que dizem se a peca pisa em alguem.
//
// A PECA VIROU TEXTO NA PH-493 (`+Atk` / `−Vel`, no lugar do glifo de 21x13), e
// este arquivo mudou de instrumento junto: o observavel deixou de ser o
// `drawImage` e passou a ser o par `strokeText`/`fillText`. As assercoes de
// vizinhanca sao as MESMAS — trocar o desenho nao pode reabrir o defeito da
// PH-485, e um teste que so perguntasse "escreveu?" deixaria passar exatamente
// isso.
//
// A CAIXA DO TEXTO sai de `textAlign='right'` + `textBaseline='top'`: o (x,y)
// que chega no `fillText` e o canto SUPERIOR DIREITO, e a largura vem do
// `measureText` do proprio ctx — por isso o espiao devolve uma largura de
// verdade em vez de zero.
import { describe, it, expect, beforeEach, vi } from 'vitest'

class ImagemPronta {
  complete = true
  naturalWidth = 21
  naturalHeight = 13
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

/** Cada escrita desta corrida: o texto e o canto superior direito dele. */
let escritas: { texto: string; x: number; y: number }[] = []

/** Largura por caractere do `measureText` falso — so precisa ser > 0 e estavel. */
const LARGURA_POR_LETRA = 6

function ctxEspiao() {
  return new Proxy({}, {
    get: (_alvo, prop) => {
      if (prop === 'canvas') return { width: 300, height: 300 }
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
        return () => ({ addColorStop() {} })
      }
      if (prop === 'measureText') {
        return (t: string) => ({ width: t.length * LARGURA_POR_LETRA })
      }
      if (prop === 'fillText') {
        return (texto: string, x: number, y: number) => { escritas.push({ texto, x, y }) }
      }
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
const { drawEffect, SELO_ALTURA_DO_TEXTO } = await import('./sprites')

/** A caixa do selo, a partir do canto superior direito que o `fillText` recebe. */
function retanguloDoSelo() {
  const e = escritas.find((x) => /^[+−]/.test(x.texto))
  if (!e) return null
  return {
    x: e.x - e.texto.length * LARGURA_POR_LETRA,
    y: e.y,
    direita: e.x,
    baixo: e.y + SELO_ALTURA_DO_TEXTO,
    texto: e.texto,
  }
}

describe('a geometria do selo de estagio (PH-480/PH-485/PH-493)', () => {
  beforeEach(() => { escritas = [] })

  it('escreve a SIGLA com o sinal, e nao desenha glifo nenhum', () => {
    // PH-493: o pedido foi textual — "retirar os simbolos... substituir pelas
    // abreviacoes de letras como -Atk, +Vel". `atkFis` caindo tem que virar
    // `−AtkF`, e o sinal e o segundo canal (o primeiro e a cor) que diz a
    // direcao pra quem nao separa verde de vermelho.
    drawEffect(ctxEspiao(), efeitoDeStatus('diminui'), mundo)
    expect(retanguloDoSelo()?.texto).toBe('−AtkF')
    escritas = []
    drawEffect(ctxEspiao(), efeitoDeStatus('aumenta'), mundo)
    expect(retanguloDoSelo()?.texto).toBe('+AtkF')
  })

  it('NAO invade a faixa da placa de nome — o defeito da PH-485', () => {
    // Este e o caso que faltava quando a peca era arte. O selo da PH-480 ficava
    // em -23 a -10 do topo da cabeca, ou seja em cima da barra de HP e do
    // nivel, e nenhum teste da suite olhava coordenada — so apareceu abrindo o
    // jogo. A troca por texto nao pode reabrir isso.
    for (const direcao of ['aumenta', 'diminui'] as const) {
      for (const idade of [0, 0.25, 0.5, 0.75, 0.99]) {
        escritas = []
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
    // O deslocamento e o unico movimento que a peca tem. Se ele sumir, o selo
    // fica plantado e o par aumenta/diminui vira a mesma coisa em movimento.
    drawEffect(ctxEspiao(), efeitoDeStatus('aumenta', 0.1), mundo)
    const cedoSubindo = retanguloDoSelo()!.y
    escritas = []
    drawEffect(ctxEspiao(), efeitoDeStatus('aumenta', 0.5), mundo)
    expect(retanguloDoSelo()!.y, 'aumenta tem que subir na tela (y menor)').toBeLessThan(cedoSubindo)

    escritas = []
    drawEffect(ctxEspiao(), efeitoDeStatus('diminui', 0.1), mundo)
    const cedoDescendo = retanguloDoSelo()!.y
    escritas = []
    drawEffect(ctxEspiao(), efeitoDeStatus('diminui', 0.5), mundo)
    expect(retanguloDoSelo()!.y, 'diminui tem que descer na tela (y maior)').toBeGreaterThan(cedoDescendo)
  })

  it('sem a entidade em campo (alvo abatido no mesmo quadro) ainda desenha', () => {
    // O alvo pode morrer no golpe que aplicou o status. Sem o fallback, o selo
    // sumiria justo ai — e o jogador perderia a unica indicacao do que mudou.
    escritas = []
    drawEffect(ctxEspiao(), efeitoDeStatus('diminui'), { player: null, enemies: [] } as never)
    expect(retanguloDoSelo(), 'o selo sumiu quando o alvo saiu de campo').not.toBeNull()
  })
})
