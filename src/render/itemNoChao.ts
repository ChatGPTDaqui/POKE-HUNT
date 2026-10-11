// Itens do POKE derrotado (pocoes, bolas, pedras, TMs) caem no CHAO junto do
// ouro e do XP, ficam um tempo e voam pra Mochila (pedido do dono, 11/10).
// Antes eles so existiam como "Item encontrado: X" no chat.
//
// Mesmo desenho das moedas (render/vooDeRecompensa.ts), por isso as mesmas
// regras:
//   - o motor so EMPURRA um `rewardText` com `unit: 'item'` + `itemId` por item
//     (simulation.ts, fora do `silent`); quem converte em queda e voo e o cliente;
//   - chao em coordenada de MUNDO, chamado pelo renderer ANTES das entidades
//     (o item e cenario; quem passa por cima o cobre);
//   - voo em coordenada de TELA, pela camada de VFX, ate a ancora da Mochila;
//   - sorteio local, nunca o rng do mundo (cosmetico nao pode mexer no que a
//     autoridade reproduz).
//
// O BRILHO e por raridade (data/raridadeDoDrop.ts), em degraus que somam:
//   comum     icone simples, quica e pousa
//   incomum   + aura colorida pulsando no chao
//   raro      + feixe de luz subindo do item, faiscas e um anel ao pousar
//   lendario  + COLUNA de luz dourada alta, estrelas girando, quique maior, fica
//             4 s no chao (os outros 2 s) e a Mochila pulsa com o nome do item
// A ideia ("loot beam" dos ARPGs) e o jogador perceber o raro de canto de olho,
// no meio da luta, sem ler nada.
import { caixaDaAncora, centroDaAncora, type PintorInfo } from './camadaVfx'
import { ANCORA } from '@/hooks/useAncoraDeVfx'
import { corDoDrop, raridadeDoDrop, type RaridadeDoDrop } from '@/data/raridadeDoDrop'
import { itemIconUrl } from '@/data/sprites'
import { getItem } from '@/data/items'

type Ponto = { x: number; y: number }

export interface ItemCaido {
  itemId: string
  raridade: RaridadeDoDrop
  cor: string
  /** Origem em px de MUNDO (centro do corpo derrotado) e onde pousa no chao. */
  x0: number
  y0: number
  xc: number
  yc: number
  /** Segundos ate comecar a cair (escalona varios itens do mesmo abate). */
  atraso: number
  /** Segundos no chao, contados do inicio da queda. */
  espera: number
  duracaoVoo: number
  idade: number
}

export const QUEDA_DO_ITEM = 0.4
const ESPERA_PADRAO = 2
/** O lendario fica mais no chao: e o momento que o jogador quer ver. */
const ESPERA_DO_LENDARIO = 4
const VOO = 0.7
/** Tamanho do icone no chao, px de MUNDO. */
const TAMANHO_NO_CHAO = 12
/** No voo: px de tela por px de mundo (mesmo fator das moedas). */
const ESCALA_NA_TELA = 1.6
const DURACAO_PULSO = 1.1
const DO_CENTRO_AO_CHAO = 8

/** LCG local — ver o topo do arquivo. */
function sorteioLocal(semente: number): () => number {
  let estado = semente >>> 0
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0
    return estado / 0x100000000
  }
}

export function criarItemCaido(itemId: string, origem: Ponto, indice: number, semente: number): ItemCaido {
  const sortear = sorteioLocal(semente)
  const raridade = raridadeDoDrop(itemId)
  // Fora do anel das moedas (12-28 px): o item e maior que uma moeda e precisa
  // ficar legivel ao lado delas. Varios itens do mesmo abate se espalham pelo
  // angulo.
  const angulo = sortear() * Math.PI * 2 + indice * 2.1
  const raio = 22 + sortear() * 10
  return {
    itemId,
    raridade,
    cor: corDoDrop(raridade),
    x0: origem.x,
    y0: origem.y,
    xc: origem.x + Math.cos(angulo) * raio,
    yc: origem.y + DO_CENTRO_AO_CHAO + Math.sin(angulo) * raio * 0.45,
    // Depois das moedas comecarem (elas escalonam em 0,15 s): o item cai por
    // ultimo e o olho termina nele.
    atraso: 0.12 + indice * 0.1,
    espera: raridade === 'lendario' ? ESPERA_DO_LENDARIO : ESPERA_PADRAO,
    duracaoVoo: VOO,
    idade: 0,
  }
}

