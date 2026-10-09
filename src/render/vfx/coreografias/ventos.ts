// Vento cortante, Vento e tempestade, Vórtice que prende e Dreno (09/10):
// doze golpes a partir da descrição do jogo (frase no comentário). Razor Wind
// é de ÁREA.
import { getAbility } from '@/data/abilities'
import { emitirParticulas } from '../particulas'
import { PELES } from '../paletas'
import { crescente, entrada, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { interior, noChao } from './comum'
import { BRANCO, ESCURO, bola, brilho, comAcento, entrePontos, janela, montarFamilia, nuvem, poligono, setasDeStatus } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_VENTO: Record<string, Perfil> = {
  sonic_boom: { contato: 200, fim: 280 },
  hurricane: { contato: 220, fim: 460 },
  leaf_tornado: { contato: 200, fim: 420 },
  fire_spin: { contato: 180, fim: 480 },
  whirlpool: { contato: 180, fim: 480 },
  sand_tomb: { contato: 180, fim: 480 },
  infestation: { contato: 180, fim: 480 },
  absorb: { contato: 160, fim: 360 },
  mega_drain: { contato: 180, fim: 400 },
  giga_drain: { contato: 200, fim: 460 },
  dream_eater: { contato: 240, fim: 440 },
}
export const PERFIS_DE_VENTO_EM_AREA: Record<string, Perfil> = {
  razor_wind: { contato: 260, fim: 360 },
}

const VERDE_VIDA = ['#5cd65c', '#c8ffb0'] as const, ROSA = '#ff9ccb', AZUL = '#58a6f0', AMARELO = '#ffd23a'

interface Cena { c: ContextoVfx; pele: Pele; semente: number; ux: number; uy: number; angulo: number; contato: number; centro: Ponto }
function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy) || 1
  const ux = dx / L, uy = dy / L
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), ux, uy, angulo: Math.atan2(uy, ux), contato: p.contato, centro: { x: c.alvo.x, y: c.alvo.y - 3 } }
}
function choque(s: Cena, t: number, tamanho: number, ponto = s.centro): void {
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier * 1.2, t, s.pele, rngSemeado(s.semente + 50))
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 16 + s.c.tier * 3, t, s.pele.meio, rngSemeado(s.semente + 51))
}

/** Redemoinho em volta do alvo: `n` elementos girando em espiral subindo, desenhados por `desenha`. */
function redemoinho(s: Cena, ms: number, ini: number, dura: number, n: number, alto: number, desenha: (q: Ponto, giro: number, k: number, frente: boolean) => void): void {
  const t = janela(ms, ini, dura)
  if (t === null) return
  const forma = saida(limitar(t / .2)) * (1 - entrada(limitar((t - .8) / .2)))
  for (let k = 0; k < n; k++) {
    const v = (k / n + ms / 900) % 1, a = k * 2.4 + ms / 90
    const r = (8 + v * 8) * forma, y = s.c.alvo.y + 10 - v * alto * forma
    desenha({ x: s.c.alvo.x + Math.cos(a) * r, y: y + Math.sin(a) * r * .3 }, a, k, Math.sin(a) > 0)
  }
}

