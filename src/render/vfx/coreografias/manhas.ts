// Manhas (12/11): sete golpes de status que BAIXAM um atributo do alvo na
// base da lábia, do charme ou do drama. Décima terceira família de golpes de
// status com efeito próprio.
//
// Cada um parte da descrição do jogo, e a forma é do golpe, não da família:
//   Confide um balão de cochicho vai até o ouvido do alvo · Memento a alma de quem usa sai, voa e
//   afunda o alvo em fitas escuras · Tickle dois dedos de pena fazem cócegas
//   e o alvo ri · Play Nice uma flor é entregue e pousa na cabeça · Baby-Doll
//   Eyes dois olhões brilhantes · Fake Tears chafariz de lágrimas falsas ·
//   Tearful Look uma lágrima só, e a chama de luta do alvo se apaga.
//
// Sai de quem usa (`origem`) e chega no alvo (`alvo`) — `STATUS_QUE_VIAJA`.
// `origem`/`alvo` são o ALTO do corpo: cabeça em `y - 9`, pés em `y + 12`.
// O selo de atributo do jogo continua aparecendo. Sem alfa.
//
// Charm fica FORA de propósito: tem arte PNG própria (`moveVfx.ts`) e o teste
// de guarda `arteDeGolpeDeStatus` exige que ela chegue na tela.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, limitar, saida } from '../primitivas'
import { BRANCO, ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import { arco, conta, disco, fio, linha, traco } from './tracos'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `vai`: sai de quem usa e chega · `pega`: age no alvo · `some`: assenta. */
interface Perfil { vai: number; pega: number; some: number }

export const PERFIS_DE_MANHA: Record<string, Perfil> = {
  confide: { vai: 400, pega: 460, some: 240 },
  memento: { vai: 460, pega: 480, some: 260 },
  tickle: { vai: 260, pega: 580, some: 220 },
  play_nice: { vai: 440, pega: 440, some: 240 },
  baby_doll_eyes: { vai: 340, pega: 480, some: 240 },
  fake_tears: { vai: 240, pega: 600, some: 240 },
  tearful_look: { vai: 380, pega: 500, some: 260 },
}

const COR = {
  balao: ['#5a6a8a', '#f4f6fa', '#a8b8d8'],
  rosa: ['#c03a78', '#ff8ab8', '#ffe0ee'],
  alma: ['#2a1a3a', '#6a4a9a', '#c8b0f0'],
  pena: ['#8a94a8', '#e8eef7', '#ffd23a'],
  flor: ['#3f8f4a', '#ffd23a', '#ff8ab8'],
  olhao: ['#2a3a6a', '#ffffff', '#8ac8ff'],
  choro: ['#2f5fa8', '#6fb0ff', '#dff0ff'],
  chama: ['#b03a1e', '#ff9a3a', '#fff0a0'],
} as const

interface Cena {
  c: ContextoVfx; p: Perfil
  o: Ponto; a: Ponto; cabecaO: Ponto; cabeca: Ponto; chaoO: number; dir: number
  vai: number; pega: number | null; some: number
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  return {
    c, p, o: c.origem, a: c.alvo, cabecaO: { x: c.origem.x, y: c.origem.y - 9 }, cabeca: { x: c.alvo.x, y: c.alvo.y - 9 },
    chaoO: c.origem.y + 12, dir: c.alvo.x >= c.origem.x ? 1 : -1,
    vai: limitar(c.ms / p.vai), pega: janela(c.ms, p.vai, p.pega), some: limitar((c.ms - p.vai - p.pega) / p.some),
  }
}
/** Gota de ponta pra cima. */
function gota(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, cores: readonly string[]): void {
  if (k <= .2) return
  poligono(ctx, [[x, y - 4.8 * k], [x + 2.9 * k, y + .4 * k], [x, y + 3.2 * k], [x - 2.9 * k, y + .4 * k]], ESCURO)
  poligono(ctx, [[x, y - 3.4 * k], [x + 1.9 * k, y + .3 * k], [x, y + 2.2 * k], [x - 1.9 * k, y + .3 * k]], cores[1])
  disco(ctx, x - .5 * k, y + .2 * k, .7 * k, cores[2])
}
/** Bochecha corada: dois ovais rosa na altura do rosto do alvo. */
function corado(s: Cena, forca: number): void {
  if (forca <= .1) return
  for (const lado of [-1, 1]) {
    const x = s.cabeca.x + lado * 5.5, y = s.cabeca.y + 4
    for (let i = 0; i < 3; i++) fio(s.c.ctx, { x: x - 2 + i * 1.6, y: y + 1.6 }, { x: x - 1 + i * 1.6, y: y - 1.2 }, 1.1 * forca, COR.rosa[1])
  }
}

const GOLPES: Record<string, (s: Cena) => void> = {
  /** "The user tells the target a secret, and the target loses its ability to concentrate. This lowers the target's Sp. Atk stat." */
  confide(s) {
    const { ctx, ms } = s.c, [fundo, meio] = COR.balao
    // Um BALÃO de cochicho (com reticências) sai da boca e vai de mansinho até
    // o ouvido do alvo; lá estoura em "psst" e o alvo fica com um rabisco
    // de cabeça cheia.
    if (s.pega === null && s.some <= 0) {
      const de = { x: s.cabecaO.x + s.dir * 7, y: s.cabecaO.y + 1 }, ate = { x: s.cabeca.x - s.dir * 8, y: s.cabeca.y + 1 }
      const u = saida(s.vai), x = de.x + (ate.x - de.x) * u, y = de.y + (ate.y - de.y) * u + Math.sin(u * Math.PI * 2) * 2, k = Math.min(1, s.vai * 4)
      const caixa = (g: number): [number, number][] => [[x - (6 + g) * k, y - (3.6 + g) * k], [x + (6 + g) * k, y - (3.6 + g) * k], [x + (6 + g) * k, y + (3.2 + g) * k], [x + s.dir * 1 * k, y + (3.2 + g) * k], [x + s.dir * 4 * k, y + (6.4 + g) * k], [x - s.dir * 2 * k, y + (3.2 + g) * k], [x - (6 + g) * k, y + (3.2 + g) * k]]
      poligono(ctx, caixa(1.2), ESCURO); poligono(ctx, caixa(0), meio)
      for (let i = 0; i < 3; i++) disco(ctx, x + (i - 1) * 3.2 * k, y - .2 * k + (Math.floor(ms / 110) % 3 === i ? -1 : 0), 1 * k, fundo)
      return
    }
    const t = s.pega ?? 1, fino = 1 - entrada(s.some), ouvido = { x: s.cabeca.x - s.dir * 6, y: s.cabeca.y + 1 }
    if (t < .3) for (let i = 0; i < 3; i++) {
      const e = t / .3, a = (s.dir > 0 ? Math.PI : 0) + (i - 1) * .5
      fio(ctx, { x: ouvido.x + Math.cos(a) * (2 + e * 4), y: ouvido.y + Math.sin(a) * (2 + e * 4) }, { x: ouvido.x + Math.cos(a) * (5 + e * 5), y: ouvido.y + Math.sin(a) * (5 + e * 5) }, 1.3 * (1 - e), meio)
    }
    // Rabisco de cabeça cheia: espiral aberta que desce.
    const pts: Ponto[] = [], abre = saida(limitar((t - .15) / .4)) * fino
    for (let i = 0; i <= 16; i++) { const f = i / 16, a = f * Math.PI * 3.4 + ms * .006; pts.push({ x: s.cabeca.x + 6 + Math.cos(a) * 4.5 * f * abre, y: s.cabeca.y - 6 + Math.sin(a) * 4.5 * f * abre }) }
    if (abre > .2) traco(ctx, pts, 1.2, fundo)
  },

  /** "The user faints when using this move. In return, this harshly lowers the target's Attack and Sp. Atk stats." */
  memento(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.alma
    // A ALMA de quem usa se solta do corpo (uma chama escura com dois olhos),
    // voa até o alvo e desfaz-se em fitas que descem por ele, afundando.
    if (s.pega === null && s.some <= 0) {
      const sai = saida(limitar(s.vai / .4)), u = entrada(limitar((s.vai - .4) / .6))
      const de = { x: s.o.x, y: s.o.y - 6 - sai * 12 }, ate = { x: s.a.x, y: s.a.y - 10 }
      const x = de.x + (ate.x - de.x) * u, y = de.y + (ate.y - de.y) * u, k = .6 + sai * .5, lambe = Math.sin(ms * .03) * 1.4
      const forma = (g: number): [number, number][] => [[x - s.dir * 2 + lambe, y - (8 + g) * k], [x + (4.4 + g) * k, y - 1 * k], [x + (3 + g) * k, y + (4 + g) * k], [x - (3 + g) * k, y + (4 + g) * k], [x - (4.4 + g) * k, y - 1 * k]]
      poligono(ctx, forma(1.3), ESCURO); poligono(ctx, forma(0), meio)
      for (const lado of [-1, 1]) disco(ctx, x + lado * 1.7 * k, y + .2 * k, .9 * k, luz)
      // Fio que ainda prende a alma ao corpo.
      if (u < .5) fio(ctx, { x: s.o.x, y: s.o.y - 4 }, { x, y: y + 4 * k }, 1.2 * (1 - u * 2), fundo)
      return
    }
    const t = s.pega ?? 1, fino = 1 - entrada(s.some)
    if (t < .2) brilho(ctx, s.a.x, s.a.y - 10, 6 * (1 - t / .2) + 1, luz)
    for (let i = 0; i < 4; i++) {
      const x0 = s.a.x - 9 + i * 6, desce = saida(limitar(t * 1.4 - i * .08)), pts: Ponto[] = []
      for (let j = 0; j <= 8; j++) { const f = (j / 8) * desce; pts.push({ x: x0 + Math.sin(f * 6 + ms * .006 + i) * 2.2, y: s.a.y - 12 + f * 26 }) }
      if (desce < .1) continue
      linha(ctx, pts, 3 * fino, ESCURO); linha(ctx, pts, 1.4 * fino, i % 2 ? meio : luz)
    }
  },

  /** "The user tickles the target into laughing, reducing its Attack and Defense stats." */
  tickle(s) {
    const { ctx, ms } = s.c, [fundo, meio, amarelo] = COR.pena
    // Dois DEDOS de pena chegam dos lados do alvo e fazem cócegas (vai-e-vem
    // rápido); em cima da cabeça, risadinhas saltam uma atrás da outra.
    const chega = saida(s.vai), fino = 1 - entrada(s.some), coca = s.pega !== null ? Math.sin(ms * .05) * 2.4 : 0
    for (const lado of [-1, 1]) {
      const x = s.a.x + lado * (26 - chega * 15) + coca * lado, y = s.a.y + 4 - coca * lado * .4
      const incl = lado * (-.5 + Math.sin(ms * .05) * (s.pega !== null ? .3 : 0)), c = Math.cos(incl), sn = Math.sin(incl), k = 1.15 * fino * Math.min(1, s.vai * 3)
      if (k < .2) continue
      // Pena deitada, apontando pro corpo.
      const forma = (g: number): [number, number][] => ([[-6.5 - g, 0], [-2, -2.4 - g], [3, -1.8 - g], [5, 0], [3, 1.8 + g], [-2, 2.4 + g]] as const).map(([px, py]) => [x + (px * -lado * c - py * sn) * k, y + (px * -lado * sn + py * c) * k] as [number, number])
      poligono(ctx, forma(1.1), ESCURO); poligono(ctx, forma(0), meio)
      fio(ctx, { x: forma(0)[0][0], y: forma(0)[0][1] }, { x: forma(0)[3][0], y: forma(0)[3][1] }, .8, fundo)
    }
    if (s.pega !== null) for (let i = 0; i < 3; i++) {
      const v = (s.pega * 3 + i / 3) % 1, x = s.cabeca.x - 7 + i * 7, y = s.cabeca.y - 5 - Math.sin(v * Math.PI) * 6
      // Risada: arco aberto pra cima, feito um "u" que pula.
      linha(ctx, [{ x: x - 2.2, y: y - 1.5 }, { x: x - 1.2, y: y + 1.2 }, { x: x + 1.2, y: y + 1.2 }, { x: x + 2.2, y: y - 1.5 }], 2.6 * Math.sin(v * Math.PI), ESCURO)
      linha(ctx, [{ x: x - 2.2, y: y - 1.5 }, { x: x - 1.2, y: y + 1.2 }, { x: x + 1.2, y: y + 1.2 }, { x: x + 2.2, y: y - 1.5 }], 1.2 * Math.sin(v * Math.PI), amarelo)
    }
  },

  /** "The user and the target become friends, and the target loses its will to fight. This lowers the target's Attack stat." */
  play_nice(s) {
    const { ctx, ms } = s.c, [caule, miolo, petala] = COR.flor
    // Uma FLOR é oferecida: sai de quem usa girando devagar, cruza em arco
    // alto e pousa na cabeça do alvo; em volta, brilhinhos de amizade.
    const pouso = { x: s.cabeca.x, y: s.cabeca.y - 5 }
    const p = s.pega === null && s.some <= 0 ? arco({ x: s.o.x + s.dir * 6, y: s.o.y - 4 }, pouso, saida(s.vai), 13) : pouso
    const k = (s.pega === null && s.some <= 0 ? Math.min(1, s.vai * 4) : 1 + Math.sin(limitar((s.pega ?? 1) / .25) * Math.PI) * .25) * (1 - entrada(s.some))
    const giro = s.pega === null && s.some <= 0 ? ms * .008 : .3
    if (k > .15) {
      fio(ctx, { x: p.x, y: p.y + 2 * k }, { x: p.x + 1.5 * k, y: p.y + 8 * k }, 2.6 * k, ESCURO); fio(ctx, { x: p.x, y: p.y + 2 * k }, { x: p.x + 1.5 * k, y: p.y + 8 * k }, 1.2 * k, caule)
      for (const [g, cor] of [[1.1, ESCURO], [0, petala]] as const) for (let i = 0; i < 5; i++) {
        const a = giro + i * (Math.PI * 2 / 5)
        disco(ctx, p.x + Math.cos(a) * 3.2 * k, p.y + Math.sin(a) * 3.2 * k, (2.3 + g) * k, cor)
      }
      conta(ctx, p.x, p.y, 1.7 * k, miolo)
    }
    if (s.pega !== null) for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + .5, pisca = Math.sin(ms * .014 + i * 2)
      if (pisca > .1) brilho(ctx, s.a.x + Math.cos(a) * 14, s.a.y - 2 + Math.sin(a) * 10, 2.4 * pisca + .4, miolo)
    }
  },

  /** "The user stares at the target with its baby-doll eyes, which lowers its Attack stat. This move always goes first." */
  baby_doll_eyes(s) {
    const { ctx, ms } = s.c, [pupila, branco, reflexo] = COR.olhao
    // Dois OLHÕES redondos se abrem acima de quem usa: pupila enorme, dois
    // reflexos, e ficam TREMELICANDO de tão brilhantes. Brilhos vão até o alvo.
    const abre = saida(limitar(s.vai / .5)) * (1 - entrada(s.some)), centro = { x: s.cabecaO.x + s.dir * 2, y: s.cabecaO.y - 9 }
    const treme = Math.sin(ms * .04) * .5
    for (const lado of [-1, 1]) {
      const x = centro.x + lado * 7, R = 5.6 * abre
      if (R < .8) continue
      conta(ctx, x, centro.y, R, branco)
      disco(ctx, x + s.dir * .8, centro.y + .6, R * .72, pupila)
      disco(ctx, x + s.dir * .8 - 1.6 + treme, centro.y - 1.4, R * .3, BRANCO)
      disco(ctx, x + s.dir * .8 + 1.6, centro.y + 2 - treme, R * .16, reflexo)
    }
    if (s.vai > .45 && s.some <= 0) for (let i = 0; i < 3; i++) {
      const u = ((ms / 460) + i / 3) % 1
      const x = centro.x + (s.cabeca.x - centro.x) * u, y = centro.y + (s.cabeca.y - centro.y) * u + Math.sin(u * Math.PI) * -5
      brilho(ctx, x, y, 2.3 * Math.sin(u * Math.PI) + .3, reflexo)
    }
    if (s.pega !== null) corado(s, Math.min(1, s.pega * 4))
  },

  /** "The user feigns crying to fluster the target, harshly lowering its Sp. Def stat." */
  fake_tears(s) {
    const { ctx, ms } = s.c, cores = COR.choro
    // Choro EXAGERADO: dois chafarizes de lágrimas saem dos olhos de quem usa
    // em arco pros lados e fazem poça; o alvo fica sem jeito (gota de suor).
    const forca = Math.min(1, s.vai * 2) * (1 - entrada(s.some)), n = s.c.pedir(5)
    for (const lado of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const v = (ms / 420 + i / n) % 1
        const x = s.cabecaO.x + lado * (3 + v * 15), y = s.cabecaO.y + 1 - Math.sin(v * Math.PI) * 9 + v * 16
        gota(ctx, x, y, (.55 + (1 - v) * .35) * forca, cores)
      }
      const poca = 6 * forca
      if (poca > 1) { fio(ctx, { x: s.cabecaO.x + lado * 12, y: s.chaoO }, { x: s.cabecaO.x + lado * (12 + poca), y: s.chaoO }, 3, cores[0]); fio(ctx, { x: s.cabecaO.x + lado * 13, y: s.chaoO - .4 }, { x: s.cabecaO.x + lado * (11 + poca), y: s.chaoO - .4 }, 1.1, cores[2]) }
    }
    if (s.pega !== null) {
      // Sem jeito: uma gota grande de suor escorrendo ao lado da cabeça.
      const v = (s.pega * 1.6) % 1
      gota(ctx, s.cabeca.x - s.dir * 8, s.cabeca.y - 3 + v * 7, 1 * (1 - v * .5), cores)
      for (let i = 0; i < 2; i++) fio(ctx, { x: s.cabeca.x + s.dir * (7 + i * 3), y: s.cabeca.y - 5 }, { x: s.cabeca.x + s.dir * (9 + i * 3), y: s.cabeca.y - 8 }, 1.2, BRANCO)
    }
  },

  /** "The user gets teary eyed to make the target lose its combative spirit. This lowers the target's Attack and Sp. Atk stats." */
  tearful_look(s) {
    const { ctx, ms } = s.c, cores = COR.choro, [fundo, meio, luz] = COR.chama
    // Uma LÁGRIMA só, grande, cresce no olho de quem usa, treme e cai devagar.
    // Em cima do alvo, a chama do espírito de luta vai minguando até apagar
    // num fio de fumaça.
    const olho = { x: s.cabecaO.x + s.dir * 4, y: s.cabecaO.y + 2 }
    const cresce = saida(limitar(s.vai / .6)), cai = s.pega === null ? (s.some > 0 ? 1 : 0) : entrada(limitar(s.pega / .7))
    if (cai < 1) gota(ctx, olho.x + Math.sin(ms * .05) * .6 * (1 - cai), olho.y + cai * 16, 1.25 * cresce * (1 - cai * .3), cores)
    else if (s.pega !== null && s.pega < .9) for (const lado of [-1, 1]) fio(ctx, { x: olho.x + lado * 2, y: s.chaoO - 1 }, { x: olho.x + lado * 5, y: s.chaoO - 3 }, 1.2 * (1 - (s.pega - .7) / .2), cores[2])
    // A chama do alvo.
    const vida = s.pega === null ? (s.some > 0 ? 0 : 1) : 1 - saida(limitar(s.pega / .75)), topo = { x: s.cabeca.x, y: s.cabeca.y - 8 }
    const k = (.35 + vida * .85) * Math.min(1, s.vai * 3), lambe = Math.sin(ms * .03) * 1.2 * vida
    if (vida > .05) {
      const forma = (g: number): [number, number][] => [[topo.x + lambe, topo.y - (7 + g) * k], [topo.x + (3.4 + g) * k, topo.y - .5 * k], [topo.x + (2 + g * .6) * k, topo.y + (3 + g) * k], [topo.x - (2 + g * .6) * k, topo.y + (3 + g) * k], [topo.x - (3.4 + g) * k, topo.y - .5 * k]]
      poligono(ctx, forma(1.2), ESCURO); poligono(ctx, forma(0), fundo)
      poligono(ctx, [[topo.x + lambe * .4, topo.y - 4 * k], [topo.x + 1.9 * k, topo.y], [topo.x, topo.y + 2 * k], [topo.x - 1.9 * k, topo.y]], meio)
      disco(ctx, topo.x, topo.y + .4 * k, 1 * k, luz)
    }
    else if (s.some < .8) {
      // Fumacinha: o que sobra.
      const v = s.pega === null ? s.some : limitar((s.pega - .5) / .5)
      for (let i = 0; i < 2; i++) conta(ctx, topo.x + Math.sin(v * 5 + i * 2) * 2, topo.y - v * 9 - i * 4, 1.6 * (1 - v), '#c8ced8')
    }
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], '#c8ced8', ...Object.values(COR).flat())

export const MANHAS_POR_GOLPE = montarFamilia(PERFIS_DE_MANHA, {
  desenhar: (p, c, id) => GOLPES[id](cena(p, c)),
  duracao: p => p.vai + p.pega + p.some,
  // "Contato" é o instante em que a manha CHEGA no alvo.
  contato: p => p.vai,
  alcance: 46, margem: () => ({ cima: 54, baixo: 34, lados: 48 }), pele: peleDe,
})
