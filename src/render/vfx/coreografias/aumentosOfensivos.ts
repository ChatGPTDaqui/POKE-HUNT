// Aumentos ofensivos (12/11): sete golpes de status em que quem usa SOBE o
// próprio Ataque ou Ataque Especial. Sétima família de golpes de status com
// efeito próprio.
//
// Cada um parte da descrição do jogo, e a forma é do golpe, não da família:
//   Swords Dance quatro espadas rodam fechando e cruzam no alto · Howl o uivo
//   sobe em arcos pela cabeça · Sharpen um contorno de polígono perde lados
//   até virar triângulo · Meditate ondas calmas no chão e uma centelha que
//   sobe por dentro · Hone Claws duas raspadas de garra com faísca · Work Up o
//   corpo bombeia e solta vapor em pulsos · Nasty Plot um balão de pensamento
//   escuro com chifres.
//
// TUDO acontece em quem USA o golpe (`origem`, o peito). O selo de atributo do
// jogo continua aparecendo por cima. Sem alfa: some encolhendo.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, limitar, saida } from '../primitivas'
import { BRANCO, ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import { anel, conta, disco, fio, linha, traco } from './tracos'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `sobe`: o golpe se arma · `fica`: no auge · `some`: assenta. */
interface Perfil { sobe: number; fica: number; some: number }

export const PERFIS_DE_AUMENTO_OFENSIVO: Record<string, Perfil> = {
  swords_dance: { sobe: 420, fica: 420, some: 240 },
  howl: { sobe: 220, fica: 560, some: 240 },
  sharpen: { sobe: 300, fica: 520, some: 240 },
  meditate: { sobe: 360, fica: 560, some: 280 },
  hone_claws: { sobe: 240, fica: 520, some: 220 },
  work_up: { sobe: 240, fica: 560, some: 240 },
  nasty_plot: { sobe: 320, fica: 540, some: 260 },
}

const COR = {
  aco: ['#5a6272', '#b8c2d2', '#f2f6fc'],
  cabo: ['#7a4a1e', '#e0a030'],
  uivo: ['#6a7a9a', '#c8d8f0', '#ffffff'],
  poligono: ['#2a8a9a', '#5ae0e8', '#e0ffff'],
  calma: ['#4a6ab0', '#9ac0ff', '#f0f6ff'],
  faisca: ['#c9952a', '#ffe36a', '#fffbe0'],
  esforco: ['#b03a2a', '#ff8a5a', '#ffe0d0'],
  trama: ['#3a2450', '#7a4ab0', '#d8a8ff'],
} as const

interface Cena {
  c: ContextoVfx; p: Perfil
  /** Peito de quem usa (alto do corpo: o meio fica uns 3 abaixo), o chão e a cabeça. */
  o: Ponto; chao: number; cabeca: Ponto
  /** 0..1 armando, 0..1 no auge (null fora da fase), 0..1 assentando. */
  sobe: number; fica: number | null; some: number
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  return {
    c, p, o: c.origem, chao: c.origem.y + 12, cabeca: { x: c.origem.x, y: c.origem.y - 9 },
    sobe: limitar(c.ms / p.sobe), fica: janela(c.ms, p.sobe, p.fica), some: limitar((c.ms - p.sobe - p.fica) / p.some),
  }
}
/** Leva pontos locais (x pra frente do ângulo) pro mundo. */
const girar = (pts: readonly (readonly [number, number])[], x: number, y: number, ang: number, k: number): [number, number][] => {
  const c = Math.cos(ang), s = Math.sin(ang)
  return pts.map(([px, py]) => [x + (px * c - py * s) * k, y + (px * s + py * c) * k])
}
/** Espada com a ponta em `ang`. */
function espada(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, k: number): void {
  if (k <= .15) return
  const [, meio, luz] = COR.aco
  poligono(ctx, girar([[11, 0], [8.4, -2.6], [-1.6, -2.6], [-1.6, 2.6], [8.4, 2.6]], x, y, ang, k), ESCURO)
  poligono(ctx, girar([[-1, -4.4], [1.6, -4.4], [1.6, 4.4], [-1, 4.4]], x, y, ang, k), ESCURO)
  poligono(ctx, girar([[-6, -1.9], [-1, -1.9], [-1, 1.9], [-6, 1.9]], x, y, ang, k), ESCURO)
  poligono(ctx, girar([[9.6, 0], [7.8, -1.5], [0, -1.5], [0, 1.5], [7.8, 1.5]], x, y, ang, k), meio)
  poligono(ctx, girar([[9.6, 0], [7.8, -1.5], [0, -1.5], [0, 0]], x, y, ang, k), luz)
  poligono(ctx, girar([[-.2, -3.4], [.9, -3.4], [.9, 3.4], [-.2, 3.4]], x, y, ang, k), COR.cabo[1])
  poligono(ctx, girar([[-5, -.9], [-.2, -.9], [-.2, .9], [-5, .9]], x, y, ang, k), COR.cabo[0])
}

const GOLPES: Record<string, (s: Cena) => void> = {
  /** "A frenetic dance to uplift the fighting spirit. This sharply raises the user's Attack stat." */
  swords_dance(s) {
    const { ctx } = s.c
    // Quatro ESPADAS surgem em volta, de ponta pra cima, e rodam cada vez mais
    // rápido fechando o círculo; no auge duas cruzam acima da cabeça e tinem.
    const fino = 1 - entrada(s.some), nasce = saida(limitar(s.sobe * 2))
    const giro = (s.c.ms / 1000) ** 2 * 9, R = 17 - 6 * saida(s.sobe)
    const cruzou = s.fica !== null && s.fica > .25 || s.some > 0
    if (!cruzou) for (let i = 0; i < 4; i++) {
      const a = giro + i * Math.PI / 2, frente = Math.sin(a)
      espada(ctx, s.o.x + Math.cos(a) * R, s.o.y + 4 + frente * 5, -Math.PI / 2 + Math.cos(a) * .35, (.8 + frente * .12) * nasce)
    }
    else {
      const t = s.fica === null ? 1 : (s.fica - .25) / .75, fecha = saida(limitar(t / .25))
      const topo = { x: s.cabeca.x, y: s.cabeca.y - 8 }
      for (const lado of [-1, 1]) espada(ctx, topo.x - lado * 4 * fecha, topo.y + 7, -Math.PI / 2 + lado * (.9 - .35 * fecha), .95 * fino)
      if (t < .35) {
        brilho(ctx, topo.x, topo.y, 7 * (1 - t / .35) + 1, BRANCO)
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3 + .3, r0 = 5 + t * 14
          fio(ctx, { x: topo.x + Math.cos(a) * r0, y: topo.y + Math.sin(a) * r0 }, { x: topo.x + Math.cos(a) * (r0 + 4), y: topo.y + Math.sin(a) * (r0 + 4) }, 1.5 * (1 - t / .35), COR.faisca[1])
        }
      }
    }
  },

  /** "The user howls loudly to raise its spirit, which raises its Attack stat." */
  howl(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.uivo
    // O uivo sobe: arcos abertos pra CIMA saem da boca, um atrás do outro,
    // alargando e tremendo; poeira salta do chão a cada onda.
    const fino = 1 - entrada(s.some), forca = s.fica === null ? (s.some > 0 ? 1 - s.some : s.sobe) : 1
    for (let i = 0; i < 4; i++) {
      const fase = ms / 380 - i * .25
      if (fase < 0) continue
      const u = fase % 1
      if (s.some > 0 && u < s.some) continue
      const y = s.cabeca.y - 2 - u * 26, R = 3 + u * 13, treme = Math.sin(ms * .05 + i) * .8
      const pts: Ponto[] = []
      for (let j = -5; j <= 5; j++) { const f = j / 5; pts.push({ x: s.cabeca.x + f * R + treme, y: y + f * f * R * .5 }) }
      const vida = Math.sin(u * Math.PI) * forca * fino
      linha(ctx, pts, 3 * vida, fundo); linha(ctx, pts, 1.3 * vida, i % 2 ? luz : meio)
    }
    if (s.fica !== null) for (const lado of [-1, 1]) {
      const v = (ms / 380) % 1
      conta(ctx, s.o.x + lado * (9 + v * 6), s.chao - Math.sin(v * Math.PI) * 4, 1.3 * (1 - v), meio)
    }
  },

  /** "The user lowers its polygon count to make itself more jagged, raising its Attack stat." */
  sharpen(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.poligono
    // Um CONTORNO de polígono fecha em volta do corpo e vai perdendo lados:
    // oito, seis, cinco, quatro, três. A cada troca as quinas piscam.
    const lados = [8, 6, 5, 4, 3], t = s.fica === null ? (s.some > 0 ? 1 : 0) : s.fica
    const etapa = Math.min(lados.length - 1, Math.floor(t * lados.length)), n = lados[etapa]
    const dentro = (t * lados.length) % 1, R = (17 - 3 * saida(s.sobe)) * (1 - entrada(s.some)) * Math.min(1, s.sobe * 3)
    if (R < 2) return
    const quina = (i: number): Ponto => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2 + ms * .0012
      return { x: s.o.x + Math.cos(a) * R, y: s.o.y + 3 + Math.sin(a) * R * .9 }
    }
    const pts: Ponto[] = []
    for (let i = 0; i <= n; i++) pts.push(quina(i))
    linha(ctx, pts, 3.4, ESCURO); linha(ctx, pts, 1.6, meio)
    for (let i = 0; i < n; i++) {
      const q = quina(i)
      if (dentro < .3 && s.fica !== null) brilho(ctx, q.x, q.y, 3.2 * (1 - dentro / .3) + .6, luz)
      else conta(ctx, q.x, q.y, 1.2, fundo)
    }
  },

  /** "The user meditates to awaken the power deep within its body and raise its Attack stat." */
  meditate(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.calma
    // Tudo DEVAGAR: ondas rasas se abrem no chão, uma centelha sobe da barriga
    // até a testa e ali se abre em brilho.
    const fino = 1 - entrada(s.some)
    for (let i = 0; i < 3; i++) {
      const fase = ms / 760 - i * .33
      if (fase < 0) continue
      const u = fase % 1
      if (s.some > 0 && u < s.some) continue
      anel(ctx, s.o.x, s.chao, (4 + u * 17) * fino, (1.2 + u * 4.5) * fino, 1.3 * (1 - u), i % 2 ? meio : fundo)
    }
    const t = limitar((ms - s.p.sobe * .5) / (s.p.fica * .8))
    const y = s.o.y + 9 - saida(t) * 22
    if (t > 0 && t < 1) {
      fio(ctx, { x: s.o.x, y: y + 6 }, { x: s.o.x, y }, 2.6, fundo); fio(ctx, { x: s.o.x, y: y + 5 }, { x: s.o.x, y }, 1.1, luz)
      conta(ctx, s.o.x, y, 1.8, luz)
    }
    else if (t >= 1) brilho(ctx, s.o.x, s.o.y - 13, (4.5 + Math.sin(ms * .02) * 1) * fino, luz)
  },

  /** "The user sharpens its claws to boost its Attack stat and accuracy." */
  hone_claws(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.faisca
    // Duas RASPADAS cruzadas na frente do corpo: três riscos de garra cada,
    // uma pra cada lado, soltando faísca de afiar.
    const fino = 1 - entrada(s.some)
    for (let g = 0; g < 2; g++) {
      const ini = g * .42, t = s.fica === null ? (s.some > 0 ? 1 : -1) : (s.fica - ini) / .4
      if (t <= 0) continue
      const u = limitar(t), lado = g ? -1 : 1, vida = t > 1 ? Math.max(0, 1 - (t - 1) * 2.5) * fino : 1
      for (let i = 0; i < 3; i++) {
        const de = { x: s.o.x - lado * 13 + i * lado * 5.5, y: s.o.y - 7 + i * 1.5 }
        const ate = { x: de.x + lado * 11, y: de.y + 17 }
        const p0 = { x: de.x + (ate.x - de.x) * Math.max(0, u - .55), y: de.y + (ate.y - de.y) * Math.max(0, u - .55) }
        const p1 = { x: de.x + (ate.x - de.x) * saida(u), y: de.y + (ate.y - de.y) * saida(u) }
        if (vida > .1) { fio(ctx, p0, p1, 2.4 * vida, ESCURO); fio(ctx, p0, p1, 1 * vida, BRANCO) }
        if (u < 1 && i === 1) for (let f = 0; f < 3; f++) {
          const a = Math.PI / 2 - lado * .6 + (f - 1) * .7
          fio(ctx, { x: p1.x + Math.cos(a) * 2, y: p1.y + Math.sin(a) * 2 }, { x: p1.x + Math.cos(a) * (5 + f), y: p1.y + Math.sin(a) * (5 + f) }, 1.2, f % 2 ? luz : meio)
        }
      }
    }
    if (s.fica !== null && s.fica > .86) brilho(ctx, s.o.x, s.o.y + 3, 5 * Math.sin((s.fica - .86) / .14 * Math.PI) + .6, fundo)
  },

  /** "The user is roused, and its Attack and Sp. Atk stats increase." */
  work_up(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.esforco
    // O corpo BOMBEIA: a cada batida dois colchetes vermelhos apertam os lados
    // e soltam; vapor sai em jato pelos ombros e gotas de suor voam.
    const fino = 1 - entrada(s.some), forca = Math.min(1, s.sobe * 2) * fino
    const batida = (ms / 260) % 1, aperto = Math.sin(batida * Math.PI)
    for (const lado of [-1, 1]) {
      const x = s.o.x + lado * (15 - aperto * 4), y = s.o.y + 3
      traco(ctx, [{ x: x + lado * 3, y: y - 8 }, { x, y: y - 5 }, { x, y: y + 5 }, { x: x + lado * 3, y: y + 8 }], 1.6 * forca, aperto > .5 ? meio : fundo)
      // Vapor do ombro.
      for (let i = 0; i < 2; i++) {
        const v = (ms / 300 + i * .5) % 1
        conta(ctx, s.o.x + lado * (7 + v * 5), s.cabeca.y + 6 - v * 12, (1.1 + v * 2) * (1 - entrada(v)) * forca, i ? luz : BRANCO)
      }
      // Suor.
      const g = (ms / 420 + (lado > 0 ? .4 : 0)) % 1
      if (s.fica !== null) conta(ctx, s.cabeca.x + lado * (6 + g * 9), s.cabeca.y - 2 - Math.sin(g * Math.PI) * 6 + g * 6, 1.2 * (1 - g), '#9ad8ff')
    }
  },

  /** "The user stimulates its brain by thinking bad thoughts. This sharply raises the user's Sp. Atk stat." */
  nasty_plot(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.trama
    // Pensamento RUIM: bolinhas sobem da cabeça até um balão escuro com dois
    // chifres; dentro, um sorriso torto acende e o balão dá risada (treme).
    const fino = 1 - entrada(s.some), cresce = saida(s.sobe) * fino
    const ri = s.fica !== null && s.fica > .35 ? Math.sin(ms * .06) * 1.1 : 0
    const b = { x: s.cabeca.x + 9, y: s.cabeca.y - 15 + ri }
    for (let i = 0; i < 2; i++) {
      const k = limitar(s.sobe * 3 - i * .8) * fino
      conta(ctx, s.cabeca.x + 3 + i * 3, s.cabeca.y - 3 - i * 4.5, (1.2 + i * .7) * k, fundo)
    }
    if (cresce < .1) return
    const R = 8.5 * cresce
    // Chifres antes do balão, pra ficarem por trás.
    for (const lado of [-1, 1]) {
      poligono(ctx, [[b.x + lado * R * .45 - 2.4, b.y - R * .55], [b.x + lado * R * 1.05, b.y - R * 1.5], [b.x + lado * R * .45 + 2.4, b.y - R * .4]], ESCURO)
      poligono(ctx, [[b.x + lado * R * .5 - 1.2, b.y - R * .6], [b.x + lado * R * .95, b.y - R * 1.25], [b.x + lado * R * .5 + 1.2, b.y - R * .5]], meio)
    }
    conta(ctx, b.x, b.y, R, fundo)
    disco(ctx, b.x - R * .3, b.y - R * .35, R * .28, meio)
    if (s.fica !== null && s.fica > .25 || s.some > 0) {
      // Olhos em fenda e sorriso torto.
      for (const lado of [-1, 1]) fio(ctx, { x: b.x + lado * R * .2, y: b.y - R * .1 }, { x: b.x + lado * R * .55, y: b.y - R * .3 }, 1.5 * cresce, luz)
      linha(ctx, [{ x: b.x - R * .5, y: b.y + R * .25 }, { x: b.x - R * .15, y: b.y + R * .5 }, { x: b.x + R * .25, y: b.y + R * .45 }, { x: b.x + R * .55, y: b.y + R * .15 }], 1.4 * cresce, luz)
    }
    if (s.fica !== null && s.fica > .25 && s.fica < .4) brilho(ctx, b.x, b.y, 6 * (1 - (s.fica - .25) / .15) + 1, luz)
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], '#9ad8ff', ...Object.values(COR).flat())

export const AUMENTOS_OFENSIVOS_POR_GOLPE = montarFamilia(PERFIS_DE_AUMENTO_OFENSIVO, {
  desenhar: (p, c, id) => GOLPES[id](cena(p, c)),
  duracao: p => p.sobe + p.fica + p.some,
  // "Contato" de um aumento é o instante em que ele chega no auge.
  contato: p => p.sobe,
  alcance: 44, margem: () => ({ cima: 56, baixo: 30, lados: 44 }), pele: peleDe,
})
