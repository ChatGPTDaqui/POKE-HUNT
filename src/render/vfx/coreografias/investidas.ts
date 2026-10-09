// Família Investida (09/10): dezoito golpes em que o CORPO é a arma.
//
// O VFX não move o sprite de quem ataca (só desenho), então a forma da
// família é a PROA: a onda de choque em "(" que vai na frente do corpo, com
// riscos de velocidade atrás, e o choque que ela faz ao bater. Cada golpe tem
// o seu caminho (reto, zigue-zague, de cima, em laço, ida e volta, de vários
// lados) e a sua marca (recuo em quem bate, poeira de galope, corações,
// rabisco de raiva...). Mesmo padrão dos socos e das mordidas: perfil por
// golpe, uma coreografia, nada de estado entre quadros.
import { getAbility } from '@/data/abilities'
import { NEUTROS, PELES } from '../paletas'
import { crescente, entrada, estilhacos, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { em } from './comum'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto, Tier } from '../tipos'

const [ESCURO, BRANCO] = NEUTROS

/** Por onde a proa vai até o alvo. */
type Caminho = 'reto' | 'zigue' | 'varios' | 'cima' | 'laco' | 'volta'
/** O que distingue o golpe além do caminho. */
type Marca =
  | 'nenhuma' | 'recuo' | 'recuoDuplo' | 'giga' | 'galope' | 'estrelas' | 'raiva' | 'lascas'
  | 'pow' | 'coracao' | 'rabisco' | 'muralha' | 'faisca' | 'baque'

interface Perfil {
  caminho: Caminho
  marca: Marca
  /** Preparação parado (agacha, junta força) antes de sair. */
  preparo: number
  /** Viagem até o alvo. */
  viagem: number
  tamanho: number
  /** Cor de contraste fora da pele do tipo (entra na paleta do pixelizador). */
  acento?: string
}

export const PERFIS_DE_INVESTIDA: Record<string, Perfil> = {
  tackle: { caminho: 'reto', marca: 'nenhuma', preparo: 60, viagem: 110, tamanho: .9 },
  quick_attack: { caminho: 'zigue', marca: 'nenhuma', preparo: 20, viagem: 70, tamanho: .85 },
  extreme_speed: { caminho: 'varios', marca: 'nenhuma', preparo: 30, viagem: 60, tamanho: .95 },
  take_down: { caminho: 'reto', marca: 'recuo', preparo: 110, viagem: 120, tamanho: 1.05 },
  double_edge: { caminho: 'reto', marca: 'recuoDuplo', preparo: 140, viagem: 120, tamanho: 1.2 },
  body_slam: { caminho: 'cima', marca: 'baque', preparo: 90, viagem: 150, tamanho: 1.15 },
  giga_impact: { caminho: 'reto', marca: 'giga', preparo: 200, viagem: 130, tamanho: 1.35, acento: '#ff9a3a' },
  high_horsepower: { caminho: 'reto', marca: 'galope', preparo: 90, viagem: 150, tamanho: 1.15 },
  last_resort: { caminho: 'reto', marca: 'estrelas', preparo: 200, viagem: 120, tamanho: 1.2, acento: '#ffd23a' },
  retaliate: { caminho: 'reto', marca: 'raiva', preparo: 80, viagem: 110, tamanho: 1, acento: '#e0303a' },
  chip_away: { caminho: 'reto', marca: 'lascas', preparo: 60, viagem: 110, tamanho: .95 },
  facade: { caminho: 'reto', marca: 'pow', preparo: 90, viagem: 110, tamanho: 1, acento: '#ffd23a' },
  return: { caminho: 'reto', marca: 'coracao', preparo: 80, viagem: 120, tamanho: 1, acento: '#ff6f9e' },
  frustration: { caminho: 'reto', marca: 'rabisco', preparo: 80, viagem: 110, tamanho: 1 },
  strength: { caminho: 'reto', marca: 'muralha', preparo: 130, viagem: 150, tamanho: 1.15 },
  heavy_slam: { caminho: 'cima', marca: 'faisca', preparo: 110, viagem: 140, tamanho: 1.25 },
  u_turn: { caminho: 'volta', marca: 'nenhuma', preparo: 40, viagem: 100, tamanho: .95 },
  acrobatics: { caminho: 'laco', marca: 'nenhuma', preparo: 40, viagem: 170, tamanho: .95 },
}

