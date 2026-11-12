// Armadilhas de campo (12/11): os quatro golpes que PLANTAM uma armadilha no
// lado do adversário. Terceira família de golpes de status com efeito próprio.
// O que se desenha aqui é o plantio — a armadilha em si é estado do mundo
// (`world.enemyHazards`) e dispara no próximo inimigo que nascer.
//
// Cada um parte da descrição do jogo, e a forma é do golpe, não da família:
//   Spikes estrepes de aço arremessados que quicam e ficam de ponta pra cima ·
//   Toxic Spikes farpas roxas que cravam tortas, balançam e empoçam veneno ·
//   Stealth Rock pedras pontudas que BROTAM do chão, flutuam em roda e somem
//   num lampejo · Sticky Web um fio disparado que abre uma teia no chão.
//
// Diferente de Barreiras e Clima, aqui há DOIS lugares: sai de quem usa
// (`origem`) e pousa no chão sob o alvo (`alvo`). Sem alfa: some encolhendo.
//
// Inscrita em REGISTRO_DE_STATUS (12/11): o resolver NÃO ancora em quem usou
// (`noCorpo` falso para golpe com `hazard`).
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, limitar, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `lanca`: sai de quem usa · `finca`: pousou, a armadilha se arma · `some`: assenta. */
interface Perfil { lanca: number; finca: number; some: number }

export const PERFIS_DE_ARMADILHA: Record<string, Perfil> = {
  spikes: { lanca: 320, finca: 420, some: 240 },
  toxic_spikes: { lanca: 340, finca: 500, some: 260 },
  stealth_rock: { lanca: 320, finca: 540, some: 280 },
  sticky_web: { lanca: 260, finca: 540, some: 260 },
}

const COR = {
  aco: ['#4a4f5c', '#9aa3b2', '#e8edf5'],
  veneno: ['#4a1f6e', '#9b4fd0', '#e3b5ff'],
  rocha: ['#5b4a3a', '#9a8468', '#d8c8a8'],
  teia: ['#8d95a8', '#e9eef7', '#fff2a0'],
} as const

interface Cena {
  c: ContextoVfx; p: Perfil; semente: number
  /** Peito de quem usa, peito do alvo e o chão sob os pés do alvo. */
  o: Ponto; a: Ponto; chao: number
  /** 0..1 no auge (null fora da fase) e 0..1 assentando. */
  finca: number | null; some: number
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  return {
    c, p, semente: Math.floor(c.rng() * 0xffffffff), o: c.origem, a: c.alvo, chao: c.alvo.y + 12,
    finca: janela(c.ms, p.lanca, p.finca), some: limitar((c.ms - p.lanca - p.finca) / p.some),
  }
}

function fio(ctx: CanvasRenderingContext2D, a: Ponto, b: Ponto, largura: number, cor: string): void {
  if (largura <= .2) return
  ctx.lineCap = 'round'; ctx.strokeStyle = cor; ctx.lineWidth = largura
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
}
function linha(ctx: CanvasRenderingContext2D, pts: readonly Ponto[], largura: number, cor: string): void {
  if (pts.length < 2 || largura <= .2) return
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = cor; ctx.lineWidth = largura
  ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke()
}
function disco(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, cor: string): void {
  if (r <= .3) return
  ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
}
/** Ponta triangular saindo de (x,y) na direção `ang`. `folga` engorda (contorno). */
function ponta(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, comp: number, larg: number, cor: string, folga = 0): void {
  if (comp <= .4) return
  const ca = Math.cos(ang), sa = Math.sin(ang), c = comp + folga * 1.3, l = larg + folga, r = folga
  poligono(ctx, [[x + ca * c, y + sa * c], [x - ca * r - sa * l, y - sa * r + ca * l], [x - ca * r + sa * l, y - sa * r - ca * l]], cor)
}
/** Arco de arremesso: de `de` até `ate`, subindo `alto` no meio. */
const arco = (de: Ponto, ate: Ponto, u: number, alto: number): Ponto =>
  ({ x: de.x + (ate.x - de.x) * u, y: de.y + (ate.y - de.y) * u - alto * 4 * u * (1 - u) })
/** Dois ticks de poeira abrindo no pouso. */
function poeira(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, cor: string): void {
  if (k <= 0 || k >= 1) return
  const r = 2 + k * 4, w = 1.3 * (1 - k)
  fio(ctx, { x: x - r, y: y - k * 2 }, { x: x - r - 2, y: y - 1 - k * 3 }, w, cor)
  fio(ctx, { x: x + r, y: y - k * 2 }, { x: x + r + 2, y: y - 1 - k * 3 }, w, cor)
}

