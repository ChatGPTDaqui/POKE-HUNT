// Família Jato e sopro (09/10): cinco golpes que saem da boca, cada um a partir
// da descrição do jogo (frase no comentário). Ember, Flamethrower, Water Gun,
// Scald, Hydro Pump, Dragon Breath, Sludge, Gunk Shot, Acid, Incinerate,
// Mud-Slap e Bubble são golpes-vitrine do tipo e ficam com a coreografia dele.
import { getAbility } from '@/data/abilities'
import { emitirParticulas } from '../particulas'
import { PELES } from '../paletas'
import { crescente, estilhacos, estrelaDeImpacto, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, bola, brilho, comAcento, entrePontos, janela, montarFamilia, nuvem, setasDeStatus } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_SOPRO: Record<string, Perfil> = {
  brine: { contato: 220, fim: 340 },
  frost_breath: { contato: 240, fim: 320 },
  acid_spray: { contato: 220, fim: 360 },
  belch: { contato: 260, fim: 320 },
  dragon_rage: { contato: 240, fim: 280 },
}

const AZUL = '#58a6f0', AMARELO = '#ffd23a', VERDE_GAS = '#a8d64a'

interface Cena { c: ContextoVfx; pele: Pele; semente: number; ux: number; uy: number; contato: number; boca: Ponto; centro: Ponto }

function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy) || 1
  const ux = dx / L, uy = dy / L
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), ux, uy, contato: p.contato,
    boca: { x: c.origem.x + ux * 9, y: c.origem.y - 5 }, centro: { x: c.alvo.x, y: c.alvo.y - 3 } }
}

function choque(s: Cena, t: number, tamanho: number, ponto = s.centro): void {
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier * 1.2, t, s.pele, rngSemeado(s.semente + 50))
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 16 + s.c.tier * 3, t, s.pele.meio, rngSemeado(s.semente + 51))
}

