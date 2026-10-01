// ELETRICO — os 7 golpes, cada um pensado individualmente.
//
// PERSONALIDADE (o que separa do fogo sem olhar a cor):
//   - nada DESLIZA. Fogo sobe e escorre; eletricidade salta. Todo movimento e
//     em degraus: o raio e redesenhado com outra forma a cada `PISCA` ms, a
//     esfera do Shock Wave teleporta de vertice em vertice, a faisca pula.
//   - pisca. Raio aparece, some, volta (estrobo). Ritmo seco, sem fade.
//   - ramifica. Raio grande solta galhos; no chao vira arvore (Lichtenberg).
//   - e instantaneo. A viagem de um raio e 0 ms; o que tem duracao e a
//     antecipacao (carga) e o que sobra (o alvo crepitando).
//
// CONSTRUCAO: a do Thunderbolt do lab v2 (.claude/lab-vfx/index.html) — carga
// crepitando nas bochechas, raio que cai "de cima da tela" re-sorteado a cada
// 40 ms com 2 galhos, arco horizontal atacante -> alvo, alvo crepitando depois.
// TEXTURA: traco em 3 camadas (contorno, meio, nucleo) de `tracarRaio`, sem
// campo de ruido — raio e linha dura, nao massa.
//
//   T1 Thunder Shock   estalo curto: 3 piscadas de um arco fino ate o alvo.
//   T2 Shock Wave      esfera de plasma que salta pelos vertices de um zigue-zague.
//   T3 Thunderbolt     o do v2: raio do ceu + arco horizontal + crepitar.
//   T4 Thunder         o ceu fecha, 3 lideres convergem, clarao + coluna de luz, estouro.
//   A1 Charge          arvore de raio rasteira crescendo do centro pra fora.
//   A2 Discharge       quem lanca vira o no: raios do corpo pra pontos da area.
//   A3 Thunder Storm   o ceu fecha na area, raios em staccato avisados no chao, e a coluna final no centro.
//
// Sem estado entre quadros: cada forma de raio vem de um rng LOCAL semeado por
// (semente sorteada no inicio, degrau do tempo). Mesmo `ms`, mesmo raio.
import { rngSemeado } from '../aleatorio'
import { estrelaDeImpacto, limitar, pontosDeRaio, riscos, saida, tracarRaio } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'
import { comImpacto } from '../acabamento'

const TAU = Math.PI * 2

/** Cada quanto um raio troca de forma (ms). O "tremor" do v2. */
const PISCA = 40

// ---------------------------------------------------------------------------
// Pecas do tipo
// ---------------------------------------------------------------------------

const sortear = (rng: () => number, n: number) => Array.from({ length: n }, rng)
/** Mapeia 0..1 pra a..b. */
const em = (u: number, a: number, b: number) => a + u * (b - a)

/** Rng local do degrau `passo` de uma peca com semente `s` (0..1). */
const rngDoPasso = (s: number, passo: number) => rngSemeado(((s * 4294967296) >>> 0) ^ Math.imul(passo + 1, 0x9e3779b1))

/** Degrau do tempo desde `t0`: a forma do raio so muda quando ele muda. */
const passoDe = (ms: number, t0: number, pisca = PISCA) => Math.floor((ms - t0) / pisca)

/**
 * Raio de `a` a `b` com `galhos` ramos curtos, redesenhado a cada degrau.
 * Consome nada do rng do contexto: a forma vem de `semente` + degrau.
 */
function raio(
  ctx: CanvasRenderingContext2D, a: Ponto, b: Ponto, largura: number, desvio: number, prof: number,
  galhos: number, compGalho: number, semente: number, passo: number, pele: Pele,
): Ponto[] {
  const r = rngDoPasso(semente, passo)
  const pts = pontosDeRaio(a, b, desvio, prof, r)
  for (let i = 0; i < galhos; i++) {
    const p = pts[Math.floor(em(r(), 0.25, 0.8) * pts.length)]
    const ang = Math.atan2(b.y - a.y, b.x - a.x) + (r() < 0.5 ? -1 : 1) * em(r(), 0.5, 1.2)
    const fim = { x: p.x + Math.cos(ang) * compGalho, y: p.y + Math.sin(ang) * compGalho }
    tracarRaio(ctx, pontosDeRaio(p, fim, compGalho * 0.3, 2, r), largura * 0.45, pele)
  }
  tracarRaio(ctx, pts, largura, pele)
  return pts
}

/**
 * O crepitar: `n` arcos curtos pulando em volta de `p`, cada um com outra
 * forma e outro lugar a cada degrau, e um degrau em cada 3 apagado (o piscar
 * do v2). `alcance` e o raio do crepitar.
 */
