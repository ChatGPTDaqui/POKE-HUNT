// @vitest-environment jsdom
//
// PH-141 — o que separa "cada clima tem visual proprio" de "os seis sao o mesmo
// pontinho em cores diferentes".
//
// A camada nao renderiza de verdade: o `ctx` e um espiao que anota cada chamada
// de desenho. O que se afirma aqui e o que o jogador VE — chuva risca na
// diagonal, granizo tem quina, nevoa e volume achatado, e a coloracao cobre a
// cena inteira.
//
// O RELOGIO PRECISA SER FALSO, pela mesma razao registrada em
// `formaPorPreset.test.ts`: os quadros rodam em sequencia sincrona, o delta real
// fica em ~0, e todo comportamento que depende do tempo sai indistinguivel de
// "nao implementado".
import { describe, expect, it, beforeEach, vi } from 'vitest'

import { useUiStore } from '@/stores/uiStore'
import { desenharClimaFundo, desenharClimaFrente, familiaDoClima, reiniciarClimaVisual } from './climaVisual'
import { desenharAmbiente, reiniciarAmbiente } from './ambiente'

import type { ClimaTipo } from '@/engine/types'

const JANELA = { x: 0, y: 0, w: 900, h: 600 }
const PASSO_MS = 100
const TODOS: ClimaTipo[] = ['chuva', 'sol', 'granizo', 'areia', 'neve', 'nevoa']

interface Traco {
  tipo: 'arc' | 'ellipse' | 'linha' | 'retangulo' | 'poligono'
  x: number
  y: number
  raio: number
  alpha: number
  /** Só a linha usa: para onde ela aponta, em radianos. */
  angulo: number
  composicao: string
}

