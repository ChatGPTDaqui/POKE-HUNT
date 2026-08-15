// Os numeros de `hospital.ts` foram medidos sobre a arte. Errar um deles nao
// lanca excecao nenhuma: o POKE sai de cima do tapete, ou — pior — a area
// clicavel para de cobrir a enfermeira e o unico botao de curar do jogo vira
// decoracao. Estes testes prendem as relacoes que precisam continuar valendo.
import { describe, expect, it } from 'vitest'
import { CENA_HOSPITAL, escalaDoPoke } from './hospital'

const { alvo, enfermeira, rotulo, tapete } = CENA_HOSPITAL

function dentroDoAlvo(p: { x: number; y: number }): boolean {
  return p.x >= alvo.x1 && p.x <= alvo.x2 && p.y >= alvo.y1 && p.y <= alvo.y2
}

describe('cena do Hospital', () => {
  it('poe a enfermeira e o rotulo "Curar" dentro da area clicavel', () => {
    expect(dentroDoAlvo(enfermeira)).toBe(true)
    expect(dentroDoAlvo(rotulo)).toBe(true)
  })

  it('mantem o rotulo ACIMA da enfermeira', () => {
    expect(rotulo.y).toBeLessThan(enfermeira.y)
  })

  it('nao deixa o POKE em cima da enfermeira', () => {
    // O tapete fica no saguao, bem abaixo do balcao. Se alguem aproximar os
    // dois, o sprite passa a cobrir a area de clique.
    expect(tapete.y).toBeGreaterThan(alvo.y2)
  })

  // A cena e encaixada com `cover`, que corta as bordas: sobra so a faixa
  // central. Em retrato de celular (390x844) sobra ~46% da largura; em
  // ultrawide (21:9) sobra ~43% da altura. Todo ponto de interesse tem que
  // caber na MENOR das duas faixas, senao ele some em algum formato de tela.
  const FAIXA_SEGURA = { min: 0.29, max: 0.71 }
  it('mantem todo ponto de interesse na faixa central que o cover preserva', () => {
    const pontos = [enfermeira, rotulo, tapete, { x: alvo.x1, y: alvo.y1 }, { x: alvo.x2, y: alvo.y2 }]
    for (const p of pontos) {
      expect(p.x).toBeGreaterThanOrEqual(FAIXA_SEGURA.min)
      expect(p.x).toBeLessThanOrEqual(FAIXA_SEGURA.max)
      expect(p.y).toBeGreaterThanOrEqual(FAIXA_SEGURA.min)
      expect(p.y).toBeLessThanOrEqual(FAIXA_SEGURA.max)
    }
  })

  it('nao amplia especie grande a ponto de cobrir a enfermeira', () => {
    // Gyarados/Lugia tem frame de 128px — a 5x dariam 640px de altura na arte
    // de 2000px, subindo por cima do balcao.
    expect(escalaDoPoke(128) * 128).toBeLessThanOrEqual(CENA_HOSPITAL.alturaMaximaPoke)
    expect(escalaDoPoke(32)).toBe(CENA_HOSPITAL.escalaPoke)
    // Frame ausente (primeiro frame, antes de o battleAnim resolver) nao pode
    // virar divisao por zero.
    expect(Number.isFinite(escalaDoPoke(0))).toBe(true)
  })
})
