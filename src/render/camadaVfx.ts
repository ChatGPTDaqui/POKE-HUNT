// Camada de VFX — a superficie de desenho que fica ACIMA da HUD (PH-190).
//
// POR QUE ELA EXISTE, e por que nao da pra resolver no canvas do jogo:
//
// O canvas do jogo e `z-0` e a HUD vive em `z-18..22`, com o trilho de status
// usando fundo semi-opaco (`.vidro`). Isso e decisao, nao acidente — a HUD
// precisa ficar por cima do cenario. A consequencia e que TODO efeito desenhado
// no canvas do jogo que precise chegar num elemento da HUD passa por tras dele
// e desaparece.
//
// Achado prototipando o voo de ouro ate a carteira (que mora dentro do trilho):
// as moedas subiam e sumiam nos ultimos ~30px do percurso, e o pulso de chegada
// — que existia no estado, conferido — nunca aparecia na tela. O efeito perdia
// exatamente o climax, que e o unico instante que liga a moeda ao numero que
// ela muda.
//
// ONDE ELA FICA NA PILHA, e a escolha nao e "o mais alto possivel":
//
//   0      canvas do jogo
//   18-22  HUD (trilho, doca, chips)
//   25     ESTA CAMADA
//   30/31  backdrop + painel
//   33     sheets sobre painel
//   40+    Auto, perfil, relatorio offline, confirmacao, toasts
//
// 25 poe o efeito sobre o trilho e a doca, que e o objetivo, e o deixa ABAIXO de
// painel/sheet/modal. Isso e proposital: com a Mochila ou a Loja abertas, ouro
// voando por cima do painel e ruido — o combate continua rodando atras, mas o
// jogador esta olhando outra coisa. Pelo mesmo motivo a camada fica abaixo do
// backdrop e escurece junto com o jogo, igual a HUD ja faz.
//
// O prototipo usava 58 e estava errado: passava na frente de todo painel.
//
// NAO TEM rAF PROPRIO. `desenharVfx` e chamado pelo laco de desenho do
// <GameCanvas>, no fim do quadro. Dois rAF independentes desenhariam em ordem
// nao garantida e a camada ficaria um quadro atras do jogo — visivel num efeito
// que acompanha entidade em movimento. Uma linha de acoplamento paga isso.
import type { Pintor, PintorInfo } from './tiposDeVfx'

export type { Pintor, PintorInfo }

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null

// `Set` e nao array: `registrarPintor` devolve a funcao de remocao, e remover de
// um Set e O(1) sem mexer na ordem dos outros. A ordem de insercao do Set e
// estavel, entao a ordem de pintura e a de registro.
const pintores = new Set<Pintor>()

/**
 * Ancoras nomeadas da HUD, em px de CSS relativos a viewport.
 *
 * Existem porque a camada precisa mirar em elementos de React sem conhece-los:
 * o voo de ouro termina na Carteira, que e um `<span>` dentro do `StatusRail`.
 *
 * O prototipo achava a Carteira com `document.querySelector('[title*="ouro"]')`.
 * Isso quebra na primeira mudanca de texto e quebra EM SILENCIO — o ouro
 * passaria a voar pro canto (0,0) sem erro nenhum. Um registro nomeado
 * transforma essa falha em "ancora ausente", que o chamador pode tratar.
 */
const ancoras = new Map<string, DOMRect>()

export function registrarCanvasDeVfx(elemento: HTMLCanvasElement | null): void {
  canvas = elemento
  ctx = elemento ? elemento.getContext('2d') : null
  if (ctx) {
    // Mesma escolha do canvas do jogo: pixel art, sem suavizacao.
    ctx.imageSmoothingEnabled = false
  }
}

/** Registra um pintor e devolve a funcao que o remove. */
export function registrarPintor(pintor: Pintor): () => void {
  pintores.add(pintor)
  return () => {
    pintores.delete(pintor)
  }
}

/**
 * Ajusta a resolucao do canvas ao tamanho em CSS.
 *
 * SEM `devicePixelRatio`, de proposito, e isso importa: o <GameCanvas> tambem
 * usa `clientWidth` cru. Igualar os dois e o que faz as coordenadas casarem 1:1
 * entre as duas superficies — um efeito que nasce em cima de um POKE precisa
 * pousar no mesmo pixel nas duas. Multiplicar por dpr aqui e nao la deixaria a
 * camada com o dobro da resolucao e metade da escala.
 */