const GOLPES: Record<string, (s: Cena) => void> = {
  /** "The user lays a trap of spikes at the opposing team's feet." */
  spikes(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.aco
    // Punhado de estrepes arremessado em leque: cada um voa girando, QUICA uma
    // vez e para com uma ponta pra cima. No fim afundam no chão.
    const n = 5, voo = s.p.lanca - 120, k = 1 - entrada(s.some)
    for (let i = 0; i < n; i++) {
      const rng = rngSemeado(s.semente + i * 23)
      const destino = { x: s.a.x - 16 + i * 8 + (rng() - .5) * 3, y: s.chao - 1 + (i % 2 ? -3 : 2) }
      const t = ms - i * 30
      if (t <= 0) continue
      const u = limitar(t / voo), quique = limitar((t - voo) / 170)
      const pos = u < 1 ? arco(s.o, destino, u, 20 + rng() * 6) : { x: destino.x, y: destino.y - 5 * Math.sin(quique * Math.PI) }
      const plantado = u >= 1 && quique >= 1
      const rot = plantado ? 0 : t * .022 + i
      const angs = plantado ? [-Math.PI / 2, Math.PI * .88, Math.PI * .12] : [rot, rot + Math.PI / 2, rot + Math.PI, rot + Math.PI * 1.5]
      const comps = plantado ? [5.5, 4.4, 4.4] : [4.6, 4.6, 4.6, 4.6]
      for (const folga of [1.2, 0]) angs.forEach((a, j) =>
        ponta(ctx, pos.x, pos.y, a, comps[j] * k, 1.5 * k, folga ? ESCURO : j === 0 ? luz : j % 2 ? meio : fundo, folga * k))
      disco(ctx, pos.x, pos.y, 1.3 * k, meio)
      if (u >= 1) poeira(ctx, destino.x, s.chao + 2, quique, luz)
    }
    // Um lampejo corre pelas pontas: "armado".
    if (s.finca !== null && s.finca > .45) {
      const v = (s.finca - .45) / .55, i = Math.min(n - 1, Math.floor(v * n))
      brilho(ctx, s.a.x - 16 + i * 8, s.chao - 7 + (i % 2 ? -3 : 2), 3.2 * Math.sin((v * n % 1) * Math.PI) + .6, BRANCO)
    }
  },

  /** "The user lays a trap of poison spikes at the feet of the opposing team." */
  toxic_spikes(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.veneno
    // Três farpas grossas caem de ALTO, cravam tortas e ficam balançando até
    // parar; embaixo de cada uma o veneno empoça e borbulha.
    const n = 3, voo = s.p.lanca - 80, k = 1 - entrada(s.some)
    for (let i = 0; i < n; i++) {
      const rng = rngSemeado(s.semente + i * 41)
      const pe = { x: s.a.x - 14 + i * 14 + (rng() - .5) * 3, y: s.chao + (i === 1 ? 3 : -1) }
      const t = ms - i * 45
      if (t <= 0) continue
      const u = limitar(t / voo), apos = Math.max(0, t - voo)
      // Poça primeiro: fica por baixo da farpa.
      if (u >= 1) {
        const cresce = saida(limitar(apos / 300)) * k, rx = 7.5 * cresce, ry = 2.4 * cresce
        if (rx > 1) {
          poligono(ctx, [[pe.x - rx - 1, pe.y + 1], [pe.x - rx * .5, pe.y - ry], [pe.x + rx * .6, pe.y - ry - .4], [pe.x + rx + 1, pe.y + .6], [pe.x + rx * .4, pe.y + ry + 1], [pe.x - rx * .6, pe.y + ry + .8]], ESCURO)
          poligono(ctx, [[pe.x - rx, pe.y + .8], [pe.x - rx * .5, pe.y - ry + 1], [pe.x + rx * .6, pe.y - ry + .7], [pe.x + rx, pe.y + .5], [pe.x + rx * .4, pe.y + ry], [pe.x - rx * .6, pe.y + ry - .2]], fundo)
          fio(ctx, { x: pe.x - rx * .4, y: pe.y - ry * .3 }, { x: pe.x + rx * .2, y: pe.y - ry * .5 }, 1, meio)
        }
      }
      // A farpa: no ar aponta pra onde cai; cravada, balança em torno do pé.
      const inclina = (i - 1) * .32
      const balanco = Math.sin(apos * .03) * .42 * Math.exp(-apos / 190)
      const ar = arco(s.o, pe, u, 34)
      const ang = u < 1 ? Math.atan2(pe.y - ar.y + 14 * (u - .35), pe.x - ar.x + (pe.x - s.o.x) * .2 * (1 - u)) : Math.PI / 2 + inclina + balanco
      const base = u < 1 ? ar : pe, comp = 9 * k
      // `ang` é pra onde a ponta de BAIXO olha; o corpo sobe no sentido oposto.
      const topo = { x: base.x - Math.cos(ang) * comp, y: base.y - Math.sin(ang) * comp }
      const meioDoCorpo = { x: (base.x + topo.x) / 2, y: (base.y + topo.y) / 2 }
      for (const folga of [1.2, 0]) {
        ponta(ctx, meioDoCorpo.x, meioDoCorpo.y, ang, comp / 2, 2.2 * k, folga ? ESCURO : fundo, folga * k)
        ponta(ctx, meioDoCorpo.x, meioDoCorpo.y, ang + Math.PI, comp / 2 + 1, 2.2 * k, folga ? ESCURO : meio, folga * k)
        // Duas rebarbas: é o que separa farpa de estrepe.
        ponta(ctx, meioDoCorpo.x, meioDoCorpo.y, ang + Math.PI - 1.05, 4 * k, 1.1 * k, folga ? ESCURO : luz, folga * k)
        ponta(ctx, meioDoCorpo.x, meioDoCorpo.y, ang + Math.PI + 1.05, 4 * k, 1.1 * k, folga ? ESCURO : luz, folga * k)
      }
      // Bolhas subindo da poça e estourando.
      const bolhas = u >= 1 && apos > 160 && s.some < .5 ? s.c.pedir(2) : 0
      for (let b = 0; b < bolhas; b++) {
        const v = (apos / (420 + b * 130) + rng() + b * .5) % 1
        const bx = pe.x + (b ? 5 : -5) + Math.sin(v * 5 + i) * 1.2, by = pe.y - 1 - v * 11
        if (v < .82) { const r = .9 + v * 1.6; disco(ctx, bx, by, r + .9, ESCURO); disco(ctx, bx, by, r, meio); disco(ctx, bx - r * .3, by - r * .3, r * .35, BRANCO) }
        else { const e = (v - .82) / .18, r = 2.4 + e * 2; for (let q = 0; q < 3; q++) { const a = -Math.PI / 2 + (q - 1) * 1.1; fio(ctx, { x: bx + Math.cos(a) * r, y: by + Math.sin(a) * r }, { x: bx + Math.cos(a) * (r + 1.6), y: by + Math.sin(a) * (r + 1.6) }, 1.1 * (1 - e), luz) } }
      }
    }
  },

  /** "The user lays a trap of levitating stones around the opposing team." */
  stealth_rock(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.rocha
    // Nada é arremessado: o chão RACHA e cinco pedras pontudas brotam em volta
    // do alvo, sobem e ficam flutuando em roda. Somem uma a uma num lampejo —
    // "stealth": a armadilha fica, só não se vê.
    const n = 5, gira = ms * .0011
    for (let i = 0; i < n; i++) {
      const rng = rngSemeado(s.semente + i * 53)
      const a0 = (i / n) * Math.PI * 2 + .4
      const sobe = saida(limitar((ms - i * 45) / (s.p.lanca - 60)))
      if (sobe <= 0) continue
      const a = a0 + gira * sobe
      const raizX = s.a.x + Math.cos(a0) * 21, raizY = s.chao + Math.sin(a0) * 5
      const altura = (9 + rng() * 8) * sobe + Math.sin(ms * .006 + i * 1.7) * 1.6 * sobe
      const x = s.a.x + Math.cos(a) * 21, y = s.chao + Math.sin(a) * 5 - altura
      // Rachadura e farelo onde brotou.
      if (sobe < 1) {
        fio(ctx, { x: raizX - 4, y: raizY + 1 }, { x: raizX - 1, y: raizY - .5 }, 1.4, ESCURO)
        fio(ctx, { x: raizX - 1, y: raizY - .5 }, { x: raizX + 4, y: raizY + 1.2 }, 1.4, ESCURO)
        const farelos = s.c.pedir(2)
        for (let q = 0; q < farelos; q++) {
          const d = q ? 1 : -1
          disco(ctx, raizX + d * (2 + sobe * 5), raizY - Math.sin(sobe * Math.PI) * 6, 1.1 * (1 - sobe) + .4, meio)
        }
      }
      // Some: cada pedra na sua vez.
      const vez = limitar((s.some * 1.5 - i * .1) / .5)
      const k = (.75 + rng() * .5) * (1 - entrada(vez)) * Math.min(1, sobe * 1.6)
      if (vez > 0 && vez < 1) brilho(ctx, x, y, 4 * Math.sin(vez * Math.PI) + .5, BRANCO)
      if (k <= .08) continue
      const torto = (rng() - .5) * 2
      const forma = (g: number, dx: number, dy: number): [number, number][] => [
        [x + torto * k + dx, y - (7 + g) * k + dy], [x + (4 + g) * k + dx, y - 1.5 * k + dy], [x + (2.6 + g) * k + dx, y + (4 + g) * k + dy],
        [x - (2.2 + g) * k + dx, y + (4.6 + g) * k + dy], [x - (4.2 + g) * k + dx, y + .5 * k + dy],
      ]
      poligono(ctx, forma(1.3, 0, 0), ESCURO)
      poligono(ctx, forma(0, 0, 0), fundo)
      // Face clara à esquerda-cima, aresta de luz na ponta.
      poligono(ctx, [[x + torto * k, y - 7 * k], [x + .6 * k, y + 1 * k], [x - 2.2 * k, y + 4.6 * k], [x - 4.2 * k, y + .5 * k]], meio)
      poligono(ctx, [[x + torto * k, y - 7 * k], [x - 1 * k, y - 1.5 * k], [x - 3 * k, y - .2 * k]], luz)
    }
  },

  /** "The user weaves a sticky net around the opposing team." */
  sticky_web(s) {
    const { ctx, ms } = s.c, [fundo, meio, cola] = COR.teia
    // Um fio é DISPARADO de quem usa até o chão do alvo; lá a teia se abre:
    // primeiro os raios, depois dois anéis fiados de dentro pra fora, com barriga.
    // No fim gotas de cola brilham nos cruzamentos e a teia recolhe pro centro.
    const centro = { x: s.a.x, y: s.chao - 1 }, tiro = limitar(ms / s.p.lanca)
    const k = 1 - entrada(s.some), R = 25 * k, achata = .42
    // Fio de disparo: estica, e depois de preso recolhe a partir de quem usou.
    const solta = s.finca === null ? (s.some > 0 ? 1 : 0) : limitar(s.finca / .3)
    if (solta < 1) {
      const de = { x: s.o.x + (centro.x - s.o.x) * solta, y: s.o.y + (centro.y - s.o.y) * solta }
      const ate = { x: s.o.x + (centro.x - s.o.x) * saida(tiro), y: s.o.y + (centro.y - s.o.y) * saida(tiro) }
      fio(ctx, de, ate, 2.6, fundo); fio(ctx, de, ate, 1.1, meio)
      if (tiro < 1) { disco(ctx, ate.x, ate.y, 3, ESCURO); disco(ctx, ate.x, ate.y, 2, meio) }
    }
    if (s.finca === null && s.some <= 0) return
    const abre = s.finca === null ? 1 : saida(limitar(s.finca / .32))
    const raios = 8, no = (i: number, f: number): Ponto => {
      const a = (i / raios) * Math.PI * 2 + .2
      return { x: centro.x + Math.cos(a) * R * f, y: centro.y + Math.sin(a) * R * f * achata }
    }
    for (const [w, cor] of [[2, fundo], [.9, meio]] as const) {
      for (let i = 0; i < raios; i++) fio(ctx, centro, no(i, abre), w, cor)
      // Anéis: cada um só começa quando o anterior fechou.
      const fiado = s.finca === null ? 1 : limitar((s.finca - .28) / .5)
      for (let anel = 0; anel < 2; anel++) {
        const parte = limitar(fiado * 2 - anel), f = .5 + anel * .44
        const ate = Math.floor(parte * raios)
        for (let i = 0; i < ate; i++) {
          const p0 = no(i, f), p1 = no(i + 1, f)
          // Barriga pro centro: o fio entre dois raios cede.
          const m = { x: (p0.x + p1.x) / 2 + (centro.x - (p0.x + p1.x) / 2) * .16, y: (p0.y + p1.y) / 2 + (centro.y - (p0.y + p1.y) / 2) * .16 }
          linha(ctx, [p0, m, p1], w, cor)
        }
      }
    }
    // Cola: gotas nos cruzamentos de fora, piscando em rodízio.
    if (s.finca !== null && s.finca > .7 || s.some > 0 && s.some < .6) {
      const n = s.c.pedir(4)
      for (let j = 0; j < n; j++) {
        const q = no(j * 2 + 1, .96), pisca = Math.sin(ms * .012 + j * 1.6)
        disco(ctx, q.x, q.y, 2.1 * k, ESCURO); disco(ctx, q.x, q.y, 1.3 * k, cola)
        if (pisca > .6) brilho(ctx, q.x, q.y - 1, 2.6 * (pisca - .6) / .4 * k + .4, BRANCO)
      }
    }
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...Object.values(COR).flat())

export const ARMADILHAS_POR_GOLPE = montarFamilia(PERFIS_DE_ARMADILHA, {
  desenhar: (p, c, id) => GOLPES[id](cena(p, c)),
  duracao: p => p.lanca + p.finca + p.some,
  // "Contato" de uma armadilha é o instante em que ela POUSA.
  contato: p => p.lanca,
  alcance: 44, margem: () => ({ cima: 46, baixo: 30, lados: 44 }), pele: peleDe,
})
