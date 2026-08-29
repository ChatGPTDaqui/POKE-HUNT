// @vitest-environment jsdom
//
// PH-233 — o vento é UM, e as duas camadas de enfeite sopram junto.
//
// O QUE ESTE TESTE TRANCA
//
// Antes desta issue havia três osciladores independentes na mesma tela:
// `intensidadeDoVento` (PH-188) dirigindo só a folha, uma senoide própria da
// areia de clima (`1 + sin(fase * 0.5) * 0.45`), e inclinação FIXA em todo o
// resto. Numa floresta com chuva a folha entrava em rajada enquanto a chuva
// continuava caindo no mesmo ângulo de sempre.
//
// O modo de essa unificação se desfazer é sempre o mesmo: alguém precisa de
// "só um balancinho aqui" e escreve mais um `Math.sin(fase * ...)` dentro de
// uma das camadas. Nenhum teste de comportamento pega isso — a camada nova
// oscila, então parece que funciona. O caso estático abaixo é o que pega.
//
// A OUTRA metade é o relógio. Duas camadas chamando a mesma função com fases
// diferentes não é vento compartilhado: é o mesmo bug com uma indireção por
// cima. Por isso `sincronizarVento` ATRIBUI a fase em vez de somar, e há caso
// para a idempotência.
import { describe, expect, it, beforeEach, vi } from 'vitest'

import { useUiStore } from '@/stores/uiStore'
import { desenharAmbiente, reiniciarAmbiente, RECEITAS as AMBIENTE } from './ambiente'
import { desenharClimaFundo, reiniciarClimaVisual, RECEITAS as CLIMA } from './climaVisual'
import { faseDoVento, intensidadeDoVento, reiniciarVento, sincronizarVento, ventoAgora } from './vento'

import fonteDoAmbiente from './ambiente.ts?raw'
import fonteDoClima from './climaVisual.ts?raw'

const JANELA = { x: 0, y: 0, w: 900, h: 600 }
const PASSO_MS = 100

interface Ponto { x: number; y: number }

function ctxEspiao() {
  const pontos: Ponto[] = []
  const ctx = {
    save: () => {}, restore: () => {}, rotate: () => {}, fillRect: () => {},
    beginPath: () => {}, closePath: () => {}, fill: () => {}, stroke: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    globalCompositeOperation: '', fillStyle: '', strokeStyle: '',
    globalAlpha: 1, lineWidth: 1, lineCap: '',
    moveTo(x: number, y: number) { pontos.push({ x, y }) },
    lineTo() {},
    arc(x: number, y: number) { pontos.push({ x, y }) },
    ellipse(x: number, y: number) { pontos.push({ x, y }) },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, pontos }
}

/**
 * Instantes de rajada MÍNIMA e MÁXIMA num intervalo.
 *
 * Mesma estratégia do `ventoNaFolhagem.test.ts` (PH-188): em vez de escolher um
 * instante e torcer para que haja rajada nele, procura os dois extremos da
 * própria função e mede a diferença entre eles. Sem isso o teste passaria ou
 * falharia conforme a sorte da fase em que caiu.
 */
function extremosDoVento(ateSegundos: number): { calmaria: number; pico: number; amplitude: number } {
  let calmaria = 0, pico = 0, minimo = Infinity, maximo = -Infinity
  for (let t = 2; t < ateSegundos; t += 0.5) {
    const v = intensidadeDoVento(t)
    if (v < minimo) { minimo = v; calmaria = t }
    if (v > maximo) { maximo = v; pico = t }
  }
  return { calmaria, pico, amplitude: maximo - minimo }
}

/**
 * Deslocamento HORIZONTAL médio por quadro de uma camada, num instante de vento.
 *
 * O relógio falso COMEÇA em `instante` em vez de em zero, e é essa a única
 * forma de a medição significar alguma coisa: quem chama `sincronizarVento` é a
 * própria camada, com o `performance.now()` que ela mesma lê. Fixar a fase por
 * fora, depois de desenhar, seria sobrescrito no quadro seguinte — a primeira
 * versão deste teste fazia isso e as duas medições davam exatamente o mesmo
 * número, que é como ela foi pega.
 *
 * A fase anda 1,4s ao longo dos 14 quadros. É desprezível de propósito: a onda
 * mais rápida da rajada tem 0,23 rad/s, ou seja, período de ~27s.
 */
function derivaHorizontal(
  desenhar: (ctx: CanvasRenderingContext2D) => void, instante: number, quadros = 14,
): number {
  let agora = instante * 1000
  vi.spyOn(performance, 'now').mockImplementation(() => (agora += PASSO_MS))
  reiniciarAmbiente()
  reiniciarClimaVisual()
  reiniciarVento()

  const historico: Ponto[][] = []
  for (let i = 0; i < quadros; i++) {
    const { ctx, pontos } = ctxEspiao()
    desenhar(ctx)
    historico.push(pontos)
  }

  const deltas: number[] = []
  for (let i = 1; i < historico.length; i++) {
    const anterior = historico[i - 1]
    for (let p = 0; p < historico[i].length; p++) {
      if (!anterior[p]) continue
      const dx = historico[i][p].x - anterior[p].x
      // Quem reciclou salta a janela inteira nesse passo e não mede deriva
      // nenhuma — só entra ruído. Meia janela é folga larga.
      if (Math.abs(dx) < JANELA.w / 2) deltas.push(dx)
    }
  }
  expect(deltas.length, 'amostra pequena demais para comparar deriva').toBeGreaterThan(8)
  return deltas.reduce((a, b) => a + b, 0) / deltas.length
}

