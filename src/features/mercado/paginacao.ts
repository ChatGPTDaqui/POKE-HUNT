// Aritmetica da paginacao da vitrine (PH-99).
//
// Funcao pura e nao expressao inline no componente porque e aqui que nasce a
// classe de bug "26–50 de 40": tres numeros derivados do mesmo total, cada um
// com o proprio jeito de errar na ultima pagina e no vazio. Errado, ele nao
// quebra nada — so mostra uma contagem que nao fecha, e o jogador conclui que a
// vitrine esta escondendo anuncio.
export interface FaixaDaPagina {
  /** Total de paginas; NUNCA zero — "pagina 1 de 0" nao existe. */
  paginas: number
  /** Primeiro item da faixa, base 1. Zero quando nao ha nada. */
  inicio: number
  /** Ultimo item da faixa, limitado pelo total. */
  fim: number
}

export function faixaDaPagina(total: number, pagina: number, porPagina: number): FaixaDaPagina {
  // `porPagina` invalido devolveria Infinity/NaN e a tela mostraria "NaN de 40".
  const tamanho = porPagina > 0 ? porPagina : 1
  const seguro = total > 0 ? total : 0
  return {
    paginas: Math.max(1, Math.ceil(seguro / tamanho)),
    inicio: seguro === 0 ? 0 : pagina * tamanho + 1,
    // Limitado pelo TOTAL, e nao por quantos vieram: a lista descarta especie
    // desconhecida depois de contar, e usar o tamanho da lista faria a faixa
    // pular numero entre paginas.
    fim: Math.min(seguro, (pagina + 1) * tamanho),
  }
}
