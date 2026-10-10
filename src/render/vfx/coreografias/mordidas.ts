// Família Mordida (09/10): dez golpes de presa, cada um com a sua boca.
//
// A família é a BOCA que aparece no alvo e fecha nele — o tipo só pinta a
// gengiva e decide o que escapa entre os dentes (faísca, gelo, chama,
// veneno...). Cada golpe tem perfil próprio: forma da boca (mandíbula
// inteira, incisivos de roedor, presas de cobra, pinças de inseto), quantas
// vezes fecha e o rescaldo. Mesmo padrão dos socos: perfil por golpe, uma
// coreografia, nada de estado entre quadros.
import { emitirParticulas } from '../particulas'
import { getAbility } from '@/data/abilities'
import { NEUTROS, PELES } from '../paletas'
import { entrada, estilhacos, estrelaDeImpacto, limitar, pontosDeRaio, riscos, saida, tracarRaio } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { em } from './comum'
import { CORES_DE_HP, barraDeHp, bola, comAcento, entrePontos, estatica, setasDeStatus, susto } from './formas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto, Tier } from '../tipos'

const [ESCURO, BRANCO] = NEUTROS

/** Forma da boca. */
type Boca = 'mandibula' | 'incisivos' | 'presas' | 'pincas'
/** O que acontece quando a boca fecha — a personalidade do golpe. */
type Rescaldo = 'sombra' | 'racha' | 'estalo' | 'metade' | 'raio' | 'gelo' | 'chama' | 'veneno' | 'migalha' | 'dreno'

interface Perfil {
  boca: Boca
  rescaldo: Rescaldo
  /** ms do primeiro fechamento (o número de dano sai aqui). */
  contato: number
  /** Quanto tempo a boca leva aparecendo e abrindo antes de fechar. */
  abertura: number
  tamanho: number
  /** Fechamentos: o Crunch tritura duas vezes, o Bug Bite belisca duas. */
  mordidas: 1 | 2
}

export const PERFIS_DE_MORDIDA: Record<string, Perfil> = {
  bite: { boca: 'mandibula', rescaldo: 'sombra', contato: 170, abertura: 120, tamanho: 1, mordidas: 1 },
  crunch: { boca: 'mandibula', rescaldo: 'racha', contato: 190, abertura: 140, tamanho: 1.2, mordidas: 2 },
  hyper_fang: { boca: 'incisivos', rescaldo: 'estalo', contato: 140, abertura: 100, tamanho: 1.1, mordidas: 1 },
  super_fang: { boca: 'incisivos', rescaldo: 'metade', contato: 200, abertura: 150, tamanho: 1.25, mordidas: 1 },
  thunder_fang: { boca: 'mandibula', rescaldo: 'raio', contato: 160, abertura: 120, tamanho: 1.05, mordidas: 1 },
  ice_fang: { boca: 'mandibula', rescaldo: 'gelo', contato: 160, abertura: 120, tamanho: 1.05, mordidas: 1 },
  fire_fang: { boca: 'mandibula', rescaldo: 'chama', contato: 160, abertura: 120, tamanho: 1.05, mordidas: 1 },
  poison_fang: { boca: 'presas', rescaldo: 'veneno', contato: 160, abertura: 130, tamanho: 1.15, mordidas: 1 },
  bug_bite: { boca: 'pincas', rescaldo: 'migalha', contato: 130, abertura: 100, tamanho: 1.3, mordidas: 2 },
  leech_life: { boca: 'pincas', rescaldo: 'dreno', contato: 150, abertura: 110, tamanho: 1.15, mordidas: 1 },
}

/** Intervalo entre a primeira e a segunda mordida. */
const SEGUNDA = 110
/** Boca fechada apertando, depois do último fechamento. */
const APERTO = 90
/** Boca se soltando e sumindo. */
const SOLTA = 110
/** Furos de presa que ficam depois que a boca some (Bite/Crunch). */
const MARCA = 160
/** Gotas de vida voltando ao atacante (Leech Life). */
const VOLTA = 260

