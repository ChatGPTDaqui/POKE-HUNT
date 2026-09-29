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
//   T4 Thunder         lider em degraus desce, descarga grossa estroba 3x, raios rasteiros.
//   A1 Charge          arvore de raio rasteira crescendo do centro pra fora.
//   A2 Discharge       quem lanca vira o no: raios do corpo pra pontos da area.
//   A3 Thunder Storm   tempestade: raios do ceu em staccato, cada um avisado no chao.
//
// Sem estado entre quadros: cada forma de raio vem de um rng LOCAL semeado por
// (semente sorteada no inicio, degrau do tempo). Mesmo `ms`, mesmo raio.
import { rngSemeado } from '../aleatorio'
import { estrelaDeImpacto, limitar, pontosDeRaio, riscos, saida, tracarRaio } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'

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
// T4 — THUNDER: lider em degraus, descarga que estroba, raios rasteiros
// ---------------------------------------------------------------------------

const TROVAO_LIDER = 120
const TROVAO_CAI = 400
/** As 3 descargas: acesa / apagada / acesa / apagada / acesa, cada vez mais fina. */
const TROVAO_DESCARGAS = [[0, 70, 8], [100, 150, 6], [180, 250, 4.5]] as const

function thunder(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = bochecha(c)
  const semCarga = rng(), semLider = rng(), semDescarga = rng(), semChao = rng(), semCrepita = rng()
  const semFaiscas = sortear(rng, 18 * 3)
  const semEstrela = sortear(rng, 9)
  const semRiscos = sortear(rng, 30)
  const topo = { x: alvo.x - 8, y: alvo.y - 170 }

  // Antecipacao: quem lanca carrega com arcos subindo do corpo pro ceu.
  if (ms < TROVAO_CAI) {
    crepitar(ctx, ms, b, 0, TROVAO_CAI, 3, 16, 1.2, semCarga, pele, 40)
    if (ms > 60 && passoDe(ms, 60, 60) % 2 === 0) raio(ctx, b, { x: b.x + 4, y: b.y - 60 }, 1.6, 6, 4, 0, 0, semCarga, passoDe(ms, 60, 60), pele)
  }
  // Lider escalonado: um raio FINO que desce do ceu aos trancos, em 5 degraus,
  // e para no ar logo acima do alvo. A forma fica fixa (o caminho ja aberto).
  if (ms >= TROVAO_LIDER && ms < TROVAO_CAI) {
    const caminho = pontosDeRaio(topo, alvo, 20, 5, rngDoPasso(semLider, 0))
    const degrau = Math.min(5, Math.floor((ms - TROVAO_LIDER) / 50) + 1)
    tracarRaio(ctx, caminho.slice(0, Math.ceil((caminho.length * degrau) / 6)), 1.2, pele)
  }
  const e = ms - TROVAO_CAI
  queimado(ctx, ms, { x: alvo.x, y: alvo.y + 4 }, TROVAO_CAI, 700, 13, pele)
  // Descarga de retorno: grossa, 4 galhos, pelo MESMO caminho do lider.
  const d = TROVAO_DESCARGAS.find(([a, z]) => e >= a && e < z)
  if (d) {
    raio(ctx, topo, alvo, d[2], 20, 5, 4, 22, semDescarga, passoDe(e, 0), pele)
  }
  // Raios rasteiros: a descarga se espalha no chao em 5 galhos que CORREM pra
  // fora, cada degrau mais longe.
  if (e >= 60 && e < 360) {
    const passo = passoDe(e, 60, 50)
    if (passo % 3 !== 2) {
      const r = rngDoPasso(semChao, passo)
      const chao = { x: alvo.x, y: alvo.y + 12 }
      const alcance = 18 + 30 * saida((e - 60) / 300)
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + r() * 0.8
        tracarRaio(ctx, pontosDeRaio(chao, { x: chao.x + Math.cos(a) * alcance, y: chao.y + Math.sin(a) * alcance * 0.4 }, 6, 3, r), 1.5, pele)
      }
    }
  }
  if (e >= 0 && e < 280) estrelaDeImpacto(ctx, alvo, 22, e / 280, pele, fila(semEstrela))
  if (e >= 0 && e < 400) riscos(ctx, alvo, 10, 34, e / 400, pele.nucleo, fila(semRiscos))
  crepitar(ctx, ms, alvo, TROVAO_CAI + 250, TROVAO_CAI + 900, 3, 16, 1.2, semCrepita, pele)
  faiscas(ctx, ms, alvo, TROVAO_CAI + 40, 800, 18, 30, 3, semFaiscas, pele)
}

// ---------------------------------------------------------------------------
// AREA — escala k: o raio real e 175
// ---------------------------------------------------------------------------

const escalaDaArea = (r: number) => Math.max(1, r / 70)
/** Ponto no chao da area: elipse achatada da camera 3/4. */
const noChao = (centro: Ponto, a: number, d: number): Ponto => ({ x: centro.x + Math.cos(a) * d, y: centro.y + 12 + Math.sin(a) * d * 0.45 })