function crepitar(
  ctx: CanvasRenderingContext2D, ms: number, p: Ponto, t0: number, t1: number, n: number,
  alcance: number, largura: number, semente: number, pele: Pele, pisca = 50,
): void {
  if (ms < t0 || ms >= t1) return
  const passo = passoDe(ms, t0, pisca)
  if (passo % 3 === 2) return
  const f = (ms - t0) / (t1 - t0)
  const r = rngDoPasso(semente, passo)
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d0 = alcance * 0.4, d1 = alcance
    const ini = { x: p.x + Math.cos(a) * d0, y: p.y + Math.sin(a) * d0 * 0.8 }
    const fim = { x: p.x + Math.cos(a + em(r(), 0.4, 1)) * d1, y: p.y + Math.sin(a + em(r(), 0.4, 1)) * d1 * 0.8 }
    tracarRaio(ctx, pontosDeRaio(ini, fim, alcance * 0.25, 2, r), largura * (1 - f * 0.5), pele)
  }
}

/**
 * Faiscas soltas: zigue-zagues pequenos que PULAM pra longe em degraus secos
 * (nunca deslizam) e somem aos trancos. A particula-assinatura do tipo.
 */
function faiscas(
  ctx: CanvasRenderingContext2D, ms: number, p: Ponto, t0: number, dur: number, n: number,
  alcance: number, tam: number, sem: readonly number[], pele: Pele,
): void {
  const t = (ms - t0) / dur
  if (t < 0 || t >= 1) return
  const degraus = 7
  const d = Math.floor(t * degraus)
  ctx.lineJoin = 'miter'; ctx.lineCap = 'round'
  for (let i = 0; i < n; i++) {
    const a = sem[i * 3] * TAU, v = em(sem[i * 3 + 1], 0.5, 1), fase = sem[i * 3 + 2]
    if ((d + Math.floor(fase * 3)) % 4 === 3) continue // some e volta
    const dist = alcance * v * saida(d / degraus)
    const x = p.x + Math.cos(a) * dist, y = p.y + Math.sin(a) * dist * 0.8 - d * 0.6
    const L = tam * (1 - d / degraus * 0.6), giro = a + d * 1.3 + fase * 6
    const cs = Math.cos(giro), sn = Math.sin(giro)
    const P = (u: number, w: number) => [x + cs * u * L - sn * w * L, y + sn * u * L + cs * w * L] as const
    const zig = () => {
      ctx.beginPath()
      ctx.moveTo(...P(-1, -0.3)); ctx.lineTo(...P(-0.2, 0.25)); ctx.lineTo(...P(0.2, -0.25)); ctx.lineTo(...P(1, 0.3))
    }
    zig(); ctx.strokeStyle = pele.contorno; ctx.lineWidth = 2.2; ctx.stroke()
    zig(); ctx.strokeStyle = pele.meio; ctx.lineWidth = 1.3; ctx.stroke()
    zig(); ctx.strokeStyle = pele.nucleo; ctx.lineWidth = 0.6; ctx.stroke()
  }
}

/** Esfera de plasma: nucleo claro, halo amarelo, contorno — e 4 espinhos que trocam a cada degrau. */
function esfera(ctx: CanvasRenderingContext2D, p: Ponto, r: number, semente: number, passo: number, pele: Pele): void {
  const rr = rngDoPasso(semente, passo)
  for (let i = 0; i < 4; i++) {
    const a = rr() * TAU, L = r * em(rr(), 1.8, 2.8)
    tracarRaio(ctx, pontosDeRaio(p, { x: p.x + Math.cos(a) * L, y: p.y + Math.sin(a) * L }, r * 0.5, 2, rr), 1.1, pele)
  }
  for (const [cor, k] of [[pele.contorno, 1.3], [pele.base, 1.05], [pele.meio, 0.8], [pele.nucleo, 0.45]] as const) {
    ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(p.x, p.y, r * k, 0, TAU); ctx.fill()
  }
}

/** Mancha de queimado no chao do v2 (sem anel): elipse escura que encolhe. */
function queimado(ctx: CanvasRenderingContext2D, ms: number, p: Ponto, t0: number, dur: number, rx: number, pele: Pele): void {
  const f = (ms - t0) / dur
  if (f < 0 || f >= 1) return
  const k = 1 - f * f
  ctx.fillStyle = pele.contorno
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 12, rx * k, rx * 0.34 * k, 0, 0, TAU); ctx.fill()
}

/** Bochechas: o ponto de carga um pouco a frente e acima de quem lanca. */
const bochecha = (c: ContextoVfx): Ponto => ({ x: c.origem.x + Math.cos(c.angulo) * 5, y: c.origem.y - 4 })

/** Fila propria de uma peca que aparece so em parte do golpe (ver aleatorio.ts). */
function fila(nums: readonly number[]): () => number {
  let i = 0
  return () => nums[i++ % nums.length]
}

// ---------------------------------------------------------------------------
// T1 — THUNDER SHOCK: tres piscadas de um arco fino
// ---------------------------------------------------------------------------

/** Janelas acesas do arco: aceso, apagado, aceso, apagado, aceso. Estrobo, sem fade. */
const SHOCK_ACESO = [[110, 160], [190, 230], [260, 320]] as const