function duracaoDe(p: Perfil): number {
  const ultimo = p.contato + (p.mordidas - 1) * SEGUNDA
  return ultimo + APERTO + SOLTA + (p.rescaldo === 'dreno' ? VOLTA - SOLTA + 60 : MARCA)
}

/** Meia abertura da boca fechada, por forma. */
const FECHADA: Record<Boca, number> = { mandibula: 5, incisivos: 3, presas: 5, pincas: 1 }

const contatosDe = (p: Perfil) => p.mordidas === 2 ? [p.contato, p.contato + SEGUNDA] : [p.contato]

// ---------------------------------------------------------------------------
// Formas (pixel decidido pela forma: contorno escuro, faixas chapadas)
// ---------------------------------------------------------------------------

function poligono(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], cor: string): void {
  ctx.fillStyle = cor; ctx.beginPath()
  pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
  ctx.closePath(); ctx.fill()
}

/** Dente triangular com a ponta pra +Y, contorno neutro por baixo. */
function dente(ctx: CanvasRenderingContext2D, x: number, y: number, largura: number, comprimento: number, cor: string, ponta?: string): void {
  const m = largura / 2
  poligono(ctx, [[x - m - 1.2, y - 1], [x + m + 1.2, y - 1], [x, y + comprimento + 1.6]], ESCURO)
  poligono(ctx, [[x - m, y], [x + m, y], [x, y + comprimento]], cor)
  if (ponta) poligono(ctx, [[x - m * .45, y + comprimento * .55], [x + m * .45, y + comprimento * .55], [x, y + comprimento]], ponta)
}

/** Altura da borda de dentro do arco da gengiva em `x` (quadrática de -15 a 15). */
const bordaDoArco = (x: number) => { const s = (x + 15) / 30; return -1 - 16 * s * (1 - s) }

/**
 * Meia boca de cima, em coordenadas locais: dentes apontando pra +Y (o meio
 * da boca). A de baixo é a mesma espelhada — por isso `defasagem` desloca os
 * dentes meio passo, pra eles se encaixarem ao fechar.
 */