/** Comentário fora antes de procurar: os arquivos FALAM de rajada o tempo todo. */
function semComentario(bruto: string): string {
  return bruto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

beforeEach(() => {
  useUiStore.setState({ vidaNoCenario: true, viewportWidth: 1200 })
  reiniciarAmbiente()
  reiniciarClimaVisual()
  reiniciarVento()
})

describe('o vento mora num lugar só (PH-233)', () => {
  it('nenhuma das duas camadas ganhou oscilador de relógio novo', () => {
    // Vento paralelo sempre volta a nascer do mesmo jeito: alguém precisa de
    // "só um balancinho aqui" e escreve mais uma senoide sobre o relógio de
    // MÓDULO da camada. Este caso conta quantas existem e trava no conjunto
    // conhecido; a quarta reprova e o autor tem que justificá-la.
    //
    // O que está na conta, e por que cada uma é legítima:
    //
    //   ambiente.ts, 2x — as duas ondas do pulso de cada foco de brilho de
    //   lava (PH-195). É luz respirando na fonte, não vento: lava não sopra.
    //
    //   climaVisual.ts, 1x — o bamboleio lento dos feixes de sol
    //   (`desenharRaios`). É luz também; feixe de sol não é matéria e não é
    //   empurrado por rajada.
    //
    // O que NÃO entra na conta, e nem deveria: `Math.sin(p.fase)` por
    // partícula (bamboleio, pulso de alpha). Aquilo é oscilação individual,
    // com fase sorteada no nascimento — o oposto de um relógio global.
    const conta = (fonte: string, padrao: RegExp) => (semComentario(fonte).match(padrao) || []).length
    expect(
      conta(fonteDoAmbiente, /Math\.sin\(\s*faseGlobal/g),
      'ambiente.ts ganhou (ou perdeu) uma senoide sobre `faseGlobal`. As 2 conhecidas são o '
      + 'pulso do brilho de lava. Se a nova é vento, ela pertence a vento.ts.',
    ).toBe(2)
    expect(
      conta(fonteDoClima, /Math\.sin\(\s*fase\s*\*/g),
      'climaVisual.ts ganhou (ou perdeu) uma senoide sobre `fase`. A 1 conhecida é o bamboleio '
      + 'dos feixes de sol. Se a nova é vento, ela pertence a vento.ts.',
    ).toBe(1)
  })

  it('a rajada do clima vem de `ventoAgora`, e não de conta local', () => {
    // O guard de contagem acima é indireto. Este afirma a coisa em si: o
    // multiplicador de rajada é lido do vento compartilhado.
    expect(semComentario(fonteDoClima)).toMatch(/receita\.rajada\s*\?\s*1\s*\+\s*vento\s*\*/)
  })

  it('as duas camadas importam a mesma origem de vento', () => {
    for (const [nome, fonte] of [['ambiente.ts', fonteDoAmbiente], ['climaVisual.ts', fonteDoClima]] as const) {
      expect(semComentario(fonte), `${nome} nao importa de ./vento`).toMatch(/from\s+'\.\/vento'/)
    }
  })

  it('a rajada continua sendo a do PH-188, e não uma curva nova', () => {
    // Guarda de regressão do que já estava calibrado: bursty, não respiração
    // regular. Se alguém trocar a curva ao mover de arquivo, isto reprova.
    const amostras: number[] = []
    for (let t = 0; t < 600; t += 0.25) amostras.push(intensidadeDoVento(t))
    const media = amostras.reduce((a, b) => a + b, 0) / amostras.length
    expect(Math.min(...amostras)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...amostras)).toBeLessThanOrEqual(1)
    expect(Math.max(...amostras)).toBeGreaterThan(0.4)
    expect(media, 'ficou alta demais — lê como vento constante, não rajada').toBeLessThan(0.3)
  })
})

describe('o relógio do vento é absoluto, não acumulado (PH-233)', () => {
  it('sincronizar duas vezes com o mesmo instante não adianta o vento', () => {
    // A propriedade que faz a ordem de chamada entre as camadas não importar.
    // Se isto virar `fase += ...`, cada camada empurra o vento um passo por
    // quadro e ele passa a correr ao dobro da velocidade — sem erro nenhum.
    sincronizarVento(12_345)
    const uma = ventoAgora()
    sincronizarVento(12_345)
    sincronizarVento(12_345)
    expect(ventoAgora()).toBe(uma)
    expect(faseDoVento()).toBe(12.345)
  })

  it('a fase é o instante em segundos, venha de onde vier', () => {
    sincronizarVento(7_000)
    expect(faseDoVento()).toBe(7)
    expect(ventoAgora()).toBeCloseTo(intensidadeDoVento(7), 12)
    // Voltar no tempo também é aceito: é atribuição, não acumulação. Importa
    // porque uma camada que entra no meio (o clima aparece na troca de sala)
    // não pode nascer com o vento em fase diferente da outra.
    sincronizarVento(3_000)
    expect(faseDoVento()).toBe(3)
  })
})

describe('quem o vento empurra, e quem ele não empurra (PH-233)', () => {
  const { calmaria, pico, amplitude } = extremosDoVento(600)

  it('há rajada distinguível para medir contra', () => {
    expect(amplitude, 'a função não varia o bastante para o teste significar algo').toBeGreaterThan(0.3)
  })

  it('a chuva corre mais de lado no pico do que na calmaria', () => {
    const chuva = (ctx: CanvasRenderingContext2D) => desenharClimaFundo(ctx, 'chuva', JANELA)
    const noPico = derivaHorizontal(chuva, pico)
    const naCalmaria = derivaHorizontal(chuva, calmaria)
    expect(noPico - naCalmaria, 'a chuva não inclinou na rajada').toBeGreaterThan(0)
  })

  it('a areia do clima corre mais no pico do que na calmaria', () => {
    // A areia responde por DOIS caminhos: `empuxoDoVento` (deriva lateral, como
    // todo mundo) e `rajada` (a velocidade inteira sobe). Conferido sabotando
    // um de cada vez: com o empuxo zerado este caso continua verde, porque a
    // rajada sozinha já produz a diferença.
    //
    // Fica registrado pra ninguém ler este caso como prova do empuxo — quem
    // prova o empuxo é a chuva, que não tem `rajada`. Quem prova que a rajada
    // vem do vento compartilhado é o caso estático lá em cima.
    const areia = (ctx: CanvasRenderingContext2D) => desenharClimaFundo(ctx, 'areia', JANELA)
    expect(derivaHorizontal(areia, pico) - derivaHorizontal(areia, calmaria)).toBeGreaterThan(0)
  })

  it('a folha do cenário corre mais no pico do que na calmaria', () => {
    const folha = (ctx: CanvasRenderingContext2D) =>
      desenharAmbiente(ctx, 'assets/hunt-backgrounds/forest.jpg', JANELA)
    expect(derivaHorizontal(folha, pico) - derivaHorizontal(folha, calmaria)).toBeGreaterThan(0)
  })

  it('lugar fechado não tem vento: caverna, ruína e água não se mexem', () => {
    // A parte da issue que é mais fácil de quebrar por descuido — basta alguém
    // achar que "todo mundo devia balançar um pouquinho". Sopro dentro de uma
    // gruta selada é pior que a incoerência que o PH-233 veio corrigir, e a
    // cintilância da água é reflexo de superfície: reflexo não voa.
    const fechados = [
      ['caverna', 'assets/hunt-backgrounds/abyss.jpg'],
      ['poeira', 'assets/hunt-backgrounds/ruins.jpg'],
      ['agua', 'assets/hunt-backgrounds/lake.jpg'],
    ] as const
    for (const [nome, arte] of fechados) {
      const desenhar = (ctx: CanvasRenderingContext2D) => desenharAmbiente(ctx, arte, JANELA)
      const diferenca = Math.abs(derivaHorizontal(desenhar, pico) - derivaHorizontal(desenhar, calmaria))
      expect(diferenca, `${nome} reagiu ao vento e não deveria`).toBeLessThan(0.001)
    }
  })

  it('a lista de quem NÃO tem vento está escrita na receita, e não só no comportamento', () => {
    // O caso acima mede o efeito; este trava a INTENÇÃO. Sem ele, alguém pode
    // declarar `empuxoDoVento: 0` achando que "desligou" e o próximo a mexer
    // não distingue "escolhi zero" de "esqueci de preencher" — a ausência do
    // campo é a declaração.
    for (const preset of ['caverna', 'poeira', 'agua'] as const) {
      expect(AMBIENTE[preset].empuxoDoVento, `${preset} passou a declarar empuxo`).toBeUndefined()
    }
    for (const preset of ['folha', 'selva', 'areia', 'cidade', 'brasa', 'neve'] as const) {
      expect(AMBIENTE[preset].empuxoDoVento, `${preset} perdeu o empuxo`).toBeGreaterThan(0)
    }
    for (const clima of ['chuva', 'areia', 'neve', 'granizo', 'nevoa', 'sol'] as const) {
      expect(CLIMA[clima].empuxoDoVento, `clima ${clima} ficou sem empuxo`).toBeGreaterThan(0)
    }
  })

  it('o clima é mais empurrado que a decoração do bioma', () => {
    // Mesma hierarquia da escala (PH-232): clima é evento que mexe no combate,
    // decoração é fundo. Tempestade de areia tem que soprar mais forte que a
    // areia parada do deserto, senão o jogador não distingue as duas.
    expect(CLIMA.areia.empuxoDoVento!).toBeGreaterThan(AMBIENTE.areia.empuxoDoVento!)
    expect(CLIMA.neve.empuxoDoVento!).toBeGreaterThan(AMBIENTE.neve.empuxoDoVento!)
  })
})
