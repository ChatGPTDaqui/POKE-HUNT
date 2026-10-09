// Tremor de chão, Onda e maré, e os três feixes que faltavam (09/10), cada
// golpe a partir da descrição do jogo (frase no comentário). Magnitude, Muddy
// Water e Origin Pulse são de ÁREA.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { crescente, entrada, estilhacos, estrelaDeImpacto, limitar, pontosDeRaio, riscos, saida, tracarRaio } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { interior, noChao } from './comum'
import { BRANCO, ESCURO, bola, brilho, comAcento, corda, entrePontos, estatica, janela, montarFamilia, nuvem, poligono } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_ONDA: Record<string, Perfil> = {
  grass_knot: { contato: 220, fim: 320 },
  waterfall: { contato: 260, fim: 300 },
  freeze_dry: { contato: 260, fim: 360 },
  mirror_shot: { contato: 220, fim: 300 },
  aeroblast: { contato: 280, fim: 300 },
  zap_cannon: { contato: 360, fim: 360 },
}
export const PERFIS_DE_ONDA_EM_AREA: Record<string, Perfil> = {
  magnitude: { contato: 160, fim: 460 },
  muddy_water: { contato: 220, fim: 400 },
  origin_pulse: { contato: 260, fim: 420 },
}

const AZUL_PROFUNDO = ['#1a3ad6', '#5fa8ff', '#d8f0ff'] as const, LAMA = ['#7a5230', '#a87a4a'] as const

