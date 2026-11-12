// Condições (12/11): os sete golpes de status alvo-único que PARALISAM,
// ENVENENAM ou QUEIMAM. Quinta família de golpes de status com efeito próprio.
//
// Cada um parte da descrição do jogo, e a forma é do golpe, não da família:
//   Thunder Wave arcos de choque fracos que viajam e deixam o alvo estalando ·
//   Stun Spore flocos amarelos jogados pra cima que caem em zigue-zague ·
//   Glare dois olhos de fenda se abrem sobre quem usa e cravam o olhar ·
//   Poison Powder nuvem roxa que RASTEJA pelo chão e sobe pelo alvo · Toxic
//   bolota de lodo que espatifa e escorre · Toxic Thread fios roxos que laçam
//   as pernas · Will-O-Wisp três chamas azuis que rodeiam e lambem o alvo.
//
// Sai de quem usa (`origem`) e chega no alvo (`alvo`) — `STATUS_QUE_VIAJA`.
// Sem alfa: some encolhendo.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, limitar, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import { anel, arco, conta, disco, fio, linha, traco } from './tracos'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `vai`: sai de quem usa e chega · `pega`: age no alvo · `some`: assenta. */
interface Perfil { vai: number; pega: number; some: number }

export const PERFIS_DE_CONDICAO: Record<string, Perfil> = {
  thunder_wave: { vai: 300, pega: 460, some: 220 },
  stun_spore: { vai: 420, pega: 460, some: 260 },
  glare: { vai: 320, pega: 460, some: 240 },
  poison_powder: { vai: 440, pega: 460, some: 260 },
  toxic: { vai: 340, pega: 500, some: 260 },
  toxic_thread: { vai: 300, pega: 480, some: 260 },
  will_o_wisp: { vai: 460, pega: 480, some: 260 },
}

const COR = {
  choque: ['#b58a00', '#ffe14a', '#fffbd0'],
  floco: ['#a8861e', '#f0d040', '#fff7b0'],
  olho: ['#7a1010', '#ffd23a', '#fff6c0'],
  veneno: ['#4a1f6e', '#9b4fd0', '#e3b5ff'],
  fatuo: ['#2a4fb0', '#6fb8ff', '#e8f6ff'],
} as const

interface Cena {
  c: ContextoVfx; p: Perfil; semente: number
  /** Peito de quem usa, peito do alvo, chão sob o alvo e pra que lado vai. */
  o: Ponto; a: Ponto; chao: number; dir: number
  /** 0..1 viajando, 0..1 agindo (null fora da fase), 0..1 assentando. */
  vai: number; pega: number | null; some: number
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  return {
    c, p, semente: Math.floor(c.rng() * 0xffffffff), o: c.origem, a: c.alvo, chao: c.alvo.y + 12,
    dir: c.alvo.x >= c.origem.x ? 1 : -1,
    vai: limitar(c.ms / p.vai), pega: janela(c.ms, p.vai, p.pega), some: limitar((c.ms - p.vai - p.pega) / p.some),
  }
}

/** Faíscas curtas estalando em volta do corpo: trocam de lugar a cada ~70 ms. */
function estalos(s: Cena, n: number, forca: number, cores: readonly string[]): void {
  if (forca <= .05) return
  const rng = rngSemeado(s.semente + Math.floor(s.c.ms / 70) * 131)
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, r = 8 + rng() * 6, x = s.a.x + Math.cos(a) * r, y = s.a.y - 3 + Math.sin(a) * r * .8
    const pts: Ponto[] = [{ x, y }]
    for (let j = 1; j <= 3; j++) pts.push({ x: x + Math.cos(a) * j * 2.4 + (rng() - .5) * 4, y: y + Math.sin(a) * j * 2.4 + (rng() - .5) * 4 })
    linha(s.c.ctx, pts, 2.6 * forca, ESCURO); linha(s.c.ctx, pts, 1.2 * forca, cores[1 + i % 2])
  }
}
/** Bolha que sobe e estoura em três riscos. `v` 0..1 é a vida. */
function bolha(ctx: CanvasRenderingContext2D, x: number, y: number, v: number, cores: readonly string[]): void {
  if (v < .8) { const r = .9 + v * 1.7; conta(ctx, x, y, r, cores[1]); disco(ctx, x - r * .3, y - r * .3, r * .35, BRANCO); return }
  const e = (v - .8) / .2, r = 2.4 + e * 2
  for (let q = 0; q < 3; q++) {
    const a = -Math.PI / 2 + (q - 1) * 1.1
    fio(ctx, { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r }, { x: x + Math.cos(a) * (r + 1.6), y: y + Math.sin(a) * (r + 1.6) }, 1.1 * (1 - e), cores[2])
  }
}

