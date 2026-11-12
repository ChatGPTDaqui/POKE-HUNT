// Sono (12/11): os seis golpes de status que fazem o alvo DORMIR. Quarta
// família de golpes de status com efeito próprio.
//
// Cada um parte da descrição do jogo, e a forma é do golpe, não da família:
//   Sleep Powder nuvem de pó verde que deriva e assenta na cabeça · Spore três
//   cápsulas que estouram em volta do alvo · Hypnosis anéis que viajam e viram
//   uma espiral girando diante do rosto · Sing notas coloridas em onda que
//   rodeiam a cabeça · Grass Whistle folha vibrando e uma pauta verde que leva
//   as notas · Lovely Kiss boca enorme que voa e carimba o alvo.
//
// Em comum só o fecho: os "Z" subindo da cabeça de quem dormiu.
//
// Sai de quem usa (`origem`) e chega no alvo (`alvo`) — o resolver não ancora
// estes golpes no corpo (`STATUS_QUE_VIAJA`). Sem alfa: some encolhendo.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, limitar, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import { anel, arco, conta, disco, fio, linha, traco } from './tracos'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `vai`: sai de quem usa e chega · `pega`: age no alvo · `some`: assenta. */
interface Perfil { vai: number; pega: number; some: number }

export const PERFIS_DE_SONO: Record<string, Perfil> = {
  sleep_powder: { vai: 420, pega: 460, some: 260 },
  spore: { vai: 340, pega: 480, some: 240 },
  hypnosis: { vai: 360, pega: 520, some: 260 },
  sing: { vai: 440, pega: 460, some: 260 },
  grass_whistle: { vai: 400, pega: 480, some: 260 },
  lovely_kiss: { vai: 320, pega: 460, some: 260 },
}

const COR = {
  po: ['#3f8f4a', '#8fe07a', '#e2ffc8'],
  esporo: ['#b5652a', '#f0a04a', '#ffe6b0'],
  hipnose: ['#6a2fa0', '#d86adf', '#ffd0ff'],
  canto: ['#d0408a', '#ffd23a', '#5ad0e8'],
  folha: ['#2f7a3a', '#6fcf5a', '#d8ffb0'],
  beijo: ['#8a1f3a', '#e8487a', '#ffc0d0'],
  z: ['#dff0ff'],
} as const

interface Cena {
  c: ContextoVfx; p: Perfil; semente: number
  /** Peito de quem usa, peito do alvo, cabeça do alvo e pra que lado o golpe vai. */
  o: Ponto; a: Ponto; cabeca: Ponto; dir: number
  /** 0..1 viajando, 0..1 agindo (null fora da fase), 0..1 assentando. */
  vai: number; pega: number | null; some: number
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  return {
    c, p, semente: Math.floor(c.rng() * 0xffffffff), o: c.origem, a: c.alvo,
    cabeca: { x: c.alvo.x, y: c.alvo.y - 15 }, dir: c.alvo.x >= c.origem.x ? 1 : -1,
    vai: limitar(c.ms / p.vai), pega: janela(c.ms, p.vai, p.pega), some: limitar((c.ms - p.vai - p.pega) / p.some),
  }
}

/** Os "Z" de quem dormiu: três, cada um maior, subindo em escada. */
function zzz(s: Cena, desde = .45): void {
  const t = s.pega === null ? (s.some > 0 ? 1 + s.some : 0) : s.pega
  if (t < desde) return
  const v = (t - desde) / (2 - desde)
  for (let i = 0; i < 3; i++) {
    const u = limitar(v * 2.6 - i * .32)
    if (u <= 0 || u >= 1) continue
    const k = (2 + i * .9) * Math.min(1, Math.sin(u * Math.PI) * 1.8)
    if (k < .7) continue
    const x = s.cabeca.x + 6 + i * 4.5 + u * 3, y = s.cabeca.y - 3 - i * 5 - u * 7
    traco(s.c.ctx, [{ x: x - k, y: y - k }, { x: x + k, y: y - k }, { x: x - k, y: y + k }, { x: x + k, y: y + k }], 1.2, COR.z[0])
  }
}

