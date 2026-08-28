// Layout do texto flutuante do combate: onde cada caixa REALMENTE fica, e como
// duas caixas de donos diferentes param de se atropelar (PH-189).
//
// O PROBLEMA QUE ISTO RESOLVE:
//
// `engine/entity.ts#claimEffectLane` reserva uma raia POR DONO. Isso resolve
// dois efeitos do mesmo POKE, e nao resolve nada entre POKEs vizinhos: dois
// donos diferentes reivindicam a raia 0 cada um, e as duas caixas caem na mesma
// faixa de pixel. Medido no harness da PH-189, um instante de combate com 4 POKE
// em campo dava 4 colisoes em 13 caixas (31%) — `+240 ouro` escrito por cima de
// `Pouco efetivo...` sai como `+240 ouro-fetivo`.
//
// POR QUE O MOTOR NAO PODE RESOLVER ISSO:
//
// A raia do motor vai pro bundle da Edge e precisa ser deterministica: o mesmo
// mundo tem que sair igual no cliente e na autoridade. Largura de texto so
// existe depois de `ctx.measureText`, que e API de canvas — a Edge nao tem. Se o
// motor chutasse largura, o chute erraria em toda fonte diferente da suposta.
//
// Entao a divisao e: o MOTOR empilha por dono (deterministico, sem medir), e o
// CLIENTE faz uma segunda passada com a largura de verdade, um quadro antes de
// desenhar. Nada do que esta aqui volta pro `WorldState`.
//
// A ORDEM DA PASSADA E ESTAVEL de proposito (dono, raia, id): a resolucao roda
// a cada quadro, e uma ordem que mudasse faria a mesma caixa saltar de altura
// entre dois quadros seguidos — que le pior que a sobreposicao que ela conserta.
import type { WorldEffect } from '@/engine/types'

/**
 * As fontes do texto de combate, num lugar so.
 *
 * `render/sprites.ts` DESENHA com elas e este modulo MEDE com elas. Duas copias
 * divergiriam em silencio — a caixa medida com uma fonte e desenhada com outra
 * "resolve" colisao que nao existe e deixa passar a que existe.
 */
export const FONTE = {
  dano: 'bold 12px monospace',
  danoCritico: 'bold 17px monospace',
  marcaDeCritico: 'bold 9px monospace',
  efetividadeSuper: 'bold 13px monospace',
  efetividade: '9px monospace',
  nomeDeGolpe: 'bold 8px monospace',
  nomeDaEspecie: '9px monospace',
  selo: 'bold 9px monospace',
  porcentagemDeHp: 'bold 8px monospace',
} as const

/** Altura em px declarada numa string de `font`. */
export function alturaDaFonte(font: string): number {
  return Number(font.match(/(\d+)px/)?.[1] ?? 0)
}

export interface Caixa {
  x: number
  y: number
  w: number
  h: number
}

export interface CaixaDeEfeito extends Caixa {
  id: string
  ownerId: string | null
  lane: number
}

/**
 * Medidor de texto. `CanvasRenderingContext2D` inteiro nao entra aqui de
 * proposito: a unica coisa que este modulo precisa do canvas e a largura de uma
 * string numa fonte, e uma interface de um metodo torna o teste possivel sem
 * DOM (e deixa claro que nada aqui desenha).
 */
export interface Medidor {
  larguraDe(texto: string, font: string): number
}

export function medidorDoCanvas(ctx: CanvasRenderingContext2D): Medidor {
  return {
    larguraDe(texto, font) {
      const anterior = ctx.font
      ctx.font = font
      const largura = ctx.measureText(texto).width
      ctx.font = anterior
      return largura
    },
  }
}

/** Folga em volta de cada caixa. Duas caixas encostadas ainda leem como uma so. */
const FOLGA = 2

/**
 * A caixa do numero de dano, com tudo que `drawDamageNumber` escreve junto: o
 * numero, a marca de critico na mesma linha e o rotulo de efetividade em cima.
 *
 * `ancoraY` e a BASELINE do numero, ja com o float aplicado — o mesmo `y` que o
 * desenho usa.
 */
export function caixaDoNumeroDeDano(m: Medidor, effect: WorldEffect, ancoraX: number, ancoraY: number): Caixa {
  const crit = effect.isCrit === true
  const fonteNumero = crit ? FONTE.danoCritico : FONTE.dano
  const alturaNumero = alturaDaFonte(fonteNumero)
  const numero = `-${effect.value}`
  let largura = m.larguraDe(numero, fonteNumero)
  if (crit) largura += 3 + m.larguraDe('CRIT', FONTE.marcaDeCritico)

  let topo = ancoraY - alturaNumero
  if (effect.effectiveness) {
    const isSuper = effect.effectiveness === 'super'
    const fonteRotulo = isSuper ? FONTE.efetividadeSuper : FONTE.efetividade
    const rotulo = effect.effectivenessLabel || effect.effectiveness
    largura = Math.max(largura, m.larguraDe(rotulo, fonteRotulo))
    // Mesma conta de `drawDamageNumber`: o rotulo sobe junto quando o numero
    // cresceu, senao o critico encosta nele.
    const baseRotulo = ancoraY - (isSuper ? 14 : 12) - (crit ? 5 : 0)
    topo = Math.min(topo, baseRotulo - alturaDaFonte(fonteRotulo))
  }
  // +3 embaixo pela descida da fonte (o "-" e digitos nao descem, mas o
  // contorno de 3-4px do `strokeText` sim).
  return { x: ancoraX - FOLGA, y: topo - FOLGA, w: largura + FOLGA * 2, h: ancoraY + 3 - topo + FOLGA * 2 }
}