export type FaseDoItem = 'antes' | 'chao' | 'voo' | 'fim'

export function faseDoItem(item: ItemCaido, t: number): FaseDoItem {
  if (t < 0) return 'antes'
  if (t < item.espera) return 'chao'
  if (t < item.espera + item.duracaoVoo) return 'voo'
  return 'fim'
}

/** Altura do quique (px de mundo): o lendario pula mais alto. */
function alturaDoQuique(raridade: RaridadeDoDrop): number {
  return raridade === 'lendario' ? 26 : raridade === 'raro' ? 16 : 11
}

/** Posicao no MUNDO durante a queda e a espera; `null` fora delas. */
export function posicaoDoItemNoChao(item: ItemCaido, t: number): { x: number; y: number; altura: number } | null {
  if (faseDoItem(item, t) !== 'chao') return null
  if (t >= QUEDA_DO_ITEM) return { x: item.xc, y: item.yc, altura: 0 }
  const k = t / QUEDA_DO_ITEM
  const altura = Math.sin(k * Math.PI) * alturaDoQuique(item.raridade) + (1 - k) * (item.yc - item.y0)
  return { x: item.x0 + (item.xc - item.x0) * k, y: item.yc, altura }
}

function suavizar(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** Posicao na TELA durante o voo; `inicio` e o ponto do chao ja em tela. */
export function posicaoDoItemNoVoo(item: ItemCaido, t: number, inicio: Ponto, destino: Ponto): { x: number; y: number; escala: number } | null {
  if (faseDoItem(item, t) !== 'voo') return null
  const k = (t - item.espera) / item.duracaoVoo
  const s = suavizar(k)
  const arco = Math.sin(k * Math.PI) * 34
  return { x: inicio.x + (destino.x - inicio.x) * s, y: inicio.y + (destino.y - inicio.y) * s - arco, escala: 1 - 0.45 * s }
}

// --- imagens ------------------------------------------------------------------
const imagens = new Map<string, HTMLImageElement>()
function iconeDe(itemId: string): HTMLImageElement | null {
  const url = itemIconUrl(itemId)
  if (!url || typeof Image === 'undefined') return null
  let img = imagens.get(url)
  if (!img) { img = new Image(); img.src = url; imagens.set(url, img) }
  return img.complete && img.naturalWidth > 0 ? img : null
}

function desenharIcone(ctx: CanvasRenderingContext2D, item: ItemCaido, x: number, y: number, tamanho: number): void {
  const img = iconeDe(item.itemId)
  if (img) {
    const prev = ctx.imageSmoothingEnabled
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, x - tamanho / 2, y - tamanho / 2, tamanho, tamanho)
    ctx.imageSmoothingEnabled = prev
    return
  }
  // Sem arte (item novo sem icone, ou imagem ainda carregando): um saquinho na
  // cor da raridade — nunca um buraco.
  ctx.fillStyle = item.cor
  ctx.strokeStyle = '#1f2937'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(x, y, tamanho * 0.38, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
}

// --- brilho no chao -----------------------------------------------------------
function comAlfa(cor: string, a: number): string {
  const n = parseInt(cor.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`
}

function desenharAura(ctx: CanvasRenderingContext2D, item: ItemCaido, x: number, y: number, tempo: number): void {
  const forte = item.raridade === 'lendario' ? 1.5 : item.raridade === 'raro' ? 1.2 : 1.1
  // O incomum so tem a aura (sem feixe): ela precisa se ler sozinha no zoom do
  // jogo, por isso o piso de brilho mais alto.
  const pulso = 0.75 + 0.25 * Math.sin(tempo * 5)
  const rx = 15 * forte, ry = rx * 0.45
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx)
  g.addColorStop(0, comAlfa(item.cor, 0.95 * pulso))
  g.addColorStop(0.55, comAlfa(item.cor, 0.45 * pulso))
  g.addColorStop(1, comAlfa(item.cor, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** Feixe vertical (raro) ou coluna (lendario), aditivo — nunca escurece o cenario. */
function desenharFeixe(ctx: CanvasRenderingContext2D, item: ItemCaido, x: number, y: number, tempo: number, entrada: number): void {
  const lendario = item.raridade === 'lendario'
  const altura = (lendario ? 110 : 46) * entrada
  const largura = lendario ? 11 : 5
  const pulso = 0.75 + 0.25 * Math.sin(tempo * (lendario ? 6 : 4))
  const g = ctx.createLinearGradient(x, y, x, y - altura)
  g.addColorStop(0, comAlfa(item.cor, 0.85 * pulso))
  g.addColorStop(0.6, comAlfa(item.cor, 0.35 * pulso))
  g.addColorStop(1, comAlfa(item.cor, 0))
  ctx.fillStyle = g
  ctx.fillRect(x - largura / 2, y - altura, largura, altura)
  // Nucleo branco fino: le como LUZ, e nao como faixa colorida.
  const n = ctx.createLinearGradient(x, y, x, y - altura * 0.8)
  n.addColorStop(0, `rgba(255,255,255,${0.7 * pulso})`)
  n.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = n
  ctx.fillRect(x - largura * 0.15, y - altura * 0.8, largura * 0.3, altura * 0.8)
}

/** Faiscas subindo (raro) e estrelas girando (lendario). Deterministico no tempo. */
function desenharFaiscas(ctx: CanvasRenderingContext2D, item: ItemCaido, x: number, y: number, tempo: number): void {
  const lendario = item.raridade === 'lendario'
  const n = lendario ? 7 : 4
  ctx.fillStyle = lendario ? '#fff7cc' : '#ffffff'
  for (let i = 0; i < n; i++) {
    const fase = (tempo * 0.9 + i / n) % 1
    const ang = (i / n) * Math.PI * 2 + (lendario ? tempo * 2.2 : 0)
    const r = lendario ? 13 : 6 + i * 2
    const px = x + Math.cos(ang) * r
    const py = y - 4 - fase * (lendario ? 60 : 30) + Math.sin(ang) * r * 0.45
    const tam = (lendario ? 1.8 : 1.2) * (1 - fase)
    if (tam <= 0.2) continue
    ctx.globalAlpha = 1 - fase
    // Estrela de 4 pontas (duas barrinhas): le como brilho em pixel art.
    ctx.fillRect(px - tam * 2, py - tam * 0.4, tam * 4, tam * 0.8)
    ctx.fillRect(px - tam * 0.4, py - tam * 2, tam * 0.8, tam * 4)
  }
  ctx.globalAlpha = 1
}

/** Anel que abre no instante em que o item raro/lendario encosta no chao. */
function desenharAnelDePouso(ctx: CanvasRenderingContext2D, item: ItemCaido, x: number, y: number, desdeOPouso: number): void {
  const dur = 0.45
  if (desdeOPouso < 0 || desdeOPouso > dur) return
  const k = desdeOPouso / dur
  const raio = (item.raridade === 'lendario' ? 34 : 20) * k
  ctx.strokeStyle = comAlfa(item.cor, 1 - k)
  ctx.lineWidth = 2 * (1 - k) + 0.5
  ctx.beginPath()
  ctx.ellipse(x, y, raio, raio * 0.45, 0, 0, Math.PI * 2)
  ctx.stroke()
}

// --- estado vivo --------------------------------------------------------------
const itens: ItemCaido[] = []
const pulsos: { itemId: string; cor: string; lendario: boolean; idade: number }[] = []
let paraTelaAtual: ((p: Ponto) => Ponto | null) | null = null

/**
 * Itens na queda e no chao, em coordenada de MUNDO. Chamado pelo renderer logo
 * depois das moedas e ANTES das entidades.
 */
export function desenharItensNoChao(ctx: CanvasRenderingContext2D): void {
  if (itens.length === 0) return
  ctx.save()
  for (const item of itens) {
    const t = item.idade - item.atraso
    const p = posicaoDoItemNoChao(item, t)
    if (!p) continue
    const pousou = t >= QUEDA_DO_ITEM
    const brilha = item.raridade !== 'comum'

    if (brilha && pousou) {
      ctx.globalCompositeOperation = 'lighter'
      desenharAura(ctx, item, p.x, p.y, t)
      ctx.globalCompositeOperation = 'source-over'
    }
    // Sombra no chao (some quando o feixe ja ilumina o piso do raro).
    ctx.globalAlpha = 0.35
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.ellipse(p.x, p.y + 3, TAMANHO_NO_CHAO * 0.45, TAMANHO_NO_CHAO * 0.18, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    if ((item.raridade === 'raro' || item.raridade === 'lendario') && pousou) {
      const entrada = Math.min(1, (t - QUEDA_DO_ITEM) / 0.25)
      ctx.globalCompositeOperation = 'lighter'
      desenharFeixe(ctx, item, p.x, p.y, t, entrada)
      desenharAnelDePouso(ctx, item, p.x, p.y, t - QUEDA_DO_ITEM)
      ctx.globalCompositeOperation = 'source-over'
    }

    // Respira levemente no chao (sobe 1 px): parado, um icone le como decalque.
    const respiro = pousou && brilha ? Math.sin(t * 4) * 1 : 0
    desenharIcone(ctx, item, p.x, p.y - p.altura - TAMANHO_NO_CHAO * 0.4 - respiro, TAMANHO_NO_CHAO)

    if ((item.raridade === 'raro' || item.raridade === 'lendario') && pousou) desenharFaiscas(ctx, item, p.x, p.y, t)
  }
  ctx.restore()
}

/**
 * Pintor da camada de VFX: avanca o relogio de todos os itens e desenha os voos
 * e o pulso da Mochila. Sem a ancora da Mochila (barra recolhida, outra tela),
 * o item termina no chao e some — nunca voa pra um ponto inventado.
 */
export function pintorDeItemNoChao(ctx: CanvasRenderingContext2D, info: PintorInfo): void {
  for (const item of itens) item.idade += info.dt
  for (const p of pulsos) p.idade += info.dt
  const destino = centroDaAncora(ANCORA.mochila)

  for (let i = itens.length - 1; i >= 0; i--) {
    const item = itens[i]
    if (faseDoItem(item, item.idade - item.atraso) !== 'fim') continue
    itens.splice(i, 1)
    if (destino && item.raridade !== 'comum') {
      pulsos.push({ itemId: item.itemId, cor: item.cor, lendario: item.raridade === 'lendario', idade: 0 })
    }
  }
  for (let i = pulsos.length - 1; i >= 0; i--) if (pulsos[i].idade >= DURACAO_PULSO) pulsos.splice(i, 1)
  if (!destino || !paraTelaAtual) return

  for (const item of itens) {
    const t = item.idade - item.atraso
    if (faseDoItem(item, t) !== 'voo') continue
    const inicio = paraTelaAtual({ x: item.xc, y: item.yc })
    if (!inicio) continue
    const agora = posicaoDoItemNoVoo(item, t, inicio, destino)
    if (!agora) continue
    const tam = TAMANHO_NO_CHAO * ESCALA_NA_TELA * agora.escala
    if (item.raridade !== 'comum') {
      ctx.globalCompositeOperation = 'lighter'
      for (let e = 6; e >= 1; e--) {
        const eco = posicaoDoItemNoVoo(item, t - e * 0.022, inicio, destino)
        if (!eco) continue
        const peso = (7 - e) / 7
        ctx.globalAlpha = 0.45 * peso * peso
        ctx.fillStyle = item.cor
        ctx.beginPath()
        ctx.arc(eco.x, eco.y, tam * 0.45 * (0.4 + 0.6 * peso), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    }
    desenharIcone(ctx, item, agora.x, agora.y, tam)
  }

  // Pulso na Mochila: anel na cor da raridade; raro e lendario dizem O QUE chegou
  // (o lendario em dourado e maior). Abaixo do botao, a partir da caixa dele.
  const caixa = caixaDaAncora(ANCORA.mochila)
  for (const p of pulsos) {
    const k = Math.min(1, p.idade / DURACAO_PULSO)
    if (k < 0.5) {
      const ka = k / 0.5
      ctx.globalAlpha = 1 - ka
      ctx.strokeStyle = p.cor
      ctx.lineWidth = (p.lendario ? 3.5 : 2.5) * (1 - ka) + 0.5
      ctx.beginPath()
      ctx.arc(destino.x, destino.y, 8 + ka * (p.lendario ? 34 : 22), 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
    const nome = getItem(p.itemId)?.name ?? p.itemId
    ctx.textAlign = 'center'
    ctx.lineJoin = 'round'
    ctx.font = `bold ${p.lendario ? 13 : 11}px monospace`
    ctx.lineWidth = 3
    const y = (caixa ? caixa.y : destino.y) - 8 - 12 * k
    ctx.strokeStyle = '#000000'
    ctx.strokeText(`+ ${nome}`, destino.x, y)
    ctx.fillStyle = p.cor
    ctx.fillText(`+ ${nome}`, destino.x, y)
    ctx.globalAlpha = 1
  }
}

export function temItemNoChao(): boolean {
  return itens.length > 0 || pulsos.length > 0
}

export function contarItensNoChao(): number {
  return itens.length
}

/** So pra teste. */
export function reiniciarItensNoChao(): void {
  itens.length = 0
  pulsos.length = 0
  vistos = new Set()
  proximaSemente = 1
  paraTelaAtual = null
}

// --- deteccao -----------------------------------------------------------------
// Podado a cada quadro pelos efeitos ainda vivos: os ids de efeito se REPETEM
// entre mundos reconstruidos (ver a mesma nota em vooDeRecompensa.ts).
let vistos = new Set<string>()
let proximaSemente = 1

/**
 * Varre os efeitos do mundo e faz cair cada item novo. Os itens do mesmo abate
 * (mesma origem no mesmo quadro) se espalham pelo `indice`.
 */
export function converterItensNovos(
  efeitos: readonly { id: string; type: string; unit?: string; itemId?: string; x: number; y: number }[],
  paraTela: (p: Ponto) => Ponto | null,
): void {
  paraTelaAtual = paraTela
  const nesteQuadro = new Set<string>()
  const porOrigem = new Map<string, number>()
  for (const ef of efeitos) {
    if (ef.type !== 'rewardText' || ef.unit !== 'item' || !ef.itemId) continue
    nesteQuadro.add(ef.id)
    if (vistos.has(ef.id)) continue
    if (!paraTela({ x: ef.x, y: ef.y })) continue
    const chave = `${Math.round(ef.x)},${Math.round(ef.y)}`
    const indice = porOrigem.get(chave) ?? 0
    porOrigem.set(chave, indice + 1)
    itens.push(criarItemCaido(ef.itemId, { x: ef.x, y: ef.y }, indice, proximaSemente++))
  }
  vistos = nesteQuadro
}
