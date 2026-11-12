// Ligeireza (12/11): cinco golpes de status em que quem usa SOBE a própria
// Velocidade ou Evasão. Nona família de golpes de status com efeito próprio.
//
// Cada um parte da descrição do jogo, e a forma é do golpe, não da família:
//   Agility divisas de vento atravessam o corpo e os pés soltam poeira · Rock
//   Polish um pano invisível esfrega em círculo e deixa brilhos onde passa ·
//   Autotomize lascas de metal se soltam, caem e quicam; o corpo fica leve ·
//   Double Team dois contornos tracejados saltam pros lados e voltam,
//   piscando · Minimize quatro setas apertam um quadro até ele sumir num
//   estalo.
//
// TUDO acontece em quem USA o golpe. `origem` é o ALTO do corpo: meio em
// `o.y + 3`, pés em `o.y + 12`, cabeça em `o.y - 9`. Sem alfa.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, limitar, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import { conta, fio, linha, traco } from './tracos'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `sobe`: o golpe se arma · `fica`: no auge · `some`: assenta. */
interface Perfil { sobe: number; fica: number; some: number }

export const PERFIS_DE_LIGEIREZA: Record<string, Perfil> = {
  agility: { sobe: 200, fica: 560, some: 220 },
  rock_polish: { sobe: 260, fica: 560, some: 240 },
  autotomize: { sobe: 300, fica: 520, some: 240 },
  double_team: { sobe: 220, fica: 560, some: 220 },
  minimize: { sobe: 360, fica: 380, some: 220 },
}

const COR = {
  vento: ['#5a8ab8', '#a8dcff', '#f0fbff'],
  polido: ['#8a8070', '#e8dcc0', '#fffbe8'],
  metal: ['#4a5262', '#9aa6b8', '#f4f8ff'],
  copia: ['#6a7a9a', '#c8d8f0', '#ffffff'],
  aperto: ['#a03a8a', '#f08ad8', '#ffe0f8'],
} as const

interface Cena {
  c: ContextoVfx; p: Perfil; semente: number
  o: Ponto; meio: Ponto; chao: number
  sobe: number; fica: number | null; some: number
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  return {
    c, p, semente: Math.floor(c.rng() * 0xffffffff), o: c.origem, meio: { x: c.origem.x, y: c.origem.y + 3 }, chao: c.origem.y + 12,
    sobe: limitar(c.ms / p.sobe), fica: janela(c.ms, p.sobe, p.fica), some: limitar((c.ms - p.sobe - p.fica) / p.some),
  }
}

