// Família Rajada de projéteis (09/10): doze golpes de "várias coisas
// arremessadas" (ou uma coisa arremessada com truque), cada um a partir da
// descrição do jogo. Os de 2–5 acertos desenham UM projétil por acerto
// resolvido (`acertos`), como o Comet Punch. Natural Gift, Spit Up e Trump
// Card ficam de fora: nunca disparam no motor.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { crescente, entrada, estilhacos, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, bola, brilho, comAcento, entrePontos, janela, montarFamilia, nuvem, poligono, rastro } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_RAJADA: Record<string, Perfil> = {
  bullet_seed: { contato: 120, fim: 460 },
  rock_blast: { contato: 160, fim: 520 },
  spike_cannon: { contato: 110, fim: 440 },
  icicle_spear: { contato: 130, fim: 480 },
  barrage: { contato: 160, fim: 520 },
  bone_rush: { contato: 120, fim: 500 },
  fling: { contato: 220, fim: 260 },
  present: { contato: 280, fim: 340 },
  hidden_power: { contato: 300, fim: 280 },
  pay_day: { contato: 200, fim: 380 },
  bonemerang: { contato: 180, fim: 380 },
  bone_club: { contato: 200, fim: 260 },
}

const OURO = ['#ffd23a', '#fff3a0', '#c8902a'] as const, OSSO = ['#f4ecd8', '#c8b898'] as const
const PRESENTE = ['#e0303a', '#5cd65c'] as const, CORES_HP = ['#ff6f9e', '#58a6f0', '#5cd65c', '#ffd23a', '#c46ee0', '#ff9a3a']

interface Cena { c: ContextoVfx; pele: Pele; semente: number; ux: number; uy: number; contato: number; mao: Ponto; centro: Ponto; n: number }

function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy) || 1
  const ux = dx / L, uy = dy / L
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), ux, uy, contato: p.contato,
    mao: { x: c.origem.x + ux * 8, y: c.origem.y - 4 }, centro: { x: c.alvo.x, y: c.alvo.y - 3 },
    n: Math.max(2, Math.min(5, Math.trunc(c.acertos ?? 3))) }
}

function choque(s: Cena, t: number, tamanho: number, ponto = s.centro): void {
  const rng = rngSemeado(s.semente + 50)
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier, t, s.pele, rngSemeado(s.semente + 50 + Math.round(ponto.x * 7 + ponto.y)))
  riscos(s.c.ctx, ponto, s.c.pedir(1 + s.c.tier), 14 + s.c.tier * 2, t, s.pele.meio, rng)
}

/** Rajada: um projétil por acerto, saindo a cada `passo` ms; `desenha` pinta o projétil. */
function rajada(s: Cena, passo: number, viagem: number, arco: number, desenha: (q: Ponto, angulo: number, u: number, k: number) => void, tamanhoChoque = 6): void {
  const { ms } = s.c
  for (let k = 0; k < s.n; k++) {
    const ini = s.contato - viagem + k * passo
    const desvio = [0, -5, 4, -2, 6][k]
    const ate = { x: s.centro.x - s.uy * desvio, y: s.centro.y + s.ux * desvio }
    const u = janela(ms, ini, viagem)
    if (u !== null) {
      const q = entrePontos(s.mao, ate, u)
      q.y -= Math.sin(u * Math.PI) * arco
      const v2 = Math.min(1, u + .05), q2 = entrePontos(s.mao, ate, v2)
      q2.y -= Math.sin(v2 * Math.PI) * arco
      desenha(q, Math.atan2(q2.y - q.y, q2.x - q.x), u, k)
    }
    const t = janela(ms, ini + viagem, 200)
    if (t !== null) choque(s, t, tamanhoChoque, ate)
  }
}

function osso(ctx: CanvasRenderingContext2D, p: Ponto, giro: number, s: number): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(giro); ctx.scale(s, s)
  const forma = (g: number, cor: string) => {
    ctx.fillStyle = cor
    ctx.fillRect(-8 - g, -1.6 - g, 16 + g * 2, 3.2 + g * 2)
    for (const x of [-8, 8]) for (const y of [-2, 2]) { ctx.beginPath(); ctx.arc(x, y, 2.4 + g, 0, Math.PI * 2); ctx.fill() }
  }
  forma(1.2, ESCURO); forma(0, OSSO[0])
  ctx.fillStyle = OSSO[1]; ctx.fillRect(-6, .4, 12, 1.2)
  ctx.restore()
}

