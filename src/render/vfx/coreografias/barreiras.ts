// Barreiras (12/11): os dez golpes de PROTEÇÃO, a primeira família de golpes
// de status com efeito próprio. Cada um parte da descrição do jogo (frase no
// comentário) — a forma principal é do golpe, não da família:
//   Protect cúpula de favos · Detect olho que vê o golpe e o corpo que sai da
//   frente · Endure apanha e não cai · Wide Guard muralha baixa e larga ·
//   Reflect vidraça que sobe do chão · Light Screen cortina de luz que desce ·
//   Safeguard círculo que rebate a doença · Mist neblina nos pés · Lucky Chant
//   canto que sobe e volta em estrelas · Aurora Veil véu de aurora.
//
// TUDO acontece em quem USA o golpe (`origem`, o peito). O efeito é desenhado
// por cima do POKE, então nenhuma barreira é chapada: é moldura, traço e
// brilho, com o corpo aparecendo por dentro. Sem alfa (o pixelizador vira
// pontilhado).
//
// Fora do registro até o dono aprovar a família no lab.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `sobe`: a barreira se forma · `fica`: fechada, no auge · `some`: desmonta. */
interface Perfil { sobe: number; fica: number; some: number }

export const PERFIS_DE_BARREIRA: Record<string, Perfil> = {
  protect: { sobe: 260, fica: 460, some: 280 },
  detect: { sobe: 180, fica: 420, some: 260 },
  endure: { sobe: 200, fica: 560, some: 300 },
  wide_guard: { sobe: 300, fica: 440, some: 280 },
  reflect: { sobe: 260, fica: 480, some: 240 },
  light_screen: { sobe: 340, fica: 420, some: 280 },
  safeguard: { sobe: 260, fica: 520, some: 260 },
  mist: { sobe: 380, fica: 420, some: 300 },
  lucky_chant: { sobe: 360, fica: 440, some: 260 },
  aurora_veil: { sobe: 380, fica: 460, some: 260 },
}

const COR = {
  protect: ['#1f8f78', '#4fe0b0', '#c8fff0'],
  detect: ['#ffd23a', '#fff3a0'],
  endure: ['#b3261e', '#ff5a3a', '#ffb199'],
  reflect: ['#3d5fc4', '#8fb8ff', '#dcebff'],
  light: ['#d89a1e', '#ffe27a', '#fff8d0'],
  safeguard: ['#3fae6a', '#9dffb8', '#b060e0', '#ff8a3a'],
  mist: ['#8fb6cc', '#dff4ff'],
  chant: ['#e0559a', '#ff9ad8', '#ffd23a'],
  aurora: ['#3ddc97', '#7fd8ff', '#ff9ad8', '#b48cff'],
} as const

interface Cena {
  c: ContextoVfx; pele: Pele; semente: number
  /** Peito de quem usa, e o chão sob os pés. */
  o: Ponto; chao: number
  /** 0..1 formando, 0..1 no auge, 0..1 desmontando (null fora da fase). */
  sobe: number; fica: number | null; some: number
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  return {
    c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), o: c.origem, chao: c.origem.y + 12,
    sobe: limitar(c.ms / p.sobe), fica: janela(c.ms, p.sobe, p.fica), some: limitar((c.ms - p.sobe - p.fica) / p.some),
  }
}