/** Gotas de vida voltando do alvo pra quem ataca, em ondas. */
function drenar(s: Cena, ms: number, ini: number, n: number, r: number, cores: readonly string[]): void {
  const { ctx, origem } = s.c
  for (let k = 0; k < n; k++) {
    const u = limitar((ms - ini - k * 40) / 260)
    if (u <= 0 || u >= 1) continue
    const q = entrePontos(s.centro, { x: origem.x, y: origem.y - 2 }, entrada(u) * .3 + saida(u) * .7)
    q.y -= Math.sin(u * Math.PI) * 10 + Math.sin(u * 8 + k) * 3
    bola(ctx, q, r * (1 - u * .3), s.pele, cores[k % cores.length], BRANCO)
  }
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "Hit with a destructive shock wave that always inflicts 20 HP damage." */
  sonic_boom(p, s) {
    const { ctx, ms, origem } = s.c
    // Barreira do som: um cone de vapor (anel branco) estoura na frente de quem
    // ataca e a onda de choque em crescente corre até o alvo.
    const estoura = janela(ms, 0, 160)
    if (estoura !== null) {
      const q = { x: origem.x + s.ux * 10, y: origem.y - 4 }, r = 4 + 8 * saida(estoura)
      ctx.strokeStyle = ESCURO; ctx.lineWidth = 3 * (1 - estoura) + .6; ctx.beginPath(); ctx.ellipse(q.x, q.y, r * .4, r, s.angulo, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = BRANCO; ctx.lineWidth = 1.6 * (1 - estoura) + .3; ctx.stroke()
    }
    const vai = janela(ms, 40, p.contato - 40)
    if (vai !== null) crescente(ctx, entrePontos({ x: origem.x + s.ux * 10, y: origem.y - 4 }, s.centro, saida(vai)), 10, s.angulo - 1, s.angulo + 1, 4, .55, 0, { ...s.pele, meio: BRANCO }, 1)
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 9)
  },

  /** "Wraps its opponent in a fierce wind that flies up into the sky. May confuse." */
  hurricane(p, s) {
    const { ctx, ms } = s.c
    // Furacão: uma coluna de vento ALTA se enrosca no alvo e sobe até o céu;
    // no fim, estrelinhas de confusão rodando nele.
    redemoinho(s, ms, 0, p.contato + p.fim * .7, 10, 54, (q, a, k) => crescente(ctx, q, 6 + (k % 3), a, a + 2, 2.2, .55, 0, { ...s.pele, meio: k % 2 ? BRANCO : s.pele.meio }, .45))
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 10)
    if (t > .55) for (let i = 0; i < 3; i++) { const a = t * Math.PI * 4 + i * 2.1; brilho(ctx, s.c.alvo.x + Math.cos(a) * 9, s.c.alvo.y - 16 + Math.sin(a) * 3, 2.6, AMARELO) }
  },

  /** "Encircles the target in sharp leaves. May lower the target's accuracy." */
  leaf_tornado(p, s) {
    const { ctx, ms } = s.c
    // Anel de folhas afiadas girando em volta do alvo, como um tornado baixo.
    redemoinho(s, ms, 0, p.contato + p.fim * .7, 9, 26, (q, a) => {
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(a)
      poligono(ctx, [[-5, 0], [0, -2.6], [5, 0], [0, 2.6]], ESCURO); poligono(ctx, [[-4, 0], [0, -1.6], [4, 0], [0, 1.6]], s.pele.meio)
      ctx.fillStyle = s.pele.base; ctx.fillRect(-3.4, -.3, 6.8, .6)
      ctx.restore()
    })
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 9)
  },

  /** "The target becomes trapped within a fierce vortex of fire for four to five turns." */
  fire_spin(p, s) {
    const { ctx, ms } = s.c
    // Prisão de fogo: chamas girando num funil em volta do alvo, sem sair dele.
    redemoinho(s, ms, 0, p.contato + p.fim, 12, 26, (q, _a, k) => emitirParticulas(ctx, s.pele, q, 1, 2, (ms / 400 + k * .13) % 1, 4.4, rngSemeado(s.semente + k)))
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 8)
  },

  /** "Traps the target in a violent swirling whirlpool for four to five turns." */
  whirlpool(p, s) {
    const { ctx, ms, alvo } = s.c
    // Redemoinho d'água: espiral de água NO CHÃO em volta do alvo, subindo pelas bordas.
    const t0 = janela(ms, 0, p.contato + p.fim)
    if (t0 !== null) {
      const forma = saida(limitar(t0 / .2)) * (1 - entrada(limitar((t0 - .8) / .2)))
      for (let k = 0; k < 3; k++) {
        const a = ms / 120 + k * 2.1, r = (10 + k * 4) * forma
        ctx.save(); ctx.translate(alvo.x, alvo.y + 10 - k * 4); ctx.scale(1, .4)
        crescente(ctx, { x: 0, y: 0 }, r, a, a + 4, 3.4, .55, 0, { ...s.pele, nucleo: BRANCO }, 1)
        ctx.restore()
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 8)
  },

  /** "Traps the target inside a harshly raging sandstorm for four to five turns." */
  sand_tomb(p, s) {
    const { ctx, ms } = s.c
    // Tumba de areia: grãos e nuvenzinhas de areia girando num cone fechado no alvo.
    redemoinho(s, ms, 0, p.contato + p.fim, 14, 24, (q, _a, k) => {
      ctx.fillStyle = ESCURO; ctx.fillRect(q.x - 1.6, q.y - 1.6, 3.2, 3.2)
      ctx.fillStyle = k % 2 ? s.pele.meio : s.pele.nucleo; ctx.fillRect(q.x - 1, q.y - 1, 2, 2)
    })
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 8)
    nuvem(ctx, { x: s.c.alvo.x, y: s.c.alvo.y + 10 }, t, s.c.pedir(4), 12, s.pele, rngSemeado(s.semente + 2))
  },

  /** "The target is infested and attacked for four to five turns. The target can't flee." */
  infestation(p, s) {
    const { ctx, ms } = s.c
    // Infestado: um enxame de bichinhos pretos com asinhas zumbindo em volta do alvo.
    redemoinho(s, ms, 0, p.contato + p.fim, 12, 22, (q, a, k) => {
      const bate = Math.floor(ms / 40 + k) % 2 ? 1.6 : .6
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(q.x, q.y, 2, 1.4, a, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = BRANCO; ctx.fillRect(q.x - 2, q.y - 1 - bate, 1.4, bate); ctx.fillRect(q.x + .6, q.y - 1 - bate, 1.4, bate)
    })
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 7)
  },

  /** "A nutrient-draining attack. The user's HP is restored by half the damage taken." */
  absorb(p, s) {
    const t = janela(s.c.ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 6)
    // Absorb: duas gotinhas de vida verdes voltam pra quem atacou.
    drenar(s, s.c.ms, s.contato + 40, 2, 2.6, VERDE_VIDA)
  },

  mega_drain(p, s) {
    const { ctx, ms, origem } = s.c
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 8)
    // Mega Drain: quatro gotas maiores e uma folha; quem atacou brilha verde ao receber.
    drenar(s, ms, s.contato + 40, 4, 3.2, VERDE_VIDA)
    const brilha = janela(ms, s.contato + 260, p.fim - 260)
    if (brilha !== null) crescente(ctx, origem, 10 + 4 * brilha, -Math.PI, Math.PI, 2 * (1 - brilha), .5, 0, { ...s.pele, meio: VERDE_VIDA[0] }, 1)
  },

  giga_drain(p, s) {
    const { ctx, ms, origem } = s.c
    // Giga Drain: o alvo é envolto por um brilho verde, um RIO de gotas sai dele
    // e quem atacou se acende numa aura de cura.
    const envolve = janela(ms, s.contato - 60, 260)
    if (envolve !== null) crescente(ctx, s.centro, 14 - 4 * envolve, -Math.PI, Math.PI, 3 * (1 - envolve), .5, 0, { ...s.pele, meio: VERDE_VIDA[0] }, 1)
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 10)
    drenar(s, ms, s.contato + 30, 8, 3.4, VERDE_VIDA)
    const cura = janela(ms, s.contato + 260, p.fim - 260)
    if (cura !== null) { crescente(ctx, origem, 12, -Math.PI, Math.PI, 3 * (1 - cura), .5, 0, { ...s.pele, meio: VERDE_VIDA[0] }, 1); for (let k = 0; k < 3; k++) brilho(ctx, origem.x + (k - 1) * 8, origem.y - 8 - cura * 10, 2.4 * (1 - cura), VERDE_VIDA[1]) }
  },

  /** "Eats the dreams of a sleeping target. Absorbs half the damage to heal its own HP." */
  dream_eater(p, s) {
    const { ctx, ms, origem } = s.c
    // Come o SONHO: um balão de sonho (com estrelinha e lua) sobe do alvo,
    // voa até quem ataca e é engolido em mordidas; volta cura rosa.
    const balao = { x: s.centro.x + 4, y: s.centro.y - 18 }
    const sobe = janela(ms, 0, p.contato + 260)
    if (sobe !== null) {
      const vai = entrada(limitar((ms - p.contato) / 260)), r = 9 * (1 - vai * .5)
      const q = entrePontos(balao, { x: origem.x, y: origem.y - 8 }, vai)
      const k = saida(limitar(ms / 160))
      if (k > .1) {
        for (const [dx, dy, rr] of [[-.4, .2, .7], [.4, .2, .7], [0, -.3, .8]] as const) { ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(q.x + dx * r, q.y + dy * r, rr * r * k + 1.3, 0, Math.PI * 2); ctx.fill() }
        for (const [dx, dy, rr] of [[-.4, .2, .7], [.4, .2, .7], [0, -.3, .8]] as const) { ctx.fillStyle = BRANCO; ctx.beginPath(); ctx.arc(q.x + dx * r, q.y + dy * r, rr * r * k, 0, Math.PI * 2); ctx.fill() }
        brilho(ctx, q.x - 2, q.y - 1, 2.2 * k, AMARELO)
        ctx.fillStyle = AZUL; ctx.beginPath(); ctx.arc(q.x + 3, q.y, 2 * k, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = BRANCO; ctx.beginPath(); ctx.arc(q.x + 3.8, q.y - .6, 1.6 * k, 0, Math.PI * 2); ctx.fill()
      }
    }
    const t = janela(ms, s.contato, 240)
    if (t !== null) choque(s, t, 9)
    const come = janela(ms, s.contato + 260, p.fim - 260)
    if (come !== null) for (const d of [-1, 1]) poligono(ctx, [[origem.x - 5, origem.y - 8 + d * (5 - 4 * Math.abs(Math.sin(come * Math.PI * 3)))], [origem.x + 5, origem.y - 8 + d * (5 - 4 * Math.abs(Math.sin(come * Math.PI * 3)))], [origem.x, origem.y - 8 + d * 1.6]], BRANCO)
    if (come !== null) setasDeStatus(ctx, origem, come, ROSA, 1)
  },
}

