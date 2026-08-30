// PH-165 — nenhum elemento HTML da HUD explica nada por `title=` nativo.
//
// POR QUE ISTO PRECISA DE TESTE
// -----------------------------------------------------------------------------
// `title="..."` num `<div>` ou `<button>` parece resolvido e nao esta:
//
//   * so abre com o MOUSE parado ~1s — no celular ele simplesmente nao existe;
//   * nao aceita formatacao nenhuma;
//   * ignora a identidade visual do jogo;
//   * e, na HUD, disputa o mesmo gesto com a bolha do projeto que ja esta ali.
//
// O cabecalho de `Explicacao.tsx` ja diz tudo isso, e `docs/19-explicacao-
// flutuante.md` conta as 38 ocorrencias que existiam no jogo inteiro. O que
// faltava era algo que REPROVASSE a volta — escrever `title=` num `<span>` e a
// coisa mais natural do mundo pra quem esta com pressa, e nao quebra nada.
//
// O ESCOPO E A HUD, e de proposito: ela e a superficie permanente, a que o
// jogador ve sem ter pedido, e a unica onde o padrao ja esta 100% migrado. As
// outras areas ainda tem `title=` legitimamente esperando a fila da PH-165 (ver
// a ordem sugerida no fim do doc) — trava-las aqui reprovaria o repo inteiro
// hoje, e um teste que nasce vermelho e desligado na primeira semana.
//
// O QUE NAO CONTA
// -----------------------------------------------------------------------------
// `title` tambem e PROP de cabecalho em `Sheet`, `Painel`, `GameWindow`,
// `ScreenOverlay` e `WikiCard`. `<Sheet title="Mais">` nao vira tooltip nenhum:
// vira o titulo do painel. Contar essas como violacao foi o erro que a propria
// varredura da issue cometeu na primeira passada — 93 ocorrencias em `src/`, das
// quais so 40 eram tooltip de verdade.
//
// A regra que separa os dois e a de JSX, nao heuristica: tag que comeca com
// MINUSCULA e elemento HTML (`<div>`, `<button>`), tag com MAIUSCULA e
// componente React (`<Sheet>`). So a primeira transforma `title` em atributo do
// DOM.
import { describe, expect, it } from 'vitest'

const FONTES = import.meta.glob('./*.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/** Remove comentario de bloco, de linha e comentario JSX. */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/**
 * Cada `title=` que pertence a uma tag de ELEMENTO HTML, com a linha.
 *
 * Anda pra tras a partir do `title=` ate o `<` que abre a tag e olha a primeira
 * letra do nome. Sem parser de JSX de verdade: o que se procura aqui e uma unica
 * forma sintatica, e um parser inteiro pra isso seria mais codigo pra manter que
 * a regra que ele checa.
 */
function titlesNativos(fonte: string): number[] {
  const limpo = semComentarios(fonte)
  const linhas: number[] = []
  const re = /\btitle\s*=/g
  let m: RegExpExecArray | null
  while ((m = re.exec(limpo)) != null) {
    const abertura = limpo.lastIndexOf('<', m.index)
    if (abertura === -1) continue
    const nome = limpo.slice(abertura + 1, abertura + 2)
    // Minuscula = elemento HTML. Maiuscula = componente React (prop).
    if (nome >= 'a' && nome <= 'z') {
      linhas.push(limpo.slice(0, m.index).split('\n').length)
    }
  }
  return linhas
}

describe('a HUD nao volta a usar `title=` nativo (PH-165)', () => {
  it('a varredura enxerga os arquivos da HUD', () => {
    // Sem isto o teste passa vazio se o glob mudar de caminho — o modo de falha
    // classico de teste que le fonte.
    expect(Object.keys(FONTES).length).toBeGreaterThanOrEqual(7)
    expect(Object.keys(FONTES).some((k) => k.endsWith('/StatusRail.tsx'))).toBe(true)
  })

  it('nenhum elemento HTML da HUD tem `title=`', () => {
    const violacoes: string[] = []
    for (const [arquivo, fonte] of Object.entries(FONTES)) {
      for (const linha of titlesNativos(fonte)) {
        violacoes.push(`${arquivo}:${linha}`)
      }
    }
    expect(violacoes, 'use `Explicacao` (conceito) ou `aria-label` (nome de acao)').toEqual([])
  })

  it('a regra distingue prop de componente de atributo de elemento', () => {
    // O teste do proprio teste. Sem isto, uma regex quebrada devolveria lista
    // vazia pra tudo e o caso acima passaria por engano pra sempre.
    expect(titlesNativos('<Sheet title="Mais">x</Sheet>')).toEqual([])
    expect(titlesNativos('<div title="oi">x</div>')).toEqual([1])
    expect(titlesNativos('// title="isto e comentario"')).toEqual([])
    expect(titlesNativos('{/* title="comentario JSX" */}')).toEqual([])
  })
})