function meiaBoca(ctx: CanvasRenderingContext2D, perfil: Perfil, pele: Pele, defasagem: number): void {
  const gengiva = (k: number) => {
    ctx.beginPath(); ctx.moveTo(-20 - k, 1 + k * .5)
    ctx.quadraticCurveTo(0, -17 - k * 1.4, 20 + k, 1 + k * .5)
    ctx.lineTo(15, -1 + k * .3); ctx.quadraticCurveTo(0, -9 + k * .3, -15, -1 + k * .3); ctx.closePath()
  }
  if (perfil.boca === 'mandibula') {
    const gelo = perfil.rescaldo === 'gelo'
    const corDoDente = gelo ? pele.nucleo : BRANCO
    // Presas nas pontas, incisivos no meio: a boca lê como boca de fera.
    for (const [x, comp, larg] of [[-11, 10, 5], [11, 10, 5], [-5.5, 5, 4], [0, 5, 4], [5.5, 5, 4]] as const) {
      const xx = x + defasagem
      dente(ctx, xx, bordaDoArco(xx) - .5, larg, comp * (gelo ? 1.15 : 1), corDoDente, gelo ? pele.meio : undefined)
    }
    gengiva(1.4); ctx.fillStyle = pele.contorno; ctx.fill()
    gengiva(0); ctx.fillStyle = pele.base; ctx.fill()
    poligono(ctx, [[-12, -8], [-5, -10.5], [5, -10.5], [12, -8], [8, -7], [-8, -7]], pele.meio)
    return
  }
  if (perfil.boca === 'incisivos') {
    // Dois dentões de roedor saindo de um lábio curvo: largos em cima, ponta
    // em bisel (corte inclinado pra dentro). Lábio mais largo que os dentes —
    // sem ele os dentes liam como dois blocos soltos.
    for (const lado of [-1, 1]) {
      const x0 = lado * .7, x1 = lado * 5
      const a = Math.min(x0, x1), b = Math.max(x0, x1)
      const pontaDentro = 13, pontaFora = 10.5
      const yA = lado < 0 ? pontaFora : pontaDentro, yB = lado < 0 ? pontaDentro : pontaFora
      poligono(ctx, [[a - 1.1, -2], [b + 1.1, -2], [b + 1, yB + 1.5], [a - 1, yA + 1.5]], ESCURO)
      poligono(ctx, [[a, -1.5], [b, -1.5], [b, yB], [a, yA]], BRANCO)
      // Sombra na metade de fora do dente: volume em duas faixas.
      const s0 = lado < 0 ? a : b - 1.6, s1 = lado < 0 ? a + 1.6 : b
      poligono(ctx, [[s0, 0], [s1, 0], [s1, lado < 0 ? yA - .5 : yB - .5], [s0, lado < 0 ? yA - .5 : yB - .5]], pele.meio)
    }
    const labio = (k: number) => {
      ctx.beginPath(); ctx.moveTo(-12 - k, 1 + k * .4)
      ctx.quadraticCurveTo(0, -10 - k * 1.3, 12 + k, 1 + k * .4)
      ctx.quadraticCurveTo(0, -3 + k * .3, -12 - k, 1 + k * .4); ctx.closePath()
    }
    labio(1.4); ctx.fillStyle = pele.contorno; ctx.fill()
    labio(0); ctx.fillStyle = pele.base; ctx.fill()
    poligono(ctx, [[-6, -4.6], [0, -5.6], [6, -4.6], [0, -4]], pele.meio)
    return
  }
  if (perfil.boca === 'presas') {
    // Cobra: duas presas longas e curvas, quase sem gengiva.
    for (const lado of [-1, 1]) {
      const x = lado * 4.5
      ctx.beginPath(); ctx.moveTo(x - 3.6 * lado, -2); ctx.quadraticCurveTo(x + 1 * lado, 6, x - 1.5 * lado, 16)
      ctx.lineTo(x + 3.4 * lado, -2); ctx.closePath(); ctx.fillStyle = ESCURO; ctx.fill()
      ctx.beginPath(); ctx.moveTo(x - 2.2 * lado, -1); ctx.quadraticCurveTo(x + 1 * lado, 6, x - 1.2 * lado, 14)
      ctx.lineTo(x + 2 * lado, -1); ctx.closePath(); ctx.fillStyle = BRANCO; ctx.fill()
      poligono(ctx, [[x - .6 * lado, 9], [x + .9 * lado, 9], [x - 1.2 * lado, 14]], pele.meio)
    }
    const labio = (k: number) => {
      ctx.beginPath(); ctx.moveTo(-13 - k, 1 + k * .4); ctx.quadraticCurveTo(0, -9 - k * 1.3, 13 + k, 1 + k * .4)
      ctx.quadraticCurveTo(0, -2 + k * .3, -13 - k, 1 + k * .4); ctx.closePath()
    }
    labio(1.4); ctx.fillStyle = pele.contorno; ctx.fill()
    labio(0); ctx.fillStyle = pele.base; ctx.fill()
    return
  }
}

/**
 * Pinça de inseto vinda do lado `lado` (-1 esquerda): foice em "(" com as duas
 * pontas viradas pro meio — as duas juntas leem como mandíbula de besouro.
 */
function pinca(ctx: CanvasRenderingContext2D, lado: number, pele: Pele): void {
  ctx.save(); ctx.scale(lado, 1)
  const foice = (k: number) => {
    ctx.beginPath(); ctx.moveTo(-4 + k * .4, -11 - k)
    ctx.quadraticCurveTo(-26 - k * 1.6, -1, -4 + k * .4, 10 + k)
    ctx.quadraticCurveTo(-15 + k, 0, -4 + k * .4, -11 - k); ctx.closePath()
  }
  foice(1.5); ctx.fillStyle = pele.contorno; ctx.fill()
  foice(0); ctx.fillStyle = pele.base; ctx.fill()
  poligono(ctx, [[-6, -9.5], [-15, -5], [-17, 0], [-14, -3]], pele.meio)
  // Serrilha de dentinhos na borda de dentro.
  for (const y of [-4, 2]) poligono(ctx, [[-13.4, y - 1.8], [-13.4, y + 1.8], [-10, y]], BRANCO)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Rescaldo de cada golpe (o que escapa quando a boca fecha)
// ---------------------------------------------------------------------------

function rachaduras(ctx: CanvasRenderingContext2D, p: Ponto, t: number, alcance: number, pele: Pele, rng: () => number): void {
  const cresce = saida(limitar(t / .2)), some = 1 - entrada(limitar((t - .35) / .4))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4 + rng() * .6 - .3
    const L = alcance * (.6 + rng() * .4) * cresce
    const pts = pontosDeRaio(p, { x: p.x + Math.cos(a) * L, y: p.y + Math.sin(a) * L * .8 }, 4, 2, rng)
    if (some <= .05) continue
    // Fresta clara com borda escura: em alvo escuro a rachadura toda escura sumia.
    tracarRaio(ctx, pts, 1.7 * some, { ...pele, meio: BRANCO, nucleo: BRANCO })
  }
}

