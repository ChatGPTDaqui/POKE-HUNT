// Família Explosão (09/10) + "Explosão Elemental" do nível 50 nos cinco tipos
// cujo golpe de área 70 dividia o desenho com a vitrine (Heat Wave, Surf,
// Discharge, Petal Blizzard, Hyper Voice). Cada golpe a partir da descrição
// do jogo (frase no comentário).
import { getAbility } from '@/data/abilities'
import { emitirParticulas } from '../particulas'
import { PELES } from '../paletas'
import { crescente, entrada, estilhacos, estrelaDeImpacto, limitar, pontosDeRaio, riscos, saida, tracarRaio } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { interior, noChao } from './comum'
import { BRANCO, ESCURO, bola, brilho, comAcento, entrePontos, janela, montarFamilia, nuvem, poligono, setasDeStatus } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_EXPLOSAO: Record<string, Perfil> = {
  overheat: { contato: 300, fim: 380 },
  burn_up: { contato: 300, fim: 420 },
  inferno: { contato: 260, fim: 380 },
}
export const PERFIS_DE_EXPLOSAO_EM_AREA: Record<string, Perfil> = {
  self_destruct: { contato: 260, fim: 440 },
  lava_plume: { contato: 220, fim: 420 },
  aoe50_fire: { contato: 200, fim: 380 },
  aoe50_water: { contato: 200, fim: 380 },
  aoe50_electric: { contato: 200, fim: 360 },
  aoe50_grass: { contato: 200, fim: 380 },
  aoe50_normal: { contato: 200, fim: 360 },
}

const AZUL = '#58a6f0', CINZA = ['#3e3844', '#5e5766', '#8a8494'] as const

interface Cena { c: ContextoVfx; pele: Pele; semente: number; ux: number; uy: number; contato: number; centro: Ponto }
function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy) || 1
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), ux: dx / L, uy: dy / L, contato: p.contato, centro: { x: c.alvo.x, y: c.alvo.y - 3 } }
}
function choque(s: Cena, t: number, tamanho: number, ponto = s.centro): void {
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier * 1.2, t, s.pele, rngSemeado(s.semente + 50))
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 16 + s.c.tier * 3, t, s.pele.meio, rngSemeado(s.semente + 51))
}

/** Língua de fogo de base em `p`, altura `h`. */
function labareda(ctx: CanvasRenderingContext2D, p: Ponto, h: number, w: number, pele: Pele, balanca: number): void {
  if (h < 1) return
  for (const [k, cor] of [[1.25, pele.contorno], [1, pele.base], [.6, pele.meio], [.3, pele.nucleo]] as const) {
    ctx.fillStyle = cor; ctx.beginPath(); ctx.moveTo(p.x - w * k, p.y)
    ctx.quadraticCurveTo(p.x - w * k * .6 + balanca, p.y - h * k * .6, p.x + balanca * 1.4, p.y - h * k)
    ctx.quadraticCurveTo(p.x + w * k * .6 + balanca, p.y - h * k * .5, p.x + w * k, p.y); ctx.closePath(); ctx.fill()
  }
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "Attacks at full power. The recoil harshly lowers the user's Sp. Atk." */
  overheat(p, s) {
    const { ctx, ms, origem } = s.c
    // Superaquecido: quem ataca fica BRANCO de calor (aura que clareia), solta
    // um cone de fogo enorme — e depois fumega, com duas setas azuis.
    const aquece = janela(ms, 0, p.contato)
    if (aquece !== null) {
      const r = 8 + 6 * aquece
      crescente(ctx, origem, r, -Math.PI, Math.PI, 3, .5, 0, { ...s.pele, meio: aquece > .6 ? s.pele.nucleo : s.pele.meio }, 1)
      emitirParticulas(ctx, s.pele, { x: origem.x, y: origem.y + 6 }, s.c.pedir(3 + s.c.tier), 10, (aquece * 1.6) % 1, 4, rngSemeado(s.semente + 1))
    }
    const cone = janela(ms, p.contato - 120, 220)
    if (cone !== null) for (let k = 0; k < 6; k++) {
      const v = limitar(cone * 1.4 - k * .1)
      if (v <= 0 || v >= 1) continue
      const q = entrePontos(origem, s.centro, v)
      bola(ctx, q, 4 + v * 7, s.pele, k % 2 ? s.pele.base : s.pele.meio, s.pele.nucleo)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 15)
    emitirParticulas(ctx, s.pele, s.centro, s.c.pedir(6 + s.c.tier), 24, t, 6, rngSemeado(s.semente + 2))
    nuvem(ctx, { x: origem.x, y: origem.y - 6 }, t, s.c.pedir(4), 8, s.pele, rngSemeado(s.semente + 3), .6, 12, CINZA[1], CINZA[2])
    if (t > .3) setasDeStatus(ctx, origem, (t - .3) / .7, AZUL, 2, true)
  },

  /** "The user burns itself out. After using this move, the user will no longer be Fire type." */
  burn_up(p, s) {
    const { ctx, ms, origem } = s.c
    // Queima TUDO o que tem: labaredas enormes saem de quem ataca até o alvo...
    // e no fim o fogo dele se apaga: só fumaça cinza e brasas mortas.
    const queima = janela(ms, 0, p.contato + 120)
    if (queima !== null) {
      const k = saida(limitar(ms / 120)) * (1 - entrada(limitar((ms - p.contato) / 120)))
      for (let i = -1; i <= 1; i++) labareda(ctx, { x: origem.x + i * 7, y: origem.y + 10 }, (18 + (i === 0 ? 8 : 0)) * k, 6, s.pele, Math.sin(ms / 40 + i) * 2)
    }
    const vai = janela(ms, p.contato - 130, 150)
    if (vai !== null) for (let k = 0; k < 5; k++) {
      const v = limitar(vai * 1.3 - k * .08)
      if (v > 0 && v < 1) bola(ctx, entrePontos(origem, s.centro, v), 5 + k, s.pele, s.pele.base, s.pele.meio)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 15)
    emitirParticulas(ctx, s.pele, s.centro, s.c.pedir(6), 24, t, 6, rngSemeado(s.semente + 2))
    nuvem(ctx, { x: origem.x, y: origem.y - 2 }, t, s.c.pedir(6), 10, s.pele, rngSemeado(s.semente + 3), .6, 14, CINZA[0], CINZA[1])
    for (let k = 0; k < 4; k++) { const v = (t + k * .25) % 1; ctx.fillStyle = CINZA[2]; ctx.fillRect(origem.x + (k - 1.5) * 5, origem.y + 8 - v * 4, 1.6, 1.6) }
  },

  /** "Attacks by engulfing the target in an intense fire. This leaves the target with a burn." */
  inferno(p, s) {
    const { ctx, ms, alvo } = s.c
    // Um anel de chamas se FECHA em volta do alvo e vira uma fogueira que o
    // engole; fica a marquinha de queimadura.
    const fecha = janela(ms, 0, p.contato + p.fim * .7)
    if (fecha !== null) {
      const r = 22 - 14 * saida(limitar(ms / p.contato)), k = 1 - entrada(limitar((ms - p.contato - p.fim * .3) / (p.fim * .4)))
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + ms / 300
        const q = { x: alvo.x + Math.cos(a) * r, y: alvo.y + 10 + Math.sin(a) * r * .4 }
        labareda(ctx, q, (12 + (i % 3) * 3 + (ms > p.contato ? 10 : 0)) * k, 4, s.pele, Math.sin(ms / 40 + i) * 1.5)
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 12)
    if (t > .5) labareda(ctx, { x: alvo.x + 9, y: alvo.y - 10 }, 5, 2.2, s.pele, 0)
  },
}

