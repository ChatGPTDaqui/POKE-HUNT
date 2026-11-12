// Confusão (12/11): os cinco golpes de status alvo-único que CONFUNDEM. Sexta
// família de golpes de status com efeito próprio.
//
// Cada um parte da descrição do jogo, e a forma é do golpe, não da família:
//   Supersonic ondas de som TORTAS, fora de compasso · Confuse Ray um orbe
//   sinistro que vem devagar, piscando de cor, e se abre em anel no rosto ·
//   Sweet Kiss um coração que vem aos pulinhos e estoura em corações menores ·
//   Swagger quem usa bufa de deboche e o alvo ferve de raiva · Flatter chuva
//   de brilhos e fitas sobre o alvo.
//
// Em comum só o fecho: as estrelinhas rodando em volta da cabeça de quem
// ficou tonto.
//
// Sai de quem usa (`origem`) e chega no alvo (`alvo`) — `STATUS_QUE_VIAJA`.
// Sem alfa: some encolhendo.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, limitar, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, brilho, comAcento, janela, montarFamilia, poligono } from './formas'
import { anel, arco, conta, disco, linha, traco } from './tracos'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

/** `vai`: sai de quem usa e chega · `pega`: age no alvo · `some`: assenta. */
interface Perfil { vai: number; pega: number; some: number }

export const PERFIS_DE_CONFUSAO: Record<string, Perfil> = {
  supersonic: { vai: 360, pega: 460, some: 240 },
  confuse_ray: { vai: 480, pega: 460, some: 260 },
  sweet_kiss: { vai: 440, pega: 460, some: 260 },
  swagger: { vai: 340, pega: 500, some: 260 },
  flatter: { vai: 320, pega: 520, some: 260 },
}

const COR = {
  som: ['#3f6f9a', '#8fd0f0', '#e8fbff'],
  orbe: ['#5a2a8a', '#ffd23a', '#ff8adf'],
  doce: ['#c03a78', '#ff8ab8', '#ffe0ee'],
  raiva: ['#8a1616', '#f04a3a', '#ffd0c0'],
  brilho: ['#c9952a', '#ffe36a', '#fffbe0'],
  fita: ['#e8487a', '#5ad0e8', '#8fe07a'],
} as const

interface Cena {
  c: ContextoVfx; p: Perfil; semente: number
  o: Ponto; a: Ponto; cabeca: Ponto; dir: number
  vai: number; pega: number | null; some: number
}
function cena(p: Perfil, c: ContextoVfx): Cena {
  return {
    c, p, semente: Math.floor(c.rng() * 0xffffffff), o: c.origem, a: c.alvo,
    cabeca: { x: c.alvo.x, y: c.alvo.y - 15 }, dir: c.alvo.x >= c.origem.x ? 1 : -1,
    vai: limitar(c.ms / p.vai), pega: janela(c.ms, p.vai, p.pega), some: limitar((c.ms - p.vai - p.pega) / p.some),
  }
}