/** Vida do choque depois do contato. */
const CHOQUE = 280
/** Volta do U-turn. */
const RETORNO = 160
/** Extreme Speed: atraso entre os três cortes. */
const PASSO_DOS_CORTES = 55

const contatoDe = (p: Perfil) => p.preparo + p.viagem
function duracaoDe(p: Perfil): number {
  let fim = contatoDe(p) + CHOQUE
  if (p.caminho === 'volta') fim += RETORNO - 60
  if (p.caminho === 'varios') fim += 2 * PASSO_DOS_CORTES
  if (p.marca === 'rabisco' || p.marca === 'coracao' || p.marca === 'raiva') fim += 80
  return fim
}

// ---------------------------------------------------------------------------
// Formas
// ---------------------------------------------------------------------------

function poligono(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], cor: string): void {
  ctx.fillStyle = cor; ctx.beginPath()
  pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
  ctx.closePath(); ctx.fill()
}

/**
 * A proa: onda de choque em "(" com a ponta pra +X. `largura` abre as asas
 * (Strength empurra uma parede, Tackle é uma cunha).
 */
export function proa(ctx: CanvasRenderingContext2D, p: Ponto, angulo: number, escala: number, largura: number, pele: Pele, aura?: string): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angulo); ctx.scale(escala, escala * largura)
  const forma = (k: number) => {
    ctx.beginPath(); ctx.moveTo(-9 - k, -13 - k)
    ctx.quadraticCurveTo(8 + k * 1.4, -9, 9 + k * 1.2, 0)
    ctx.quadraticCurveTo(8 + k * 1.4, 9, -9 - k, 13 + k)
    ctx.quadraticCurveTo(1 - k * .5, 0, -9 - k, -13 - k); ctx.closePath()
  }
  if (aura) { forma(4.2); ctx.fillStyle = aura; ctx.fill() }
  forma(1.6); ctx.fillStyle = pele.contorno; ctx.fill()
  forma(0); ctx.fillStyle = pele.base; ctx.fill()
  ctx.save(); ctx.translate(3, 0); ctx.scale(.7, .72); forma(0); ctx.fillStyle = pele.meio; ctx.fill(); ctx.restore()
  // Fio branco na frente: é a borda que bate.
  ctx.beginPath(); ctx.moveTo(1, -7); ctx.quadraticCurveTo(8, -4, 8.4, 0); ctx.quadraticCurveTo(8, 4, 1, 7)
  ctx.strokeStyle = BRANCO; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke()
  ctx.restore()
}

/** Riscos de velocidade paralelos atrás da proa, do ponto `de` até `ate`. */
function rastro(ctx: CanvasRenderingContext2D, de: Ponto, ate: Ponto, n: number, abertura: number, pele: Pele, rng: () => number, encolhe = 1): void {
  const dx = ate.x - de.x, dy = ate.y - de.y, L = Math.hypot(dx, dy)
  if (L < 2) return
  const ux = dx / L, uy = dy / L
  ctx.lineCap = 'round'
  for (let i = 0; i < n; i++) {
    const lado = (rng() * 2 - 1) * abertura, ini = rng() * .5, comp = (.35 + rng() * .5) * encolhe
    const a = { x: de.x + dx * ini - uy * lado, y: de.y + dy * ini + ux * lado }
    const b = { x: a.x + ux * L * comp * (1 - ini), y: a.y + uy * L * comp * (1 - ini) }
    ctx.strokeStyle = pele.contorno; ctx.lineWidth = 2.6
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    ctx.strokeStyle = i % 2 ? BRANCO : pele.meio; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
  }
}

