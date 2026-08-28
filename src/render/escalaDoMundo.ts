// A REGUA DE ESCALA DAS CAMADAS DE ENFEITE (PH-232).
//
// ---------------------------------------------------------------------------
// O PROBLEMA QUE ESTE ARQUIVO EXISTE PRA RESOLVER
// ---------------------------------------------------------------------------
// Ate o PH-232, o tamanho de cada particula de `ambiente.ts` e de
// `climaVisual.ts` era um numero solto na receita, sem nada com que
// compara-lo. Medido contra o unico corpo que o jogador tem como referencia na
// tela — o POKE — o resultado era:
//
//   poeira de caverna   ate  9,6 unidades de diametro =  24% de um POKE
//   floco de neve       ate 12,0                      =  30%
//   brasa               ate 10,8                      =  27%
//   risco de chuva      ate 58   de comprimento       = 145%
//   cristal de neve     ate 22   de diametro          =  55%
//
// Um grao de poeira com um quarto da altura de um Pokemon nao le como poeira:
// le como POLEN. E como todos os presets caiam no mesmo intervalo de tamanho,
// biomas diferentes mostravam o mesmo enxame de bolinhas parecidas.
//
// ---------------------------------------------------------------------------
// POR QUE 40 UNIDADES
// ---------------------------------------------------------------------------
// `scaleForSpecies` (data/pokeHeights.ts) devolve 1 desde que a escala por
// altura real da Pokedex foi removida — o sprite sai EXATAMENTE no tamanho do
// quadro do arquivo, e px do quadro e unidade de mundo. O quadro mais comum do
// acervo tem 40px de altura: 360 dos 1.266 registros de
// `battleSpriteAnims.ts`, e 24/32/40/48/56 juntos cobrem ~90% deles.
//
// Nao e uma constante do MOTOR, e um numero de referencia pra desenho. Por
// isso ela mora aqui, em `render/`, e nao em `data/` — nada de gameplay pode
// passar a depender dela.
export const ALTURA_DE_POKE = 40

/** Tamanho em unidades de mundo a partir de uma fracao da altura de um POKE. */
export function emPoke(fracao: number): number {
  return fracao * ALTURA_DE_POKE
}

/**
 * Teto do CORPO de uma particula de ambiente, em unidades de mundo (diametro).
 *
 * 12% da altura de um POKE. Acima disso a particula deixa de ler como "coisa
 * pequena no ar" e passa a competir com o Pokemon pela atencao — que e
 * exatamente o sintoma que a issue descreve.
 *
 * Vale pro CORPO, nao pro rastro: risco de vento e borrao de movimento, e
 * borrao pode (e deve) ser mais comprido que o grao que o produziu. O que
 * segura o rastro e `RAZAO_MINIMA_DE_RISCO`.
 */
export const TETO_DO_CORPO_DE_AMBIENTE = emPoke(0.12)

/**
 * Teto do corpo de uma particula de CLIMA, em unidades de mundo (diametro).
 *
 * Mais folgado que o de ambiente (18% contra 12%) e isso e deliberado: clima
 * e um evento que MEXE NO COMBATE (granizo e areia tiram HP), entao ele tem
 * que ser mais evidente que a decoracao fixa do bioma. Um floco de neve maior
 * que um grao de poeira nao e incoerencia, e hierarquia.
 *
 * O banco de nevoa esta fora deste teto por construcao: ele nao e um corpo, e
 * VOLUME — alpha baixo com raio grande e o unico jeito de produzir volume, e
 * alpha alto com raio pequeno produziria a bolinha cinza que a receita dele
 * existe pra evitar.
 */
export const TETO_DO_CORPO_DE_CLIMA = emPoke(0.18)

/**
 * Razao minima comprimento/espessura de qualquer risco (rastro de movimento).
 *
 * O risco de areia do ambiente tinha, antes do PH-232, 4,4 unidades de
 * comprimento por ate 5,0 de espessura — MAIS GROSSO QUE LONGO. Isso nao e um
 * risco, e uma bolha; e era assim que aparecia na tela. Seis pra um e o
 * minimo em que o olho ainda le direcao em vez de mancha.
 */
export const RAZAO_MINIMA_DE_RISCO = 6
