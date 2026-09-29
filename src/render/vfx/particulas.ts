// A PERSONALIDADE de cada tipo: forma E movimento da particula-assinatura.
//
// REGRA DO DONO (2026-09-28): "golpe de grama sai literalmente folhas, agua e
// agua mesmo — nao faca algo padronizado e so mude de cor". Por isso cada tipo
// tem aqui um DESENHO proprio e um JEITO DE SE MEXER proprio. Teste de
// sanidade pra qualquer tipo novo: tirando a cor, ainda da pra saber o tipo?
// Folha que caisse reto como pedra, ou gota que subisse como chama, reprova.
//
// Coreografias de tipo usam `emitirParticulas` como CORPO do efeito. Estrela e
// riscos (primitivas.ts) sao tempero de impacto, nunca o efeito inteiro.
import { NEUTROS } from './paletas'
import { entrada, limitar, saida } from './primitivas'
import type { ParticulaDoTipo, Pele, Ponto } from './tipos'

const TAU = Math.PI * 2
const [ESCURO, BRANCO] = NEUTROS

/** Estado de uma particula num instante. `giro` em rad; `vira` -1..1 e o "flip" 3D (folha, pena). */
export interface Pose { x: number; y: number; giro: number; vira: number; escala: number }

/** 4 numeros fixos por particula, sorteados uma vez da semente do efeito. */
export type Sementes = readonly [number, number, number, number]

type Mover = (p: Ponto, s: Sementes, t: number, alcance: number) => Pose
type Desenhar = (ctx: CanvasRenderingContext2D, tam: number, t: number, pele: Pele, s: Sementes) => void

// ---------------------------------------------------------------------------
// MOVIMENTOS — cada um e uma fisica diferente, nao so direcao diferente
// ---------------------------------------------------------------------------

/** Sobe tremulando e afina: calor, fantasma, bolha. */
const subir: Mover = (p, [a, b, c], t, R) => ({
  x: p.x + (a - 0.5) * R * 0.7 * saida(t) + Math.sin(t * 9 + c * TAU) * 1.6,
  y: p.y - R * (0.35 + b * 0.65) * saida(t),
  giro: 0, vira: 1, escala: 1 - entrada(limitar((t - 0.55) / 0.45)),
})

/** Balistico com gravidade: gota sai em arco e CAI. */
const arco: Mover = (p, [a, b], t, R) => {
  const ang = -Math.PI / 2 + (a - 0.5) * 2.2
  const v = R * (0.9 + b * 0.8)
  return {
    x: p.x + Math.cos(ang) * v * t,
    y: p.y + Math.sin(ang) * v * t + R * 1.9 * t * t,
    giro: Math.atan2(Math.sin(ang) * v + R * 3.8 * t, Math.cos(ang) * v), // aponta pra onde esta indo
    vira: 1, escala: 1 - entrada(limitar((t - 0.8) / 0.2)),
  }
}

/** Arco curto e QUICA no chao, perdendo altura: pedra. */
const quicar: Mover = (p, [a, b, c], t, R) => {
  const dx = (a - 0.5) * 2 * R * 0.9
  const pulos = Math.abs(Math.sin(t * Math.PI * (1.6 + b)))
  const altura = R * 0.6 * (1 - t) * pulos
  return { x: p.x + dx * saida(t), y: p.y + 6 * t - altura, giro: c * TAU + t * 5 * (a - 0.5), vira: 1, escala: 1 }
}

/** Sobe um pouco, depois PLANA caindo em zigue-zague e girando no eixo: folha, pena. */
const planar: Mover = (p, [a, b, c], t, R) => {
  const lado = (a - 0.5) * 2
  const subida = R * (0.3 + b * 0.3) * saida(limitar(t * 2.2))
  const queda = R * 0.55 * t * t
  const balanco = Math.sin(t * Math.PI * 3 + c * TAU) * R * 0.22
  return {
    x: p.x + lado * R * 0.55 * saida(t) + balanco,
    y: p.y - subida + queda,
    giro: Math.sin(t * Math.PI * 3 + c * TAU) * 0.9,
    vira: Math.cos(t * Math.PI * 5 + c * TAU), // folha mostrando o verso
    escala: 1 - entrada(limitar((t - 0.8) / 0.2)),
  }
}