/** Furos de presa que ficam no alvo depois que a boca solta. */
function marcasDeDente(ctx: CanvasRenderingContext2D, p: Ponto, t: number, pele: Pele): void {
  if (t < 0 || t >= 1) return
  const k = 1 - entrada(t)
  if (k <= .1) return
  // Só os dois furos das presas, pequenos: seis furos liam como grade.
  for (const cima of [-1, 1]) for (const x of [-6, 6]) {
    const y = p.y + cima * 4, r = 1.1 * k + .5
    poligono(ctx, [[p.x + x - r - 1, y - cima * (r + 1)], [p.x + x + r + 1, y - cima * (r + 1)], [p.x + x, y + cima * (r * 1.8 + 1)]], ESCURO)
    poligono(ctx, [[p.x + x - r, y - cima * r], [p.x + x + r, y - cima * r], [p.x + x, y + cima * r * 1.8]], pele.acento?.[0] ?? pele.estrela)
  }
}

function talhoDaMetade(ctx: CanvasRenderingContext2D, p: Ponto, t: number, tier: number): void {
  // Linha que corta o alvo ao meio de lado a lado: o "metade do HP" do Super Fang.
  const L = (18 + tier * 2) * saida(limitar(t / .25)), e = 2.2 * (1 - entrada(limitar((t - .35) / .5)))
  if (e <= .2) return
  poligono(ctx, [[p.x - L - 2, p.y + 1], [p.x, p.y - e - 1.4], [p.x + L + 2, p.y - 1], [p.x, p.y + e + 1.4]], ESCURO)
  poligono(ctx, [[p.x - L, p.y + .6], [p.x, p.y - e], [p.x + L, p.y - .6], [p.x, p.y + e]], BRANCO)
}

function cristaisDeGelo(ctx: CanvasRenderingContext2D, p: Ponto, t: number, pele: Pele, rng: () => number): void {
  // Cristais crescem da linha da mordida pros lados e ficam um instante.
  const cresce = saida(limitar(t / .3)), some = 1 - entrada(limitar((t - .6) / .4))
  const k = cresce * some
  for (let i = 0; i < 6; i++) {
    const lado = i % 2 ? 1 : -1, a = (lado < 0 ? Math.PI : 0) + (rng() - .5) * 1.3
    const L = (9 + rng() * 7) * k, w = 2.4 + rng() * 1.2
    if (L < 1) continue
    const b = { x: p.x + Math.cos(a) * 6, y: p.y + Math.sin(a) * 4 }
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a)
    poligono(ctx, [[-1, 0], [L * .35, -w - 1.2], [L + 1.6, 0], [L * .35, w + 1.2]], pele.contorno)
    poligono(ctx, [[0, 0], [L * .35, -w], [L, 0], [L * .35, w]], pele.meio)
    poligono(ctx, [[1, 0], [L * .35, -w * .4], [L * .7, 0]], pele.nucleo)
    ctx.restore()
  }
}