/** Nuvem de poeira no chão: bolas que se espalham, sobem um pouco e encolhem. */
function poeira(ctx: CanvasRenderingContext2D, p: Ponto, t: number, n: number, espalha: number, pele: Pele, rng: () => number): void {
  const bolas: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, d = espalha * (.4 + rng() * .6), r0 = 2.4 + rng() * 2.2
    const r = r0 * (1 - entrada(limitar((t - .35) / .65))) * (.6 + saida(limitar(t * 3)) * .4)
    if (r <= .4) continue
    bolas.push({ x: p.x + Math.cos(a) * d * saida(t), y: p.y + Math.sin(a) * d * .35 * saida(t) - 5 * t, r })
  }
  for (const [g, cor] of [[1.3, pele.contorno], [0, pele.base], [-1, pele.meio]] as const) {
    ctx.fillStyle = cor
    for (const b of bolas) {
      if (b.r + g <= .3) continue
      ctx.beginPath(); ctx.arc(b.x - (g < 0 ? .6 : 0), b.y - (g < 0 ? .6 : 0), b.r + g, 0, Math.PI * 2); ctx.fill()
    }
  }
}

/** Arcos do choque abrindo do outro lado do alvo, na direção da pancada. */
export function ondaDeChoque(ctx: CanvasRenderingContext2D, alvo: Ponto, angulo: number, t: number, raio: number, n: number, pele: Pele): void {
  for (let i = 0; i < n; i++) {
    const u = limitar((t - i * .12) / .8)
    if (u <= 0 || u >= 1) continue
    crescente(ctx, alvo, raio * (.55 + saida(u) * .6) + i * 4, angulo - .85, angulo + .85, 3.2 - i * .6, u, 0, pele, 1)
  }
}

function coracao(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, cor: string): void {
  // Coração de 7x6 na grade, escalado: lê como pixel art até em tamanho 2.
  const px = [[1,0],[2,0],[4,0],[5,0],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[1,3],[2,3],[3,3],[4,3],[5,3],[2,4],[3,4],[4,4],[3,5]]
  ctx.fillStyle = ESCURO
  for (const [i, j] of px) ctx.fillRect(x + (i - 3.5) * s - s * .35, y + (j - 3) * s - s * .35, s * 1.7, s * 1.7)
  ctx.fillStyle = cor
  for (const [i, j] of px) ctx.fillRect(x + (i - 3.5) * s, y + (j - 3) * s, s, s)
  ctx.fillStyle = BRANCO; ctx.fillRect(x - 2.5 * s, y - 2 * s, s, s)
}

/** Veia de raiva de anime (as quatro "vírgulas" em cruz). */
function veiaDeRaiva(ctx: CanvasRenderingContext2D, p: Ponto, s: number, cor: string): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(s, s)
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2)
    poligono(ctx, [[1.2, -1.2], [5.6, -3.6], [6.6, -1.4], [3, -.2]], ESCURO)
    poligono(ctx, [[1.8, -1.4], [5.2, -3], [5.8, -1.6], [3, -.8]], cor)
  }
  ctx.restore()
}

/** Rabisco de frustração: novelo de linha embolada. */
function rabisco(ctx: CanvasRenderingContext2D, p: Ponto, t: number, semente: number): void {
  const k = saida(limitar(t / .25)) * (1 - entrada(limitar((t - .65) / .35)))
  if (k <= .05) return
  const rng = rngSemeado(semente)
  const pts: Ponto[] = []
  for (let i = 0; i < 14; i++) pts.push({ x: p.x + (rng() - .5) * 24 * k, y: p.y - 4 + (rng() - .5) * 14 * k })
  const linha = (cor: string, w: number) => {
    ctx.strokeStyle = cor; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath()
    pts.forEach((q, i) => i ? ctx.quadraticCurveTo((q.x + pts[i - 1].x) / 2 + 3, (q.y + pts[i - 1].y) / 2 - 3, q.x, q.y) : ctx.moveTo(q.x, q.y))
    ctx.stroke()
  }
  linha(BRANCO, 4.4); linha(ESCURO, 2.2)
}

