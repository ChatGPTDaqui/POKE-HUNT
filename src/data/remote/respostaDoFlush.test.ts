// PH-140 — o que `aplicarFlush` CALCULA e o que a rota HTTP RESPONDE são duas
// coisas, e nada no compilador liga uma à outra.
//
// O buraco real que este arquivo existe pra fechar: `aplicarFlush` já devolvia
// `clima` no `ResultadoDeFlush`, com tipo e tudo, e o `json({...})` de
// `appSessao.ts#flush` simplesmente não repassava o campo. `tsc` fica quieto
// (sobrar campo no objeto de origem não é erro), a suíte inteira passa, e o
// sintoma só aparece chamando a função publicada: `/sessao/abrir` mandava o
// clima e todo flush seguinte vinha sem.
//
// E o modo de falhar é o pior possível: campo ausente significa "sem
// informação, mantenha o que tem" (de propósito — é o que protege o cliente de
// um servidor mais velho). Então o clima não some com erro; ele congela, e na
// primeira troca de sala o jogador fica sem clima nenhum pelo resto da hunt.
//
// AO ADICIONAR UM CAMPO NOVO À RESPOSTA DO FLUSH: acrescente-o em `OBRIGATORIOS`.
import { describe, expect, it } from 'vitest'

const FONTES = import.meta.glob('/authority/src/appSessao.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * Campos que a resposta do flush TEM que repassar do `ResultadoDeFlush`.
 *
 * Só os que o cliente lê e que mudam o que ele mostra — não é a lista completa
 * da resposta.
 */
const OBRIGATORIOS = ['sala', 'clima', 'estado', 'resumo', 'piso']

describe('a rota de flush repassa o que o motor resolveu (PH-140)', () => {
  const fonte = Object.values(FONTES)[0]

  it('acha o arquivo da rota', () => {
    // Guarda anti-teste-vácuo: sem a fonte, os casos abaixo passariam sobre
    // `undefined` sem verificar nada.
    expect(fonte, 'não consegui ler authority/src/appSessao.ts').toBeDefined()
    expect(fonte).toContain('async function flush(')
  })

  for (const campo of OBRIGATORIOS) {
    it(`repassa \`${campo}\` do resultado`, () => {
      // `resultado.<campo>` e não só o nome do campo: o que falhou foi
      // exatamente ter o campo no objeto de origem e não na resposta.
      expect(
        fonte.includes(`${campo}: resultado.${campo}`),
        `authority/src/appSessao.ts#flush não repassa \`${campo}\` — o cliente ` +
          'vai tratar como "sem informação" e manter o valor velho, em silêncio.',
      ).toBe(true)
    })
  }

  it('a abertura de sessão manda o clima da sala inicial', () => {
    // O outro lado do mesmo contrato: sem isto o jogador entra na hunt sem
    // clima e só recebe um no primeiro flush.
    expect(fonte).toContain('clima: climaInicial')
  })
})
