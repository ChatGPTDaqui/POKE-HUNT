// Família Pedra e cristal (09/10): quatro golpes a partir da descrição do jogo
// (frase no comentário). Precipice Blades é de ÁREA.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, estilhacos, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { interior } from './comum'
import { BRANCO, ESCURO, comAcento, entrePontos, janela, montarFamilia, nuvem, poligono, setasDeStatus } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_PEDRA: Record<string, Perfil> = {
  smack_down: { contato: 200, fim: 340 },
  ancient_power: { contato: 320, fim: 320 },
  avalanche: { contato: 260, fim: 320 },
}
export const PERFIS_DE_PEDRA_EM_AREA: Record<string, Perfil> = {
  precipice_blades: { contato: 300, fim: 420 },
}

const LAVA = ['#e0401a', '#ffb03a'] as const, ARCO_IRIS = ['#e0303a', '#ff9a3a', '#ffd23a', '#5cd65c', '#58a6f0']

function pedra(ctx: CanvasRenderingContext2D, p: Ponto, r: number, giro: number, pele: Pele, brilhando?: string): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(giro); ctx.scale(r / 5, r / 5)
  if (brilhando) poligono(ctx, [[-7.4, -2.6], [-2.6, -7.4], [5.4, -6.2], [7.6, 1.4], [2.6, 7.2], [-5.4, 5.4]], brilhando)
  poligono(ctx, [[-5.6, -2], [-2, -5.6], [4, -4.6], [5.8, 1], [2, 5.4], [-4, 4]], ESCURO)
  poligono(ctx, [[-4.4, -1.6], [-1.6, -4.4], [3, -3.6], [4.6, .8], [1.6, 4.2], [-3, 3]], pele.base)
  poligono(ctx, [[-2.6, -2], [0, -3.4], [2, -2], [0, -.6]], pele.meio)
  ctx.restore()
}

function choque(c: ContextoVfx, p: Ponto, t: number, tamanho: number, semente: number): void {
  estrelaDeImpacto(c.ctx, p, tamanho + c.tier * 1.2, t, c.pele, rngSemeado(semente))
  riscos(c.ctx, p, c.pedir(2 + c.tier), 16 + c.tier * 3, t, c.pele.meio, rngSemeado(semente + 1))
}