/** Estouro de quadrinho (POW): estrela larga de 12 pontas com borda grossa. */
function estouroPow(ctx: CanvasRenderingContext2D, p: Ponto, t: number, raio: number, cor: string, pele: Pele): void {
  const r = raio * saida(limitar(t / .18)) * (1 - entrada(limitar((t - .5) / .5)))
  if (r <= 1) return
  const estrela = (R: number) => {
    ctx.beginPath()
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, rr = i % 2 ? R * .62 : R * (i % 4 ? 1 : .86)
      ctx.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * .8)
    }
    ctx.closePath()
  }
  estrela(r + 2); ctx.fillStyle = ESCURO; ctx.fill()
  estrela(r); ctx.fillStyle = cor; ctx.fill()
  estrela(r * .55); ctx.fillStyle = BRANCO; ctx.fill()
  estrela(r * .3); ctx.fillStyle = pele.meio; ctx.fill()
}

/** Brilho de 4 pontas (estrelas do Last Resort, fagulhas). */
function brilho(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, cor: string): void {
  if (r <= .5) return
  poligono(ctx, [[x, y - r - 1.2], [x + r * .35 + .8, y - r * .35 - .8], [x + r + 1.2, y], [x + r * .35 + .8, y + r * .35 + .8], [x, y + r + 1.2], [x - r * .35 - .8, y + r * .35 + .8], [x - r - 1.2, y], [x - r * .35 - .8, y - r * .35 - .8]], ESCURO)
  poligono(ctx, [[x, y - r], [x + r * .3, y - r * .3], [x + r, y], [x + r * .3, y + r * .3], [x, y + r], [x - r * .3, y + r * .3], [x - r, y], [x - r * .3, y - r * .3]], cor)
  ctx.fillStyle = BRANCO; ctx.fillRect(x - .8, y - .8, 1.6, 1.6)
}

// ---------------------------------------------------------------------------
// Caminho da proa
// ---------------------------------------------------------------------------

interface Pose { p: Ponto; angulo: number }

/** Onde a proa está em `u` (0..1 da viagem). Termina com a frente encostando no alvo. */
function poseNoCaminho(perfil: Perfil, u: number, origem: Ponto, chegada: Ponto, angulo: number): Pose {
  const dx = chegada.x - origem.x, dy = chegada.y - origem.y
  const nx = -Math.sin(angulo), ny = Math.cos(angulo)
  const reta = (v: number): Ponto => ({ x: origem.x + dx * v, y: origem.y + dy * v })
  switch (perfil.caminho) {
    case 'zigue': {
      // Dois cotovelos: some de um lado e aparece do outro.
      const v = saida(u), desvio = Math.sin(v * Math.PI * 2) * 9 * (1 - v)
      const q = reta(v)
      return { p: { x: q.x + nx * desvio, y: q.y + ny * desvio }, angulo }
    }
    case 'laco': {
      // Pirueta: dá uma volta inteira no meio do caminho e segue.
      const v = saida(u), giro = limitar((u - .2) / .5)
      const q = reta(v), raio = 10 * Math.sin(giro * Math.PI)
      const a = giro * Math.PI * 2
      return { p: { x: q.x + Math.sin(a) * raio * Math.cos(angulo) - (1 - Math.cos(a)) * raio * nx, y: q.y + Math.sin(a) * raio * Math.sin(angulo) - (1 - Math.cos(a)) * raio * ny }, angulo: angulo + a }
    }
    default: return { p: reta(saida(u)), angulo }
  }
}

// ---------------------------------------------------------------------------
// Coreografia
// ---------------------------------------------------------------------------