const GOLPES_EM_AREA: Record<string, (p: Perfil, c: ContextoVfx, semente: number) => void> = {
  /** "Attacks everything around it by causing an explosion. The user faints upon using this move." */
  self_destruct(p, c, semente) {
    const { ctx, ms, origem, raio, tier } = c
    // Quem ataca pisca branco e INCHA… e explode numa cúpula que cobre a área;
    // depois sobra fumaça e quem explodiu fica desmaiado (espiral).
    const incha = janela(ms, 0, p.contato)
    if (incha !== null && Math.floor(ms / (90 - 60 * incha)) % 2) {
      ctx.fillStyle = BRANCO; ctx.beginPath(); ctx.arc(origem.x, origem.y - 2, 9 + 5 * incha, 0, Math.PI * 2); ctx.fill()
    }
    const t = janela(ms, p.contato, p.fim)
    if (t === null) return
    const r = raio * saida(limitar(t / .35))
    ctx.save(); ctx.translate(origem.x, origem.y + 12); ctx.scale(1, .45)
    for (const [k, cor] of [[1, ESCURO], [.95, c.pele.base], [.7, c.pele.meio], [.4, BRANCO]] as const) {
      const rr = r * k * (1 - entrada(limitar((t - .45) / .55)))
      if (rr > 1) { ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill() }
    }
    ctx.restore()
    estilhacos(ctx, { x: origem.x, y: origem.y + 4 }, c.pedir(8 + tier), raio * .9, t, PELES.ROCK, rngSemeado(semente + 1))
    nuvem(ctx, { x: origem.x, y: origem.y + 10 }, limitar((t - .3) / .7), c.pedir(8), raio * .5, c.pele, rngSemeado(semente + 2), .45, 10, CINZA[1], CINZA[2])
    if (t > .6) crescente(ctx, { x: origem.x, y: origem.y - 14 }, 5, t * 14, t * 14 + 5, 1.6, .5, 0, c.pele, .6)
  },

  /** "Torches everything around it in an inferno of scarlet flames. May burn." */
  lava_plume(p, c) {
    const { ctx, ms, origem, raio, tier } = c
    // Jatos de lava escarlate brotam do chão por toda a área, cuspindo gotas
    // incandescentes que caem de volta.
    interior(origem, raio, Math.min(9 + tier * 2, 14), .4).forEach(({ p: q, d }, i) => {
      const t = janela(ms, p.contato - 140 + (d / raio) * 150, 300)
      if (t === null) return
      const h = 26 * Math.sin(Math.min(1, t * 1.3) * Math.PI)
      labareda(ctx, q, h, 5, { ...c.pele, base: '#c81e10' }, Math.sin(ms / 40 + i) * 1.5)
      for (let k = 0; k < 2; k++) {
        const u = limitar(t * 1.4 - k * .2), x = q.x + (k ? 6 : -6) * u, y = q.y - h * .8 - 10 * Math.sin(u * Math.PI) + 8 * u
        if (u > 0 && u < 1) bola(ctx, { x, y }, 1.8, c.pele, '#c81e10', c.pele.nucleo)
      }
    })
  },

  aoe50_fire(p, c) { novaElemental(p, c, 'fogo') },
  aoe50_water(p, c) { novaElemental(p, c, 'agua') },
  aoe50_electric(p, c) { novaElemental(p, c, 'raio') },
  aoe50_grass(p, c) { novaElemental(p, c, 'folha') },
  aoe50_normal(p, c) { novaElemental(p, c, 'choque') },
}