/** Saltos secos e nervosos: faisca muda de lugar aos trancos, nao desliza. */
const saltar: Mover = (p, [a, b, c], t, R) => {
  const passo = Math.floor(t * 9)
  const tremor = Math.sin(passo * 12.9898 + c * 78.233) * 3
  const d = R * (0.5 + b * 0.5) * saida(passo / 9)
  const ang = a * TAU + tremor * 0.15
  return { x: p.x + Math.cos(ang) * d, y: p.y + Math.sin(ang) * d * 0.8, giro: passo * 1.3 + c, vira: 1, escala: passo % 3 === 2 ? 0.6 : 1 }
}

/** Radial com arrasto forte: estilhaco que para no ar e some. */
const estourar: Mover = (p, [a, b, c], t, R) => {
  const d = R * (0.45 + b * 0.55) * saida(t)
  return { x: p.x + Math.cos(a * TAU) * d, y: p.y + Math.sin(a * TAU) * d * 0.8, giro: c * TAU + t * 3, vira: 1, escala: 1 - entrada(limitar((t - 0.6) / 0.4)) }
}

/** Orbita que abre em espiral: poder psiquico. */
const orbitar: Mover = (p, [a, b], t, R) => {
  const ang = a * TAU + t * (4 + b * 3)
  const r = R * (0.2 + 0.6 * saida(t))
  return { x: p.x + Math.cos(ang) * r, y: p.y + Math.sin(ang) * r * 0.55, giro: ang, vira: 1, escala: 0.6 + 0.4 * Math.sin(t * Math.PI) }
}

/** Escorre devagar pro lado e pra baixo, ALARGANDO: sombra. */
const escorrer: Mover = (p, [a, b, c], t, R) => ({
  x: p.x + (a - 0.5) * R * 1.1 * saida(t),
  y: p.y + (b - 0.3) * R * 0.5 * saida(t),
  giro: c * TAU, vira: 1, escala: 0.6 + 0.9 * saida(t),
})

/** Flutua parado piscando: brilho de fada, esporo. */
const pairar: Mover = (p, [a, b, c], t, R) => ({
  x: p.x + Math.cos(a * TAU) * R * 0.6 * saida(t) + Math.sin(t * 5 + c * TAU),
  y: p.y + Math.sin(a * TAU) * R * 0.45 * saida(t) - R * 0.15 * t,
  giro: t * 2, vira: 1, escala: Math.abs(Math.sin(t * Math.PI * (3 + b * 2) + c * TAU)),
})

// ---------------------------------------------------------------------------
// FORMAS — desenhadas centradas em (0,0), ja giradas; `tam` ~ 2..4 unidades
// ---------------------------------------------------------------------------

/** Contorno + preenchimento de um caminho: o par que todo desenho aqui repete. */
function pintar(ctx: CanvasRenderingContext2D, caminho: () => void, preench: string, contorno: string, borda = 0.9): void {
  caminho(); ctx.fillStyle = contorno; ctx.lineWidth = borda * 2; ctx.strokeStyle = contorno; ctx.stroke(); ctx.fill()
  caminho(); ctx.fillStyle = preench; ctx.fill()
}

const folha: Desenhar = (ctx, s, _t, pele) => {
  // Lanceolada com ponta: dois arcos que se encontram, nervura central e um
  // lado mais claro — a leitura "folha" vem do bico e da nervura, nao da cor.
  const L = s * 1.9, W = s * 0.9
  pintar(ctx, () => { ctx.beginPath(); ctx.moveTo(-L, 0); ctx.quadraticCurveTo(0, -W * 1.4, L, 0); ctx.quadraticCurveTo(0, W * 1.4, -L, 0) }, pele.base, pele.contorno)
  ctx.beginPath(); ctx.moveTo(-L * 0.9, 0); ctx.quadraticCurveTo(0, -W * 1.2, L * 0.95, 0); ctx.quadraticCurveTo(0, -W * 0.2, -L * 0.9, 0)
  ctx.fillStyle = pele.meio; ctx.fill()
  ctx.strokeStyle = pele.contorno; ctx.lineWidth = 0.6
  ctx.beginPath(); ctx.moveTo(-L * 1.25, W * 0.15); ctx.lineTo(L * 0.8, 0); ctx.stroke() // cabo + nervura
}

