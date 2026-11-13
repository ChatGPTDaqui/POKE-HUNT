// Preparos (13/11): quinze golpes de status de SUPORTE que o motor resolve por
// id e que, até aqui, não criavam efeito nenhum na tela. Décima sexta família
// de golpes de status com efeito próprio.
//
// Cada um parte da descrição do jogo, e a forma é do golpe, não da família:
//   Substitute um boneco estoura numa fumacinha na frente · Focus Energy
//   riscos convergem na testa e divisas sobem · Laser Focus uma mira fecha num
//   ponto vermelho · Magnet Rise um ímã sob os pés e traços subindo · Ingrain
//   raízes descem dos pés e pulsam · Aqua Ring um anel de água em órbita ·
//   Belly Drum baquetas alternadas e ondas na barriga · Acupressure três
//   agulhas tocam pontos do corpo · Destiny Bond uma corrente roxa dá a volta
//   e fecha · Psych Up setas entram na cabeça · Aromatherapy folhas sobem em
//   espiral · Heal Bell um sino balança · Trick Room um cubo de arame que
//   vira · Haze uma faixa de névoa varre o chão · Perish Song três notas
//   escuras e a contagem.
//
// TUDO acontece em quem USA o golpe. `origem` é o ALTO do corpo: meio em
// `o.y + 3`, pés em `o.y + 12`, cabeça em `o.y - 9`. Sem alfa.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, limitar, recuo, saida } from '../primitivas'
import { BRANCO, ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import { anel, conta, disco, fio, linha, traco } from './tracos'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `sobe`: o golpe se arma · `fica`: no auge · `some`: assenta. */
interface Perfil { sobe: number; fica: number; some: number }

const P = (sobe: number, fica: number, some: number): Perfil => ({ sobe, fica, some })
export const PERFIS_DE_PREPARO: Record<string, Perfil> = {
  substitute: P(280, 480, 240), focus_energy: P(300, 480, 220), laser_focus: P(340, 440, 220),
  magnet_rise: P(280, 560, 240), ingrain: P(380, 500, 260), aqua_ring: P(300, 600, 260),
  belly_drum: P(200, 640, 220), acupressure: P(240, 600, 220), destiny_bond: P(420, 460, 260),
  psych_up: P(300, 520, 240), aromatherapy: P(340, 560, 260), heal_bell: P(240, 620, 240),
  trick_room: P(360, 520, 260), haze: P(380, 520, 280), perish_song: P(300, 620, 260),
}

const COR = {
  boneco: ['#3f8f6a', '#8fe0b0', '#eafff0'],
  foco: ['#c9952a', '#ffe36a', '#fffbe0'],
  mira: ['#8a1616', '#f04a3a', '#ffd0c0'],
  ima: ['#d03a3a', '#3a6ad0', '#c8d0e0'],
  raiz: ['#5a3f1e', '#a87a3a', '#6fe08a'],
  agua: ['#2f5fa8', '#6fb0ff', '#dff0ff'],
  tambor: ['#a04a2a', '#f09a6a', '#ffe8d8'],
  agulha: ['#6a7286', '#c8d0e0', '#ffffff'],
  elo: ['#2a1a3a', '#6a4a9a', '#c8b0f0'],
  mente: ['#a03a8a', '#f08ad8', '#ffe0f8'],
  folha: ['#2f7a3a', '#6fcf5a', '#d8ffb0'],
  sino: ['#8a6a1e', '#f0c040', '#fff4b0'],
  sala: ['#6a2fa0', '#d86adf', '#ffd0ff'],
  nevoa: ['#5a6272', '#b8c2d2', '#f2f6fc'],
} as const

interface Cena {
  c: ContextoVfx; p: Perfil
  o: Ponto; meio: Ponto; chao: number; cabeca: Ponto
  sobe: number; fica: number | null; some: number
  /** 0..1 da fase `fica`, valendo 0 antes e 1 depois. */
  t: number; fino: number
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  const fica = janela(c.ms, p.sobe, p.fica), some = limitar((c.ms - p.sobe - p.fica) / p.some)
  return {
    c, p, o: c.origem, meio: { x: c.origem.x, y: c.origem.y + 3 }, chao: c.origem.y + 12, cabeca: { x: c.origem.x, y: c.origem.y - 9 },
    sobe: limitar(c.ms / p.sobe), fica, some, t: fica ?? (some > 0 ? 1 : 0), fino: 1 - entrada(some),
  }
}
/** Seta apontando pra `ang`. */
function seta(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, k: number, cor: string): void {
  if (k <= .15) return
  const pt = (a: number, r: number): [number, number] => [x + Math.cos(ang + a) * r * k, y + Math.sin(ang + a) * r * k]
  poligono(ctx, [pt(0, 5.2), pt(2.2, 4.6), pt(-2.2, 4.6)], ESCURO); poligono(ctx, [pt(0, 3.6), pt(2.2, 3), pt(-2.2, 3)], cor)
}
function nota(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, cor: string): void {
  if (k <= .15) return
  const topo = { x: x + 1.8 * k, y: y - 7 * k }
  fio(ctx, { x: x + 1.8 * k, y }, topo, 1.2 * k + 1.6, ESCURO); fio(ctx, topo, { x: x + 4.6 * k, y: y - 4.8 * k }, 1.2 * k + 1.6, ESCURO)
  conta(ctx, x, y, 2.1 * k, cor); fio(ctx, { x: x + 1.8 * k, y }, topo, 1.2 * k, cor); fio(ctx, topo, { x: x + 4.6 * k, y: y - 4.8 * k }, 1.2 * k, cor)
}

const GOLPES: Record<string, (s: Cena) => void> = {
  /** "The user creates a substitute for itself using some of its HP. The substitute serves as the user's decoy." */
  substitute(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.boneco
    // Fumacinha e, de dentro dela, um BONECO (cabeça redonda, duas orelhas,
    // corpo de saco) pula pra frente de quem usa e assenta com um quique.
    const c = { x: s.meio.x + 15, y: s.meio.y + 1 }, k = recuo(limitar(s.sobe * 1.4)) * s.fino
    if (s.sobe < 1) for (let i = 0; i < 5; i++) { const a = i * 1.26, r = 3 + s.sobe * 8; conta(ctx, c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * .7, 2.6 * (1 - s.sobe), BRANCO) }
    if (k < .15) return
    for (const lado of [-1, 1]) { poligono(ctx, [[c.x + lado * 1.5 * k, c.y - 8 * k], [c.x + lado * 4.4 * k, c.y - 12.5 * k], [c.x + lado * 5.6 * k, c.y - 6.5 * k]], ESCURO); poligono(ctx, [[c.x + lado * 2.4 * k, c.y - 8 * k], [c.x + lado * 4.2 * k, c.y - 10.8 * k], [c.x + lado * 4.8 * k, c.y - 7 * k]], meio) }
    poligono(ctx, [[c.x - 5.4 * k, c.y - 1 * k], [c.x + 5.4 * k, c.y - 1 * k], [c.x + 6.6 * k, c.y + 9 * k], [c.x - 6.6 * k, c.y + 9 * k]], ESCURO)
    poligono(ctx, [[c.x - 4.2 * k, c.y], [c.x + 4.2 * k, c.y], [c.x + 5.2 * k, c.y + 7.8 * k], [c.x - 5.2 * k, c.y + 7.8 * k]], fundo)
    conta(ctx, c.x, c.y - 4.5 * k, 4.6 * k, meio); disco(ctx, c.x - 1.4 * k, c.y - 5.8 * k, 1.3 * k, luz)
    for (const lado of [-1, 1]) disco(ctx, c.x + lado * 1.7 * k, c.y - 4.2 * k, .8 * k, ESCURO)
  },

  /** "The user takes a deep breath and focuses so that critical hits land more easily." */
  focus_energy(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.foco
    // Oito riscos CONVERGEM num ponto na testa; dali, divisas sobem dos dois
    // lados do corpo em pulsos — fôlego preso, pronto.
    const testa = { x: s.cabeca.x, y: s.cabeca.y - 2 }
    if (s.fica === null && s.some <= 0) for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + .2, r1 = 22 - saida(s.sobe) * 17, r0 = r1 + 6
      fio(ctx, { x: testa.x + Math.cos(a) * r0, y: testa.y + Math.sin(a) * r0 }, { x: testa.x + Math.cos(a) * r1, y: testa.y + Math.sin(a) * r1 }, 1.4, i % 2 ? luz : meio)
    }
    else {
      if (s.t < .2) brilho(ctx, testa.x, testa.y, 7 * (1 - s.t / .2) + 1, luz)
      for (const lado of [-1, 1]) for (let i = 0; i < 3; i++) {
        const v = (ms / 360 + i / 3) % 1, x = s.meio.x + lado * 13, y = s.chao - 2 - v * 22, vida = Math.sin(v * Math.PI) * s.fino
        const pts = [{ x: x - 3.4, y: y + 2.6 }, { x, y: y - 1.4 }, { x: x + 3.4, y: y + 2.6 }]
        linha(ctx, pts, 3 * vida, fundo); linha(ctx, pts, 1.3 * vida, i % 2 ? luz : meio)
      }
    }
  },

  /** "The user concentrates intensely. The attack on the next turn always results in a critical hit." */
  laser_focus(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.mira
    // MIRA: quatro cantoneiras fecham de longe até caberem num ponto na
    // testa; o ponto vermelho acende e solta um fio reto pra frente.
    const alvo = { x: s.cabeca.x + 3, y: s.cabeca.y - 1 }, abre = (18 * (1 - saida(s.sobe)) + 4) * s.fino
    if (abre > 1.5) for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const x = alvo.x + sx * abre, y = alvo.y + sy * abre
      traco(ctx, [{ x: x - sx * 3.6, y }, { x, y }, { x, y: y - sy * 3.6 }], 1.3, meio)
    }
    if (s.fica === null && s.some <= 0) return
    conta(ctx, alvo.x, alvo.y, 2.2 * s.fino, meio); disco(ctx, alvo.x, alvo.y, 1 * s.fino, luz)
    const L = saida(limitar(s.t / .35)) * 26 * s.fino
    if (L > 2) { fio(ctx, alvo, { x: alvo.x + L, y: alvo.y }, 2.6, fundo); fio(ctx, alvo, { x: alvo.x + L, y: alvo.y }, 1, luz) }
    if (s.t < .2) brilho(ctx, alvo.x, alvo.y, 6 * (1 - s.t / .2) + 1, luz)
  },

  /** "The user levitates using electrically generated magnetism for five turns." */
  magnet_rise(s) {
    const { ctx, ms } = s.c, [norte, sul, aco] = COR.ima
    // Um ÍMÃ em ferradura aparece sob os pés, de boca pra cima; dele sobem
    // traços curtos em fila (a força) e a sombra no chão encolhe — levitou.
    const k = recuo(limitar(s.sobe * 1.3)) * s.fino, y = s.chao + 2
    if (k > .15) {
      const arco: Ponto[] = []
      for (let j = 0; j <= 10; j++) { const a = (j / 10) * Math.PI; arco.push({ x: s.o.x - Math.cos(a) * 8 * k, y: y + Math.sin(a) * 5 * k }) }
      traco(ctx, arco, 3 * k, aco)
      for (const [lado, cor] of [[-1, norte], [1, sul]] as const) { fio(ctx, { x: s.o.x + lado * 8 * k, y }, { x: s.o.x + lado * 8 * k, y: y - 4 * k }, 5 * k, ESCURO); fio(ctx, { x: s.o.x + lado * 8 * k, y }, { x: s.o.x + lado * 8 * k, y: y - 4 * k }, 3 * k, cor) }
    }
    if (s.fica === null && s.some <= 0) return
    for (const lado of [-1, 0, 1]) for (let i = 0; i < 2; i++) {
      const v = (ms / 420 + i * .5 + (lado + 1) * .17) % 1, x = s.o.x + lado * 9, yy = s.chao - 4 - v * 20, vida = Math.sin(v * Math.PI) * s.fino
      fio(ctx, { x, y: yy + 3 }, { x, y: yy }, 2.6 * vida, ESCURO); fio(ctx, { x, y: yy + 3 }, { x, y: yy }, 1.1 * vida, lado ? aco : BRANCO)
    }
  },

  /** "The user lays roots that restore its HP on every turn. Because it's rooted, it can't switch out." */
  ingrain(s) {
    const { ctx, ms } = s.c, [fundo, meio, verde] = COR.raiz
    // RAÍZES saem dos pés e descem abrindo, em zigue-zague, cinco delas; por
    // cada uma sobe um pulso verde — a seiva voltando.
    const cresce = saida(s.sobe) * s.fino
    for (let i = 0; i < 5; i++) {
      const dir = (i - 2) * .42, pts: Ponto[] = []
      for (let j = 0; j <= 5; j++) { const f = (j / 5) * cresce; pts.push({ x: s.o.x + Math.sin(dir) * f * 20 + (j % 2 ? 1.6 : -1.6) * f, y: s.chao - 1 + Math.cos(dir) * f * 9 }) }
      if (cresce < .1) continue
      linha(ctx, pts, 3.2 - i % 2 * .6, ESCURO); linha(ctx, pts, 1.5 - i % 2 * .3, i % 2 ? meio : fundo)
      if (s.fica !== null) { const v = 1 - ((ms / 520 + i * .2) % 1), q = pts[Math.min(5, Math.floor(v * 5))]; conta(ctx, q.x, q.y, 1.5 * Math.sin(v * Math.PI) + .3, verde) }
    }
  },

  /** "The user envelops itself in a veil made of water. It regains some HP every turn." */
  aqua_ring(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.agua
    // Um ANEL de água inclinado gira em volta do corpo: a metade de trás fina,
    // a da frente grossa; três gotas correm por ele.
    const k = saida(s.sobe) * s.fino, rx = 16 * k, ry = 6 * k, giro = ms * .006
    if (rx < 2) return
    const pt = (a: number): Ponto => ({ x: s.meio.x + Math.cos(a) * rx, y: s.meio.y + Math.sin(a) * ry + Math.cos(a) * 3 * k })
    const tras: Ponto[] = [], frente: Ponto[] = []
    for (let j = 0; j <= 12; j++) { tras.push(pt(Math.PI + (j / 12) * Math.PI)); frente.push(pt((j / 12) * Math.PI)) }
    linha(ctx, tras, 1.4, fundo)
    linha(ctx, frente, 3.8, ESCURO); linha(ctx, frente, 2.2, meio); linha(ctx, frente.slice(3, 8), 1, luz)
    for (let i = 0; i < 3; i++) { const a = giro + i * (Math.PI * 2 / 3), q = pt(a); if (Math.sin(a) > -.2) { conta(ctx, q.x, q.y, 1.8 * k, luz) } }
  },

  /** "The user maximizes its Attack stat in exchange for HP equal to half its max HP." */
  belly_drum(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.tambor
    // BATUCAR: duas baquetas batem na barriga ALTERNADAS, em compasso; cada
    // batida solta uma onda e riscos.
    const forca = Math.min(1, s.sobe * 2) * s.fino, barriga = { x: s.meio.x, y: s.meio.y + 2 }
    for (const lado of [-1, 1]) {
      const v = (ms / 240 + (lado > 0 ? 0 : .5)) % 1, bate = v < .35 ? 1 - v / .35 : 0
      const ponta = { x: barriga.x + lado * (7 + (1 - bate) * 7), y: barriga.y - (1 - bate) * 8 }, cabo = { x: ponta.x + lado * 9, y: ponta.y - 7 }
      fio(ctx, cabo, ponta, 3 * forca, ESCURO); fio(ctx, cabo, ponta, 1.4 * forca, fundo); conta(ctx, ponta.x, ponta.y, 2 * forca, luz)
      if (v < .5 && s.fica !== null) anel(ctx, barriga.x + lado * 3, barriga.y, 3 + v * 14, 2.4 + v * 11, 1.4 * (1 - v * 2), meio)
    }
  },

  /** "The user applies pressure to stress points, sharply boosting one of its or its allies' stats." */
  acupressure(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.agulha
    // Três AGULHAS finas descem, uma de cada vez, e tocam pontos diferentes do
    // corpo; no toque, um brilho. A última fica vibrando.
    const pontos: Ponto[] = [{ x: s.meio.x - 6, y: s.meio.y - 6 }, { x: s.meio.x + 7, y: s.meio.y }, { x: s.meio.x - 2, y: s.meio.y + 6 }]
    pontos.forEach((q, i) => {
      const e = limitar((s.c.ms - i * 190) / 220)
      if (e <= 0) return
      const y = q.y - 16 * (1 - entrada(e)), treme = e >= 1 && i === 2 ? Math.sin(s.c.ms * .08) * .6 : 0, k = s.fino
      fio(ctx, { x: q.x + 3 + treme, y: y - 11 * k }, { x: q.x, y }, 2.4 * k, ESCURO); fio(ctx, { x: q.x + 3 + treme, y: y - 11 * k }, { x: q.x, y }, .9 * k, meio)
      conta(ctx, q.x + 3 + treme, y - 11 * k, 1.4 * k, fundo)
      const toque = (s.c.ms - i * 190 - 220) / 260
      if (toque > 0 && toque < 1) brilho(ctx, q.x, q.y, 4.5 * (1 - toque) + .5, luz)
    })
  },

  /** "After using this move, if the user faints, the Pokémon that landed the knockout hit also faints." */
  destiny_bond(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.elo
    // Uma CORRENTE roxa sai do peito, dá a volta por trás do corpo e fecha na
    // frente num elo aberto que estala; uma chama escura paira em cima.
    const ate = saida(s.sobe), elos = 12
    for (let i = 0; i < elos; i++) {
      const f = i / elos
      if (f > ate) break
      const a = -Math.PI / 2 + f * Math.PI * 2, x = s.meio.x + Math.cos(a) * 15 * s.fino, y = s.meio.y + Math.sin(a) * 9 * s.fino
      if (Math.sin(a) < -.3) { conta(ctx, x, y, 1.3 * s.fino, fundo); continue }
      anel(ctx, x, y, (i % 2 ? 2.6 : 1.6) * s.fino, (i % 2 ? 1.6 : 2.6) * s.fino, 1.1, i % 2 ? meio : luz)
    }
    if (s.fica !== null && s.fica < .25) brilho(ctx, s.meio.x, s.meio.y - 9, 6 * (1 - s.fica / .25) + 1, luz)
    if (s.fica !== null || s.some > 0) {
      const x = s.cabeca.x, y = s.cabeca.y - 9, k = s.fino, lambe = Math.sin(ms * .03) * 1.2
      const forma = (g: number): [number, number][] => [[x + lambe, y - (6 + g) * k], [x + (3.2 + g) * k, y], [x + (2 + g) * k, y + (3 + g) * k], [x - (2 + g) * k, y + (3 + g) * k], [x - (3.2 + g) * k, y]]
      if (k > .15) { poligono(ctx, forma(1.2), ESCURO); poligono(ctx, forma(0), meio); for (const lado of [-1, 1]) disco(ctx, x + lado * 1.2 * k, y + .6 * k, .7 * k, luz) }
    }
  },

  /** "The user hypnotizes itself into copying any stat change made by the target." */
  psych_up(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.mente
    // COPIAR: três setas vêm da frente em arco e entram na cabeça, uma atrás
    // da outra; a cada uma, a cabeça pisca um anel.
    for (let i = 0; i < 3; i++) {
      const v = (ms / 480 + i / 3) % 1
      if (s.some > 0 && v < s.some) continue
      const de = { x: s.cabeca.x + 26, y: s.cabeca.y + 4 }, x = de.x + (s.cabeca.x - de.x) * v, y = de.y + (s.cabeca.y - de.y) * v - Math.sin(v * Math.PI) * 9
      seta(ctx, x, y, Math.PI + Math.cos(v * Math.PI) * .5, Math.sin(v * Math.PI) * 1.1 * Math.min(1, s.sobe * 2), i % 2 ? luz : meio)
      if (v > .85) anel(ctx, s.cabeca.x, s.cabeca.y, 4 + (v - .85) * 40, 4 + (v - .85) * 40, 1.3 * (1 - (v - .85) / .15), fundo)
    }
  },

  /** "The user releases a soothing scent that heals all status conditions affecting the user's party." */
  aromatherapy(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.folha
    // Quatro FOLHAS sobem em espiral em volta do corpo, deixando um fio de
    // aroma; no alto se soltam e brilham.
    for (let i = 0; i < 4; i++) {
      const v = limitar((s.c.ms - i * 80) / (s.p.sobe + s.p.fica * .8))
      if (v <= 0 || v >= 1) continue
      const a = v * Math.PI * 3 + i * 1.57, R = 14 - v * 4, x = s.meio.x + Math.cos(a) * R, y = s.chao - v * 34 + Math.sin(a) * 3, k = Math.sin(v * Math.PI) * 1.1
      const g = a + 1, pt = (ang: number, r: number): [number, number] => [x + Math.cos(g + ang) * r * k, y + Math.sin(g + ang) * r * k]
      if (k < .2) continue
      poligono(ctx, [pt(0, 5.4), pt(1.57, 2.8), pt(3.14, 5.4), pt(-1.57, 2.8)], ESCURO); poligono(ctx, [pt(0, 4), pt(1.57, 1.7), pt(3.14, 4), pt(-1.57, 1.7)], i % 2 ? meio : fundo)
      fio(ctx, { x: pt(0, 3)[0], y: pt(0, 3)[1] }, { x: pt(3.14, 3)[0], y: pt(3.14, 3)[1] }, .8, luz)
    }
    if (s.fica !== null && s.fica > .5) brilho(ctx, s.cabeca.x, s.cabeca.y - 12, (4 + Math.sin(ms * .02)) * Math.sin((s.fica - .5) / .5 * Math.PI) + .5, luz)
  },

  /** "The user makes a soothing bell chime to heal the status conditions of all the party Pokémon." */
  heal_bell(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.sino
    // Um SINO aparece em cima da cabeça e balança; a cada batida do badalo
    // saem arcos de som dos dois lados.
    const k = recuo(limitar(s.sobe * 1.4)) * s.fino, balanca = Math.sin(ms * .016) * .45 * (s.fica !== null ? 1 : .3), c = { x: s.cabeca.x, y: s.cabeca.y - 15 }
    if (k < .15) return
    const pt = (x: number, y: number): [number, number] => [c.x + (x * Math.cos(balanca) - y * Math.sin(balanca)) * k, c.y + (x * Math.sin(balanca) + y * Math.cos(balanca)) * k]
    poligono(ctx, [pt(-2.4, -1), pt(2.4, -1), pt(5.4, 7), pt(7, 9.4), pt(-7, 9.4), pt(-5.4, 7)], ESCURO)
    poligono(ctx, [pt(-1.4, 0), pt(1.4, 0), pt(4.2, 7), pt(5.4, 8.2), pt(-5.4, 8.2), pt(-4.2, 7)], meio)
    const [bx, by] = pt(0, 10.4), [lx, ly] = pt(-2, 4)
    conta(ctx, bx, by, 1.5 * k, fundo); disco(ctx, lx, ly, 1.1 * k, luz)
    if (s.fica !== null) for (const lado of [-1, 1]) {
      const v = (ms / 390 + (lado > 0 ? 0 : .5)) % 1, x = c.x + lado * (9 + v * 9), y = c.y + 6, r = 3 + v * 4, pts: Ponto[] = []
      for (let j = -3; j <= 3; j++) { const a = (j / 3) * .9; pts.push({ x: x + lado * Math.cos(a) * r, y: y + Math.sin(a) * r }) }
      linha(ctx, pts, 2.6 * (1 - v), fundo); linha(ctx, pts, 1.1 * (1 - v), luz)
    }
  },

  /** "The user creates a bizarre area in which slower Pokémon get to move first for five turns." */
  trick_room(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.sala
    // Uma SALA de arame (cubo visto de quina) fecha em volta de quem usa e
    // VIRA de cabeça pra baixo: o teto troca com o chão. Bizarro e mecânico.
    const k = saida(s.sobe) * s.fino, vira = s.fica === null ? (s.some > 0 ? 1 : 0) : saida(limitar(s.fica / .55))
    if (k < .12) return
    const L = 17 * k, A = 15 * k, prof = 6 * k, giro = vira * Math.PI
    const canto = (sx: number, sy: number, sz: number): Ponto => {
      const y = sy * Math.cos(giro), z = sz + sy * Math.sin(giro) * .6
      return { x: s.meio.x + sx * L + z * prof, y: s.meio.y + y * A - z * prof * .6 }
    }
    for (const sz of [-1, 1]) {
      const face = [canto(-1, -1, sz), canto(1, -1, sz), canto(1, 1, sz), canto(-1, 1, sz), canto(-1, -1, sz)]
      linha(ctx, face, sz > 0 ? 3 : 2.2, sz > 0 ? ESCURO : fundo); if (sz > 0) linha(ctx, face, 1.4, meio)
    }
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) fio(ctx, canto(sx, sy, -1), canto(sx, sy, 1), 1.1, sy < 0 ? luz : fundo)
    if (s.fica !== null && s.fica > .5 && s.fica < .7) brilho(ctx, s.meio.x, s.meio.y, 7 * (1 - (s.fica - .5) / .2) + 1, luz)
  },

  /** "The user creates a haze that eliminates every stat change among all the Pokémon engaged in battle." */
  haze(s) {
    const { ctx, ms } = s.c, cores = COR.nevoa
    // Uma FAIXA de névoa nasce nos pés e varre o chão pros dois lados, baixa e
    // larga, em gomos que rolam; por onde passa, apaga.
    const abre = saida(limitar(s.c.ms / (s.p.sobe + s.p.fica * .5))), n = s.c.pedir(10)
    for (let i = 0; i < n; i++) {
      const lado = i % 2 ? 1 : -1, f = ((i >> 1) + 1) / (n / 2), x = s.o.x + lado * f * 34 * abre + Math.sin(ms * .004 + i) * 2
      const y = s.chao - 2 - (i % 3) * 3.4 - Math.abs(Math.sin(ms * .003 + i)) * 2, r = (3 + (i % 3) * 1.2) * Math.min(1, s.sobe * 2 + .2) * s.fino
      conta(ctx, x, y, r, cores[i % 3 === 0 ? 2 : 1])
    }
    // Estágios apagados: um traço horizontal que risca na altura do peito.
    if (s.fica !== null && s.fica > .3 && s.fica < .9) { const e = (s.fica - .3) / .6, L = saida(e) * 16; fio(ctx, { x: s.meio.x - L, y: s.meio.y - 4 }, { x: s.meio.x + L, y: s.meio.y - 4 }, 2.6 * (1 - e), cores[0]); fio(ctx, { x: s.meio.x - L, y: s.meio.y - 4 }, { x: s.meio.x + L, y: s.meio.y - 4 }, 1.1 * (1 - e), cores[2]) }
  },

  /** "Any Pokémon that hears this song faints in three turns, unless it switches out of battle." */
  perish_song(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.elo
    // Três NOTAS escuras sobem tortas da boca; acima da cabeça, três pontos da
    // contagem acendem e o primeiro já se apaga: três turnos.
    for (let i = 0; i < 3; i++) {
      const v = (ms / 700 + i / 3) % 1
      if (s.some > 0 && v < s.some) continue
      nota(ctx, s.cabeca.x + 8 + Math.sin(v * 6 + i) * 4 + v * 6, s.cabeca.y + 2 - v * 20, Math.sin(v * Math.PI) * .95 * Math.min(1, s.sobe * 2), i % 2 ? meio : fundo)
    }
    for (let i = 0; i < 3; i++) {
      const k = recuo(limitar(s.sobe * 2 - i * .25)) * s.fino, x = s.cabeca.x - 7 + i * 7, y = s.cabeca.y - 13
      if (k < .15) continue
      const apagado = i === 2 && s.fica !== null && s.fica > .55 || i === 2 && s.some > 0
      conta(ctx, x, y, 2.4 * k, apagado ? fundo : luz); if (!apagado) disco(ctx, x - .6, y - .6, .8 * k, BRANCO)
    }
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...Object.values(COR).flat())

export const PREPAROS_POR_GOLPE = montarFamilia(PERFIS_DE_PREPARO, {
  desenhar: (p, c, id) => GOLPES[id](cena(p, c)),
  duracao: p => p.sobe + p.fica + p.some,
  contato: p => p.sobe,
  alcance: 48, margem: () => ({ cima: 56, baixo: 36, lados: 52 }), pele: peleDe,
})
