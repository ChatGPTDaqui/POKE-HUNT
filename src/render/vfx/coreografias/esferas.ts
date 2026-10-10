// Família Esfera / bomba (09/10): doze golpes de "atirar uma coisa redonda",
// cada um a partir da descrição do jogo (frase no comentário).
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { crescente, entrada, estilhacos, estrelaDeImpacto, limitar, pontosDeRaio, riscos, saida, tracarRaio } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, bola, brilho, comAcento, entrePontos, janela, montarFamilia, nuvem, poligono, rastro, setasDeStatus } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_ESFERA: Record<string, Perfil> = {
  energy_ball: { contato: 300, fim: 300 },
  aura_sphere: { contato: 260, fim: 280 },
  focus_blast: { contato: 340, fim: 320 },
  electro_ball: { contato: 220, fim: 280 },
  weather_ball: { contato: 260, fim: 280 },
  mist_ball: { contato: 260, fim: 320 },
  luster_purge: { contato: 280, fim: 320 },
  seed_bomb: { contato: 240, fim: 340 },
  egg_bomb: { contato: 300, fim: 300 },
  mud_bomb: { contato: 260, fim: 320 },
  octazooka: { contato: 220, fim: 340 },
  vacuum_wave: { contato: 120, fim: 240 },
}

const AZUL = '#58a6f0', AMARELO = '#ffd23a', LARANJA = '#ff9a3a', ROSA = '#ff9ccb', TINTA = '#1a1024'

interface Cena { c: ContextoVfx; pele: Pele; semente: number; passo: number; ux: number; uy: number; contato: number; mao: Ponto; centro: Ponto }

function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy) || 1
  const ux = dx / L, uy = dy / L
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), passo: Math.floor(c.ms / 66), ux, uy, contato: p.contato,
    mao: { x: c.origem.x + ux * 8, y: c.origem.y - 4 }, centro: { x: c.alvo.x, y: c.alvo.y - 3 } }
}

function choque(s: Cena, t: number, tamanho: number, ponto = s.centro): void {
  const rng = rngSemeado(s.semente + 50)
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier * 1.2, t, s.pele, rng)
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 16 + s.c.tier * 3, t, s.pele.meio, rng)
}

