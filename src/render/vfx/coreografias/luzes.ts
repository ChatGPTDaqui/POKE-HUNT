// Luz e brilho + o Nuzzle (09/10): quatro golpes a partir da descrição do jogo
// (frase no comentário). Dazzling Gleam é de ÁREA. Moonblast e Play Rough são
// golpes-vitrine da fada.
import { getAbility } from '@/data/abilities'
import { emitirParticulas } from '../particulas'
import { PELES } from '../paletas'
import { entrada, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { interior } from './comum'
import { BRANCO, ESCURO, brilho, comAcento, entrePontos, estatica, janela, montarFamilia, poligono } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_LUZ: Record<string, Perfil> = {
  nuzzle: { contato: 200, fim: 340 },
  tri_attack: { contato: 260, fim: 300 },
  sacred_fire: { contato: 240, fim: 420 },
}
export const PERFIS_DE_LUZ_EM_AREA: Record<string, Perfil> = {
  dazzling_gleam: { contato: 160, fim: 380 },
}

const TRES = ['#ff5a2a', '#7fd8ff', '#ffd23a'] as const, OURO = ['#ffd23a', '#fff3a0', '#ff9a3a'] as const

interface Cena { c: ContextoVfx; pele: Pele; semente: number; ux: number; uy: number; contato: number; centro: Ponto }
function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy) || 1
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), ux: dx / L, uy: dy / L, contato: p.contato, centro: { x: c.alvo.x, y: c.alvo.y - 3 } }
}
function choque(s: Cena, t: number, tamanho: number, ponto = s.centro): void {
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier * 1.2, t, s.pele, rngSemeado(s.semente + 50))
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 16 + s.c.tier * 3, t, s.pele.meio, rngSemeado(s.semente + 51))
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "Attacks by nuzzling its electrified cheeks against the target. Also leaves the target with paralysis." */
  nuzzle(p, s) {
    const { ctx, ms, origem } = s.c
    // Bochechas elétricas: duas bolinhas de faísca nas bochechas; o carinho
    // (esfrega-esfrega curtinho) no alvo deixa estática presa — paralisia garantida.
    const bochecha = janela(ms, 0, p.contato)
    if (bochecha !== null) for (const d of [-1, 1]) {
      const q = { x: origem.x + d * 6, y: origem.y - 2 }
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(q.x, q.y, 3.4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#e0303a'; ctx.beginPath(); ctx.arc(q.x, q.y, 2.4, 0, Math.PI * 2); ctx.fill()
      if (Math.floor(ms / 50 + d) % 2) brilho(ctx, q.x + d * 3, q.y - 4, 2, s.pele.meio)
    }
    const esfrega = janela(ms, p.contato - 60, 160)
    if (esfrega !== null) {
      const x = s.centro.x - s.ux * 8 + Math.sin(esfrega * Math.PI * 6) * 3
      for (let k = 0; k < 3; k++) brilho(ctx, x + (k - 1) * 3, s.centro.y - 2 + (k % 2) * 4, 2.2, s.pele.nucleo)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, limitar(t * 1.5), 7)
    estatica(ctx, s.c.alvo, saida(limitar((t - .1) / .2)) * (1 - limitar((t - .8) / .2)), s.pele, s.semente + 90 + Math.floor(ms / 66))
  },

  /** "Strikes with a simultaneous three-beam attack. May burn, freeze, or paralyze the target." */
  tri_attack(p, s) {
    const { ctx, ms, origem } = s.c
    // Três feixes ao mesmo tempo — fogo, gelo e raio — saem dos vértices de um
    // triângulo em quem ataca e convergem no alvo.
    const tri = janela(ms, 0, p.contato + 60)
    const vert = [0, 1, 2].map(k => ({ x: origem.x + Math.cos(-Math.PI / 2 + k * Math.PI * 2 / 3) * 10, y: origem.y - 4 + Math.sin(-Math.PI / 2 + k * Math.PI * 2 / 3) * 10 }))
    if (tri !== null) {
      const a = saida(limitar(ms / 120))
      ctx.strokeStyle = ESCURO; ctx.lineWidth = 3; ctx.beginPath(); vert.forEach((v, i) => { const q = entrePontos(origem, v, a); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y) }); ctx.closePath(); ctx.stroke()
      ctx.strokeStyle = BRANCO; ctx.lineWidth = 1.2; ctx.stroke()
    }
    const u = janela(ms, 120, p.contato - 120 + 80)
    if (u !== null) vert.forEach((v, k) => {
      const fim = entrePontos(v, s.centro, saida(limitar(u * 1.5)))
      const w = 3.4 * (1 - entrada(limitar((u - .6) / .4)))
      if (w <= .3) return
      ctx.lineCap = 'round'
      ctx.strokeStyle = ESCURO; ctx.lineWidth = w + 2; ctx.beginPath(); ctx.moveTo(v.x, v.y); ctx.lineTo(fim.x, fim.y); ctx.stroke()
      ctx.strokeStyle = TRES[k]; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(v.x, v.y); ctx.lineTo(fim.x, fim.y); ctx.stroke()
    })
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 11)
    TRES.forEach((cor, k) => { const a = k * Math.PI * 2 / 3 - Math.PI / 2, d = 14 * saida(t); brilho(ctx, s.centro.x + Math.cos(a) * d, s.centro.y + Math.sin(a) * d, 3 * (1 - t), cor) })
  },

  /** "The target is razed with a mystical fire of great intensity. May leave the target with a burn." */
  sacred_fire(p, s) {
    const { ctx, ms, alvo } = s.c
    // Fogo sagrado: um PILAR de chamas douradas e de arco-íris brota do chão do
    // alvo e o engole, com faíscas douradas subindo.
    const chao = { x: alvo.x, y: alvo.y + 11 }
    const pilar = janela(ms, p.contato - 120, p.fim + 120)
    if (pilar !== null) {
      const h = 40 * saida(limitar(pilar / .3)) * (1 - entrada(limitar((pilar - .65) / .35)))
      const w = 11
      if (h > 1) {
        poligono(ctx, [[chao.x - w - 1.4, chao.y], [chao.x + w + 1.4, chao.y], [chao.x + w * .5 + 1.4, chao.y - h], [chao.x - w * .5 - 1.4, chao.y - h]], ESCURO)
        poligono(ctx, [[chao.x - w, chao.y], [chao.x + w, chao.y], [chao.x + w * .5, chao.y - h], [chao.x - w * .5, chao.y - h]], OURO[2])
        poligono(ctx, [[chao.x - w * .6, chao.y], [chao.x + w * .6, chao.y], [chao.x + w * .3, chao.y - h], [chao.x - w * .3, chao.y - h]], OURO[0])
        poligono(ctx, [[chao.x - w * .25, chao.y], [chao.x + w * .25, chao.y], [chao.x + w * .1, chao.y - h], [chao.x - w * .1, chao.y - h]], OURO[1])
        emitirParticulas(ctx, s.pele, { x: chao.x, y: chao.y - h * .5 }, s.c.pedir(4 + s.c.tier), 14, (pilar * 1.6) % 1, 5, rngSemeado(s.semente + 1))
        const rng = rngSemeado(s.semente + 2)
        for (let k = 0; k < 5; k++) {
          const v = (pilar * 1.5 + rng()) % 1
          brilho(ctx, chao.x + (rng() - .5) * 22, chao.y - v * (h + 10), 2 * (1 - v), OURO[1])
        }
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 12)
  },
}