/** "Two-turn attack: blades of wind hit opposing Pokémon on the second turn. Crit-prone." (área) */
function razorWind(p: Perfil, c: ContextoVfx): void {
  const { ctx, ms, origem, raio, tier } = c
  // Turno 1: o vento se ENROLA em quem ataca (carregando); turno 2: dezenas de
  // lâminas de vento em crescente saem girando pra toda a área.
  const carrega = janela(ms, 0, p.contato)
  if (carrega !== null) for (let k = 0; k < 3; k++) crescente(ctx, { x: origem.x, y: origem.y - 2 }, 8 + k * 4, ms / 50 + k * 2, ms / 50 + k * 2 + 2, 2.4, .55, 0, { ...c.pele, meio: k % 2 ? BRANCO : c.pele.meio }, .6)
  const pts = interior(origem, raio, Math.min(10 + tier * 2, 16), .2)
  pts.forEach(({ p: q, d }, i) => {
    const t = janela(ms, p.contato + (d / raio) * 100, 220)
    if (t === null) return
    const de = { x: origem.x, y: origem.y + 6 }, at = entrePontos(de, { x: q.x, y: q.y - 6 }, saida(t))
    const a = Math.atan2(q.y - de.y, q.x - de.x)
    crescente(ctx, at, 7, a - 1, a + 1, 3, .55, 0, { ...c.pele, meio: i % 2 ? BRANCO : c.pele.meio }, 1)
  })
  const t = janela(ms, p.contato + 160, p.fim - 160)
  if (t !== null) for (let k = 0; k < 4; k++) { const q = noChao(origem, k * 1.6, raio * .6); brilho(ctx, q.x, q.y - 8, 3 * (1 - t), AMARELO) }
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...VERDE_VIDA, ROSA, AZUL, AMARELO)

export const VENTOS_POR_GOLPE = montarFamilia(PERFIS_DE_VENTO, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 58,
  margem: () => ({ cima: 76, baixo: 58, lados: 58 }), pele: peleDe,
})
export const VENTOS_EM_AREA_POR_GOLPE = montarFamilia(PERFIS_DE_VENTO_EM_AREA, {
  desenhar: razorWind, duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 34, pele: peleDe,
  margem: () => ({ cima: 34, baixo: 24, lados: 26 }),
})
