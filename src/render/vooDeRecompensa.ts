// Ouro e XP do POKE derrotado: caem no CHAO em volta do corpo, ficam 2 s, e
// so entao sobem pra carteira do trilho (PH-191; chao desde 08/10).
//
// POR QUE ISTO SUBSTITUI O TEXTO NO CAMPO:
//
// `handleEnemyDefeated` cria DOIS `rewardText` por abate. Eles ocupavam a mesma
// faixa que o numero de dano precisa — medido no harness da PH-189, o campo em
// 390px tem 169 px de MUNDO de largura util, e um instante de combate cheio nao
// cabe nela (das 20 posicoes que o resolvedor tenta, as 20 estavam ocupadas ou
// fora da tela). O voo tira as duas caixas do campo E entrega a informacao onde
// ela mora: a moeda chega no numero que ela muda.
//
// POR QUE CAI NO CHAO PRIMEIRO (08/10, pedido do dono): o leque de moedas
// subindo NA HORA do abate passava por cima dos golpes da luta seguinte — a
// poluicao visual cobria justamente o que o jogador quer ver. No chao, por
// BAIXO dos corpos, a moeda e cenario; quando ela sobe, 2 s depois, o golpe que
// matou ja terminou.
//
// DUAS CAMADAS, uma por fase:
//   - chao (queda + espera): `desenharMoedasNoChao`, chamado pelo renderer do
//     mundo ANTES das entidades, em coordenada de MUNDO — a moeda fica presa ao
//     chao quando a camera anda e os POKE passam por cima dela;
//   - voo: o pintor da camada de VFX (acima da HUD), em coordenada de TELA, ate
//     a carteira. O ponto de partida e o lugar da moeda no chao NAQUELE quadro.
//
// O MOTOR NAO FOI ALTERADO. O cliente le os `rewardText` que ja existem no
// `WorldState` e os converte em voo — ver `data/recompensaDoAbate.ts` pro
// porque. Isso tambem faz o farm offline (`silent`) continuar mudo de graca:
// la os efeitos nem sao criados.
//
// SORTEIO PROPRIO, e nao `world.rng`: o voo e 100% cosmetico e nao toca o
// `WorldState`. Puxar do rng do mundo faria um efeito visual do CLIENTE avancar
// a sequencia que a AUTORIDADE reproduz — divergencia de snapshot por causa de
// uma moeda. Um gerador local mantem o efeito testavel sem esse acoplamento.
import { caixaDaAncora, centroDaAncora, type PintorInfo } from './camadaVfx'
import { ANCORA } from '@/hooks/useAncoraDeVfx'
import { tipoDaRecompensa, type TipoDeRecompensa } from '@/data/recompensaDoAbate'

type Ponto = { x: number; y: number }

export interface Moeda {
  /** Origem, em px de MUNDO: o centro do corpo do POKE derrotado. */
  x0: number
  y0: number
  /** Onde a moeda pousa no chao, em px de MUNDO. */
  xc: number
  yc: number
  /** Segundos ate esta moeda comecar a cair. Escalona a saida. */
  atraso: number
  /** Duracao do voo ate a carteira. */
  duracao: number
  giro: number
  /** Raio em px de MUNDO (no chao). No voo vira px de tela por `ESCALA_NA_TELA`. */
  tamanho: number
  idade: number
}

export interface Voo {
  tipo: TipoDeRecompensa
  valor: number
  moedas: Moeda[]
  idade: number
}

export interface Pulso {
  tipo: TipoDeRecompensa
  valor: number
  idade: number
}

/** Queda do corpo ate o chao. */
export const QUEDA = 0.35
/** Quando a moeda sai do chao, contado do inicio da queda (pedido: 2 s). */
export const ESPERA_NO_CHAO = 2
const VOO_MIN = 0.5
const VOO_MAX = 0.8
const DURACAO_PULSO = 0.85
/** Moeda no voo: px de tela por px de mundo (o zoom da camera do jogo e 1,5). */
const ESCALA_NA_TELA = 1.6

/**
 * Quantas moedas por voo.
 *
 * Escala com o valor e SATURA em 12: o pedido e "sensacao de ganho", e acima de
 * uma duzia o olho para de contar e passa a ler so densidade — o custo de
 * desenho cresce sem devolver nada. Piso de 3 porque uma moeda sozinha nao le
 * como recompensa, le como particula perdida.
 */