const gota: Desenhar = (ctx, s, _t, pele) => {
  // Aponta pra tras do movimento (a cauda fica pra onde ela veio) e tem o
  // ponto de brilho branco — sem ele, gota azul le como bolha.
  const r = s
  pintar(ctx, () => {
    ctx.beginPath(); ctx.moveTo(-r * 2.2, 0)
    ctx.quadraticCurveTo(-r * 0.2, -r * 1.25, r, 0)
    ctx.quadraticCurveTo(-r * 0.2, r * 1.25, -r * 2.2, 0)
  }, pele.meio, pele.contorno)
  ctx.fillStyle = pele.base; ctx.beginPath(); ctx.arc(r * 0.1, r * 0.35, r * 0.55, 0, TAU); ctx.fill()
  ctx.fillStyle = BRANCO; ctx.fillRect(r * 0.05, -r * 0.55, Math.max(0.8, r * 0.45), Math.max(0.8, r * 0.45))
}

const chama: Desenhar = (ctx, s, t, pele) => {
  // Lingua que aponta pra CIMA independente do giro do movimento, com nucleo
  // que apaga antes do resto: a chama esfria de dentro pra fora.
  const camada = (k: number, cor: string) => {
    const r = s * k
    ctx.beginPath(); ctx.moveTo(0, -r * 2.3)
    ctx.quadraticCurveTo(r * 1.3, -r * 0.2, 0, r)
    ctx.quadraticCurveTo(-r * 1.3, -r * 0.2, 0, -r * 2.3)
    ctx.fillStyle = cor; ctx.fill()
  }
  camada(1.3, pele.contorno); camada(1, pele.base); camada(0.68, pele.meio)
  if (t < 0.55) camada(0.36, pele.nucleo)
}

const faisca: Desenhar = (ctx, s, _t, pele) => {
  const L = s * 1.8
  const zig = () => { ctx.beginPath(); ctx.moveTo(-L, -L * 0.3); ctx.lineTo(-L * 0.2, L * 0.25); ctx.lineTo(L * 0.2, -L * 0.25); ctx.lineTo(L, L * 0.3) }
  ctx.lineJoin = 'miter'; ctx.lineCap = 'round'
  zig(); ctx.strokeStyle = pele.contorno; ctx.lineWidth = 2.2; ctx.stroke()
  zig(); ctx.strokeStyle = pele.meio; ctx.lineWidth = 1.3; ctx.stroke()
  zig(); ctx.strokeStyle = pele.nucleo; ctx.lineWidth = 0.6; ctx.stroke()
}

const cristal: Desenhar = (ctx, s, _t, pele) => {
  // Floco de 6 bracos com ramos: gelo e GEOMETRICO, e a simetria de 60° e o
  // que separa ele de faisca e de estrela.
  const L = s * 1.7
  const bracos = () => {
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU, cx = Math.cos(a), sy = Math.sin(a)
      ctx.moveTo(0, 0); ctx.lineTo(cx * L, sy * L)
      const m = L * 0.55, rb = L * 0.35
      ctx.moveTo(cx * m, sy * m); ctx.lineTo(cx * m + Math.cos(a + 0.8) * rb, sy * m + Math.sin(a + 0.8) * rb)
      ctx.moveTo(cx * m, sy * m); ctx.lineTo(cx * m + Math.cos(a - 0.8) * rb, sy * m + Math.sin(a - 0.8) * rb)
    }
  }
  ctx.lineCap = 'round'
  bracos(); ctx.strokeStyle = pele.contorno; ctx.lineWidth = 1.9; ctx.stroke()
  bracos(); ctx.strokeStyle = pele.meio; ctx.lineWidth = 0.9; ctx.stroke()
  ctx.fillStyle = pele.nucleo; ctx.fillRect(-0.8, -0.8, 1.6, 1.6)
}