/** Voo de `de` até `ate` com arco opcional; `u` 0..1. */
function voo(de: Ponto, ate: Ponto, u: number, arco = 0): Ponto {
  const q = entrePontos(de, ate, u)
  q.y -= Math.sin(u * Math.PI) * arco
  return q
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "Draws power from nature and fires it at the target. May lower Sp. Def." */
  energy_ball(p, s) {
    const { ctx, ms } = s.c
    // Força da natureza: brilhos verdes vêm de todos os lados até a mão e formam a bola.
    const junta = janela(ms, 0, 180)
    if (junta !== null) {
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3 + .3, d = 26 * (1 - saida(junta))
        brilho(ctx, s.mao.x + Math.cos(a) * d, s.mao.y + Math.sin(a) * d * .8, 2.2, k % 2 ? s.pele.meio : s.pele.nucleo)
      }
      bola(ctx, s.mao, 2 + 5 * junta, s.pele, s.pele.meio, s.pele.nucleo)
    }
    const u = janela(ms, 180, p.contato - 180)
    if (u !== null) {
      const q = voo(s.mao, s.centro, saida(u))
      rastro(ctx, s.mao, q, s.c.pedir(2 + s.c.tier), 4, s.pele, rngSemeado(s.semente + 1))
      bola(ctx, q, 7, s.pele, s.pele.meio, s.pele.nucleo)
      crescente(ctx, q, 9, ms / 40, ms / 40 + 2, 1.8, .5, 0, s.pele, 1)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 11)
    estilhacos(ctx, s.centro, s.c.pedir(4), 20, t, s.pele, rngSemeado(s.semente + 2))
    if (t > .3) setasDeStatus(ctx, s.c.alvo, (t - .3) / .7, AZUL, 1, true)
  },

  /** "Lets loose a blast of aura power from deep within its body. Never misses." */
  aura_sphere(p, s) {
    const { ctx, ms } = s.c
    // Bola azul com BORDA DE AURA (chamas azuis tremendo) que corrige o rumo até o alvo.
    const u = janela(ms, 60, p.contato - 60)
    const forma = janela(ms, 0, 80)
    const q = forma !== null ? s.mao : u !== null ? (() => {
      const v = saida(u), curva = Math.sin(v * Math.PI) * 10
      return { x: s.mao.x + (s.centro.x - s.mao.x) * v - s.uy * curva, y: s.mao.y + (s.centro.y - s.mao.y) * v + s.ux * curva }
    })() : null
    if (q) {
      const r = forma !== null ? 3 + 5 * forma : 8
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + ms / 60, l = r + 3 + ((k + s.passo) % 3)
        poligono(ctx, [[q.x + Math.cos(a - .3) * r, q.y + Math.sin(a - .3) * r], [q.x + Math.cos(a) * l, q.y + Math.sin(a) * l], [q.x + Math.cos(a + .3) * r, q.y + Math.sin(a + .3) * r]], AZUL)
      }
      bola(ctx, q, r, s.pele, AZUL, BRANCO)
      if (u !== null) rastro(ctx, s.mao, q, s.c.pedir(2 + s.c.tier), 4, { ...s.pele, meio: AZUL }, rngSemeado(s.semente + 1))
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 12)
  },

  /** "Heightens its mental focus and unleashes its power. May lower Sp. Def." */
  focus_blast(p, s) {
    const { ctx, ms, origem } = s.c
    // Concentração: anéis se FECHAM em quem ataca (foco); sai uma bola grande
    // laranja com redemoinho e o impacto é enorme.
    const foco = janela(ms, 0, 200)
    if (foco !== null) for (let k = 0; k < 3; k++) {
      const v = limitar(foco * 1.5 - k * .2)
      if (v > 0 && v < 1) crescente(ctx, origem, 24 * (1 - v) + 4, -Math.PI, Math.PI, 2, .5, 0, { ...s.pele, meio: LARANJA }, .9)
    }
    const u = janela(ms, 200, p.contato - 200)
    if (u !== null) {
      const q = voo(s.mao, s.centro, entrada(u) * .3 + saida(u) * .7)
      bola(ctx, q, 10, s.pele, LARANJA, AMARELO)
      for (let k = 0; k < 2; k++) crescente(ctx, q, 12, ms / 30 + k * Math.PI, ms / 30 + k * Math.PI + 1.6, 2.4, .5, 0, { ...s.pele, meio: AMARELO }, 1)
      rastro(ctx, s.mao, q, s.c.pedir(3 + s.c.tier), 7, { ...s.pele, meio: LARANJA }, rngSemeado(s.semente + 1))
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 16)
    estilhacos(ctx, s.centro, s.c.pedir(5), 28, t, { ...s.pele, meio: LARANJA }, rngSemeado(s.semente + 2))
  },

  /** "Hurls an electric orb. The faster the user is than the target, the greater the power." */
  electro_ball(p, s) {
    const { ctx, ms } = s.c
    // Arremesso RÁPIDO: bola elétrica com faíscas, riscos de velocidade longos.
    const u = janela(ms, 80, p.contato - 80)
    const pre = janela(ms, 0, 80)
    if (pre !== null) { bola(ctx, s.mao, 3 + 3 * pre, s.pele); tracarRaio(ctx, pontosDeRaio(s.mao, { x: s.mao.x, y: s.mao.y - 10 }, 3, 2, rngSemeado(s.semente + s.passo)), 1, s.pele) }
    if (u !== null) {
      const q = voo(s.mao, s.centro, u)
      rastro(ctx, s.mao, q, s.c.pedir(4 + s.c.tier), 5, s.pele, rngSemeado(s.semente + 1))
      bola(ctx, q, 6, s.pele, s.pele.meio, s.pele.nucleo)
      const rng = rngSemeado(s.semente + 2 + s.passo)
      for (let k = 0; k < 2; k++) {
        const a = rng() * Math.PI * 2
        tracarRaio(ctx, pontosDeRaio(q, { x: q.x + Math.cos(a) * 11, y: q.y + Math.sin(a) * 11 }, 3, 2, rng), 1.1, s.pele)
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 11)
    if (t < .6) for (let k = 0; k < 3; k++) {
      const rng = rngSemeado(s.semente + 60 + k + s.passo), a = rng() * Math.PI * 2
      tracarRaio(ctx, pontosDeRaio(s.centro, { x: s.centro.x + Math.cos(a) * 20, y: s.centro.y + Math.sin(a) * 16 }, 4, 2, rng), 1.6 * (1 - t), s.pele)
    }
  },

  /** "Varies in power and type depending on the weather." */
  weather_ball(p, s) {
    const { ctx, ms } = s.c
    // Uma bola-vitrine do tempo: dentro dela trocam sol, gota de chuva e floco de neve.
    const u = janela(ms, 40, p.contato - 40)
    if (u !== null) {
      const q = voo(s.mao, s.centro, saida(u), 12)
      bola(ctx, q, 8, s.pele, '#e8f4ff', BRANCO)
      const fase = Math.floor(ms / 90) % 3
      if (fase === 0) {
        ctx.fillStyle = LARANJA; ctx.beginPath(); ctx.arc(q.x, q.y, 3.2, 0, Math.PI * 2); ctx.fill()
        for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; ctx.fillRect(q.x + Math.cos(a) * 4.6 - .6, q.y + Math.sin(a) * 4.6 - .6, 1.4, 1.4) }
      } else if (fase === 1) {
        poligono(ctx, [[q.x, q.y - 4.6], [q.x + 2.8, q.y + 1], [q.x, q.y + 3.6], [q.x - 2.8, q.y + 1]], AZUL)
      } else {
        ctx.strokeStyle = AZUL; ctx.lineWidth = 1.2
        for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; ctx.beginPath(); ctx.moveTo(q.x - Math.cos(a) * 4, q.y - Math.sin(a) * 4); ctx.lineTo(q.x + Math.cos(a) * 4, q.y + Math.sin(a) * 4); ctx.stroke() }
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 10)
  },

  /** "A mist-like flurry of down envelops and damages the target. May lower Sp. Atk." */
  mist_ball(p, s) {
    const { ctx, ms } = s.c
    // Bola felpuda de penugem (nuvem branco-rosa) que ENVOLVE o alvo e se desfaz em plumas.
    const u = janela(ms, 40, p.contato - 40)
    if (u !== null) {
      const q = voo(s.mao, s.centro, saida(u), 6)
      nuvem(ctx, q, .45, 6, 6, s.pele, rngSemeado(s.semente + 1), .9, 0, BRANCO, ROSA)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    nuvem(ctx, s.centro, limitar(t * .9), s.c.pedir(7 + s.c.tier), 14, s.pele, rngSemeado(s.semente + 2), .9, 4, BRANCO, ROSA)
    const rng = rngSemeado(s.semente + 3)
    for (let k = 0; k < 5; k++) {
      const a = rng() * Math.PI * 2, d = 6 + 18 * saida(t)
      ctx.save(); ctx.translate(s.centro.x + Math.cos(a) * d, s.centro.y + Math.sin(a) * d * .7 + 8 * t); ctx.rotate(a + t * 3)
      poligono(ctx, [[-3.4, 0], [0, -1.6], [3.4, 0], [0, 1.6]], ESCURO); poligono(ctx, [[-2.6, 0], [0, -.9], [2.6, 0], [0, .9]], BRANCO)
      ctx.restore()
    }
    if (t > .3) setasDeStatus(ctx, s.c.alvo, (t - .3) / .7, AZUL, 1, true)
  },

  /** "Lets loose a damaging burst of light. May lower Sp. Def." */
  luster_purge(p, s) {
    const { ctx, ms } = s.c
    // Uma joia de luz que viaja e EXPLODE em raios de luz retos (estouro radiante).
    const u = janela(ms, 60, p.contato - 60)
    if (u !== null) {
      const q = voo(s.mao, s.centro, saida(u))
      bola(ctx, q, 6, s.pele, BRANCO, s.pele.nucleo)
      brilho(ctx, q.x, q.y, 9, s.pele.nucleo)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    const k = saida(limitar(t / .25)) * (1 - entrada(limitar((t - .5) / .5)))
    if (k > .05) for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + .2, L = 30 * k
      poligono(ctx, [[s.centro.x + Math.cos(a - .1) * 4, s.centro.y + Math.sin(a - .1) * 4], [s.centro.x + Math.cos(a) * L, s.centro.y + Math.sin(a) * L * .8], [s.centro.x + Math.cos(a + .1) * 4, s.centro.y + Math.sin(a + .1) * 4]], i % 2 ? BRANCO : s.pele.nucleo)
    }
    choque(s, t, 11)
  },

  /** "Slams a barrage of hard-shelled seeds down on the target from above." */
  seed_bomb(p, s) {
    const { ctx, ms } = s.c
    // Sementes de casca dura CAEM DE CIMA no alvo, uma depois da outra, explodindo.
    for (let k = 0; k < 4; k++) {
      const ini = p.contato - 140 + k * 50
      const x = s.centro.x + [-6, 5, -2, 7][k], cai = janela(ms, ini, 140)
      if (cai !== null) {
        const y = s.centro.y - 44 + 44 * entrada(cai)
        ctx.save(); ctx.translate(x, y); ctx.rotate(.4)
        ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 4.8, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#a0703a'; ctx.beginPath(); ctx.ellipse(0, 0, 2.4, 3.8, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#d8a46a'; ctx.fillRect(-1.2, -2.4, 1.2, 2)
        ctx.restore()
      }
      const t = janela(ms, ini + 140, 220)
      if (t !== null) {
        estrelaDeImpacto(ctx, { x, y: s.centro.y }, 8 + s.c.tier, t, s.pele, rngSemeado(s.semente + 10 + k))
        estilhacos(ctx, { x, y: s.centro.y }, Math.min(s.c.pedir(2), 2), 12, t, PELES.GROUND, rngSemeado(s.semente + 20 + k))
      }
    }
  },

  /** "A large egg is hurled at the target with maximum force." */
  egg_bomb(p, s) {
    const { ctx, ms } = s.c
    // Ovo grande pintado voa em arco, racha e explode.
    const u = janela(ms, 40, p.contato - 40)
    if (u !== null) {
      const q = voo(s.mao, s.centro, u, 20)
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(u * 6)
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(0, 0, 7, 9, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff6e0'; ctx.beginPath(); ctx.ellipse(0, 0, 5.8, 7.8, 0, 0, Math.PI * 2); ctx.fill()
      for (const [x, y] of [[-2, -3], [2.4, 1], [-1, 4]] as const) { ctx.fillStyle = '#e07040'; ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill() }
      ctx.restore()
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 15)
    estilhacos(ctx, s.centro, s.c.pedir(6), 26, t, { ...s.pele, meio: '#fff6e0', base: '#e07040' }, rngSemeado(s.semente + 2))
    nuvem(ctx, s.centro, t, s.c.pedir(4), 14, PELES.NORMAL, rngSemeado(s.semente + 3), .7, 6)
  },

  /** "Launches a hard-packed mud ball. May lower the target's accuracy." */
  mud_bomb(p, s) {
    const { ctx, ms } = s.c
    // Bola de lama em arco; ESPIRRA e deixa manchas de lama grudadas no alvo (cega).
    const u = janela(ms, 40, p.contato - 40)
    if (u !== null) bola(ctx, voo(s.mao, s.centro, u, 16), 6.4, s.pele)
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 9)
    const k = saida(limitar(t / .15)) * (1 - entrada(limitar((t - .7) / .3)))
    for (const [x, y, r] of [[-4, -6, 3.4], [5, -2, 2.6], [-1, 4, 2.2]] as const) {
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(s.centro.x + x, s.centro.y + y + 3 * t, (r + 1.2) * k, (r + .8) * k, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = s.pele.base; ctx.beginPath(); ctx.ellipse(s.centro.x + x, s.centro.y + y + 3 * t, r * k, (r - .4) * k, 0, 0, Math.PI * 2); ctx.fill()
    }
    estilhacos(ctx, s.centro, s.c.pedir(4), 20, t, s.pele, rngSemeado(s.semente + 2))
  },

  /** "Attacks by spraying ink in the target's face or eyes. May lower accuracy." */
  octazooka(p, s) {
    const { ctx, ms } = s.c
    // Bala de TINTA preta que estoura na cara do alvo: borrão de tinta escorrendo.
    const u = janela(ms, 30, p.contato - 30)
    if (u !== null) {
      const q = voo(s.mao, s.centro, saida(u))
      bola(ctx, q, 5.4, s.pele, TINTA, '#4a3a5a')
      rastro(ctx, s.mao, q, s.c.pedir(2), 3, s.pele, rngSemeado(s.semente + 1))
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    estrelaDeImpacto(ctx, s.centro, 8, t, s.pele, rngSemeado(s.semente + 50))
    const k = saida(limitar(t / .15)) * (1 - entrada(limitar((t - .75) / .25)))
    if (k > .05) {
      ctx.fillStyle = TINTA; ctx.beginPath(); ctx.ellipse(s.centro.x, s.centro.y - 4, 9 * k, 6 * k, 0, 0, Math.PI * 2); ctx.fill()
      for (const x of [-5, 0, 4]) { const h = 4 + 10 * t * (x === 0 ? 1.3 : 1); ctx.fillRect(s.centro.x + x - 1, s.centro.y - 4, 2.2 * k, h * k) }
      ctx.fillStyle = '#4a3a5a'; ctx.fillRect(s.centro.x - 4, s.centro.y - 7, 3 * k, 2 * k)
    }
  },

  /** "Whirls its fists to send a wave of pure vacuum. This move always goes first." */
  vacuum_wave(p, s) {
    const { ctx, ms } = s.c
    // Punhos giram (círculo de riscos na mão) e sai uma onda de VÁCUO: anéis
    // transparentes (só contorno) que correm até o alvo bem rápido.
    const gira = janela(ms, 0, 70)
    if (gira !== null) crescente(ctx, s.mao, 6, ms / 15, ms / 15 + 4, 2, .5, 0, s.pele, 1)
    for (let k = 0; k < 3; k++) {
      const u = janela(ms, 30 + k * 18, p.contato - 30)
      if (u === null) continue
      const q = voo(s.mao, s.centro, saida(u))
      const a = Math.atan2(s.uy, s.ux)
      ctx.strokeStyle = ESCURO; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.ellipse(q.x, q.y, 3 + k, 8 - k, a, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = BRANCO; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.ellipse(q.x, q.y, 3 + k, 8 - k, a, 0, Math.PI * 2); ctx.stroke()
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 9)
  },
}

const ACENTOS: Record<string, string[]> = {
  energy_ball: [AZUL], aura_sphere: [AZUL], focus_blast: [LARANJA, AMARELO], weather_ball: ['#e8f4ff', LARANJA, AZUL],
  mist_ball: [ROSA, AZUL], seed_bomb: ['#a0703a', '#d8a46a', PELES.GROUND.base, PELES.GROUND.meio, PELES.GROUND.contorno],
  egg_bomb: ['#fff6e0', '#e07040'], octazooka: [TINTA, '#4a3a5a'],
}

export const ESFERAS_POR_GOLPE = montarFamilia(PERFIS_DE_ESFERA, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim,
  contato: p => p.contato,
  alcance: 56,
  margem: () => ({ cima: 64, baixo: 56, lados: 56 }),
  pele: id => ACENTOS[id] ? comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...ACENTOS[id]) : undefined,
})
