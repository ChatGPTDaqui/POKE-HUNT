// Layout da cena do Hospital (Centro Pokemon), hand-authored — mesma natureza
// de `data/biomas.ts`: nao vem de catalogo nenhum, e decisao de arte.
//
// POR QUE TUDO AQUI E FRACAO DA IMAGEM, E NAO DO CANVAS
//
// Antes desta arte, a enfermeira era um quadradinho geometrico desenhado em
// `width/2, height*0.24` — fracao do CANVAS. Isso funcionava porque nao havia
// nada no fundo pra ela se alinhar: o fundo era um xadrez procedural.
//
// Com um cenario de verdade, cada ponto de interesse (a moca do balcao, o
// tapete redondo) mora num pixel especifico DA IMAGEM. Ancorar em fracao do
// canvas faria o POKE sair de cima do tapete e o clique de curar sair de cima
// da enfermeira toda vez que a janela mudasse de proporcao — e o jogo roda de
// 360px de celular a ultrawide. Fracao da imagem + a mesma escala com que a
// imagem e desenhada mantem tudo colado na arte em qualquer tela.
//
// Os numeros foram MEDIDOS sobre a arte (grade de 0.05 sobreposta a ela no
// navegador), nao estimados de cabeca. Trocar a arte exige remedir: nao ha como
// derivar isso do arquivo.

export const CENA_HOSPITAL = {
  imagem: 'assets/hospital/centro-pokemon.jpg',
  largura: 2000,
  altura: 2000,

  /** Onde os PES do POKE encostam: centro do tapete redondo do saguao. */
  tapete: { x: 0.5015, y: 0.655 },

  /** Centro da enfermeira atras do balcao (referencia do rotulo "Curar"). */
  enfermeira: { x: 0.5025, y: 0.418 },

  /** Base do texto "Curar", logo acima da touca dela. */
  rotulo: { x: 0.5025, y: 0.362 },

  /**
   * Area clicavel que cura. Cobre a enfermeira INTEIRA (da touca ate o balcao
   * que a corta) MAIS o rotulo acima da cabeca: o rotulo e a unica parte que
   * anuncia "isto e um botao", entao clicar nele tem que funcionar.
   */
  alvo: { x1: 0.454, y1: 0.334, x2: 0.552, y2: 0.472 },

  /**
   * Multiplicador do sprite do POKE, em unidades DA IMAGEM (nao da tela).
   *
   * ERA 5, E ESTAVA CALIBRADO PELA MEDIDA ERRADA (PH-82/PH-85). A conta que
   * justificava o 5 dizia "um frame de 32px sai com 160px, praticamente a
   * altura da enfermeira" — mas 32 e a LARGURA do frame. Medido ao vivo, o
   * frame PMD e 32x64, e quem manda no tamanho aparente e a altura: o POKE
   * saia com 64x5 = 320 unidades de imagem, o DOBRO do pretendido. Na tela, em
   * 1440x900, isso era 230px de altura contra ~110-160px da enfermeira.
   *
   * 2.5 devolve os ~160 que a conta original queria. De brinde resolve a
   * serrilha: o upscale do sprite (multiplicador x escala do layout, 0,72 em
   * 1440x900) cai de 3,6x pra 1,8x — era o esticamento, e nao a arte, que
   * deixava o POKE granulado.
   *
   * Nao da pra resolver isso encolhendo o FUNDO, que foi a primeira ideia: ele
   * e desenhado em `cover` (`max(largura/2000, altura/2000)`) e em 1440x900 ja
   * esta no minimo que cobre a tela — abaixo disso sobra faixa vazia nas
   * laterais. E encolher o fundo encolheria a enfermeira junto, entao a
   * PROPORCAO entre os dois nem mudaria: ela depende so deste numero.
   *
   * Como todo frame PMD ja e proporcional ao tamanho do bicho (24px o Swinub,
   * 128px o Gyarados), um multiplicador unico preserva as diferencas entre
   * especies — nada aqui reintroduz o `scaleForSpecies` por altura de Pokedex,
   * desligado de proposito numa leva anterior.
   */
  escalaPoke: 2.5,

  /**
   * Teto de altura do sprite, em pixels da imagem. Existe por um motivo
   * funcional, nao estetico: sem ele um Gyarados (frame de 128px) cobriria a
   * enfermeira, e o unico elemento clicavel da cena ficaria escondido atras do
   * proprio POKE do jogador.
   *
   * Desceu de 400 pra 200 junto com `escalaPoke` (PH-85): 400 foi dimensionado
   * na mesma regua errada, e com o multiplicador corrigido ele deixaria de ter
   * efeito nenhum — 128 x 2,5 = 320 ja passa longe de 400, entao NENHUMA
   * especie seria limitada e o Gyarados voltaria a cobrir a enfermeira. 200
   * mantem o teto no mesmo lugar RELATIVO de antes: pouco acima dos ~160 do
   * POKE tipico, cortando so quem for grande demais.
   */
  alturaMaximaPoke: 200,
} as const

/** Escala efetiva do sprite (em unidades da imagem) para um frame de `alturaDoFrame`. */
export function escalaDoPoke(alturaDoFrame: number): number {
  if (!(alturaDoFrame > 0)) return CENA_HOSPITAL.escalaPoke
  return Math.min(CENA_HOSPITAL.escalaPoke, CENA_HOSPITAL.alturaMaximaPoke / alturaDoFrame)
}