export function quantidadeDeMoedas(valor: number): number {
  if (valor <= 0) return 0
  return Math.max(3, Math.min(12, Math.round(Math.log10(valor + 1) * 4)))
}

/** LCG local. Ver a nota do topo sobre nao usar o rng do mundo. */
function sorteioLocal(semente: number): () => number {
  let estado = semente >>> 0
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0
    return estado / 0x100000000
  }
}

/** Distancia do centro do corpo ate o chao, em px de mundo (o pe de um POKE medio). */
const DO_CENTRO_AO_CHAO = 8

export function criarVoo(
  tipo: TipoDeRecompensa, valor: number, origem: Ponto, semente: number,
): Voo | null {
  const n = quantidadeDeMoedas(valor)
  if (n === 0) return null
  const sortear = sorteioLocal(semente)
  const moedas: Moeda[] = []
  for (let i = 0; i < n; i++) {
    // Volta INTEIRA em volta do corpo, achatada como o chao da camera 3/4
    // (0,45). Raio a partir de 12: dentro disso a moeda ficaria escondida
    // embaixo do proprio corpo que acabou de cair.
    const angulo = sortear() * Math.PI * 2
    const raio = 12 + sortear() * 16
    moedas.push({
      x0: origem.x,
      y0: origem.y,
      xc: origem.x + Math.cos(angulo) * raio,
      yc: origem.y + DO_CENTRO_AO_CHAO + Math.sin(angulo) * raio * 0.45,
      // Escalonado: as 12 caindo no mesmo quadro viram um borrao unico.
      atraso: (i / n) * 0.15,
      duracao: VOO_MIN + sortear() * (VOO_MAX - VOO_MIN),
      giro: sortear() * Math.PI * 2,
      tamanho: tipo === 'ouro' ? 3.6 + sortear() * 1.4 : 2.8 + sortear() * 1.2,
      idade: 0,
    })
  }
  return { tipo, valor, moedas, idade: 0 }
}

