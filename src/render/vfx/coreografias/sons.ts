// Família Som (09/10): seis golpes a partir da descrição do jogo (frase no
// comentário). Boomburst é de ÁREA. Hyper Voice, Disarming Voice, Snarl,
// Struggle Bug e Synchronoise são golpes-vitrine dos tipos.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { noChao } from './comum'
import { BRANCO, ESCURO, comAcento, entrePontos, janela, montarFamilia, poligono, setasDeStatus } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_SOM: Record<string, Perfil> = {
  uproar: { contato: 220, fim: 380 },
  echoed_voice: { contato: 200, fim: 380 },
  snore: { contato: 260, fim: 300 },
  round: { contato: 300, fim: 320 },
  bug_buzz: { contato: 240, fim: 320 },
}
export const PERFIS_DE_SOM_EM_AREA: Record<string, Perfil> = {
  boomburst: { contato: 160, fim: 420 },
}

const AZUL = '#58a6f0', AMARELO = '#ffd23a', VERMELHO = '#e0303a'

interface Cena { c: ContextoVfx; pele: Pele; semente: number; ux: number; uy: number; angulo: number; contato: number; boca: Ponto; centro: Ponto }
function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy) || 1
  const ux = dx / L, uy = dy / L
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), ux, uy, angulo: Math.atan2(uy, ux), contato: p.contato,
    boca: { x: c.origem.x + ux * 9, y: c.origem.y - 5 }, centro: { x: c.alvo.x, y: c.alvo.y - 3 } }
}
function choque(s: Cena, t: number, tamanho: number, ponto = s.centro): void {
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier * 1.2, t, s.pele, rngSemeado(s.semente + 50))
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 16 + s.c.tier * 3, t, s.pele.meio, rngSemeado(s.semente + 51))
}

/** Onda sonora: arco ")" com borda em zigue-zague (`serra`) centrado em `p`. */
function onda(ctx: CanvasRenderingContext2D, p: Ponto, angulo: number, r: number, abre: number, serra: number, cor: string, w = 2.4): void {
  const n = 14
  const pts: Ponto[] = Array.from({ length: n + 1 }, (_, i) => {
    const a = angulo - abre / 2 + abre * i / n, rr = r + (i % 2 ? serra : -serra)
    return { x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr }
  })
  for (const [lw, c] of [[w + 2.4, ESCURO], [w, cor]] as const) {
    ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.beginPath()
    pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke()
  }
}

