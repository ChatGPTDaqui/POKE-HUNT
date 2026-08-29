// Borda vermelha na tela quando o MEU POKE leva dano (PH-189).
//
// POR QUE UM CANAL NOVO, se a placa vermelha do PH-131 ja existe:
//
// As duas perguntas sao diferentes e uma nao serve pra outra.
//
//   "de quem e este numero?"     -> placa atras do numero (PH-131). Continua.
//   "estou perdendo a luta?"     -> esta borda.
//
// A placa responde a primeira muito bem, e nao responde a segunda: sao 12px no
// meio de outros seis textos, dentro da mesma faixa disputada de 169px de mundo
// que a issue inteira esta tentando desafogar. Pra ler a placa o jogador precisa
// PROCURAR o numero. Um canal que exige procurar nao e pre-atentivo.
//
// A borda le sem foco (visao periferica pega area e movimento antes de forma) e
// nao custa NADA do orcamento de espaco do campo — ela mora na moldura da tela,
// que estava vazia.
//
// ONDE DESENHA: na camada de VFX (acima da HUD, ver `camadaVfx.ts`). No canvas
// do jogo a borda ficaria atras do trilho de status e do painel, ou seja,
// cortada exatamente nos cantos onde ela e mais visivel.
//
// INTENSIDADE PELA FRACAO DE VIDA, e nao pelo numero cru: 40 de dano num POKE de
// 300 e um arranhao, e num de 45 e quase a morte. O mesmo numero tem que
// acender diferente, senao o canal mente.
import type { PintorInfo } from './tiposDeVfx'

/** Duracao de um clarao, em segundos. Curto: e um alerta, nao um filtro de tela. */
const DURACAO = 0.45

/**
 * Opacidade maxima do clarao mais forte.
 *
 * 0,38 e teto e nao alvo: um POKE que leva 8 hits em 4 segundos acenderia a tela
 * inteira de vermelho, e nesse ponto o canal para de informar e vira incomodo.
 * A soma de claroes simultaneos e cortada no mesmo teto (ver `pintorDeDano`).
 */
const OPACIDADE_MAXIMA = 0.38

/**
 * Fracao de vida perdida que ja acende no maximo. Um quarto da barra num hit so
 * ja e "estou perdendo"; acima disso a diferenca nao muda a decisao do jogador.
 */
const FRACAO_SATURA = 0.25

/** Espessura da borda, como fracao do menor lado da tela. */
const ESPESSURA = 0.13

export interface Clarao {
  /** 0..1, quanto da vida o hit levou (ja saturado). */
  forca: number
  idade: number
}

const claroes: Clarao[] = []

export function acenderDano(fracaoDeVida: number): void {
  if (!(fracaoDeVida > 0)) return
  claroes.push({ forca: Math.min(1, fracaoDeVida / FRACAO_SATURA), idade: 0 })
}

/** Opacidade somada dos claroes vivos neste instante, ja cortada no teto. */
export function opacidadeAtual(): number {
  let total = 0
  for (const c of claroes) {
    const k = 1 - Math.min(1, c.idade / DURACAO)
    // Quadratico na saida: o pico chega instantaneo (e o alerta) e a queda e
    // rapida no comeco e lenta no fim, que e o que le como "pulso" e nao como
    // "a tela ficou vermelha".
    total += OPACIDADE_MAXIMA * c.forca * k * k
  }
  return Math.min(OPACIDADE_MAXIMA, total)
}

export function pintorDeDano(ctx: CanvasRenderingContext2D, info: PintorInfo): void {
  for (const c of claroes) c.idade += info.dt
  for (let i = claroes.length - 1; i >= 0; i--) {
    if (claroes[i].idade >= DURACAO) claroes.splice(i, 1)
  }

  const alfa = opacidadeAtual()
  if (alfa <= 0.001) return

  const { largura, altura } = info
  const espessura = Math.min(largura, altura) * ESPESSURA

  ctx.save()
  ctx.globalAlpha = alfa
  // Quatro gradientes lineares, um por aresta, em vez de um radial centrado: o
  // radial escureceria o meio da tela — exatamente onde o combate acontece — e
  // um alerta que atrapalha ver o combate e um alerta que o jogador vai querer
  // desligar. Assim o centro fica intocado.
  for (const [x, y, w, h, x0, y0, x1, y1] of [
    [0, 0, largura, espessura, 0, 0, 0, espessura],
    [0, altura - espessura, largura, espessura, 0, altura, 0, altura - espessura],
    [0, 0, espessura, altura, 0, 0, espessura, 0],
    [largura - espessura, 0, espessura, altura, largura, 0, largura - espessura, 0],
  ] as const) {
    const grad = ctx.createLinearGradient(x0, y0, x1, y1)
    grad.addColorStop(0, 'rgba(220, 38, 38, 1)')
    grad.addColorStop(1, 'rgba(220, 38, 38, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, w, h)
  }
  ctx.restore()
}

/** Há clarao vivo? */
export function temDanoVivo(): boolean {
  return claroes.length > 0
}

/** So pra teste. */
export function reiniciarPulsoDeDano(): void {
  claroes.length = 0
  vistos = new Set()
}

// --- deteccao de dano novo ---------------------------------------------------
/**
 * Ids de `damageNumber` ja convertidos em clarao.
 *
 * PODADO A CADA QUADRO, pelo mesmo motivo de `vooDeRecompensa.ts`:
 * `createWorldEffect` numera a partir de `counters.effect`, que zera toda vez
 * que o mundo e reconstruido (a cada flush) — os ids se REPETEM entre mundos, e
 * um conjunto acumulado engoliria o dano seguinte em silencio.
 */
let vistos = new Set<string>()

export interface EfeitoDeDano {
  id: string
  type: string
  ownerId: string | null
  value?: number
}

/**
 * Varre os efeitos do mundo e acende um clarao pra cada dano NOVO no POKE do
 * jogador.
 *
 * O dono de um `damageNumber` e quem LEVOU o hit (ver
 * `combatSystem#spawnDamageNumber`), entao o teste e `ownerId === jogadorId` —
 * o mesmo que `drawDamageNumber` usa pra decidir a placa do PH-131. Os dois
 * canais leem o mesmo fato; e por isso que eles nunca discordam.
 */
export function converterDanoNovo(
  efeitos: readonly EfeitoDeDano[], jogadorId: string | null, hpMaximo: number,
): void {
  const nesteQuadro = new Set<string>()
  for (const ef of efeitos) {
    if (ef.type !== 'damageNumber') continue
    nesteQuadro.add(ef.id)
    if (vistos.has(ef.id)) continue
    if (!jogadorId || ef.ownerId !== jogadorId) continue
    if (!ef.value || ef.value <= 0 || !(hpMaximo > 0)) continue
    acenderDano(ef.value / hpMaximo)
  }
  vistos = nesteQuadro
}