const GOLPES: Record<string, (s: Cena) => void> = {
  /** "The user relaxes and lightens its body to move faster. This sharply raises the Speed stat." */
  agility(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.vento
    // DIVISAS de vento (>>>) atravessam o corpo de um lado ao outro, em três
    // alturas e cada vez mais rápidas; os pés soltam poeira pra trás.
    const forca = Math.min(1, s.sobe * 2) * (1 - entrada(s.some))
    for (let i = 0; i < 3; i++) {
      const passo = 300 - i * 50, u = ((ms + i * 110) / passo) % 1
      const x = s.meio.x - 22 + u * 44, y = s.meio.y - 8 + i * 8, vida = Math.sin(u * Math.PI) * forca
      if (vida < .15) continue
      for (let j = 0; j < 2; j++) {
        const px = x - j * 5
        const pts = [{ x: px - 3, y: y - 3.4 }, { x: px + 1.5, y }, { x: px - 3, y: y + 3.4 }]
        linha(ctx, pts, 3 * vida, fundo); linha(ctx, pts, 1.3 * vida, j ? meio : luz)
      }
      fio(ctx, { x: x - 11, y }, { x: x - 18, y }, 1.2 * vida, meio)
    }
    for (let i = 0; i < 2; i++) {
      const v = (ms / 240 + i * .5) % 1
      conta(ctx, s.meio.x - 8 - v * 10, s.chao - Math.sin(v * Math.PI) * 3, 1.4 * (1 - v) * forca, luz)
    }
  },

  /** "The user polishes its body to reduce drag. This sharply raises the Speed stat." */
  rock_polish(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.polido
    // Esfregar em CÍRCULO: um arco curto (o pano) dá voltas pelo corpo; onde
    // ele já passou fica um brilho de superfície lisa, até fechar quatro.
    const fino = 1 - entrada(s.some), volta = (s.sobe * .25 + (s.fica ?? (s.some > 0 ? 1 : 0)) * 1.75)
    const ang = -Math.PI / 2 + volta * Math.PI * 2, R = 11
    if (s.some <= 0) {
      const pts: Ponto[] = []
      for (let i = 0; i <= 8; i++) { const a = ang - (i / 8) * 1.3; pts.push({ x: s.meio.x + Math.cos(a) * R, y: s.meio.y + Math.sin(a) * R * .9 }) }
      linha(ctx, pts, 4, ESCURO); linha(ctx, pts, 2.2, meio); linha(ctx, pts.slice(0, 3), 2.2, luz)
      // Rabiscos de esfregão atrás do pano.
      for (let i = 0; i < 2; i++) {
        const a = ang - 1.5 - i * .35
        fio(ctx, { x: s.meio.x + Math.cos(a) * (R - 2), y: s.meio.y + Math.sin(a) * (R - 2) * .9 }, { x: s.meio.x + Math.cos(a) * (R + 2), y: s.meio.y + Math.sin(a) * (R + 2) * .9 }, 1, fundo)
      }
    }
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 2 + .5, passou = volta * 4 - (i + .6)
      if (passou <= 0) continue
      const pisca = .75 + Math.sin(ms * .02 + i * 2) * .25
      brilho(ctx, s.meio.x + Math.cos(a) * 12, s.meio.y + Math.sin(a) * 10, (2.6 * Math.min(1, passou * 2.5) * pisca + .4) * fino, luz)
    }
  },

  /** "The user sheds part of its body to make itself lighter and sharply raise its Speed stat." */
  autotomize(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.metal
    // LASCAS de metal se desprendem dos lados, caem, quicam e ficam no chão;
    // mais leve, o corpo ganha dois riscos subindo.
    const fino = 1 - entrada(s.some)
    for (let i = 0; i < 4; i++) {
      const rng = rngSemeado(s.semente + i * 71)
      const lado = i % 2 ? 1 : -1, t = (ms - i * 70) / 420
      if (t <= 0) continue
      const x0 = s.meio.x + lado * 7, y0 = s.meio.y - 4 + rng() * 6
      const alvoX = x0 + lado * (8 + rng() * 6), queda = Math.min(1, t)
      const quique = t > 1 ? Math.abs(Math.sin((t - 1) * Math.PI * 1.6)) * 4 * Math.exp(-(t - 1) * 2.5) : 0
      const x = x0 + (alvoX - x0) * queda, y = y0 + (s.chao - 1 - y0) * queda * queda - quique
      const giro = t < 1.4 ? t * 7 + i : i * .9, k = 2.8 * fino
      const c = Math.cos(giro), sn = Math.sin(giro)
      const forma = (g: number): [number, number][] => ([[-1.3, -.6], [.6, -1], [1.3, .4], [-.4, 1]] as const).map(([px, py]) => [x + (px * c - py * sn) * (k + g), y + (px * sn + py * c) * (k + g)] as [number, number])
      if (k < .5) continue
      poligono(ctx, forma(1.1), ESCURO); poligono(ctx, forma(0), i % 2 ? meio : fundo)
      const [q0, q1] = forma(0)
      fio(ctx, { x: q0[0], y: q0[1] }, { x: q1[0], y: q1[1] }, .9, luz)
    }
    if (s.fica !== null && s.fica > .35) for (const lado of [-1, 1]) {
      const v = ((s.fica - .35) * 2.6 + (lado > 0 ? .3 : 0)) % 1
      const x = s.meio.x + lado * 12, y = s.meio.y + 4 - v * 16
      fio(ctx, { x, y: y + 5 }, { x, y }, 2.6 * Math.sin(v * Math.PI), ESCURO)
      fio(ctx, { x, y: y + 5 }, { x, y }, 1.1 * Math.sin(v * Math.PI), luz)
    }
  },

  /** "By moving rapidly, the user makes illusory copies of itself to raise its evasiveness." */
  double_team(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.copia
    // Cópias ILUSÓRIAS: dois contornos TRACEJADOS do tamanho do corpo saltam
    // pros lados e voltam, piscando alternados — nunca os dois acesos juntos.
    const forca = Math.min(1, s.sobe * 2) * (1 - entrada(s.some))
    const vai = Math.abs(Math.sin(ms * .011)), aceso = Math.floor(ms / 60) % 2
    for (const lado of [-1, 1]) {
      if ((lado > 0 ? 1 : 0) !== aceso && s.fica !== null) continue
      const cx = s.meio.x + lado * (5 + vai * 9), n = 14
      for (let i = 0; i < n; i += 2) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2
        const p0 = { x: cx + Math.cos(a0) * 7, y: s.meio.y + Math.sin(a0) * 10 }, p1 = { x: cx + Math.cos(a1) * 7, y: s.meio.y + Math.sin(a1) * 10 }
        fio(ctx, p0, p1, 3 * forca, fundo); fio(ctx, p0, p1, 1.3 * forca, lado > 0 ? luz : meio)
      }
    }
    // Riscos de deslocamento no chão.
    for (const lado of [-1, 1]) fio(ctx, { x: s.meio.x + lado * 5, y: s.chao + 1 }, { x: s.meio.x + lado * (8 + vai * 12), y: s.chao + 1 }, 1.2 * forca, meio)
  },

  /** "The user compresses its body to make itself look smaller, which sharply raises its evasiveness." */
  minimize(s) {
    const { ctx } = s.c, [, meio, luz] = COR.aperto
    // Quatro SETAS nos cantos apertam um quadro em volta do corpo; ele encolhe
    // em três trancos até caber num ponto e some num estalo.
    const t = s.fica === null ? (s.some > 0 ? 1 : 0) : s.fica
    const degrau = s.fica === null && s.some <= 0 ? 0 : Math.min(3, Math.floor(t * 3.6) + 1)
    const tam = [1, .72, .46, .2][degrau] * saida(Math.min(1, s.sobe * 1.4))
    const L = 15 * tam, A = 13 * tam
    if (s.some > 0) { if (s.some < .5) brilho(ctx, s.meio.x, s.meio.y, 6 * (1 - s.some / .5) + 1, luz); return }
    if (L < 1) return
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const x = s.meio.x + sx * L, y = s.meio.y + sy * A, q = 4.5
      // Cantoneira do quadro.
      traco(ctx, [{ x: x - sx * q, y }, { x, y }, { x, y: y - sy * q }], 1.5, meio)
      // Seta apontando pra dentro, um pouco fora do canto.
      const fx = x + sx * 4, fy = y + sy * 4
      poligono(ctx, [[fx - sx * 4.6, fy - sy * 4.6], [fx + sx * 2.2 - sy * 3.4, fy + sy * 2.2 + sx * 3.4], [fx + sx * 2.2 + sy * 3.4, fy + sy * 2.2 - sx * 3.4]], ESCURO)
      poligono(ctx, [[fx - sx * 3, fy - sy * 3], [fx + sx * 1.4 - sy * 2.2, fy + sy * 1.4 + sx * 2.2], [fx + sx * 1.4 + sy * 2.2, fy + sy * 1.4 - sx * 2.2]], degrau % 2 ? luz : meio)
    }
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...Object.values(COR).flat())

export const LIGEIREZA_POR_GOLPE = montarFamilia(PERFIS_DE_LIGEIREZA, {
  desenhar: (p, c, id) => GOLPES[id](cena(p, c)),
  duracao: p => p.sobe + p.fica + p.some,
  contato: p => p.sobe,
  alcance: 44, margem: () => ({ cima: 44, baixo: 30, lados: 48 }), pele: peleDe,
})
