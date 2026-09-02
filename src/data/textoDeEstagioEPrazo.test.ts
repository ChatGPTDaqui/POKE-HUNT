// Trava os 24 valores de estagio das DUAS familias, e a conversao de prazo
// (PH-421, PH-422).
//
// POR QUE TRAVAR VALOR POR VALOR EM VEZ DE TESTAR A FORMULA
// -----------------------------------------------------------------------------
// A formula tem duas bases, e o defeito que estas issues consertam e justamente
// alguem tratar as duas como uma. Um teste que recalcula a formula passaria
// mesmo se a funcao escolhesse a base errada — ele repetiria o mesmo erro dos
// dois lados da assercao. A tabela literal e o unico jeito de a base errada
// aparecer: +1 de Ataque e 1,5x, +1 de Precisao e 1,33x, e nenhuma formula
// escrita no teste protege disso.
//
// A tabela sai da propria issue (PH-421), que a derivou da formula do motor.
import { describe, expect, it } from 'vitest'

import { TURNO_SEGUNDOS } from './abilities'
import { ROTULO_ESTAGIO } from './statLabels'
import type { StatDeEstagio } from './statusEffects'
import {
  formatarEstagio, formatarMultiplicador, formatarPrazoEmTurnos, formatarPrazoEmSegundos,
  formatarVariacao, multiplicadorDoStat, TEXTO_DE_RITMO_CONTINUO,
} from './textoDeEstagioEPrazo'

/** Base 2: Ataque, Defesa, Velocidade. */
const BASE_2: Record<number, string> = {
  6: '4x (+300%)',
  5: '3,5x (+250%)',
  4: '3x (+200%)',
  3: '2,5x (+150%)',
  2: '2x (+100%)',
  1: '1,5x (+50%)',
  0: '1x (+0%)',
  [-1]: '0,67x (−33%)',
  [-2]: '0,5x (−50%)',
  [-3]: '0,4x (−60%)',
  [-4]: '0,33x (−67%)',
  [-5]: '0,29x (−71%)',
  [-6]: '0,25x (−75%)',
}

/** Base 3: Precisao e Evasao. */
const BASE_3: Record<number, string> = {
  6: '3x (+200%)',
  5: '2,67x (+167%)',
  4: '2,33x (+133%)',
  3: '2x (+100%)',
  2: '1,67x (+67%)',
  1: '1,33x (+33%)',
  0: '1x (+0%)',
  [-1]: '0,75x (−25%)',
  [-2]: '0,6x (−40%)',
  [-3]: '0,5x (−50%)',
  [-4]: '0,43x (−57%)',
  // 3/8 = 0,375, que arredonda pra 0,38x — e a variacao e −62%, e nao −63%:
  // `Math.round(-62.5)` da −62 em JS (o desempate de .5 vai pro maior, e pra
  // numero negativo isso e "menos negativo"). Registrado porque parece typo.
  [-5]: '0,38x (−62%)',
  [-6]: '0,33x (−67%)',
}

describe('texto de estagio de atributo (PH-421)', () => {
  it('base 2 — Ataque, Defesa, Velocidade: os 13 valores', () => {
    for (const stat of ['atkFis', 'atkEsp', 'def', 'defEsp', 'speed'] as StatDeEstagio[]) {
      for (const [estagio, esperado] of Object.entries(BASE_2)) {
        expect(formatarEstagio(stat, Number(estagio)), `${stat} ${estagio}`).toBe(esperado)
      }
    }
  })

  it('base 3 — Precisao e Evasao: os 13 valores, e eles NAO batem com a base 2', () => {
    for (const stat of ['accuracy', 'evasion'] as StatDeEstagio[]) {
      for (const [estagio, esperado] of Object.entries(BASE_3)) {
        expect(formatarEstagio(stat, Number(estagio)), `${stat} ${estagio}`).toBe(esperado)
      }
    }
    // A assercao que pega o defeito da issue: se alguem trocar a funcao por um
    // mapa unico, estas duas familias colapsam e este teste cai.
    expect(formatarEstagio('accuracy', 1)).not.toBe(formatarEstagio('atkFis', 1))
    expect(formatarEstagio('evasion', -1)).not.toBe(formatarEstagio('def', -1))
  })

  it('estagio fora da faixa e tratado como o teto/piso, e nao extrapolado', () => {
    expect(formatarEstagio('atkFis', 99)).toBe(BASE_2[6])
    expect(formatarEstagio('atkFis', -99)).toBe(BASE_2[-6])
  })

  it('todo atributo de estagio tem texto — a lista canonica e ROTULO_ESTAGIO', () => {
    // Guarda contra atributo novo entrando no motor sem texto: se alguem
    // acrescentar um oitavo stat, ele cai numa das duas bases aqui e o
    // desenvolvedor tem que ESCOLHER qual, em vez de herdar a base 2 em silencio.
    for (const stat of Object.keys(ROTULO_ESTAGIO) as StatDeEstagio[]) {
      expect(multiplicadorDoStat(stat, 2), stat).toBeGreaterThan(1)
      expect(formatarEstagio(stat, 2), stat).toMatch(/^\d+(,\d+)?x \(\+\d+%\)$/)
    }
  })

  it('inteiro sai sem decimal, e o resto com virgula', () => {
    expect(formatarMultiplicador(2)).toBe('2x')
    expect(formatarMultiplicador(0.6666)).toBe('0,67x')
    expect(formatarVariacao(2)).toBe('+100%')
    expect(formatarVariacao(0.6666)).toBe('−33%')
  })
})

describe('texto de prazo (PH-422)', () => {
  it('turnos viram segundos por TURNO_SEGUNDOS, nunca por numero na mao', () => {
    expect(formatarPrazoEmTurnos(5)).toBe(`${5 * TURNO_SEGUNDOS}s`)
    expect(formatarPrazoEmTurnos(1)).toBe(`${TURNO_SEGUNDOS}s`)
    expect(formatarPrazoEmTurnos(0)).toBe('0s')
  })

  it('prazo negativo nao vira texto negativo', () => {
    // O prazo do estagio (PH-418) desce por `dt` e pode passar de zero por uma
    // fracao antes de a fonte sair da lista. "−1s restantes" na tela e defeito.
    expect(formatarPrazoEmTurnos(-2)).toBe('0s')
    expect(formatarPrazoEmSegundos(-0.4)).toBe('0s')
  })

  it('prazo que ja esta em segundos e arredondado, nao truncado', () => {
    expect(formatarPrazoEmSegundos(17.6)).toBe('18s')
    expect(formatarPrazoEmSegundos(0.4)).toBe('0s')
  })

  it('ritmo continuo e OUTRA frase, e ela tambem sai do turno', () => {
    expect(TEXTO_DE_RITMO_CONTINUO).toBe(`a cada ${TURNO_SEGUNDOS}s`)
  })
})
