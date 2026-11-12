// Aumentos mistos (12/11): sete golpes de status em que quem usa sobe DOIS ou
// mais atributos de uma vez. Décima família de golpes de status com efeito
// próprio.
//
// Cada um parte da descrição do jogo, e a forma é do golpe, não da família:
//   Dragon Dance duas fitas-dragão sobem em hélice e rugem no alto · Quiver
//   Dance asas de mariposa batem dos lados e solta-se pó brilhante · Calm Mind
//   uma gota cai na cabeça e a água fica lisa · Bulk Up dois músculos incham
//   em três trancos · Coil três voltas de mola sobem do chão e apertam ·
//   Growth brotos sobem dos dois lados e abrem folhas · Shell Smash um casco
//   racha e estilhaça.
//
// TUDO acontece em quem USA o golpe. `origem` é o ALTO do corpo: meio em
// `o.y + 3`, pés em `o.y + 12`, cabeça em `o.y - 9`. Sem alfa.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, limitar, recuo, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import { anel, conta, disco, fio, linha, traco } from './tracos'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `sobe`: o golpe se arma · `fica`: no auge · `some`: assenta. */
interface Perfil { sobe: number; fica: number; some: number }

export const PERFIS_DE_AUMENTO_MISTO: Record<string, Perfil> = {
  dragon_dance: { sobe: 460, fica: 400, some: 240 },
  quiver_dance: { sobe: 260, fica: 600, some: 260 },
  calm_mind: { sobe: 340, fica: 560, some: 280 },
  bulk_up: { sobe: 200, fica: 600, some: 220 },
  coil: { sobe: 440, fica: 400, some: 240 },
  growth: { sobe: 460, fica: 420, some: 260 },
  shell_smash: { sobe: 360, fica: 420, some: 220 },
}

const COR = {
  dragao: ['#3a3a9a', '#7a6af0', '#d8d0ff'],
  dragao2: ['#9a2a4a', '#f06a7a', '#ffd0d8'],
  mariposa: ['#7a9a3a', '#f0a0d8', '#fff0c0'],
  agua: ['#3a6ab0', '#8ac8ff', '#f0faff'],
  musculo: ['#a04a2a', '#f09a6a', '#ffe8d8'],
  mola: ['#6a4a8a', '#c090e0', '#f0e0ff'],
  broto: ['#2f7a3a', '#6fcf5a', '#d8ffb0'],
  casco: ['#7a5a2a', '#c8a050', '#f4e0a0'],
} as const

interface Cena {
  c: ContextoVfx; p: Perfil; semente: number
  o: Ponto; meio: Ponto; chao: number; cabeca: Ponto
  sobe: number; fica: number | null; some: number
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  return {
    c, p, semente: Math.floor(c.rng() * 0xffffffff), o: c.origem, meio: { x: c.origem.x, y: c.origem.y + 3 }, chao: c.origem.y + 12,
    cabeca: { x: c.origem.x, y: c.origem.y - 9 },
    sobe: limitar(c.ms / p.sobe), fica: janela(c.ms, p.sobe, p.fica), some: limitar((c.ms - p.sobe - p.fica) / p.some),
  }
}