const GOLPES: Record<string, (s: Cena) => void> = {
  /** "The user launches a weak jolt of electricity that paralyzes the target." */
  thunder_wave(s) {
    const { ctx, ms } = s.c, cores = COR.choque
    // Choque FRACO: não é raio, são três arcos trêmulos que viajam em fila. No
    // alvo, faíscas curtas ficam estalando em volta do corpo.
    const ang = Math.atan2(s.a.y - s.o.y, s.a.x - s.o.x), nx = -Math.sin(ang), ny = Math.cos(ang)
    if (s.pega === null && s.some <= 0 || s.pega !== null && s.pega < .2) for (let i = 0; i < 3; i++) {
      const fase = ms / (s.p.vai * .8) - i * .22
      if (fase < 0 || fase > 1) continue
      const rng = rngSemeado(s.semente + i * 17 + Math.floor(ms / 50) * 7)
      const cx = s.o.x + (s.a.x - s.o.x) * fase, cy = s.o.y - 4 + (s.a.y - s.o.y) * fase, R = 5 + fase * 5
      const pts: Ponto[] = []
      for (let j = -3; j <= 3; j++) {
        const f = j / 3, bojo = (1 - f * f) * 3.5 + (rng() - .5) * 2.2
        pts.push({ x: cx + nx * f * R + Math.cos(ang) * bojo, y: cy + ny * f * R + Math.sin(ang) * bojo })
      }
      const vida = Math.sin(fase * Math.PI) * .6 + .4
      linha(ctx, pts, 3 * vida, ESCURO); linha(ctx, pts, 1.4 * vida, cores[1 + i % 2])
    }
    if (s.pega !== null) {
      if (s.pega < .15) brilho(ctx, s.a.x, s.a.y - 4, 6 * (1 - s.pega / .15) + 1, cores[2])
      estalos(s, s.c.pedir(4), 1 - entrada(s.pega) * .5, cores)
    }
    else if (s.some > 0) estalos(s, s.c.pedir(2), .5 * (1 - s.some), cores)
  },

  /** "The user scatters a cloud of numbing powder that leaves the target with paralysis." */
  stun_spore(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.floco
    // Flocos LOSANGO jogados pra cima em leque; caem em zigue-zague duro sobre
    // o alvo (não derivam como pó de sono) e dão um estalinho ao encostar.
    const n = s.c.pedir(14), fino = 1 - entrada(s.some), sobe = s.p.vai * .55
    for (let i = 0; i < n; i++) {
      const rng = rngSemeado(s.semente + i * 43)
      const dx = (rng() - .5) * 28, alto = 20 + rng() * 10, t = ms - i * 12
      if (t <= 0) continue
      const u = limitar(t / sobe), queda = Math.max(0, t - sobe) / (s.p.vai - sobe + s.p.pega * .8)
      const topo = { x: s.a.x + dx, y: s.a.y - alto - 8 }
      const p = u < 1 ? arco({ x: s.o.x, y: s.o.y - 8 }, topo, saida(u), 8) : topo
      // Zigue-zague: onda triangular, não seno.
      const tri = Math.abs(((queda * 4 + rng()) % 1) * 2 - 1) * 2 - 1
      const x = p.x + tri * 4 * Math.min(1, queda * 3), y = p.y + Math.min(1, queda) * (alto + 16)
      const k = (1.5 + rng() * 1.1) * fino * (queda >= 1 ? 0 : 1)
      if (k < .4) continue
      poligono(ctx, [[x, y - k - 1.1], [x + k + 1.1, y], [x, y + k + 1.1], [x - k - 1.1, y]], ESCURO)
      poligono(ctx, [[x, y - k], [x + k, y], [x, y + k], [x - k, y]], i % 3 === 0 ? luz : i % 3 === 1 ? meio : fundo)
    }
    if (s.pega !== null && s.pega > .25) estalos(s, s.c.pedir(2), .7, COR.choque)
  },

  /** "The user intimidates the target with the pattern on its belly to cause paralysis." */
  glare(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.olho
    // Dois OLHOS de fenda se abrem acima de quem usa, fixos no alvo; um risco
    // de olhar atravessa até ele e o alvo fica travado, tremendo.
    const abre = saida(limitar(s.vai / .55)) * (1 - entrada(s.some)), centro = { x: s.o.x + s.dir * 2, y: s.o.y - 16 }
    for (const lado of [-1, 1]) {
      const x = centro.x + lado * 8.5, y = centro.y, h = 5 * abre, w = 6.5
      if (h < .6) { fio(ctx, { x: x - w, y }, { x: x + w, y }, 1.8 * Math.min(1, s.vai * 6) * (1 - s.some), ESCURO); continue }
      // Amêndoa simétrica com as pontas arredondadas por dois vértices a mais.
      const amendoa = (g: number): [number, number][] => [[x - w - g, y], [x - w * .5, y - h * .8 - g], [x, y - h - g], [x + w * .5, y - h * .8 - g], [x + w + g, y], [x + w * .5, y + h * .8 + g], [x, y + h + g], [x - w * .5, y + h * .8 + g]]
      poligono(ctx, amendoa(1.3), ESCURO)
      poligono(ctx, amendoa(0), meio)
      poligono(ctx, [[x - 2.6, y], [x, y - h * .75], [x + 2.6, y], [x, y + h * .75]], luz)
      // Fenda vertical no MEIO do olho e a sobrancelha caída pra dentro: é o
      // que faz o olhar ser de cobra, e bravo.
      poligono(ctx, [[x - 1.1, y], [x, y - h * .9], [x + 1.1, y], [x, y + h * .9]], fundo)
      fio(ctx, { x: x - lado * (w + 1), y: y - h - 3.4 }, { x: x + lado * (w - 1), y: y - h + .4 }, 2.2 * abre, ESCURO)
    }
    // O olhar: dois riscos finos que disparam e somem.
    const tiro = limitar((s.vai - .5) / .5)
    if (tiro > 0 && s.some <= 0 && (s.pega === null || s.pega < .25)) for (const lado of [-1, 1]) {
      const de = { x: centro.x + lado * 8.5, y: centro.y }, ate = { x: s.a.x + lado * 3, y: s.a.y - 10 }
      const f0 = s.pega === null ? Math.max(0, tiro - .5) : .5 + s.pega * 2, f1 = s.pega === null ? tiro : 1
      const q = (f: number): Ponto => ({ x: de.x + (ate.x - de.x) * f, y: de.y + (ate.y - de.y) * f })
      if (f1 > f0) { fio(ctx, q(f0), q(f1), 2.6, ESCURO); fio(ctx, q(f0), q(f1), 1.1, luz) }
    }
    if (s.pega !== null) {
      if (s.pega < .18) brilho(ctx, s.a.x, s.a.y - 10, 5 * (1 - s.pega / .18) + 1, luz)
      // Travado: riscos verticais curtos tremendo dos dois lados do corpo.
      const treme = Math.sin(ms * .12) * 1.2, forca = 1 - entrada(s.pega)
      for (const lado of [-1, 1]) for (let i = 0; i < 2; i++) {
        const x = s.a.x + lado * (11 + i * 3.5) + treme * lado, y = s.a.y - 8 + i * 9
        linha(ctx, [{ x, y }, { x: x + lado * 1.6, y: y + 2.5 }, { x, y: y + 5 }], 1.5 * forca, meio)
      }
    }
  },

  /** "The user scatters a cloud of poisonous dust that poisons the target." */
  poison_powder(s) {
    const { ctx, ms } = s.c, cores = COR.veneno
    // Pó PESADO: não voa. Uma nuvem roxa rola rente ao chão de quem usa até os
    // pés do alvo e então SOBE por ele, borbulhando.
    const n = s.c.pedir(12), fino = 1 - entrada(s.some)
    const pes = { x: s.o.x + s.dir * 4, y: s.o.y + 10 }
    for (let i = 0; i < n; i++) {
      const rng = rngSemeado(s.semente + i * 59)
      const t = ms - i * 16
      if (t <= 0) continue
      const u = limitar(t / (s.p.vai - 80)), sobe = Math.max(0, t - (s.p.vai - 80)) / (s.p.pega + s.p.some)
      const dx = (rng() - .5) * 20
      const x = pes.x + (s.a.x + dx - pes.x) * saida(u) + Math.sin(ms * .005 + i * 2.3) * 2 * sobe
      const y = pes.y + (s.chao - pes.y) * u - Math.abs(Math.sin(u * Math.PI * 3 + i)) * 3 - sobe * (16 + rng() * 14)
      const r = (1.8 + rng() * 1.8) * fino * (.6 + .4 * Math.sin(Math.min(1, u * 1.5) * Math.PI / 2))
      conta(ctx, x, y, r, cores[i % 3 === 0 ? 2 : i % 3 === 1 ? 1 : 0])
    }
    if (s.pega !== null && s.pega > .2) for (let b = 0; b < 2; b++) {
      bolha(ctx, s.a.x + (b ? 9 : -9), s.a.y + 2 - ((s.pega * 1.6 + b * .45) % 1) * 14, (s.pega * 1.6 + b * .45) % 1, cores)
    }
  },

  /** "A move that leaves the target badly poisoned. Its poison damage worsens every turn." */
  toxic(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.veneno
    // Uma BOLOTA grossa de lodo é cuspida em arco, espatifa no alvo e ESCORRE
    // em fios que vão alongando — é o veneno que piora com o tempo.
    const alvo = { x: s.a.x, y: s.a.y - 6 }, fino = 1 - entrada(s.some)
    if (s.pega === null && s.some <= 0) {
      const u = s.vai, p = arco({ x: s.o.x + s.dir * 4, y: s.o.y - 6 }, alvo, u, 22)
      const antes = arco({ x: s.o.x + s.dir * 4, y: s.o.y - 6 }, alvo, Math.max(0, u - .12), 22)
      traco(ctx, [antes, p], 3.4, fundo)
      conta(ctx, p.x, p.y, 4.2, meio); disco(ctx, p.x - 1.2, p.y - 1.4, 1.3, luz)
      return
    }
    const t = s.pega ?? 1
    // Espatifo: seis gomos saltam e encolhem.
    if (t < .35) for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + .4, e = t / .35, r = 4 + saida(e) * 9
      conta(ctx, alvo.x + Math.cos(a) * r, alvo.y + Math.sin(a) * r * .8, 2.2 * (1 - e), i % 2 ? meio : fundo)
    }
    // A mancha no corpo e os fios que escorrem dela.
    const mancha = 3.6 * Math.min(1, t * 5) * fino
    conta(ctx, alvo.x, alvo.y, mancha, fundo); disco(ctx, alvo.x - 1, alvo.y - 1, mancha * .55, meio)
    for (let i = 0; i < 4; i++) {
      const x = alvo.x - 6 + i * 4, comp = (5 + i % 2 * 5 + (i === 1 ? 3 : 0)) * limitar(t * 1.4 - i * .08) * fino
      if (comp < 1) continue
      const base = { x, y: alvo.y + 2 }, ponta = { x, y: alvo.y + 2 + comp }
      traco(ctx, [base, ponta], 1.1, meio)
      conta(ctx, ponta.x, ponta.y, 1.2 * fino, i % 2 ? luz : meio)
    }
    if (t > .4 && s.some < .5) bolha(ctx, alvo.x + 8, alvo.y - 2 - ((t * 1.8) % 1) * 12, (t * 1.8) % 1, COR.veneno)
  },

  /** "The user shoots poisonous threads to poison the target and lower the target's Speed stat." */
  toxic_thread(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.veneno
    // Três FIOS roxos disparados baixo; chegando, dão duas voltas nas pernas do
    // alvo e apertam (é o que tira a Speed). Pingam veneno.
    const boca = { x: s.o.x + s.dir * 5, y: s.o.y - 2 }, pernas = { x: s.a.x, y: s.a.y + 6 }
    const solta = s.pega === null ? (s.some > 0 ? 1 : 0) : limitar((s.pega - .3) / .4)
    if (solta < 1) for (let i = 0; i < 3; i++) {
      const ate = saida(limitar(s.vai * 1.25 - i * .1)), de = solta
      if (ate - de < .03) continue
      const pts: Ponto[] = []
      for (let j = 0; j <= 10; j++) {
        const f = de + (ate - de) * (j / 10)
        pts.push({ x: boca.x + (pernas.x - boca.x) * f, y: boca.y + (pernas.y - boca.y) * f + Math.sin(f * Math.PI) * (3 + i * 2.5) + (i - 1) * 1.5 * (1 - f) })
      }
      linha(ctx, pts, 2.4, fundo); linha(ctx, pts, 1, i === 1 ? luz : meio)
    }
    if (s.pega !== null || s.some > 0) {
      const t = s.pega ?? 1, aperta = saida(limitar(t / .45)), fino = 1 - entrada(s.some)
      for (let i = 0; i < 2; i++) {
        const rx = (14 - 5 * aperta) * fino, y = pernas.y - 2 + i * 5
        anel(ctx, pernas.x, y, rx, rx * .3, 1.2, i ? meio : luz)
      }
      // Pingos do laço.
      for (let i = 0; i < 2; i++) {
        const v = (ms / 380 + i * .5) % 1
        if (t > .35 && s.some < .5) conta(ctx, pernas.x + (i ? 7 : -7), pernas.y + 3 + v * 6, 1.3 * (1 - v), meio)
      }
    }
  },

  /** "The user shoots a sinister flame at the target to inflict a burn." */
  will_o_wisp(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.fatuo
    // Três chamas AZUIS nascem em volta de quem usa, vão em fila trêmula até o
    // alvo, fecham a roda em torno dele e o lambem.
    const fino = 1 - entrada(s.some), nasce = .32
    for (let i = 0; i < 3; i++) {
      const fase = i * (Math.PI * 2 / 3)
      let x: number, y: number, k = 1
      if (s.pega === null && s.some <= 0) {
        const roda = ms * .009 + fase
        const perto = { x: s.o.x + Math.cos(roda) * 10, y: s.o.y - 12 + Math.sin(roda) * 4 }
        const u = limitar((s.vai - nasce - i * .06) / (1 - nasce - .12))
        const longe = { x: s.a.x + Math.cos(fase) * 12, y: s.a.y - 6 + Math.sin(fase) * 5 }
        x = perto.x + (longe.x - perto.x) * saida(u); y = perto.y + (longe.y - perto.y) * saida(u) + Math.sin(u * Math.PI * 3 + i) * 3
        k = Math.min(1, s.vai / nasce * (1 + i * .2))
      }
      else {
        const t = s.pega ?? 1, roda = fase + t * Math.PI * 2.2, R = 12 - 7 * saida(limitar(t / .7))
        x = s.a.x + Math.cos(roda) * R; y = s.a.y - 6 + Math.sin(roda) * R * .45
        k = (1 + .35 * Math.sin(limitar((t - .6) / .4) * Math.PI)) * fino
      }
      if (k < .15) continue
      const lambe = Math.sin(ms * .03 + i * 2) * 1.2
      const forma = (g: number): [number, number][] => [[x + lambe * .5, y - (6.5 + g) * k], [x + (2.9 + g) * k, y - .5 * k], [x + (1.8 + g * .6) * k, y + (2.8 + g) * k], [x - (1.8 + g * .6) * k, y + (2.8 + g) * k], [x - (2.9 + g) * k, y - .5 * k]]
      poligono(ctx, forma(1.2), ESCURO); poligono(ctx, forma(0), fundo)
      poligono(ctx, [[x + lambe * .3, y - 3.8 * k], [x + 1.7 * k, y], [x, y + 2 * k], [x - 1.7 * k, y]], meio)
      disco(ctx, x, y + .4 * k, 1 * k, luz)
    }
    if (s.pega !== null && s.pega > .7) brilho(ctx, s.a.x, s.a.y - 6, 4 * Math.sin((s.pega - .7) / .3 * Math.PI) + .6, luz)
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...Object.values(COR).flat())

export const CONDICOES_POR_GOLPE = montarFamilia(PERFIS_DE_CONDICAO, {
  desenhar: (p, c, id) => GOLPES[id](cena(p, c)),
  duracao: p => p.vai + p.pega + p.some,
  // "Contato" é o instante em que a condição CHEGA no alvo.
  contato: p => p.vai,
  alcance: 44, margem: () => ({ cima: 54, baixo: 30, lados: 44 }), pele: peleDe,
})