function thunderShock(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = bochecha(c)
  const semArco = rng(), semCarga = rng(), semCrepita = rng()
  const semFaiscas = sortear(rng, 6 * 3)
  const semEstrela = sortear(rng, 9)

  crepitar(ctx, ms, b, 0, 120, 2, 7, 0.9, semCarga, pele, 40)
  const aceso = SHOCK_ACESO.findIndex(([a, z]) => ms >= a && ms < z)
  if (aceso >= 0) raio(ctx, b, alvo, 1.6, 6, 3, aceso === 2 ? 1 : 0, 6, semArco, aceso, pele)
  if (ms >= 110 && ms < 250) estrelaDeImpacto(ctx, alvo, 8, (ms - 110) / 140, pele, fila(semEstrela))
  crepitar(ctx, ms, alvo, 130, 520, 1, 10, 1, semCrepita, pele)
  faiscas(ctx, ms, alvo, 150, 450, 6, 14, 2.2, semFaiscas, pele)
}

// ---------------------------------------------------------------------------
// T2 — SHOCK WAVE: esfera que salta de vertice em vertice
// ---------------------------------------------------------------------------

const WAVE_SAI = 150
const WAVE_SALTOS = 5
const WAVE_SALTO = 45
const WAVE_CHEGA = WAVE_SAI + WAVE_SALTOS * WAVE_SALTO

function shockWave(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = bochecha(c)
  const semCaminho = sortear(rng, WAVE_SALTOS * 2)
  const semEsfera = rng(), semCarga = rng(), semEstouro = rng(), semCrepita = rng()
  const semFaiscas = sortear(rng, 10 * 3)
  const semEstrela = sortear(rng, 9)

  // Caminho: 5 vertices em zigue-zague largo entre a boca e o alvo. A esfera
  // NAO anda por ele — teleporta de um pro outro, e o trecho que ela acabou de
  // pular fica como rastro de raio por um degrau.
  const dx = alvo.x - b.x, dy = alvo.y - b.y, L = Math.hypot(dx, dy) || 1
  const nx = -dy / L, ny = dx / L
  const vertices: Ponto[] = [b]
  for (let i = 1; i < WAVE_SALTOS; i++) {
    const u = i / WAVE_SALTOS, lado = (i % 2 ? 1 : -1) * em(semCaminho[i * 2], 5, 9)
    vertices.push({ x: b.x + dx * u + nx * lado, y: b.y + dy * u + ny * lado - em(semCaminho[i * 2 + 1], 0, 4) })
  }
  vertices.push(alvo)

  if (ms < WAVE_SAI) {
    crepitar(ctx, ms, b, 0, WAVE_SAI, 2, 8, 1, semCarga, pele, 40)
    esfera(ctx, b, 1 + 2 * saida(ms / WAVE_SAI), semEsfera, passoDe(ms, 0), pele)
  } else if (ms < WAVE_CHEGA) {
    const i = Math.floor((ms - WAVE_SAI) / WAVE_SALTO) + 1
    const dentro = (ms - WAVE_SAI) % WAVE_SALTO
    if (dentro < 25) raio(ctx, vertices[i - 1], vertices[i], 1.3, 3, 2, 0, 0, semEsfera, i, pele)
    esfera(ctx, vertices[i], 3, semEsfera, i * 7 + passoDe(dentro, 0, 15), pele)
  }
  // Estouro: 6 galhos curtos saindo do alvo de uma vez, dois degraus e fim.
  const e = ms - WAVE_CHEGA
  if (e >= 0 && e < 90) {
    const r = rngDoPasso(semEstouro, passoDe(e, 0, 45))
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + r() * 0.6, d = em(r(), 12, 18)
      tracarRaio(ctx, pontosDeRaio(alvo, { x: alvo.x + Math.cos(a) * d, y: alvo.y + Math.sin(a) * d * 0.8 }, 4, 2, r), 1.4, pele)
    }
  }
  if (e >= 0 && e < 200) estrelaDeImpacto(ctx, alvo, 12, e / 200, pele, fila(semEstrela))
  crepitar(ctx, ms, alvo, WAVE_CHEGA + 60, WAVE_CHEGA + 560, 2, 12, 1.1, semCrepita, pele)
  faiscas(ctx, ms, alvo, WAVE_CHEGA, 520, 10, 20, 2.4, semFaiscas, pele)
}

// ---------------------------------------------------------------------------
// T3 — THUNDERBOLT (o do v2)
// ---------------------------------------------------------------------------

const BOLT_CAI = 260
const BOLT_DURA = 260

function thunderbolt(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = bochecha(c)
  const semCarga = rng(), semCeu = rng(), semArco = rng(), semCrepita = rng()
  const semTopo = rng()
  const semFaiscas = sortear(rng, 12 * 3)
  const semEstrela = sortear(rng, 9)

  // Carga: crepitar nas bochechas, piscando a cada 45 ms (v2).
  crepitar(ctx, ms, b, 0, 280, 2, 14, 1.1, semCarga, pele, 45)
  queimado(ctx, ms, { x: alvo.x, y: alvo.y + 4 }, BOLT_CAI + 30, 600, 10, pele)
  // Raio do ceu: na camera 3/4 ele cai "de cima da tela" no alvo.
  const e = ms - BOLT_CAI
  if (e >= 0 && e < BOLT_DURA) {
    const passo = passoDe(e, 0)
    const f = e / BOLT_DURA
    const w = 5.2 * (f < 0.7 ? 1 : 1 - (f - 0.7) / 0.3) * (passo % 2 ? 0.75 : 1)
    const topo = { x: alvo.x + em(rngDoPasso(semTopo, passo)(), -10, 10), y: alvo.y - 140 }
    raio(ctx, topo, alvo, w, 18, 6, 2, 14, semCeu, passo, pele)
    // Arco horizontal atacante -> alvo, piscando em degraus de 40 ms.
    if (e < 200 && passo % 2 === 0) raio(ctx, { x: b.x + 4, y: b.y }, { x: alvo.x - 4, y: alvo.y }, 2, 4, 4, 0, 0, semArco, passo, pele)
  }
  if (e >= 15 && e < 215) estrelaDeImpacto(ctx, alvo, 15, (e - 15) / 200, pele, fila(semEstrela))
  crepitar(ctx, ms, alvo, 300, 800, 2, 14, 1, semCrepita, pele)
  faiscas(ctx, ms, alvo, BOLT_CAI + 20, 600, 12, 22, 2.6, semFaiscas, pele)
}

