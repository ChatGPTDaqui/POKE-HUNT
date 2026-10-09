// Família Chifre, ferrão e bico (09/10): nove golpes de perfurar, cada um a
// partir da descrição do jogo (frase no comentário). A forma comum é a PONTA
// (cone afiado que estoca e volta), mas o que ela é — chifre de marfim, bico,
// broca girando, ferrão listrado, braço pingando veneno — vem de cada golpe.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, bola, brilho, comAcento, entrePontos, janela, montarFamilia, nuvem, poligono, rastro } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_PERFURAR: Record<string, Perfil> = {
  horn_attack: { contato: 170, fim: 240 },
  fury_attack: { contato: 110, fim: 520 },
  peck: { contato: 110, fim: 220 },
  pluck: { contato: 130, fim: 360 },
  drill_run: { contato: 230, fim: 260 },
  poison_jab: { contato: 160, fim: 300 },
  twineedle: { contato: 130, fim: 300 },
  fell_stinger: { contato: 150, fim: 280 },
  smart_strike: { contato: 260, fim: 240 },
}

interface Cena { c: ContextoVfx; pele: Pele; semente: number; angulo: number; ux: number; uy: number; contato: number }

function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy)
  const angulo = L > .01 ? Math.atan2(dy, dx) : c.angulo
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), angulo, ux: Math.cos(angulo), uy: Math.sin(angulo), contato: p.contato }
}

function choque(s: Cena, t: number, tamanho: number, ponto = s.c.alvo): void {
  const rng = rngSemeado(s.semente + 50)
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier * 1.2, t, s.pele, rng)
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 16 + s.c.tier * 3, t, s.pele.meio, rng)
}

/** Cone afiado com a ponta em `p` apontando pra `angulo`. */
function ponta(ctx: CanvasRenderingContext2D, p: Ponto, angulo: number, comp: number, larg: number, cor: string, luz: string, listras?: string): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angulo)
  poligono(ctx, [[1.6, 0], [-comp - 1.4, -larg - 1.4], [-comp - 1.4, larg + 1.4]], ESCURO)
  poligono(ctx, [[0, 0], [-comp, -larg], [-comp, larg]], cor)
  if (listras) for (let k = 1; k <= 2; k++) poligono(ctx, [[-comp * k / 3, -larg * k / 3], [-comp * k / 3 - 2.4, -larg * (k / 3 + .1)], [-comp * k / 3 - 2.4, larg * (k / 3 + .1)], [-comp * k / 3, larg * k / 3]], listras)
  poligono(ctx, [[-1, -.4], [-comp * .8, -larg * .75], [-comp * .8, -larg * .3]], luz)
  ctx.restore()
}

