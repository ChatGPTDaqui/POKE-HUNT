// Família Rolamento / giro (09/10): seis golpes, cada um desenhado a partir da
// sua descrição (texto do jogo no comentário). A roda gira de verdade (ângulo
// proporcional à distância percorrida), mas o que ela FAZ muda por golpe.
import { getAbility } from '@/data/abilities'
import { emitirParticulas } from '../particulas'
import { PELES } from '../paletas'
import { entrada, estilhacos, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, brilho, comAcento, entrePontos, janela, montarFamilia, nuvem, poligono } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { preparo: number; viagem: number; raio: number; extra?: number }

export const PERFIS_DE_ROLAMENTO: Record<string, Perfil> = {
  rollout: { preparo: 50, viagem: 140, raio: 7, extra: 200 },
  ice_ball: { preparo: 50, viagem: 170, raio: 7 },
  rapid_spin: { preparo: 160, viagem: 100, raio: 8 },
  gyro_ball: { preparo: 120, viagem: 140, raio: 7 },
  steamroller: { preparo: 80, viagem: 170, raio: 9, extra: 120 },
  flame_wheel: { preparo: 100, viagem: 150, raio: 10 },
}

const CHOQUE = 270
const contatoDe = (p: Perfil) => p.preparo + p.viagem
const duracaoDe = (p: Perfil) => contatoDe(p) + CHOQUE + (p.extra ?? 0) + 20

function disco(ctx: CanvasRenderingContext2D, p: Ponto, r: number, giro: number, pele: Pele, raios = 4, base = pele.base, meio = pele.meio): void {
  if (r <= .5) return
  const circ = (R: number, cor: string) => { ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.fill() }
  circ(r + 1.4, ESCURO); circ(r, base); circ(r * .72, meio)
  ctx.strokeStyle = pele.contorno; ctx.lineWidth = 1.4
  for (let k = 0; k < raios; k++) {
    const a = giro + k * Math.PI * 2 / raios
    ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * r * .25, p.y + Math.sin(a) * r * .25); ctx.lineTo(p.x + Math.cos(a) * r * .95, p.y + Math.sin(a) * r * .95); ctx.stroke()
  }
  ctx.fillStyle = BRANCO; ctx.fillRect(p.x - r * .55, p.y - r * .6, Math.max(1.2, r * .32), Math.max(1.2, r * .32))
}

interface Cena { c: ContextoVfx; pele: Pele; semente: number; ux: number; giroDe: (d: number, r: number) => number; de: Ponto; ate: Ponto; contato: number }

function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy) || 1
  const ux = dx / L, uy = dy / L
  return {
    c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), ux, contato: contatoDe(p),
    giroDe: (d, r) => d / r * (ux < 0 ? -1 : 1),
    de: { x: c.origem.x + ux * 4, y: c.origem.y + 4 }, ate: { x: c.alvo.x - ux * (p.raio + 2), y: c.alvo.y + 4 - uy * (p.raio + 2) },
  }
}

/** Posição rolando de `de` a `ate` com quiques que diminuem; `d` = distância já rolada. */
function rolando(s: Cena, u: number, quique = 4): { p: Ponto; d: number } {
  const v = u * u * (3 - 2 * u)
  const p = entrePontos(s.de, s.ate, v)
  p.y -= Math.abs(Math.sin(v * Math.PI * 2)) * quique * (1 - v)
  return { p, d: Math.hypot(s.ate.x - s.de.x, s.ate.y - s.de.y) * v }
}