// ---------------------------------------------------------------------------
// T4 — THUNDER: o ceu fecha, tres lideres convergem, a coluna cai
// ---------------------------------------------------------------------------
//
// O que faz ele IMPONENTE (e nao um Thunderbolt maior): o golpe muda a cena.
//   1. carga      junta energia numa esfera acima da cabeca e a DISPARA pro
//                 ceu — o trovao vem de la, nao do corpo.
//   2. ceu ronca  arcos piscando no alto e tres lideres finos descem aos trancos de tres pontos do ceu.
//   3. descarga   clarao que lava a cena, depois a COLUNA: pilar largo de luz
//                 com borda de raio, estrobando 3x, 6 galhos grossos.
//   4. estouro    12 raios radiais que explodem do alvo, raios rasteiros que
//                 correm pelo chao ate 60 unidades, estrela e riscos grandes.
//   5. rescaldo   o alvo crepitando forte e faiscas pulando ate o fim.

const TROVAO_DISPARO = 300
const TROVAO_LIDER = 380
const TROVAO_CAI = 620
/** As 3 descargas: acesa / apagada / acesa / apagada / acesa, cada vez mais fina. */
const TROVAO_DESCARGAS = [[0, 90, 1], [120, 180, 0.75], [215, 300, 0.55]] as const
const TROVAO_CEU = 175

/**
 * Clarao: disco CHAPADO que estoura e encolhe em 2 camadas (meio por fora,
 * nucleo por dentro). Sem gradiente nem alfa de proposito: no pixelizador,
 * alfa vira pontilhado, e o dono rejeitou o pontilhado (29/09).
 */
function clarao(ctx: CanvasRenderingContext2D, p: Ponto, r: number, forca: number, pele: Pele): void {
  const raio = r * 0.55 * forca
  if (raio < 1) return
  ctx.fillStyle = pele.meio; ctx.beginPath(); ctx.ellipse(p.x, p.y, raio, raio * 0.75, 0, 0, TAU); ctx.fill()
  ctx.fillStyle = pele.nucleo; ctx.beginPath(); ctx.ellipse(p.x, p.y, raio * 0.6, raio * 0.45, 0, 0, TAU); ctx.fill()
}

/**
 * Coluna de luz do ceu ate `base`: poligono largo cujas DUAS bordas sao raios
 * (re-sorteadas a cada degrau), em 4 camadas. Nao e um retangulo brilhante: e
 * um raio grosso demais pra ser linha.
 */
function coluna(ctx: CanvasRenderingContext2D, topo: Ponto, base: Ponto, largura: number, semente: number, passo: number, pele: Pele): void {
  const r = rngDoPasso(semente, passo)
  const esq = pontosDeRaio(topo, base, largura * 0.7, 4, r)
  const dir = pontosDeRaio(topo, base, largura * 0.7, 4, r)
  const n = esq.length
  // Afina no topo (vem de longe) e abre na base (onde bate).
  const meia = (k: number, i: number) => (largura * k * (0.35 + 0.65 * (i / (n - 1)))) / 2
  for (const [cor, k] of [[pele.contorno, 1.25], [pele.base, 1], [pele.meio, 0.7], [pele.nucleo, 0.36]] as const) {
    ctx.beginPath()
    for (let i = 0; i < n; i++) ctx.lineTo(esq[i].x - meia(k, i), esq[i].y)
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(dir[i].x + meia(k, i), dir[i].y)
    ctx.closePath(); ctx.fillStyle = cor; ctx.fill()
  }
}