function linguasDeFogo(ctx: CanvasRenderingContext2D, p: Ponto, t: number, pele: Pele, tier: number): void {
  // Duas línguas saindo dos cantos da boca fechada, pra cima e pra fora.
  const k = saida(limitar(t / .25)) * (1 - entrada(limitar((t - .45) / .55)))
  if (k <= .05) return
  for (const lado of [-1, 1]) {
    const bx = p.x + lado * 12, by = p.y + 1
    const alto = (7 + tier) * k, largo = 3.4 * k
    const lingua = (g: number, cor: string) => {
      ctx.beginPath(); ctx.moveTo(bx - largo - g, by + 2 + g)
      ctx.quadraticCurveTo(bx - largo * 1.4 + lado * 2, by - alto * .55, bx + lado * 4, by - alto - g)
      ctx.quadraticCurveTo(bx + largo * 1.6, by - alto * .25, bx + largo + g, by + 2 + g)
      ctx.closePath(); ctx.fillStyle = cor; ctx.fill()
    }
    lingua(1.6, pele.contorno); lingua(0, pele.base)
    ctx.save(); ctx.translate(bx, by); ctx.scale(.55, .6); ctx.translate(-bx, -by); lingua(0, pele.meio); ctx.restore()
    ctx.save(); ctx.translate(bx, by + 1); ctx.scale(.25, .3); ctx.translate(-bx, -by - 1); lingua(0, pele.nucleo); ctx.restore()
  }
}

function gotasDeVeneno(ctx: CanvasRenderingContext2D, p: Ponto, t: number, pele: Pele, rng: () => number, n: number): void {
  // Pingos que caem das presas com gravidade e estouram embaixo do alvo.
  for (let i = 0; i < n; i++) {
    const x0 = p.x + (i % 2 ? 7 : -7) + (rng() - .5) * 10, atraso = rng() * .3, vx = (rng() - .5) * 14
    const u = (t - atraso) / (1 - atraso)
    if (u < 0 || u > 1) continue
    const x = x0 + vx * u, y = p.y + 14 + 26 * u * u
    const r = 2.6 * (1 - entrada(limitar((u - .7) / .3)))
    if (r <= .3) continue
    ctx.beginPath(); ctx.moveTo(x, y - r * 2.4); ctx.quadraticCurveTo(x + r * 1.6, y + r, x, y + r + 1); ctx.quadraticCurveTo(x - r * 1.6, y + r, x, y - r * 2.4)
    ctx.fillStyle = pele.contorno; ctx.fill()
    ctx.beginPath(); ctx.arc(x, y + .3, r * .85, 0, Math.PI * 2); ctx.fillStyle = pele.base; ctx.fill()
    ctx.fillStyle = pele.nucleo; ctx.fillRect(x - r * .5, y - r * .5, 1.4, 1.4)
  }
}

function migalhas(ctx: CanvasRenderingContext2D, p: Ponto, t: number, pele: Pele, rng: () => number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (rng() - .5) * 2.4, v = 14 + rng() * 12, s = 1.8 + rng() * 1.6
    const x = p.x + Math.cos(a) * v * t, y = p.y + Math.sin(a) * v * t + 30 * t * t
    const lado = s * (1 - entrada(limitar((t - .6) / .4)))
    if (lado <= .3) continue
    ctx.fillStyle = pele.contorno; ctx.fillRect(x - lado / 2 - .8, y - lado / 2 - .8, lado + 1.6, lado + 1.6)
    ctx.fillStyle = i % 3 ? pele.meio : pele.nucleo; ctx.fillRect(x - lado / 2, y - lado / 2, lado, lado)
  }
}

function gotasDeVida(ctx: CanvasRenderingContext2D, de: Ponto, para: Ponto, t: number, pele: Pele, n: number): void {
  // Bolinhas de vida voltando ao atacante em ondas — leem como "sugou".
  const dx = para.x - de.x, dy = para.y - de.y
  for (let i = 0; i < n; i++) {
    const u = limitar((t - i * .12) / .7)
    if (u <= 0 || u >= 1) continue
    const v = entrada(u) * .35 + saida(u) * .65
    const onda = Math.sin(u * Math.PI * 2 + i) * 6 * (1 - u)
    const L = Math.hypot(dx, dy) || 1
    const x = de.x + dx * v - (dy / L) * onda, y = de.y + dy * v + (dx / L) * onda - Math.sin(u * Math.PI) * 8
    const r = 3.2 - u * 1.2
    ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, Math.PI * 2); ctx.fillStyle = pele.contorno; ctx.fill()
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = SANGUE; ctx.fill()
    ctx.fillStyle = BRANCO; ctx.fillRect(x - 1, y - 1.4, 1.6, 1.6)
  }
}

