// PH-131 — o numero de dano tem que responder tres perguntas ao mesmo tempo.
//
//   quanto doeu contra ESTE tipo?  -> cor do numero (efetividade)
//   esse hit foi critico?          -> tamanho + marca escrita
//   esse dano foi EM MIM?          -> cor do contorno
//
// Antes so a primeira existia. O critico multiplica o dano e nao aparecia em
// lugar nenhum: `computeDamage` calculava `isCrit`, o campo viajava no
// `DamageResult`, e o unico consumidor era a trait Anger Point. O jogador via o
// mesmo golpe tirar numeros muito diferentes sem nada explicando — que le como
// sorte, ou como bug.
//
// Os tres testes sao sobre CANAIS SEPARADOS, e nao sobre pixel: o que nao pode
// voltar e uma pergunta perder o canal dela (ou dividir com outra, o que faz uma
// esconder a outra).
import { describe, expect, it } from 'vitest'

import { drawEffect } from './sprites'
import type { WorldEffect, WorldEntity, WorldState } from '@/engine/types'

/**
 * Espiao de canvas: guarda o que foi ESCRITO e com que estilo, que e a unica
 * coisa que este teste julga. Sem `ellipse`/gradiente porque numero de dano nao
 * desenha forma nenhuma — ver render/ambiente.test.ts para o espiao completo.
 */
function ctxEspiao() {
  const escritas: { texto: string; font: string; fill: string; stroke: string }[] = []
  /** Cor de cada `fill()` de FORMA — e ali que a placa de dano recebido mora. */
  const formas: string[] = []
  const alvo = {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineJoin: '',
    textAlign: '',
    globalAlpha: 1,
    save() {},
    restore() {},
    measureText: (t: string) => ({ width: t.length * 7 }),
    fillText(texto: string) {
      escritas.push({
        texto,
        font: alvo.font,
        fill: String(alvo.fillStyle),
        stroke: String(alvo.strokeStyle),
      })
    },
    strokeText() {},
    beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, stroke() {},
    fill() { formas.push(String(alvo.fillStyle)) },
  }
  return { ctx: alvo as unknown as CanvasRenderingContext2D, escritas, formas }
}

function entidade(id: string): WorldEntity {
  // O minimo que `effectAnchor`/`visualTopOffset` leem. `battleAnim` nulo faz
  // `visualTopOffset` cair no raio, sem precisar de sprite carregada.
  return { id, x: 100, y: 100, radius: 16, battleAnim: null } as unknown as WorldEntity
}

const JOGADOR = entidade('player-1')
const INIMIGO = entidade('enemy-1')

function mundo(): WorldState {
  return { player: JOGADOR, enemies: [INIMIGO] } as unknown as WorldState
}

function numeroDeDano(over: Partial<WorldEffect>): WorldEffect {
  return {
    id: 'e1',
    type: 'damageNumber',
    x: 100, y: 100, targetX: 100, targetY: 60,
    radius: 10,
    color: '#ffffff',
    duration: 0.9,
    delay: 0,
    age: 0.1,
    value: 42,
    lane: 0,
    laneSize: 1,
    ownerId: INIMIGO.id,
    ...over,
  } as WorldEffect
}

/** Tamanho em px declarado na `font`, que e o canal pre-atentivo do critico. */
function px(font: string): number {
  return Number(font.match(/(\d+)px/)?.[1] ?? 0)
}

function desenhar(effect: WorldEffect) {
  const { ctx, escritas, formas } = ctxEspiao()
  drawEffect(ctx, effect, mundo())
  return Object.assign(escritas, { formas })
}