function thunder(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = bochecha(c)
  const semCarga = rng(), semEsfera = rng(), semSubida = rng(), semCeu = rng()
  const semLideres = sortear(rng, 3)
  const semColuna = rng(), semGalhos = rng(), semEstouro = rng(), semChao = rng(), semCrepita = rng()
  const semSuga = sortear(rng, 14 * 3)
  const semFaiscas = sortear(rng, 26 * 3)
  const semEstrela = sortear(rng, 9)
  const semRiscos = sortear(rng, 16 * 3)
  const cabeca = { x: c.origem.x, y: c.origem.y - 16 }
  const topo = { x: alvo.x - 6, y: alvo.y - TROVAO_CEU }
  const e = ms - TROVAO_CAI

  queimado(ctx, ms, { x: alvo.x, y: alvo.y + 4 }, TROVAO_CAI, 800, 14, pele)

  // 1. Carga: faiscas SUGADAS pra esfera acima da cabeca, que incha e crepita.
  if (ms < TROVAO_DISPARO) {
    const passo = passoDe(ms, 0, 40)
    for (let i = 0; i < 14; i++) {
      const t = (ms - semSuga[i * 3 + 2] * 200) / 110
      if (t < 0 || t >= 1) continue
      // Salta pra dentro em 4 degraus secos (nunca desliza).
      const d = 26 * (1 - Math.floor(t * 4) / 4)
      const a = semSuga[i * 3] * TAU
      const p = { x: cabeca.x + Math.cos(a) * d, y: cabeca.y + Math.sin(a) * d * 0.8 }
      tracarRaio(ctx, pontosDeRaio(p, { x: p.x - Math.cos(a) * 6, y: p.y - Math.sin(a) * 5 }, 2, 2, rngDoPasso(semSuga[i * 3 + 1], passo)), 1, pele)
    }
    crepitar(ctx, ms, b, 0, TROVAO_DISPARO, 2, 12, 1.1, semCarga, pele, 40)
    esfera(ctx, cabeca, 1.5 + 4.5 * saida(ms / TROVAO_DISPARO), semEsfera, passo, pele)
  }
  // O disparo pro ceu: raio grosso da cabeca pra cima.
  if (ms >= TROVAO_DISPARO && ms < TROVAO_DISPARO + 90) {
    const f = (ms - TROVAO_DISPARO) / 90
    raio(ctx, cabeca, { x: cabeca.x + 6, y: cabeca.y - 170 }, 5 * (1 - f * 0.6), 12, 5, 2, 14, semSubida, passoDe(ms, TROVAO_DISPARO), pele)
    clarao(ctx, cabeca, 26, 0.6 * (1 - f), pele)
  }
  // O ceu roncando: arcos curtos piscando no alto, acima do alvo.
  crepitar(ctx, ms, { x: alvo.x, y: alvo.y - 140 }, TROVAO_DISPARO + 40, TROVAO_CAI, 3, 26, 1.3, semCeu, pele, 45)

  // Tres lideres finos descendo aos trancos de tres pontos do ceu, convergindo
  // no alvo. Forma fixa: e o caminho que se abre, degrau por degrau.
  if (ms >= TROVAO_LIDER && ms < TROVAO_CAI) {
    for (let i = 0; i < 3; i++) {
      const de = { x: alvo.x + (i - 1) * 34, y: alvo.y - TROVAO_CEU + Math.abs(i - 1) * 12 }
      const caminho = pontosDeRaio(de, alvo, 16, 5, rngDoPasso(semLideres[i], 0))
      const degrau = Math.min(6, Math.floor((ms - TROVAO_LIDER - i * 30) / 38) + 1)
      if (degrau > 0) tracarRaio(ctx, caminho.slice(0, Math.ceil((caminho.length * degrau) / 7)), 1.3, pele)
    }
  }

  // 3. Descarga: clarao e coluna estrobando.
  if (e >= 0 && e < 50) clarao(ctx, alvo, 110, 0.85 * (1 - e / 50), pele)
  const d = TROVAO_DESCARGAS.find(([a, z]) => e >= a && e < z)
  if (d) {
    const passo = passoDe(e, 0)
    coluna(ctx, topo, { x: alvo.x, y: alvo.y + 4 }, 20 * d[2], semColuna, passo, pele)
    const r = rngDoPasso(semGalhos, passo)
    for (let g = 0; g < 6; g++) {
      const y = topo.y + (alvo.y - topo.y) * em(r(), 0.1, 0.8)
      const lado = g % 2 ? 1 : -1
      const de = { x: alvo.x + lado * 5, y }
      tracarRaio(ctx, pontosDeRaio(de, { x: de.x + lado * em(r(), 18, 34), y: y + em(r(), -6, 18) }, 7, 3, r), 2.4 * d[2], pele)
    }
  }
  // 4. Estouro: 12 raios radiais que crescem do alvo em degraus.
  if (e >= 0 && e < 200) {
    const passo = passoDe(e, 0, 45)
    if (passo !== 2) {
      const r = rngDoPasso(semEstouro, passo)
      const alcance = 16 + 26 * saida(e / 200)
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU + r() * 0.4
        tracarRaio(ctx, pontosDeRaio(alvo, { x: alvo.x + Math.cos(a) * alcance, y: alvo.y + Math.sin(a) * alcance * 0.8 }, 5, 3, r), 2 * (1 - e / 260), pele)
      }
    }
  }
  // Raios rasteiros correndo pelo chao ate 60 unidades.
  if (e >= 40 && e < 460) {
    const passo = passoDe(e, 40, 50)
    if (passo % 3 !== 2) {
      const r = rngDoPasso(semChao, passo)
      const chao = { x: alvo.x, y: alvo.y + 12 }
      const alcance = 20 + 40 * saida((e - 40) / 420)
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + r() * 0.6
        tracarRaio(ctx, pontosDeRaio(chao, { x: chao.x + Math.cos(a) * alcance, y: chao.y + Math.sin(a) * alcance * 0.4 }, 7, 4, r), 1.7, pele)
      }
    }
  }
  if (e >= 0 && e < 320) estrelaDeImpacto(ctx, alvo, 30, e / 320, pele, fila(semEstrela))
  if (e >= 0 && e < 450) riscos(ctx, alvo, 16, 50, e / 450, pele.nucleo, fila(semRiscos))
  // 5. Rescaldo.
  crepitar(ctx, ms, alvo, TROVAO_CAI + 200, TROVAO_CAI + 1000, 3, 18, 1.3, semCrepita, pele)
  faiscas(ctx, ms, alvo, TROVAO_CAI + 30, 900, 26, 40, 3.2, semFaiscas, pele)
}