/** Estocada: a ponta avança da origem até o alvo e recua. Devolve a posição. */
function estocada(s: Cena, ms: number, ini: number, dura: number, recuo = 8): Ponto | null {
  const t = janela(ms, ini, dura)
  if (t === null) return null
  const u = t < .6 ? saida(t / .6) : 1 - entrada((t - .6) / .4) * .5
  return entrePontos({ x: s.c.alvo.x - s.ux * (recuo + 22), y: s.c.alvo.y - s.uy * (recuo + 22) - 2 }, { x: s.c.alvo.x - s.ux * 4, y: s.c.alvo.y - s.uy * 4 - 2 }, u)
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "The target is jabbed with a sharply pointed horn." */
  horn_attack(p, s) {
    const { ctx, ms } = s.c
    // Chifre de marfim, cone longo e liso, uma estocada firme.
    const q = estocada(s, ms, p.contato - 110, 200)
    if (q) ponta(ctx, q, s.angulo, 20, 4.6, s.pele.nucleo, BRANCO)
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 10)
  },

  /** "Jabbed repeatedly with a horn or beak two to five times in a row." */
  fury_attack(p, s) {
    const { ctx, ms } = s.c
    // Uma estocada curta por acerto resolvido, em pontos um pouco diferentes.
    const n = Math.max(2, Math.min(5, Math.trunc(s.c.acertos ?? 3)))
    for (let k = 0; k < n; k++) {
      const ini = p.contato - 70 + k * 95
      const desvio = [0, -5, 4, -2, 6][k]
      const q = estocada(s, ms, ini, 130, 2)
      if (q) ponta(ctx, { x: q.x - s.uy * desvio, y: q.y + s.ux * desvio }, s.angulo, 13, 3.4, s.pele.nucleo, BRANCO)
      const t = janela(ms, ini + 70, 200)
      if (t !== null) choque(s, t, 6, { x: s.c.alvo.x - s.uy * desvio, y: s.c.alvo.y + s.ux * desvio - 2 })
    }
  },

  /** "The target is jabbed with a sharply pointed beak or horn." */
  peck(p, s) {
    const { ctx, ms } = s.c
    // Bico amarelo curto: bicada rápida, uma pena solta.
    const q = estocada(s, ms, p.contato - 70, 140, 0)
    if (q) bico(ctx, q, s.angulo, 1)
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 7)
    const v = saida(t)
    poligono(ctx, [[s.c.alvo.x - 3 + v * 8, s.c.alvo.y - 8 + v * 10], [s.c.alvo.x + v * 8, s.c.alvo.y - 9.4 + v * 10], [s.c.alvo.x + 3 + v * 8, s.c.alvo.y - 8 + v * 10], [s.c.alvo.x + v * 8, s.c.alvo.y - 6.6 + v * 10]], s.pele.nucleo)
  },

  /** "Pecks the target. If the target is holding a Berry, the user eats it." */
  pluck(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    const q = estocada(s, ms, p.contato - 80, 160, 0)
    if (q) bico(ctx, q, s.angulo, 1.15)
    const t = janela(ms, s.contato, 220)
    if (t !== null) choque(s, t, 8)
    // A fruta salta do alvo, voa até quem bicou e é COMIDA (migalhas).
    const voa = janela(ms, s.contato + 40, 220)
    if (voa !== null) {
      const fp = entrePontos({ x: alvo.x, y: alvo.y - 8 }, { x: origem.x, y: origem.y - 6 }, saida(voa))
      fp.y -= Math.sin(voa * Math.PI) * 14
      fruta(ctx, fp, 1 - entrada(limitar((voa - .8) / .2)) * .5)
    }
    const come = janela(ms, s.contato + 250, 110)
    if (come !== null) for (let k = 0; k < 4; k++) {
      const a = -Math.PI / 2 + (k - 1.5) * .6
      ctx.fillStyle = k % 2 ? '#d83a4a' : '#ff8a8a'
      ctx.fillRect(origem.x + Math.cos(a) * 10 * come, origem.y - 6 + Math.sin(a) * 6 * come + 8 * come * come, 1.6, 1.6)
    }
  },

  /** "Crashes into its target while rotating its body like a drill. Critical hits land more easily." */
  drill_run(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Broca girando: cone com listras em espiral que andam (girando de verdade).
    const u = janela(ms, 40, p.contato - 40 + 60)
    if (u !== null) {
      const q = entrePontos({ x: origem.x + s.ux * 8, y: origem.y }, { x: alvo.x - s.ux * 2, y: alvo.y - 2 }, saida(limitar(u * 1.3)))
      rastro(ctx, origem, q, s.c.pedir(2 + s.c.tier), 5, s.pele, rngSemeado(s.semente + 1))
      broca(ctx, q, s.angulo, ms / 30, s.pele)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 12)
    nuvem(ctx, { x: alvo.x + s.ux * 6, y: alvo.y + 4 }, t, s.c.pedir(4 + s.c.tier), 16, s.pele, rngSemeado(s.semente + 2), .6, 2)
    if (t < .3) brilho(ctx, alvo.x + 10, alvo.y - 12, 3.4 * (1 - t / .3), BRANCO)
  },

  /** "Stabbed with a tentacle or arm steeped in poison. May poison the target." */
  poison_jab(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Braço roxo PINGANDO veneno avança e crava; respingo roxo e bolhas.
    const u = janela(ms, 20, p.contato - 20 + 70)
    if (u !== null) {
      const fim = entrePontos(origem, { x: alvo.x - s.ux * 3, y: alvo.y - 2 }, saida(limitar(u * 1.4)))
      ctx.lineCap = 'round'
      for (const [w, c] of [[7.6, ESCURO], [5, s.pele.base], [1.8, s.pele.meio]] as const) {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(origem.x, origem.y); ctx.lineTo(fim.x, fim.y); ctx.stroke()
      }
      ponta(ctx, fim, s.angulo, 7, 3.6, s.pele.meio, s.pele.nucleo)
      for (let k = 1; k <= 3; k++) {
        const g = entrePontos(origem, fim, k / 4), cai = ((ms / 300) + k * .3) % 1
        bola(ctx, { x: g.x, y: g.y + 3 + cai * 10 }, 1.6 * (1 - cai), s.pele)
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 9)
    const rng = rngSemeado(s.semente + 3)
    for (let k = 0; k < Math.min(s.c.pedir(4 + s.c.tier), 7); k++) {
      const a = rng() * Math.PI * 2, v = (10 + rng() * 8) * saida(t)
      bola(ctx, { x: alvo.x + Math.cos(a) * v, y: alvo.y + Math.sin(a) * v * .7 + 10 * t * t }, 2.4 * (1 - t * .6), s.pele)
    }
  },

  /** "Damages the target twice in succession by jabbing it with two spikes. May poison." */
  twineedle(p, s) {
    const { ctx, ms } = s.c
    // DUAS agulhas finas, uma em cima e outra embaixo, uma depois da outra.
    for (const [k, dy] of [[0, -5], [1, 5]] as const) {
      const ini = p.contato - 60 + k * 110
      const q = estocada(s, ms, ini, 120, 0)
      if (q) ponta(ctx, { x: q.x, y: q.y + dy }, s.angulo, 18, 1.8, BRANCO, s.pele.meio)
      const t = janela(ms, ini + 60, 220)
      if (t !== null) {
        choque(s, t, 6, { x: s.c.alvo.x, y: s.c.alvo.y - 2 + dy })
        bola(s.c.ctx, { x: s.c.alvo.x + 4, y: s.c.alvo.y - 2 + dy - 10 * t }, 1.8 * (1 - t), PELES.POISON)
      }
    }
  },

  /** "When the user knocks out a target with this move, the user's Attack stat rises drastically." */
  fell_stinger(p, s) {
    const { ctx, ms } = s.c
    // Ferrão de abelha listrado (amarelo e preto) que crava fundo; fica um
    // brilho vermelho de "ataque pronto pra subir" em volta da ponta.
    const q = estocada(s, ms, p.contato - 90, 220, 4)
    if (q) {
      ponta(ctx, q, s.angulo, 16, 4, '#ffd23a', '#fff3a0', ESCURO)
      if (Math.floor(ms / 50) % 2) brilho(ctx, q.x, q.y - 4, 2.4, '#e0303a')
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 9)
  },

  /** "Stabs the target with a sharp horn. This attack never misses." */
  smart_strike(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Nunca erra: uma MIRA trava no alvo; o chifre de aço faz uma curva e
    // acerta exatamente o centro da mira.
    const mira = janela(ms, 0, p.contato + 60)
    if (mira !== null) {
      const fecha = saida(limitar(ms / 140)), r = 18 - 8 * fecha
      ctx.strokeStyle = ESCURO; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(alvo.x, alvo.y - 2, r, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = '#e0303a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(alvo.x, alvo.y - 2, r, 0, Math.PI * 2); ctx.stroke()
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2
        poligono(ctx, [[alvo.x + Math.cos(a) * (r + 4), alvo.y - 2 + Math.sin(a) * (r + 4)], [alvo.x + Math.cos(a) * (r - 3) + Math.sin(a), alvo.y - 2 + Math.sin(a) * (r - 3) - Math.cos(a)], [alvo.x + Math.cos(a) * (r - 3) - Math.sin(a), alvo.y - 2 + Math.sin(a) * (r - 3) + Math.cos(a)]], '#e0303a')
      }
    }
    const u = janela(ms, 140, p.contato - 140)
    if (u !== null) {
      const v = saida(u), curva = Math.sin(v * Math.PI) * 18
      const q = { x: origem.x + (alvo.x - origem.x) * v + s.uy * curva, y: origem.y + (alvo.y - 2 - origem.y) * v - s.ux * curva }
      const v2 = Math.min(1, v + .05), q2 = { x: origem.x + (alvo.x - origem.x) * v2 + s.uy * Math.sin(v2 * Math.PI) * 18, y: origem.y + (alvo.y - 2 - origem.y) * v2 - s.ux * Math.sin(v2 * Math.PI) * 18 }
      ponta(ctx, q, Math.atan2(q2.y - q.y, q2.x - q.x), 16, 3.6, s.pele.meio, BRANCO)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 10)
  },
}

