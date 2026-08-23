// AUTO-GERADO por `node scripts/build-agua-mask.js` (PH-113), a partir das
// referencias pintadas a mao em scripts/agua-refs/*.png.
//
// Onde ha AGUA em cada arte de fundo, pra a camada ambiente ondular so ali.
// AZUL PURO na referencia = agua. Ver o cabecalho do script pra por que isto e
// pintado e nao derivado da cor da arte (resposta curta: agua e vegetacao
// coincidem em matiz, saturacao, luminancia e textura neste acervo).
//
// A chave e o CAMINHO DA ARTE, igual em `subBiomaCollision.generated.ts`: o
// ambiente e propriedade do desenho, entao quem mostra a imagem herda a
// mascara.
//
// Arte sem referencia pintada NAO aparece aqui, e quem consome trata ausencia
// como "sem ondulacao" — o comportamento de hoje.
//
// Nao editar a mao — repinte a referencia e rode o script.
export interface MascaraDeAgua {
  /** Lado da celula em unidades de mundo. Mesma celula da grade de colisao. */
  celula: number;
  /** '1' = agua. Linha `y`, coluna `x`, a partir da origem do mundo. */
  grid: string[];
}

export const AGUA_POR_ARTE: Record<string, MascaraDeAgua> = {

}