const pedra: Desenhar = (ctx, s, _t, pele, sem) => {
  // Poligono irregular com uma face iluminada: o formato sai da semente, entao
  // cada pedra tem o SEU contorno do inicio ao fim do voo.
  const n = 6
  const raios = Array.from({ length: n }, (_, i) => s * (0.8 + ((sem[3] * 997 * (i + 1)) % 1) * 0.6))
  const poli = (k: number) => { ctx.beginPath(); for (let i = 0; i < n; i++) { const a = (i / n) * TAU; ctx.lineTo(Math.cos(a) * raios[i] * k, Math.sin(a) * raios[i] * k) } ctx.closePath() }
  pintar(ctx, () => poli(1), pele.base, pele.contorno)
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(-2.1) * raios[4], Math.sin(-2.1) * raios[4]); ctx.lineTo(Math.cos(-1) * raios[5], Math.sin(-1) * raios[5]); ctx.closePath()
  ctx.fillStyle = pele.nucleo; ctx.fill()
}

const poeira: Desenhar = (ctx, s, t, pele) => {
  // Tufo de 3 bolotas que INCHA e rareia: terra levantada, nao projetil.
  const k = 0.7 + t * 0.8
  const bolotas: ReadonlyArray<readonly [number, number, number]> = [[-s * 0.8, 0, s * 0.8], [s * 0.6, -s * 0.2, s * 0.9], [0, -s * 0.8, s * 0.7]]
  for (const [cor, g] of [[pele.contorno, 0.7], [pele.base, 0], [pele.meio, -0.5]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const [x, y, r] of bolotas) { const rr = r * k + g; if (rr > 0) { ctx.moveTo(x + rr, y - (g < 0 ? 0.4 : 0)); ctx.arc(x, y - (g < 0 ? 0.4 : 0), rr, 0, TAU) } }
    ctx.fill()
  }
}

const pena: Desenhar = (ctx, s, _t, pele) => {
  // Assimetrica (um lado mais largo) com haste que passa do corpo — a haste e
  // o que diferencia pena de folha quando as duas giram.
  const L = s * 2.1
  pintar(ctx, () => { ctx.beginPath(); ctx.moveTo(-L, 0); ctx.quadraticCurveTo(-L * 0.1, -s * 1.5, L, -s * 0.1); ctx.quadraticCurveTo(0, s * 0.8, -L, 0) }, pele.nucleo, pele.contorno)
  ctx.strokeStyle = pele.base; ctx.lineWidth = 0.7
  ctx.beginPath(); ctx.moveTo(-L * 1.35, s * 0.2); ctx.lineTo(L * 0.95, -s * 0.12); ctx.stroke()
}

const bolha: Desenhar = (ctx, s, t, pele) => {
  if (t > 0.85) {
    // Estoura: 4 respingos no lugar da bolha.
    ctx.fillStyle = pele.meio
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4, d = s * (1 + (t - 0.85) * 12); ctx.fillRect(Math.cos(a) * d - 0.6, Math.sin(a) * d - 0.6, 1.2, 1.2) }
    return
  }
  const r = s * (0.9 + t * 0.4)
  pintar(ctx, () => { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU) }, pele.base, pele.contorno)
  ctx.fillStyle = pele.meio; ctx.beginPath(); ctx.arc(r * 0.15, r * 0.2, r * 0.6, 0, TAU); ctx.fill()
  ctx.fillStyle = BRANCO; ctx.fillRect(-r * 0.55, -r * 0.6, Math.max(0.8, r * 0.4), Math.max(0.8, r * 0.4))
}

const psi: Desenhar = (ctx, s, t, pele) => {
  // Aneis concentricos que pulsam — onda mental, nao objeto.
  const r = s * (1 + 0.4 * Math.sin(t * 20))
  ctx.lineWidth = 1.6; ctx.strokeStyle = pele.contorno
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke()
  ctx.lineWidth = 0.9; ctx.strokeStyle = pele.meio
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke()
  ctx.fillStyle = pele.nucleo; ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, TAU); ctx.fill()
}

const sombra: Desenhar = (ctx, s, _t, pele) => {
  // Voluta em crescente, sem brilho: escuridao nao tem nucleo claro.
  const R = s * 1.6
  pintar(ctx, () => { ctx.beginPath(); ctx.arc(0, 0, R, 0.3, Math.PI * 1.4); ctx.arc(R * 0.35, -R * 0.2, R * 0.72, Math.PI * 1.4, 0.3, true) }, pele.base, pele.contorno)
}