/** "Damages opposing Pokémon by emitting a powerful flash." (área) */
function dazzlingGleam(p: Perfil, c: ContextoVfx): void {
  const { ctx, ms, origem, raio, tier } = c
  // Clarão poderoso: quem ataca vira uma estrela de luz que estoura em raios
  // chapados pelo chão inteiro, e cada ponto da área cintila.
  const t0 = janela(ms, 0, p.contato + 120)
  if (t0 !== null) {
    const k = saida(limitar(ms / p.contato)) * (1 - entrada(limitar((ms - p.contato) / 120)))
    brilho(ctx, origem.x, origem.y - 6, 4 + 10 * k, c.pele.nucleo)
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + .2, L = raio * .9 * saida(limitar((ms - p.contato + 60) / 120))
      if (L < 2) continue
      ctx.save(); ctx.translate(origem.x, origem.y + 12); ctx.scale(1, .45)
      poligono(ctx, [[Math.cos(a - .05) * 10, Math.sin(a - .05) * 10], [Math.cos(a) * L, Math.sin(a) * L], [Math.cos(a + .05) * 10, Math.sin(a + .05) * 10]], i % 2 ? BRANCO : c.pele.meio)
      ctx.restore()
    }
  }
  const t = janela(ms, p.contato, p.fim)
  if (t === null) return
  interior(origem, raio, Math.min(10 + tier * 2, 16), .9).forEach(({ p: q, d }, i) => {
    const tk = limitar((t - (d / raio) * .3) / .6)
    if (tk > 0 && tk < 1) brilho(ctx, q.x, q.y - 6, 4 * Math.sin(tk * Math.PI), i % 2 ? BRANCO : c.pele.nucleo)
  })
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...TRES, ...OURO, '#e0303a')

export const LUZES_POR_GOLPE = montarFamilia(PERFIS_DE_LUZ, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 56,
  margem: () => ({ cima: 66, baixo: 56, lados: 56 }), pele: peleDe,
})
export const LUZES_EM_AREA_POR_GOLPE = montarFamilia(PERFIS_DE_LUZ_EM_AREA, {
  desenhar: dazzlingGleam, duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 34, pele: peleDe,
})