// ---------------------------------------------------------------------------
// AREA — escala k: o raio real e 175
// ---------------------------------------------------------------------------

const escalaDaArea = (r: number) => Math.max(1, r / 70)
/** Ponto no chao da area: elipse achatada da camera 3/4. */
const noChao = (centro: Ponto, a: number, d: number): Ponto => ({ x: centro.x + Math.cos(a) * d, y: centro.y + 12 + Math.sin(a) * d * 0.45 })

/**
 * CERCA DE RAIO: a borda real da area (elipse do chao, raio R) desenhada por
 * `n` trechos de raio ligando pontos da borda. E o que mostra o ALCANCE do
 * golpe de area (pedido do dono, 29/09). Fecha em volta do centro nos
 * primeiros 25% da janela, pisca em degraus e cada trecho troca de forma.
 */
function cercaDeRaio(
  ctx: CanvasRenderingContext2D, ms: number, centro: Ponto, R: number, t0: number, t1: number,
  n: number, semente: number, pele: Pele, largura: number,
): void {
  if (ms < t0 || ms >= t1) return
  const f = (ms - t0) / (t1 - t0)
  const passo = passoDe(ms, t0, 45)
  if (f > 0.25 && passo % 4 === 3) return
  const fecha = saida(limitar(f / 0.25))
  const w = largura * (f < 0.8 ? 1 : 1 - (f - 0.8) / 0.2)
  const r = rngDoPasso(semente, passo)
  const giro = rngDoPasso(semente, -1)() * TAU
  for (let i = 0; i < n; i++) {
    const a0 = giro + (i / n) * TAU, a1 = giro + ((i + 1) / n) * TAU
    // Fecha dos dois lados a partir da frente (baixo), como corrente se alastrando.
    const meio = (i + 0.5) / n
    if (Math.min(meio, 1 - meio) * 2 > fecha) { r(); continue }
    const d = R * (0.97 + r() * 0.06)
    tracarRaio(ctx, pontosDeRaio(noChao(centro, a0, d), noChao(centro, a1, d), R * 0.05, 3, r), w, pele)
  }
}

// A1 — CHARGE: arvore de raio rasteira (figura de Lichtenberg) crescendo pra fora
const CHARGE_TRONCOS = 7
const CHARGE_CRESCE = 280

function charge(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const semTroncos = sortear(rng, CHARGE_TRONCOS * 2)
  const semForma = rng(), semCarga = rng()
  const semFaiscas = sortear(rng, 10 * 3)
  const semCerca = rng()
  crepitar(ctx, ms, centro, 0, 160, 3, 12 * escalaDaArea(R), 1.2, semCarga, pele, 40)
  // A cerca acende quando as pontas dos troncos chegam na borda.
  cercaDeRaio(ctx, ms, centro, R, 60 + CHARGE_CRESCE * 0.7, 700, 14, semCerca, pele, 1.8)
  if (ms < 60 || ms >= 620) return
  // Cada tronco e um caminho fixo (a arvore nao muda de forma, so cresce e
  // pisca); os galhos nascem quando a ponta passa por eles.
  const cresce = saida(limitar((ms - 60) / CHARGE_CRESCE))
  const passo = passoDe(ms, 60, 45)
  if (ms > 60 + CHARGE_CRESCE && passo % 3 === 2) return
  const largura = 1.8 * (ms < 460 ? 1 : 1 - (ms - 460) / 160)
  for (let i = 0; i < CHARGE_TRONCOS; i++) {
    const a = (i / CHARGE_TRONCOS) * TAU + semTroncos[i * 2] * 0.7
    const fim = noChao(centro, a, R * em(semTroncos[i * 2 + 1], 0.95, 1))
    const r = rngDoPasso(semForma, i)
    const pts = pontosDeRaio({ x: centro.x, y: centro.y + 12 }, fim, R * 0.12, 5, r)
    const n = Math.max(2, Math.ceil(pts.length * cresce))
    tracarRaio(ctx, pts.slice(0, n), largura, pele)
    for (let g = 0; g < 2; g++) {
      const j = Math.floor(em(r(), 0.3, 0.75) * pts.length)
      if (j >= n) continue
      const ag = a + (g ? 1 : -1) * em(r(), 0.5, 1)
      const comp = R * 0.22 * cresce
      tracarRaio(ctx, pontosDeRaio(pts[j], { x: pts[j].x + Math.cos(ag) * comp, y: pts[j].y + Math.sin(ag) * comp * 0.45 }, comp * 0.3, 3, r), largura * 0.6, pele)
    }
  }
  faiscas(ctx, ms, { x: centro.x, y: centro.y + 12 }, 120, 480, 10, R * 0.8, 3, semFaiscas, pele)
}