/** A caixa do nome do golpe. Uma linha so, ancorada pela baseline. */
export function caixaDoNomeDeGolpe(m: Medidor, effect: WorldEffect, ancoraX: number, ancoraY: number): Caixa {
  const altura = alturaDaFonte(FONTE.nomeDeGolpe)
  return {
    x: ancoraX - FOLGA,
    y: ancoraY - altura - FOLGA,
    w: m.larguraDe(effect.text ?? '', FONTE.nomeDeGolpe) + FOLGA * 2,
    h: altura + 3 + FOLGA * 2,
  }
}

/**
 * A caixa do rotulo fixo de um POKE (nome, nivel e o selo de boss), que
 * `drawNameLevelTag` desenha centralizado em `entidadeX`.
 *
 * Entra na resolucao como OBSTACULO IMOVEL: o rotulo nao pode sair do lugar (ele
 * identifica o corpo embaixo dele), mas o texto de combate do vizinho tambem nao
 * pode cair em cima dele — foi uma das colisoes medidas.
 */
export function caixaDoRotuloFixo(
  m: Medidor, nome: string, nivel: string, selo: string | null, entidadeX: number, topoDoCorpo: number,
): Caixa {
  const alturaLinha = alturaDaFonte(FONTE.nomeDaEspecie)
  const largura = Math.max(
    m.larguraDe(nome, FONTE.nomeDaEspecie),
    m.larguraDe(nivel, FONTE.nomeDaEspecie),
    selo ? m.larguraDe(selo, FONTE.selo) : 0,
  )
  // Baselines de `drawNameLevelTag`: nivel em -15, nome em -26, selo em -37,
  // todos relativos ao topo do corpo.
  const baseMaisAlta = topoDoCorpo - (selo ? 37 : 26)
  return {
    x: entidadeX - largura / 2 - FOLGA,
    y: baseMaisAlta - alturaLinha - FOLGA,
    w: largura + FOLGA * 2,
    h: topoDoCorpo - 15 + 3 - (baseMaisAlta - alturaLinha) + FOLGA * 2,
  }
}

export function seSobrepoem(a: Caixa, b: Caixa): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** Altura de um degrau de subida. Igual a raia do motor, pra o resultado ficar alinhado com o que ja estava empilhado. */
export const DEGRAU = 16

/**
 * Quantos degraus a caixa pode subir antes de desistir.
 *
 * 10 x 16px = 160px de mundo acima da cabeca. Acima disso a caixa estaria mais
 * perto do POKE de cima da tela do que do dono dela, o que nao conserta leitura
 * nenhuma — so troca de quem o texto parece ser.
 */
const DEGRAUS = 10

export interface Janela {
  y: number
  h: number
}

/**
 * Quanto cada caixa precisa SUBIR (px de mundo, positivo = pra cima) pra
 * ninguem se sobrepor.
 *
 * `fixas` sao os obstaculos que nao se movem (os rotulos de nome/nivel).
 * `janela` corta candidatos que sairiam pela borda de cima da tela: texto fora
 * da tela nao colide com nada e tambem nao informa nada.
 *
 * Quando NENHUM candidato serve, escolhe o de MENOR area de sobreposicao em vez
 * de deixar no lugar: com a tela cheia a colisao vira inevitavel, e a escolha
 * entao e entre "menos texto ilegivel" e "o mesmo de antes".
 */
export function resolverColunasDeTexto(
  caixas: readonly CaixaDeEfeito[], fixas: readonly Caixa[], janela: Janela,
): Map<string, number> {
  const ordenadas = [...caixas].sort((a, b) => {
    const dono = String(a.ownerId).localeCompare(String(b.ownerId))
    if (dono !== 0) return dono
    if (a.lane !== b.lane) return a.lane - b.lane
    return a.id.localeCompare(b.id)
  })

  const ocupadas: Caixa[] = [...fixas]
  const desvios = new Map<string, number>()

  for (const caixa of ordenadas) {
    let escolhido = 0
    let melhorSobra = Infinity
    let melhorDesvio = 0
    for (let passo = 0; passo <= DEGRAUS; passo++) {
      const desvio = passo * DEGRAU
      const tentativa = { ...caixa, y: caixa.y - desvio }
      if (tentativa.y < janela.y) break // saiu pela borda de cima: nao ha o que tentar acima disso
      const sobra = ocupadas.reduce(
        (total, o) => total + areaDeSobreposicao(tentativa, o), 0,
      )
      if (sobra === 0) { escolhido = desvio; melhorSobra = 0; break }
      if (sobra < melhorSobra) { melhorSobra = sobra; melhorDesvio = desvio }
    }
    if (melhorSobra > 0) escolhido = melhorDesvio
    desvios.set(caixa.id, escolhido)
    ocupadas.push({ ...caixa, y: caixa.y - escolhido })
  }

  return desvios
}

function areaDeSobreposicao(a: Caixa, b: Caixa): number {
  const largura = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const altura = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return largura > 0 && altura > 0 ? largura * altura : 0
}