const estrela: Desenhar = (ctx, s, _t, pele) => {
  // Brilho de 4 pontas finas — "sparkle" de fada, diferente da estrela gorda
  // de impacto de primitivas.ts.
  const L = s * 2, w = s * 0.35
  const cruz = (k: number) => { ctx.beginPath(); ctx.moveTo(0, -L * k); ctx.lineTo(w * k, 0); ctx.lineTo(0, L * k); ctx.lineTo(-w * k, 0); ctx.closePath(); ctx.moveTo(-L * k, 0); ctx.lineTo(0, w * k); ctx.lineTo(L * k, 0); ctx.lineTo(0, -w * k); ctx.closePath() }
  cruz(1.25); ctx.fillStyle = pele.contorno; ctx.fill()
  cruz(1); ctx.fillStyle = pele.meio; ctx.fill()
  cruz(0.5); ctx.fillStyle = pele.nucleo; ctx.fill()
}

const escama: Desenhar = (ctx, s, _t, pele) => {
  // Escama em gota larga com reflexo em diagonal: couraca de dragao.
  pintar(ctx, () => { ctx.beginPath(); ctx.moveTo(0, -s * 1.5); ctx.quadraticCurveTo(s * 1.4, 0, 0, s * 1.3); ctx.quadraticCurveTo(-s * 1.4, 0, 0, -s * 1.5) }, pele.base, pele.contorno)
  ctx.strokeStyle = pele.nucleo; ctx.lineWidth = 0.7
  ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.5); ctx.lineTo(s * 0.3, s * 0.3); ctx.stroke()
}

const metal: Desenhar = (ctx, s, _t, pele) => {
  // Porca sextavada com furo: aco e fabricado, tem aresta reta e buraco.
  const hex = (r: number) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) } ctx.closePath() }
  pintar(ctx, () => hex(s * 1.3), pele.meio, pele.contorno)
  ctx.strokeStyle = pele.nucleo; ctx.lineWidth = 0.7
  ctx.beginPath(); ctx.moveTo(Math.cos(-2.1) * s * 1.2, Math.sin(-2.1) * s * 1.2); ctx.lineTo(Math.cos(-1.05) * s * 1.2, Math.sin(-1.05) * s * 1.2); ctx.stroke()
  ctx.fillStyle = pele.contorno; ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, TAU); ctx.fill()
}

const esporo: Desenhar = (ctx, s, _t, pele) => {
  // Bolinha com espinhos curtos: po de inseto/cogumelo, nao gota.
  ctx.fillStyle = pele.contorno; ctx.beginPath(); ctx.arc(0, 0, s * 0.95, 0, TAU); ctx.fill()
  ctx.fillStyle = pele.base; ctx.beginPath(); ctx.arc(0, 0, s * 0.7, 0, TAU); ctx.fill()
  ctx.fillStyle = pele.meio
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; ctx.fillRect(Math.cos(a) * s * 1.3 - 0.5, Math.sin(a) * s * 1.3 - 0.5, 1, 1) }
}

const fantasma: Desenhar = (ctx, s, t, pele) => {
  // Fogo-fatuo com cauda ondulada e DOIS OLHOS. Os olhos sao a personalidade:
  // sem eles e uma chama roxa.
  const onda = Math.sin(t * 14) * s * 0.35
  pintar(ctx, () => {
    ctx.beginPath(); ctx.arc(0, 0, s * 1.1, Math.PI, 0)
    ctx.quadraticCurveTo(s * 1.1, s * 1.2, onda, s * 2.4)
    ctx.quadraticCurveTo(-s * 1.1, s * 1.2, -s * 1.1, 0)
  }, pele.meio, pele.contorno)
  ctx.fillStyle = ESCURO
  ctx.fillRect(-s * 0.55, -s * 0.3, Math.max(0.8, s * 0.3), Math.max(1, s * 0.5))
  ctx.fillRect(s * 0.25, -s * 0.3, Math.max(0.8, s * 0.3), Math.max(1, s * 0.5))
}