function suavizar(t: number): number {
  // easeInOutCubic. A saida lenta faz a moeda "descolar" do chao; a chegada
  // lenta e o que deixa o olho registrar ONDE ela pousou, que e o ponto do
  // efeito inteiro.
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export type FaseDaMoeda = 'antes' | 'chao' | 'voo' | 'fim'

/** Fase em `t` segundos desde o proprio atraso. */
export function faseDaMoeda(m: Moeda, t: number): FaseDaMoeda {
  if (t < 0) return 'antes'
  if (t < ESPERA_NO_CHAO) return 'chao'
  if (t < ESPERA_NO_CHAO + m.duracao) return 'voo'
  return 'fim'
}

/** Onde a moeda esta no MUNDO durante queda e espera. `null` fora dessa fase. */
export function posicaoNoChao(m: Moeda, t: number): { x: number; y: number; altura: number } | null {
  if (faseDaMoeda(m, t) !== 'chao') return null
  if (t >= QUEDA) return { x: m.xc, y: m.yc, altura: 0 }
  const k = t / QUEDA
  // Pulinho: sobe um pouco e cai no ponto do chao. A `altura` fica separada do
  // `y` pra sombra continuar no chao enquanto a moeda esta no ar.
  const altura = Math.sin(k * Math.PI) * 10 + (1 - k) * (m.yc - m.y0)
  return { x: m.x0 + (m.xc - m.x0) * k, y: m.yc, altura }
}

/**
 * Onde a moeda esta na TELA durante o voo. `inicio` e onde ela esta no chao
 * neste quadro, ja convertido pra tela. `null` fora do voo.
 */
export function posicaoNoVoo(
  m: Moeda, t: number, inicio: Ponto, destino: Ponto,
): { x: number; y: number; escala: number } | null {
  if (faseDaMoeda(m, t) !== 'voo') return null
  const k = (t - ESPERA_NO_CHAO) / m.duracao
  const s = suavizar(k)
  // Arco: a moeda sobe antes de convergir. Linha reta pro canto le como
  // "elemento de interface se movendo"; o arco le como objeto.
  const arco = Math.sin(k * Math.PI) * 26
  return {
    x: inicio.x + (destino.x - inicio.x) * s,
    y: inicio.y + (destino.y - inicio.y) * s - arco,
    // Encolhe na chegada: some DENTRO da carteira em vez de piscar fora.
    escala: 1 - 0.5 * s,
  }
}

export function vooTerminou(voo: Voo): boolean {
  return voo.moedas.every((m) => faseDaMoeda(m, m.idade - m.atraso) === 'fim')
}

const COR_OURO = ['#fde68a', '#fbbf24', '#b45309'] as const
const COR_XP = ['#bbf7d0', '#4ade80', '#15803d'] as const

function desenharCorpoDaMoeda(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number, m: Moeda,
  cores: readonly [string, string, string], traco: number,
): void {
  const [claro, medio, escuro] = cores
  // "Giro" sem 3D: a largura oscila e o reflexo anda com ela. Custa um
  // `abs(cos)` e le como moeda girando — bem mais barato que sprite.
  const larguraRel = Math.max(0.25, Math.abs(Math.cos(m.giro + m.idade * 7)))
  ctx.beginPath()
  ctx.ellipse(x, y, r * larguraRel, r, 0, 0, Math.PI * 2)
  ctx.fillStyle = medio
  ctx.fill()
  ctx.lineWidth = traco
  ctx.strokeStyle = escuro
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(
    x - r * larguraRel * 0.3, y - r * 0.3,
    Math.max(0.3, r * larguraRel * 0.34), Math.max(0.3, r * 0.34), 0, 0, Math.PI * 2,
  )
  ctx.fillStyle = claro
  ctx.fill()
}

/**
 * Moedas na queda e no chao, em coordenada de MUNDO. O renderer chama ANTES
 * das entidades: a moeda e chao, e quem passa por cima dela a cobre.
 */
export function desenharMoedasNoChao(ctx: CanvasRenderingContext2D): void {
  if (voos.length === 0) return
  ctx.save()
  for (const voo of voos) {
    const cores = voo.tipo === 'ouro' ? COR_OURO : COR_XP
    for (const m of voo.moedas) {
      const p = posicaoNoChao(m, m.idade - m.atraso)
      if (!p) continue
      // Sombra no chao: ancora a moeda no piso e, na queda, mostra onde ela vai
      // pousar.
      ctx.globalAlpha = 0.35
      ctx.fillStyle = '#000000'
      ctx.beginPath()
      ctx.ellipse(p.x, p.y + m.tamanho * 0.7, m.tamanho * 0.9, m.tamanho * 0.35, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      desenharCorpoDaMoeda(ctx, p.x, p.y - p.altura, m.tamanho, m, cores, 0.8)
    }
  }
  ctx.restore()
}

// RASTRO por amostragem do proprio caminho no passado.
//
// Sem ele o efeito NAO EXISTE em movimento: uma moeda de 8px atravessa 600px em
// 0,6s, ou ~10px por quadro — o olho recebe posicoes desconexas e nao integra
// num movimento. Foi o que a primeira captura do prototipo mostrou, e depois que
// as 12 moedas apareciam como pontos isolados a cada ~50px.
//
// Amostrar `posicaoNoVoo(t - k*passo)` em vez de guardar historico: zero
// estado por moeda, e o rastro sai exatamente sobre a trajetoria, curva do arco
// inclusive — um rastro reto atras de objeto em arco le como erro.
const ECOS = 9
const PASSO_DO_ECO = 0.019
const ALFA_DO_ECO = 0.3

function desenharVoo(ctx: CanvasRenderingContext2D, voo: Voo, destino: Ponto, paraTela: (p: Ponto) => Ponto | null): void {
  const cores = voo.tipo === 'ouro' ? COR_OURO : COR_XP
  const claro = cores[0]
  for (const m of voo.moedas) {
    const t = m.idade - m.atraso
    if (faseDaMoeda(m, t) !== 'voo') continue
    const inicio = paraTela({ x: m.xc, y: m.yc })
    if (!inicio) continue
    const agora = posicaoNoVoo(m, t, inicio, destino)
    if (!agora) continue
    const tamanho = m.tamanho * ESCALA_NA_TELA

    // Ecos em modo ADITIVO: sobre cenario escuro eles brilham e sobre cenario
    // claro nao sujam (aditivo nunca escurece). A licao do PH-141 — julgar sobre
    // o fundo mais desfavoravel — vale aqui, e a floresta tem os dois.
    ctx.globalCompositeOperation = 'lighter'
    for (let i = ECOS; i >= 1; i--) {
      const eco = posicaoNoVoo(m, t - i * PASSO_DO_ECO, inicio, destino)
      if (!eco) continue
      const peso = (ECOS - i + 1) / (ECOS + 1)
      ctx.globalAlpha = ALFA_DO_ECO * peso * peso
      ctx.beginPath()
      ctx.arc(eco.x, eco.y, tamanho * eco.escala * (0.3 + 0.55 * peso), 0, Math.PI * 2)
      ctx.fillStyle = claro
      ctx.fill()
    }
    ctx.globalAlpha = 0.3
    ctx.beginPath()
    ctx.arc(agora.x, agora.y, tamanho * agora.escala * 1.7, 0, Math.PI * 2)
    ctx.fillStyle = claro
    ctx.fill()

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    const r = tamanho * agora.escala
    if (r <= 0.3) continue
    desenharCorpoDaMoeda(ctx, agora.x, agora.y, r, m, cores, 1.2)
  }
}

/**
 * Pulso na carteira quando a leva chega.
 *
 * NO CANVAS, e nao um `transform` no `<span>` da Carteira: mexer no elemento
 * mudaria a largura dele e o trilho inteiro tremeria — exatamente o defeito que
 * o PH-157 veio consertar (a coluna dos vitais ia de 221,2px a 144px porque a
 * Carteira mudava de largura com o valor). Pintado por cima, o pulso nao
 * participa de layout nenhum.
 */
function desenharPulso(
  ctx: CanvasRenderingContext2D,
  p: Pulso,
  destino: Ponto,
  baseDoTexto: number,
  ordem: number,
): void {
  const k = Math.min(1, p.idade / DURACAO_PULSO)
  const cor = p.tipo === 'ouro' ? '#fbbf24' : '#4ade80'

  if (k < 0.5) {
    const kAnel = k / 0.5
    ctx.globalAlpha = 1 - kAnel
    ctx.strokeStyle = cor
    ctx.lineWidth = 2.5 * (1 - kAnel) + 0.5
    ctx.beginPath()
    ctx.arc(destino.x, destino.y, 6 + kAnel * 20, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Sobe POUCO (10px): o valor nao precisa viajar, o olho ja esta na carteira —
  // foi pra la que a moeda voou.
  ctx.globalAlpha = k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35
  ctx.textAlign = 'center'
  ctx.lineJoin = 'round'
  ctx.font = 'bold 13px monospace'
  ctx.lineWidth = 3
  const y = baseDoTexto + ordem * 14 - 10 * k
  const rotulo = `+${p.valor}${p.tipo === 'xp' ? ' XP' : ''}`
  ctx.strokeStyle = '#000000'
  ctx.strokeText(rotulo, destino.x, y)
  ctx.fillStyle = cor
  ctx.fillText(rotulo, destino.x, y)
}

// --- estado vivo -------------------------------------------------------------
const voos: Voo[] = []
const pulsos: Pulso[] = []

/**
 * Conversao mundo -> tela do quadro ATUAL, deixada por `converterRecompensasNovas`
 * (que o laco chama todo quadro). O voo precisa dela a cada quadro, e nao so na
 * criacao: a moeda passa 2 s no chao, e a camera anda nesse tempo.
 */
let paraTelaAtual: ((p: Ponto) => Ponto | null) | null = null

export function lancarRecompensa(
  tipo: TipoDeRecompensa, valor: number, origemNoMundo: Ponto, semente: number,
): void {
  const voo = criarVoo(tipo, valor, origemNoMundo, semente)
  if (voo) voos.push(voo)
}

/**
 * O pintor registrado na camada de VFX. Avanca o relogio de TODAS as moedas
 * (chao inclusive — o renderer do mundo so desenha) e desenha voos e pulsos.
 *
 * Quando a ancora da carteira nao existe (trilho ainda nao montou, ou o jogador
 * esta numa tela que a esconde), os voos sao DESCARTADOS em vez de desenhados
 * num ponto inventado. Um efeito convergindo pro canto (0,0) le como bug de
 * posicao; nenhum efeito le como "nao era hora".
 */
export function pintorDeRecompensa(ctx: CanvasRenderingContext2D, info: PintorInfo): void {
  const destino = centroDaAncora(ANCORA.carteira)

  for (const voo of voos) {
    voo.idade += info.dt
    for (const m of voo.moedas) m.idade += info.dt
  }
  for (const p of pulsos) p.idade += info.dt

  // Chegada -> pulso. Feito ANTES do descarte pra uma leva que termine no mesmo
  // quadro ainda marcar a carteira.
  for (let i = voos.length - 1; i >= 0; i--) {
    if (!vooTerminou(voos[i])) continue
    const [voo] = voos.splice(i, 1)
    if (destino) pulsos.push({ tipo: voo.tipo, valor: voo.valor, idade: 0 })
  }
  for (let i = pulsos.length - 1; i >= 0; i--) {
    if (pulsos[i].idade >= DURACAO_PULSO) pulsos.splice(i, 1)
  }

  if (!destino || !paraTelaAtual) {
    voos.length = 0
    return
  }

  for (const voo of voos) desenharVoo(ctx, voo, destino, paraTelaAtual)

  if (pulsos.length > 0) {
    // O texto sai ABAIXO da carteira, e a base vem da CAIXA dela — nao do centro
    // mais um offset fixo. Medido na captura: com o centro + 20px o `+1840`
    // caia em cima do contador de diamantes. E offset fixo nem resolveria: com
    // `hudScale` de 0,8 a 1,4 a altura da carteira muda com a preferencia do
    // jogador, entao um numero em px acertaria numa escala e erraria nas outras.
    const caixa = caixaDaAncora(ANCORA.carteira)
    const base = (caixa ? caixa.y + caixa.h : destino.y) + 14
    pulsos.forEach((p, i) => desenharPulso(ctx, p, destino, base, i))
  }
}

/** Quantos voos estao vivos. Exportado pra o teste poder CONTAR, e nao so
 * perguntar se ha algum — a diferenca entre provar que nao duplicou e supor. */
export function contarVoos(): number {
  return voos.length
}

/** Há efeito vivo? Usado pra o call site nao registrar pintor a toa. */
export function temRecompensaViva(): boolean {
  return voos.length > 0 || pulsos.length > 0
}

/** So pra teste. */
export function reiniciarRecompensas(): void {
  voos.length = 0
  pulsos.length = 0
}

// --- deteccao de recompensa nova ---------------------------------------------
/**
 * Ids de `rewardText` ja convertidos em voo.
 *
 * PODADO A CADA QUADRO pros que ainda estao vivos no mundo, e nao acumulado.
 * Duas razoes, e a segunda e um bug de verdade:
 *
 *  - Sem poda o conjunto cresce pra sempre (2 ids por abate, 612 abates/hora
 *    medidos).
 *  - `createWorldEffect` numera a partir de `counters.effect`, que volta a 1
 *    toda vez que o mundo e RECONSTRUIDO — e ele e reconstruido a cada flush.
 *    Ou seja: os ids se REPETEM entre mundos. Um conjunto acumulado trataria o
 *    `effect-3` do mundo novo como ja visto e engoliria a recompensa em
 *    silencio. Podando, o id antigo sai junto com o efeito antigo e o novo
 *    entra limpo.
 */
let vistos = new Set<string>()

// Semente do sorteio cosmetico. Incrementa por voo pra duas levas seguidas nao
// sairem com o mesmo leque — nao precisa ser imprevisivel, precisa ser diferente.
let proximaSemente = 1

/**
 * Varre os efeitos do mundo e lanca um voo pra cada recompensa nova.
 *
 * `paraTela` converte mundo -> px de tela (e `null` fora da hunt). Injetado em
 * vez de importado pra esta funcao ser testavel sem `Renderer` nem canvas. Fica
 * guardado pro voo usar nos quadros seguintes.
 */
export function converterRecompensasNovas(
  efeitos: readonly { id: string; type: string; unit?: string; value?: number; x: number; y: number }[],
  paraTela: (p: Ponto) => Ponto | null,
): void {
  paraTelaAtual = paraTela
  const nesteQuadro = new Set<string>()
  for (const ef of efeitos) {
    if (ef.type !== 'rewardText') continue
    nesteQuadro.add(ef.id)
    if (vistos.has(ef.id)) continue

    const tipo = tipoDaRecompensa(ef.unit)
    // Unidade desconhecida nao vira voo — ver a nota em `tipoDaRecompensa`.
    // Valor zero tambem nao: abate em hunt de treino rende 0 e uma chuva de
    // moedas anunciando nada seria mentira visual.
    if (!tipo || !ef.value || ef.value <= 0) continue

    // Fora da hunt (`null`) nao ha chao nem carteira pra onde voar.
    if (!paraTela({ x: ef.x, y: ef.y })) continue
    lancarRecompensa(tipo, ef.value, { x: ef.x, y: ef.y }, proximaSemente++)
  }
  vistos = nesteQuadro
}

/** So pra teste. */
export function reiniciarDeteccao(): void {
  vistos = new Set()
  proximaSemente = 1
  paraTelaAtual = null
}