function ctxEspiao() {
  const tracos: Traco[] = []
  let cursor = { x: 0, y: 0 }
  // Pontos do caminho atual. O RAIO do polígono sai daqui: fechar o caminho não
  // diz o tamanho da pedra, e registrar raio 0 tornava o teste de profundidade
  // do granizo vácuo — ele "passava" comparando zeros com zeros.
  let caminho: { x: number; y: number }[] = []
  const ctx = {
    save: () => {}, restore: () => {},
    beginPath: () => { caminho = [] },
    closePath: () => {
      // Polígono fechado = a pedra de granizo. Preencher sozinho não distingue
      // círculo de losango; fechar um caminho de 4 vértices sim.
      if (caminho.length >= 4) {
        const xs = caminho.map((c) => c.x)
        const ys = caminho.map((c) => c.y)
        tracos.push({
          tipo: 'poligono',
          x: (Math.min(...xs) + Math.max(...xs)) / 2,
          y: (Math.min(...ys) + Math.max(...ys)) / 2,
          raio: (Math.max(...ys) - Math.min(...ys)) / 2,
          alpha: ctx.globalAlpha, angulo: 0, composicao: ctx.globalCompositeOperation,
        })
      }
    },
    fill: () => {}, stroke: () => {},
    moveTo(x: number, y: number) { cursor = { x, y }; caminho.push({ x, y }) },
    lineTo(x: number, y: number) {
      caminho.push({ x, y })
      tracos.push({
        tipo: 'linha', x: cursor.x, y: cursor.y, raio: Math.hypot(x - cursor.x, y - cursor.y),
        alpha: ctx.globalAlpha, angulo: Math.atan2(y - cursor.y, x - cursor.x),
        composicao: ctx.globalCompositeOperation,
      })
      cursor = { x, y }
    },
    fillRect(x: number, y: number, w: number, h: number) {
      tracos.push({ tipo: 'retangulo', x, y, raio: Math.hypot(w, h), alpha: ctx.globalAlpha, angulo: 0, composicao: ctx.globalCompositeOperation })
    },
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    rotate: () => {},
    globalCompositeOperation: 'source-over', fillStyle: '', strokeStyle: '',
    globalAlpha: 1, lineWidth: 1, lineCap: '',
    arc(x: number, y: number, raio: number) {
      tracos.push({ tipo: 'arc', x, y, raio, alpha: ctx.globalAlpha, angulo: 0, composicao: ctx.globalCompositeOperation })
    },
    ellipse(x: number, y: number, raio: number) {
      tracos.push({ tipo: 'ellipse', x, y, raio, alpha: ctx.globalAlpha, angulo: 0, composicao: ctx.globalCompositeOperation })
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, tracos }
}

/** Roda N quadros do clima e devolve tudo que foi desenhado atras das entidades. */
function fundo(clima: ClimaTipo, quadros = 10): Traco[] {
  const todos: Traco[] = []
  for (let i = 0; i < quadros; i++) {
    const { ctx, tracos } = ctxEspiao()
    desenharClimaFundo(ctx, clima, JANELA)
    todos.push(...tracos)
  }
  return todos
}

/** Um quadro da camada da frente, depois de N quadros de fundo (ela precisa do estado). */
function daFrente(clima: ClimaTipo, quadros = 6): Traco[] {
  fundo(clima, quadros)
  const { ctx, tracos } = ctxEspiao()
  desenharClimaFrente(ctx, clima, JANELA)
  return tracos
}

beforeEach(() => {
  let agora = 0
  vi.spyOn(performance, 'now').mockImplementation(() => (agora += PASSO_MS))
  useUiStore.setState({ vidaNoCenario: true, viewportWidth: 1200 })
  reiniciarClimaVisual()
  reiniciarAmbiente()
})

describe('todo clima desenha alguma coisa (PH-141)', () => {
  it.each(TODOS)('%s produz traço na camada de fundo', (clima) => {
    // Guarda anti-teste-vácuo do arquivo inteiro: um clima que não desenha nada
    // faria os testes de forma abaixo passarem por vacuidade.
    expect(fundo(clima).length).toBeGreaterThan(0)
  })

  it('céu limpo não desenha nada', () => {
    expect(fundo(null as unknown as ClimaTipo).length).toBe(0)
  })

  it('com a vida no cenário desligada, a camada não desenha', () => {
    // O ajuste existe para desempenho, e clima é a camada mais cara. Quem
    // desliga não pode continuar pagando por ela.
    useUiStore.setState({ vidaNoCenario: false })
    expect(fundo('chuva').length).toBe(0)
  })
})

describe('cada clima tem forma própria (PH-141)', () => {
  it('chuva risca na DIAGONAL, e não na horizontal nem na vertical', () => {
    // O erro clássico é desenhar o risco sempre horizontal: a gota fica
    // perpendicular à própria queda. Aqui o risco tem que apontar para onde a
    // partícula está indo.
    const linhas = fundo('chuva').filter((t) => t.tipo === 'linha')
    expect(linhas.length).toBeGreaterThan(0)
    // O risco é desenhado do ponto para a CAUDA, então ele aponta ao contrário
    // do movimento: a queda é PI/2 + 0.26 e a cauda sai em ~1,31 rad de módulo.
    // O que se afirma é a INCLINAÇÃO — nem horizontal (0), nem a prumo (PI/2).
    const anguloMedio = linhas.reduce((s, l) => s + Math.abs(l.angulo), 0) / linhas.length
    const desvioDaVertical = Math.abs(anguloMedio - Math.PI / 2)
    expect(desvioDaVertical).toBeGreaterThan(0.12) // não cai a prumo
    expect(desvioDaVertical).toBeLessThan(0.7) // e também não é chuva de lado
  })

  it('granizo tem QUINA, e neve não', () => {
    // O par que mais precisa se distinguir: um machuca, o outro não. Se os dois
    // fossem o mesmo círculo branco, o jogador não teria como saber qual está
    // tirando o HP dele.
    expect(fundo('granizo').some((t) => t.tipo === 'poligono')).toBe(true)
    expect(fundo('neve').some((t) => t.tipo === 'poligono')).toBe(false)
  })

  it('neve é CRISTAL de seis braços, e não bolinha branca', () => {
    // Seis braços, cada um com duas farpas em V: 6 + 12 = 18 segmentos por
    // floco. Bolinha branca é o que a neve era antes, e é indistinguível de
    // qualquer outra partícula clara do jogo.
    const linhas = fundo('neve', 1).filter((t) => t.tipo === 'linha')
    expect(linhas.length).toBeGreaterThan(0)
    expect(linhas.length % 18).toBe(0)
  })

  it('floco distante é ponto, e só o de perto vira cristal', () => {
    // Não é economia, é o que o olho faz: floco longe não tem braço resolvível.
    // Desenhar o cristal em TODOS deixa a nevasca com cara de adesivo repetido
    // e mata a profundidade que as três camadas constroem.
    const quadro = fundo('neve', 1)
    const cristais = quadro.filter((t) => t.tipo === 'linha').length / 18
    const pontos = quadro.filter((t) => t.tipo === 'arc').length - cristais
    expect(cristais).toBeGreaterThan(0)
    expect(pontos).toBeGreaterThan(0)
  })

  it('névoa é volume grande e translúcido, não bolinha cinza', () => {
    const elipses = fundo('nevoa').filter((t) => t.tipo === 'ellipse')
    expect(elipses.length).toBeGreaterThan(0)
    // Raio grande e alpha baixo é o que produz volume. Alpha alto com raio
    // pequeno produziria exatamente a bolinha cinza que isto evita.
    expect(Math.max(...elipses.map((e) => e.raio))).toBeGreaterThan(60)
    expect(Math.max(...elipses.map((e) => e.alpha))).toBeLessThan(0.35)
  })

  it('sol soma luz em vez de tapar o cenário', () => {
    // `lighter`: a mota de poeira no facho tem que BRILHAR. Em `source-over`
    // ela vira um ponto bege opaco por cima da arte.
    expect(fundo('sol').some((t) => t.composicao === 'lighter')).toBe(true)
  })

  it('areia corre quase na horizontal', () => {
    const linhas = fundo('areia').filter((t) => t.tipo === 'linha')
    expect(linhas.length).toBeGreaterThan(0)
    const anguloMedio = linhas.reduce((s, l) => s + Math.abs(l.angulo), 0) / linhas.length
    // A cauda aponta para trás, então o módulo fica perto de PI. O que se
    // afirma é que NÃO cai como chuva: longe de PI/2.
    expect(Math.abs(anguloMedio - Math.PI / 2)).toBeGreaterThan(1)
  })
})

describe('profundidade: perto é grande e rápido (PH-141)', () => {
  // Só o granizo: nele o raio desenhado É o tamanho da partícula. Na neve o
  // cristal desenha um núcleo pequeno e o ponto distante um círculo maior, duas
  // escalas diferentes — o raio deixou de ser proxy de tamanho, e comparar os
  // dois mediria o formato, não a profundidade. O acoplamento
  // tamanho/velocidade/alpha é um mecanismo só (`semearParticula`), então
  // testá-lo num clima cobre todos.
  it.each(['granizo'] as ClimaTipo[])('%s: partícula maior anda mais que a menor', (clima) => {
    // Um sorteio só manda em tamanho, velocidade e alpha. Sorteados separados,
    // sai floco grande e lento junto de floco pequeno e rápido — o contrário do
    // que a distância faz, e a cena perde as camadas.
    const quadros: Traco[][] = []
    for (let i = 0; i < 6; i++) {
      const { ctx, tracos } = ctxEspiao()
      desenharClimaFundo(ctx, clima, JANELA)
      quadros.push(tracos.filter((t) => t.tipo === 'arc' || t.tipo === 'poligono'))
    }
    const primeiro = quadros[1]
    const ultimo = quadros[5]
    expect(primeiro.length).toBe(ultimo.length)

    const comIndice = primeiro.map((p, i) => ({
      raio: p.raio || 1,
      andou: Math.hypot(ultimo[i].x - p.x, ultimo[i].y - p.y),
    }))
    const ordenado = [...comIndice].sort((a, b) => a.raio - b.raio)
    const menores = ordenado.slice(0, Math.floor(ordenado.length / 3))
    const maiores = ordenado.slice(-Math.floor(ordenado.length / 3))
    const media = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / Math.max(1, ns.length)
    expect(media(maiores.map((p) => p.andou))).toBeGreaterThan(media(menores.map((p) => p.andou)))
  })
})

describe('a camada da frente é o que põe o jogador DENTRO do clima (PH-141)', () => {
  it.each(TODOS)('%s cobre a cena com o filtro de cor', (clima) => {
    // O filtro é a primeira coisa que o olho lê, antes de identificar qualquer
    // floco. Retângulo do tamanho da janela = a cena inteira.
    const cobre = daFrente(clima).filter(
      (t) => t.tipo === 'retangulo' && t.raio >= Math.hypot(JANELA.w, JANELA.h) - 1,
    )
    expect(cobre.length).toBeGreaterThan(0)
  })

  it('neve e névoa CLAREIAM a cena; chuva e areia escurecem', () => {
    // Neve reflete luz por todos os lados e apaga a sombra — pintar por cima
    // com `source-over` deixaria a nevasca cinza e pesada, que é o oposto.
    const modo = (clima: ClimaTipo): string[] =>
      daFrente(clima).filter((t) => t.tipo === 'retangulo').map((t) => t.composicao)
    expect(modo('neve')).toContain('screen')
    expect(modo('nevoa')).toContain('screen')
    expect(modo('chuva')).not.toContain('screen')
    expect(modo('areia')).not.toContain('screen')
  })

  it('a passagem rasante é MAIS translúcida que a de trás', () => {
    // Ela passa por cima do POKE. Opaca, esconderia a luta — que é justamente
    // o que o jogador precisa ver.
    const atras = fundo('neve', 8).filter((t) => t.tipo === 'arc')
    const frente = daFrente('neve').filter((t) => t.tipo === 'arc')
    expect(frente.length).toBeGreaterThan(0)
    const maiorAlphaDaFrente = Math.max(...frente.map((t) => t.alpha))
    const maiorAlphaDeTras = Math.max(...atras.map((t) => t.alpha))
    expect(maiorAlphaDaFrente).toBeLessThan(maiorAlphaDeTras)
  })

  it('a passagem rasante é MAIOR que a de trás', () => {
    // Perto da lente = grande. Sem isso ela não lê como profundidade, lê como
    // partícula perdida.
    const atras = fundo('neve', 8).filter((t) => t.tipo === 'arc')
    const frente = daFrente('neve').filter((t) => t.tipo === 'arc')
    expect(Math.max(...frente.map((t) => t.raio))).toBeGreaterThan(Math.max(...atras.map((t) => t.raio)))
  })
})

describe('clima manda mais que arte quando os dois desenhariam a mesma coisa (PH-141)', () => {
  const CAVERNA_DE_GELO = 'assets/hunt-backgrounds/ice-cave.jpg'
  const FLORESTA = 'assets/hunt-backgrounds/forest.jpg'

  function ambiente(arte: string, clima: ClimaTipo | null): number {
    const total: Traco[] = []
    for (let i = 0; i < 6; i++) {
      const { ctx, tracos } = ctxEspiao()
      desenharAmbiente(ctx, arte, JANELA, familiaDoClima(clima))
      total.push(...tracos)
    }
    return total.length
  }

  it('a neve decorativa da caverna de gelo cala quando está NEVANDO', () => {
    // Sem isto, neve decorativa e neve-clima se somam e o jogador não separa "o
    // cenário é nevado" de "está nevando agora" — e um dos dois mexe no combate.
    expect(ambiente(CAVERNA_DE_GELO, null)).toBeGreaterThan(0)
    reiniciarAmbiente()
    expect(ambiente(CAVERNA_DE_GELO, 'neve')).toBe(0)
  })

  it('granizo também cala a neve decorativa — é a mesma família', () => {
    reiniciarAmbiente()
    expect(ambiente(CAVERNA_DE_GELO, 'granizo')).toBe(0)
  })

  it('chuva NÃO cala a folha da floresta: são duas coisas diferentes', () => {
    // Calar tudo seria mais simples e estaria errado: numa floresta chuvosa a
    // folha continua caindo, e as duas coisas são verdade ao mesmo tempo.
    reiniciarAmbiente()
    expect(ambiente(FLORESTA, 'chuva')).toBeGreaterThan(0)
  })
})

describe('familiaDoClima (PH-141)', () => {
  it('agrupa os dois climas de gelo, e só eles', () => {
    expect(familiaDoClima('neve')).toBe('neve')
    expect(familiaDoClima('granizo')).toBe('neve')
    expect(familiaDoClima('areia')).toBe('areia')
    expect(familiaDoClima('chuva')).toBeNull()
    expect(familiaDoClima(null)).toBeNull()
  })
})
