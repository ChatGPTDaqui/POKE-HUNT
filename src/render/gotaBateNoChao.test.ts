// @vitest-environment jsdom
//
// PH-232 — a gota tem que TERMINAR no chao, e o respingo tem que nascer, abrir
// e sumir.
//
// O QUE ESTE TESTE TRANCA
//
// Ate esta issue, NENHUMA particula do jogo tinha fim: toda uma delas
// atravessava a janela e renascia na borda oposta. Sem contato com o solo a
// particula flutua em espaco de tela e o olho nao tem contra o que aferir o
// tamanho dela — e por isso que a chuva do PH-141 vira papel de parede depois
// de trinta segundos, e por isso que "deixar tudo menor" sozinho nao teria
// resolvido a queixa que abriu a issue.
//
// Tres coisas podem quebrar aqui em silencio, e cada uma tem um caso:
//
//   1. O respingo parar de acontecer (a gota volta a atravessar a tela).
//   2. O respingo acontecer sempre na MESMA altura — o erro obvio de quem
//      trata "chao" como uma reta na base da tela. Nesta projecao (camera de
//      cima) o chao e a cena inteira, e a chuva cai sobre a area toda.
//   3. O respingo ficar plantado: abrir ate o raio maximo e nao morrer. Isso
//      nao da erro nenhum, so cobre o mapa de aneis parados.
import { describe, expect, it, beforeEach, vi } from 'vitest'

import { useUiStore } from '@/stores/uiStore'
import { desenharClimaFundo, reiniciarClimaVisual } from './climaVisual'
import {
  avancarGotas, criarEstadoDeGotas, desenharGotas, povoarGotas, respingosVivos,
  type ConfigDeGota,
} from './gotas'
import { desenharAmbiente, reiniciarAmbiente } from './ambiente'

const JANELA = { x: 0, y: 0, w: 900, h: 600 }
const PASSO_MS = 100

interface Anel { x: number; y: number; raio: number }

/**
 * Espiao que so anota ELIPSE FECHADA COM TRACO — a assinatura do anel de
 * respingo.
 *
 * As outras formas da chuva (risco de fundo e a propria gota) sao
 * `moveTo`/`lineTo`, e a microgota e `arc`. Filtrar por elipse+traco isola o
 * anel sem precisar de nenhum sinal que o codigo de producao tenha que
 * exportar so pra o teste.
 */
function ctxEspiao() {
  const aneis: Anel[] = []
  const pontos: Array<{ x: number; y: number }> = []
  let pendente: Anel | null = null
  const ctx = {
    save: () => {}, restore: () => {}, rotate: () => {}, fillRect: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    globalCompositeOperation: '', fillStyle: '', strokeStyle: '',
    globalAlpha: 1, lineWidth: 1, lineCap: '',
    closePath() {},
    beginPath() { pendente = null },
    moveTo() {}, lineTo() {},
    arc(x: number, y: number) { pontos.push({ x, y }) },
    ellipse(x: number, y: number, raio: number) { pendente = { x, y, raio } },
    fill() { pendente = null },
    stroke() { if (pendente) { aneis.push(pendente); pendente = null } },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, aneis, pontos }
}

/** Roda a camada de clima por N quadros e devolve os aneis de cada quadro. */
function rodarClima(clima: 'chuva' | 'neve' | 'granizo', quadros: number): Anel[][] {
  const porQuadro: Anel[][] = []
  for (let i = 0; i < quadros; i++) {
    const { ctx, aneis } = ctxEspiao()
    desenharClimaFundo(ctx, clima, JANELA)
    porQuadro.push(aneis)
  }
  return porQuadro
}

/** Chave estavel de um respingo: ele nao se move depois de nascer. */
function chave(a: Anel): string {
  return `${Math.round(a.x)}:${Math.round(a.y)}`
}

beforeEach(() => {
  let agora = 0
  vi.spyOn(performance, 'now').mockImplementation(() => (agora += PASSO_MS))
  useUiStore.setState({ vidaNoCenario: true, viewportWidth: 1200 })
  // Zera o INSTANTE, e nao so as particulas: sem isso o relogio falso deste
  // caso comeca atras do relogio do caso anterior e o primeiro delta sai
  // negativo. Ver `formaPorPreset.test.ts`.
  reiniciarClimaVisual()
  reiniciarAmbiente()
})

