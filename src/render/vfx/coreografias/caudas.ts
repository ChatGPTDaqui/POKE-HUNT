// Família Cauda, asa e chicote (09/10): oito golpes desenhados a partir da
// descrição do jogo (frase no comentário de cada golpe).
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { crescente, entrada, estilhacos, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, bola, brilho, comAcento, corda, entrePontos, janela, montarFamilia, nuvem, poligono, rastro, setasDeStatus } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_CAUDA: Record<string, Perfil> = {
  power_whip: { contato: 300, fim: 260 },
  slam: { contato: 240, fim: 260 },
  aqua_tail: { contato: 220, fim: 280 },
  poison_tail: { contato: 180, fim: 280 },
  dragon_tail: { contato: 200, fim: 320 },
  steel_wing: { contato: 200, fim: 280 },
  wing_attack: { contato: 220, fim: 260 },
  needle_arm: { contato: 160, fim: 300 },
}

interface Cena { c: ContextoVfx; pele: Pele; semente: number; ux: number; uy: number; lado: number; contato: number }

function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy) || 1
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), ux: dx / L, uy: dy / L, lado: dx < 0 ? -1 : 1, contato: p.contato }
}

function choque(s: Cena, t: number, tamanho: number, ponto = s.c.alvo): void {
  const rng = rngSemeado(s.semente + 50)
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier * 1.5, t, s.pele, rng)
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 18 + s.c.tier * 3, t, s.pele.meio, rng)
}

/** Pontos de uma curva quadrática de `a` a `b` com controle `k`, truncada em `u`. */
function curva(a: Ponto, k: Ponto, b: Ponto, u = 1, n = 12): Ponto[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const v = (i / n) * u
    return { x: (1 - v) ** 2 * a.x + 2 * (1 - v) * v * k.x + v * v * b.x, y: (1 - v) ** 2 * a.y + 2 * (1 - v) * v * k.y + v * v * b.y }
  })
}

