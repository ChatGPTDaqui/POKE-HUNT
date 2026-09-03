// O teto de espera de um carregamento, em um lugar so (PH-483/PH-484).
//
// POR QUE UM MODULO SO PRA UM NUMERO
// -----------------------------------------------------------------------------
// Dois relogios independentes olham a MESMA espera:
//
//   `data/preload.ts`            desiste de aquecer a arte depois de N ms
//   `modals/CutsceneDeEntrada`   fecha a tela de carregamento depois de N ms
//
// Se os dois numeros divergirem, um dos dois defeitos aparece — e nenhum lanca
// erro. Teto da cutscene MENOR que o do preload: a cena entra com a arte ainda
// baixando, que e exatamente o que a PH-483 existe pra impedir. Teto da cutscene
// MAIOR: o preload ja desistiu e o jogador continua olhando uma tela de
// carregamento que nao esta carregando nada.
//
// POR QUE 15 SEGUNDOS
// -----------------------------------------------------------------------------
// E o numero que o dono deu, textual: "o efeito do zoom in devera ter uma
// duracao maxima de 15 segundos". O teto anterior do preload era 4s, e ele
// existia pelo motivo oposto — nao transformar rede ruim em "o botao Entrar nao
// funciona". A troca e deliberada e tambem e pedido do dono: "eu preciso que
// todos os conteudos sejam carregados previamente antes de aparecer para o
// jogador, mesmo que isso custe carregamento".
//
// O QUE ELE NAO E: um prazo de rede. Nao ha `AbortController` nenhum atras
// disto — estourado o teto, o download continua em segundo plano e o que faltou
// termina de chegar sozinho. O teto so decide quem para de ESPERAR.
export const TETO_DE_CARREGAMENTO_MS = 15_000