// A2 — DISCHARGE: quem lanca vira o no; raios do corpo pra pontos da area
const DISCHARGE_PULSOS = 6
const DISCHARGE_PULSO = 90
const DISCHARGE_INICIO = 120
export const DISCHARGE_IMPACTOS = [DISCHARGE_INICIO + 20, DISCHARGE_INICIO + 3 * DISCHARGE_PULSO + 20] as const

function discharge(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = escalaDaArea(R)
  const semPulsos = sortear(rng, DISCHARGE_PULSOS)
  const semCorpo = rng()
  const semFaiscas = Array.from({ length: DISCHARGE_PULSOS }, () => sortear(rng, 5 * 3))
  const semEstrela = sortear(rng, 9)
  const semCerca = rng()
  cercaDeRaio(ctx, ms, centro, R, DISCHARGE_INICIO, DISCHARGE_INICIO + DISCHARGE_PULSOS * DISCHARGE_PULSO + 200, 16, semCerca, pele, 2)
  // Carga: o corpo acende e crepita forte antes de soltar.
  crepitar(ctx, ms, centro, 0, DISCHARGE_INICIO + DISCHARGE_PULSOS * DISCHARGE_PULSO, 3, 10 * k, 1.3, semCorpo, pele, 40)
  if (ms < DISCHARGE_INICIO) {
    const s = saida(ms / DISCHARGE_INICIO)
    for (const [cor, m] of [[pele.contorno, 1.3], [pele.meio, 1], [pele.nucleo, 0.5]] as const) {
      ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(centro.x, centro.y, (2 + 5 * s) * m, 0, TAU); ctx.fill()
    }
  }
  // Pulsos: a cada 90 ms o corpo solta 5 raios pra 5 pontos sorteados da area.
  // O raio vive 2 degraus (aceso / trocado de forma) e o ponto atingido solta faisca.
  for (let p = 0; p < DISCHARGE_PULSOS; p++) {
    const t0 = DISCHARGE_INICIO + p * DISCHARGE_PULSO
    const e = ms - t0
    const r = rngDoPasso(semPulsos[p], 0)
    // Raios distribuidos em volta (5 setores, girando a cada pulso) e batendo
    // perto da borda: juntos desenham o circulo do alcance.
    const pontos = Array.from({ length: 5 }, (_, i) => noChao(centro, ((i + p * 0.5 + r() * 0.5) / 5) * TAU, R * em(r(), 0.85, 1)))
    if (e >= 0 && e < 70) {
      const w = (p % 2 ? 2 : 2.8) * k * 0.7
      for (let i = 0; i < pontos.length; i++) raio(ctx, centro, pontos[i], w, R * 0.1, 5, i === 0 ? 1 : 0, 14 * k, semPulsos[p] + i * 0.1, passoDe(e, 0, 35), pele)
    }
    for (let i = 0; i < 2; i++) faiscas(ctx, ms, pontos[i], t0 + 20, 380, 5, 10 * k, 2.4, semFaiscas[p], pele)
  }
  const e = ms - DISCHARGE_INICIO
  if (e >= 0 && e < 200) estrelaDeImpacto(ctx, centro, 12 * k * 0.8, e / 200, pele, fila(semEstrela))
}

// A3 — THUNDER STORM: raios do ceu em staccato, cada um avisado no chao
const TEMPESTADE_RAIOS = 9
/** Quando cada raio cai — os `impactos` do tier. Ritmo irregular de proposito: tempestade nao tem metronomo. */
export const TEMPESTADE_QUEDAS = [240, 330, 380, 500, 560, 610, 740, 800, 900] as const
const AVISO = 110
/** O golpe final no centro, depois da ultima queda. */
const TEMPESTADE_FINAL = 1060