/**
 * "Explosão Elemental" (golpe de área do nível 50, conteúdo próprio do jogo):
 * o elemento EXPLODE de quem ataca em todas as direções. Uma frente de onda
 * do tipo varre a área do centro até a borda e deixa o elemento no interior.
 */
function novaElemental(p: Perfil, c: ContextoVfx, el: 'fogo' | 'agua' | 'raio' | 'folha' | 'choque'): void {
  const { ctx, ms, origem, raio, tier } = c
  const semente = Math.floor(c.rng() * 0xffffffff)
  const carrega = janela(ms, 0, p.contato)
  if (carrega !== null) bola(ctx, { x: origem.x, y: origem.y - 4 }, 3 + 6 * saida(carrega), c.pele, c.pele.meio, c.pele.nucleo)
  const t = janela(ms, p.contato, p.fim)
  if (t === null) return
  const r = raio * saida(limitar(t / .5))
  ctx.save(); ctx.translate(origem.x, origem.y + 12); ctx.scale(1, .45)
  crescente(ctx, { x: 0, y: 0 }, Math.max(4, r), -Math.PI, Math.PI, 8 * (1 - entrada(t)) + 1, .5, 0, c.pele, 1)
  ctx.restore()
  const pts = interior(origem, raio, Math.min(10 + tier * 2, 16), 1.1)
  pts.forEach(({ p: q, d }, i) => {
    const tk = limitar((t - (d / raio) * .45) / .5)
    if (tk <= 0 || tk >= 1) return
    const rng = rngSemeado(semente + i)
    switch (el) {
      case 'fogo': labareda(ctx, q, 16 * Math.sin(tk * Math.PI), 4, c.pele, Math.sin(ms / 40 + i) * 1.5); break
      case 'agua': for (let k = 0; k < 3; k++) bola(ctx, { x: q.x + (k - 1) * 4, y: q.y - 14 * Math.sin(tk * Math.PI) * (1 - Math.abs(k - 1) * .3) }, 2.2, c.pele); break
      case 'raio': tracarRaio(ctx, pontosDeRaio({ x: q.x, y: q.y - 22 }, q, 4, 2, rng), 1.6 * (1 - tk), c.pele); break
      case 'folha': {
        ctx.save(); ctx.translate(q.x, q.y - 12 * tk); ctx.rotate(tk * 6 + i)
        poligono(ctx, [[-4.4, 0], [0, -2.4], [4.4, 0], [0, 2.4]], ESCURO); poligono(ctx, [[-3.4, 0], [0, -1.4], [3.4, 0], [0, 1.4]], c.pele.meio)
        ctx.restore()
        break
      }
      case 'choque': estrelaDeImpacto(ctx, { x: q.x, y: q.y - 6 }, 6, tk, c.pele, rng); break
    }
  })
  if (el === 'choque' || el === 'raio') for (let k = 0; k < 3; k++) brilho(ctx, ...((): [number, number] => { const q = noChao(origem, k * 2.1 + t * 3, raio * .5); return [q.x, q.y - 8] })(), 3 * (1 - t), BRANCO)
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'FIRE'], AZUL, ...CINZA, '#c81e10',
  PELES.ROCK.contorno, PELES.ROCK.base, PELES.ROCK.meio, PELES.ROCK.nucleo)

export const EXPLOSOES_POR_GOLPE = montarFamilia(PERFIS_DE_EXPLOSAO, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 56,
  margem: () => ({ cima: 66, baixo: 56, lados: 56 }), pele: peleDe,
})
export const EXPLOSOES_EM_AREA_POR_GOLPE = montarFamilia(PERFIS_DE_EXPLOSAO_EM_AREA, {
  desenhar: (p, c, id) => GOLPES_EM_AREA[id](p, c, Math.floor(c.rng() * 0xffffffff)),
  duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 36, pele: peleDe,
  margem: () => ({ cima: 34, baixo: 24, lados: 26 }),
})
