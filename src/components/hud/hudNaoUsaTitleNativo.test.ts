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
import { titlesNativos } from '@/lib/tituloNativo'

const FONTES = import.meta.glob('./*.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

// As DUAS funcoes abaixo sairam daqui na PH-511, pra `lib/tituloNativo.ts`:
// `features/hunt` passou a ter o mesmo portao, e duas copias da mesma regra
// sintatica e a classe de bug que a PH-508 custou caro. O porque de cada
// detalhe (a regra de maiuscula/minuscula, o falso positivo de `<Sheet title>`)
// mora la agora.

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
