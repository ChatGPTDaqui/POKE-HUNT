// Família Nuvem, pó e assombração (09/10): nove golpes a partir da descrição
// do jogo (frase no comentário). Powder Snow é de ÁREA.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { crescente, entrada, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { interior } from './comum'
import { BRANCO, ESCURO, bola, brilho, comAcento, entrePontos, janela, montarFamilia, nuvem, poligono, setasDeStatus } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_NEVOA: Record<string, Perfil> = {
  smog: { contato: 220, fim: 380 },
  clear_smog: { contato: 220, fim: 340 },
  venoshock: { contato: 220, fim: 340 },
  astonish: { contato: 180, fim: 300 },
  hex: { contato: 260, fim: 320 },
  night_shade: { contato: 300, fim: 340 },
  ominous_wind: { contato: 220, fim: 360 },
  silver_wind: { contato: 220, fim: 360 },
}
export const PERFIS_DE_NEVOA_EM_AREA: Record<string, Perfil> = {
  powder_snow: { contato: 200, fim: 380 },
}

const VERMELHO = '#e0303a', AZUL = '#58a6f0', PRATA = ['#d0d8e6', '#f4f8ff'] as const
const ARCO_IRIS = ['#e0303a', '#ff9a3a', '#ffd23a', '#5cd65c', '#58a6f0']

interface Cena { c: ContextoVfx; pele: Pele; semente: number; ux: number; uy: number; contato: number; centro: Ponto }
function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy) || 1
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), ux: dx / L, uy: dy / L, contato: p.contato, centro: { x: c.alvo.x, y: c.alvo.y - 3 } }
}
function choque(s: Cena, t: number, tamanho: number, ponto = s.centro): void {
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier * 1.2, t, s.pele, rngSemeado(s.semente + 50))
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 16 + s.c.tier * 3, t, s.pele.meio, rngSemeado(s.semente + 51))
}