/** Traço com contorno escuro por baixo. */
function traco(ctx: CanvasRenderingContext2D, pts: readonly Ponto[], largura: number, cor: string): void {
  if (pts.length < 2 || largura <= .2) return
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const [w, c] of [[largura + 2, ESCURO], [largura, cor]] as const) {
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath()
    pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))
    ctx.stroke()
  }
}
const ret = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cor: string): void =>
  poligono(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], cor)

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "Enables the user to evade all attacks. Its chance of failing rises if it is used in succession." */
  protect(_p, s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.protect
    // Cúpula de favos: as duas paredes sobem do chão e se fecham no topo; os
    // favos acendem em onda; ao fechar, um clarão corre o arco. No fim a
    // cúpula se parte em cacos que voam pra fora.
    const cx = s.o.x, cy = s.chao - 1, rx = 17, ry = 27
    const ponto = (a: number, k = 1): Ponto => ({ x: cx + Math.cos(a) * rx * k, y: cy - Math.sin(a) * ry * k })
    if (s.some <= 0) {
      const k = saida(s.sobe), ate = (Math.PI / 2) * k
      for (const lado of [0, 1]) {
        const pts: Ponto[] = []
        for (let i = 0; i <= 10; i++) { const a = ate * i / 10; pts.push(ponto(lado ? Math.PI - a : a)) }
        traco(ctx, pts, 2.2, meio)
      }
      // Favos: seis hexágonos na casca, só contorno, acendendo de baixo pra cima.
      const favos = [[.3, .46], [.7, .46], [.5, .72], [.14, .2], [.86, .2], [.5, .2]] as const
      favos.forEach(([u, v], i) => {
        if (k < v) return
        const q = { x: cx + (u - .5) * rx * 1.7, y: cy - v * ry * .92 }
        const aceso = Math.floor(ms / 90 + i * 2) % 6 === 0
        const hex = (R: number) => [0, 1, 2, 3, 4, 5].map(j => [q.x + Math.cos(j * Math.PI / 3) * R, q.y + Math.sin(j * Math.PI / 3) * R * .9] as const)
        // Só o contorno do favo (o corpo aparece por dentro); aceso, enche.
        const anel = hex(3.4).map(([x, y]) => ({ x, y }))
        if (aceso) { poligono(ctx, hex(4.6), ESCURO); poligono(ctx, hex(3.4), luz); poligono(ctx, hex(1.6), BRANCO) }
        else traco(ctx, [...anel, anel[0]], 1, fundo)
      })
      if (s.fica !== null) {
        // Clarão que corre o arco da esquerda pra direita ao fechar.
        const u = limitar(s.fica / .35)
        if (u < 1) { const a = Math.PI * (1 - u); traco(ctx, [ponto(a + .25), ponto(a), ponto(a - .25)], 2.6, BRANCO) }
        if (s.fica < .3) brilho(ctx, cx, cy - ry, 5 * (1 - s.fica / .3) + 1, luz)
      }
      return
    }
    const rng = rngSemeado(s.semente + 3)
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (i + .5) / 7, d = 1 + saida(s.some) * .45, q = ponto(a, d), giro = rng() * 3 + s.some * 4
      const r = 3.6 * (1 - entrada(s.some))
      if (r < .5) continue
      const caco = (R: number) => [0, 1, 2].map(j => [q.x + Math.cos(giro + j * 2.1) * R, q.y + Math.sin(giro + j * 2.1) * R] as const)
      poligono(ctx, caco(r + 1.3), ESCURO); poligono(ctx, caco(r), i % 2 ? luz : meio)
    }
  },

  /** "Enables the user to evade all attacks. Its chance of failing rises if it is used in succession." */
  detect(_p, s) {
    const { ctx } = s.c, [ouro, claro] = COR.detect
    // Não é parede: é PERCEBER. Um olho se abre acima da cabeça e fuzila num
    // brilho; o corpo "escorrega" — dois contornos-fantasma saem pros lados com
    // riscos de velocidade, como quem já saiu da frente do golpe.
    const olho = { x: s.o.x, y: s.o.y - 21 }
    const abre = saida(s.sobe) * (1 - entrada(s.some))
    if (abre > .05) {
      const lente = (W: number, H: number) => [[olho.x - W, olho.y], [olho.x, olho.y - H], [olho.x + W, olho.y], [olho.x, olho.y + H]] as const
      poligono(ctx, lente(9.5 * abre + 1.4, 4 * abre + 1.4), ESCURO)
      poligono(ctx, lente(9.5 * abre, 4 * abre), BRANCO)
      poligono(ctx, lente(3.2 * abre, 3.4 * abre), ESCURO)
      ret(ctx, olho.x - 1.6 * abre, olho.y - 1.6 * abre, 1.4, 1.4, BRANCO)
    }
    if (s.fica !== null) {
      if (s.fica < .35) brilho(ctx, olho.x + 6, olho.y - 3, 6 * Math.sin(s.fica / .35 * Math.PI) + 1, ouro)
      const u = limitar((s.fica - .15) / .6)
      if (u > 0 && u < 1) for (const d of [-1, 1]) {
        const x = s.o.x + d * (9 + 13 * saida(u)), w = 1.8 * (1 - entrada(u))
        // Contorno-fantasma: um ")" do tamanho do corpo.
        const pts: Ponto[] = []
        for (let i = 0; i <= 6; i++) { const a = -1.1 + 2.2 * i / 6; pts.push({ x: x + d * Math.cos(a) * 5, y: s.o.y - 2 + Math.sin(a) * 13 }) }
        traco(ctx, pts, w, claro)
        for (let k = 0; k < 2; k++) {
          const y = s.o.y - 6 + k * 9
          traco(ctx, [{ x: x - d * 4, y }, { x: x - d * (4 + 7 * (1 - u)), y }], w * .7, BRANCO)
        }
      }
    }
  },

  /** "The user endures any attack with at least 1 HP. Its chance of failing rises if it is used in succession." */
  endure(_p, s) {
    const { ctx, ms } = s.c, [fundo, meio, claro] = COR.endure
    // Aguentar: ele APANHA e não cai. Uma aura de garra (labaredas curtas e
    // duras) trava em volta do corpo; três pancadas chegam de fora, estouram
    // na aura e ela só pisca. No fim, vapor do esforço sobe da cabeça.
    const forca = saida(s.sobe) * (1 - entrada(s.some))
    const bate = [.12, .42, .72], de = [-2.6, -.4, 2.5]
    const batendo = s.fica !== null && bate.some(b => s.fica! >= b && s.fica! < b + .1)
    if (forca > .05) {
      const n = 9
      for (let i = 0; i < n; i++) {
        const a = Math.PI * (.08 + .84 * i / (n - 1)), treme = Math.floor(ms / 70 + i) % 2
        const b = { x: s.o.x - Math.cos(a) * 13, y: s.chao - 2 - Math.sin(a) * 22 }
        const h = (5 + treme * 2.5 + (i % 3) * 1.5) * forca, nx = -Math.cos(a), ny = -Math.sin(a)
        const chama = (g: number) => [[b.x - ny * (2.2 + g), b.y + nx * (2.2 + g)], [b.x + nx * (h + g), b.y + ny * (h + g) - 2], [b.x + ny * (2.2 + g), b.y - nx * (2.2 + g)]] as const
        poligono(ctx, chama(1.3), ESCURO); poligono(ctx, chama(0), batendo ? BRANCO : i % 2 ? meio : fundo)
      }
    }
    if (s.fica !== null) bate.forEach((b, i) => {
      const u = (s.fica! - b) / .22
      if (u < -.5 || u >= 1) return
      const a = de[i], fora = { x: s.o.x + Math.cos(a) * 34, y: s.o.y - 2 + Math.sin(a) * 20 }
      const casca = { x: s.o.x + Math.cos(a) * 14, y: s.o.y - 2 + Math.sin(a) * 12 }
      if (u < 0) {
        // A pancada vindo: cunha apontada pro corpo.
        const v = saida(1 + u * 2), q = { x: fora.x + (casca.x - fora.x) * v, y: fora.y + (casca.y - fora.y) * v }
        const ux = Math.cos(a), uy = Math.sin(a) * .6
        const cunha = (g: number) => [[q.x - ux * (2 + g), q.y - uy * (2 + g)], [q.x + ux * 7 - uy * (4 + g), q.y + uy * 7 + ux * (4 + g)], [q.x + ux * 7 + uy * (4 + g), q.y + uy * 7 - ux * (4 + g)]] as const
        poligono(ctx, cunha(1.3), ESCURO); poligono(ctx, cunha(0), claro)
      } else {
        estrelaDeImpacto(ctx, casca, 6, u, s.pele, rngSemeado(s.semente + i))
        riscos(ctx, casca, s.c.pedir(3), 11, u, claro, rngSemeado(s.semente + 10 + i))
      }
    })
    if (s.some > 0 && s.some < 1) for (const d of [-1, 0, 1]) {
      const r = 2.6 * Math.sin(s.some * Math.PI), q = { x: s.o.x + d * 5, y: s.o.y - 18 - s.some * (8 + Math.abs(d) * 3) }
      if (r < .5) continue
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(q.x, q.y, r + 1.2, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = BRANCO; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill()
    }
  },

  /** "The user and its allies are protected from wide-ranging attacks for one turn." */
  wide_guard(_p, s) {
    const { ctx } = s.c
    // Guarda LARGA: não é cúpula, é muralha. Lajes de pedra brotam do chão do
    // centro pras pontas num arco baixo e largo na frente de quem usa; um
    // brilho varre a fileira; no fim afundam de volta, das pontas pro centro.
    const n = 7
    for (let i = 0; i < n; i++) {
      const longe = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2)
      const sobe = saida(limitar((s.sobe - longe * .55) / .45)), desce = entrada(limitar((s.some - (1 - longe) * .5) / .5))
      const h = (10 - longe * 3) * sobe * (1 - desce)
      if (h < 1) continue
      const a = Math.PI * (.14 + .72 * i / (n - 1)), x = s.o.x - Math.cos(a) * 30, base = s.chao + 4 + Math.sin(a) * 8
      const w = 4.2
      const laje = (g: number) => [[x - w - g, base + g], [x + w + g, base + g], [x + w + g, base - h + 2], [x + w - 2, base - h - g], [x - w + 1, base - h - g], [x - w - g, base - h + 3]] as const
      poligono(ctx, laje(1.4), ESCURO); poligono(ctx, laje(0), s.pele.base)
      poligono(ctx, [[x - w, base - h + 3], [x - w + 1, base - h], [x - w + 3, base - h], [x - w + 3, base], [x - w, base]], s.pele.meio)
      ret(ctx, x - 1, base - h * .55, 3, 1.2, ESCURO)
      if (s.fica !== null) {
        const u = s.fica / .45 * (n + 1) - 1
        if (u >= i - .5 && u < i + .5) { ret(ctx, x - w, base - h + 2, w * 2, h - 2, BRANCO); brilho(ctx, x, base - h - 2, 3, s.pele.nucleo) }
      }
      if (sobe < 1 && sobe > 0) riscos(ctx, { x, y: base }, s.c.pedir(2), 7, sobe, s.pele.meio, rngSemeado(s.semente + i))
    }
  },

  /** "A wondrous wall of light is put up to reduce damage from physical attacks for five turns." */
  reflect(_p, s) {
    const { ctx } = s.c, [fundo, meio, claro] = COR.reflect
    // Parede que rebate o golpe FÍSICO: uma vidraça dura sobe do chão na frente
    // do corpo — só a moldura e dois riscos de reflexo, o POKE aparece atrás.
    // Ao travar, o reflexo corre o vidro. No fim fecha como uma porta.
    const alto = 35 * saida(s.sobe), meiaL = 15 * (1 - entrada(s.some)), inclina = 4
    if (alto < 2 || meiaL < .6) return
    const base = s.chao + 1, x = s.o.x
    const canto = (lx: number, ly: number): Ponto => ({ x: x + lx * meiaL + inclina * ly, y: base - alto * ly })
    const quadro = [canto(-1, 0), canto(1, 0), canto(1, 1), canto(-1, 1), canto(-1, 0)]
    traco(ctx, quadro, 2.4, meio)
    traco(ctx, [canto(-1, 1), canto(1, 1)], 1.2, claro)
    // Reflexo: dois riscos diagonais que atravessam o vidro.
    const passo = s.fica === null ? (s.some > 0 ? 2 : -1) : (s.fica * 1.6) % 1.25
    for (const [d, w] of [[0, 2.2], [.2, 1.1]] as const) {
      const u = passo - d
      if (u <= 0 || u >= 1) continue
      const lx = -1 + u * 2
      traco(ctx, [canto(limitar(lx - .28, -.9, .9), .12), canto(limitar(lx + .1, -.9, .9), .88)], w, BRANCO)
    }
    if (s.fica !== null && s.fica < .25) {
      const k = 1 - s.fica / .25
      for (const [lx, ly] of [[-1, 1], [1, 1], [-1, 0], [1, 0]] as const) { const q = canto(lx, ly); brilho(ctx, q.x, q.y, 3.4 * k + .6, fundo) }
    }
  },

  /** "A wondrous wall of light is put up to reduce damage from special attacks for five turns." */
  light_screen(_p, s) {
    const { ctx, ms } = s.c, [fundo, meio, claro] = COR.light
    // Tela contra o golpe ESPECIAL: não sobe do chão, DESCE do céu. Fitas de
    // luz caem uma a uma, da esquerda pra direita, como uma cortina; fechada,
    // uma onda de brilho passeia pelas fitas. No fim recolhem de volta pra cima.
    const n = 6, topo = s.o.y - 30, fim = s.chao
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), x = s.o.x - 18 + u * 36
      const desce = saida(limitar((s.sobe - u * .5) / .5)), sobe = entrada(limitar((s.some - (1 - u) * .5) / .5))
      const y1 = topo + (fim - topo) * desce * (1 - sobe)
      if (y1 - topo < 2) continue
      const onda = s.fica !== null && Math.floor(ms / 80) % n === i
      const w = onda ? 3 : 2
      ret(ctx, x - w / 2 - .7, topo - .7, w + 1.4, y1 - topo + 1.4, ESCURO)
      ret(ctx, x - w / 2, topo, w, y1 - topo, onda ? BRANCO : i % 2 ? meio : fundo)
      // Ponta da fita: a gota de luz que puxa a cortina.
      if (desce < 1 || onda) brilho(ctx, x, y1, onda ? 2.6 : 3.2, claro)
    }
    if (s.fica !== null && s.fica < .3) traco(ctx, [{ x: s.o.x - 20, y: topo }, { x: s.o.x + 20, y: topo }], 1.6 * (1 - s.fica / .3) + .6, claro)
  },

  /** "The user creates a protective field that prevents status conditions for five turns." */
  safeguard(_p, s) {
    const { ctx, ms } = s.c, [fundo, meio, veneno, queima] = COR.safeguard
    // Campo contra DOENÇA: um círculo se desenha no chão em volta dos pés e
    // solta um véu que sobe; uma bolha de veneno e uma brasa vêm de fora,
    // batem no véu e estouram sem entrar.
    const k = saida(s.sobe) * (1 - entrada(s.some)), rx = 19 * k, ry = 7 * k
    if (rx < 1) return
    const anel = (a0: number, a1: number): Ponto[] => { const pts: Ponto[] = []; for (let i = 0; i <= 14; i++) { const a = a0 + (a1 - a0) * i / 14; pts.push({ x: s.o.x + Math.cos(a) * rx, y: s.chao + Math.sin(a) * ry }) } return pts }
    traco(ctx, anel(0, Math.PI * 2 * limitar(s.sobe * 1.3)), 2, meio)
    // Véu: tracinhos que sobem da borda, em rodízio.
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + .3, v = (ms / 520 + i * .37) % 1
      const x = s.o.x + Math.cos(a) * rx, y = s.chao + Math.sin(a) * ry - v * 26 * k, h = 5 * Math.sin(v * Math.PI) * k
      if (h > 1) { ret(ctx, x - 1.6, y - h - 1.2, 3.2, h + 2.4, ESCURO); ret(ctx, x - .7, y - h, 1.4, h, i % 2 ? BRANCO : fundo) }
    }
    if (s.fica !== null) for (const [d, cor, t0] of [[-1, veneno, .08], [1, queima, .4]] as const) {
      const u = (s.fica - t0) / .42
      if (u < 0 || u >= 1) continue
      const borda = { x: s.o.x + d * (rx + 1), y: s.o.y - 2 }
      if (u < .5) {
        const v = saida(u * 2), q = { x: borda.x + d * 20 * (1 - v), y: borda.y - 6 * (1 - v) }
        ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(q.x, q.y, 2.8, 0, Math.PI * 2); ctx.fill()
        ret(ctx, q.x - 1.4, q.y - 1.6, 1.2, 1.2, BRANCO)
      } else {
        const v = (u - .5) * 2
        brilho(ctx, borda.x, borda.y, 5 * (1 - v) + 1, meio)
        riscos(ctx, borda, s.c.pedir(4), 12, v, cor, rngSemeado(s.semente + (d > 0 ? 1 : 2)))
      }
    }
  },

  /** "The user cloaks itself and its allies in a white mist that prevents any of their stats from being lowered for five turns." */
  mist: (_p, s) => {
    const { ctx, ms } = s.c, [sombra, claro] = COR.mist
    // Neblina branca: dois bancos de névoa rolam de fora pra dentro rente ao
    // chão, se encontram nos pés e cobrem até a cintura; fiapos sobem dela.
    const chega = saida(s.sobe), fino = 1 - entrada(s.some)
    const rng = rngSemeado(s.semente + 5), bolas: { x: number; y: number; r: number }[] = []
    for (let i = 0; i < 12; i++) {
      const lado = i % 2 ? 1 : -1, casa = (Math.floor(i / 2) / 5), balanco = Math.sin(ms / 260 + i * 1.7) * 1.4
      const x = s.o.x + lado * (4 + casa * 22 + (1 - chega) * 26) + balanco
      const y = s.chao + 1 - rng() * 4 - (casa < .5 ? 2 : 0)
      bolas.push({ x, y, r: (3.2 + rng() * 2) * fino * (.5 + chega * .5) })
    }
    for (const [g, cor] of [[1.4, ESCURO], [0, sombra], [-1.2, claro], [-2.6, BRANCO]] as const) {
      ctx.fillStyle = cor
      for (const b of bolas) {
        if (b.r + g <= .4) continue
        ctx.beginPath(); ctx.arc(b.x - (g < 0 ? .7 : 0), b.y - (g < 0 ? .8 : 0), b.r + g, 0, Math.PI * 2); ctx.fill()
      }
    }
    if (s.fica !== null || s.some > 0) for (let i = 0; i < 4; i++) {
      const v = (ms / 700 + i * .27) % 1, x = s.o.x - 15 + i * 10 + Math.sin(v * 6 + i) * 2, y = s.chao - 6 - v * 14
      const r = 2 * Math.sin(v * Math.PI) * fino
      if (r < .6) continue
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(x, y, r + 1.1, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = claro; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
  },

  /** "The user chants an incantation toward the sky, preventing opposing Pokémon from landing critical hits." */
  lucky_chant(_p, s) {
    const { ctx, ms } = s.c, [fundo, meio, ouro] = COR.chant
    // Um canto PRO CÉU: três notas sobem da boca em zigue-zague; no alto viram
    // uma estrela, que se desfaz numa sombrinha de estrelinhas da sorte caindo
    // em volta do corpo.
    const topo = { x: s.o.x, y: s.o.y - 31 }
    if (s.fica === null && s.some <= 0) for (let i = 0; i < 3; i++) {
      const u = limitar((s.sobe - i * .18) / .64)
      if (u <= 0 || u >= 1) continue
      const x = s.o.x + Math.sin(u * 7 + i * 2) * 6, y = s.o.y - 10 - (topo.y - s.o.y + 10) * -saida(u)
      const cor = [meio, ouro, fundo][i]
      // Nota: cabeça, haste e bandeirinha.
      ret(ctx, x + 1, y - 9.4, 3.4, 10.6, ESCURO); ret(ctx, x + 2, y - 8.2, 4.6, 4.2, ESCURO)
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill()
      ret(ctx, x + 2, y - 8.2, 1.2, 8.2, cor); ret(ctx, x + 3.2, y - 8.2, 2.4, 2, cor)
    }
    if (s.fica !== null && s.fica < .3) brilho(ctx, topo.x, topo.y, 7 * Math.sin(s.fica / .3 * Math.PI) + 1.5, ouro)
    if (s.fica !== null || s.some > 0) {
      const cai = s.fica === null ? 1 : saida(limitar(s.fica / .55)), fino = 1 - entrada(s.some)
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (.08 + .84 * i / 6)
        const x = topo.x - Math.cos(a) * 21 * cai, y = topo.y + (1 - Math.sin(a)) * 30 * cai + cai * 4
        const pisca = Math.floor(ms / 110 + i) % 3 === 0
        brilho(ctx, x, y, (pisca ? 3.4 : 2.4) * fino, [ouro, meio, BRANCO][i % 3])
      }
    }
  },

  /** "This move reduces damage from physical and special moves for five turns. This can be used only in a hailstorm." */
  aurora_veil(_p, s) {
    const { ctx, ms } = s.c, cores = COR.aurora
    // Véu de AURORA: três faixas de cortina ondulante (verde, azul, rosa) se
    // desenrolam no ar por cima do corpo, da esquerda pra direita, e ficam
    // balançando; cristais de gelo piscam nelas. Recolhe encurtando as franjas.
    const fino = 1 - entrada(s.some)
    for (let f = 0; f < 3; f++) {
      const abre = saida(limitar((s.sobe - f * .15) / .7)), x0 = s.o.x - 23, largura = 46 * abre
      const yBase = s.o.y - 31 + f * 5, cima: Ponto[] = [], baixo: Ponto[] = []
      for (let x = 0; x <= largura; x += 2) {
        const onda = Math.sin(x * .22 + ms / 210 + f * 1.9) * 2.6 + Math.sin(x * .09 - ms / 330 + f) * 1.6
        // Franja de baixo irregular: é o que faz a faixa ler como cortina de luz.
        const h = (5 + Math.abs(Math.sin(x * .45 + f * 2 + ms / 400)) * 5) * fino
        cima.push({ x: x0 + x, y: yBase + onda }); baixo.push({ x: x0 + x, y: yBase + onda + h })
      }
      if (cima.length < 2 || fino < .1) continue
      const faixa = (g: number, corte = 1) => [...cima.map(q => [q.x, q.y - g] as const), ...[...baixo].reverse().map((q, i) => [q.x, cima[cima.length - 1 - i].y + (q.y - cima[cima.length - 1 - i].y) * corte + g] as const)]
      poligono(ctx, faixa(1.3), ESCURO); poligono(ctx, faixa(0), cores[f])
      poligono(ctx, faixa(0, .35), f === 1 ? BRANCO : cores[3])
    }
    if (s.fica !== null) for (let i = 0; i < 3; i++) {
      const v = (s.fica * 2 + i * .33) % 1
      brilho(ctx, s.o.x - 16 + i * 16, s.o.y - 20 + (i % 2) * 5 + Math.sin(ms / 200 + i) * 2, 3 * Math.sin(v * Math.PI), BRANCO)
    }
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...Object.values(COR).flat())

export const BARREIRAS_POR_GOLPE = montarFamilia(PERFIS_DE_BARREIRA, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.sobe + p.fica + p.some,
  // "Contato" de uma barreira é o instante em que ela FECHA.
  contato: p => p.sobe,
  alcance: 48, margem: () => ({ cima: 58, baixo: 40, lados: 66 }), pele: peleDe,
})
