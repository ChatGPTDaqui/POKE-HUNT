// Pragas (13/11): treze golpes de status de SUPORTE lançados NO ALVO que o
// motor resolve por id e que, até aqui, não criavam efeito nenhum na tela.
// Décima sétima família de golpes de status com efeito próprio.
//
// Cada um parte da descrição do jogo, e a forma é do golpe, não da família:
//   Leech Seed sementes em arco que brotam e sugam · Nightmare uma nuvem de
//   dentes paira sobre a cabeça · Curse um prego é cravado em três marteladas
//   · Embargo uma caixa com o sinal de proibido · Quash uma laje desce e
//   espreme · Roar estouros pontudos que empurram · Yawn uma bolha lenta que
//   estoura no rosto · Soak uma bolota d'água que encharca · Lock-On uma mira
//   que gira e trava · Mind Reader um olho que puxa o pensamento · Psycho
//   Shift o mal de quem usa é arrancado e arremessado · Guard Swap dois
//   escudos trocam de lugar · Power Swap duas espadas trocam de lugar.
//
// Sai de quem usa (`origem`) e chega no alvo (`alvo`) — `STATUS_QUE_VIAJA`.
// Os dois são o ALTO do corpo: cabeça em `y - 9`, pés em `y + 12`. Sem alfa.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, limitar, recuo, saida } from '../primitivas'
import { BRANCO, ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import { anel, arco, conta, disco, fio, linha, traco } from './tracos'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `vai`: sai de quem usa e chega · `pega`: age no alvo · `some`: assenta. */
interface Perfil { vai: number; pega: number; some: number }

const P = (vai: number, pega: number, some: number): Perfil => ({ vai, pega, some })
export const PERFIS_DE_PRAGA: Record<string, Perfil> = {
  leech_seed: P(380, 520, 260), nightmare: P(320, 560, 260), curse: P(300, 600, 240), embargo: P(300, 520, 240),
  quash: P(260, 520, 220), roar: P(240, 480, 220), yawn: P(520, 420, 240), soak: P(340, 520, 260),
  lock_on: P(360, 460, 220), mind_reader: P(340, 520, 240), psycho_shift: P(420, 440, 240),
  guard_swap: P(460, 400, 220), power_swap: P(460, 400, 220),
}

const COR = {
  semente: ['#5a3f1e', '#a87a3a', '#6fe08a'],
  pesadelo: ['#2a1a3a', '#6a4a9a', '#f04a3a'],
  prego: ['#4a5262', '#9aa6b8', '#f4f8ff'],
  caixa: ['#7a5a2a', '#c8a050', '#e03a3a'],
  laje: ['#3a3f4a', '#7a8290', '#c8ced8'],
  berro: ['#c9952a', '#ffe36a', '#fffbe0'],
  bocejo: ['#c06a8a', '#ffc0d8', '#fff4f8'],
  agua: ['#2f5fa8', '#6fb0ff', '#dff0ff'],
  mira: ['#8a1616', '#f04a3a', '#ffd0c0'],
  olho: ['#6a2fa0', '#d86adf', '#ffffff'],
  mal: ['#4a1f6e', '#9b4fd0', '#ffe14a'],
  escudo: ['#2a4fb0', '#6fb8ff', '#e8f6ff'],
  espada: ['#a03a2a', '#ff8a5a', '#ffe0d0'],
} as const

interface Cena {
  c: ContextoVfx; p: Perfil
  o: Ponto; a: Ponto; cabeca: Ponto; meio: Ponto; chao: number; dir: number
  vai: number; pega: number | null; some: number
  /** 0..1 da fase `pega`, valendo 0 antes e 1 depois. */
  t: number; fino: number; voando: boolean
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  const pega = janela(c.ms, p.vai, p.pega), some = limitar((c.ms - p.vai - p.pega) / p.some)
  return {
    c, p, o: c.origem, a: c.alvo, cabeca: { x: c.alvo.x, y: c.alvo.y - 9 }, meio: { x: c.alvo.x, y: c.alvo.y + 3 }, chao: c.alvo.y + 12,
    dir: c.alvo.x >= c.origem.x ? 1 : -1, vai: limitar(c.ms / p.vai), pega, some,
    t: pega ?? (some > 0 ? 1 : 0), fino: 1 - entrada(some), voando: pega === null && some <= 0,
  }
}
/** Escudo (brasão) ou espada pequena, pra troca. */
function icone(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, cores: readonly string[], espada: boolean): void {
  if (k <= .15) return
  if (!espada) {
    const f = (g: number): [number, number][] => [[x - (4.4 + g) * k, y - (4.6 + g) * k], [x + (4.4 + g) * k, y - (4.6 + g) * k], [x + (4.4 + g) * k, y + 1 * k], [x, y + (6 + g) * k], [x - (4.4 + g) * k, y + 1 * k]]
    poligono(ctx, f(1.2), ESCURO); poligono(ctx, f(0), cores[1]); poligono(ctx, [[x - 4.4 * k, y - 4.6 * k], [x, y - 4.6 * k], [x, y + 6 * k], [x - 4.4 * k, y + 1 * k]], cores[2])
    return
  }
  fio(ctx, { x, y: y + 6 * k }, { x, y: y - 7 * k }, 4.6 * k, ESCURO); fio(ctx, { x: x - 4 * k, y: y + 2.4 * k }, { x: x + 4 * k, y: y + 2.4 * k }, 4.2 * k, ESCURO)
  fio(ctx, { x, y: y + 1.6 * k }, { x, y: y - 6.4 * k }, 2.4 * k, cores[2]); fio(ctx, { x: x - 3.4 * k, y: y + 2.4 * k }, { x: x + 3.4 * k, y: y + 2.4 * k }, 2 * k, cores[1]); fio(ctx, { x, y: y + 3 * k }, { x, y: y + 5.6 * k }, 2 * k, cores[0])
}

const GOLPES: Record<string, (s: Cena) => void> = {
  /** "A seed is planted on the target. It steals some HP from the target every turn." */
  leech_seed(s) {
    const { ctx, ms } = s.c, [fundo, meio, verde] = COR.semente
    // Três SEMENTES em arco caem em volta dos pés do alvo; delas sobem ramos
    // que o enlaçam, e uma conta verde volta pra quem usou — sugado.
    for (let i = 0; i < 3; i++) {
      const pouso = { x: s.a.x + (i - 1) * 10, y: s.chao - 1 }, u = limitar((ms - i * 60) / (s.p.vai - 120))
      if (u <= 0) continue
      if (u < 1) { const p = arco({ x: s.o.x, y: s.o.y - 4 }, pouso, u, 18); conta(ctx, p.x, p.y, 2, meio); disco(ctx, p.x - .5, p.y - .6, .7, verde); continue }
      const sobe = saida(limitar(s.t * 1.8 - i * .1)) * s.fino, pts: Ponto[] = []
      for (let j = 0; j <= 8; j++) { const f = (j / 8) * sobe; pts.push({ x: pouso.x + Math.sin(f * 7 + i * 2) * 4 + (s.a.x - pouso.x) * f * .6, y: pouso.y - f * 20 }) }
      conta(ctx, pouso.x, pouso.y, 1.8 * s.fino, fundo)
      if (sobe > .1) { linha(ctx, pts, 3, ESCURO); linha(ctx, pts, 1.4, verde) }
    }
    if (s.pega !== null && s.pega > .35) { const v = (s.pega - .35) / .65, p = arco({ x: s.a.x, y: s.a.y }, { x: s.o.x, y: s.o.y }, v, 12); conta(ctx, p.x, p.y, 2.4 * Math.sin(v * Math.PI) + .5, verde) }
  },

  /** "A sleeping target sees a nightmare that inflicts some damage every turn." */
  nightmare(s) {
    const { ctx, ms } = s.c, [fundo, meio, vermelho] = COR.pesadelo
    // Uma NUVEM escura cresce sobre a cabeça do alvo e abre dois olhos
    // vermelhos e uma boca de dentes; ela treme e solta um raio torto.
    const k = saida(limitar(s.c.ms / (s.p.vai + 100))) * s.fino, c = { x: s.cabeca.x, y: s.cabeca.y - 13 + Math.sin(ms * .05) * (s.pega !== null ? .8 : 0) }
    if (k < .12) return
    for (const [g, cor] of [[1.3, ESCURO], [0, fundo]] as const) for (const [dx, dy, r] of [[-7, 1, 4.6], [-2, -2.4, 5.6], [4, -1.6, 5.2], [8.5, 1.4, 3.8]] as const) disco(ctx, c.x + dx * k, c.y + dy * k, (r + g) * k, cor)
    disco(ctx, c.x - 2 * k, c.y - 3.4 * k, 3 * k, meio)
    if (s.voando) return
    for (const lado of [-1, 1]) poligono(ctx, [[c.x + lado * 1 * k, c.y - 1 * k], [c.x + lado * 5.4 * k, c.y - 3.4 * k], [c.x + lado * 5 * k, c.y + .4 * k]], vermelho)
    const boca: Ponto[] = []
    for (let i = 0; i <= 6; i++) boca.push({ x: c.x - 6 * k + i * 2 * k, y: c.y + (3 + (i % 2 ? 2.2 : 0)) * k })
    linha(ctx, boca, 1.2 * k, BRANCO)
    const v = (s.t * 3) % 1
    if (v < .5) { const raio = [{ x: c.x, y: c.y + 6 * k }, { x: c.x - 3, y: c.y + 11 }, { x: c.x + 2, y: c.y + 14 }, { x: c.x - 1, y: c.y + 20 }]; linha(ctx, raio, 2.8 * (1 - v * 2), ESCURO); linha(ctx, raio, 1.2 * (1 - v * 2), vermelho) }
  },

  /** "A move that works differently for the Ghost type than for all other types." */
  curse(s) {
    const { ctx } = s.c, [, meio, luz] = COR.prego
    // Um PREGO grande aparece sobre o alvo e é cravado em três marteladas: a
    // cada uma ele afunda um tanto e solta um estalo roxo.
    const k = recuo(limitar(s.vai * 1.4)) * s.fino, batidas = Math.min(3, Math.floor(s.t * 3.4)), dentro = (s.t * 3.4) % 1
    const y = s.cabeca.y - 16 + batidas * 4 + (s.pega !== null && batidas < 3 && dentro > .75 ? (dentro - .75) * 16 : 0), x = s.cabeca.x
    if (k < .15) return
    fio(ctx, { x, y: y + 1 * k }, { x, y: y + 13 * k }, 4 * k, ESCURO); fio(ctx, { x, y: y + 1 * k }, { x, y: y + 12 * k }, 1.8 * k, meio)
    poligono(ctx, [[x - 5.4 * k, y - 2.4 * k], [x + 5.4 * k, y - 2.4 * k], [x + 5.4 * k, y + 1.6 * k], [x - 5.4 * k, y + 1.6 * k]], ESCURO)
    poligono(ctx, [[x - 4.2 * k, y - 1.3 * k], [x + 4.2 * k, y - 1.3 * k], [x + 4.2 * k, y + .5 * k], [x - 4.2 * k, y + .5 * k]], luz)
    if (s.pega !== null && batidas > 0 && dentro < .3) { const e = dentro / .3; for (let i = 0; i < 5; i++) { const a = -Math.PI + (i / 4) * Math.PI; fio(ctx, { x: x + Math.cos(a) * (6 + e * 4), y: y - 2 + Math.sin(a) * (4 + e * 4) }, { x: x + Math.cos(a) * (10 + e * 5), y: y - 2 + Math.sin(a) * (7 + e * 5) }, 1.5 * (1 - e), COR.pesadelo[1]) } }
  },

  /** "This move prevents the target from using its held item for five turns." */
  embargo(s) {
    const { ctx } = s.c, [fundo, meio, vermelho] = COR.caixa
    // Uma CAIXA de item aparece ao lado do alvo e um sinal de PROIBIDO (aro e
    // barra) carimba em cima dela.
    const c = { x: s.a.x + s.dir * 13, y: s.meio.y - 3 }, k = recuo(limitar(s.vai * 1.4)) * s.fino
    if (k < .15) return
    poligono(ctx, [[c.x - 6.4 * k, c.y - 5.4 * k], [c.x + 6.4 * k, c.y - 5.4 * k], [c.x + 6.4 * k, c.y + 6.4 * k], [c.x - 6.4 * k, c.y + 6.4 * k]], ESCURO)
    poligono(ctx, [[c.x - 5.2 * k, c.y - 4.2 * k], [c.x + 5.2 * k, c.y - 4.2 * k], [c.x + 5.2 * k, c.y + 5.2 * k], [c.x - 5.2 * k, c.y + 5.2 * k]], meio)
    fio(ctx, { x: c.x - 5.2 * k, y: c.y - .6 * k }, { x: c.x + 5.2 * k, y: c.y - .6 * k }, 1.2 * k, fundo); fio(ctx, { x: c.x, y: c.y - 4.2 * k }, { x: c.x, y: c.y + 5.2 * k }, 1.2 * k, fundo)
    if (s.voando) return
    const bate = recuo(limitar(s.t / .3)), R = (13 - 4.5 * bate) * k
    anel(ctx, c.x, c.y, R, R, 2 * k, vermelho)
    fio(ctx, { x: c.x - R * .7, y: c.y - R * .7 }, { x: c.x + R * .7, y: c.y + R * .7 }, 4 * k, ESCURO); fio(ctx, { x: c.x - R * .7, y: c.y - R * .7 }, { x: c.x + R * .7, y: c.y + R * .7 }, 2 * k, vermelho)
  },

  /** "The user suppresses the target and makes its move go last." */
  quash(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.laje
    // Uma LAJE pesada desce de cima e ESPREME o alvo: para em cima da cabeça,
    // dá dois trancos pra baixo, e riscos de aperto saem pelos lados.
    const desce = entrada(s.vai), tranco = s.pega !== null ? Math.abs(Math.sin(s.pega * Math.PI * 2)) * 3 : 0
    const y = s.cabeca.y - 30 + desce * 22 + tranco, k = s.fino, x = s.a.x
    if (k < .15) return
    poligono(ctx, [[x - 15 * k, y - 5.4 * k], [x + 15 * k, y - 5.4 * k], [x + 13 * k, y + 4.4 * k], [x - 13 * k, y + 4.4 * k]], ESCURO)
    poligono(ctx, [[x - 13.6 * k, y - 4.2 * k], [x + 13.6 * k, y - 4.2 * k], [x + 12 * k, y + 3.2 * k], [x - 12 * k, y + 3.2 * k]], meio)
    fio(ctx, { x: x - 11 * k, y: y - 2.6 * k }, { x: x + 4 * k, y: y - 2.6 * k }, 1.2 * k, luz); fio(ctx, { x: x - 2, y: y + 1 }, { x: x + 3, y: y - 1 }, 1, fundo)
    if (s.pega !== null) for (const lado of [-1, 1]) for (let i = 0; i < 2; i++) fio(ctx, { x: x + lado * (13 + tranco), y: s.meio.y - 3 + i * 7 }, { x: x + lado * (17 + tranco * 1.5), y: s.meio.y - 3 + i * 7 }, 1.4, luz)
  },

  /** "The target is scared off, and a different Pokémon is dragged out." */
  roar(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.berro
    // BERRO: três estouros pontudos saem da boca crescendo em fila até o alvo;
    // ele é empurrado — riscos de arrasto atrás dele.
    const boca = { x: s.o.x + s.dir * 6, y: s.o.y - 5 }
    if (s.some <= 0 && (s.pega === null || s.pega < .5)) for (let i = 0; i < 3; i++) {
      const fase = ms / (s.p.vai * .9) - i * .28
      if (fase < 0) continue
      const u = fase % 1, x = boca.x + (s.a.x - boca.x) * u, y = boca.y + (s.a.y - 3 - boca.y) * u, R = 3 + u * 7, vida = Math.sin(u * Math.PI)
      const estrela: [number, number][] = []
      for (let j = 0; j < 10; j++) { const a = j * Math.PI / 5 + i, r = (j % 2 ? R * .5 : R) * vida; estrela.push([x + Math.cos(a) * r, y + Math.sin(a) * r]) }
      if (vida < .2) continue
      linha(ctx, [...estrela, estrela[0]].map(([px, py]) => ({ x: px, y: py })), 2.8, fundo); linha(ctx, [...estrela, estrela[0]].map(([px, py]) => ({ x: px, y: py })), 1.2, i % 2 ? luz : meio)
    }
    if (s.pega !== null) for (let i = 0; i < 3; i++) { const e = s.pega, y = s.meio.y - 6 + i * 6; fio(ctx, { x: s.a.x - s.dir * (10 + e * 6), y }, { x: s.a.x - s.dir * (18 + e * 12 + i * 2), y }, 1.5 * (1 - e), luz) }
  },

  /** "The user lets loose a huge yawn that lulls the target into falling asleep on the next turn." */
  yawn(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.bocejo
    // Um BOCEJO: uma bolha grande e mole sai da boca e vai devagarinho,
    // gingando, até o rosto do alvo; estoura num "z" pequeno e as pálpebras pesam.
    if (s.voando) {
      const u = s.vai, x = s.o.x + s.dir * 6 + (s.cabeca.x - s.o.x - s.dir * 6) * u, y = s.o.y - 6 + (s.cabeca.y + 1 - s.o.y + 6) * u + Math.sin(u * Math.PI * 3) * 3
      const R = 3 + Math.sin(Math.min(1, u * 1.6) * Math.PI / 2) * 5, mole = Math.sin(ms * .02) * .8
      anel(ctx, x, y, R + mole, R - mole, 1.6, meio); disco(ctx, x - R * .4, y - R * .4, 1.3, luz)
      return
    }
    if (s.t < .25) for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, e = s.t / .25; fio(ctx, { x: s.cabeca.x + Math.cos(a) * (7 + e * 4), y: s.cabeca.y + 1 + Math.sin(a) * (7 + e * 4) }, { x: s.cabeca.x + Math.cos(a) * (10 + e * 5), y: s.cabeca.y + 1 + Math.sin(a) * (10 + e * 5) }, 1.4 * (1 - e), meio) }
    const u = limitar((s.t - .15) / .85), k = 2.6 * Math.sin(u * Math.PI) * s.fino, x = s.cabeca.x + 7 + u * 3, y = s.cabeca.y - 5 - u * 8
    if (k > .6) traco(ctx, [{ x: x - k, y: y - k }, { x: x + k, y: y - k }, { x: x - k, y: y + k }, { x: x + k, y: y + k }], 1.2, luz)
    // Pálpebras: dois arcos descendo.
    for (const lado of [-1, 1]) fio(ctx, { x: s.cabeca.x + lado * 2, y: s.cabeca.y + 1 + u * 1.5 }, { x: s.cabeca.x + lado * 5.5, y: s.cabeca.y + 1 + u * 1.5 }, 1.5 * s.fino, fundo)
  },

  /** "The user shoots a torrent of water at the target and changes the target's type to Water." */
  soak(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.agua
    // Uma BOLOTA d'água vai em arco e ESTOURA em cima do alvo; a água escorre
    // por ele em fios e empoça nos pés. Ficou de outro tipo.
    const alto = { x: s.a.x, y: s.cabeca.y - 3 }
    if (s.voando) { const p = arco({ x: s.o.x + s.dir * 5, y: s.o.y - 5 }, alto, s.vai, 20); conta(ctx, p.x, p.y, 4.4, meio); disco(ctx, p.x - 1.3, p.y - 1.4, 1.4, luz); return }
    if (s.t < .3) for (let i = 0; i < 7; i++) { const a = -Math.PI + (i / 6) * Math.PI, e = s.t / .3, r = 4 + saida(e) * 11; conta(ctx, alto.x + Math.cos(a) * r, alto.y + Math.sin(a) * r * .8 + e * e * 6, 2 * (1 - e), i % 2 ? luz : meio) }
    for (let i = 0; i < 5; i++) {
      const x = s.a.x - 8 + i * 4, v = (s.t * 1.6 + i * .21) % 1, y0 = alto.y + 3, y = y0 + v * (s.chao - y0)
      fio(ctx, { x, y: Math.max(y0, y - 5) }, { x, y }, 2.6 * s.fino, fundo); fio(ctx, { x, y: Math.max(y0, y - 4) }, { x, y }, 1.1 * s.fino, i % 2 ? luz : meio)
    }
    const poca = saida(limitar(s.t * 1.5)) * 13 * s.fino
    if (poca > 1) { fio(ctx, { x: s.a.x - poca, y: s.chao + 1 }, { x: s.a.x + poca, y: s.chao + 1 }, 3.2, fundo); fio(ctx, { x: s.a.x - poca * .7, y: s.chao + .5 + Math.sin(ms * .01) * .3 }, { x: s.a.x + poca * .4, y: s.chao + .5 }, 1.1, luz) }
  },

  /** "The user takes sure aim at the target. This ensures the next attack does not miss the target." */
  lock_on(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.mira
    // Uma MIRA redonda com quatro traços chega grande, girando, e fecha em
    // cima do alvo; trava com um estalo e fica piscando.
    const R = (26 - 16 * saida(s.vai)) * s.fino, giro = s.voando ? ms * .012 : 0, c = { x: s.a.x, y: s.meio.y - 2 }
    if (R < 2) return
    const travou = !s.voando && Math.floor(ms / 90) % 2 === 0
    anel(ctx, c.x, c.y, R, R, 1.5, travou ? luz : meio)
    for (let i = 0; i < 4; i++) { const a = giro + i * Math.PI / 2; fio(ctx, { x: c.x + Math.cos(a) * (R - 3.5), y: c.y + Math.sin(a) * (R - 3.5) }, { x: c.x + Math.cos(a) * (R + 4), y: c.y + Math.sin(a) * (R + 4) }, 3, ESCURO); fio(ctx, { x: c.x + Math.cos(a) * (R - 3), y: c.y + Math.sin(a) * (R - 3) }, { x: c.x + Math.cos(a) * (R + 3.4), y: c.y + Math.sin(a) * (R + 3.4) }, 1.3, travou ? luz : meio) }
    conta(ctx, c.x, c.y, 1.3 * s.fino, fundo)
    if (s.pega !== null && s.pega < .2) brilho(ctx, c.x, c.y, 7 * (1 - s.pega / .2) + 1, luz)
  },

  /** "The user senses the target's movements with its mind to ensure its next attack does not miss the target." */
  mind_reader(s) {
    const { ctx, ms } = s.c, [fundo, meio, branco] = COR.olho
    // Um OLHO se abre acima de quem usa; um fio pontilhado liga ele à cabeça
    // do alvo e bolinhas de pensamento são PUXADAS do alvo pro olho.
    const olho = { x: s.o.x, y: s.o.y - 22 }, abre = saida(limitar(s.vai * 1.5)) * s.fino
    if (abre > .12) {
      const am = (g: number): [number, number][] => [[olho.x - (8 + g) * abre, olho.y], [olho.x, olho.y - (4.6 + g) * abre], [olho.x + (8 + g) * abre, olho.y], [olho.x, olho.y + (4.6 + g) * abre]]
      poligono(ctx, am(1.3), ESCURO); poligono(ctx, am(0), branco); conta(ctx, olho.x + s.dir * 1.5 * abre, olho.y, 2.8 * abre, meio); disco(ctx, olho.x + s.dir * 1.5 * abre, olho.y, 1.2 * abre, fundo)
    }
    const ate = saida(limitar((s.vai - .4) / .6))
    for (let i = 1; i < 9; i++) { const f = i / 9; if (f > ate || s.some > 0) break; if ((i + Math.floor(ms / 100)) % 2) conta(ctx, olho.x + (s.cabeca.x - olho.x) * f, olho.y + (s.cabeca.y - olho.y) * f, .9, meio) }
    if (s.pega !== null) for (let i = 0; i < 3; i++) {
      const v = (s.pega * 2 + i / 3) % 1
      conta(ctx, s.cabeca.x + (olho.x - s.cabeca.x) * v, s.cabeca.y - 3 + (olho.y - s.cabeca.y + 3) * v - Math.sin(v * Math.PI) * 6, 2.2 * (1 - v) + .5, branco)
    }
  },

  /** "Using its psychic power of suggestion, the user transfers its status conditions to the target." */
  psycho_shift(s) {
    const { ctx, ms } = s.c, [fundo, meio, amarelo] = COR.mal
    // O MAL de quem usa (um nó roxo e amarelo, torcido) é ARRANCADO do corpo,
    // sobe, e é arremessado pro alvo com um anel de força em volta.
    const sai = saida(limitar(s.vai / .35)), u = entrada(limitar((s.vai - .35) / .65))
    const de = { x: s.o.x, y: s.o.y + 2 - sai * 16 }, ate = { x: s.a.x, y: s.meio.y - 3 }
    const p = s.voando ? { x: de.x + (ate.x - de.x) * u, y: de.y + (ate.y - de.y) * u - Math.sin(u * Math.PI) * 8 } : ate
    const k = (s.voando ? .6 + sai * .5 : 1.1 * (1 - saida(limitar(s.t / .5)))) * s.fino
    if (k > .15) {
      for (let i = 0; i < 2; i++) { const a = ms * .02 + i * Math.PI; conta(ctx, p.x + Math.cos(a) * 2.6 * k, p.y + Math.sin(a) * 2.6 * k, 3 * k, i ? amarelo : meio) }
      anel(ctx, p.x, p.y, 7.5 * k, 5 * k, 1.2, fundo)
    }
    if (s.voando && sai < 1) fio(ctx, { x: s.o.x, y: s.o.y + 2 }, de, 1.3 * (1 - sai), meio)
    if (s.pega !== null && s.pega < .5) { const e = s.pega / .5; anel(ctx, ate.x, ate.y, 4 + e * 12, 3 + e * 9, 1.6 * (1 - e), amarelo) }
  },

  /** "The user employs its psychic power to switch changes to its Defense and Sp. Def stats with the target." */
  guard_swap(s) { troca(s, COR.escudo, false) },

  /** "The user employs its psychic power to switch changes to its Attack and Sp. Atk stats with the target." */
  power_swap(s) { troca(s, COR.espada, true) },
}

