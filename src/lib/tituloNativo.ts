// Achar `title=` de ELEMENTO HTML num fonte JSX — a regra, num lugar so.
//
// ---------------------------------------------------------------------------
// POR QUE ISTO SAIU DE DENTRO DO TESTE (PH-511)
// ---------------------------------------------------------------------------
// A funcao nasceu dentro de `components/hud/hudNaoUsaTitleNativo.test.ts`
// (PH-165). Quando a PH-511 foi estender o mesmo portao a `features/hunt`, as
// opcoes eram copiar a funcao ou extrai-la. Copiar significaria duas definicoes
// da MESMA regra sintatica, que e literalmente a classe de bug que a PH-508
// acabou de custar caro (a guarda checando o id literal enquanto o atuador
// varria a familia). Extrair custou este arquivo.
//
// Nao ha `import` disto em codigo de producao — so nos dois testes. Fica em
// `lib/` mesmo assim porque e uma regra do PROJETO, e nao de um teste: qualquer
// varredura futura de copy deve usar esta, nao reescrever a terceira.
//
// ---------------------------------------------------------------------------
// A REGRA QUE ELE APLICA, e o falso positivo que ela evita
// ---------------------------------------------------------------------------
// `title` tambem e PROP de cabecalho em `Sheet`, `Painel`, `GameWindow`,
// `ScreenOverlay` e `WikiCard`. `<Sheet title="Mais">` nao vira tooltip
// nenhum: vira o titulo do painel. Contar essas como violacao foi o erro que a
// varredura da PH-165 cometeu na primeira passada — 93 ocorrencias em `src/`,
// das quais so 40 eram tooltip de verdade.
//
// O que separa os dois e a regra de JSX, e nao heuristica: tag que comeca com
// MINUSCULA e elemento HTML (`<div>`, `<span>`), tag com MAIUSCULA e componente
// React (`<Sheet>`). So a primeira transforma `title` em atributo do DOM — e so
// o atributo do DOM tem o defeito que importa: ele NAO EXISTE NO TOQUE.

/** Remove comentario de bloco, de linha e comentario JSX. */
export function semComentarios(fonte: string): string {
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/**
 * As LINHAS (1-based) de cada `title=` que pertence a uma tag de elemento HTML.
 *
 * Anda pra tras a partir do `title=` ate o `<` que abre a tag e olha a primeira
 * letra do nome. Sem parser de JSX de verdade: o que se procura e uma unica
 * forma sintatica, e um parser inteiro pra isso seria mais codigo pra manter
 * que a regra que ele checa.
 */
export function titlesNativos(fonte: string): number[] {
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