function impacto(s: Cena, t: number, extra = 0): void {
  const rng = rngSemeado(s.semente + 50)
  const ponto = { x: s.c.alvo.x, y: s.c.alvo.y + 1 }
  estrelaDeImpacto(s.c.ctx, ponto, 10 + s.c.tier * 1.5 + extra, t, s.pele, rng)
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 18 + s.c.tier * 3, t, s.pele.meio, rng)
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "Continually rolls into the target over five turns. More powerful each time it hits." */
  rollout(p, s) {
    const { ctx, ms } = s.c
    // Bate, recua quicando e volta rolando MAIOR pra bater de novo.
    const u = janela(ms, p.preparo, p.viagem)
    if (u !== null) { const r = rolando(s, u); disco(ctx, r.p, p.raio, s.giroDe(r.d, p.raio), s.pele); nuvem(ctx, { x: r.p.x - s.ux * 6, y: r.p.y + p.raio }, (u * 2) % 1, s.c.pedir(2), 5, PELES.GROUND, rngSemeado(s.semente + 1)) }
    const t1 = janela(ms, s.contato, CHOQUE)
    if (t1 !== null) impacto(s, t1)
    const volta = janela(ms, s.contato, p.extra!)
    if (volta !== null) {
      const recua = volta < .45 ? saida(volta / .45) : 1 - entrada((volta - .45) / .55)
      const q = { x: s.ate.x - s.ux * 16 * recua, y: s.ate.y - Math.sin(recua * Math.PI) * 7 }
      const r = p.raio * (1.15 + .2 * volta)
      disco(ctx, q, r, s.giroDe(-16 * recua, r), s.pele)
    }
    const t2 = janela(ms, s.contato + p.extra!, CHOQUE)
    if (t2 !== null) { impacto(s, t2, 4); estilhacos(ctx, s.c.alvo, s.c.pedir(4 + s.c.tier), 24, t2, s.pele, rngSemeado(s.semente + 2)) }
  },

  /** "Attacks the target for five turns. The move's power increases each time it hits." */
  ice_ball(p, s) {
    const { ctx, ms, alvo } = s.c
    // Bola de neve que CRESCE enquanto rola (vai juntando gelo) e se estilhaça.
    const u = janela(ms, p.preparo, p.viagem)
    if (u !== null) {
      const r = rolando(s, u, 2), raio = p.raio * (.55 + .85 * u)
      disco(ctx, r.p, raio, s.giroDe(r.d, raio), s.pele, 3, s.pele.meio, s.pele.nucleo)
      estilhacos(ctx, { x: r.p.x - s.ux * 6, y: r.p.y + raio * .5 }, s.c.pedir(2), 7, (u * 3) % 1, s.pele, rngSemeado(s.semente + 1))
    }
    const t = janela(ms, s.contato, CHOQUE)
    if (t === null) return
    impacto(s, t, 2)
    estilhacos(ctx, alvo, s.c.pedir(6 + s.c.tier), 26 + s.c.tier * 3, t, s.pele, rngSemeado(s.semente + 2))
    nuvem(ctx, { x: alvo.x, y: alvo.y + 2 }, t, s.c.pedir(4), 12, s.pele, rngSemeado(s.semente + 3), .6, 3, s.pele.meio, s.pele.nucleo)
  },

  /** "A spin attack that can also eliminate moves such as Bind, Wrap, Leech Seed, and Spikes." */
  rapid_spin(p, s) {
    const { ctx, ms, origem } = s.c
    // Gira no lugar e ARREMESSA pra longe o que estava preso (cipós, espinhos,
    // sementes) — a limpeza; depois sai girando até o alvo.
    const tp = janela(ms, 0, p.preparo)
    if (tp !== null) {
      giroDeLinhas(ctx, origem, 11, ms / 22, s.pele)
      const rng = rngSemeado(s.semente + 1)
      for (let k = 0; k < 5; k++) {
        const a = rng() * Math.PI * 2, d = 6 + 26 * saida(limitar(tp * 1.3 - k * .08)), giro = tp * 9 + k
        const q = { x: origem.x + Math.cos(a) * d, y: origem.y + Math.sin(a) * d * .7 - 6 * Math.sin(tp * Math.PI) }
        const cor = k % 3 === 0 ? PELES.GRASS.base : k % 3 === 1 ? PELES.GROUND.meio : PELES.POISON.meio
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(giro)
        poligono(ctx, [[-3.6, -1.6], [3.6, -1.6], [3.6, 1.6], [-3.6, 1.6]], ESCURO)
        poligono(ctx, [[-2.6, -.8], [2.6, -.8], [2.6, .8], [-2.6, .8]], cor)
        ctx.restore()
      }
    }
    const u = janela(ms, p.preparo, p.viagem)
    if (u !== null) giroDeLinhas(ctx, rolando(s, u, 0).p, 10, ms / 22, s.pele)
    const t = janela(ms, s.contato, CHOQUE)
    if (t !== null) { impacto(s, t); if (t < .5) giroDeLinhas(ctx, s.c.alvo, 8 + t * 10, ms / 22, s.pele) }
  },

  /** "Tackles the target with a high-speed spin. The slower the user, the greater the power." */
  gyro_ball(p, s) {
    const { ctx, ms, alvo } = s.c
    // Giroscópio de aço: anéis em órbita que aceleram no preparo; zumbido de fagulhas.
    const pose = (): { p: Ponto; vel: number } | null => {
      if (ms < p.preparo) return { p: s.de, vel: 4 + 26 * (ms / p.preparo) }
      const u = janela(ms, p.preparo, p.viagem)
      return u === null ? null : { p: rolando(s, u, 0).p, vel: 30 }
    }
    const q = pose()
    if (q) {
      const g = (ms / 1000) * q.vel
      for (const k of [0, 1, 2]) {
        for (const [w, cor] of [[2.6, ESCURO], [1.2, k === 1 ? BRANCO : s.pele.meio]] as const) {
          ctx.strokeStyle = cor; ctx.lineWidth = w
          ctx.beginPath(); ctx.ellipse(q.p.x, q.p.y, p.raio * 1.7, p.raio * .45, g + k * Math.PI / 3, 0, Math.PI * 2); ctx.stroke()
        }
      }
      disco(ctx, q.p, p.raio, g * 3, s.pele, 6)
    }
    const t = janela(ms, s.contato, CHOQUE)
    if (t === null) return
    impacto(s, t, 2)
    const rng = rngSemeado(s.semente + 60)
    for (let k = 0; k < Math.min(s.c.pedir(4 + s.c.tier), 8); k++) {
      const a = (k / 8) * Math.PI * 2 + t * 6, d = (8 + rng() * 12) * saida(t)
      brilho(ctx, alvo.x + Math.cos(a) * d, alvo.y + Math.sin(a) * d * .7, 2.2 * (1 - t), s.pele.acento?.[1] ?? s.pele.meio)
    }
  },

  /** "Crushes its target by rolling over the target with its rolled-up body." */
  steamroller(p, s) {
    const { ctx, ms, alvo } = s.c
    // Rolo largo que passa POR CIMA do alvo e segue em frente, achatando-o.
    const u = janela(ms, p.preparo, p.viagem + p.extra!)
    if (u !== null) {
      const fim = { x: alvo.x + s.ux * 24, y: alvo.y + 4 }
      const total = p.viagem + p.extra!
      const v = limitar((ms - p.preparo) / total)
      const q = entrePontos(s.de, fim, v)
      const sobre = Math.max(0, 1 - Math.abs(q.x - alvo.x) / 14)
      q.y -= sobre * 8
      ctx.save(); ctx.translate(q.x, q.y); ctx.scale(1.5, 1); ctx.translate(-q.x, -q.y)
      disco(ctx, q, p.raio, s.giroDe(Math.hypot(q.x - s.de.x, q.y - s.de.y), p.raio), s.pele)
      ctx.restore()
    }
    const t = janela(ms, s.contato, CHOQUE + p.extra!)
    if (t === null) return
    impacto(s, limitar(t * 1.3))
    // Achatado: linhas horizontais de pressão saindo pros lados do alvo.
    const k = 1 - limitar((t - .3) / .6)
    if (k > 0) for (const lado of [-1, 1]) for (const dy of [-3, 3]) {
      poligono(ctx, [[alvo.x + lado * 10, alvo.y + dy - 1], [alvo.x + lado * (10 + 12 * k), alvo.y + dy - .4], [alvo.x + lado * (10 + 12 * k), alvo.y + dy + .4], [alvo.x + lado * 10, alvo.y + dy + 1]], BRANCO)
    }
    nuvem(ctx, { x: alvo.x, y: alvo.y + 11 }, t, s.c.pedir(4), 16, PELES.GROUND, rngSemeado(s.semente + 2))
  },

  /** "Cloaks itself in fire and charges at the target. May leave the target with a burn." */
  flame_wheel(p, s) {
    const { ctx, ms, alvo } = s.c
    // Roda de fogo: um ANEL de línguas de chama girando, oco no meio.
    const q = ms < p.preparo ? { p: s.de, d: ms / 6 } : (() => { const u = janela(ms, p.preparo, p.viagem); return u === null ? null : rolando(s, u, 2) })()
    if (q) {
      const forma = ms < p.preparo ? saida(ms / p.preparo) : 1
      aneldeFogo(ctx, q.p, p.raio * forma, s.giroDe(q.d, p.raio) + ms / 60, s.pele)
    }
    const t = janela(ms, s.contato, CHOQUE)
    if (t === null) return
    impacto(s, t)
    emitirParticulas(ctx, s.pele, alvo, s.c.pedir(5 + s.c.tier), 22, t, 5, rngSemeado(s.semente + 3))
  },
}

