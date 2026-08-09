// A regra "online + nenhuma resposta = suspeite do bloqueador" e uma DECISAO,
// nao um detalhe de formatacao — e o unico diagnostico que o jogador recebe
// quando uma extensao barra o jogo. Uma refatoracao que "simplifique" isso de
// volta pra "verifique sua internet" nao quebra teste nenhum e nao aparece em
// tela nenhuma ate alguem com uBlock tentar jogar.
import { describe, expect, it } from 'vitest'

import { ehFalhaSemResposta, mensagemDeFalhaDeRede } from './erroDeRede'

describe('erro de rede', () => {
  it('reconhece as tres formas de "nao houve resposta"', () => {
    // Chromium, Safari e Firefox dizem a mesma coisa com palavras diferentes.
    expect(ehFalhaSemResposta('TypeError: Failed to fetch')).toBe(true)
    expect(ehFalhaSemResposta('Load failed')).toBe(true)
    expect(ehFalhaSemResposta('NetworkError when attempting to fetch resource.')).toBe(true)
  })

  it('nao confunde erro de credencial com erro de rede', () => {
    expect(ehFalhaSemResposta('Invalid login credentials')).toBe(false)
    expect(ehFalhaSemResposta('User already registered')).toBe(false)
  })

  it('offline fala de internet e NAO acusa bloqueador', () => {
    const m = mensagemDeFalhaDeRede(false)
    expect(m).toContain('internet')
    expect(m.toLowerCase()).not.toContain('bloqueador')
  })

  it('online cita bloqueador/extensao/DNS como causa provavel', () => {
    const m = mensagemDeFalhaDeRede(true)
    expect(m.toLowerCase()).toContain('bloqueador')
    expect(m.toLowerCase()).toContain('dns')
  })
})
