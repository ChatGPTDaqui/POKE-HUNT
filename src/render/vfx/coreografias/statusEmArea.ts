// Status em área (13/11): onze golpes de status que atingem TODOS em volta de
// quem usa. Décima quarta família de golpes de status com efeito próprio, e a
// primeira em área: o resolver lê `REGISTRO_DE_STATUS_DE_AREA`.
//
// Cada um parte da descrição do jogo, e a forma é do golpe, não da família:
//   Growl ondas de borda ondulada, fofas · Leer um par de olhos e um corte de
//   luz que varre o chão · Tail Whip leque de abanadas e redemoinhos de poeira
//   · Sweet Scent fios de perfume em S subindo com pétalas · Cotton Spore
//   chumaços que voam e assentam · String Shot fios de seda esticados em raio
//   com laço na ponta · Captivate anel de corações que estouram · Poison Gas
//   nuvem roxa baixa que se espalha · Venom Drench chuva grossa de veneno ·
//   Teeter Dance um anel que gangorra e deixa todo mundo tonto · Heal Block
//   cruzes de cura riscadas por um X.
//
// O chão da área é uma ELIPSE (0,45 de altura) centrada nos pés de quem usa
// (`origem.y + 12`), de raio `c.raio`. Peças espalhadas, nada chapado.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, limitar, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import { interior, noChao } from './comum'
import { conta, disco, fio, linha } from './tracos'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `abre`: sai de quem usa e cobre a área · `fica`: age · `some`: assenta. */
interface Perfil { abre: number; fica: number; some: number }

export const PERFIS_DE_STATUS_EM_AREA: Record<string, Perfil> = {
  growl: { abre: 300, fica: 460, some: 240 },
  leer: { abre: 240, fica: 420, some: 220 },
  tail_whip: { abre: 260, fica: 500, some: 240 },
  sweet_scent: { abre: 380, fica: 560, some: 280 },
  cotton_spore: { abre: 440, fica: 480, some: 260 },
  string_shot: { abre: 300, fica: 500, some: 260 },
  captivate: { abre: 360, fica: 460, some: 240 },
  poison_gas: { abre: 420, fica: 520, some: 280 },
  venom_drench: { abre: 260, fica: 600, some: 260 },
  teeter_dance: { abre: 280, fica: 620, some: 260 },
  heal_block: { abre: 320, fica: 520, some: 260 },
}

const COR = {
  fofo: ['#c06a8a', '#ffc0d8', '#fff4f8'],
  olhar: ['#7a1010', '#ffd23a', '#fff6c0'],
  poeira: ['#8a7a5a', '#d8c8a0', '#fff8e0'],
  perfume: ['#c03a78', '#ff8ab8', '#ffe0ee'],
  algodao: ['#b8c0cc', '#f4f6fa', '#ffffff'],
  seda: ['#8d95a8', '#e9eef7', '#ffffff'],
  veneno: ['#4a1f6e', '#9b4fd0', '#e3b5ff'],
  tonto: ['#c9952a', '#ffe36a', '#5ad0e8'],
  cura: ['#2a8a4a', '#6fe08a', '#e03a3a'],
} as const