function coreografia(perfil: Perfil, c: ContextoVfx): void {
  const { ctx, ms, tier, origem, alvo } = c
  if (ms < 0 || ms >= c.duracao) return
  const pele = c.pele
  const cor = perfil.acento ?? pele.meio
  const semente = Math.floor(c.rng() * 0xffffffff)
  const dx = alvo.x - origem.x, dy = alvo.y - origem.y, L = Math.hypot(dx, dy)
  const angulo = L > .01 ? Math.atan2(dy, dx) : c.angulo
  const ux = Math.cos(angulo), uy = Math.sin(angulo)
  const escala = .62 * perfil.tamanho * (1 + (tier - 1) * .07)
  const contato = contatoDe(perfil)
  const largura = perfil.marca === 'muralha' ? 1.5 : 1
  const chegada = { x: alvo.x - ux * 9 * escala, y: alvo.y - uy * 9 * escala }
  const saidaDe = { x: origem.x + ux * 6, y: origem.y + uy * 6 }
  const pe = (p: Ponto): Ponto => ({ x: p.x, y: p.y + 11 })

  // --- preparo: junta força no lugar ---
  if (ms < perfil.preparo) {
    const t = ms / perfil.preparo
    const rng = rngSemeado(semente + 1)
    if (perfil.marca === 'estrelas') {
      // Last Resort: cinco brilhos de cores diferentes se juntam em quem ataca.
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + t * 2, d = 26 * (1 - saida(t))
        brilho(ctx, origem.x + Math.cos(a) * d, origem.y - 2 + Math.sin(a) * d * .7, 3.8, i % 2 ? cor : BRANCO)
      }
    } else if (perfil.marca === 'giga') {
      // Giga Impact: aura que pulsa e cresce em volta de quem ataca.
      const r = 14 + saida(t) * 6 + (Math.floor(ms / 66) % 2) * 1.5
      crescente(ctx, origem, r, -Math.PI, Math.PI, 2.6, .5, 0, { ...pele, meio: cor }, 1)
      riscos(ctx, origem, c.pedir(4), 18, 1 - t, cor, rng)
    } else if (perfil.caminho === 'cima') {
      // Body Slam / Heavy Slam: sombra do corpo aparece em cima do alvo.
      const r = 6 + 9 * saida(t)
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(alvo.x, alvo.y + 11, r, r * .35, 0, 0, Math.PI * 2); ctx.fill()
    } else if (perfil.preparo >= 80) {
      // Pé raspando o chão: poeirinha atrás de quem vai sair.
      poeira(ctx, pe({ x: origem.x - ux * 6, y: origem.y }), t, Math.min(c.pedir(3), 3), 6, pele, rng)
    }
  }

  // --- viagem ---
  if (perfil.caminho === 'cima') {
    const u = (ms - perfil.preparo) / perfil.viagem
    if (u >= 0 && u < 1) {
      const r = 15 * (.7 + entrada(u) * .3)
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(alvo.x, alvo.y + 11, r, r * .35, 0, 0, Math.PI * 2); ctx.fill()
      const y = em(entrada(u), alvo.y - 46, alvo.y - 10)
      const rng = rngSemeado(semente + 2)
      rastro(ctx, { x: alvo.x, y: y - 24 }, { x: alvo.x, y }, c.pedir(3 + tier), 10, pele, rng, .7)
      proa(ctx, { x: alvo.x, y }, Math.PI / 2, escala * 1.1, 1.3, pele, perfil.marca === 'faisca' ? cor : undefined)
    }
  } else if (perfil.caminho === 'varios') {
    // Extreme Speed: três cortes de lados diferentes, o primeiro é o que conta.
    for (let i = 0; i < 3; i++) {
      const ini = perfil.preparo + i * PASSO_DOS_CORTES, u = (ms - ini) / perfil.viagem
      if (u < 0 || u >= 1.6) continue
      const a = angulo + [0, 2.3, -2.1][i]
      const de = { x: alvo.x - Math.cos(a) * 48, y: alvo.y - Math.sin(a) * 30 }
      const ate = { x: alvo.x - Math.cos(a) * 8 * escala, y: alvo.y - Math.sin(a) * 6 * escala }
      const v = saida(limitar(u)), q = { x: de.x + (ate.x - de.x) * v, y: de.y + (ate.y - de.y) * v }
      const encolhe = 1 - limitar(u - 1) / .6
      rastro(ctx, de, q, c.pedir(3), 5, pele, rngSemeado(semente + 10 + i), encolhe)
      if (u < 1) proa(ctx, q, Math.atan2(ate.y - de.y, ate.x - de.x), escala * .9, 1, pele)
    }
  } else {
    const u = (ms - perfil.preparo) / perfil.viagem
    if (u >= 0 && u < 1.35) {
      const pose = poseNoCaminho(perfil, limitar(u), saidaDe, chegada, angulo)
      const rng = rngSemeado(semente + 3)
      const encolhe = 1 - limitar((u - 1) / .35)
      rastro(ctx, saidaDe, pose.p, c.pedir(3 + tier), 6 * largura, pele, rng, encolhe)
      if (perfil.marca === 'galope') {
        // High Horsepower: cascos levantam poeira em batidas ao longo do caminho.
        for (let k = 0; k < 4; k++) {
          const v = (k + .5) / 4, t = (limitar(u) - v) / .5
          if (t > 0 && t < 1) poeira(ctx, pe({ x: saidaDe.x + (chegada.x - saidaDe.x) * saida(v), y: saidaDe.y + (chegada.y - saidaDe.y) * saida(v) }), t, Math.min(c.pedir(3), 3), 6, pele, rngSemeado(semente + 20 + k))
        }
      }
      if (perfil.marca === 'coracao' && u < 1) {
        for (let k = 0; k < 2; k++) coracao(ctx, pose.p.x - ux * (10 + k * 12), pose.p.y - uy * (10 + k * 12) - 6 + k * 3, .9, cor)
      }
      if (perfil.marca === 'estrelas' && u < 1) {
        for (let k = 0; k < 3; k++) brilho(ctx, pose.p.x - ux * (8 + k * 9) + (k - 1) * 3, pose.p.y - uy * (8 + k * 9) + (k - 1) * 4, 3, k % 2 ? cor : BRANCO)
      }
      if (u < 1) {
        if (perfil.marca === 'recuoDuplo') proa(ctx, pose.p, pose.angulo, escala * 1.05, 1.25, { ...pele, base: pele.contorno }, undefined)
        proa(ctx, pose.p, pose.angulo, escala, largura, pele, perfil.marca === 'giga' ? cor : undefined)
      }
    }
  }

  // --- volta (U-turn): bate e volta pra trás em curva ---
  if (perfil.caminho === 'volta') {
    const u = (ms - contato - 60) / RETORNO
    if (u >= 0 && u < 1) {
      const v = saida(u), curva = Math.sin(v * Math.PI) * 16
      const nx = -uy, ny = ux
      const q = { x: chegada.x + (saidaDe.x - chegada.x) * v + nx * curva, y: chegada.y + (saidaDe.y - chegada.y) * v + ny * curva }
      rastro(ctx, chegada, q, c.pedir(3), 5, pele, rngSemeado(semente + 4))
      proa(ctx, q, angulo + Math.PI + (1 - v) * 1.2, escala * .85, 1, pele)
    }
  }

  // --- choque ---
  const extras = perfil.caminho === 'varios' ? 3 : 1
  for (let i = 0; i < extras; i++) {
    const t = (ms - contato - i * PASSO_DOS_CORTES) / CHOQUE
    if (t < 0 || t >= 1) continue
    const rng = rngSemeado(semente + 50 + i)
    const de = perfil.caminho === 'varios' ? angulo + [0, 2.3, -2.1][i] : perfil.caminho === 'cima' ? Math.PI / 2 : angulo
    const forte = perfil.marca === 'giga' || perfil.marca === 'recuoDuplo' || perfil.marca === 'muralha' || perfil.caminho === 'cima'
    if (perfil.marca === 'pow') estouroPow(ctx, alvo, t, 15 + tier * 2, cor, pele)
    else estrelaDeImpacto(ctx, alvo, (forte ? 14 : 10) + tier * 1.5 - i * 3, t, pele, rng)
    if (perfil.caminho === 'cima') {
      // Baque: o chão espirra pros dois lados, rente.
      poeira(ctx, pe(alvo), t, c.pedir(5 + tier), 20 + tier * 2, pele, rng)
      if (perfil.marca === 'faisca') {
        for (let k = 0; k < Math.min(c.pedir(4 + tier), 7); k++) {
          const a = -Math.PI / 2 + (rng() - .5) * 2.6, d = (14 + rng() * 14) * saida(t)
          brilho(ctx, alvo.x + Math.cos(a) * d, alvo.y + 6 + Math.sin(a) * d * .7 + 14 * t * t, 2.4 * (1 - t), k % 2 ? cor : BRANCO)
        }
      }
    } else {
      ondaDeChoque(ctx, alvo, de, t, 13 + tier * 2, forte ? 2 : 1, pele)
      riscos(ctx, alvo, c.pedir(2 + tier), 20 + tier * 4, t, pele.meio, rng)
    }
    switch (perfil.marca) {
      case 'giga':
        ondaDeChoque(ctx, alvo, de, limitar(t * 1.2), 20 + tier * 2, 2, { ...pele, meio: cor })
        estilhacos(ctx, alvo, c.pedir(3 + tier), 24 + tier * 3, t, pele, rng)
        break
      case 'galope': case 'muralha':
        poeira(ctx, pe(alvo), t, c.pedir(3 + tier), 14 + tier * 2, pele, rng)
        break
      case 'lascas':
        // Chip Away: três lasquinhas em pontos diferentes, uma depois da outra.
        for (let k = 0; k < 3; k++) {
          const tk = (t - k * .14) / .5
          if (tk <= 0 || tk >= 1) continue
          const p = { x: alvo.x + [-6, 5, -1][k], y: alvo.y + [-5, 0, 6][k] }
          estilhacos(ctx, p, Math.min(c.pedir(2), 2), 12, tk, pele, rngSemeado(semente + 70 + k))
          brilho(ctx, p.x, p.y, 3.2 * (1 - tk), BRANCO)
        }
        break
      case 'recuo': case 'recuoDuplo': {
        // Quem bate também sente: estalo menor do lado de quem atacou.
        const tr = (t - .1) / .7
        if (tr > 0 && tr < 1) estrelaDeImpacto(ctx, { x: chegada.x - ux * 12, y: chegada.y - uy * 12 - 4 }, perfil.marca === 'recuoDuplo' ? 9 : 6, tr, pele, rngSemeado(semente + 80))
        break
      }
    }
  }

  // --- marcas que ficam depois do choque ---
  const depois = (ms - contato) / (CHOQUE + 80)
  if (depois >= 0 && depois < 1) {
    if (perfil.marca === 'raiva') {
      const s = saida(limitar(depois / .2)) * (1 - entrada(limitar((depois - .7) / .3)))
      const pulsa = Math.floor(ms / 100) % 2 ? 1.1 : 1
      if (s > .05) veiaDeRaiva(ctx, { x: alvo.x + 8, y: alvo.y - 14 }, s * pulsa * 1.7, cor)
    }
    if (perfil.marca === 'rabisco') rabisco(ctx, { x: alvo.x, y: alvo.y - 12 }, depois, semente + 90 + Math.floor(ms / 100))
    if (perfil.marca === 'coracao') {
      for (let k = 0; k < 3; k++) {
        const t = (depois - k * .12) / .7
        if (t <= 0 || t >= 1) continue
        coracao(ctx, alvo.x + (k - 1) * 9, alvo.y - 8 - 16 * saida(t), .9 * (1 - entrada(limitar((t - .6) / .4))), cor)
      }
    }
  }
}

