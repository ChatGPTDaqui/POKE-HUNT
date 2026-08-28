// @vitest-environment jsdom
//
// PH-232 — dois presets de ambiente nao podem desenhar a mesma coisa.
//
// O QUE ESTE TESTE TRANCA
//
// O PH-115 ja tinha atacado isto e resolveu so metade: folha virou elipse que
// tomba, neve ganhou profundidade e areia virou risco. Quatro presets ficaram
// no default — agua, poeira, cidade e brasa continuaram desenhando o MESMO
// `ctx.arc` cheio, variando so cor e raio. Quatro dos nove biomas mostrando a
// mesma bolinha e exatamente a queixa que abriu esta issue.
//
// `formaPorPreset.test.ts` (PH-115) afirma tres comportamentos NOMEADOS (a
// folha gira, a brasa pulsa, a neve tem profundidade). Ele passaria com agua,
// poeira e cidade identicas entre si — e passou. O que falta, e o que este
// arquivo faz, e a afirmacao NEGATIVA: nao existem dois presets com a mesma
// assinatura de desenho.
//
// COMO A ASSINATURA E MEDIDA
//
// O `ctx` e um espiao que agrupa as chamadas por caminho (`beginPath` ate
// `fill`/`stroke`) e devolve o conjunto de formas que cada preset emitiu, do
// tipo `ellipse:fill`, `arc:fill`, `linha2:stroke`. Comparar CONJUNTOS, e nao
// contagens, e o que faz o teste sobreviver a mudanca de quantidade de
// particula — o que ele afirma e "o vocabulario de formas e diferente", nao
// "o numero de bolinhas e diferente".
import { describe, expect, it, beforeEach, vi } from 'vitest'

import { useUiStore } from '@/stores/uiStore'
import { desenharAmbiente, presetDaArte, reiniciarAmbiente, type PresetAmbiente } from './ambiente'

/**
 * Uma arte por preset.
 *
 * `cave-volcanic` e nao `volcano` pra a brasa DE PROPOSITO: so `volcano` tem
 * mascara de lava, e a mascara liga os focos de brilho do PH-195, que
 * desenham elipse preenchida. Isso entraria na assinatura da brasa sem ser
 * particula nenhuma. As duas artes usam o mesmo preset, entao medir pela que
 * nao tem mascara mede a particula limpa.
 */
const ARTE_POR_PRESET: Record<Exclude<PresetAmbiente, 'nenhum'>, string> = {
  folha: 'assets/hunt-backgrounds/forest.jpg',
  selva: 'assets/hunt-backgrounds/jungle.jpg',
  agua: 'assets/hunt-backgrounds/lake.jpg',
  brasa: 'assets/hunt-backgrounds/cave-volcanic.jpg',
  poeira: 'assets/hunt-backgrounds/ruins.jpg',
  caverna: 'assets/hunt-backgrounds/abyss.jpg',
  neve: 'assets/hunt-backgrounds/mountain.jpg',
  areia: 'assets/hunt-backgrounds/desert.jpg',
  cidade: 'assets/hunt-backgrounds/town.jpg',
}

const JANELA = { x: 0, y: 0, w: 900, h: 600 }
/** Ver o cabecalho de `formaPorPreset.test.ts`: sem relogio falso o delta e ~0. */
const PASSO_MS = 100

function ctxEspiao() {
  const formas: string[] = []
  let noCaminho: string[] = []
  let lineTos = 0

  function fechar(pintura: 'fill' | 'stroke'): void {
    for (const f of noCaminho) formas.push(`${f}:${pintura}`)
    if (lineTos > 0) formas.push(`linha${lineTos}:${pintura}`)
    noCaminho = []
    lineTos = 0
  }

  const ctx = {
    save: () => {}, restore: () => {}, rotate: () => {},
    fillRect: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    globalCompositeOperation: '', fillStyle: '', strokeStyle: '',
    globalAlpha: 1, lineWidth: 1, lineCap: '',
    closePath() {},
    beginPath() { noCaminho = []; lineTos = 0 },
    arc() { noCaminho.push('arc') },
    ellipse() { noCaminho.push('ellipse') },
    moveTo() {},
    lineTo() { lineTos++ },
    fill() { fechar('fill') },
    stroke() { fechar('stroke') },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, formas }
}

/** Conjunto de formas que um preset emite ao longo de `quadros` quadros. */
function assinatura(imagem: string, quadros = 90): Set<string> {
  reiniciarAmbiente()
  const vistas = new Set<string>()
  for (let i = 0; i < quadros; i++) {
    const { ctx, formas } = ctxEspiao()
    desenharAmbiente(ctx, imagem, JANELA)
    for (const f of formas) vistas.add(f)
  }
  return vistas
}