function bico(ctx: CanvasRenderingContext2D, p: Ponto, angulo: number, s: number): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angulo); ctx.scale(s, s)
  poligono(ctx, [[1.6, 0], [-11, -5.4], [-11, 5.4]], ESCURO)
  poligono(ctx, [[0, 0], [-10, -4], [-10, 0]], '#ffc21a')
  poligono(ctx, [[0, 0], [-10, 0], [-10, 4]], '#e08a10')
  ctx.restore()
}

function fruta(ctx: CanvasRenderingContext2D, p: Ponto, s: number): void {
  ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(p.x, p.y, 4.4 * s, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#d83a4a'; ctx.beginPath(); ctx.arc(p.x, p.y, 3.2 * s, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ff8a8a'; ctx.fillRect(p.x - 1.6 * s, p.y - 1.8 * s, 1.4 * s, 1.4 * s)
  poligono(ctx, [[p.x, p.y - 3 * s], [p.x + 3.4 * s, p.y - 5.6 * s], [p.x + 1 * s, p.y - 2.6 * s]], '#4caf50')
}

function broca(ctx: CanvasRenderingContext2D, p: Ponto, angulo: number, giro: number, pele: Pele): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angulo)
  poligono(ctx, [[2, 0], [-20, -8.4], [-20, 8.4]], ESCURO)
  poligono(ctx, [[0, 0], [-19, -7], [-19, 7]], pele.base)
  // Listras em espiral que "andam" com o giro.
  for (let k = 0; k < 4; k++) {
    const x = -((k * 5 + (giro % 1) * 5) % 19)
    const w = 7 * (-x / 19)
    poligono(ctx, [[x, -w], [x - 2.2, -w - .8], [x - 3.4, w + .8], [x - 1.2, w]], pele.meio)
  }
  poligono(ctx, [[0, 0], [-6, -2], [-6, 0]], BRANCO)
  ctx.restore()
}

export const PERFURAR_POR_GOLPE = montarFamilia(PERFIS_DE_PERFURAR, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim,
  contato: p => p.contato,
  alcance: 50,
  pele: id => {
    const base = PELES[getAbility(id)?.type ?? 'NORMAL']
    if (id === 'peck' || id === 'pluck') return comAcento(base, '#ffc21a', '#e08a10', '#d83a4a', '#ff8a8a', '#4caf50')
    if (id === 'fell_stinger') return comAcento(base, '#ffd23a', '#fff3a0', '#e0303a')
    if (id === 'smart_strike') return comAcento(base, '#e0303a')
    if (id === 'twineedle') return comAcento(base, PELES.POISON.base, PELES.POISON.meio, PELES.POISON.contorno)
    return undefined
  },
})