// A1 — CHARGE: arvore de raio rasteira (figura de Lichtenberg) crescendo pra fora
const CHARGE_TRONCOS = 7
const CHARGE_CRESCE = 280

function charge(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const semTroncos = sortear(rng, CHARGE_TRONCOS * 2)
  const semForma = rng(), semCarga = rng()
  const semFaiscas = sortear(rng, 10 * 3)
  crepitar(ctx, ms, centro, 0, 160, 3, 12 * escalaDaArea(R), 1.2, semCarga, pele, 40)
  if (ms < 60 || ms >= 620) return
  // Cada tronco e um caminho fixo (a arvore nao muda de forma, so cresce e
  // pisca); os galhos nascem quando a ponta passa por eles.
  const cresce = saida(limitar((ms - 60) / CHARGE_CRESCE))
  const passo = passoDe(ms, 60, 45)
  if (ms > 60 + CHARGE_CRESCE && passo % 3 === 2) return
  const largura = 1.8 * (ms < 460 ? 1 : 1 - (ms - 460) / 160)
  for (let i = 0; i < CHARGE_TRONCOS; i++) {
    const a = (i / CHARGE_TRONCOS) * TAU + semTroncos[i * 2] * 0.7
    const fim = noChao(centro, a, R * em(semTroncos[i * 2 + 1], 0.75, 0.98))
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
    const pontos = Array.from({ length: 5 }, () => noChao(centro, r() * TAU, R * em(Math.sqrt(r()), 0.35, 0.95)))
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

function thunderStorm(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = escalaDaArea(R)
  const semPontos = sortear(rng, TEMPESTADE_RAIOS * 2)
  const semRaios = sortear(rng, TEMPESTADE_RAIOS)
  const semFaiscas = Array.from({ length: TEMPESTADE_RAIOS }, () => sortear(rng, 6 * 3))
  const semCarga = rng()
  const semEstrelas = sortear(rng, TEMPESTADE_RAIOS * 9)
  // Quem lanca aponta pro ceu: arco que sobe do corpo durante a tempestade.
  if (ms < 900 && passoDe(ms, 0, 60) % 2 === 0) raio(ctx, centro, { x: centro.x, y: centro.y - 50 * k }, 1.8, 8, 4, 1, 10, semCarga, passoDe(ms, 0, 60), pele)
  for (let i = 0; i < TEMPESTADE_RAIOS; i++) {
    const a = semPontos[i * 2] * TAU, d = i === 0 ? 0 : R * (0.25 + 0.7 * Math.sqrt(semPontos[i * 2 + 1]))
    const chao = noChao(centro, a, d)
    const peito = { x: chao.x, y: chao.y - 12 }
    const cai = TEMPESTADE_QUEDAS[i]
    // Aviso: o chao crepita onde vai cair (o ar ionizando).
    crepitar(ctx, ms, peito, cai - AVISO, cai, 2, 8 * k * 0.6, 1, semRaios[i], pele, 30)
    const e = ms - cai
    queimado(ctx, ms, peito, cai, 380, 5 * k, pele)
    if (e >= 0 && e < 120 && passoDe(e, 0) !== 1) {
      raio(ctx, { x: chao.x + em(semPontos[i * 2 + 1], -12, 12), y: chao.y - 150 * k }, peito, 4.2 * (1 - e / 200), 16 * k, 5, 2, 12 * k, semRaios[i], passoDe(e, 0), pele)
    }
    if (e >= 0 && e < 160) estrelaDeImpacto(ctx, peito, 10 * k * 0.7, e / 160, pele, fila(semEstrelas.slice(i * 9, i * 9 + 9)))
    faiscas(ctx, ms, peito, cai + 20, 420, 6, 14 * k * 0.7, 2.6, semFaiscas[i], pele)
  }
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

export const ELETRICO_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = {
  1: { desenhar: thunderShock, duracao: { 1: 700 }, alcance: 26, impactos: { 1: [SHOCK_ACESO[0][0]] } },
  2: { desenhar: shockWave, duracao: { 2: 1000 }, alcance: 34, impactos: { 2: [WAVE_CHEGA] } },
  // O raio do ceu nasce 140 acima do alvo: alcance cobre a queda inteira.
  3: { desenhar: thunderbolt, duracao: { 3: 1100 }, alcance: 150, impactos: { 3: [BOLT_CAI + 15] } },
  4: { desenhar: thunder, duracao: { 4: 1400 }, alcance: 180, impactos: { 4: [TROVAO_CAI] } },
}

export const ELETRICO_AREA: Record<1 | 2 | 3, EntradaDeCoreografia> = {
  1: { desenhar: charge, duracao: { 1: 800 }, alcance: 30, impactos: { 1: [120] } },
  2: { desenhar: discharge, duracao: { 2: 1000 }, alcance: 60, impactos: { 2: DISCHARGE_IMPACTOS } },
  3: { desenhar: thunderStorm, duracao: { 3: 1400 }, alcance: 200, impactos: { 3: TEMPESTADE_QUEDAS } },
}