function moeda(ctx: CanvasRenderingContext2D, p: Ponto, giro: number): void {
  const w = Math.max(.8, Math.abs(Math.cos(giro)) * 3.6)
  ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(p.x, p.y, w + 1.2, 4.8, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = OURO[0]; ctx.beginPath(); ctx.ellipse(p.x, p.y, w, 3.6, 0, 0, Math.PI * 2); ctx.fill()
  if (w > 2) { ctx.fillStyle = OURO[2]; ctx.fillRect(p.x - .6, p.y - 2, 1.2, 4) }
  ctx.fillStyle = OURO[1]; ctx.fillRect(p.x - w * .5, p.y - 2.4, 1.2, 1.2)
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "Forcefully shoots seeds at the target two to five times in a row." */
  bullet_seed(_p, s) {
    const { ctx } = s.c
    // Metralhadora de sementes: retas, rápidas, uma por acerto.
    rajada(s, 70, 90, 0, (q, a) => {
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(a)
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(0, 0, 4, 2.8, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = s.pele.meio; ctx.beginPath(); ctx.ellipse(0, 0, 3, 1.8, 0, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
      rastro(ctx, { x: q.x - Math.cos(a) * 10, y: q.y - Math.sin(a) * 10 }, q, 1, 1, s.pele, rngSemeado(s.semente))
    })
  },

  /** "Hurls hard rocks at the target. Two to five rocks are launched in a row." */
  rock_blast(_p, s) {
    const { ctx } = s.c
    // Pedras pesadas em arco, girando; cada uma se parte no alvo.
    rajada(s, 100, 140, 14, (q, _a, u) => {
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(u * 7)
      poligono(ctx, [[-5.6, -2], [-2, -5.6], [4, -4.6], [5.8, 1], [2, 5.4], [-4, 4]], ESCURO)
      poligono(ctx, [[-4.4, -1.6], [-1.6, -4.4], [3, -3.6], [4.6, .8], [1.6, 4.2], [-3, 3]], s.pele.base)
      poligono(ctx, [[-2.6, -2], [0, -3.4], [2, -2], [0, -.6]], s.pele.meio)
      ctx.restore()
    }, 8)
  },

  /** "Sharp spikes are shot at the target in rapid succession." */
  spike_cannon(_p, s) {
    const { ctx } = s.c
    // Espinhos finos e retos disparados como tiros.
    rajada(s, 65, 80, 0, (q, a) => {
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(a)
      poligono(ctx, [[5, 0], [-6, -2.4], [-6, 2.4]], ESCURO); poligono(ctx, [[3.6, 0], [-5, -1.2], [-5, 1.2]], BRANCO)
      ctx.restore()
    })
  },

  /** "Launches sharp icicles at the target two to five times in a row." */
  icicle_spear(_p, s) {
    const { ctx } = s.c
    // Lanças de gelo compridas e translúcidas; estilhaços de gelo a cada acerto.
    rajada(s, 80, 100, 3, (q, a) => {
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(a)
      poligono(ctx, [[7, 0], [-8, -3], [-6, 0], [-8, 3]], ESCURO)
      poligono(ctx, [[5.6, 0], [-6.6, -2], [-5, 0], [-6.6, 2]], s.pele.meio)
      poligono(ctx, [[5, 0], [-4, -.8], [-4, 0]], BRANCO)
      ctx.restore()
    })
    const t = janela(s.c.ms, s.contato + (s.n - 1) * 80, 260)
    if (t !== null) estilhacos(ctx, s.centro, s.c.pedir(4), 18, t, s.pele, rngSemeado(s.semente + 3))
  },

  /** "Round objects are hurled at the target to strike two to five times in a row." */
  barrage(_p, s) {
    const { ctx } = s.c
    // Bolas redondas em arco alto, quicando no alvo.
    rajada(s, 100, 140, 18, q => bola(ctx, q, 4.6, s.pele, s.pele.base, s.pele.nucleo), 7)
  },

  /** "Strikes the target with a hard bone two to five times in a row." */
  bone_rush(_p, s) {
    const { ctx, ms } = s.c
    // O osso BATE várias vezes em ritmo, girando entre uma pancada e outra.
    for (let k = 0; k < s.n; k++) {
      const ini = s.contato - 80 + k * 90
      const t = janela(ms, ini, 90)
      if (t !== null) {
        const lado = k % 2 ? -1 : 1
        osso(ctx, { x: s.centro.x - s.ux * 10 + lado * 4, y: s.centro.y - 14 + 12 * saida(t) }, lado * (1.2 - t * 1.6), 1)
      }
      const tc = janela(ms, ini + 80, 200)
      if (tc !== null) choque(s, tc, 7, { x: s.centro.x + (k % 2 ? 4 : -3), y: s.centro.y + [0, -4, 3, -2, 4][k] })
    }
  },

  /** "Flings its held item at the target. Power and effects depend on the item." */
  fling(p, s) {
    const { ctx, ms } = s.c
    // Arremessa o que tiver na mão: uma bolsinha voa girando, rodopio forte.
    const u = janela(ms, 30, p.contato - 30)
    if (u !== null) {
      const q = entrePontos(s.mao, s.centro, saida(u))
      q.y -= Math.sin(u * Math.PI) * 18
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(u * 9)
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(0, 1.4, 5.4, 4.8, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#c8873a'; ctx.beginPath(); ctx.ellipse(0, 1.4, 4.2, 3.6, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = BRANCO; ctx.fillRect(-2.6, -3.6, 5.2, 1.2)
      ctx.restore()
      crescente(ctx, q, 9, u * 9, u * 9 + 2, 1.6, .5, 0, s.pele, 1)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 10)
  },

  /** "Gives the target a gift with a hidden trap. It restores HP sometimes." */
  present(p, s) {
    const { ctx, ms } = s.c
    // Caixa de presente com laço viaja quicando, ABRE e... é uma bomba.
    const u = janela(ms, 30, p.contato - 90)
    const abre = janela(ms, p.contato - 60, 60)
    const q = u !== null ? (() => { const r = entrePontos(s.mao, s.centro, u); r.y -= Math.abs(Math.sin(u * Math.PI * 2)) * 10; return r })() : abre !== null ? s.centro : null
    if (q) {
      const tampa = abre ?? 0
      poligono(ctx, [[q.x - 6.4, q.y - 4], [q.x + 6.4, q.y - 4], [q.x + 6.4, q.y + 6.4], [q.x - 6.4, q.y + 6.4]], ESCURO)
      poligono(ctx, [[q.x - 5.2, q.y - 3], [q.x + 5.2, q.y - 3], [q.x + 5.2, q.y + 5.2], [q.x - 5.2, q.y + 5.2]], PRESENTE[0])
      ctx.fillStyle = PRESENTE[1]; ctx.fillRect(q.x - 1.2, q.y - 3, 2.4, 8.2)
      const ty = q.y - 4 - tampa * 9
      poligono(ctx, [[q.x - 7, ty - 3.4], [q.x + 7, ty - 3.4], [q.x + 7, ty + 1], [q.x - 7, ty + 1]], ESCURO)
      poligono(ctx, [[q.x - 6, ty - 2.4], [q.x + 6, ty - 2.4], [q.x + 6, ty], [q.x - 6, ty]], PRESENTE[0])
      poligono(ctx, [[q.x, ty - 2.4], [q.x - 4, ty - 6], [q.x - 3, ty - 2.4]], PRESENTE[1])
      poligono(ctx, [[q.x, ty - 2.4], [q.x + 4, ty - 6], [q.x + 3, ty - 2.4]], PRESENTE[1])
      if (abre !== null) bola(ctx, { x: q.x, y: q.y - 4 - tampa * 5 }, 3.4, s.pele, ESCURO, '#4a3a5a')
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 14)
    nuvem(ctx, s.centro, t, s.c.pedir(5), 14, PELES.NORMAL, rngSemeado(s.semente + 2), .7, 8)
    estilhacos(ctx, s.centro, s.c.pedir(4), 22, t, { ...s.pele, meio: PRESENTE[0], base: PRESENTE[1] }, rngSemeado(s.semente + 3))
  },

  /** "A unique attack that varies in type depending on the Pokémon using it." */
  hidden_power(p, s) {
    const { ctx, ms, origem } = s.c
    // Poder oculto: seis orbes de cores diferentes giram em volta de quem ataca
    // (o tipo ainda é segredo) e convergem no alvo.
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + ms / 120
      const gira = { x: origem.x + Math.cos(a) * 14, y: origem.y - 2 + Math.sin(a) * 7 }
      const vai = limitar((ms - 160 - k * 15) / (p.contato - 160 - 75))
      const q = entrePontos(gira, { x: s.centro.x + Math.cos(a) * 3, y: s.centro.y + Math.sin(a) * 3 }, saida(vai))
      if (ms < p.contato + 10) bola(ctx, q, 3, s.pele, CORES_HP[k], BRANCO)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 11)
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3, d = 18 * saida(t)
      brilho(ctx, s.centro.x + Math.cos(a) * d, s.centro.y + Math.sin(a) * d * .8, 2.4 * (1 - t), CORES_HP[k])
    }
  },

  /** "Numerous coins are hurled at the target. Money is earned after the battle." */
  pay_day(p, s) {
    const { ctx, ms } = s.c
    // Chuva de MOEDAS de ouro girando em arco; quicam no alvo e no chão, brilhando.
    const rng = rngSemeado(s.semente + 1)
    for (let k = 0; k < 7; k++) {
      const atraso = rng() * 90, arco = 10 + rng() * 14, dx = (rng() - .5) * 14
      const u = janela(ms, p.contato - 140 + atraso, 140)
      if (u !== null) {
        const q = entrePontos(s.mao, { x: s.centro.x + dx, y: s.centro.y }, u)
        q.y -= Math.sin(u * Math.PI) * arco
        moeda(ctx, q, ms / 40 + k)
      }
      const quica = janela(ms, p.contato + atraso, 260)
      if (quica !== null) moeda(ctx, { x: s.centro.x + dx * (1 + quica), y: s.centro.y + 12 * quica - Math.sin(quica * Math.PI) * 10 }, ms / 40 + k)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 9)
    if (Math.floor(ms / 60) % 2) brilho(ctx, s.centro.x + 8, s.centro.y - 10, 3 * (1 - t), OURO[1])
  },

  /** "Throws the bone it holds. The bone loops around to hit the target twice — coming and going." */
  bonemerang(p, s) {
    const { ctx, ms } = s.c
    // Bumerangue de osso: vai girando, acerta, CONTORNA o alvo e acerta de novo voltando.
    const ida = janela(ms, 30, p.contato - 30)
    if (ida !== null) osso(ctx, entrePontos(s.mao, s.centro, saida(ida)), ms / 25, .9)
    const volta = janela(ms, p.contato, 220)
    if (volta !== null) {
      const a = Math.atan2(s.uy, s.ux) + volta * Math.PI * 1.6
      const q = { x: s.centro.x + Math.cos(a) * 14 * Math.sin(volta * Math.PI), y: s.centro.y + Math.sin(a) * 10 * Math.sin(volta * Math.PI) }
      const v = limitar((volta - .55) / .45)
      osso(ctx, entrePontos(q, s.mao, entrada(v)), ms / 25, .9)
    }
    for (const atraso of [0, 130]) {
      const t = janela(ms, s.contato + atraso, 200)
      if (t !== null) choque(s, t, 7 + (atraso ? 2 : 0))
    }
  },

  /** "Clubs the target with a bone. May make the target flinch." */
  bone_club(p, s) {
    const { ctx, ms, alvo } = s.c
    // Porrete de osso erguido e baixado de uma vez na cabeça do alvo.
    const t0 = janela(ms, 0, p.contato + 60)
    if (t0 !== null) {
      const ergue = ms < p.contato - 70 ? saida(ms / (p.contato - 70)) : 1 - entrada(limitar((ms - p.contato + 70) / 70))
      const giro = -1.6 * ergue + .3
      osso(ctx, { x: s.centro.x - s.ux * 8, y: s.centro.y - 12 - ergue * 8 }, giro * (s.ux < 0 ? -1 : 1), 1.15)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 11, { x: alvo.x, y: alvo.y - 8 })
    const k = 1 - limitar((t - .5) / .5)
    if (k > 0) for (const dx of [-6, 0, 6]) poligono(ctx, [[alvo.x + dx - 1, alvo.y - 16], [alvo.x + dx + 1, alvo.y - 16], [alvo.x + dx * 1.4 + .6, alvo.y - 16 - 7 * k], [alvo.x + dx * 1.4 - .6, alvo.y - 16 - 7 * k]], ESCURO)
  },
}

const ACENTOS: Record<string, string[]> = {
  bone_rush: [...OSSO], bonemerang: [...OSSO], bone_club: [...OSSO], pay_day: [...OURO],
  present: [...PRESENTE, '#4a3a5a', ESCURO], hidden_power: CORES_HP, fling: ['#c8873a'],
}

export const RAJADAS_POR_GOLPE = montarFamilia(PERFIS_DE_RAJADA, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim,
  contato: p => p.contato,
  alcance: 54,
  margem: () => ({ cima: 64, baixo: 54, lados: 54 }),
  pele: id => ACENTOS[id] ? comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...ACENTOS[id]) : undefined,
})