const GOLPES: Record<string, (p: Perfil, c: ContextoVfx, semente: number) => void> = {
  /** "Throws a stone or similar projectile. A flying Pokémon will fall to the ground when hit." */
  smack_down(p, c, semente) {
    const { ctx, ms, origem, alvo } = c
    // Pedra arremessada; o alvo é DERRUBADO: linhas de queda até o chão e poeira.
    const u = janela(ms, 30, p.contato - 30)
    if (u !== null) {
      const q = entrePontos({ x: origem.x, y: origem.y - 4 }, { x: alvo.x, y: alvo.y - 6 }, u)
      q.y -= Math.sin(u * Math.PI) * 14
      pedra(ctx, q, 5.4, u * 8, c.pele)
    }
    const t = janela(ms, p.contato, p.fim)
    if (t === null) return
    choque(c, { x: alvo.x, y: alvo.y - 6 }, t, 10, semente + 2)
    const cai = limitar(t / .5)
    for (const dx of [-7, 0, 7]) poligono(ctx, [[alvo.x + dx - .8, alvo.y - 18 + cai * 10], [alvo.x + dx + .8, alvo.y - 18 + cai * 10], [alvo.x + dx + .8, alvo.y - 8 + cai * 10], [alvo.x + dx - .8, alvo.y - 8 + cai * 10]], BRANCO)
    if (t > .35) nuvem(ctx, { x: alvo.x, y: alvo.y + 11 }, (t - .35) / .65, c.pedir(4), 14, PELES.GROUND, rngSemeado(semente + 3))
  },

  /** "Attacks with a prehistoric power. May also raise all the user's stats at once." */
  ancient_power(p, c, semente) {
    const { ctx, ms, origem, alvo } = c
    // Pedras ANTIGAS com contorno brilhante (runas) sobem em volta de quem ataca,
    // orbitam e voam no alvo; depois, setas de todas as cores (todos os status).
    const n = 5
    for (let k = 0; k < n; k++) {
      const a = k * Math.PI * 2 / n + ms / 200
      const sobe = saida(limitar(ms / 140))
      const roda = { x: origem.x + Math.cos(a) * 16, y: origem.y - 4 - 10 * sobe + Math.sin(a) * 6 }
      const vai = limitar((ms - 160 - k * 25) / (p.contato - 160 - 100))
      if (ms > p.contato + 10) continue
      const q = entrePontos(roda, { x: alvo.x + Math.cos(a) * 4, y: alvo.y - 4 }, entrada(vai))
      pedra(ctx, q, 3.8, a, c.pele, Math.floor(ms / 80 + k) % 2 ? LAVA[1] : PELES.PSYCHIC.meio)
    }
    const t = janela(ms, p.contato, p.fim)
    if (t === null) return
    choque(c, { x: alvo.x, y: alvo.y - 4 }, t, 11, semente + 2)
    estilhacos(ctx, { x: alvo.x, y: alvo.y - 4 }, c.pedir(4), 20, t, c.pele, rngSemeado(semente + 3))
    ARCO_IRIS.forEach((cor, k) => setasDeStatus(ctx, { x: origem.x + (k - 2) * 7, y: origem.y }, limitar(t * 1.2 - k * .05), cor, 1))
  },

  /** "Power doubles if the user has been hurt by the target in the same turn." */
  avalanche(p, c, semente) {
    const { ctx, ms, alvo } = c
    // Avalanche: blocos de neve e gelo despencam rolando de cima e soterram o alvo.
    const rng = rngSemeado(semente + 1)
    for (let k = 0; k < 6; k++) {
      const atraso = rng() * 120, dx = (rng() - .5) * 26, r = 4 + rng() * 3
      const cai = janela(ms, p.contato - 160 + atraso, 160)
      if (cai !== null) {
        const q = { x: alvo.x + dx - 18 * (1 - cai), y: alvo.y - 46 + 46 * entrada(cai) }
        ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(q.x, q.y, r + 1.3, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = c.pele.nucleo; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = c.pele.meio; ctx.beginPath(); ctx.arc(q.x + r * .3, q.y + r * .3, r * .5, 0, Math.PI * 2); ctx.fill()
      }
    }
    const t = janela(ms, p.contato, p.fim)
    if (t === null) return
    choque(c, { x: alvo.x, y: alvo.y - 2 }, t, 12, semente + 2)
    nuvem(ctx, { x: alvo.x, y: alvo.y + 6 }, t, c.pedir(7), 18, c.pele, rngSemeado(semente + 3), .6, 4, c.pele.nucleo, BRANCO)
    estilhacos(ctx, alvo, c.pedir(4), 22, t, c.pele, rngSemeado(semente + 4))
  },
}

/** "Manifests the power of the land in fearsome blades of stone." (área) */
function precipiceBlades(p: Perfil, c: ContextoVfx): void {
  const { ctx, ms, origem, raio, tier } = c
  const semente = Math.floor(c.rng() * 0xffffffff)
  // A terra racha em linhas de lava pelo interior da área e lâminas de pedra
  // gigantes BROTAM do chão, de dentro pra fora, atingindo todo mundo dentro.
  const pts = interior(origem, raio * .92, Math.min(10 + tier * 2, 14), .7)
  const racha = janela(ms, 0, p.contato + p.fim)
  if (racha !== null) {
    const k = saida(limitar(ms / p.contato)) * (1 - limitar((ms - p.contato - p.fim * .6) / (p.fim * .4)))
    for (const { p: q } of pts) {
      ctx.strokeStyle = ESCURO; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(origem.x, origem.y + 12); ctx.lineTo(origem.x + (q.x - origem.x) * k, origem.y + 12 + (q.y - origem.y) * k); ctx.stroke()
      ctx.strokeStyle = LAVA[0]; ctx.lineWidth = 1.4; ctx.stroke()
    }
  }
  pts.forEach(({ p: q, d }, i) => {
    const ini = p.contato - 120 + (d / raio) * 160
    const t = janela(ms, ini, p.fim + 120 - (d / raio) * 160)
    if (t === null) return
    const h = (26 + (i % 3) * 8) * saida(limitar(t / .25)) * (1 - entrada(limitar((t - .7) / .3)))
    if (h < 1) return
    const w = 6 + (i % 2) * 2
    poligono(ctx, [[q.x - w - 1.4, q.y], [q.x + w + 1.4, q.y], [q.x + 2, q.y - h - 1.6], [q.x - 3, q.y - h * .7]], ESCURO)
    poligono(ctx, [[q.x - w, q.y], [q.x + w, q.y], [q.x + 1.4, q.y - h], [q.x - 2.4, q.y - h * .7]], c.pele.base)
    poligono(ctx, [[q.x - w * .4, q.y], [q.x + w * .2, q.y], [q.x + .6, q.y - h * .9], [q.x - 1.4, q.y - h * .65]], c.pele.meio)
    ctx.fillStyle = LAVA[1]; ctx.fillRect(q.x - w + 1, q.y - 2, w * 2 - 2, 1.6)
  })
  const t = janela(ms, p.contato, p.fim)
  if (t !== null) nuvem(ctx, { x: origem.x, y: origem.y + 12 }, t, c.pedir(6), raio * .6, PELES.GROUND, rngSemeado(semente + 2), .45, 6)
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'ROCK'], ...LAVA, ...ARCO_IRIS, PELES.PSYCHIC.meio,
  PELES.GROUND.contorno, PELES.GROUND.base, PELES.GROUND.meio)

export const PEDRAS_POR_GOLPE = montarFamilia(PERFIS_DE_PEDRA, {
  desenhar: (p, c, id) => GOLPES[id](p, c, Math.floor(c.rng() * 0xffffffff)),
  duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 56,
  margem: () => ({ cima: 66, baixo: 56, lados: 56 }), pele: peleDe,
})

export const PEDRAS_EM_AREA_POR_GOLPE = montarFamilia(PERFIS_DE_PEDRA_EM_AREA, {
  desenhar: precipiceBlades, duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 40, pele: peleDe,
})