describe('a chuva pousa e respinga (PH-232)', () => {
  it('aparece respingo', () => {
    const total = rodarClima('chuva', 60).flat().length
    expect(total, 'a chuva rodou 6 segundos e nao encostou no chao nenhuma vez').toBeGreaterThan(0)
  })

  it('o respingo cai pela janela inteira, e nao numa linha so', () => {
    // O erro que este caso existe pra pegar: tratar "chao" como a base da
    // tela. Numa camera de cima o chao E a cena inteira.
    const ys = rodarClima('chuva', 60).flat().map((a) => a.y)
    expect(ys.length).toBeGreaterThan(10)
    const alcance = Math.max(...ys) - Math.min(...ys)
    expect(alcance / JANELA.h, `os respingos ocuparam so ${(alcance / JANELA.h * 100).toFixed(0)}% da altura`)
      .toBeGreaterThan(0.5)
  })

  it('nenhum respingo nasce fora da janela', () => {
    // A gota reciclada nasce ACIMA do topo. Se o ponto de impacto for sorteado
    // como "um trecho a frente dela", parte dos respingos cai fora da tela e
    // ninguem ve — falha silenciosa, o efeito so parece mais fraco.
    const fora = rodarClima('chuva', 60).flat()
      .filter((a) => a.y < JANELA.y || a.y > JANELA.y + JANELA.h)
    expect(fora.length, `${fora.length} respingo(s) fora da janela`).toBe(0)
  })

  it('nem quando a camera anda no meio da queda', () => {
    // O caso anterior roda com a janela PARADA, e no jogo ela nunca esta: a
    // camera segue o POKE a ~91 unidades/s. Um ponto de impacto sorteado ha
    // meio segundo pode ter ficado pra tras da janela, e o respingo sairia
    // fora da tela — desenho jogado fora que so aparece em movimento.
    //
    // A deriva aqui e maior que a do jogo de proposito: o que se quer e que a
    // guarda exista, nao reproduzir a velocidade exata do jogador.
    //
    // O que se mede e o NASCIMENTO de cada respingo, nao todo quadro dele. Um
    // respingo e uma marca no CHAO, em coordenada de mundo: e correto que ele
    // saia de vista quando a camera se afasta, do mesmo jeito que uma pedra
    // do cenario sai. O que seria errado e ele NASCER fora — ai ele nunca foi
    // visto por ninguem.
    const nascidosFora: Anel[] = []
    const jaVistos = new Set<string>()
    for (let i = 0; i < 80; i++) {
      const janela = { x: JANELA.x + i * 6, y: JANELA.y + i * 4, w: JANELA.w, h: JANELA.h }
      const { ctx, aneis } = ctxEspiao()
      desenharClimaFundo(ctx, 'chuva', janela)
      for (const a of aneis) {
        if (jaVistos.has(chave(a))) continue
        jaVistos.add(chave(a))
        const dentro = a.x >= janela.x && a.x <= janela.x + janela.w
          && a.y >= janela.y && a.y <= janela.y + janela.h
        if (!dentro) nascidosFora.push(a)
      }
    }
    expect(jaVistos.size, 'nenhum respingo nasceu — o caso nao mede nada').toBeGreaterThan(20)
    expect(
      nascidosFora.length,
      `${nascidosFora.length} respingo(s) nasceram fora da janela em movimento`,
    ).toBe(0)
  })

  it('cada respingo ABRE e depois SOME', () => {
    const quadros = rodarClima('chuva', 60)
    const porRespingo = new Map<string, number[]>()
    for (const quadro of quadros) {
      for (const a of quadro) {
        const lista = porRespingo.get(chave(a)) ?? []
        lista.push(a.raio)
        porRespingo.set(chave(a), lista)
      }
    }
    // Vidas curtas (0,30 a 0,48s) contra quadros de 0,1s: um respingo aparece
    // em 3 ou 4 quadros. Quem aparece em um so nao tem o que comparar.
    const comHistoria = [...porRespingo.values()].filter((r) => r.length >= 3)
    expect(comHistoria.length, 'nenhum respingo durou o bastante pra medir').toBeGreaterThan(3)

    for (const raios of comHistoria) {
      const cresceu = raios[raios.length - 1] > raios[0]
      expect(cresceu, `um respingo nao abriu: ${raios.map((r) => r.toFixed(1)).join(' -> ')}`).toBe(true)
    }
    // E some: o total de quadros em que um respingo aparece nao pode passar da
    // vida maxima (0,48s = 5 quadros de 0,1s, com folga de arredondamento).
    const maisLongo = Math.max(...comHistoria.map((r) => r.length))
    expect(maisLongo, 'um respingo ficou plantado na tela').toBeLessThanOrEqual(6)
  })

  it('o respingo lanca microgotas que se afastam do ponto de impacto', () => {
    // Sem elas o efeito e so um anel abrindo, que le como ondulacao de agua
    // parada — e nao como algo BATENDO no chao.
    const { ctx, aneis, pontos } = ctxEspiao()
    for (let i = 0; i < 40; i++) desenharClimaFundo(ctx, 'chuva', JANELA)
    expect(aneis.length).toBeGreaterThan(0)
    expect(pontos.length, 'nenhuma microgota foi desenhada').toBeGreaterThan(0)
    // Alguma microgota tem que estar longe do centro do anel mais proximo; se
    // todas ficassem coladas, elas seriam um ponto gordo, nao um espirro.
    const distancias = pontos.map((p) => {
      const perto = aneis.reduce(
        (melhor, a) => Math.min(melhor, Math.hypot(a.x - p.x, a.y - p.y)),
        Number.POSITIVE_INFINITY,
      )
      return perto
    })
    expect(Math.max(...distancias), 'as microgotas nao saem do lugar').toBeGreaterThan(2)
  })

  it('clima que nao e chuva nao respinga', () => {
    // Granizo bate no chao na vida real, e ficou de fora de propósito (ver o
    // campo `gotas` em `climaVisual.ts`): dois climas respingando no bioma de
    // gelo apagaria a diferenca entre o que machuca e o que nao machuca.
    expect(rodarClima('neve', 40).flat().length, 'neve respingou').toBe(0)
    expect(rodarClima('granizo', 40).flat().length, 'granizo respingou').toBe(0)
  })
})