const TIERS: readonly Tier[] = [1, 2, 3, 4]
export const INVESTIDAS_POR_GOLPE: Record<string, EntradaDeCoreografia> = Object.fromEntries(
  Object.entries(PERFIS_DE_INVESTIDA).map(([id, perfil]) => [id, {
    desenhar: (c: ContextoVfx) => coreografia(perfil, c),
    duracao: Object.fromEntries(TIERS.map(t => [t, duracaoDe(perfil)])),
    impactos: Object.fromEntries(TIERS.map(t => [t, [contatoDe(perfil)]])),
    alcance: 62,
    // Body/Heavy Slam caem de cima: precisam de mais folga só pra cima.
    ...(perfil.caminho === 'cima' ? { margem: { cima: 80, baixo: 62, lados: 62 } } : {}),
    // Acento do golpe (vermelho da raiva, rosa do coração...) precisa estar na
    // paleta do pixelizador, senão vira a cor mais próxima da pele do tipo.
    ...(perfil.acento ? { pele: peleDaInvestida(id) } : {}),
  }]),
)

/** Pele do tipo do golpe com o acento do perfil (o pixelizador só emite cores da pele). */
function peleDaInvestida(id: string): Pele {
  const base = PELES[getAbility(id)?.type ?? 'NORMAL'], acento = PERFIS_DE_INVESTIDA[id].acento!
  return { ...base, acento: [...(base.acento ?? []), acento] }
}