const GOLPES: Record<string, (s: Cena) => void> = {
  /** "The user vigorously performs a mystic, powerful dance that raises its Attack and Speed stats." */
  dragon_dance(s) {
    const { ctx } = s.c
    // Duas FITAS-DRAGÃO (uma azul, uma rubra) sobem do chão em hélice oposta,
    // de cabeça triangular; no alto se encaram e soltam um rugido de luz.
    const fino = 1 - entrada(s.some), ate = saida(s.sobe), topo = s.cabeca.y - 8
    for (const [lado, cores] of [[1, COR.dragao], [-1, COR.dragao2]] as const) {
      const pts: Ponto[] = [], cauda = s.fica === null ? (s.some > 0 ? s.some : 0) : s.fica * .55
      for (let i = 0; i <= 26; i++) {
        const f = cauda + (ate - cauda) * (i / 26)
        pts.push({ x: s.meio.x + Math.sin(f * Math.PI * 3) * lado * (13 - f * 5), y: s.chao - f * (s.chao - topo) })
      }
      if (ate - cauda < .05) continue
      linha(ctx, pts, 4.2 * fino, ESCURO); linha(ctx, pts, 2.4 * fino, cores[1]); linha(ctx, pts.slice(14), 1 * fino, cores[2])
      const p = pts[pts.length - 1], q = pts[pts.length - 3], a = Math.atan2(p.y - q.y, p.x - q.x), k = 1.1 * fino
      const tri = (g: number): [number, number][] => [[p.x + Math.cos(a) * (5 + g) * k, p.y + Math.sin(a) * (5 + g) * k], [p.x + Math.cos(a + 2.3) * (4 + g) * k, p.y + Math.sin(a + 2.3) * (4 + g) * k], [p.x + Math.cos(a - 2.3) * (4 + g) * k, p.y + Math.sin(a - 2.3) * (4 + g) * k]]
      poligono(ctx, tri(1.3), ESCURO); poligono(ctx, tri(0), cores[0]); disco(ctx, p.x, p.y, 1 * k, BRANCO)
    }
    if (s.fica !== null && s.fica < .4) {
      const e = s.fica / .4
      brilho(ctx, s.meio.x, topo, 7 * (1 - e) + 1, BRANCO)
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; fio(ctx, { x: s.meio.x + Math.cos(a) * (6 + e * 10), y: topo + Math.sin(a) * (6 + e * 10) }, { x: s.meio.x + Math.cos(a) * (10 + e * 12), y: topo + Math.sin(a) * (10 + e * 12) }, 1.5 * (1 - e), i % 2 ? COR.dragao[2] : COR.dragao2[2]) }
    }
  },

  /** "The user lightly performs a beautiful, mystic dance. This boosts the user's Sp. Atk, Sp. Def, and Speed stats." */
  quiver_dance(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.mariposa
    // Duas ASAS de mariposa abrem dos lados e batem devagar (só o contorno e
    // um ocelo); a cada batida cai pó brilhante balançando.
    const forca = Math.min(1, s.sobe * 1.6) * (1 - entrada(s.some)), bate = .55 + Math.abs(Math.sin(ms * .009)) * .45
    for (const lado of [-1, 1]) {
      const raiz = { x: s.meio.x + lado * 5, y: s.meio.y - 2 }, L = 15 * bate * forca
      if (L < 2) continue
      const cima: Ponto[] = [raiz, { x: raiz.x + lado * L * .5, y: raiz.y - 12 * forca }, { x: raiz.x + lado * L, y: raiz.y - 8 * forca }, { x: raiz.x + lado * L * .9, y: raiz.y }, raiz]
      const baixo: Ponto[] = [raiz, { x: raiz.x + lado * L * .8, y: raiz.y + 3 }, { x: raiz.x + lado * L * .6, y: raiz.y + 9 * forca }, { x: raiz.x + lado * L * .15, y: raiz.y + 6 * forca }, raiz]
      traco(ctx, cima, 1.5, meio); traco(ctx, baixo, 1.3, fundo)
      conta(ctx, raiz.x + lado * L * .62, raiz.y - 6 * forca, 1.6 * forca, luz)
    }
    const n = s.c.pedir(8)
    for (let i = 0; i < n; i++) {
      const rng = rngSemeado(s.semente + i * 47), v = (ms / (700 + rng() * 300) + rng()) % 1
      const x = s.meio.x + (rng() - .5) * 34 + Math.sin(v * 8 + i) * 2.5, y = s.cabeca.y - 6 + v * 26
      brilho(ctx, x, y, 1.9 * Math.sin(v * Math.PI) * forca, i % 2 ? luz : meio)
    }
  },

  /** "The user quietly focuses its mind and calms its spirit to raise its Sp. Atk and Sp. Def stats." */
  calm_mind(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.agua
    // SILÊNCIO: uma gota cai devagar na cabeça; do toque abrem três círculos
    // rasos, cada vez mais lentos, até a superfície ficar lisa — um traço só.
    const fino = 1 - entrada(s.some), nivel = s.cabeca.y - 3
    if (s.fica === null && s.some <= 0) {
      const y = nivel - 20 + entrada(s.sobe) * 20
      poligono(ctx, [[s.cabeca.x, y - 5.4], [s.cabeca.x + 3, y], [s.cabeca.x, y + 3.2], [s.cabeca.x - 3, y]], ESCURO)
      poligono(ctx, [[s.cabeca.x, y - 4], [s.cabeca.x + 2, y], [s.cabeca.x, y + 2.2], [s.cabeca.x - 2, y]], meio)
      disco(ctx, s.cabeca.x - .6, y - .2, .8, luz)
      return
    }
    const t = s.fica ?? 1
    for (let i = 0; i < 3; i++) {
      const e = limitar(t * 1.5 - i * .22)
      if (e <= 0 || e >= 1) continue
      anel(ctx, s.cabeca.x, nivel, (2 + saida(e) * 17) * fino, (.8 + saida(e) * 4.2) * fino, 1.3 * (1 - e), i % 2 ? luz : meio)
    }
    if (t < .14) { const e = t / .14; for (const lado of [-1, 1]) fio(ctx, { x: s.cabeca.x + lado * 2, y: nivel - 1 }, { x: s.cabeca.x + lado * (4 + e * 3), y: nivel - 4 - e * 3 }, 1.3 * (1 - e), luz) }
    // Liso: o traço que sobra.
    const liso = limitar((t - .6) / .4) * fino
    if (liso > .05) { fio(ctx, { x: s.cabeca.x - 12 * liso, y: nivel }, { x: s.cabeca.x + 12 * liso, y: nivel }, 2.6, fundo); fio(ctx, { x: s.cabeca.x - 12 * liso, y: nivel }, { x: s.cabeca.x + 12 * liso, y: nivel }, 1, luz) }
  },

  /** "The user tenses its muscles to bulk up its body, raising both its Attack and Defense stats." */
  bulk_up(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.musculo
    // Um contorno de TORSO em V (ombro largo, cintura fina) fecha em volta do
    // corpo e alarga em três trancos; os ombros incham e soltam riscos.
    const fino = 1 - entrada(s.some), t = s.fica === null ? (s.some > 0 ? 1 : 0) : s.fica
    const tranco = Math.min(2, Math.floor(t * 3)), dentro = (t * 3) % 1
    const soco = dentro < .2 && s.fica !== null ? 1 - dentro / .2 : 0
    const w = ([10, 12.5, 15.5][tranco] + soco * 1.6) * Math.min(1, s.sobe * 2) * fino
    if (w < 2) return
    const { x, y } = s.meio
    const torso: Ponto[] = [{ x: x - w * .5, y: y + 9 }, { x: x - w, y: y - 7 }, { x: x - w * .85, y: y - 11 }, { x, y: y - 12.5 }, { x: x + w * .85, y: y - 11 }, { x: x + w, y: y - 7 }, { x: x + w * .5, y: y + 9 }]
    traco(ctx, torso, 2, meio)
    for (const lado of [-1, 1]) {
      // Ombro: a bola que cresce a cada tranco.
      const r = 2.4 + tranco * .9 + soco
      conta(ctx, x + lado * w, y - 8, r * fino, meio); disco(ctx, x + lado * w - .8, y - 9, r * .4 * fino, luz)
      fio(ctx, { x: x + lado * w * .78, y: y - 2 }, { x: x + lado * w * .62, y: y + 3 }, 1.1, fundo)
      if (soco > 0) for (let i = 0; i < 3; i++) {
        const a = (lado > 0 ? 0 : Math.PI) + (i - 1) * .55 - .5, r0 = r + 3 + (1 - soco) * 6
        fio(ctx, { x: x + lado * w + Math.cos(a) * r0, y: y - 8 + Math.sin(a) * r0 }, { x: x + lado * w + Math.cos(a) * (r0 + 4), y: y - 8 + Math.sin(a) * (r0 + 4) }, 1.4 * soco, luz)
      }
    }
  },

  /** "The user coils up and concentrates. This raises its Attack and Defense stats as well as its accuracy." */
  coil(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.mola
    // Uma MOLA: três voltas sobem do chão em volta do corpo, uma depois da
    // outra; no auge todas apertam juntas e soltam um brilho no topo.
    const fino = 1 - entrada(s.some), aperta = s.fica === null ? (s.some > 0 ? 1 : 0) : recuo(limitar(s.fica / .35))
    for (let i = 0; i < 3; i++) {
      const e = limitar(s.sobe * 1.5 - i * .22)
      if (e <= 0) continue
      const y = s.chao - 3 - i * 7.5 * saida(e), rx = (14 - aperta * 3.5 - i * .8) * saida(e) * fino
      // Meia-volta de trás (fina, escura) e meia-volta da frente (cheia).
      const tras: Ponto[] = [], frente: Ponto[] = []
      for (let j = 0; j <= 10; j++) {
        const a = Math.PI * (j / 10)
        tras.push({ x: s.meio.x + Math.cos(a) * rx, y: y - Math.sin(a) * rx * .28 - (j / 10) * 3 })
        frente.push({ x: s.meio.x - Math.cos(a) * rx, y: y + Math.sin(a) * rx * .28 - 3 - (j / 10) * 3 })
      }
      if (rx < 1.5) continue
      linha(ctx, tras, 1.6, fundo)
      linha(ctx, frente, 3.6, ESCURO); linha(ctx, frente, 1.9, meio); linha(ctx, frente.slice(2, 6), 1, luz)
    }
    if (s.fica !== null && s.fica > .3 && s.fica < .6) brilho(ctx, s.meio.x, s.cabeca.y - 8, 5.5 * (1 - (s.fica - .3) / .3) + .8, luz)
  },

  /** "The user's body grows all at once, raising the Attack and Sp. Atk stats." */
  growth(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.broto
    // BROTOS sobem do chão dos dois lados, crescem ondulando até passar da
    // cabeça e abrem um par de folhas cada; no topo, um brilho de sol.
    const fino = 1 - entrada(s.some), cresce = saida(s.sobe)
    for (const lado of [-1, 1]) {
      const pts: Ponto[] = [], alto = (s.chao - s.cabeca.y + 6) * cresce * fino
      for (let i = 0; i <= 12; i++) {
        const f = i / 12
        pts.push({ x: s.meio.x + lado * (13 + Math.sin(f * 4 + ms * .004) * 2 * f), y: s.chao - f * alto })
      }
      if (alto < 2) continue
      linha(ctx, pts, 3.4, ESCURO); linha(ctx, pts, 1.7, meio)
      for (const [f, sentido] of [[.5, 1], [.85, -1]] as const) {
        const folha = saida(limitar((s.sobe - f * .7) / .3)) * fino
        if (folha < .1) continue
        const p = pts[Math.round(f * 12)], dx = lado * sentido
        const forma = (g: number): [number, number][] => [[p.x, p.y], [p.x + dx * (3 + g) * folha, p.y - (3.5 + g) * folha], [p.x + dx * (8 + g) * folha, p.y - 2 * folha], [p.x + dx * (3.5 + g) * folha, p.y + (1.5 + g) * folha]]
        poligono(ctx, forma(1.1), ESCURO); poligono(ctx, forma(0), fundo)
        fio(ctx, p, { x: p.x + dx * 6.5 * folha, y: p.y - 1.6 * folha }, .9, luz)
      }
    }
    if (s.fica !== null) brilho(ctx, s.meio.x, s.cabeca.y - 9, (4 + Math.sin(s.fica * Math.PI * 4) * 1.2) * Math.sin(s.fica * Math.PI) + .5, luz)
  },

  /** "The user breaks its shell, which lowers Defense and Sp. Def stats but sharply raises its Attack, Sp. Atk, and Speed stats." */
  shell_smash(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.casco
    // Um CASCO fecha em volta do corpo, uma rachadura corre de cima a baixo e
    // ele ESTILHAÇA: oito cacos voam girando e um clarão marca a quebra.
    const k = Math.min(1, s.sobe * 3)
    if (s.fica === null && s.some <= 0) {
      const pts: Ponto[] = []
      for (let j = 0; j <= 20; j++) { const a = (j / 20) * Math.PI * 2; pts.push({ x: s.meio.x + Math.cos(a) * 14 * k, y: s.meio.y + Math.sin(a) * 12 * k }) }
      traco(ctx, pts, 3, meio); linha(ctx, pts.slice(11, 16), 1.1, luz)
      // A rachadura: zigue-zague que desce conforme `sobe`.
      const racha = limitar((s.sobe - .35) / .65), ziga: Ponto[] = []
      for (let j = 0; j <= 6; j++) { const f = j / 6; if (f > racha) break; ziga.push({ x: s.meio.x + (j % 2 ? 3 : -3), y: s.meio.y - 12 + f * 24 }) }
      linha(ctx, ziga, 2.6, ESCURO); linha(ctx, ziga, 1, BRANCO)
      return
    }
    const t = s.fica === null ? 1 : s.fica, fino = 1 - entrada(s.some)
    if (t < .25) brilho(ctx, s.meio.x, s.meio.y, 9 * (1 - t / .25) + 1, BRANCO)
    for (let i = 0; i < 8; i++) {
      const rng = rngSemeado(s.semente + i * 83), a = (i / 8) * Math.PI * 2 + rng() * .5
      const d = 13 + saida(limitar(t * 1.3)) * (12 + rng() * 8), x = s.meio.x + Math.cos(a) * d, y = s.meio.y + Math.sin(a) * d * .85 + t * t * 8
      const giro = t * (5 + rng() * 5) + i, tam = (2.6 + rng() * 1.6) * (1 - entrada(limitar(t * 1.15))) * fino
      if (tam < .5) continue
      const c = Math.cos(giro), sn = Math.sin(giro)
      const forma = (g: number): [number, number][] => ([[-1.2, -.5], [.8, -1], [1.2, .7], [-.6, 1]] as const).map(([px, py]) => [x + (px * c - py * sn) * (tam + g), y + (px * sn + py * c) * (tam + g)] as [number, number])
      poligono(ctx, forma(1.1), ESCURO); poligono(ctx, forma(0), i % 2 ? meio : fundo)
    }
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...Object.values(COR).flat())

export const AUMENTOS_MISTOS_POR_GOLPE = montarFamilia(PERFIS_DE_AUMENTO_MISTO, {
  desenhar: (p, c, id) => GOLPES[id](cena(p, c)),
  duracao: p => p.sobe + p.fica + p.some,
  contato: p => p.sobe,
  alcance: 46, margem: () => ({ cima: 50, baixo: 34, lados: 48 }), pele: peleDe,
})