interface Cena {
  c: ContextoVfx; p: Perfil; semente: number
  /** Alto do corpo de quem usa, centro do chão da área e raio. */
  o: Ponto; R: number
  abre: number; fica: number | null; some: number
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  return {
    c, p, semente: Math.floor(c.rng() * 0xffffffff), o: c.origem, R: c.raio,
    abre: limitar(c.ms / p.abre), fica: janela(c.ms, p.abre, p.fica), some: limitar((c.ms - p.abre - p.fica) / p.some),
  }
}
/** Anel no chão (elipse), opcionalmente de borda ondulada. */
function anelNoChao(s: Cena, raio: number, largura: number, cor: string, onda = 0, lobos = 0, fase = 0): void {
  if (raio < 2 || largura <= .2) return
  const pts: Ponto[] = [], n = 40
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push(noChao(s.o, a, raio + Math.sin(a * lobos + fase) * onda)) }
  linha(s.c.ctx, pts, largura + 1.8, ESCURO); linha(s.c.ctx, pts, largura, cor)
}
function coracao(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, cor: string, luz: string): void {
  if (k <= .15) return
  const forma = (g: number): [number, number][] => ([[0, 3.8 + g], [-4.2 - g, -.4], [-3.2 - g * .7, -3.4 - g], [-1, -3.8 - g], [0, -2.2 - g * .4], [1, -3.8 - g], [3.2 + g * .7, -3.4 - g], [4.2 + g, -.4]] as const)
    .map(([px, py]) => [x + px * k, y + py * k] as [number, number])
  poligono(ctx, forma(1.2 / Math.max(.4, k)), ESCURO); poligono(ctx, forma(0), cor)
  disco(ctx, x - 1.8 * k, y - 1.8 * k, .9 * k, luz)
}
/** Chumaço de três gomos. */
function chumaco(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, cores: readonly string[]): void {
  if (k <= .15) return
  for (const [g, cor] of [[1.1, ESCURO], [0, cores[0]]] as const) {
    disco(ctx, x - 2.2 * k, y + .8 * k, (2.6 + g) * k, cor); disco(ctx, x + 2.2 * k, y + .8 * k, (2.6 + g) * k, cor); disco(ctx, x, y - 1.4 * k, (3 + g) * k, cor)
  }
  disco(ctx, x - 1.6 * k, y + .2 * k, 2 * k, cores[1]); disco(ctx, x + 1.4 * k, y + .2 * k, 2 * k, cores[1]); disco(ctx, x - .4 * k, y - 1.8 * k, 2.3 * k, cores[2])
}
/** A área é grande (raio 175): peça do tamanho de golpe alvo-único some nela. */
const G = 1.8
/**
 * Espalha peças pela área, cada uma desenhada AMPLIADA em torno do seu ponto:
 * `fn` recebe o ponto como origem (0,0) e a distância real ao centro.
 */
function espalhar(s: Cena, base: number, giro: number, fn: (p: Ponto, d: number, i: number) => void): void {
  const { ctx } = s.c
  interior(s.o, s.R, quantos(s, base), giro).forEach(({ p, d }, i) => {
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(G, G)
    fn({ x: 0, y: 0 }, d, i)
    ctx.restore()
  })
}
/** Quantos pontos espalhar: cresce com o tier, cabe no orçamento. */

const quantos = (s: Cena, base: number) => s.c.pedir(base + s.c.tier * 2)