const SANGUE = '#c81e2a', AZUL = '#58a6f0', FRUTA = ['#d83a4a', '#ff8a8a', '#4caf50'] as const

// ---------------------------------------------------------------------------
// Coreografia
// ---------------------------------------------------------------------------

/** Abertura da boca (meia distância entre as metades) no instante `ms`. */
function aberturaEm(perfil: Perfil, ms: number): { abre: number; escala: number } | null {
  const contatos = contatosDe(perfil)
  const ultimo = contatos[contatos.length - 1]
  const inicio = perfil.contato - perfil.abertura
  if (ms < inicio || ms >= ultimo + APERTO + SOLTA) return null
  const fechar = perfil.boca === 'incisivos' ? 45 : 60
  const largo = perfil.boca === 'pincas' ? 16 : 15
  // Fechada a boca NÃO some no meio do alvo: os dentes cravam e as gengivas
  // ficam por fora do corpo — é isso que lê como mordida.
  const f = FECHADA[perfil.boca]
  if (ms < perfil.contato - fechar) {
    const u = (ms - inicio) / (perfil.abertura - fechar)
    return { abre: em(saida(u), 8, largo), escala: em(saida(limitar(u * 1.6)), .55, 1) }
  }
  if (ms < perfil.contato) return { abre: em(entrada((ms - perfil.contato + fechar) / fechar), largo, f), escala: 1 }
  if (contatos.length > 1 && ms < contatos[1]) {
    // Reabre um pouco e fecha de novo: mastigada.
    const u = (ms - perfil.contato) / SEGUNDA
    return { abre: u < .55 ? em(saida(u / .55), f, 11) : em(entrada((u - .55) / .45), 11, f), escala: 1 }
  }
  if (ms < ultimo + APERTO) return { abre: f, escala: 1 }
  const u = (ms - ultimo - APERTO) / SOLTA
  // Solta abrindo pra fora e some rápido: boca encolhendo em cima do alvo virava mancha.
  return { abre: em(saida(u), f, f + 10), escala: 1 - entrada(u) }
}