/** Fluxo da boca ao alvo: `n` bolas ao longo do caminho, cada uma com fase própria. */
function fluxo(s: Cena, ms: number, ini: number, dura: number, n: number, desenha: (q: Ponto, v: number, k: number) => void): void {
  for (let k = 0; k < n; k++) {
    const v = (ms - ini - k * (dura / n) * .5) / (dura * .6)
    if (v <= 0 || v >= 1) continue
    const q = entrePontos(s.boca, s.centro, v)
    q.y += Math.sin(v * Math.PI * 3 + k) * 2
    desenha(q, v, k)
  }
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "If the target's HP is half or less, this attack will hit with double the power." */
  brine(p, s) {
    const { ctx, ms } = s.c
    // Água SALGADA: jato com cristais de sal brancos brilhando; no alvo, o sal
    // gruda e cintila (arde mais em quem já está ferido).
    fluxo(s, ms, 0, p.contato, 10, (q, v, k) => {
      bola(ctx, q, 3.4 - v, s.pele)
      if (k % 2) brilho(ctx, q.x + 2, q.y - 3, 1.8, BRANCO)
    })
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 10)
    const rng = rngSemeado(s.semente + 3)
    for (let k = 0; k < 6; k++) {
      const x = s.centro.x + (rng() - .5) * 18, y = s.centro.y + (rng() - .5) * 14
      if (Math.floor(ms / 70 + k) % 2) brilho(ctx, x, y, 2.4 * (1 - t), BRANCO)
    }
  },

  /** "Blows its cold breath on the target. This attack always results in a critical hit." */
  frost_breath(p, s) {
    const { ctx, ms } = s.c
    // Bafo gelado: nuvem branco-azulada que sai da boca e congela o alvo em
    // cristais; sempre crítico (brilho grande).
    fluxo(s, ms, 0, p.contato, 8, (q, v) => nuvem(ctx, q, .5, 3, 3 + v * 4, s.pele, rngSemeado(s.semente + Math.round(v * 10)), .8, 0, s.pele.nucleo, BRANCO))
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 10)
    estilhacos(ctx, s.centro, s.c.pedir(5 + s.c.tier), 20, t, s.pele, rngSemeado(s.semente + 2))
    nuvem(ctx, s.centro, t, s.c.pedir(4), 12, s.pele, rngSemeado(s.semente + 3), .7, 3, s.pele.nucleo, BRANCO)
    if (t < .5) brilho(ctx, s.centro.x + 10, s.centro.y - 12, 5 * (1 - t / .5), AMARELO)
  },

  /** "Spits fluid that works to melt the target. This harshly lowers the target's Sp. Def." */
  acid_spray(p, s) {
    const { ctx, ms } = s.c
    // Cusparadas de ácido em arco; no alvo, o ácido CHIA: bolhas e vapor subindo;
    // Sp. Def cai muito (duas setas pra baixo).
    for (let k = 0; k < 3; k++) {
      const u = janela(ms, 30 + k * 45, p.contato - 60)
      if (u === null) continue
      const q = entrePontos(s.boca, { x: s.centro.x + (k - 1) * 5, y: s.centro.y }, u)
      q.y -= Math.sin(u * Math.PI) * 12
      bola(ctx, q, 3.4, s.pele, s.pele.base, VERDE_GAS)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 8)
    for (let k = 0; k < Math.min(s.c.pedir(5), 5); k++) {
      const sobe = (t * 1.6 + k * .2) % 1
      bola(ctx, { x: s.centro.x + (k - 2) * 5, y: s.centro.y + 6 - sobe * 18 }, 2.2 * (1 - sobe), s.pele, VERDE_GAS, BRANCO)
    }
    setasDeStatus(ctx, s.c.alvo, t, AZUL, 2, true)
  },

  /** "Lets out a damaging belch at the target. The user must eat a held Berry first." */
  belch(p, s) {
    const { ctx, ms } = s.c
    // Arroto: quem ataca INCHA (bolinhas de ar na boca), e sai uma onda de gás
    // esverdeado em anéis grossos que bate no alvo.
    const incha = janela(ms, 0, 120)
    if (incha !== null) bola(ctx, s.boca, 2 + 4 * saida(incha), s.pele, VERDE_GAS, BRANCO)
    for (let k = 0; k < 3; k++) {
      const u = janela(ms, 110 + k * 40, p.contato - 110)
      if (u === null) continue
      const q = entrePontos(s.boca, s.centro, saida(u))
      const a = Math.atan2(s.uy, s.ux)
      crescente(ctx, q, 6 + u * 6, a - 1, a + 1, 4 - k * .8, .55, 0, { ...s.pele, meio: VERDE_GAS, nucleo: BRANCO }, 1)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 13)
    nuvem(ctx, s.centro, t, s.c.pedir(6), 16, s.pele, rngSemeado(s.semente + 2), .8, 5, VERDE_GAS, s.pele.meio)
  },

  /** "Hits the target with a shock wave of pure rage. This attack always inflicts 40 HP damage." */
  dragon_rage(p, s) {
    const { ctx, ms } = s.c
    // Fúria pura: rajada de chama azul em ONDA (S) com olhos de raiva brilhando
    // na boca de quem ataca; dano fixo — o impacto é seco e sempre igual.
    const olhos = janela(ms, 0, 120)
    if (olhos !== null) for (const d of [-1, 1]) brilho(ctx, s.boca.x - s.ux * 6 + d * 3, s.boca.y - 6, 2, '#e0303a')
    fluxo(s, ms, 80, p.contato - 80, 9, (q, v, k) => {
      const onda = Math.sin(v * Math.PI * 4) * 5
      emitirParticulas(ctx, s.pele, { x: q.x - s.uy * onda, y: q.y + s.ux * onda }, 1, 4, (v * 2 + k * .1) % 1, 4.6 - v * 1.4, rngSemeado(s.semente + k))
    })
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 11)
    emitirParticulas(ctx, s.pele, s.centro, s.c.pedir(5), 18, t, 4, rngSemeado(s.semente + 3))
  },
}

const ACENTOS: Record<string, string[]> = { frost_breath: [AMARELO], acid_spray: [VERDE_GAS, AZUL], belch: [VERDE_GAS], dragon_rage: ['#e0303a'] }

export const SOPROS_POR_GOLPE = montarFamilia(PERFIS_DE_SOPRO, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 54,
  pele: id => ACENTOS[id] ? comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...ACENTOS[id]) : undefined,
})