function nota(ctx: CanvasRenderingContext2D, p: Ponto, s: number, cor: string): void {
  if (s < .2) return
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(s, s)
  ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 2.6, -.4, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(1.6, -9.4, 2.6, 9.4); ctx.fillRect(1.6, -9.4, 6, 2.6)
  ctx.fillStyle = cor; ctx.beginPath(); ctx.ellipse(0, 0, 2.4, 1.6, -.4, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(2.2, -8.6, 1.2, 8.6); ctx.fillRect(2.2, -8.6, 5, 1.2)
  ctx.restore()
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "Attacks in an uproar for three turns. During that time, no Pokémon can fall asleep." */
  uproar(p, s) {
    const { ctx, ms, origem } = s.c
    // Algazarra: rajadas de "!" e zigue-zagues saindo de quem ataca pra todo
    // lado, e um "Zzz" riscado (ninguém dorme).
    const rng = rngSemeado(s.semente + Math.floor(ms / 80))
    if (ms < p.contato + p.fim * .6) for (let k = 0; k < 3; k++) {
      const a = s.angulo + (rng() - .5) * 2.4, d = 10 + rng() * 6
      onda(ctx, origem, a, d, .9, 2.2, k % 2 ? AMARELO : BRANCO, 1.8)
    }
    for (let k = 0; k < 3; k++) {
      const u = janela(ms, k * 70, p.contato)
      if (u === null) continue
      onda(ctx, entrePontos(s.boca, s.centro, saida(u)), s.angulo, 6 + k * 3, 1.4, 2.4, BRANCO, 2)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 11)
    const z = { x: s.centro.x + 10, y: s.centro.y - 16 }
    ctx.strokeStyle = ESCURO; ctx.lineWidth = 2.6
    ctx.beginPath(); ctx.moveTo(z.x - 3, z.y - 3); ctx.lineTo(z.x + 3, z.y - 3); ctx.lineTo(z.x - 3, z.y + 3); ctx.lineTo(z.x + 3, z.y + 3); ctx.stroke()
    ctx.strokeStyle = BRANCO; ctx.lineWidth = 1.2; ctx.stroke()
    ctx.strokeStyle = VERMELHO; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(z.x - 5, z.y + 5); ctx.lineTo(z.x + 5, z.y - 5); ctx.stroke()
  },

  /** "Attacks with an echoing voice. If used every turn, its power is increased." */
  echoed_voice(p, s) {
    const { ctx, ms } = s.c
    // ECO: uma onda vai, bate, e voltam ecos cada vez mais fracos e mais largos.
    const u = janela(ms, 0, p.contato)
    if (u !== null) onda(ctx, entrePontos(s.boca, s.centro, saida(u)), s.angulo, 8, 1.6, 0, s.pele.nucleo, 2.6)
    for (let k = 0; k < 3; k++) {
      const t = janela(ms, s.contato + k * 90, 180)
      if (t === null) continue
      onda(ctx, s.centro, s.angulo, 6 + t * 16 + k * 2, 1.8, 0, k ? s.pele.meio : BRANCO, 2.6 - k * .7)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 9)
  },

  /** "Can be used only if the user is asleep. The harsh noise may make the target flinch." */
  snore(p, s) {
    const { ctx, ms, origem } = s.c
    // Dormindo: "Zzz" saindo de quem ataca e uma bolha de ronco que cresce na
    // boca, estoura e vira uma onda serrilhada no alvo.
    for (let k = 0; k < 3; k++) {
      const y = origem.y - 14 - k * 6 - (ms / 40 % 4), x = origem.x + 4 + k * 4, z = 2 + k * .6
      ctx.strokeStyle = ESCURO; ctx.lineWidth = 2.6
      ctx.beginPath(); ctx.moveTo(x - z, y - z); ctx.lineTo(x + z, y - z); ctx.lineTo(x - z, y + z); ctx.lineTo(x + z, y + z); ctx.stroke()
      ctx.strokeStyle = BRANCO; ctx.lineWidth = 1.1; ctx.stroke()
    }
    const bolha = janela(ms, 0, 160)
    if (bolha !== null) {
      const r = 2 + 6 * saida(bolha)
      ctx.strokeStyle = ESCURO; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(s.boca.x, s.boca.y, r, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = AZUL; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(s.boca.x, s.boca.y, r, 0, Math.PI * 2); ctx.stroke()
    }
    for (let k = 0; k < 2; k++) {
      const u = janela(ms, 160 + k * 40, p.contato - 160)
      if (u !== null) onda(ctx, entrePontos(s.boca, s.centro, saida(u)), s.angulo, 7 + k * 3, 1.5, 2.6, BRANCO, 2.2)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 9)
    const k = 1 - limitar((t - .5) / .5)
    if (k > 0) for (const dx of [-6, 0, 6]) poligono(ctx, [[s.c.alvo.x + dx - 1, s.c.alvo.y - 16], [s.c.alvo.x + dx + 1, s.c.alvo.y - 16], [s.c.alvo.x + dx * 1.4 + .6, s.c.alvo.y - 16 - 7 * k], [s.c.alvo.x + dx * 1.4 - .6, s.c.alvo.y - 16 - 7 * k]], ESCURO)
  },

  /** "Attacks the target with a song. Others can join in the Round to increase the power." */
  round(p, s) {
    const { ctx, ms } = s.c
    // Canção: notas musicais em fila, ondulando em arco, entram no alvo uma a uma.
    for (let k = 0; k < 5; k++) {
      const u = janela(ms, k * 45, p.contato - 80)
      if (u === null) continue
      const q = entrePontos(s.boca, s.centro, saida(u))
      q.y += Math.sin(u * Math.PI * 2 + k) * 6 - Math.sin(u * Math.PI) * 8
      nota(ctx, q, .9, [s.pele.nucleo, AMARELO, AZUL][k % 3])
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 9)
    for (let k = 0; k < 3; k++) nota(ctx, { x: s.centro.x + (k - 1) * 9, y: s.centro.y - 8 - 14 * saida(t) }, .8 * (1 - entrada(limitar((t - .6) / .4))), [s.pele.nucleo, AMARELO, AZUL][k])
  },

  /** "Generates a damaging sound wave by vibration. May lower the target's Sp. Def." */
  bug_buzz(p, s) {
    const { ctx, ms, origem } = s.c
    // Zumbido: asas vibrando (riscos tremidos dos dois lados) e anéis verdes
    // de vibração com tremor correndo até o alvo.
    const vibra = janela(ms, 0, p.contato)
    if (vibra !== null) for (const lado of [-1, 1]) {
      const tr = Math.floor(ms / 33) % 2 ? 1.6 : -1.6
      for (let k = 0; k < 3; k++) poligono(ctx, [[origem.x + lado * (6 + k * 3), origem.y - 10 + tr], [origem.x + lado * (8 + k * 3), origem.y - 10 + tr], [origem.x + lado * (8 + k * 3), origem.y - 2 + tr], [origem.x + lado * (6 + k * 3), origem.y - 2 + tr]], BRANCO)
    }
    for (let k = 0; k < 4; k++) {
      const u = janela(ms, 40 + k * 40, p.contato - 40)
      if (u === null) continue
      const q = entrePontos(s.boca, s.centro, saida(u)), jitter = Math.floor(ms / 33) % 2 ? 1 : -1
      onda(ctx, { x: q.x, y: q.y + jitter }, s.angulo, 6 + k * 2, 2, 1.4, s.pele.meio, 2)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 10)
    if (t > .3) setasDeStatus(ctx, s.c.alvo, (t - .3) / .7, AZUL, 1, true)
  },
}

/** "Attacks everything around it with the destructive power of a terrible, explosive sound." (área) */
function boomburst(p: Perfil, c: ContextoVfx): void {
  const { ctx, ms, origem, raio, tier } = c
  const semente = Math.floor(c.rng() * 0xffffffff)
  // Estrondo: anéis sonoros SERRILHADOS e grossos explodem de quem ataca e
  // varrem o chão até a borda; o chão inteiro treme com estalos.
  for (let k = 0; k < 4; k++) {
    const t = janela(ms, k * 60, p.contato + 260)
    if (t === null) continue
    const r = raio * (.12 + .88 * saida(t))
    const w = (7 - k * 1.2) * (1 - entrada(t)) + .6
    ctx.save(); ctx.translate(origem.x, origem.y + 12); ctx.scale(1, .45)
    onda(ctx, { x: 0, y: 0 }, 0, r, Math.PI * 2, 4, k % 2 ? c.pele.meio : BRANCO, w)
    ctx.restore()
  }
  const t = janela(ms, p.contato, p.fim)
  if (t === null) return
  const rng = rngSemeado(semente + 1)
  for (let k = 0; k < Math.min(c.pedir(6 + tier), 10); k++) {
    const q = noChao(origem, rng() * Math.PI * 2, raio * (.2 + rng() * .75))
    const tk = limitar((t - k * .04) / .6)
    if (tk > 0 && tk < 1) estrelaDeImpacto(ctx, { x: q.x, y: q.y - 6 }, 6, tk, c.pele, rngSemeado(semente + 10 + k))
  }
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], AZUL, AMARELO, VERMELHO)

export const SONS_POR_GOLPE = montarFamilia(PERFIS_DE_SOM, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 56,
  margem: () => ({ cima: 66, baixo: 56, lados: 56 }), pele: peleDe,
})
export const SONS_EM_AREA_POR_GOLPE = montarFamilia(PERFIS_DE_SOM_EM_AREA, {
  desenhar: boomburst, duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 30, pele: peleDe,
})