const GOLPES: Record<string, (s: Cena) => void> = {
  /** "The user growls in an endearing way, making opposing Pokémon less wary. This lowers their Attack stats." */
  growl(s) {
    const [fundo, meio, luz] = COR.fofo
    // Rosnado FOFO: três ondas de borda ondulada (nada de ponta) saem de quem
    // usa e abrem pelo chão, uma atrás da outra, engordando e sumindo.
    const total = s.p.abre + s.p.fica
    for (let i = 0; i < 3; i++) {
      const u = limitar((s.c.ms - i * 170) / (total - 340))
      if (u <= 0 || u >= 1) continue
      anelNoChao(s, saida(u) * s.R * .95, 2.6 * (1 - u) + 1.2, i % 2 ? luz : meio, 4 + u * 4, 9, s.c.ms * .01 + i)
    }
    // Boquinha: dois arcos pequenos na frente de quem usa.
    if (s.fica === null && s.some <= 0) for (const lado of [-1, 1]) {
      const x = s.o.x + lado * 13, y = s.o.y - 4, k = Math.sin(s.abre * Math.PI) * G
      linha(s.c.ctx, [{ x, y: y - 3 * k }, { x: x + lado * 2.5 * k, y }, { x, y: y + 3 * k }], 1.4 * k, fundo)
    }
  },

  /** "The user gives opposing Pokémon an intimidating leer that lowers the Defense stat." */
  leer(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.olhar
    // OLHAR torto: dois olhos em cunha acendem sobre quem usa e, do brilho
    // deles, um corte fino de luz varre o chão de dentro pra fora, rápido.
    const abre = saida(limitar(s.abre * 1.6)) * (1 - entrada(s.some))
    for (const lado of [-1, 1]) {
      const x = s.o.x + lado * 10, y = s.o.y - 24, k = 1.9 * abre
      if (k < .15) continue
      const cunha = (g: number): [number, number][] => [[x - lado * (4.5 + g) * k, y + (1.5 + g) * k], [x + lado * (4.5 + g) * k, y - (3.2 + g) * k], [x + lado * (4.5 + g) * k, y + (2.6 + g) * k]]
      poligono(ctx, cunha(1.3), ESCURO); poligono(ctx, cunha(0), meio); disco(ctx, x + lado * 1.8 * k, y, 1 * k, fundo)
    }
    if (s.fica !== null && s.fica < .14) brilho(ctx, s.o.x, s.o.y - 24, 11 * (1 - s.fica / .14) + 1, luz)
    const t = s.fica ?? (s.some > 0 ? 1 : -1)
    if (t >= 0 && t < .7) {
      const u = t / .7
      anelNoChao(s, saida(u) * s.R * .97, 2 * (1 - u) + 1, luz)
      // Quatro lampejos correndo junto com o corte.
      for (let i = 0; i < 4; i++) { const q = noChao(s.o, i * Math.PI / 2 + .5, saida(u) * s.R * .97); brilho(ctx, q.x, q.y, 7 * (1 - u) + .5, meio) }
    }
  },

  /** "The user wags its tail cutely, making opposing Pokémon less wary and lowering their Defense stats." */
  tail_whip(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.poeira
    // ABANAR: atrás de quem usa, três arcos em leque vão de um lado pro outro;
    // pela área, redemoinhos de poeira rodam e soltam um brilho.
    const forca = Math.min(1, s.abre * 2) * (1 - entrada(s.some)), abana = Math.sin(ms * .022)
    for (let i = 0; i < 3; i++) {
      const pts: Ponto[] = [], R = 14 + i * 7
      for (let j = 0; j <= 8; j++) { const a = Math.PI / 2 + abana * .8 + (j / 8 - .5) * 1.1; pts.push({ x: s.o.x + Math.cos(a) * R, y: s.o.y + 8 + Math.sin(a) * R * .5 }) }
      linha(ctx, pts, 3.8 * forca, ESCURO); linha(ctx, pts, 1.9 * forca, i % 2 ? luz : meio)
    }
    const t = s.fica ?? (s.some > 0 ? 1 : 0)
    espalhar(s, 5, .7, (p, d, i) => {
      const e = limitar(t * 1.6 - (d / s.R) * .5)
      if (e <= 0 || e >= 1) return
      const pts: Ponto[] = [], vida = Math.sin(e * Math.PI)
      for (let j = 0; j <= 10; j++) { const f = j / 10, a = f * Math.PI * 3 + ms * .02 + i; pts.push({ x: p.x + Math.cos(a) * 6 * f * vida, y: p.y - 2 + Math.sin(a) * 2.6 * f * vida }) }
      linha(ctx, pts, 2.4 * vida, ESCURO); linha(ctx, pts, 1.1 * vida, fundo)
      if (i % 2) brilho(ctx, p.x, p.y - 7, 2.6 * vida, luz)
    })
  },

  /** "A sweet scent that harshly lowers opposing Pokémon's evasiveness." */
  sweet_scent(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.perfume
    // PERFUME: em cada ponto da área um fio em S sobe devagar, ondulando, com
    // uma pétala girando na ponta; os de perto nascem primeiro.
    const fino = 1 - entrada(s.some)
    espalhar(s, 6, .3, (p, d, i) => {
      const nasce = limitar((s.c.ms - (d / s.R) * s.p.abre) / 360)
      if (nasce <= 0) return
      const alto = 20 * saida(nasce) * fino, pts: Ponto[] = []
      for (let j = 0; j <= 10; j++) { const f = j / 10; pts.push({ x: p.x + Math.sin(f * 5 + ms * .005 + i) * 3.5 * f, y: p.y - f * alto }) }
      if (alto < 2) return
      linha(ctx, pts, 2.6 * fino, fundo); linha(ctx, pts, 1.1 * fino, i % 2 ? luz : meio)
      const q = pts[pts.length - 1], g = ms * .008 + i, k = 2.4 * fino
      poligono(ctx, [[q.x + Math.cos(g) * (k + 1), q.y + Math.sin(g) * (k + 1)], [q.x - Math.sin(g) * (k * .6 + 1), q.y + Math.cos(g) * (k * .6 + 1)], [q.x - Math.cos(g) * (k + 1), q.y - Math.sin(g) * (k + 1)], [q.x + Math.sin(g) * (k * .6 + 1), q.y - Math.cos(g) * (k * .6 + 1)]], ESCURO)
      poligono(ctx, [[q.x + Math.cos(g) * k, q.y + Math.sin(g) * k], [q.x - Math.sin(g) * k * .6, q.y + Math.cos(g) * k * .6], [q.x - Math.cos(g) * k, q.y - Math.sin(g) * k], [q.x + Math.sin(g) * k * .6, q.y - Math.cos(g) * k * .6]], meio)
    })
  },

  /** "The user releases cotton-like spores that cling to opposing Pokémon, which harshly lowers their Speed stats." */
  cotton_spore(s) {
    const { ctx, ms } = s.c
    // CHUMAÇOS saem de quem usa em arco alto, flutuam e assentam espalhados;
    // pousados, incham um pouco e ficam balançando.
    const fino = 1 - entrada(s.some)
    interior(s.o, s.R, quantos(s, 6), 1.1).forEach(({ p }, i) => {
      const u = limitar((s.c.ms - i * 26) / (s.p.abre + 120))
      if (u <= 0) return
      const e = saida(u), de = { x: s.o.x, y: s.o.y - 6 }
      const x = de.x + (p.x - de.x) * e + Math.sin(ms * .006 + i) * 2 * (1 - u), y = de.y + (p.y - 6 - de.y) * e - 40 * 4 * u * (1 - u) * .5
      chumaco(ctx, x, y, (.55 + u * .45 + (u >= 1 ? Math.sin(ms * .01 + i) * .06 : 0)) * fino * G, COR.algodao)
    })
  },

  /** "Opposing Pokémon are bound with silk blown from the user's mouth that harshly lowers the Speed stat." */
  string_shot(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.seda
    // SEDA: fios disparados da boca em raio, esticados e levemente arqueados,
    // um pra cada ponto da área; na ponta, o fio dá um laço e aperta.
    const boca = { x: s.o.x, y: s.o.y - 4 }, fino = 1 - entrada(s.some)
    interior(s.o, s.R, quantos(s, 5), 2.1).forEach(({ p }, i) => {
      const ate = saida(limitar((s.c.ms - i * 22) / s.p.abre)), de = s.some
      if (ate - de < .04) return
      const pts: Ponto[] = []
      for (let j = 0; j <= 10; j++) { const f = de + (ate - de) * (j / 10); pts.push({ x: boca.x + (p.x - boca.x) * f, y: boca.y + (p.y - 2 - boca.y) * f - Math.sin(f * Math.PI) * 12 }) }
      linha(ctx, pts, 3.4, fundo); linha(ctx, pts, 1.5, i % 2 ? luz : meio)
      if (ate >= 1) {
        const aperta = s.fica === null ? 1 : saida(limitar(s.fica / .4)), r = (11 - 4.5 * aperta) * fino
        const laco: Ponto[] = []
        for (let j = 0; j <= 12; j++) { const a = (j / 12) * Math.PI * 2; laco.push({ x: p.x + Math.cos(a) * r, y: p.y - 2 + Math.sin(a) * r * .45 }) }
        linha(ctx, laco, 3.4, fundo); linha(ctx, laco, 1.5, luz)
      }
    })
  },

  /** "If any opposing Pokémon is the opposite gender of the user, it is charmed, which harshly lowers its Sp. Atk stat." */
  captivate(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.perfume
    // Um ANEL de corações nasce em volta de quem usa e abre pela área girando;
    // chegando na borda, cada um estoura num brilho.
    const n = quantos(s, 6), u = limitar(s.c.ms / (s.p.abre + s.p.fica * .7)), fino = 1 - entrada(s.some)
    if (s.abre < .4) brilho(ctx, s.o.x + 5, s.o.y - 10, 8 * Math.sin(s.abre / .4 * Math.PI) + .5, luz)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + u * 1.4, q = noChao(s.o, a, 10 + saida(u) * (s.R * .9 - 10))
      if (u < 1) coracao(ctx, q.x, q.y - 8 - Math.sin(u * Math.PI) * 10, (.6 + u * .35) * Math.min(1, u * 5) * G, i % 2 ? fundo : meio, luz)
      else if (s.fica !== null) { const e = limitar((s.fica - .7) / .3); brilho(ctx, q.x, q.y - 8, 9 * (1 - e) * fino + .4, luz) }
    }
  },

  /** "A cloud of poison gas is sprayed in the face of opposing Pokémon, poisoning those it hits." */
  poison_gas(s) {
    const { ctx, ms } = s.c, cores = COR.veneno
    // GÁS: gomos roxos saem de quem usa e se espalham baixo pela área, rolando;
    // ficam pairando na altura do rosto e soltam bolhas.
    const fino = 1 - entrada(s.some)
    interior(s.o, s.R, quantos(s, 7), 1.7).forEach(({ p, d }, i) => {
      const rng = rngSemeado(s.semente + i * 97), u = limitar((s.c.ms - i * 18) / (s.p.abre * (.5 + d / s.R * .6)))
      if (u <= 0) return
      const e = saida(u), x = s.o.x + (p.x - s.o.x) * e + Math.sin(ms * .004 + i) * 2.5, y = s.o.y + 4 + (p.y - 12 - s.o.y - 4) * e - Math.abs(Math.sin(u * Math.PI * 2 + i)) * 3
      const r = (2.6 + rng() * 2.4) * (.5 + u * .5) * fino * G
      conta(ctx, x, y, r, cores[i % 3]); conta(ctx, x + r * .9, y + r * .3, r * .7, cores[(i + 1) % 3])
      if (u >= 1 && i % 3 === 0) { const v = (ms / 500 + rng()) % 1; conta(ctx, x, y - r - v * 14, 2.4 * (1 - v) * fino, cores[2]) }
    })
  },

  /** "Opposing Pokémon are drenched in an odd poisonous liquid. This lowers the Attack, Sp. Atk, and Speed stats of a poisoned target." */
  venom_drench(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.veneno
    // ENCHARCAR: chuva grossa de veneno cai por toda a área — gotas pesadas,
    // retas, que espatifam numa coroa e deixam poça.
    const forca = Math.min(1, s.abre * 2) * (1 - entrada(s.some))
    espalhar(s, 8, .9, (p, _d, i) => {
      const rng = rngSemeado(s.semente + i * 101), v = (ms / (360 + rng() * 140) + rng()) % 1
      if (v < .72) {
        const y = p.y - 26 + (v / .72) * 26, k = 1.1 * forca
        if (k < .2) return
        poligono(ctx, [[p.x, y - 6 * k], [p.x + 2.8 * k, y], [p.x, y + 3 * k], [p.x - 2.8 * k, y]], ESCURO)
        poligono(ctx, [[p.x, y - 4.4 * k], [p.x + 1.8 * k, y], [p.x, y + 2 * k], [p.x - 1.8 * k, y]], meio)
        disco(ctx, p.x - .5 * k, y - .2 * k, .7 * k, luz)
      }
      else {
        const e = (v - .72) / .28, r = 2 + e * 5
        for (const lado of [-1, 1]) fio(ctx, { x: p.x + lado * r, y: p.y - e * 3 }, { x: p.x + lado * (r * .4), y: p.y + 1 }, 1.3 * (1 - e) * forca, luz)
        fio(ctx, { x: p.x - r, y: p.y + 1.5 }, { x: p.x + r, y: p.y + 1.5 }, 2.2 * forca * (1 - e * .5), fundo)
      }
    })
  },

  /** "The user performs a wobbly dance that confuses the Pokémon around it." */
  teeter_dance(s) {
    const { ctx, ms } = s.c, [, amarelo, azul] = COR.tonto
    // GANGORRA: um anel em volta de quem usa inclina pra um lado e pro outro
    // (sobe de um lado enquanto desce do outro), abrindo; quem está na área
    // ganha estrelinhas de tontura rodando.
    const fino = 1 - entrada(s.some), raio = (12 + saida(limitar(s.c.ms / (s.p.abre + s.p.fica))) * (s.R * .5 - 12)) * fino
    const tomba = Math.sin(ms * .012) * 9 * Math.min(1, s.abre * 2)
    if (raio > 3) {
      const pts: Ponto[] = []
      for (let i = 0; i <= 32; i++) { const a = (i / 32) * Math.PI * 2, q = noChao(s.o, a, raio); pts.push({ x: q.x, y: q.y - 4 + Math.cos(a) * tomba * (raio / (s.R * .5)) }) }
      linha(ctx, pts, 4.6, ESCURO); linha(ctx, pts, 2.4, amarelo); linha(ctx, pts.slice(0, 9), 2.4, azul)
    }
    const t = s.fica ?? (s.some > 0 ? 1 : 0)
    espalhar(s, 4, 2.6, (p, d, i) => {
      const e = limitar(t * 2 - (d / s.R) * .6) * fino
      if (e <= 0) return
      for (let j = 0; j < 3; j++) {
        const a = ms * .011 + j * (Math.PI * 2 / 3) + i, frente = Math.sin(a)
        brilho(ctx, p.x + Math.cos(a) * 7, p.y - 16 + frente * 2.2, (1.5 + frente * .5) * e, j % 2 ? azul : amarelo)
      }
    })
  },

  /** "For five turns, the user prevents the opposing team from using any moves, Abilities, or held items that recover HP." */
  heal_block(s) {
    const { ctx } = s.c, [fundo, meio, vermelho] = COR.cura
    // BLOQUEIO: em cada ponto da área sobe uma cruz verde de cura e, na hora,
    // um X vermelho risca por cima dela (dois traços, um depois do outro); a
    // cruz murcha. Um anel vermelho fecha a área.
    const fino = 1 - entrada(s.some), t = s.fica ?? (s.some > 0 ? 1 : 0)
    anelNoChao(s, saida(s.abre) * s.R * .95, 1.8 * fino, vermelho)
    espalhar(s, 5, 1.4, (p, d, i) => {
      const nasce = saida(limitar((s.c.ms - (d / s.R) * s.p.abre * .8) / 240)), risca = limitar(t * 2.4 - i * .05)
      const k = nasce * (1 - .4 * saida(limitar(risca - .6))) * fino * 1.1, y = p.y - 9 - nasce * 4
      if (k < .15) return
      const cruz = (g: number): [number, number][] => ([[-1.5, -4.5], [1.5, -4.5], [1.5, -1.5], [4.5, -1.5], [4.5, 1.5], [1.5, 1.5], [1.5, 4.5], [-1.5, 4.5], [-1.5, 1.5], [-4.5, 1.5], [-4.5, -1.5], [-1.5, -1.5]] as const)
        .map(([px, py]) => [p.x + px * (1 + g / 4.5) * k, y + py * (1 + g / 4.5) * k] as [number, number])
      poligono(ctx, cruz(1.2), ESCURO); poligono(ctx, cruz(0), risca > .6 ? fundo : meio)
      for (const [lado, ini] of [[1, 0], [-1, .3]] as const) {
        const e = limitar((risca - ini) / .3)
        if (e <= 0) continue
        const a = { x: p.x - lado * 6 * k, y: y - 6 * k }, b = { x: a.x + lado * 12 * k * e, y: a.y + 12 * k * e }
        fio(ctx, a, b, 3.2 * k, ESCURO); fio(ctx, a, b, 1.6 * k, vermelho)
      }
    })
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...Object.values(COR).flat())

export const STATUS_EM_AREA_POR_GOLPE = montarFamilia(PERFIS_DE_STATUS_EM_AREA, {
  desenhar: (p, c, id) => GOLPES[id](cena(p, c)),
  duracao: p => p.abre + p.fica + p.some,
  // "Contato" é o instante em que o efeito COBRIU a área.
  contato: p => p.abre,
  alcance: 60, margem: () => ({ cima: 72, baixo: 30, lados: 30 }), pele: peleDe,
})