function comoTexto(s: Set<string>): string {
  return [...s].sort().join(' + ')
}

beforeEach(() => {
  let agora = 0
  vi.spyOn(performance, 'now').mockImplementation(() => (agora += PASSO_MS))
  useUiStore.setState({ vidaNoCenario: true, viewportWidth: 1200 })
  reiniciarAmbiente()
})

describe('cada preset de ambiente tem silhueta propria (PH-232)', () => {
  const nomes = Object.keys(ARTE_POR_PRESET) as Array<Exclude<PresetAmbiente, 'nenhum'>>

  it('a tabela de artes deste teste bate com os presets reais', () => {
    // Guarda: preset novo sem arte aqui passaria despercebido, e o teste
    // deixaria de cobrir justamente o que acabou de entrar.
    for (const nome of nomes) {
      expect(presetDaArte(ARTE_POR_PRESET[nome]), `${nome} nao mapeia pra a arte escolhida`).toBe(nome)
    }
  })

  it('todo preset desenha alguma coisa (guarda contra o teste vazio)', () => {
    for (const nome of nomes) {
      expect(assinatura(ARTE_POR_PRESET[nome]).size, `${nome} nao desenhou nada`).toBeGreaterThan(0)
    }
  })

  it('os quatro que eram o mesmo circulo agora sao quatro coisas diferentes', () => {
    // O nucleo da issue. Antes do PH-232 os quatro emitiam exatamente
    // `arc:fill` e nada mais.
    const eramIguais = ['agua', 'poeira', 'cidade', 'brasa'] as const
    const vistas = new Map<string, string>()
    for (const nome of eramIguais) {
      const texto = comoTexto(assinatura(ARTE_POR_PRESET[nome]))
      const anterior = vistas.get(texto)
      expect(anterior, `${nome} desenha exatamente o mesmo que ${anterior}: ${texto}`).toBeUndefined()
      vistas.set(texto, nome)
    }
    expect(vistas.size).toBe(4)
  })

  it('nenhum dos quatro voltou a ser so um circulo cheio', () => {
    for (const nome of ['agua', 'cidade', 'brasa'] as const) {
      const s = assinatura(ARTE_POR_PRESET[nome])
      expect(comoTexto(s), `${nome} desenha so o circulo cheio de novo`).not.toBe('arc:fill')
    }
    // `poeira` CONTINUA sendo `arc:fill`, e isso esta certo: um grao de poeira
    // e um ponto. O que mudou nele foi a escala (ver
    // `proporcaoDasParticulas.test.ts`), e ele e o unico com licenca pra ser
    // um ponto puro — por isso esta fora da lista acima e dentro deste
    // comentario, pra a escolha ficar registrada em vez de parecer esquecimento.
    expect(comoTexto(assinatura(ARTE_POR_PRESET.poeira))).toBe('arc:fill')
  })

  it('o vocabulario de formas cobre a maior parte dos presets', () => {
    // Nao se exige 9 assinaturas para 9 presets: `neve` e `poeira` dividem o
    // ponto cheio de proposito (floco distante E um ponto), e o que os separa
    // e tamanho e cor. O que nao pode e o conjunto inteiro colapsar em duas ou
    // tres formas, que era o estado anterior.
    const todas = new Set(nomes.map((n) => comoTexto(assinatura(ARTE_POR_PRESET[n]))))
    expect(todas.size, `so ${todas.size} silhuetas distintas: ${[...todas].join(' | ')}`)
      .toBeGreaterThanOrEqual(7)
  })

  it('so os presets umidos desenham o anel de respingo', () => {
    // Anel fechado com traco (`ellipse:stroke`) e a assinatura do respingo de
    // gota — e tambem a da ondulacao de agua (PH-113), que so existe onde ha
    // mascara. Deserto, cidade e vulcao nao tem nem um nem outro: se aparecer
    // ali, alguem ligou gotejo no preset errado.
    const temAnel = (nome: Exclude<PresetAmbiente, 'nenhum'>) =>
      assinatura(ARTE_POR_PRESET[nome]).has('ellipse:stroke')
    expect(temAnel('selva'), 'selva perdeu o gotejo').toBe(true)
    expect(temAnel('caverna'), 'caverna perdeu o gotejo').toBe(true)
    expect(temAnel('agua'), 'agua perdeu a ondulacao do PH-113').toBe(true)
    for (const seco of ['areia', 'cidade', 'brasa', 'poeira', 'neve', 'folha'] as const) {
      expect(temAnel(seco), `${seco} esta respingando agua e nao deveria`).toBe(false)
    }
  })
})
