// A arte de mudanca de atributo existe no disco, cobre os sete atributos, e o
// par (atributo, direcao) nunca sai torto (PH-416).
//
// POR QUE O TESTE DE EXISTENCIA E OBRIGATORIO AQUI
// -----------------------------------------------------------------------------
// `drawEstagioEffect` devolve `false` quando a imagem nao carrega, e o chamador
// cai no burst procedural. Ou seja: arquivo com nome errado nao da erro, nao
// loga, e nao quebra teste nenhum — ele aparece como golpe de status desenhando
// o burst genérico de sempre. Foi exatamente esse silencio que deixou as 23
// artes por golpe nunca aparecerem na tela por meses (PH-82).
import { describe, expect, it } from 'vitest'
import {
  TIRA_POR_ESTAGIO, TIRA_DE_CONDICAO_APLICADA, QUADROS_DE_ESTAGIO,
  estagioDoGolpe, tiraDeEstagio, urlsDeEstagio,
} from './estagioVfx'
import { ROTULO_ESTAGIO } from './statLabels'
import type { StatDeEstagio } from './statusEffects'

const noDisco = new Set(
  Object.keys(import.meta.glob('/assets/estagio-vfx/*.png')).map((p) => p.replace(/^\//, '')),
)

describe('arte de mudanca de atributo (PH-416)', () => {
  it('todo arquivo declarado existe no disco', () => {
    expect(urlsDeEstagio().filter((u) => !noDisco.has(u))).toEqual([])
  })

  it('nao ha arquivo no disco sem declaracao', () => {
    // O outro lado do teste acima. Arte gerada e esquecida no repo custa espaco
    // e, pior, confunde quem for mexer: parece que existe uma peca a mais.
    const declaradas = new Set(urlsDeEstagio())
    expect([...noDisco].filter((u) => !declaradas.has(u))).toEqual([])
  })

  it('os SETE atributos tem as duas direcoes — a lista canonica e ROTULO_ESTAGIO', () => {
    // Contra ROTULO_ESTAGIO, e nao contra uma lista escrita aqui: atributo novo
    // no motor tem que aparecer como falha, e nao herdar silenciosamente a arte
    // de outro (ou nenhuma).
    for (const stat of Object.keys(ROTULO_ESTAGIO) as StatDeEstagio[]) {
      expect(TIRA_POR_ESTAGIO[stat]?.aumenta?.url, `${stat} aumenta`).toBeTruthy()
      expect(TIRA_POR_ESTAGIO[stat]?.diminui?.url, `${stat} diminui`).toBeTruthy()
    }
  })

  it('nenhum arquivo e reaproveitado entre atributo ou direcao', () => {
    // Se dois atributos apontassem pro mesmo arquivo, voltaria exatamente o
    // defeito que esta issue conserta — Ataque e Velocidade desenhando igual.
    const todas = urlsDeEstagio()
    expect(new Set(todas).size).toBe(todas.length)
  })

  it('toda tira declara o mesmo numero de quadros', () => {
    for (const url of urlsDeEstagio()) expect(url).toMatch(/\.png$/)
    const quadros = new Set([
      ...Object.values(TIRA_POR_ESTAGIO).flatMap((p) => [p.aumenta.quadros, p.diminui.quadros]),
      TIRA_DE_CONDICAO_APLICADA.quadros,
    ])
    expect([...quadros]).toEqual([QUADROS_DE_ESTAGIO])
  })
})

describe('o par (atributo, direcao) sai da MESMA entrada', () => {
  it('estagio positivo vira aumenta, e traz o atributo junto', () => {
    expect(estagioDoGolpe([{ stat: 'atkFis', estagios: 2 }])).toEqual({ stat: 'atkFis', direcao: 'aumenta' })
  })

  it('estagio negativo vira diminui, e traz o atributo junto', () => {
    expect(estagioDoGolpe([{ stat: 'speed', estagios: -1 }])).toEqual({ stat: 'speed', direcao: 'diminui' })
  })

  it('golpe que mexe em VARIOS atributos usa a primeira entrada, nos dois campos', () => {
    // O caso que exige uma funcao so. Shell Smash sobe Ataque e baixa Defesa: se
    // o atributo viesse de uma regra ("o de maior modulo") e a direcao de outra
    // ("a primeira"), sairia escudo com motes SUBINDO num golpe que baixa a
    // Defesa — a arte diria o contrario do que o jogo fez.
    const shellSmash = [
      { stat: 'atkFis' as const, estagios: 2 },
      { stat: 'def' as const, estagios: -1 },
    ]
    expect(estagioDoGolpe(shellSmash)).toEqual({ stat: 'atkFis', direcao: 'aumenta' })
  })

  it('sem statChanges (confusao, veneno, sono...) devolve null', () => {
    expect(estagioDoGolpe(undefined)).toBeNull()
    expect(estagioDoGolpe([])).toBeNull()
  })
})

describe('escolha da tira', () => {
  it('atributo com direcao devolve a tira daquele atributo', () => {
    expect(tiraDeEstagio('def', 'diminui')).toBe(TIRA_POR_ESTAGIO.def.diminui)
  })

  it('SEM atributo e COM direcao devolve a peca de condicao', () => {
    // E o golpe de condicao, que nao mexe em atributo. Antes da PH-416 ele usava
    // a mesma arte de "baixar atributo" (ver o NOTAS.txt do acervo), entao trocar
    // a de atributo sem dar peca propria a ele o deixaria sem VFX.
    expect(tiraDeEstagio(null, 'diminui')).toBe(TIRA_DE_CONDICAO_APLICADA)
    expect(tiraDeEstagio(undefined, 'aumenta')).toBe(TIRA_DE_CONDICAO_APLICADA)
  })

  it('sem direcao nao ha o que desenhar', () => {
    expect(tiraDeEstagio('def', null)).toBeNull()
    expect(tiraDeEstagio(null, undefined)).toBeNull()
  })
})