/** Tontura: três estrelinhas rodando em volta da cabeça; a de trás é menor. */
function tontura(s: Cena, desde = .4): void {
  const t = s.pega === null ? (s.some > 0 ? 1 : 0) : s.pega
  if (t < desde) return
  const k = Math.min(1, (t - desde) * 5) * (1 - entrada(s.some))
  for (let i = 0; i < 3; i++) {
    const a = s.c.ms * .011 + i * (Math.PI * 2 / 3), frente = Math.sin(a)
    brilho(s.c.ctx, s.cabeca.x + Math.cos(a) * 10, s.cabeca.y - 3 + frente * 3, (1.7 + frente * .7) * k, COR.brilho[1])
  }
}
function coracao(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, cor: string, luz: string): void {
  if (k <= .15) return
  const forma = (g: number): [number, number][] => ([[0, 3.8 + g], [-4.2 - g, -.4], [-3.2 - g * .7, -3.4 - g], [-1, -3.8 - g], [0, -2.2 - g * .4], [1, -3.8 - g], [3.2 + g * .7, -3.4 - g], [4.2 + g, -.4]] as const)
    .map(([px, py]) => [x + px * k, y + py * k] as [number, number])
  poligono(ctx, forma(1.2 / Math.max(.4, k)), ESCURO); poligono(ctx, forma(0), cor)
  disco(ctx, x - 1.8 * k, y - 1.8 * k, .9 * k, luz)
}
/** Veia de raiva: quatro traços curvos em cata-vento. */
function veia(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, cor: string): void {
  if (k <= .15) return
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + .3, c = Math.cos(a), sn = Math.sin(a)
    const pts = [{ x: x + c * 1.2 * k - sn * 3 * k, y: y + sn * 1.2 * k + c * 3 * k }, { x: x + c * 2.4 * k, y: y + sn * 2.4 * k }, { x: x + c * 1.2 * k + sn * 3 * k, y: y + sn * 1.2 * k - c * 3 * k }]
    traco(ctx, pts, 1.3 * Math.min(1, k), cor)
  }
}