interface Cena { c: ContextoVfx; pele: Pele; semente: number; ux: number; uy: number; angulo: number; contato: number; centro: Ponto; mao: Ponto }
function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy) || 1
  const ux = dx / L, uy = dy / L
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), ux, uy, angulo: Math.atan2(uy, ux), contato: p.contato,
    centro: { x: c.alvo.x, y: c.alvo.y - 3 }, mao: { x: c.origem.x + ux * 8, y: c.origem.y - 4 } }
}
function choque(s: Cena, t: number, tamanho: number, ponto = s.centro): void {
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier * 1.2, t, s.pele, rngSemeado(s.semente + 50))
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 16 + s.c.tier * 3, t, s.pele.meio, rngSemeado(s.semente + 51))
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "Snares the target with grass and trips it. The heavier the target, the greater the power." */
  grass_knot(p, s) {
    const { ctx, ms, alvo } = s.c
    // Um laço de capim brota do chão no pé do alvo, se fecha num NÓ e ele
    // tropeça (estrelinha e queda pra frente).
    const pe = { x: alvo.x, y: alvo.y + 10 }
    const brota = janela(ms, 0, p.contato + 80)
    if (brota !== null) {
      const h = 12 * saida(limitar(ms / 140)), fecha = entrada(limitar((ms - 140) / (p.contato - 140)))
      for (const lado of [-1, 1]) {
        const topo = { x: pe.x + lado * 8 * (1 - fecha), y: pe.y - h }
        corda(ctx, [{ x: pe.x + lado * 9, y: pe.y }, { x: pe.x + lado * 10 * (1 - fecha * .5), y: pe.y - h * .6 }, topo], 2, s.pele)
      }
      if (fecha > .9) { ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(pe.x, pe.y - h, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = s.pele.meio; ctx.beginPath(); ctx.arc(pe.x, pe.y - h, 2.2, 0, Math.PI * 2); ctx.fill() }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 9, { x: alvo.x + s.ux * 6, y: alvo.y + 4 })
    nuvem(ctx, { x: alvo.x + s.ux * 8, y: alvo.y + 11 }, t, s.c.pedir(4), 12, PELES.GROUND, rngSemeado(s.semente + 2))
  },

  /** "The user charges at the target and may make it flinch." */
  waterfall(p, s) {
    const { ctx, ms, alvo } = s.c
    // Cachoeira: uma coluna de água despenca do alto sobre o alvo como queda d'água.
    const cai = janela(ms, p.contato - 140, p.fim + 80)
    if (cai !== null) {
      const fim = alvo.y + 10, topo = alvo.y - 46
      const baixo = topo + (fim - topo) * saida(limitar(cai / .3))
      const w = 9 * (1 - entrada(limitar((cai - .6) / .4)))
      if (w > .5) {
        poligono(ctx, [[alvo.x - w - 1.4, topo], [alvo.x + w + 1.4, topo], [alvo.x + w + 1.4, baixo], [alvo.x - w - 1.4, baixo]], s.pele.contorno)
        poligono(ctx, [[alvo.x - w, topo], [alvo.x + w, topo], [alvo.x + w, baixo], [alvo.x - w, baixo]], s.pele.base)
        for (let k = 0; k < 3; k++) {
          const y = topo + ((ms / 3 + k * 18) % (baixo - topo + 1))
          poligono(ctx, [[alvo.x - w * .6 + k * 3, y], [alvo.x - w * .6 + k * 3 + 1.4, y], [alvo.x - w * .6 + k * 3 + 1.4, y + 8], [alvo.x - w * .6 + k * 3, y + 8]], BRANCO)
        }
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 10)
    for (let k = 0; k < Math.min(s.c.pedir(6), 7); k++) {
      const a = -Math.PI / 2 + (k / 6 - .5) * 2.8, v = 18 + (k % 3) * 4
      bola(ctx, { x: alvo.x + Math.cos(a) * v * t, y: alvo.y + 8 + Math.sin(a) * v * t + 30 * t * t }, 2.2 * (1 - limitar((t - .6) / .4)), s.pele)
    }
  },

  /** "Rapidly cools the target. May leave the target frozen. Super effective on Water types." */
  freeze_dry(p, s) {
    const { ctx, ms } = s.c
    // Esfria de repente: gotas em volta do alvo VIRAM gelo no ar, e uma
    // casca de gelo fecha nele por um instante e trinca.
    const rng = rngSemeado(s.semente + 1)
    for (let k = 0; k < 7; k++) {
      const a = rng() * Math.PI * 2, d = 12 + rng() * 6, q = { x: s.centro.x + Math.cos(a) * d, y: s.centro.y + Math.sin(a) * d * .8 }
      const vira = limitar((ms - 60 - k * 20) / 120)
      if (ms > p.contato + 40) continue
      if (vira < 1) bola(ctx, q, 2.2, PELES.WATER)
      else { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(a); poligono(ctx, [[0, -3.4], [2, 0], [0, 3.4], [-2, 0]], ESCURO); poligono(ctx, [[0, -2.4], [1.2, 0], [0, 2.4], [-1.2, 0]], s.pele.nucleo); ctx.restore() }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    const k = saida(limitar(t / .15)) * (1 - entrada(limitar((t - .6) / .2)))
    if (k > .05) {
      poligono(ctx, [[s.centro.x - 13 * k, s.centro.y + 12], [s.centro.x - 11 * k, s.centro.y - 14 * k], [s.centro.x, s.centro.y - 18 * k], [s.centro.x + 11 * k, s.centro.y - 14 * k], [s.centro.x + 13 * k, s.centro.y + 12]], ESCURO)
      poligono(ctx, [[s.centro.x - 11.6 * k, s.centro.y + 11], [s.centro.x - 9.6 * k, s.centro.y - 12.6 * k], [s.centro.x, s.centro.y - 16.4 * k], [s.centro.x + 9.6 * k, s.centro.y - 12.6 * k], [s.centro.x + 11.6 * k, s.centro.y + 11]], s.pele.meio)
      poligono(ctx, [[s.centro.x - 8 * k, s.centro.y - 10 * k], [s.centro.x - 4 * k, s.centro.y - 13 * k], [s.centro.x - 6 * k, s.centro.y + 4]], BRANCO)
    }
    if (t > .55) estilhacos(ctx, s.centro, s.c.pedir(6), 22, (t - .55) / .45, s.pele, rngSemeado(s.semente + 2))
  },

  /** "Lets loose a flash of energy from its polished body. May lower the target's accuracy." */
  mirror_shot(p, s) {
    const { ctx, ms, origem } = s.c
    // Corpo POLIDO: um reflexo corre pelo atacante (brilho em faixa) e sai um
    // flash prateado em losango; o alvo fica ofuscado (estrelinhas nos olhos).
    const lustra = janela(ms, 0, p.contato - 80)
    if (lustra !== null) {
      const x = origem.x - 10 + 20 * lustra
      poligono(ctx, [[x - 1.6, origem.y - 12], [x + 1.6, origem.y - 12], [x - 2.4, origem.y + 8], [x - 5.6, origem.y + 8]], BRANCO)
    }
    const flash = janela(ms, p.contato - 80, 100)
    if (flash !== null) {
      const q = entrePontos(s.mao, s.centro, saida(flash))
      brilho(ctx, q.x, q.y, 9, s.pele.nucleo)
      ctx.strokeStyle = s.pele.meio; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.mao.x, s.mao.y); ctx.lineTo(q.x, q.y); ctx.stroke()
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 10)
    for (let k = 0; k < 3; k++) { const a = ms / 80 + k * 2.1; brilho(s.c.ctx, s.centro.x + Math.cos(a) * 9, s.centro.y - 10 + Math.sin(a) * 3, 2 * (1 - t), BRANCO) }
  },

  /** "A vortex of air is shot at the target. Critical hits land more easily." */
  aeroblast(p, s) {
    const { ctx, ms } = s.c
    // Túnel de vento: espiral de ar girando que avança como um feixe-redemoinho.
    const vai = janela(ms, 40, p.contato - 40 + 120)
    if (vai !== null) {
      const fim = saida(limitar(vai * 1.4))
      for (let k = 0; k < 14; k++) {
        const v = (k / 14) * fim
        const q = entrePontos(s.mao, s.centro, v), a = v * 18 - ms / 30, r = 4 + v * 5
        const x = q.x - s.uy * Math.cos(a) * r, y = q.y + s.ux * Math.cos(a) * r * .8
        bola(ctx, { x, y }, 1.8 + (Math.sin(a) > 0 ? .8 : 0), s.pele, Math.sin(a) > 0 ? BRANCO : s.pele.meio, BRANCO)
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 13)
    crescente(ctx, s.centro, 10 + t * 10, s.angulo - 1.2, s.angulo + 1.2, 3, t, 0, { ...s.pele, meio: BRANCO }, 1)
    if (t < .4) brilho(ctx, s.centro.x + 10, s.centro.y - 12, 4 * (1 - t / .4), '#ffd23a')
  },

  /** "Fires an electric blast like a cannon to inflict damage and cause paralysis." */
  zap_cannon(p, s) {
    const { ctx, ms } = s.c
    // Canhão: a bola elétrica cresce na "boca do canhão" (anéis de carga), sai
    // LENTA e pesada com raios em volta e explode; paralisia garantida.
    const carrega = janela(ms, 0, 160)
    if (carrega !== null) {
      for (let k = 0; k < 2; k++) { const u = (carrega * 2 + k * .5) % 1; crescente(ctx, s.mao, 14 * (1 - u) + 3, -Math.PI, Math.PI, 2, .5, 0, s.pele, 1) }
      bola(ctx, s.mao, 3 + 6 * carrega, s.pele, s.pele.meio, s.pele.nucleo)
    }
    const vai = janela(ms, 160, p.contato - 160)
    if (vai !== null) {
      const q = entrePontos(s.mao, s.centro, vai)
      bola(ctx, q, 10, s.pele, s.pele.meio, s.pele.nucleo)
      const rng = rngSemeado(s.semente + Math.floor(ms / 66))
      for (let k = 0; k < 4; k++) {
        const a = rng() * Math.PI * 2
        tracarRaio(ctx, pontosDeRaio(q, { x: q.x + Math.cos(a) * 18, y: q.y + Math.sin(a) * 15 }, 4, 2, rng), 1.4, s.pele)
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 16)
    estatica(ctx, s.c.alvo, saida(limitar((t - .2) / .2)) * (1 - limitar((t - .85) / .15)), s.pele, s.semente + 90 + Math.floor(ms / 66))
  },
}

const GOLPES_EM_AREA: Record<string, (p: Perfil, c: ContextoVfx, semente: number) => void> = {
  /** "Attacks everything around it with a ground-shaking quake. Its power varies." (área) */
  magnitude(p, c, semente) {
    const { ctx, ms, origem, raio } = c
    // A MAGNITUDE do tremor é sorteada: um medidor de 4 a 10 barras aparece
    // acima de quem ataca e o tanto de anéis/rachaduras segue esse número.
    const nivel = 4 + Math.floor(rngSemeado(semente)() * 7)
    const forca = (nivel - 3) / 7
    const mede = janela(ms, 0, p.contato + p.fim * .5)
    if (mede !== null) for (let k = 0; k < 10; k++) {
      const x = origem.x - 14 + k * 3, h = 2 + k * .8, aceso = k < nivel && ms > k * 14
      poligono(ctx, [[x - .4, origem.y - 22], [x + 2.4, origem.y - 22], [x + 2.4, origem.y - 22 - h], [x - .4, origem.y - 22 - h]], ESCURO)
      if (aceso) poligono(ctx, [[x + .3, origem.y - 22.6], [x + 1.7, origem.y - 22.6], [x + 1.7, origem.y - 21.4 - h], [x + .3, origem.y - 21.4 - h]], k > 7 ? '#e0303a' : k > 5 ? '#ffd23a' : '#5cd65c')
    }
    const t = janela(ms, p.contato, p.fim)
    if (t === null) return
    const aneis = 1 + Math.round(forca * 3)
    for (let k = 0; k < aneis; k++) {
      const u = limitar((t - k * .12) / .7)
      if (u <= 0 || u >= 1) continue
      ctx.save(); ctx.translate(origem.x, origem.y + 12); ctx.scale(1, .45)
      crescente(ctx, { x: 0, y: 0 }, raio * saida(u), -Math.PI, Math.PI, 4 * (1 - u) + 1, .5, 0, c.pele, 1)
      ctx.restore()
    }
    const rng = rngSemeado(semente + 2)
    for (let k = 0; k < 3 + Math.round(forca * 5); k++) {
      const a = rng() * Math.PI * 2, q = noChao(origem, a, raio * (.3 + rng() * .6))
      const tk = limitar(t * 1.4 - k * .05)
      if (tk > 0 && tk < 1) tracarRaio(ctx, pontosDeRaio(noChao(origem, a, raio * .1), q, 6, 2, rng), 2 * (1 - tk), { ...c.pele, meio: c.pele.contorno, nucleo: c.pele.base })
    }
    nuvem(ctx, { x: origem.x, y: origem.y + 12 }, t, c.pedir(5), raio * .5 * forca + 10, c.pele, rngSemeado(semente + 3), .45, 4)
  },

  /** "Shoots muddy water at the opposing Pokémon. May lower their accuracy." (área) */
  muddy_water(p, c) {
    const { ctx, ms, origem, raio, tier } = c
    // Onda de lama marrom que avança em leque pela área inteira, com espirros
    // e manchas de lama ficando no chão.
    const t = janela(ms, 0, p.contato + p.fim)
    if (t === null) return
    const u = saida(limitar(ms / (p.contato + 160)))
    ctx.save(); ctx.translate(origem.x, origem.y + 12); ctx.scale(1, .45)
    for (const [k, cor] of [[1, ESCURO], [.94, LAMA[0]], [.8, LAMA[1]]] as const) {
      const r = raio * u * k * (1 - entrada(limitar((ms - p.contato - p.fim * .5) / (p.fim * .5))) * .4)
      if (r > 2) { ctx.strokeStyle = cor; ctx.lineWidth = 9 * k; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke() }
    }
    ctx.restore()
    interior(origem, raio * u, Math.min(8 + tier * 2, 14), .2).forEach(({ p: q }, i) => {
      const s = limitar((ms - p.contato) / 200) * (1 - limitar((ms - p.contato - p.fim * .7) / (p.fim * .3)))
      if (s > .05) { ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(q.x, q.y, 5 * s + 1, 2 * s + .6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = LAMA[0]; ctx.beginPath(); ctx.ellipse(q.x, q.y, 5 * s, 2 * s, 0, 0, Math.PI * 2); ctx.fill() }
      if (i % 3 === 0) bola(ctx, { x: q.x, y: q.y - 10 * Math.sin(limitar((ms - p.contato) / 260) * Math.PI) }, 2, c.pele, LAMA[0], LAMA[1])
    })
  },

  /** "Attacks with countless beams of light that glow a deep and brilliant blue." (área) */
  origin_pulse(p, c) {
    const { ctx, ms, origem, raio, tier } = c
    // Incontáveis feixes de luz azul-profundo saem de quem ataca em leque e
    // atingem cada ponto da área, com o brilho azul no chão.
    const pts = interior(origem, raio, Math.min(12 + tier * 2, 18), .5)
    pts.forEach(({ p: q, d }, i) => {
      const t = janela(ms, p.contato - 160 + (d / raio) * 100 + (i % 3) * 20, 260)
      if (t === null) return
      const fim = entrePontos({ x: origem.x, y: origem.y - 8 }, { x: q.x, y: q.y - 4 }, saida(limitar(t * 1.6)))
      const w = 3 * (1 - entrada(limitar((t - .5) / .5)))
      if (w > .3) {
        ctx.lineCap = 'round'
        ctx.strokeStyle = ESCURO; ctx.lineWidth = w + 1.6; ctx.beginPath(); ctx.moveTo(origem.x, origem.y - 8); ctx.lineTo(fim.x, fim.y); ctx.stroke()
        ctx.strokeStyle = AZUL_PROFUNDO[i % 2]; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(origem.x, origem.y - 8); ctx.lineTo(fim.x, fim.y); ctx.stroke()
      }
      if (t > .45) brilho(ctx, q.x, q.y - 4, 3.4 * Math.sin((t - .45) / .55 * Math.PI), AZUL_PROFUNDO[2])
    })
    const carrega = janela(ms, 0, p.contato)
    if (carrega !== null) bola(ctx, { x: origem.x, y: origem.y - 8 }, 3 + 6 * carrega, c.pele, AZUL_PROFUNDO[0], AZUL_PROFUNDO[2])
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'WATER'], ...AZUL_PROFUNDO, ...LAMA, '#ffd23a', '#e0303a', '#5cd65c',
  PELES.WATER.base, PELES.WATER.meio, PELES.WATER.contorno, PELES.WATER.nucleo, PELES.GROUND.base, PELES.GROUND.meio, PELES.GROUND.contorno)

export const ONDAS_POR_GOLPE = montarFamilia(PERFIS_DE_ONDA, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 56,
  margem: () => ({ cima: 66, baixo: 56, lados: 56 }), pele: peleDe,
})
export const ONDAS_EM_AREA_POR_GOLPE = montarFamilia(PERFIS_DE_ONDA_EM_AREA, {
  desenhar: (p, c, id) => GOLPES_EM_AREA[id](p, c, Math.floor(c.rng() * 0xffffffff)),
  duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 36, pele: peleDe,
  margem: () => ({ cima: 34, baixo: 24, lados: 26 }),
})