export function ajustarTamanhoDaCamada(): void {
  if (!canvas) return
  const l = canvas.clientWidth
  const a = canvas.clientHeight
  if (canvas.width !== l) canvas.width = l
  if (canvas.height !== a) canvas.height = a
}

/** Publica (ou remove, com `null`) a caixa de uma ancora nomeada. */
export function definirAncora(nome: string, caixa: DOMRect | null): void {
  if (caixa) ancoras.set(nome, caixa)
  else ancoras.delete(nome)
}

/**
 * Centro de uma ancora, em px do CANVAS desta camada.
 *
 * Devolve `null` quando a ancora nao foi registrada — o chamador decide o que
 * fazer. Nunca devolve (0,0) como fallback: aquele e um ponto valido da tela, e
 * um efeito indo pro canto superior esquerdo le como bug de posicao em vez de
 * "o elemento nao esta na tela".
 */
export function centroDaAncora(nome: string): { x: number; y: number } | null {
  const caixa = ancoras.get(nome)
  if (!caixa || !canvas) return null
  const meu = canvas.getBoundingClientRect()
  if (meu.width <= 0 || meu.height <= 0) return null
  const escalaX = canvas.width / meu.width
  const escalaY = canvas.height / meu.height
  return {
    x: (caixa.left + caixa.width / 2 - meu.left) * escalaX,
    y: (caixa.top + caixa.height / 2 - meu.top) * escalaY,
  }
}

/**
 * A ancora inteira, em px do CANVAS desta camada.
 *
 * Existe alem de `centroDaAncora` porque quem escreve PERTO de um elemento da
 * HUD precisa da borda dele, nao do meio: o texto de chegada do voo de ouro
 * (PH-191) ancorado no centro + um offset fixo caia em cima do contador de
 * diamantes. E offset fixo nao serve — `hudScale` vai de 0,8 a 1,4, entao a
 * altura da carteira muda com a preferencia do jogador e um numero em px
 * acertaria so numa escala.
 */
export function caixaDaAncora(nome: string): { x: number; y: number; w: number; h: number } | null {
  const caixa = ancoras.get(nome)
  if (!caixa || !canvas) return null
  const meu = canvas.getBoundingClientRect()
  if (meu.width <= 0 || meu.height <= 0) return null
  const escalaX = canvas.width / meu.width
  const escalaY = canvas.height / meu.height
  return {
    x: (caixa.left - meu.left) * escalaX,
    y: (caixa.top - meu.top) * escalaY,
    w: caixa.width * escalaX,
    h: caixa.height * escalaY,
  }
}

/** Há algo pra desenhar? Deixa o call site pular o trabalho de um quadro vazio. */
export function camadaVazia(): boolean {
  return pintores.size === 0
}

/**
 * Um quadro da camada. Chamado pelo laco de desenho do <GameCanvas>.
 *
 * LIMPA SEMPRE, inclusive quando nao ha pintor nenhum: sem isso o ultimo quadro
 * de um efeito que acabou fica congelado na tela pra sempre — e como a camada
 * esta acima do trilho, o resto do jogo continua se mexendo por baixo de um
 * resto de moeda parado.
 */
export function desenharVfx(dt: number): void {
  if (!canvas || !ctx) return
  ajustarTamanhoDaCamada()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (pintores.size === 0) return

  const info: PintorInfo = { largura: canvas.width, altura: canvas.height, dt }
  for (const pintor of pintores) {
    // `save`/`restore` por pintor: um pintor que deixe `globalAlpha` ou
    // `globalCompositeOperation` sujo nao pode contaminar o proximo. Ja mordeu
    // no prototipo — o rastro aditivo das moedas vazava pro texto do pulso.
    ctx.save()
    try {
      pintor(ctx, info)
    } finally {
      ctx.restore()
    }
  }
}

/** So pra teste: devolve a camada ao estado inicial. */
export function reiniciarCamadaVfx(): void {
  canvas = null
  ctx = null
  pintores.clear()
  ancoras.clear()
}