function coreografia(perfil: Perfil, c: ContextoVfx): void {
  const { ctx, ms, tier, pele, origem, alvo } = c
  if (ms < 0 || ms >= c.duracao) return
  const semente = Math.floor(c.rng() * 0xffffffff)
  const boca = { x: alvo.x, y: alvo.y - 3 }
  const escala = .62 * perfil.tamanho * (1 + (tier - 1) * .07)
  const contatos = contatosDe(perfil)

  // Atrás da boca: o que escapa dela no fechamento.
  contatos.forEach((contato, i) => {
    const depois = (ms - contato) / 260
    if (depois < 0 || depois >= 1) return
    const rng = rngSemeado(semente + i * 131)
    const final = i === contatos.length - 1
    // Estrela ATRÁS da boca: o clarão do contato não pode esconder os dentes.
    const forte = final && (perfil.rescaldo === 'racha' || perfil.rescaldo === 'metade' || perfil.rescaldo === 'estalo')
    if (i === 0 || forte) estrelaDeImpacto(ctx, boca, (forte ? 12 : 8) + tier * 1.5, depois, pele, rng)
    if (perfil.rescaldo === 'racha' && final) rachaduras(ctx, boca, depois, 18 + tier * 3, pele, rng)
    if (perfil.rescaldo === 'chama') linguasDeFogo(ctx, boca, depois, pele, tier)
  })

  const a = aberturaEm(perfil, ms)
  if (a && a.escala > .05) {
    const tremor = ms >= perfil.contato && ms < contatos[contatos.length - 1] + APERTO ? (Math.floor(ms / 33) % 2 ? .8 : -.8) : 0
    const s = escala * a.escala
    if (perfil.boca === 'pincas') {
      for (const lado of [-1, 1]) {
        ctx.save(); ctx.translate(boca.x + lado * (a.abre * 1.1 + 2) * s + tremor, boca.y); ctx.scale(s, s)
        pinca(ctx, lado, pele); ctx.restore()
      }
    } else {
      // Cobra só desce a boca de cima: duas metades fechando liam como caixa.
      for (const cima of perfil.boca === 'presas' ? [true] : [true, false]) {
        ctx.save(); ctx.translate(boca.x + tremor, boca.y + (cima ? -1 : 1) * (a.abre + 1.5) * s)
        ctx.scale(s, cima ? s : -s * (perfil.boca === 'incisivos' ? .62 : .92))
        meiaBoca(ctx, perfil, pele, cima ? 0 : 2.75)
        ctx.restore()
      }
    }
    // Veneno pendurado na ponta das presas enquanto a boca abre.
    if (perfil.rescaldo === 'veneno' && ms < perfil.contato) {
      for (const lado of [-1, 1]) {
        const y = boca.y - (a.abre + 1.5) * s + 15 * s + 2
        ctx.beginPath(); ctx.arc(boca.x + lado * 5.6 * s, y, 1.8, 0, Math.PI * 2); ctx.fillStyle = pele.meio; ctx.fill()
      }
    }
    // Rastro de carga elétrica entre os dentes antes do fechamento.
    if (perfil.rescaldo === 'raio' && ms < perfil.contato) {
      // Carga nas presas: faíscas curtas piscando nas pontas, sem cruzar o alvo.
      const rng = rngSemeado(semente + Math.floor(ms / 66) * 7)
      for (const lado of [-1, 1]) for (const cima of [-1, 1]) {
        if (rng() < .45) continue
        const ponta = { x: boca.x + lado * 11 * s, y: boca.y + cima * (a.abre + 1.5 - 9) * s }
        tracarRaio(ctx, pontosDeRaio(ponta, { x: ponta.x + lado * 6, y: ponta.y + cima * 5 }, 3, 1, rng), 1.2, pele)
      }
    }
  }

  // Na frente da boca: impacto e rescaldo.
  contatos.forEach((contato, i) => {
    const depois = (ms - contato) / 260
    if (depois < 0 || depois >= 1) return
    const rng = rngSemeado(semente + i * 131 + 17)
    const final = i === contatos.length - 1
    riscos(ctx, boca, c.pedir(2 + tier), 20 + tier * 4, depois, pele.meio, rng)
    // Partículas nascem nos CANTOS da boca (onde ela aperta), não no meio do alvo.
    const canto = { x: boca.x + (i % 2 ? -1 : 1) * 12, y: boca.y }
    switch (perfil.rescaldo) {
      case 'sombra': break
      case 'racha': if (final) estilhacos(ctx, canto, c.pedir(2 + (tier >> 1)), 22 + tier * 3, depois, { ...pele, meio: pele.nucleo }, rng); break
      case 'estalo': emitirParticulas(ctx, pele, boca, c.pedir(3 + tier), 20 + tier * 2, depois, 4, rng); break
      case 'metade': talhoDaMetade(ctx, boca, depois, tier); break
      case 'raio': {
        // Dois arcos curtos saindo pelos cantos da boca, re-sorteados a cada 2 passos.
        const k = 1 - entrada(limitar(depois / .6))
        if (k > .1) for (const lado of [-1, 1]) {
          const ini = { x: boca.x + lado * 11, y: boca.y }
          const fim = { x: boca.x + lado * (22 + tier * 2), y: boca.y + (rng() - .5) * 16 }
          tracarRaio(ctx, pontosDeRaio(ini, fim, 4, 2, rngSemeado(semente + Math.floor(ms / 66) * 13 + lado)), 1.6 * k, pele)
        }
        break
      }
      case 'gelo': cristaisDeGelo(ctx, boca, depois, pele, rng); estilhacos(ctx, boca, c.pedir(2 + tier), 18 + tier * 3, depois, pele, rng); break
      case 'chama': emitirParticulas(ctx, pele, boca, c.pedir(4 + tier), 20 + tier * 2, depois, 4, rng); break
      case 'veneno': gotasDeVeneno(ctx, boca, depois, pele, rng, c.pedir(3 + tier)); break
      case 'migalha': migalhas(ctx, boca, depois, pele, rng, c.pedir(4 + tier)); break
      case 'dreno': break
    }
  })

  // Bite/Crunch: os furos das presas ficam um instante depois que a boca some.
  if (perfil.rescaldo === 'sombra' || perfil.rescaldo === 'racha') {
    marcasDeDente(ctx, boca, (ms - contatos[contatos.length - 1] - APERTO - SOLTA) / MARCA, pele)
  }

  // Efeito secundário de cada golpe, como a descrição do jogo diz.
  const ultimo = contatos[contatos.length - 1]
  const t2 = (ms - ultimo - 40) / (APERTO + SOLTA + MARCA - 40)
  if (t2 > 0 && t2 < 1) {
    const k = saida(limitar(t2 / .2)) * (1 - entrada(limitar((t2 - .75) / .25)))
    switch (perfil.rescaldo) {
      // Bite / Hyper Fang: "may make the target flinch".
      case 'sombra': case 'estalo': susto(ctx, alvo, k); break
      // Crunch: "may lower the target's Defense".
      case 'racha': setasDeStatus(ctx, alvo, t2, AZUL, 1, true); break
      // Super Fang: "cuts the target's HP in half" — a barra cai pela metade.
      case 'metade': barraDeHp(ctx, { x: alvo.x, y: alvo.y + 17 }, 1 - .5 * saida(limitar(t2 / .4))); break
      // Thunder Fang: "flinch or paralysis".
      case 'raio': estatica(ctx, alvo, k, pele, Math.floor(ms / 66) * 7); break
      // Fire Fang: "flinch or burn" — marquinha de queimadura em cima do alvo.
      case 'chama':
        if (k > .1) emitirParticulas(ctx, pele, { x: alvo.x + 9, y: alvo.y - 12 }, 1, 2, (t2 * 2) % 1, 4 * k, rngSemeado(7))
        break
      // Poison Fang: "badly poisoned" — bolhas roxas fundas subindo sem parar.
      case 'veneno':
        for (let i = 0; i < 4; i++) {
          const v = (t2 * 1.6 + i * .25) % 1
          bola(ctx, { x: alvo.x + (i - 1.5) * 6, y: alvo.y + 6 - v * 20 }, 2.4 * (1 - v) * k + .3, pele, pele.contorno, pele.meio)
        }
        break
      // Bug Bite: "if the target is holding a Berry, the user eats it".
      case 'migalha': {
        const v = saida(limitar(t2 / .6)), q = entrePontos({ x: alvo.x, y: alvo.y - 8 }, { x: origem.x, y: origem.y - 6 }, v)
        q.y -= Math.sin(v * Math.PI) * 12
        if (v < .98) {
          ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(q.x, q.y, 4.2, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = FRUTA[0]; ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = FRUTA[1]; ctx.fillRect(q.x - 1.6, q.y - 1.8, 1.4, 1.4)
          ctx.fillStyle = FRUTA[2]; ctx.fillRect(q.x, q.y - 4.6, 2, 1.6)
        }
        break
      }
    }
  }

  // Leech Life: "drains the target's blood" — gotas de SANGUE voltam a quem atacou.
  if (perfil.rescaldo === 'dreno') {
    const t = (ms - perfil.contato - 60) / VOLTA
    if (t >= 0 && t < 1) gotasDeVida(ctx, boca, { x: origem.x, y: origem.y - 2 }, t, pele, 2 + Math.min(c.pedir(2 + tier), 3))
  }
}

const TIERS: readonly Tier[] = [1, 2, 3, 4]
export const MORDIDAS_POR_GOLPE: Record<string, EntradaDeCoreografia> = Object.fromEntries(
  Object.entries(PERFIS_DE_MORDIDA).map(([id, perfil]) => [id, {
    desenhar: (c: ContextoVfx) => coreografia(perfil, c),
    duracao: Object.fromEntries(TIERS.map(t => [t, duracaoDe(perfil)])),
    impactos: Object.fromEntries(TIERS.map(t => [t, [perfil.contato]])),
    alcance: 50,
    margem: { cima: 60, baixo: 50, lados: 50 },
    pele: comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], SANGUE, AZUL, ...FRUTA, ...CORES_DE_HP, PELES.ELECTRIC.meio),
  }]),
)
