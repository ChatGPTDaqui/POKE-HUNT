// Ouro e XP voam do POKE derrotado ate a carteira do trilho (PH-191).
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

export interface Moeda {
  /** Origem, em px de TELA — o mundo ja foi convertido na criacao. */
  x0: number
  y0: number
  /** Ponto de espalhamento, onde a fase 1 termina. */
  xm: number
  ym: number
  /** Segundos ate esta moeda comecar a andar. Escalona a saida. */
  atraso: number
  duracao: number
  giro: number
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

const FASE1 = 0.22
const VOO_MIN = 0.5
const VOO_MAX = 0.8
const DURACAO_PULSO = 0.85

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

export function criarVoo(
  tipo: TipoDeRecompensa, valor: number, origem: { x: number; y: number }, semente: number,
): Voo | null {
  const n = quantidadeDeMoedas(valor)
  if (n === 0) return null
  const sortear = sorteioLocal(semente)
  const moedas: Moeda[] = []
  for (let i = 0; i < n; i++) {
    // Leque pra CIMA (-160° a -20°): pra baixo a moeda atravessaria o corpo do
    // POKE e o chao, e a carteira esta no topo — sair pra baixo pra depois subir
    // le como hesitacao.
    const angulo = (-160 + sortear() * 140) * (Math.PI / 180)
    const raio = 14 + sortear() * 30
    moedas.push({
      x0: origem.x,
      y0: origem.y,
      xm: origem.x + Math.cos(angulo) * raio,
      ym: origem.y + Math.sin(angulo) * raio,
      // Escalonado: as 12 saindo no mesmo quadro viram um borrao unico;
      // espalhadas em 0,18s leem como fluxo.
      atraso: (i / n) * 0.18,
      duracao: VOO_MIN + sortear() * (VOO_MAX - VOO_MIN),
      giro: sortear() * Math.PI * 2,
      // Medido: com 3,4-5,0px as moedas eram pontinhos que nao leem como moeda
      // numa captura de 1280px. Nao acompanha o zoom da camera — o voo e
      // desenhado em coordenada de TELA, e o destino tambem nao acompanha.
      tamanho: tipo === 'ouro' ? 7 + sortear() * 3 : 5.5 + sortear() * 2.5,
      idade: 0,
    })
  }
  return { tipo, valor, moedas, idade: 0 }
}

function suavizar(t: number): number {
  // easeInOutCubic. A saida lenta faz a moeda "descolar" do POKE; a chegada
  // lenta e o que deixa o olho registrar ONDE ela pousou, que e o ponto do
  // efeito inteiro.
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** Onde a moeda esta em `t` segundos desde o proprio atraso. `null` = acabou. */
export function posicaoDaMoeda(
  m: Moeda, t: number, destino: { x: number; y: number },
): { x: number; y: number; escala: number } | null {
  if (t < 0) return null
  if (t < FASE1) {
    const k = suavizar(t / FASE1)
    return { x: m.x0 + (m.xm - m.x0) * k, y: m.y0 + (m.ym - m.y0) * k, escala: 0.4 + 0.6 * k }
  }
  const k = (t - FASE1) / m.duracao
  if (k >= 1) return null
  const s = suavizar(k)
  // Arco: a moeda sobe antes de convergir. Linha reta pro canto le como
  // "elemento de interface se movendo"; o arco le como objeto.
  const arco = Math.sin(k * Math.PI) * 26
  return {
    x: m.xm + (destino.x - m.xm) * s,
    y: m.ym + (destino.y - m.ym) * s - arco,
    // Encolhe na chegada: some DENTRO da carteira em vez de piscar fora.
    escala: 1 - 0.5 * s,
  }
}

export function vooTerminou(voo: Voo): boolean {
  return voo.moedas.every((m) => m.idade >= m.atraso + FASE1 + m.duracao)
}

const COR_OURO = ['#fde68a', '#fbbf24', '#b45309'] as const
const COR_XP = ['#bbf7d0', '#4ade80', '#15803d'] as const

// RASTRO por amostragem do proprio caminho no passado.
//
// Sem ele o efeito NAO EXISTE em movimento: uma moeda de 8px atravessa 600px em
// 0,6s, ou ~10px por quadro — o olho recebe posicoes desconexas e nao integra
// num movimento. Foi o que a primeira captura do prototipo mostrou, e depois que
// as 12 moedas apareciam como pontos isolados a cada ~50px.
//
// Amostrar `posicaoDaMoeda(t - k*passo)` em vez de guardar historico: zero
// estado por moeda, e o rastro sai exatamente sobre a trajetoria, curva do arco
// inclusive — um rastro reto atras de objeto em arco le como erro.
const ECOS = 9
const PASSO_DO_ECO = 0.019
const ALFA_DO_ECO = 0.3

function desenharVoo(ctx: CanvasRenderingContext2D, voo: Voo, destino: { x: number; y: number }): void {
  const [claro, medio, escuro] = voo.tipo === 'ouro' ? COR_OURO : COR_XP
  for (const m of voo.moedas) {
    const t = m.idade - m.atraso
    const agora = posicaoDaMoeda(m, t, destino)
    if (!agora) continue

    // Ecos em modo ADITIVO: sobre cenario escuro eles brilham e sobre cenario
    // claro nao sujam (aditivo nunca escurece). A licao do PH-141 — julgar sobre
    // o fundo mais desfavoravel — vale aqui, e a floresta tem os dois.
    ctx.globalCompositeOperation = 'lighter'
    for (let i = ECOS; i >= 1; i--) {
      const eco = posicaoDaMoeda(m, t - i * PASSO_DO_ECO, destino)
      if (!eco) continue
      const peso = (ECOS - i + 1) / (ECOS + 1)
      ctx.globalAlpha = ALFA_DO_ECO * peso * peso
      ctx.beginPath()
      ctx.arc(eco.x, eco.y, m.tamanho * eco.escala * (0.3 + 0.55 * peso), 0, Math.PI * 2)
      ctx.fillStyle = claro
      ctx.fill()
    }
    ctx.globalAlpha = 0.3
    ctx.beginPath()
    ctx.arc(agora.x, agora.y, m.tamanho * agora.escala * 1.7, 0, Math.PI * 2)
    ctx.fillStyle = claro
    ctx.fill()

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    const r = m.tamanho * agora.escala
    if (r <= 0.3) continue
    // "Giro" sem 3D: a largura oscila e o reflexo anda com ela. Custa um
    // `abs(cos)` e le como moeda girando — bem mais barato que sprite.
    const larguraRel = Math.max(0.25, Math.abs(Math.cos(m.giro + m.idade * 7)))

    ctx.beginPath()
    ctx.ellipse(agora.x, agora.y, r * larguraRel, r, 0, 0, Math.PI * 2)
    ctx.fillStyle = medio
    ctx.fill()
    ctx.lineWidth = 1.2
    ctx.strokeStyle = escuro
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(
      agora.x - r * larguraRel * 0.3, agora.y - r * 0.3,
      Math.max(0.4, r * larguraRel * 0.34), Math.max(0.4, r * 0.34), 0, 0, Math.PI * 2,
    )
    ctx.fillStyle = claro
    ctx.fill()
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
  destino: { x: number; y: number },
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

export function lancarRecompensa(
  tipo: TipoDeRecompensa, valor: number, origemNaTela: { x: number; y: number }, semente: number,
): void {
  const voo = criarVoo(tipo, valor, origemNaTela, semente)
  if (voo) voos.push(voo)
}

/**
 * O pintor registrado na camada de VFX. Avanca e desenha voos e pulsos.
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

  if (!destino) {
    voos.length = 0
    return
  }

  for (const voo of voos) desenharVoo(ctx, voo, destino)

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

/** Quantos voos estao no ar. Exportado pra o teste poder CONTAR, e nao so
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
 * vez de importado pra esta funcao ser testavel sem `Renderer` nem canvas.
 */
export function converterRecompensasNovas(
  efeitos: readonly { id: string; type: string; unit?: string; value?: number; x: number; y: number }[],
  paraTela: (p: { x: number; y: number }) => { x: number; y: number } | null,
): void {
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

    const origem = paraTela({ x: ef.x, y: ef.y })
    if (!origem) continue
    lancarRecompensa(tipo, ef.value, origem, proximaSemente++)
  }
  vistos = nesteQuadro
}

/** So pra teste. */
export function reiniciarDeteccao(): void {
  vistos = new Set()
  proximaSemente = 1
}