function thunderStorm(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = escalaDaArea(R)
  const semPontos = sortear(rng, TEMPESTADE_RAIOS * 2)
  const semRaios = sortear(rng, TEMPESTADE_RAIOS)
  const semFaiscas = Array.from({ length: TEMPESTADE_RAIOS }, () => sortear(rng, 6 * 3))
  const semCarga = rng()
  const semEstrelas = sortear(rng, TEMPESTADE_RAIOS * 9)
  const semFinal = rng(), semEstouro = rng()
  const semEstrelaFinal = sortear(rng, 9)
  const semRiscos = sortear(rng, 16 * 3)
  const ef = ms - TEMPESTADE_FINAL
  const semCerca = rng()
  cercaDeRaio(ctx, ms, centro, R, 150, 1150, 16, semCerca, pele, 2.2)
  // Quem lanca aponta pro ceu: arco que sobe do corpo durante a tempestade.
  if (ms < 900 && passoDe(ms, 0, 60) % 2 === 0) raio(ctx, centro, { x: centro.x, y: centro.y - 50 * k }, 1.8, 8, 4, 1, 10, semCarga, passoDe(ms, 0, 60), pele)
  for (let i = 0; i < TEMPESTADE_RAIOS; i++) {
    // Oito quedas em volta, em setores iguais, perto da borda: o circulo
    // aparece pelas quedas. A primeira cai no centro.
    const a = ((i + semPontos[i * 2] * 0.6) / (TEMPESTADE_RAIOS - 1)) * TAU, d = i === 0 ? 0 : R * em(semPontos[i * 2 + 1], 0.7, 0.92)
    const chao = noChao(centro, a, d)
    const peito = { x: chao.x, y: chao.y - 12 }
    const cai = TEMPESTADE_QUEDAS[i]
    // Aviso: o chao crepita onde vai cair (o ar ionizando).
    crepitar(ctx, ms, peito, cai - AVISO, cai, 2, 8 * k * 0.6, 1, semRaios[i], pele, 30)
    const e = ms - cai
    queimado(ctx, ms, peito, cai, 380, 5 * k, pele)
    if (e >= 0 && e < 40) clarao(ctx, peito, 22 * k * 0.6, 0.45 * (1 - e / 40), pele)
    if (e >= 0 && e < 120 && passoDe(e, 0) !== 1) {
      raio(ctx, { x: chao.x + em(semPontos[i * 2 + 1], -12, 12), y: chao.y - 150 * k }, peito, 4.2 * (1 - e / 200), 16 * k, 5, 2, 12 * k, semRaios[i], passoDe(e, 0), pele)
    }
    if (e >= 0 && e < 160) estrelaDeImpacto(ctx, peito, 10 * k * 0.7, e / 160, pele, fila(semEstrelas.slice(i * 9, i * 9 + 9)))
    faiscas(ctx, ms, peito, cai + 20, 420, 6, 14 * k * 0.7, 2.6, semFaiscas[i], pele)
  }
  // Final: a coluna do Thunder cai em quem lancou — o olho da tempestade —
  // com clarao sobre a area toda e o estouro radial correndo pelo chao.
  if (ef >= 0 && ef < 60) clarao(ctx, centro, R * 0.9, 0.8 * (1 - ef / 60), pele)
  const d = TROVAO_DESCARGAS.find(([a, z]) => ef >= a && ef < z)
  if (d) coluna(ctx, { x: centro.x - 8, y: centro.y - 170 * k }, { x: centro.x, y: centro.y + 6 }, 26 * d[2] * Math.min(k, 1.6), semFinal, passoDe(ef, 0), pele)
  if (ef >= 30 && ef < 500) {
    const passo = passoDe(ef, 30, 50)
    if (passo % 3 !== 2) {
      const r = rngDoPasso(semEstouro, passo)
      const chao = { x: centro.x, y: centro.y + 12 }
      const alcance = R * (0.2 + 0.7 * saida((ef - 30) / 470))
      for (let j = 0; j < 10; j++) {
        const a = (j / 10) * TAU + r() * 0.5
        tracarRaio(ctx, pontosDeRaio(chao, noChao(centro, a, alcance), alcance * 0.12, 5, r), 2, pele)
      }
    }
  }
  if (ef >= 0 && ef < 320) estrelaDeImpacto(ctx, centro, 26, ef / 320, pele, fila(semEstrelaFinal))
  if (ef >= 0 && ef < 450) riscos(ctx, centro, 16, 60, ef / 450, pele.nucleo, fila(semRiscos))
}

// ---------------------------------------------------------------------------

/**
 * Nome do golpe-vitrine de cada tier. `charge` e `thunder_storm` nao sao golpes
 * de dano do catalogo: sao os tiers de area 1 e 3, que so aparecem por critico
 * (Discharge critico) ou golpe futuro — mas tem que existir como todo tipo.
 */
export const VITRINE_DO_ELETRICO = {
  single: { 1: 'thunder_shock', 2: 'shock_wave', 3: 'thunderbolt', 4: 'thunder' },
  area: { 1: 'charge', 2: 'discharge', 3: 'thunder_storm' },
} as const

export const ELETRICO_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: thunderShock, duracao: { 1: 700 }, alcance: 26, impactos: { 1: [SHOCK_ACESO[0][0]] } },
  2: { desenhar: shockWave, duracao: { 2: 1000 }, alcance: 34, impactos: { 2: [WAVE_CHEGA] } },
  // O raio do ceu nasce 140 acima do alvo: alcance cobre a queda inteira.
  3: { desenhar: thunderbolt, duracao: { 3: 1100 }, alcance: 150, impactos: { 3: [BOLT_CAI + 15] } },
  4: { desenhar: thunder, duracao: { 4: 1800 }, alcance: 200, impactos: { 4: [TROVAO_CAI] } },
}, false)

export const ELETRICO_AREA: Record<1 | 2 | 3, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: charge, duracao: { 1: 800 }, alcance: 30, impactos: { 1: [120] } },
  2: { desenhar: discharge, duracao: { 2: 1000 }, alcance: 60, impactos: { 2: DISCHARGE_IMPACTOS } },
  3: { desenhar: thunderStorm, duracao: { 3: 1800 }, alcance: 200, impactos: { 3: [...TEMPESTADE_QUEDAS, TEMPESTADE_FINAL] } },
}, true)
