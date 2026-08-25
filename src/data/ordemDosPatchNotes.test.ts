// PH-138 — a nota mais nova tem que ficar em cima, e "7.10" nao e 7.1.
//
// O desempate de `sortedPatchNotes` usava `Number(version)`. Isso funcionou de
// 7.0 a 7.9 e quebrou no instante em que o primeiro minor de DOIS digitos
// entrou: `Number('7.10')` e **7.1**, entao a 7.9 passou a renderizar ACIMA da
// 7.10. Nao da erro, nao da warning — a nota nova simplesmente aparece embaixo,
// e ninguem olha a aba de novidades desconfiando da ordem.
//
// Versao aqui e lista de inteiros separados por ponto, nao decimal.
import { describe, expect, it } from 'vitest'

import { PATCH_NOTES, sortedPatchNotes } from './patchNotes'

describe('ordem dos patch notes (PH-138)', () => {
  // Guarda anti-teste-vacuo: sem entradas, tudo abaixo passa comparando nada.
  it('ha notas para ordenar', () => {
    expect(PATCH_NOTES.length).toBeGreaterThan(5)
  })

  it('a mais nova vem primeiro, e nao perde o desempate de versao', () => {
    const ordem = sortedPatchNotes()
    for (let i = 1; i < ordem.length; i++) {
      const antes = ordem[i - 1]!
      const depois = ordem[i]!
      if (antes.date !== depois.date) {
        expect(
          antes.date > depois.date,
          `${antes.version} (${antes.date}) aparece acima de ${depois.version} (${depois.date})`,
        ).toBe(true)
        continue
      }
      // Mesma data: quem decide e a VERSAO, segmento por segmento.
      const [aMaior, aMenor] = antes.version.split('.').map(Number)
      const [bMaior, bMenor] = depois.version.split('.').map(Number)
      const antesEhMaior = aMaior! > bMaior! || (aMaior === bMaior && aMenor! > bMenor!)
      expect(
        antesEhMaior,
        `mesma data e ${antes.version} aparece acima de ${depois.version} — o desempate de versao inverteu`,
      ).toBe(true)
    }
  })

  it('7.10 e mais nova que 7.9 (o caso que quebrava)', () => {
    // Fixa o caso concreto, e nao so a propriedade: `Number('7.10') === 7.1`
    // volta em qualquer refatoracao que "simplifique" o comparador.
    const versoes = sortedPatchNotes().map((n) => n.version)
    const i710 = versoes.indexOf('7.10')
    const i79 = versoes.indexOf('7.9')
    expect(i710, 'a entrada 7.10 sumiu do arquivo').toBeGreaterThanOrEqual(0)
    expect(i79, 'a entrada 7.9 sumiu do arquivo').toBeGreaterThanOrEqual(0)
    expect(i710, '7.10 tem que aparecer ANTES de 7.9').toBeLessThan(i79)
  })

  it('nenhuma versao repetida', () => {
    // Duas notas com a mesma versao deixam a `key` do React duplicada, e o
    // desempate nao tem como decidir qual vem primeiro.
    const versoes = PATCH_NOTES.map((n) => n.version)
    expect(versoes.length).toBe(new Set(versoes).size)
  })
})
