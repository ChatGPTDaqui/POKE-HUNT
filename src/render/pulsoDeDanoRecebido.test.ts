// PH-189 — "estou perdendo a luta?" precisa de um canal que leia de relance.
//
// A placa vermelha do PH-131 responde OUTRA pergunta ("de quem e este numero?")
// e continua existindo — sao canais separados pro mesmo fato, e por isso nunca
// discordam. O que faltava era um sinal que nao exigisse PROCURAR um numero de
// 12px no meio de sete textos.
//
// O que este arquivo tranca:
//   - so dano no MEU POKE acende;
//   - a intensidade vem da FRACAO de vida, nao do numero cru (o mesmo 40 de dano
//     e arranhao num POKE de 300 e quase morte num de 45);
//   - a soma de claroes tem teto (uma sequencia de hits nao pinta a tela);
//   - o clarao acaba;
//   - o mesmo efeito nao acende duas vezes, e um id REPETIDO de um mundo novo
//     acende de novo (os ids reiniciam a cada flush).
import { beforeEach, describe, expect, it } from 'vitest'

import {
  converterDanoNovo, opacidadeAtual, pintorDeDano, reiniciarPulsoDeDano, temDanoVivo,
  type EfeitoDeDano,
} from './pulsoDeDanoRecebido'
import type { PintorInfo } from './tiposDeVfx'

function ctxEspiao() {
  const retangulos: { x: number; y: number; w: number; h: number }[] = []
  let alfaNoDesenho = 0
  const alvo = {
    globalAlpha: 1, fillStyle: '' as unknown,
    save() {}, restore() {},
    createLinearGradient() { return { addColorStop() {} } as unknown as CanvasGradient },
    fillRect(x: number, y: number, w: number, h: number) {
      alfaNoDesenho = alvo.globalAlpha
      retangulos.push({ x, y, w, h })
    },
  }
  return { ctx: alvo as unknown as CanvasRenderingContext2D, retangulos, alfa: () => alfaNoDesenho }
}

const QUADRO: PintorInfo = { largura: 390, altura: 844, dt: 1 / 60 }

function dano(id: string, ownerId: string | null, value: number): EfeitoDeDano {
  return { id, type: 'damageNumber', ownerId, value }
}

beforeEach(() => reiniciarPulsoDeDano())

describe('borda de dano recebido (PH-189)', () => {
  it('so dano no MEU POKE acende', () => {
    converterDanoNovo([dano('e1', 'enemy-1', 90)], 'player-1', 200)
    expect(temDanoVivo()).toBe(false)

    converterDanoNovo([dano('e2', 'player-1', 90)], 'player-1', 200)
    expect(temDanoVivo()).toBe(true)
  })

  it('o MESMO numero de dano acende mais num POKE com menos vida', () => {
    // 40 de dano e arranhao num POKE de 300 e quase a morte num de 45. Ler o
    // numero cru faria os dois acenderem igual, e ai o canal mente.
    converterDanoNovo([dano('e1', 'player-1', 40)], 'player-1', 300)
    const arranhao = opacidadeAtual()

    reiniciarPulsoDeDano()
    converterDanoNovo([dano('e1', 'player-1', 40)], 'player-1', 45)
    expect(opacidadeAtual()).toBeGreaterThan(arranhao)
  })

  it('abaixo da saturacao, dobrar a fracao perdida dobra a intensidade', () => {
    converterDanoNovo([dano('e1', 'player-1', 15)], 'player-1', 300)
    const metade = opacidadeAtual()

    reiniciarPulsoDeDano()
    converterDanoNovo([dano('e1', 'player-1', 30)], 'player-1', 300)
    expect(opacidadeAtual()).toBeCloseTo(metade * 2, 6)
  })

  it('uma sequencia de hits nao pinta a tela de vermelho', () => {
    for (let i = 0; i < 8; i++) converterDanoNovo([dano(`e${i}`, 'player-1', 200)], 'player-1', 200)
    // Teto, e nao a soma dos oito. Um canal que satura a tela para de informar.
    expect(opacidadeAtual()).toBeLessThanOrEqual(0.38)
  })

  it('o clarao acaba', () => {
    converterDanoNovo([dano('e1', 'player-1', 100)], 'player-1', 200)
    const { ctx } = ctxEspiao()
    // 0,5s de quadros — a duracao e 0,45s.
    for (let i = 0; i < 30; i++) pintorDeDano(ctx, QUADRO)
    expect(temDanoVivo()).toBe(false)
    expect(opacidadeAtual()).toBe(0)
  })

  it('desenha as QUATRO bordas e deixa o centro intocado', () => {
    converterDanoNovo([dano('e1', 'player-1', 100)], 'player-1', 200)
    const { ctx, retangulos, alfa } = ctxEspiao()
    pintorDeDano(ctx, QUADRO)
    expect(retangulos).toHaveLength(4)
    expect(alfa()).toBeGreaterThan(0)
    // Nenhuma faixa cobre o meio da tela: um alerta que atrapalha ver o combate
    // e um alerta que o jogador vai querer desligar.
    const meio = { x: 195, y: 422 }
    for (const r of retangulos) {
      const cobreOMeio = meio.x > r.x && meio.x < r.x + r.w && meio.y > r.y && meio.y < r.y + r.h
      expect(cobreOMeio).toBe(false)
    }
  })

  it('o mesmo efeito nao acende duas vezes', () => {
    const efeitos = [dano('e1', 'player-1', 100)]
    converterDanoNovo(efeitos, 'player-1', 200)
    const depoisDoPrimeiro = opacidadeAtual()
    converterDanoNovo(efeitos, 'player-1', 200)
    expect(opacidadeAtual()).toBe(depoisDoPrimeiro)
  })

  it('id repetido de um MUNDO NOVO acende de novo', () => {
    // `createWorldEffect` numera a partir de `counters.effect`, que zera toda vez
    // que o mundo e reconstruido (a cada flush). Um conjunto de vistos acumulado
    // engoliria o dano seguinte em silencio.
    converterDanoNovo([dano('effect-3', 'player-1', 100)], 'player-1', 200)
    converterDanoNovo([], 'player-1', 200) // o mundo virou: o efeito sumiu
    reiniciarPulsoDeDanoSemVistos()
    converterDanoNovo([dano('effect-3', 'player-1', 100)], 'player-1', 200)
    expect(temDanoVivo()).toBe(true)
  })
})

/** Zera so os claroes, mantendo o que a deteccao ja viu — pra o caso acima
 * provar que quem deixou o id passar de novo foi a PODA, e nao o reset. */
function reiniciarPulsoDeDanoSemVistos(): void {
  const { ctx } = ctxEspiao()
  for (let i = 0; i < 40; i++) pintorDeDano(ctx, QUADRO)
}