/** Asa aberta de penas longas (lado +1 direita), com a raiz em `p`. */
function asa(ctx: CanvasRenderingContext2D, p: Ponto, lado: number, abre: number, s: number, pele: Pele, cor = pele.base, luz = pele.meio): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(lado * s, s); ctx.rotate(-.5 - abre * .7)
  const penas = (g: number, c: string) => {
    for (let k = 0; k < 4; k++) {
      const a = k * .28, L = 16 - k * 2.4
      poligono(ctx, [[0, -g], [Math.cos(a) * (L + g), Math.sin(a) * (L + g) - 2], [Math.cos(a + .14) * (L * .8 + g), Math.sin(a + .14) * (L * .8 + g) + 2], [0, 2 + g]], c)
    }
  }
  penas(1.4, pele.contorno); penas(0, cor)
  poligono(ctx, [[0, -1], [12, -3], [10, 0], [0, 1.4]], luz)
  ctx.restore()
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "Violently whirls its vines, tentacles, or the like to harshly lash the target." */
  power_whip(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    const verde = PELES.GRASS
    // Gira o cipó em roda acima de quem ataca (2 voltas), depois estala no alvo.
    const roda = janela(ms, 0, 200)
    const topo = { x: origem.x, y: origem.y - 16 }
    if (roda !== null) {
      const a = roda * Math.PI * 4
      const ponta = { x: topo.x + Math.cos(a) * 16, y: topo.y + Math.sin(a) * 7 }
      corda(ctx, curva(origem, { x: topo.x + Math.cos(a - 1) * 10, y: topo.y + Math.sin(a - 1) * 4 }, ponta), 2.6, verde)
    }
    const estala = janela(ms, 200, p.contato - 200 + 60)
    if (estala !== null) {
      const u = saida(limitar(estala * 1.6))
      const ponta = entrePontos({ x: topo.x, y: topo.y - 10 }, alvo, u)
      corda(ctx, curva(origem, { x: (origem.x + alvo.x) / 2, y: origem.y - 26 + 20 * u }, ponta), 2.8, verde)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 12)
    // O estalo do chicote: traços em leque saindo do ponto, sem estrela redonda.
    const k = 1 - limitar(t / .5)
    if (k > 0) for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * .45, L = 14 * saida(1 - k) + 4
      poligono(ctx, [[alvo.x + Math.cos(a) * 5, alvo.y + Math.sin(a) * 5], [alvo.x + Math.cos(a + .08) * L, alvo.y + Math.sin(a + .08) * L], [alvo.x + Math.cos(a - .08) * L, alvo.y + Math.sin(a - .08) * L]], BRANCO)
    }
  },

  /** "The target is slammed with a long tail, vines, or the like." */
  slam(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // A cauda longa sobe em arco por cima e desce batendo no alvo.
    const u = janela(ms, 40, p.contato - 40 + 80)
    if (u !== null) {
      const v = limitar(u * 1.3)
      const ang = -Math.PI / 2 - s.lado * (1 - entrada(v)) * 1.2
      const comp = Math.hypot(alvo.x - origem.x, alvo.y - origem.y) + 4
      const ponta = { x: origem.x + Math.cos(ang + (s.lado > 0 ? Math.PI / 2 * entrada(v) * 2 : -Math.PI / 2 * entrada(v) * 2)) * comp * .5 + (alvo.x - origem.x) * entrada(v) * .5, y: origem.y - comp * .6 * (1 - entrada(v)) + (alvo.y - origem.y) * entrada(v) }
      corda(ctx, curva(origem, { x: (origem.x + ponta.x) / 2, y: Math.min(origem.y, ponta.y) - 14 }, ponta), 5, s.pele)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 13, { x: alvo.x, y: alvo.y - 4 })
    nuvem(ctx, { x: alvo.x, y: alvo.y + 11 }, t, s.c.pedir(4 + s.c.tier), 16, PELES.GROUND, rngSemeado(s.semente + 2))
  },

  /** "Swings its tail as if it were a vicious wave in a raging storm." */
  aqua_tail(p, s) {
    const { ctx, ms, alvo } = s.c
    // Uma ONDA de crista enrolada varre o alvo do lado de quem ataca.
    const t0 = janela(ms, 0, p.contato + 160)
    if (t0 !== null) {
      const u = limitar(ms / (p.contato + 160))
      const x = alvo.x - s.lado * (30 - 56 * saida(u))
      const h = 22 * Math.sin(u * Math.PI)
      const base = alvo.y + 11
      if (h > 1) {
        // Monte de água + crista que ENROLA pra frente (o jeito de onda brava).
        ctx.save(); ctx.translate(x, base); ctx.scale(s.lado, 1)
        for (const [g, cor] of [[1.4, s.pele.contorno], [0, s.pele.base], [-2, s.pele.meio]] as const) {
          ctx.fillStyle = cor; ctx.beginPath(); ctx.ellipse(-2, 0, 16 + g, h * .62 + g, 0, Math.PI, 0); ctx.fill()
        }
        crescente(ctx, { x: 2, y: -h * .55 }, h * .42 + 2, -Math.PI * 1.05, .5, 5, .55, 0, { ...s.pele, nucleo: BRANCO }, 1)
        ctx.restore()
        for (let k = 0; k < 4; k++) bola(ctx, { x: x + s.lado * (6 + k * 2), y: base - h - 3 - k * 2 + Math.sin(ms / 50 + k) * 2 }, 1.8, s.pele)
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 10)
    for (let k = 0; k < Math.min(s.c.pedir(5 + s.c.tier), 8); k++) {
      const a = -Math.PI / 2 + s.lado * .5 + (k / 7 - .5) * 2.2, v = 16 + (k % 3) * 4
      bola(ctx, { x: alvo.x + Math.cos(a) * v * t, y: alvo.y - 2 + Math.sin(a) * v * t + 30 * t * t }, 2.3 * (1 - limitar((t - .6) / .4)), s.pele)
    }
  },

  /** "Hits the target with its tail. May poison the target. Critical hits land more easily." */
  poison_tail(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Cauda roxa com ponta de FERRÃO em espada; o ferrão brilha (crítico fácil).
    const u = janela(ms, 30, p.contato - 30 + 80)
    if (u !== null) {
      const v = saida(limitar(u * 1.4))
      const ponta = entrePontos({ x: origem.x - s.lado * 6, y: origem.y - 18 }, { x: alvo.x - s.lado * 3, y: alvo.y - 2 }, v)
      const pts = curva({ x: origem.x - s.lado * 4, y: origem.y + 6 }, { x: origem.x - s.lado * 2, y: origem.y - 24 }, ponta)
      corda(ctx, pts, 3.2, s.pele)
      const fim = pts[pts.length - 1], antes = pts[pts.length - 2], a = Math.atan2(fim.y - antes.y, fim.x - antes.x)
      ctx.save(); ctx.translate(fim.x, fim.y); ctx.rotate(a)
      poligono(ctx, [[-2, -5.6], [8, 0], [-2, 5.6], [0, 0]], ESCURO)
      poligono(ctx, [[-1, -4], [6, 0], [-1, 4], [.6, 0]], s.pele.meio)
      ctx.restore()
      if (Math.floor(ms / 50) % 2) brilho(ctx, fim.x, fim.y - 4, 2.4, BRANCO)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 10)
    const rng = rngSemeado(s.semente + 3)
    for (let k = 0; k < Math.min(s.c.pedir(3 + s.c.tier), 6); k++) {
      const x = alvo.x + (rng() - .5) * 16, sobe = (t * 1.2 - k * .08)
      if (sobe > 0 && sobe < 1) bola(ctx, { x, y: alvo.y + 4 - sobe * 18 }, 2.2 * (1 - sobe * .6), s.pele)
    }
  },

  /** "The target is knocked away, and a different Pokémon is dragged out." */
  dragon_tail(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Varrida larga de cauda pela frente do alvo...
    const u = janela(ms, 40, p.contato - 40 + 60)
    if (u !== null) {
      const a0 = Math.atan2(s.uy, s.ux) - s.lado * 1.6, a1 = Math.atan2(s.uy, s.ux) + s.lado * .2
      const a = a0 + (a1 - a0) * saida(limitar(u * 1.3))
      const comp = Math.hypot(alvo.x - origem.x, alvo.y - origem.y)
      const ponta = { x: origem.x + Math.cos(a) * comp, y: origem.y + Math.sin(a) * comp * .8 }
      corda(ctx, curva(origem, { x: (origem.x + ponta.x) / 2 - s.lado * 4, y: (origem.y + ponta.y) / 2 - 10 }, ponta), 4.6, s.pele)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 12)
    // ...e o alvo é ARREMESSADO pra longe: rastro de empurrão saindo dele pra trás
    // e um redemoinho onde outro POKE é puxado pra luta.
    const empurra = limitar(t / .6)
    rastro(ctx, alvo, { x: alvo.x + s.ux * 34 * saida(empurra), y: alvo.y + s.uy * 34 * saida(empurra) - 4 }, s.c.pedir(4), 6, s.pele, rngSemeado(s.semente + 4), 1 - limitar((t - .6) / .4))
    const giro = limitar((t - .4) / .6)
    if (giro > 0 && giro < 1) crescente(ctx, { x: alvo.x, y: alvo.y + 2 }, 10 * (1 - giro) + 4, giro * 12, giro * 12 + 4, 2.4, .5, 0, s.pele, .5)
  },

  /** "The target is hit with wings of steel. May also raise the user's Defense." */
  steel_wing(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Asas de aço abrem com um brilho correndo pela borda e cortam o alvo.
    const abre = janela(ms, 0, p.contato + 60)
    if (abre !== null) {
      const a = saida(limitar(ms / 120))
      const q = entrePontos(origem, { x: alvo.x - s.ux * 6, y: alvo.y - 2 }, entrada(limitar((ms - 120) / (p.contato - 120))))
      asa(ctx, { x: q.x, y: q.y - 2 }, s.lado, a, .9, s.pele, s.pele.meio, s.pele.nucleo)
      const g = (ms / 140) % 1
      brilho(ctx, q.x + s.lado * 10 * g, q.y - 12 + 6 * g, 2.6, BRANCO)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 10)
    crescente(ctx, { x: alvo.x - s.lado * 14, y: alvo.y - 3 }, 14, -.9, .9, 3.4, t, 0, { ...s.pele, meio: s.pele.nucleo }, 1)
    setasDeStatus(ctx, origem, t, s.pele.meio, 2)
  },

  /** "Struck with large, imposing wings spread wide." */
  wing_attack(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Asas ENORMES se abrem atrás de quem ataca (imponente) e batem uma vez,
    // mandando uma rajada de vento com penas no alvo.
    const abre = janela(ms, 0, p.contato)
    if (abre !== null) {
      const a = saida(limitar(abre / .5)), bate = entrada(limitar((abre - .6) / .4))
      for (const lado of [-1, 1]) asa(ctx, { x: origem.x + lado * 3, y: origem.y - 6 }, lado, a - bate * 1.2, 1.25, s.pele)
      if (bate > 0) rastro(ctx, origem, entrePontos(origem, alvo, bate), s.c.pedir(3 + s.c.tier), 10, s.pele, rngSemeado(s.semente + 1))
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 10)
    const rng = rngSemeado(s.semente + 2)
    for (let k = 0; k < Math.min(s.c.pedir(4), 4); k++) {
      const q = { x: alvo.x + (rng() - .5) * 20 * saida(t) + s.ux * 10 * t, y: alvo.y - 6 + 16 * t * (k % 2 ? 1 : .6) }
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(t * 5 + k)
      poligono(ctx, [[-5, 0], [0, -2.6], [5, 0], [0, 2.6]], ESCURO); poligono(ctx, [[-4, 0], [0, -1.6], [4, 0], [0, 1.6]], s.pele.nucleo)
      ctx.restore()
    }
  },

  /** "Attacks by wildly swinging its thorny arms. May make the target flinch." */
  needle_arm(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    const verde = s.pele
    // Braço de cacto cheio de espinhos que bate DUAS vezes, girando sem controle.
    for (const [ini, de] of [[0, -1], [90, 1]] as const) {
      const u = janela(ms, ini, 110)
      if (u === null) continue
      const a = Math.atan2(s.uy, s.ux) + de * (1.2 - 2.2 * saida(u))
      const comp = Math.hypot(alvo.x - origem.x, alvo.y - origem.y) - 6
      const ponta = { x: origem.x + Math.cos(a) * comp, y: origem.y + Math.sin(a) * comp * .8 }
      corda(ctx, [origem, entrePontos(origem, ponta, .5), ponta], 5, verde)
      for (let k = 1; k <= 4; k++) {
        const q = entrePontos(origem, ponta, k / 5), n = { x: -(ponta.y - origem.y) / comp, y: (ponta.x - origem.x) / comp }
        for (const l of [-1, 1]) poligono(ctx, [[q.x + n.x * l * 2, q.y + n.y * l * 2], [q.x + n.x * l * 6, q.y + n.y * l * 6], [q.x + n.x * l * 2 + (ponta.x - origem.x) / comp * 2, q.y + n.y * l * 2 + (ponta.y - origem.y) / comp * 2]], BRANCO)
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 10)
    estilhacos(ctx, alvo, s.c.pedir(4 + s.c.tier), 22, t, { ...verde, meio: BRANCO }, rngSemeado(s.semente + 2))
    const k = 1 - limitar((t - .5) / .5)
    if (k > 0) for (const dx of [-6, 0, 6]) poligono(ctx, [[alvo.x + dx - 1, alvo.y - 16], [alvo.x + dx + 1, alvo.y - 16], [alvo.x + dx * 1.4 + .6, alvo.y - 16 - 7 * k], [alvo.x + dx * 1.4 - .6, alvo.y - 16 - 7 * k]], ESCURO)
  },
}

export const CAUDAS_POR_GOLPE = montarFamilia(PERFIS_DE_CAUDA, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim,
  contato: p => p.contato,
  alcance: 58,
  margem: () => ({ cima: 70, baixo: 58, lados: 58 }),
  pele: id => id === 'power_whip' || id === 'slam'
    ? comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], PELES.GRASS.contorno, PELES.GRASS.base, PELES.GRASS.meio, PELES.GROUND.base, PELES.GROUND.meio, PELES.GROUND.contorno)
    : undefined,
})