describe('leitura do numero de dano (PH-131)', () => {
  it('o hit normal escreve o numero, e nada de critico', () => {
    // Guarda anti-teste-vacuo dos outros dois: se o desenho parar de escrever o
    // numero, as comparacoes abaixo ficariam entre listas vazias.
    const escritas = desenhar(numeroDeDano({}))
    expect(escritas.map((e) => e.texto)).toContain('-42')
    expect(escritas.map((e) => e.texto)).not.toContain('CRIT')
  })

  it('o critico escreve a marca E cresce — nao depende da cor', () => {
    const normal = desenhar(numeroDeDano({}))
    const critico = desenhar(numeroDeDano({ isCrit: true }))

    const numeroNormal = normal.find((e) => e.texto === '-42')!
    const numeroCritico = critico.find((e) => e.texto === '-42')!

    expect(
      critico.map((e) => e.texto),
      'critico sem marca escrita: numero grande sozinho le como variacao, nao como causa',
    ).toContain('CRIT')
    expect(
      px(numeroCritico.font),
      'critico sem tamanho proprio: perde o canal que se le antes de qualquer texto',
    ).toBeGreaterThan(px(numeroNormal.font))
    // A COR do numero nao pode ser o que distingue critico: ela e efetividade.
    expect(numeroCritico.fill).toBe(numeroNormal.fill)
  })

  it('critico e super efetivo aparecem os DOIS, sem um esconder o outro', () => {
    const escritas = desenhar(numeroDeDano({
      isCrit: true,
      effectiveness: 'super',
      effectivenessLabel: 'Super efetivo!',
      color: '#ff8c1a',
    }))
    const textos = escritas.map((e) => e.texto)
    expect(textos).toContain('CRIT')
    expect(textos).toContain('Super efetivo!')
    expect(textos).toContain('-42')
  })

  it('dano recebido pelo jogador ganha placa de fundo, e a cor segue sendo efetividade', () => {
    const causado = desenhar(numeroDeDano({ ownerId: INIMIGO.id, color: '#ff8c1a' }))
    const recebido = desenhar(numeroDeDano({ ownerId: JOGADOR.id, color: '#ff8c1a' }))

    // A primeira tentativa foi trocar a cor do CONTORNO, e olhando no harness
    // ela reprovou: 3px de contorno sob preenchimento laranja nao se distingue
    // do preto. Fundo e AREA, que le de relance.
    expect(
      recebido.formas.length,
      'dano recebido sem placa: numa luta com varios inimigos nao da pra saber o que ' +
        'voce esta levando, e contorno de 3px nao resolve isso',
    ).toBeGreaterThan(causado.formas.length)
    expect(recebido.formas.some((c) => c.includes('153, 27, 27'))).toBe(true)

    // O canal da efetividade fica intacto nos dois — e o contorno tambem, que
    // e legibilidade, nao autoria.
    const nCausado = causado.find((e) => e.texto === '-42')!
    const nRecebido = recebido.find((e) => e.texto === '-42')!
    expect(nRecebido.fill).toBe(nCausado.fill)
    expect(nRecebido.stroke).toBe(nCausado.stroke)
  })

  it('dano causado nao desenha placa nenhuma', () => {
    // O par do teste acima: se a placa saisse sempre, ela nao diria nada.
    expect(desenhar(numeroDeDano({ ownerId: INIMIGO.id })).formas).toEqual([])
  })

  it('o `immune` mantem contorno branco', () => {
    // Preenchimento preto com contorno preto desapareceria na cena.
    const escritas = desenhar(numeroDeDano({ ownerId: JOGADOR.id, color: '#000000' }))
    expect(escritas.find((e) => e.texto === '-42')!.stroke).toBe('#ffffff')
  })
})

describe('cor de efetividade (PH-131)', () => {
  it('resistido nao volta a ser cinza escuro', async () => {
    // A cor mora no motor (`combatSystem#EFFECTIVENESS_COLORS`) e chega aqui
    // pronta no efeito, entao o teste le a fonte: e o valor que importa, e ele
    // nao esta exportado.
    const fonte = (await import('@/engine/systems/combatSystem.ts?raw')).default as string
    const bloco = fonte.slice(fonte.indexOf('EFFECTIVENESS_COLORS'))
    const weak = bloco.match(/weak:\s*'(#[0-9a-fA-F]{6})'/)?.[1]
    expect(weak, 'a chave `weak` sumiu do bloco de cores — regex quebrada?').toBeDefined()

    // Luminancia relativa simples: soma dos canais. `#5a5a5a` dava 270 sobre
    // fundo escuro com contorno preto, e era o caso que o jogador mais precisa
    // ler ("meu golpe nao esta funcionando").
    const soma = [1, 3, 5].reduce((t, i) => t + parseInt(weak!.slice(i, i + 2), 16), 0)
    expect(soma, `weak=${weak} escuro demais para o fundo da hunt`).toBeGreaterThan(330)

    // ...e continua o mais APAGADO da escala: se ficar mais claro que `normal`
    // (#ffffff = 765), "resistido" viraria destaque.
    expect(soma).toBeLessThan(765)
  })
})