describe('gotejo de ambiente so onde faz sentido (PH-232)', () => {
  function rodarAmbiente(imagem: string, quadros: number): Anel[] {
    reiniciarAmbiente()
    const todos: Anel[] = []
    for (let i = 0; i < quadros; i++) {
      const { ctx, aneis } = ctxEspiao()
      desenharAmbiente(ctx, imagem, JANELA)
      todos.push(...aneis)
    }
    return todos
  }

  it('selva e caverna pingam', () => {
    // 120 quadros = 12 segundos. A espera entre gotas vai ate 4s, entao um
    // recorte curto poderia nao pegar nenhum impacto e o teste ficaria
    // instavel sem que nada estivesse quebrado.
    expect(rodarAmbiente('assets/hunt-backgrounds/jungle.jpg', 120).length,
      'selva nao pingou em 12 segundos').toBeGreaterThan(0)
    expect(rodarAmbiente('assets/hunt-backgrounds/abyss.jpg', 120).length,
      'caverna nao pingou em 12 segundos').toBeGreaterThan(0)
  })

  it('floresta temperada, deserto e cidade nao pingam', () => {
    for (const arte of [
      'assets/hunt-backgrounds/forest.jpg',
      'assets/hunt-backgrounds/desert.jpg',
      'assets/hunt-backgrounds/town.jpg',
      'assets/hunt-backgrounds/ruins.jpg',
    ]) {
      expect(rodarAmbiente(arte, 120).length, `${arte} pingou e nao deveria`).toBe(0)
    }
  })
})

describe('o pool de respingos e fixo (PH-232)', () => {
  const CONFIG: ConfigDeGota = {
    cor: '#fff', corDoRespingo: '#fff',
    comprimento: [4, 8], espessura: [0.5, 1],
    velocidade: [600, 900], inclinacao: 0, espalhamento: 0, alpha: 0.6,
    raioDoRespingo: [2, 4], vidaDoRespingo: [0.3, 0.4], microgotas: 3,
    fracaoQuePousa: 1,
  }

  it('nunca passa da capacidade, por mais impacto que aconteca', () => {
    // Chuva torrencial de propósito: 200 gotas rapidas, todas pousando, numa
    // janela baixa. E o cenario em que um array que cresce sozinho estouraria.
    const estado = criarEstadoDeGotas(16)
    const rand = (() => { let s = 12345; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) })()
    const janelaBaixa = { x: 0, y: 0, w: 400, h: 120 }
    povoarGotas(estado, CONFIG, janelaBaixa, rand, 200)
    for (let i = 0; i < 300; i++) {
      avancarGotas(estado, CONFIG, janelaBaixa, 0.016, rand)
      expect(respingosVivos(estado)).toBeLessThanOrEqual(16)
    }
    expect(estado.respingos.length, 'o pool cresceu').toBe(16)
  })

  it('desenhar nao aloca nem muda o estado', () => {
    const estado = criarEstadoDeGotas(8)
    const rand = (() => { let s = 999; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) })()
    povoarGotas(estado, CONFIG, JANELA, rand, 20)
    for (let i = 0; i < 50; i++) avancarGotas(estado, CONFIG, JANELA, 0.016, rand)
    const antes = JSON.stringify(estado)
    const { ctx } = ctxEspiao()
    desenharGotas(ctx, estado, CONFIG)
    expect(JSON.stringify(estado), 'desenhar mexeu no estado').toBe(antes)
  })
})