/** Rajada de vento: faixas curvas que correm de quem ataca até o alvo. */
function ventania(s: Cena, ms: number, ini: number, dura: number, cor: string): void {
  for (let k = 0; k < 4; k++) {
    const u = janela(ms, ini + k * 30, dura)
    if (u === null) continue
    const q = entrePontos(s.c.origem, s.centro, saida(u))
    const a = Math.atan2(s.uy, s.ux), off = (k - 1.5) * 6
    crescente(s.c.ctx, { x: q.x - s.uy * off, y: q.y + s.ux * off }, 10, a - .9, a + .9, 2.4, .55, 0, { ...s.pele, meio: cor }, 1)
  }
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "Attacked with a discharge of filthy gases. May poison the target." */
  smog(p, s) {
    const { ctx, ms, origem } = s.c
    // Gás imundo: baforadas roxo-cinzentas que rolam até o alvo e o ENCOBREM.
    for (let k = 0; k < 4; k++) {
      const u = janela(ms, k * 40, p.contato)
      if (u !== null) nuvem(ctx, entrePontos({ x: origem.x + s.ux * 8, y: origem.y - 4 }, s.centro, saida(u)), .5, 3, 4, s.pele, rngSemeado(s.semente + k), .8, 0, PELES.STEEL.base, s.pele.meio)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    nuvem(ctx, s.centro, limitar(t * .8), s.c.pedir(8), 14, s.pele, rngSemeado(s.semente + 9), .8, 3, PELES.STEEL.base, s.pele.meio)
    for (let k = 0; k < 3; k++) { const sobe = (t * 1.4 + k * .3) % 1; bola(ctx, { x: s.centro.x + (k - 1) * 7, y: s.centro.y + 4 - sobe * 16 }, 2 * (1 - sobe), s.pele) }
  },

  /** "Throws a clump of special mud. All stat changes are returned to normal." */
  clear_smog(p, s) {
    const { ctx, ms } = s.c
    // Bolo de lama especial voa, estoura numa névoa BRANCA, e as setas de
    // status do alvo (sobe/desce) se apagam.
    const u = janela(ms, 30, p.contato - 30)
    if (u !== null) {
      const q = entrePontos({ x: s.c.origem.x + s.ux * 8, y: s.c.origem.y - 4 }, s.centro, u)
      q.y -= Math.sin(u * Math.PI) * 12
      bola(ctx, q, 5, s.pele, PELES.GROUND.base, PELES.GROUND.meio)
    }
    const setas = janela(ms, 0, p.contato + 100)
    if (setas !== null) {
      const some = 1 - limitar((ms - p.contato) / 100)
      if (some > .1) { setasDeStatus(ctx, { x: s.centro.x - 5, y: s.centro.y }, .4, VERMELHO, 1); setasDeStatus(ctx, { x: s.centro.x + 5, y: s.centro.y }, .4, AZUL, 1, true) }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) nuvem(ctx, s.centro, t, s.c.pedir(7), 14, s.pele, rngSemeado(s.semente + 2), .8, 4, PRATA[0], BRANCO)
  },

  /** "Drenches the target in a special poisonous liquid. Power doubles if the target is poisoned." */
  venoshock(p, s) {
    const { ctx, ms } = s.c
    // Banho de veneno: uma onda de líquido roxo cai de cima e ENCHARCA o alvo,
    // escorrendo em pingos.
    const cai = janela(ms, 60, p.contato - 60)
    if (cai !== null) for (let k = 0; k < 7; k++) {
      const x = s.centro.x + (k - 3) * 3.6, y = s.centro.y - 34 + 30 * entrada(cai) - Math.abs(k - 3) * 2
      bola(ctx, { x, y }, 3.4, s.pele)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 9)
    for (let k = 0; k < 6; k++) {
      const v = (t * 1.3 + k * .15) % 1
      bola(ctx, { x: s.centro.x + (k - 2.5) * 4, y: s.centro.y - 4 + v * 18 }, 2 * (1 - v), s.pele)
    }
    ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(s.centro.x, s.c.alvo.y + 11, 12 * saida(limitar(t * 2)), 3, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = s.pele.base; ctx.beginPath(); ctx.ellipse(s.centro.x, s.c.alvo.y + 11, 10 * saida(limitar(t * 2)), 2, 0, 0, Math.PI * 2); ctx.fill()
  },

  /** "Attacks the target while shouting in a startling fashion. May make the target flinch." */
  astonish(p, s) {
    const { ctx, ms } = s.c
    // BUU! Uma cara de fantasma de boca escancarada salta do lado do alvo com
    // linhas de grito; o alvo se assusta.
    const salta = janela(ms, 40, p.contato + 160)
    if (salta !== null) {
      const k = saida(limitar(salta / .3)) * (1 - entrada(limitar((salta - .7) / .3)))
      const q = { x: s.centro.x - s.ux * 14, y: s.centro.y - 10 }
      ctx.save(); ctx.translate(q.x, q.y); ctx.scale(k, k)
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = s.pele.meio; ctx.beginPath(); ctx.arc(0, 0, 8.6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(0, 3, 4, 4.6, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = VERMELHO; ctx.fillRect(-1.4, 5, 2.8, 1.6)
      for (const x of [-4, 4]) { ctx.fillStyle = BRANCO; ctx.fillRect(x - 1.6, -4, 3.2, 3.2); ctx.fillStyle = ESCURO; ctx.fillRect(x - .6, -3, 1.4, 1.4) }
      ctx.restore()
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * .6 + Math.atan2(s.uy, s.ux) * 0
        poligono(ctx, [[q.x + Math.cos(a) * 12 * k, q.y + Math.sin(a) * 12 * k], [q.x + Math.cos(a + .1) * 18 * k, q.y + Math.sin(a + .1) * 18 * k], [q.x + Math.cos(a - .1) * 18 * k, q.y + Math.sin(a - .1) * 18 * k]], BRANCO)
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 8)
    const k = 1 - limitar((t - .5) / .5)
    if (k > 0) for (const dx of [-6, 0, 6]) poligono(ctx, [[s.c.alvo.x + dx - 1, s.c.alvo.y - 16], [s.c.alvo.x + dx + 1, s.c.alvo.y - 16], [s.c.alvo.x + dx * 1.4 + .6, s.c.alvo.y - 16 - 7 * k], [s.c.alvo.x + dx * 1.4 - .6, s.c.alvo.y - 16 - 7 * k]], ESCURO)
  },

  /** "This relentless attack does massive damage to a target affected by status conditions." */
  hex(p, s) {
    const { ctx, ms, alvo } = s.c
    // Maldição: um círculo de feitiço com um OLHO no meio se abre no chão do
    // alvo, chamas roxas sobem dele e se fecham em cima.
    const chao = { x: alvo.x, y: alvo.y + 11 }
    const abre = janela(ms, 0, p.contato + p.fim * .6)
    if (abre !== null) {
      const r = 16 * saida(limitar(ms / 160)) * (1 - limitar((ms - p.contato - p.fim * .3) / (p.fim * .3)))
      if (r > 1) {
        for (const [w, cor] of [[3, ESCURO], [1.4, s.pele.meio]] as const) {
          ctx.strokeStyle = cor; ctx.lineWidth = w
          ctx.beginPath(); ctx.ellipse(chao.x, chao.y, r, r * .35, 0, 0, Math.PI * 2); ctx.stroke()
          ctx.beginPath(); ctx.ellipse(chao.x, chao.y, r * .6, r * .2, 0, 0, Math.PI * 2); ctx.stroke()
        }
        ctx.fillStyle = s.pele.nucleo; ctx.beginPath(); ctx.ellipse(chao.x, chao.y, r * .3, r * .11, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = ESCURO; ctx.fillRect(chao.x - 1, chao.y - 1, 2, 2)
      }
    }
    const sobe = janela(ms, p.contato - 100, p.fim)
    if (sobe !== null) for (let k = 0; k < 5; k++) {
      const x = chao.x + (k - 2) * 6, h = (10 + (k % 2) * 6) * Math.sin(Math.min(1, sobe * 1.4) * Math.PI)
      poligono(ctx, [[x - 3.4, chao.y], [x + 3.4, chao.y], [x + Math.sin(ms / 50 + k) * 2, chao.y - h - 2]], ESCURO)
      poligono(ctx, [[x - 2.4, chao.y], [x + 2.4, chao.y], [x + Math.sin(ms / 50 + k) * 2, chao.y - h]], s.pele.meio)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 10)
  },

  /** "Makes the target see a frightening mirage. Damage equal to the user's level." */
  night_shade(p, s) {
    const { ctx, ms, alvo } = s.c
    // Miragem assustadora: uma sombra GIGANTE de olhos vermelhos se ergue
    // atrás do alvo e se debruça sobre ele.
    const ergue = janela(ms, 0, p.contato + p.fim * .6)
    if (ergue !== null) {
      const h = saida(limitar(ms / p.contato)), some = 1 - entrada(limitar((ms - p.contato) / (p.fim * .6)))
      const base = { x: alvo.x + s.ux * 12, y: alvo.y + 8 }
      const alto = 32 * h * some, largo = 13 * some
      if (alto > 2) {
        ctx.fillStyle = ESCURO
        ctx.beginPath(); ctx.moveTo(base.x - largo, base.y)
        ctx.quadraticCurveTo(base.x - largo * 1.2, base.y - alto, base.x - s.ux * 8, base.y - alto - 6)
        ctx.quadraticCurveTo(base.x + largo * 1.2, base.y - alto, base.x + largo, base.y); ctx.closePath(); ctx.fill()
        for (const d of [-1, 1]) {
          const ox = base.x - s.ux * 6 + d * 5, oy = base.y - alto + 4
          poligono(ctx, [[ox - 3, oy], [ox + 3, oy - 1.4 * d], [ox + 2, oy + 2], [ox - 2, oy + 2]], VERMELHO)
        }
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 10)
  },

  /** "Blasts the target with a gust of repulsive wind. May raise all the user's stats." */
  ominous_wind(p, s) {
    const { ctx, ms, origem } = s.c
    // Vento repulsivo roxo-escuro com fiapos de alma (fantasminhas) no meio.
    ventania(s, ms, 0, p.contato, s.pele.base)
    for (let k = 0; k < 3; k++) {
      const u = janela(ms, 40 + k * 50, p.contato - 40)
      if (u === null) continue
      const q = entrePontos(origem, s.centro, saida(u))
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(q.x, q.y - 4 + k * 4, 3.6, Math.PI, 0); ctx.lineTo(q.x + 3.6, q.y + 2 + k * 4); ctx.lineTo(q.x - 3.6, q.y + 2 + k * 4); ctx.fill()
      ctx.fillStyle = s.pele.nucleo; ctx.beginPath(); ctx.arc(q.x, q.y - 4 + k * 4, 2.4, Math.PI, 0); ctx.lineTo(q.x + 2.4, q.y + 1 + k * 4); ctx.lineTo(q.x - 2.4, q.y + 1 + k * 4); ctx.fill()
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 9)
    ARCO_IRIS.forEach((cor, k) => setasDeStatus(ctx, { x: origem.x + (k - 2) * 7, y: origem.y }, limitar(t * 1.2 - k * .05), cor, 1))
  },

  /** "Attacked with powdery scales blown by the wind. May raise all the user's stats." */
  silver_wind(p, s) {
    const { ctx, ms, origem } = s.c
    // Vento prateado carregando ESCAMAS de pó cintilantes de borboleta.
    ventania(s, ms, 0, p.contato, PRATA[0])
    const rng = rngSemeado(s.semente + 1)
    for (let k = 0; k < 8; k++) {
      const u = janela(ms, rng() * 120, p.contato)
      const dy = (rng() - .5) * 16
      if (u === null) continue
      const q = entrePontos(origem, s.centro, saida(u))
      if (Math.floor(ms / 60 + k) % 2) brilho(ctx, q.x, q.y + dy, 2, PRATA[1])
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 9)
    ARCO_IRIS.forEach((cor, k) => setasDeStatus(ctx, { x: origem.x + (k - 2) * 7, y: origem.y }, limitar(t * 1.2 - k * .05), cor, 1))
  },
}

/** "Attacks with a chilling gust of powdery snow. May freeze the opposing Pokémon." (área) */
function powderSnow(p: Perfil, c: ContextoVfx): void {
  const { ctx, ms, origem, raio, tier } = c
  const semente = Math.floor(c.rng() * 0xffffffff)
  // Rajada de neve em pó: flocos rodopiando por TODA a área (do centro pra
  // borda), alguns pousando e virando cristalzinho de gelo.
  const pts = interior(origem, raio, Math.min(14 + tier * 3, 22), .3)
  pts.forEach(({ p: q, d }, i) => {
    const ini = (d / raio) * 140
    const t = janela(ms, ini, p.contato + p.fim - ini - 20)
    if (t === null) return
    const cai = { x: q.x + Math.sin(ms / 90 + i) * 6, y: q.y - 22 * (1 - t) - 4 }
    const s = 1.8 * (1 - entrada(limitar((t - .8) / .2)))
    if (s > .3) {
      ctx.strokeStyle = ESCURO; ctx.lineWidth = 2
      for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3 + ms / 200; ctx.beginPath(); ctx.moveTo(cai.x - Math.cos(a) * 2.6 * s, cai.y - Math.sin(a) * 2.6 * s); ctx.lineTo(cai.x + Math.cos(a) * 2.6 * s, cai.y + Math.sin(a) * 2.6 * s); ctx.stroke() }
      ctx.strokeStyle = BRANCO; ctx.lineWidth = .9
      for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3 + ms / 200; ctx.beginPath(); ctx.moveTo(cai.x - Math.cos(a) * 2.4 * s, cai.y - Math.sin(a) * 2.4 * s); ctx.lineTo(cai.x + Math.cos(a) * 2.4 * s, cai.y + Math.sin(a) * 2.4 * s); ctx.stroke() }
    }
  })
  const t = janela(ms, p.contato, p.fim)
  if (t !== null) nuvem(ctx, { x: origem.x, y: origem.y + 10 }, t, c.pedir(6), raio * .55, c.pele, rngSemeado(semente + 2), .45, 4, c.pele.nucleo, BRANCO)

}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'GHOST'], VERMELHO, AZUL, ...PRATA, ...ARCO_IRIS,
  PELES.STEEL.base, PELES.GROUND.base, PELES.GROUND.meio)

export const NEVOAS_POR_GOLPE = montarFamilia(PERFIS_DE_NEVOA, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 56,
  margem: () => ({ cima: 66, baixo: 56, lados: 56 }), pele: peleDe,
})
export const NEVOAS_EM_AREA_POR_GOLPE = montarFamilia(PERFIS_DE_NEVOA_EM_AREA, {
  desenhar: powderSnow, duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 34, pele: peleDe,
})
