// Aumentos defensivos (12/11): sete golpes de status em que quem usa SOBE a
// própria Defesa ou Defesa Especial. Oitava família de golpes de status com
// efeito próprio.
//
// Cada um parte da descrição do jogo, e a forma é do golpe, não da família:
//   Harden placas sextavadas estalam no lugar, uma a uma · Withdraw duas
//   metades de casco fecham por cima e por baixo · Defense Curl um traço se
//   enrola em espiral pra dentro · Iron Defense rebites e um reflexo de metal
//   que varre o corpo · Acid Armor o corpo pinga, empoça e as gotas voltam
//   subindo · Cotton Guard chumaços de algodão brotam em roda e quicam ·
//   Amnesia interrogações sobem da cabeça e viram reticências.
//
// TUDO acontece em quem USA o golpe. `origem` é o ALTO do corpo: meio em
// `o.y + 3`, pés em `o.y + 12`, cabeça em `o.y - 9`. Peça por fora do corpo,
// nada chapado em cima. Sem alfa: some encolhendo.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, limitar, recuo, saida } from '../primitivas'
import { BRANCO, ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import { conta, disco, fio, linha, traco } from './tracos'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `sobe`: o golpe se arma · `fica`: no auge · `some`: assenta. */
interface Perfil { sobe: number; fica: number; some: number }

export const PERFIS_DE_AUMENTO_DEFENSIVO: Record<string, Perfil> = {
  harden: { sobe: 420, fica: 380, some: 220 },
  withdraw: { sobe: 300, fica: 460, some: 260 },
  defense_curl: { sobe: 420, fica: 360, some: 240 },
  iron_defense: { sobe: 240, fica: 540, some: 220 },
  acid_armor: { sobe: 380, fica: 480, some: 260 },
  cotton_guard: { sobe: 440, fica: 420, some: 260 },
  amnesia: { sobe: 300, fica: 560, some: 260 },
}

const COR = {
  placa: ['#6a7078', '#aab2bc', '#e8eef4'],
  casco: ['#7a5a2a', '#c8a050', '#f4e0a0'],
  curva: ['#8a6a4a', '#e8c890', '#fff4d8'],
  ferro: ['#4a5262', '#9aa6b8', '#f4f8ff'],
  acido: ['#5a2a7a', '#b060e0', '#ecc8ff'],
  algodao: ['#b8c0cc', '#f4f6fa', '#ffffff'],
  vazio: ['#5a6a9a', '#a8c0f0', '#f0f6ff'],
} as const

interface Cena {
  c: ContextoVfx; p: Perfil
  /** Alto do corpo, meio do corpo, chão e cabeça. */
  o: Ponto; meio: Ponto; chao: number; cabeca: Ponto
  sobe: number; fica: number | null; some: number
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  return {
    c, p, o: c.origem, meio: { x: c.origem.x, y: c.origem.y + 3 }, chao: c.origem.y + 12, cabeca: { x: c.origem.x, y: c.origem.y - 9 },
    sobe: limitar(c.ms / p.sobe), fica: janela(c.ms, p.sobe, p.fica), some: limitar((c.ms - p.sobe - p.fica) / p.some),
  }
}

const GOLPES: Record<string, (s: Cena) => void> = {
  /** "The user stiffens all the muscles in its body to raise its Defense stat." */
  harden(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.placa
    // Seis PLACAS sextavadas chegam de fora e estalam no lugar em volta do
    // corpo, uma a uma; cada encaixe dá um clique de luz.
    const fino = 1 - entrada(s.some)
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 3, e = s.c.ms / s.p.sobe * 1.5 - i * .1
      if (e <= 0) continue
      const dist = 13 + (1 - recuo(Math.min(1, e))) * 12, x = s.meio.x + Math.cos(a) * dist, y = s.meio.y + Math.sin(a) * dist * .85
      const k = 4.8 * fino
      const hex = (g: number): [number, number][] => Array.from({ length: 6 }, (_, j) => {
        const b = j * Math.PI / 3 + Math.PI / 6
        return [x + Math.cos(b) * (k + g), y + Math.sin(b) * (k + g)] as [number, number]
      })
      if (k < .6) continue
      poligono(ctx, hex(1.2), ESCURO); poligono(ctx, hex(0), meio)
      poligono(ctx, [hex(0)[3], hex(0)[4], hex(0)[5], [x, y]], luz)
      poligono(ctx, [hex(0)[0], hex(0)[1], hex(0)[2], [x, y]], fundo)
      if (e >= 1 && e < 1.25) brilho(ctx, x, y, 3.4 * (1 - (e - 1) / .25) + .6, BRANCO)
    }
  },

  /** "The user withdraws its body into its hard shell, raising its Defense stat." */
  withdraw(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.casco
    // Duas METADES de casco: a de cima desce, a de baixo sobe, fecham em torno
    // do corpo com um tranco e uma faísca na emenda; depois reabrem.
    const fecha = s.fica === null ? (s.some > 0 ? 1 - saida(s.some) : recuo(s.sobe)) : 1, abre = (1 - fecha) * 14
    const k = Math.min(1, s.sobe * 4) * (1 - entrada(limitar((s.some - .5) / .5)))
    if (k < .1) return
    for (const lado of [-1, 1]) {
      const cy = s.meio.y + lado * (abre + 1), pts: Ponto[] = []
      // Arco grosso (só a casca, sem miolo): o corpo continua visível no vão.
      for (let j = 0; j <= 8; j++) { const a = Math.PI * (j / 8); pts.push({ x: s.meio.x - Math.cos(a) * 14 * k, y: cy + lado * Math.sin(a) * 11 * k }) }
      traco(ctx, pts, 3.4 * k, meio)
      linha(ctx, pts.slice(1, 5), 1.2 * k, luz)
      // Gomos do casco.
      for (const j of [2, 4, 6]) fio(ctx, pts[j], { x: s.meio.x + (pts[j].x - s.meio.x) * .72, y: cy + (pts[j].y - cy) * .72 }, 1.2 * k, fundo)
    }
    if (s.fica !== null && s.fica < .22) for (const lado of [-1, 1]) brilho(ctx, s.meio.x + lado * 14, s.meio.y, 4 * (1 - s.fica / .22) + .8, luz)
  },

  /** "The user curls up to conceal weak spots and raise its Defense stat." */
  defense_curl(s) {
    const { ctx, ms } = s.c, [, meio, luz] = COR.curva
    // Um traço se ENROLA: nasce largo, dá duas voltas e meia fechando pra
    // dentro; no auge vira um anel justo que pulsa uma vez.
    const fino = 1 - entrada(s.some), ate = saida(s.sobe)
    if (s.fica === null && s.some <= 0) {
      const pts: Ponto[] = []
      for (let i = 0; i <= 40; i++) {
        const f = (i / 40) * ate, a = -Math.PI / 2 + f * Math.PI * 5, R = 19 - f * 8
        pts.push({ x: s.meio.x + Math.cos(a) * R, y: s.meio.y + Math.sin(a) * R * .85 })
      }
      const cauda = Math.max(0, pts.length - 18)
      linha(ctx, pts.slice(cauda), 3.4, ESCURO); linha(ctx, pts.slice(cauda), 1.6, meio)
      const p = pts[pts.length - 1]
      conta(ctx, p.x, p.y, 2, luz)
      return
    }
    const t = s.fica ?? 1, pulso = 1 + Math.sin(limitar(t / .4) * Math.PI) * .18, R = 11.5 * pulso * fino
    const pts: Ponto[] = []
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2 + ms * .004; pts.push({ x: s.meio.x + Math.cos(a) * R, y: s.meio.y + Math.sin(a) * R * .85 }) }
    linha(ctx, pts, 3.4 * fino, ESCURO); linha(ctx, pts, 1.6 * fino, meio); linha(ctx, pts.slice(0, 7), 1.6 * fino, luz)
  },

  /** "The user hardens its body's surface like iron, sharply raising its Defense stat." */
  iron_defense(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.ferro
    // FERRO: quatro cantoneiras rebitadas travam nos cantos do corpo e um
    // reflexo diagonal de metal varre de ponta a ponta, duas vezes.
    const fino = 1 - entrada(s.some), trava = recuo(s.sobe), L = 5.5 * fino
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const x = s.meio.x + sx * (12 + (1 - trava) * 9), y = s.meio.y + sy * (11 + (1 - trava) * 8)
      if (L < .8) continue
      traco(ctx, [{ x: x - sx * L, y }, { x, y }, { x, y: y - sy * L }], 2.2 * fino, meio)
      conta(ctx, x, y, 1.3 * fino, luz)
    }
    if (s.fica !== null) for (let v = 0; v < 2; v++) {
      const u = (s.fica - v * .45) / .4
      if (u <= 0 || u >= 1) continue
      const d = -18 + u * 36
      for (const [desl, w, cor] of [[0, 2.6, luz], [4.5, 1.2, BRANCO]] as const) {
        const cx = s.meio.x + d + desl
        fio(ctx, { x: cx + 7, y: s.meio.y - 11 }, { x: cx - 7, y: s.meio.y + 11 }, w, cor)
      }
    }
    if (s.fica !== null && s.fica < .14) for (const lado of [-1, 1]) fio(ctx, { x: s.meio.x + lado * 17, y: s.meio.y - 3 }, { x: s.meio.x + lado * 21, y: s.meio.y - 5 }, 1.4, fundo)
  },

  /** "The user alters its cellular structure to liquefy itself, sharply raising its Defense stat." */
  acid_armor(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.acido
    // O corpo DERRETE: gotas escorrem dele e empoçam; no auge o filme roda ao
    // contrário — as gotas sobem da poça e fecham um cordão brilhante.
    const fino = 1 - entrada(s.some), poca = (s.fica === null ? (s.some > 0 ? 0 : saida(s.sobe)) : 1 - saida(limitar(s.fica / .6)))
    const rx = 13 * poca, ry = 3 * poca
    if (rx > 1.5) {
      poligono(ctx, [[s.o.x - rx - 1, s.chao + .5], [s.o.x - rx * .5, s.chao - ry - 1], [s.o.x + rx * .6, s.chao - ry - 1], [s.o.x + rx + 1, s.chao + .5], [s.o.x + rx * .5, s.chao + ry + 1], [s.o.x - rx * .5, s.chao + ry + 1]], ESCURO)
      poligono(ctx, [[s.o.x - rx, s.chao + .5], [s.o.x - rx * .5, s.chao - ry], [s.o.x + rx * .6, s.chao - ry], [s.o.x + rx, s.chao + .5], [s.o.x + rx * .5, s.chao + ry], [s.o.x - rx * .5, s.chao + ry]], fundo)
      fio(ctx, { x: s.o.x - rx * .4, y: s.chao - ry * .3 }, { x: s.o.x + rx * .3, y: s.chao - ry * .5 }, 1, meio)
    }
    for (let i = 0; i < 6; i++) {
      const x = s.o.x - 10 + i * 4, alto = s.meio.y - 6 + (i % 3) * 3
      // Descendo (sobe→) e depois subindo (fica→).
      const desce = limitar(s.sobe * 1.4 - i * .06), volta = s.fica === null ? (s.some > 0 ? 1 : 0) : saida(limitar(s.fica / .6 - i * .04))
      const f = volta > 0 ? 1 - volta : entrada(desce)
      if (desce <= 0) continue
      const y = alto + (s.chao - alto) * f
      const lugar = volta >= 1 ? { x: s.meio.x + Math.cos(i * Math.PI / 3) * 12, y: s.meio.y + Math.sin(i * Math.PI / 3) * 10 } : { x, y }
      // Gota de ponta pra cima quando cai, redonda quando volta.
      if (volta <= 0) poligono(ctx, [[lugar.x, lugar.y - 4.6], [lugar.x + 2.6, lugar.y + .5], [lugar.x, lugar.y + 3], [lugar.x - 2.6, lugar.y + .5]], ESCURO)
      conta(ctx, lugar.x, lugar.y, 1.7 * fino, meio); disco(ctx, lugar.x - .5, lugar.y - .6, .6 * fino, luz)
    }
    if (s.fica !== null && s.fica > .6 && s.fica < .8) brilho(ctx, s.meio.x, s.meio.y - 12, 5 * (1 - (s.fica - .6) / .2) + .8, luz)
  },

  /** "The user protects itself by wrapping its body in soft cotton, which drastically raises the user's Defense stat." */
  cotton_guard(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.algodao
    // Oito CHUMAÇOS brotam em roda, um por vez, com um quique fofo; no auge
    // balançam juntos; no fim murcham.
    const fino = 1 - entrada(s.some)
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 4, e = limitar(s.c.ms / s.p.sobe * 1.6 - i * .09)
      if (e <= 0) continue
      const balanca = s.fica !== null ? Math.sin(ms * .012 + i) * .8 : 0
      const x = s.meio.x + Math.cos(a) * 13.5 + balanca, y = s.meio.y + Math.sin(a) * 11.5, k = recuo(e) * fino
      if (k < .15) continue
      // Três gomos: é o que separa algodão de bolha.
      for (const [g, cor] of [[1.1, ESCURO], [0, fundo]] as const) {
        disco(ctx, x - 2.2 * k, y + .8 * k, (2.6 + g) * k, cor); disco(ctx, x + 2.2 * k, y + .8 * k, (2.6 + g) * k, cor); disco(ctx, x, y - 1.4 * k, (3 + g) * k, cor)
      }
      disco(ctx, x - 1.6 * k, y + .2 * k, 2 * k, meio); disco(ctx, x + 1.4 * k, y + .2 * k, 2 * k, meio); disco(ctx, x - .4 * k, y - 1.8 * k, 2.3 * k, luz)
    }
  },

  /** "The user temporarily empties its mind to forget its concerns. This sharply raises the user's Sp. Def stat." */
  amnesia(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.vazio
    // A mente ESVAZIA: três interrogações sobem da cabeça balançando e, uma a
    // uma, viram reticências que se apagam.
    const fino = 1 - entrada(s.some)
    for (let i = 0; i < 3; i++) {
      const t = (ms - i * 150) / (s.p.sobe + s.p.fica)
      if (t <= 0 || t >= 1.15) continue
      const x = s.cabeca.x + (i - 1) * 8 + Math.sin(ms * .006 + i * 2) * 2, y = s.cabeca.y - 5 - saida(limitar(t)) * 14
      const k = Math.min(1, t * 5) * fino
      if (t < .6) {
        // "?": gancho + ponto.
        const gancho = [{ x: x - 2.2 * k, y: y - 3 * k }, { x: x - 1, y: y - 5 * k }, { x: x + 1.6 * k, y: y - 5 * k }, { x: x + 2.4 * k, y: y - 3.2 * k }, { x, y: y - .8 * k }, { x, y: y + .6 * k }]
        traco(ctx, gancho, 1.5 * k, i === 1 ? luz : meio)
        conta(ctx, x, y + 3.2 * k, 1 * k, i === 1 ? luz : meio)
      }
      else {
        // "...": três pontos que somem da esquerda pra direita.
        const some = (t - .6) / .55
        for (let j = 0; j < 3; j++) if (some < (j + 1) / 3) conta(ctx, x + (j - 1) * 3.2, y - 1, 1.1 * k, fundo)
      }
    }
    if (s.fica !== null && s.fica > .8) brilho(ctx, s.cabeca.x, s.cabeca.y - 12, 4.5 * Math.sin((s.fica - .8) / .2 * Math.PI) + .6, luz)
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...Object.values(COR).flat())

export const AUMENTOS_DEFENSIVOS_POR_GOLPE = montarFamilia(PERFIS_DE_AUMENTO_DEFENSIVO, {
  desenhar: (p, c, id) => GOLPES[id](cena(p, c)),
  duracao: p => p.sobe + p.fica + p.some,
  contato: p => p.sobe,
  alcance: 44, margem: () => ({ cima: 50, baixo: 30, lados: 44 }), pele: peleDe,
})