function giroDeLinhas(ctx: CanvasRenderingContext2D, p: Ponto, r: number, giro: number, pele: Pele): void {
  for (const [w, cor] of [[3.4, pele.contorno], [1.6, pele.meio], [.7, BRANCO]] as const) {
    ctx.strokeStyle = cor; ctx.lineWidth = w; ctx.lineCap = 'round'
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(p.x, p.y, r * (.5 + k * .25), r * (.5 + k * .25) * .55, 0, giro + k * 2, giro + k * 2 + 2.4); ctx.stroke() }
  }
}

function aneldeFogo(ctx: CanvasRenderingContext2D, p: Ponto, r: number, giro: number, pele: Pele): void {
  if (r < 1) return
  for (const [g, cor] of [[1.4, pele.contorno], [0, pele.base], [-1.6, pele.meio]] as const) {
    for (let k = 0; k < 8; k++) {
      const a = giro + k * Math.PI / 4, b = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }
      const ta = a + Math.PI / 2, ponta = { x: b.x + Math.cos(ta) * (6 + g), y: b.y + Math.sin(ta) * (6 + g) }
      poligono(ctx, [[b.x + Math.cos(a) * (2.6 + g), b.y + Math.sin(a) * (2.6 + g)], [ponta.x, ponta.y], [b.x - Math.cos(a) * (2.6 + g), b.y - Math.sin(a) * (2.6 + g)]], cor)
    }
  }
}

export const ROLAMENTOS_POR_GOLPE = montarFamilia(PERFIS_DE_ROLAMENTO, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: duracaoDe,
  contato: contatoDe,
  alcance: 56,
  pele: id => id === 'rollout' || id === 'steamroller' || id === 'rapid_spin'
    ? comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], PELES.GROUND.contorno, PELES.GROUND.base, PELES.GROUND.meio,
      ...(id === 'rapid_spin' ? [PELES.GRASS.base, PELES.POISON.meio] : []))
    : undefined,
})