/** Dois ícones sobem de cada um, CRUZAM em arcos opostos e descem no outro. */
function troca(s: Cena, cores: readonly string[], espada: boolean): void {
  const { ctx } = s.c, u = saida(s.vai), A = { x: s.o.x, y: s.o.y - 14 }, B = { x: s.a.x, y: s.a.y - 14 }
  const k = (s.voando ? Math.min(1, s.vai * 4) : 1 + Math.sin(limitar(s.t / .3) * Math.PI) * .25) * s.fino
  for (const [de, ate, sentido] of [[A, B, 1], [B, A, -1]] as const) {
    const x = de.x + (ate.x - de.x) * u, y = de.y + (ate.y - de.y) * u - Math.sin(u * Math.PI) * 11 * sentido
    icone(ctx, x, y, k, sentido > 0 ? cores : [cores[0], cores[2], cores[1]], espada)
    if (s.voando && u > .1) fio(ctx, { x: x - (ate.x - de.x) * .12, y: y + Math.cos(u * Math.PI) * 4 * sentido }, { x: x - (ate.x - de.x) * .05, y: y + Math.cos(u * Math.PI) * 2 * sentido }, 1.3, cores[1])
  }
  if (s.pega !== null && s.pega < .3) for (const q of [A, B]) brilho(ctx, q.x, q.y, 6 * (1 - s.pega / .3) + 1, cores[2])
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...Object.values(COR).flat())

export const PRAGAS_POR_GOLPE = montarFamilia(PERFIS_DE_PRAGA, {
  desenhar: (p, c, id) => GOLPES[id](cena(p, c)),
  duracao: p => p.vai + p.pega + p.some,
  // "Contato" é o instante em que a praga CHEGA no alvo.
  contato: p => p.vai,
  alcance: 48, margem: () => ({ cima: 60, baixo: 36, lados: 52 }), pele: peleDe,
})