const impacto: Desenhar = (ctx, s, t) => {
  // Lasca de PANCADA (NORMAL): agulha branca fina que dispara pra fora e
  // encurta pela base — o "hit spark" de jogo de luta. Nao e nuvem: pancada e
  // seca e angulosa (dono, 28/09: "normal seria um hit, uma pancada").
  const L = s * 3.2 * (1 - t * 0.6), w = s * 0.45 * (1 - t)
  const agulha = (k: number) => { ctx.beginPath(); ctx.moveTo(L * k, 0); ctx.lineTo(0, -w * k); ctx.lineTo(-L * 0.25 * k, 0); ctx.lineTo(0, w * k); ctx.closePath() }
  agulha(1.35); ctx.fillStyle = ESCURO; ctx.fill()
  agulha(1); ctx.fillStyle = BRANCO; ctx.fill()
}

const golpe: Desenhar = (ctx, s, t, pele) => {
  // Traco grosso de "pancada" de manga (FIGHTING): cunha que dispara pra fora
  // e encurta. Forca bruta, sem particula fina.
  const L = s * 3 * (1 - t * 0.7), w = s * 0.7
  const cunha = (k: number) => { ctx.beginPath(); ctx.moveTo(L * k, 0); ctx.lineTo(0, -w * k); ctx.lineTo(-L * 0.4 * k, 0); ctx.lineTo(0, w * k); ctx.closePath() }
  cunha(1.3); ctx.fillStyle = pele.contorno; ctx.fill()
  cunha(1); ctx.fillStyle = pele.meio; ctx.fill()
  cunha(0.5); ctx.fillStyle = pele.nucleo; ctx.fill()
}

// ---------------------------------------------------------------------------

interface Comportamento { mover: Mover; desenhar: Desenhar; /** gira a forma pelo `giro` do movimento */ orientar: boolean }

export const PARTICULAS: Record<ParticulaDoTipo, Comportamento> = {
  chama:    { mover: subir,    desenhar: chama,    orientar: false },
  gota:     { mover: arco,     desenhar: gota,     orientar: true },
  faisca:   { mover: saltar,   desenhar: faisca,   orientar: true },
  folha:    { mover: planar,   desenhar: folha,    orientar: true },
  cristal:  { mover: estourar, desenhar: cristal,  orientar: true },
  poeira:   { mover: subir,    desenhar: poeira,   orientar: false },
  pena:     { mover: planar,   desenhar: pena,     orientar: true },
  pedra:    { mover: quicar,   desenhar: pedra,    orientar: true },
  bolha:    { mover: subir,    desenhar: bolha,    orientar: false },
  psi:      { mover: orbitar,  desenhar: psi,      orientar: false },
  sombra:   { mover: escorrer, desenhar: sombra,   orientar: true },
  estrela:  { mover: pairar,   desenhar: estrela,  orientar: false },
  escama:   { mover: estourar, desenhar: escama,   orientar: true },
  metal:    { mover: estourar, desenhar: metal,    orientar: true },
  esporo:   { mover: pairar,   desenhar: esporo,   orientar: false },
  fantasma: { mover: subir,    desenhar: fantasma, orientar: false },
  impacto:  { mover: estourar, desenhar: impacto,  orientar: false },
  golpe:    { mover: estourar, desenhar: golpe,    orientar: true },
}

/**
 * Emite `n` particulas-assinatura da pele a partir de `p`. `t` 0..1 na vida
 * delas; `tam` e o tamanho base em unidades de mundo. Consome 4 numeros do
 * `rng` por particula, sempre — mesmo as que ja sumiram — pra nao desalinhar
 * o que a coreografia sorteia depois.
 */
export function emitirParticulas(
  ctx: CanvasRenderingContext2D, pele: Pele, p: Ponto, n: number, alcance: number, t: number, tam: number, rng: () => number,
): void {
  const c = PARTICULAS[pele.particula]
  for (let i = 0; i < n; i++) {
    const s: Sementes = [rng(), rng(), rng(), rng()]
    // Nascimento escalonado: a leva nao sai toda no mesmo quadro.
    const atraso = s[3] * 0.25
    const tl = (t - atraso) / (1 - atraso)
    if (tl < 0 || tl > 1) continue
    const pose = c.mover(p, s, tl, alcance)
    if (pose.escala <= 0.05) continue
    ctx.save()
    ctx.translate(pose.x, pose.y)
    if (c.orientar) ctx.rotate(pose.giro)
    ctx.scale(pose.escala, pose.escala * pose.vira || 0.001)
    c.desenhar(ctx, tam * (0.8 + s[1] * 0.4), tl, pele, s)
    ctx.restore()
  }
}
