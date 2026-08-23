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
   * Este numero controla SO A PROPORCAO entre o POKE e o resto da cena, e
   * nada mais: POKE e enfermeira sao escalados pelo mesmo fator de layout, e
   * ele se cancela na razao entre os dois. Com 5, o POKE fica ~2,1x a altura
   * da enfermeira, que e o enquadramento pedido.
   *
   * JA FOI 2.5 POR UM ERRO DE LEITURA MEU (PH-85). Eu li a queixa de
   * "desproporcional + resolucao ruim" como "esta grande demais" e encolhi o
   * POKE. Era o contrario: a proporcao grande e a certa, e o problema era so
   * o serrilhado. Quem resolve o serrilhado e `ZOOM_DA_CENA` abaixo, nao
   * este numero.
   *
   * (O comentario original justificava o 5 dizendo "um frame de 32px sai com
   * 160px". 32 e a LARGURA; o frame e 32x64 e quem manda e a altura. A conta
   * estava errada, o resultado por acaso era o desejado.)
   *
   * Como todo frame PMD ja e proporcional ao tamanho do bicho (24px o Swinub,
   * 128px o Gyarados), um multiplicador unico preserva as diferencas entre
   * especies.
   */
  escalaPoke: 5,

  /**
   * Teto de altura do sprite, em pixels da imagem. Motivo funcional, nao
   * estetico: sem ele um Gyarados (frame de 128px) sairia com 640 e cobriria
   * a enfermeira — o unico elemento clicavel da cena ficaria escondido atras
   * do proprio POKE do jogador. Com 400, o maior sprite possivel para logo
   * abaixo do balcao.
   *
   * Voltou de 200 pra 400 junto com `escalaPoke` (PH-85): 200 so fazia
   * sentido no mundo do multiplicador 2.5.
   */
  alturaMaximaPoke: 400,
} as const

/**
 * Quanto a cena inteira encolhe em relacao ao tamanho que COBRIRIA a tela.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO E O QUE CONSERTA O SERRILHADO
 * ---------------------------------------------------------------------------
 * O sprite do POKE tem 64px de altura na fonte (folha PMD de 320x320, quadro
 * 32x64) — nao existe versao maior no projeto, entao o serrilhado nao e falta
 * de arte, e esticamento. E ele ja e desenhado sem suavizacao
 * (`imageSmoothingEnabled = false`), entao nao ha "borrao" pra desligar: o que
 * se ve e pixel grande mesmo.
 *
 * Com o fundo em `cover` (1440x900 -> escala 0,72), o POKE saia com 230px na
 * tela: 3,6x de esticamento de um sprite de 64px.
 *
 * A saida NAO e encolher o POKE, porque a proporcao dele com a enfermeira e a
 * desejada — e ela nem mudaria, ja que os dois sao escalados pelo mesmo fator.
 * A saida e encolher A CENA TODA: o POKE cai de tamanho em PIXEL (menos
 * esticamento) sem perder um milimetro da proporcao com o resto.
 *
 * Com 0,65: escala efetiva 0,47 em 1440x900, POKE em ~150px, esticamento de
 * 2,3x em vez de 3,6x — 35% menos.
 *
 * ---------------------------------------------------------------------------
 * O CUSTO, QUE E REAL
 * ---------------------------------------------------------------------------
 * `cover` existe pra arte preencher a tela. Abaixo dele sobra fundo liso nas
 * bordas, e a arte NAO ajuda a disfarcar: ela so tem 44-50px de borda escura
 * (medido), e zero embaixo. Em 1440x900 sobram ~250px de cada lado, pintados
 * com `HOSPITAL_FALLBACK`.
 *
 * E o preco de ver o POKE nitido com esta arte. Baixar mais este numero deixa
 * o sprite melhor e a moldura maior; subir faz o contrario. 1 volta ao
 * comportamento antigo.
 */
export const ZOOM_DA_CENA = 0.65

/** Escala efetiva do sprite (em unidades da imagem) para um frame de `alturaDoFrame`. */
export function escalaDoPoke(alturaDoFrame: number): number {
  if (!(alturaDoFrame > 0)) return CENA_HOSPITAL.escalaPoke
  return Math.min(CENA_HOSPITAL.escalaPoke, CENA_HOSPITAL.alturaMaximaPoke / alturaDoFrame)
}