const GOLPES: Record<string, (s: Cena) => void> = {
  /** "The user generates odd sound waves from its body that confuse the target." */
  supersonic(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.som
    // Som ESTRANHO: os arcos saem do corpo tortos, cada um ondulando num
    // compasso diferente, e chegam desencontrados.
    const ang = Math.atan2(s.cabeca.y - s.o.y, s.cabeca.x - s.o.x), nx = -Math.sin(ang), ny = Math.cos(ang)
    if (s.some <= 0 && (s.pega === null || s.pega < .45)) for (let i = 0; i < 4; i++) {
      const fase = ms / (s.p.vai * .85) - i * .2
      if (fase < 0) continue
      const u = fase % 1
      if (s.pega !== null && u > .5) continue
      const cx = s.o.x + (s.cabeca.x - s.o.x) * u, cy = s.o.y - 4 + (s.cabeca.y - s.o.y) * u, R = 4 + u * 7
      const pts: Ponto[] = []
      for (let j = -4; j <= 4; j++) {
        const f = j / 4, torto = Math.sin(f * (3 + i) + ms * (.02 + i * .006)) * 1.8
        const bojo = (1 - f * f) * 3 + torto
        pts.push({ x: cx + nx * f * R + Math.cos(ang) * bojo, y: cy + ny * f * R + Math.sin(ang) * bojo })
      }
      const vida = Math.sin(u * Math.PI) * .7 + .3
      linha(ctx, pts, 2.8 * vida, fundo); linha(ctx, pts, 1.2 * vida, i % 2 ? luz : meio)
    }
    tontura(s, .25)
  },

  /** "The target is exposed to a sinister ray that triggers confusion." */
  confuse_ray(s) {
    const { ctx, ms } = s.c, [fundo, amarelo, rosa] = COR.orbe
    // Um ORBE sinistro vem DEVAGAR, balançando de um lado pro outro e piscando
    // de cor; no rosto do alvo se abre num anel que pulsa duas vezes.
    const pisca = Math.floor(ms / 90) % 2 ? amarelo : rosa
    if (s.pega === null && s.some <= 0) {
      const u = s.vai
      const x = s.o.x + (s.cabeca.x - s.o.x) * u, y = s.o.y - 8 + (s.cabeca.y + 2 - s.o.y + 8) * u + Math.sin(u * Math.PI * 4) * 5
      const k = Math.min(1, u * 5)
      // Halo de quatro contas que giram em volta do orbe.
      for (let i = 0; i < 4; i++) {
        const a = ms * .014 + i * Math.PI / 2
        conta(ctx, x + Math.cos(a) * 6.5 * k, y + Math.sin(a) * 6.5 * k, 1.3 * k, i % 2 ? amarelo : rosa)
      }
      conta(ctx, x, y, 3.6 * k, fundo); disco(ctx, x, y, 2.2 * k, pisca); disco(ctx, x - .7, y - .7, .8 * k, BRANCO)
      return
    }
    const t = s.pega ?? 1, fino = 1 - entrada(s.some)
    for (let i = 0; i < 2; i++) {
      const e = limitar(t * 2.2 - i * .45)
      if (e <= 0 || e >= 1) continue
      anel(ctx, s.cabeca.x, s.cabeca.y + 2, (3 + e * 11) * fino, (3 + e * 9) * fino, 1.6 * (1 - e), i ? rosa : amarelo)
    }
    if (t < .2) brilho(ctx, s.cabeca.x, s.cabeca.y + 2, 6 * (1 - t / .2) + 1, amarelo)
    tontura(s)
  },

  /** "The user kisses the target with a sweet, angelic cuteness that causes confusion." */
  sweet_kiss(s) {
    const { ctx } = s.c, [fundo, meio, luz] = COR.doce
    // Um CORAÇÃO vem aos pulinhos (três saltos no ar) com brilhinhos atrás; no
    // alvo estoura em cinco corações menores que sobem em leque.
    if (s.pega === null && s.some <= 0) {
      const u = s.vai, pulo = Math.abs(Math.sin(u * Math.PI * 3))
      const x = s.o.x + s.dir * 4 + (s.cabeca.x - s.o.x - s.dir * 4) * u, y = s.o.y - 6 + (s.cabeca.y + 4 - s.o.y + 6) * u - pulo * 7
      for (let i = 1; i <= 3; i++) {
        const v = Math.max(0, u - i * .07), py = s.o.y - 6 + (s.cabeca.y + 4 - s.o.y + 6) * v - Math.abs(Math.sin(v * Math.PI * 3)) * 7
        if (v > 0) brilho(ctx, s.o.x + s.dir * 4 + (s.cabeca.x - s.o.x - s.dir * 4) * v - s.dir * 2, py + 2, 1.9 - i * .4, luz)
      }
      coracao(ctx, x, y, (.8 + pulo * .25) * Math.min(1, u * 5), meio, luz)
      return
    }
    const t = s.pega ?? 1, fino = 1 - entrada(s.some)
    if (t < .18) brilho(ctx, s.cabeca.x, s.cabeca.y + 4, 6 * (1 - t / .18) + 1, luz)
    for (let i = 0; i < 5; i++) {
      const e = limitar(t * 1.5 - i * .05), a = -Math.PI / 2 + (i - 2) * .5
      if (e <= 0) continue
      const r = saida(e) * 15
      coracao(ctx, s.cabeca.x + Math.cos(a) * r, s.cabeca.y + 4 + Math.sin(a) * r, .55 * (1 - entrada(e)) * fino, i % 2 ? meio : fundo, luz)
    }
    tontura(s, .45)
  },

  /** "The user enrages and confuses the target. However, this also sharply raises the target's Attack stat." */
  swagger(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.raiva
    // Quem usa BUFA de deboche (três baforadas curtas pra frente). O alvo
    // ferve: veia de raiva pulsando na cabeça e vapor saindo dos dois lados.
    const boca = { x: s.o.x + s.dir * 6, y: s.o.y - 8 }
    if (s.some <= 0 && (s.pega === null || s.pega < .2)) for (let i = 0; i < 3; i++) {
      const e = limitar(s.vai * 1.6 - i * .28)
      if (e <= 0 || e >= 1) continue
      const x = boca.x + s.dir * (3 + e * 12), y = boca.y - 1 + (i - 1) * 3.5, r = (1.6 + e * 2) * (1 - entrada(e))
      conta(ctx, x, y, r, BRANCO); conta(ctx, x + s.dir * r, y - r * .5, r * .7, luz)
    }
    if (s.pega === null && s.some <= 0) return
    const t = s.pega ?? 1, fino = 1 - entrada(s.some), pulsa = 1 + Math.sin(ms * .03) * .18
    veia(ctx, s.cabeca.x + 6, s.cabeca.y - 4, 1.25 * saida(limitar(t / .2)) * pulsa * fino, meio)
    // Vapor: dois jatos em nuvens que sobem inclinadas.
    const baforadas = s.c.pedir(3)
    for (const lado of [-1, 1]) for (let i = 0; i < baforadas; i++) {
      const v = (ms / 360 + i / 3 + (lado > 0 ? .17 : 0)) % 1
      if (t < .15) continue
      const x = s.cabeca.x + lado * (7 + v * 9), y = s.cabeca.y + 4 - v * 10, r = (1.2 + v * 2.2) * (1 - entrada(v)) * fino
      conta(ctx, x, y, r, i % 2 ? luz : BRANCO)
    }
    if (t < .16) brilho(ctx, s.cabeca.x, s.cabeca.y, 5 * (1 - t / .16) + 1, fundo)
    tontura(s, .55)
  },

  /** "Flattery is used to confuse the target. However, this also raises the target's Sp. Atk stat." */
  flatter(s) {
    const { ctx, ms } = s.c, [fundo, meio, luz] = COR.brilho
    // Elogio vira FESTA: de quem usa sobe um leque de brilhos; sobre o alvo
    // chovem fitas coloridas rodopiando e estrelinhas piscando em volta.
    const fino = 1 - entrada(s.some)
    if (s.pega === null && s.some <= 0) for (let i = 0; i < 4; i++) {
      const e = limitar(s.vai * 1.4 - i * .12)
      if (e <= 0 || e >= 1) continue
      const p = arco({ x: s.o.x + s.dir * 4, y: s.o.y - 8 }, { x: s.a.x + (i - 1.5) * 7, y: s.cabeca.y - 12 }, saida(e), 10)
      brilho(ctx, p.x, p.y, 2.4 * Math.sin(e * Math.PI) + .6, i % 2 ? meio : luz)
    }
    if (s.pega === null && s.some <= 0) return
    const t = s.pega ?? 1, n = s.c.pedir(8)
    for (let i = 0; i < n; i++) {
      const rng = rngSemeado(s.semente + i * 61)
      const v = (t * 1.3 + rng()) % 1, x0 = s.a.x + (rng() - .5) * 30
      const x = x0 + Math.sin(v * 9 + i) * 3, y = s.cabeca.y - 14 + v * 34, giro = ms * .02 + i
      // Fita: tirinha que mostra a largura conforme rodopia.
      const w = Math.abs(Math.cos(giro)) * 2.4 + .5, k = fino * Math.sin(Math.min(1, v * 4) * Math.PI / 2) * (v > .85 ? (1 - v) / .15 : 1)
      if (k < .2) continue
      poligono(ctx, [[x - w - .9, y - 2.6 * k], [x + w + .9, y - 1.8 * k], [x + w + .9, y + 2.6 * k], [x - w - .9, y + 1.8 * k]], ESCURO)
      poligono(ctx, [[x - w, y - 1.8 * k], [x + w, y - 1 * k], [x + w, y + 1.8 * k], [x - w, y + 1 * k]], COR.fita[i % 3])
    }
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + .4, pisca = Math.sin(ms * .016 + i * 2.1)
      if (pisca > .2) brilho(ctx, s.a.x + Math.cos(a) * 15, s.a.y - 6 + Math.sin(a) * 11, 2.8 * (pisca - .2) / .8 * fino + .4, i % 2 ? meio : fundo)
    }
    tontura(s, .6)
  },
}

const peleDe = (id: string): Pele => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...Object.values(COR).flat())

export const CONFUSAO_POR_GOLPE = montarFamilia(PERFIS_DE_CONFUSAO, {
  desenhar: (p, c, id) => GOLPES[id](cena(p, c)),
  duracao: p => p.vai + p.pega + p.some,
  // "Contato" é o instante em que a confusão CHEGA no alvo.
  contato: p => p.vai,
  alcance: 44, margem: () => ({ cima: 54, baixo: 30, lados: 44 }), pele: peleDe,
})