/** Nota musical: cabeça cheia, haste e bandeirola. */
function nota(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, cor: string): void {
  if (k <= .15) return
  const topo = { x: x + 1.8 * k, y: y - 7 * k }
  fio(ctx, { x: x + 1.8 * k, y }, topo, 1.2 * k + 1.6, ESCURO)
  fio(ctx, topo, { x: x + 4.6 * k, y: y - 4.8 * k }, 1.2 * k + 1.6, ESCURO)
  conta(ctx, x, y, 2.1 * k, cor)
  fio(ctx, { x: x + 1.8 * k, y }, topo, 1.2 * k, cor)
  fio(ctx, topo, { x: x + 4.6 * k, y: y - 4.8 * k }, 1.2 * k, cor)
}

const GOLPES: Record<string, (s: Cena) => void> = {
  /** "The user scatters a big cloud of sleep-inducing dust around the target." */
  sleep_powder(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.po
    // Uma nuvem de grãos sai de quem usa, DERIVA preguiçosa até a cabeça do
    // alvo e chove devagar por cima dele, balançando.
    const n = s.c.pedir(16), fino = 1 - entrada(s.some)
    for (let i = 0; i < n; i++) {
      const rng = rngSemeado(s.semente + i * 29)
      const dx = (rng() - .5) * 26, dy = (rng() - .5) * 9, r = (1.1 + rng() * 1.3) * fino
      const u = limitar((ms - i * 14) / (s.p.vai - 60))
      if (u <= 0 || r < .4) continue
      const cai = Math.max(0, ms - i * 14 - (s.p.vai - 60)) / (s.p.pega + s.p.some)
      const pouso = { x: s.cabeca.x + dx, y: s.cabeca.y - 6 + dy }
      const p = arco({ x: s.o.x + dx * .3, y: s.o.y - 6 + dy * .4 }, pouso, saida(u), 9 + rng() * 6)
      const x = p.x + Math.sin(ms * .006 + i * 1.9) * (1.5 + cai * 3), y = p.y + cai * (20 + rng() * 10)
      conta(ctx, x, y, r, i % 3 === 0 ? luz : i % 3 === 1 ? meio : fundo)
    }
    zzz(s)
  },

  /** "The user scatters bursts of spores that induce sleep." */
  spore(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.esporo
    // Três cápsulas são lançadas em sequência; cada uma ESTOURA num ponto
    // diferente em volta do alvo, soltando um anel de esporos.
    const fino = 1 - entrada(s.some)
    for (let i = 0; i < 3; i++) {
      const rng = rngSemeado(s.semente + i * 37)
      const destino = { x: s.a.x + (i - 1) * 13, y: s.a.y - 12 + (i === 1 ? -7 : 2) }
      const t = ms - i * 130, voo = s.p.vai - 80
      if (t <= 0) continue
      const u = limitar(t / voo)
      if (u < 1) {
        const p = arco(s.o, destino, u, 16)
        conta(ctx, p.x, p.y, 2.6, meio); disco(ctx, p.x - .8, p.y - .8, 1, luz)
        continue
      }
      const e = limitar((t - voo) / 420)
      // O estouro: clarão curto, depois o anel abre e os esporos caem.
      if (e < .2) brilho(ctx, destino.x, destino.y, 5 * (1 - e / .2) + 1, luz)
      const m = s.c.pedir(7)
      for (let j = 0; j < m; j++) {
        const ang = (j / m) * Math.PI * 2 + rng() * .6, alc = (5 + rng() * 6) * saida(e)
        const r = (1 + rng() * .9) * (1 - entrada(e)) * fino
        conta(ctx, destino.x + Math.cos(ang) * alc, destino.y + Math.sin(ang) * alc * .8 + e * e * 9, r, j % 2 ? meio : fundo)
      }
    }
    zzz(s, .55)
  },

  /** "The user employs hypnotic suggestion to make the target fall into a deep sleep." */
  hypnosis(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.hipnose
    // Anéis saem dos olhos de quem usa e CRESCEM no caminho; no alvo viram uma
    // espiral que gira diante do rosto, cada vez mais devagar.
    const olho = { x: s.o.x + s.dir * 4, y: s.o.y - 9 }, fino = 1 - entrada(s.some)
    if (s.pega === null && s.some <= 0 || s.pega !== null && s.pega < .35) for (let i = 0; i < 4; i++) {
      const fase = ms / 300 - i * .25
      if (fase < 0) continue
      const u = fase % 1
      const x = olho.x + (s.cabeca.x - olho.x) * u, y = olho.y + (s.cabeca.y - olho.y) * u
      const r = 2 + u * 6.5, vida = Math.sin(u * Math.PI)
      anel(ctx, x, y, r * .55, r, 1.3 * vida, i % 2 ? meio : fundo)
    }
    if (s.pega !== null || s.some > 0) {
      const abre = s.pega === null ? 1 : saida(limitar(s.pega / .3))
      const giro = ms * .011 * (1 - (s.pega ?? 1) * .55), R = 9.5 * abre * fino
      const pts: Ponto[] = []
      for (let i = 0; i <= 26; i++) {
        const f = i / 26, a = giro + f * Math.PI * 4.2
        pts.push({ x: s.cabeca.x + Math.cos(a) * R * f, y: s.cabeca.y + 3 + Math.sin(a) * R * f })
      }
      if (R > 1.5) {
        traco(ctx, pts, 1.5, meio)
        linha(ctx, pts.slice(0, 9), 1.5, luz)
        disco(ctx, s.cabeca.x, s.cabeca.y + 3, 1.3, BRANCO)
      }
    }
    zzz(s, .6)
  },

  /** "A soothing lullaby is sung in a calming voice that puts the target into a deep slumber." */
  sing(s) {
    const { ctx, ms } = s.c
    // Cinco notas coloridas saem da boca em ONDA, uma atrás da outra; chegando,
    // dão uma volta em torno da cabeça do alvo e se desfazem.
    const boca = { x: s.o.x + s.dir * 5, y: s.o.y - 6 }, fino = 1 - entrada(s.some)
    const dist = Math.hypot(s.cabeca.x - boca.x, s.cabeca.y - boca.y) || 1
    for (let i = 0; i < 5; i++) {
      const t = ms - i * 85
      if (t <= 0) continue
      const u = limitar(t / (s.p.vai - 60)), cor = COR.canto[i % 3]
      if (u < 1) {
        const x = boca.x + (s.cabeca.x - boca.x) * u, y = boca.y + (s.cabeca.y - boca.y) * u
        nota(ctx, x, y + Math.sin(u * Math.PI * 3 + i) * Math.min(7, dist * .12), .55 + u * .45, cor)
        continue
      }
      const volta = (t - (s.p.vai - 60)) / 520, ang = -Math.PI / 2 + s.dir * volta * Math.PI * 2 + i * .5
      const k = (1 - entrada(limitar(volta - .55) / .45)) * fino
      nota(ctx, s.cabeca.x + Math.cos(ang) * 11, s.cabeca.y + 2 + Math.sin(ang) * 5, k, cor)
    }
    zzz(s, .5)
  },

  /** "The user plays a pleasant melody that lulls the target into a deep sleep." */
  grass_whistle(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.folha
    // Uma FOLHA na boca de quem usa vibra; dela sai uma pauta de dois fios
    // verdes que ondula até o alvo, levando três notas pequenas.
    const boca = { x: s.o.x + s.dir * 6, y: s.o.y - 7 }, fino = 1 - entrada(s.some)
    const treme = Math.sin(ms * .09) * .25 * (s.some > 0 ? 0 : 1), fk = fino * Math.min(1, s.vai * 4)
    const lx = Math.cos(-.5 + treme) * 6 * fk * s.dir, ly = Math.sin(-.5 + treme) * 6 * fk
    poligono(ctx, [[boca.x - lx - 1, boca.y - ly], [boca.x + ly * .55, boca.y - lx * .55 * s.dir - 1], [boca.x + lx + 1, boca.y + ly], [boca.x - ly * .55, boca.y + lx * .55 * s.dir + 1]], ESCURO)
    poligono(ctx, [[boca.x - lx, boca.y - ly], [boca.x + ly * .4, boca.y - lx * .4 * s.dir], [boca.x + lx, boca.y + ly], [boca.x - ly * .4, boca.y + lx * .4 * s.dir]], meio)
    fio(ctx, { x: boca.x - lx * .8, y: boca.y - ly * .8 }, { x: boca.x + lx * .8, y: boca.y + ly * .8 }, .9 * fk, luz)
    // A pauta: cresce pela frente; no fim recolhe pela cauda.
    const ate = saida(s.vai), de = s.some
    const ponto = (f: number, lado: number): Ponto => ({
      x: boca.x + (s.cabeca.x - boca.x) * f,
      y: boca.y + (s.cabeca.y + 3 - boca.y) * f + Math.sin(f * Math.PI * 2.5 - ms * .008) * 4 * Math.sin(f * Math.PI) + lado * 2.2,
    })
    for (const lado of [-1, 1]) {
      const pts: Ponto[] = []
      for (let i = 0; i <= 18; i++) { const f = de + (ate - de) * (i / 18); pts.push(ponto(f, lado)) }
      if (ate - de > .04) { linha(ctx, pts, 2.2, fundo); linha(ctx, pts, .9, lado < 0 ? luz : meio) }
    }
    for (let i = 0; i < 3; i++) {
      const f = ((ms / 620 + i / 3) % 1) * ate
      if (f <= de + .05 || f >= ate - .03) continue
      const q = ponto(f, 0)
      nota(ctx, q.x, q.y, .62 * Math.min(1, Math.sin(f / Math.max(.01, ate) * Math.PI) * 2.2), luz)
    }
    zzz(s, .5)
  },

  /** "With a scary face, the user tries to force a kiss on the target. If it succeeds, the target falls asleep." */
  lovely_kiss(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.beijo
    // Uma BOCA enorme voa de quem usa, crescendo, e CARIMBA o alvo: amassa no
    // impacto, solta riscos, e a marca fica torta no corpo até encolher.
    const u = saida(s.vai), chegou = s.pega !== null || s.some > 0
    const centro = chegou ? { x: s.a.x, y: s.a.y - 5 } : arco({ x: s.o.x + s.dir * 4, y: s.o.y - 6 }, { x: s.a.x, y: s.a.y - 5 }, u, 6)
    const batida = s.pega === null ? 1 : limitar(s.pega / .22)
    const k = chegou ? (1.25 - .25 * saida(batida)) * (1 - entrada(s.some)) : .45 + u * .8
    const amassa = chegou ? 1 + .5 * (1 - batida) : 1, inclina = chegou ? -.28 * s.dir : 0
    // Rastro ameaçador atrás da boca enquanto voa ("scary face").
    if (!chegou) for (let i = 0; i < 3; i++) {
      const y = centro.y + (i - 1) * 4.2 * k
      fio(ctx, { x: centro.x - s.dir * 8 * k, y }, { x: centro.x - s.dir * (13 + i % 2 * 4) * k, y: y + (i - 1) * 1.5 }, 1.6, ESCURO)
    }
    const pt = (x: number, y: number, g: number): [number, number] => {
      const X = x * (1 + g / 6) * k * amassa, Y = y * (1 + g / 3) * k / amassa
      return [centro.x + X * Math.cos(inclina) - Y * Math.sin(inclina), centro.y + X * Math.sin(inclina) + Y * Math.cos(inclina)]
    }
    const cima = (g: number) => [pt(-6.5, 0, g), pt(-3.2, -3.4, g), pt(0, -1.7, g), pt(3.2, -3.4, g), pt(6.5, 0, g), pt(0, .8, 0)]
    const baixo = (g: number) => [pt(-6.5, 0, g), pt(0, .8, 0), pt(6.5, 0, g), pt(3.4, 3.6, g), pt(-3.4, 3.6, g)]
    if (k > .12) {
      poligono(ctx, cima(1.4), ESCURO); poligono(ctx, baixo(1.4), ESCURO)
      poligono(ctx, cima(0), meio); poligono(ctx, baixo(0), fundo)
      const [bx, by] = pt(-2.4, 2, 0)
      disco(ctx, bx, by, .9 * k, luz)
    }
    // O estalo do carimbo.
    if (s.pega !== null && s.pega < .3) {
      const e = s.pega / .3
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + .3, r0 = 9 + e * 5, r1 = r0 + 4 * (1 - e)
        fio(ctx, { x: centro.x + Math.cos(a) * r0, y: centro.y + Math.sin(a) * r0 * .8 }, { x: centro.x + Math.cos(a) * r1, y: centro.y + Math.sin(a) * r1 * .8 }, 1.5 * (1 - e), luz)
      }
    }
    zzz(s, .5)
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...Object.values(COR).flat())

export const SONO_POR_GOLPE = montarFamilia(PERFIS_DE_SONO, {
  desenhar: (p, c, id) => GOLPES[id](cena(p, c)),
  duracao: p => p.vai + p.pega + p.some,
  // "Contato" do sono é o instante em que ele CHEGA no alvo.
  contato: p => p.vai,
  alcance: 44, margem: () => ({ cima: 50, baixo: 30, lados: 44 }), pele: peleDe,
})
