// Família Some e volta (09/10): nove golpes de "sumir e aparecer", cada um
// desenhado a partir da descrição do jogo (frase no comentário do golpe).
// No jogo o golpe resolve num acerto só: o "primeiro turno" vira a preparação
// do efeito (subir, mergulhar, cavar, esticar a sombra) e o segundo, o ataque.
import { getAbility } from '@/data/abilities'
import { emitirParticulas } from '../particulas'
import { PELES } from '../paletas'
import { crescente, entrada, estilhacos, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, bola, brilho, comAcento, entrePontos, estatica, janela, montarFamilia, nuvem, poligono, rastro } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_SOME_E_VOLTA: Record<string, Perfil> = {
  fly: { contato: 300, fim: 260 },
  bounce: { contato: 320, fim: 340 },
  sky_drop: { contato: 360, fim: 260 },
  dive: { contato: 300, fim: 280 },
  dig: { contato: 320, fim: 280 },
  shadow_sneak: { contato: 220, fim: 260 },
  brave_bird: { contato: 230, fim: 300 },
  feint_attack: { contato: 260, fim: 240 },
  feint: { contato: 200, fim: 300 },
}

interface Cena { c: ContextoVfx; pele: Pele; semente: number; passo: number; ux: number; uy: number; contato: number; pe: (p: Ponto) => Ponto }

function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy) || 1
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), passo: Math.floor(c.ms / 66), ux: dx / L, uy: dy / L, contato: p.contato, pe: q => ({ x: q.x, y: q.y + 11 }) }
}

function choque(s: Cena, t: number, tamanho: number, ponto = s.c.alvo): void {
  const rng = rngSemeado(s.semente + 50)
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier * 1.5, t, s.pele, rng)
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 18 + s.c.tier * 3, t, s.pele.meio, rng)
}

/** Ave em silhueta (asas abertas `abre` 0..1), olhando pra +X. */
function ave(ctx: CanvasRenderingContext2D, p: Ponto, s: number, abre: number, angulo: number, pele: Pele, cor = pele.base): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angulo); ctx.scale(s, s)
  const asa = (g: number, lado: number) => [[-2, 0], [-8 - g, lado * (3 + 9 * abre + g)], [-1, lado * (5 + 7 * abre + g)], [5 + g, lado * (1 + g * .3)]] as const
  for (const [g, c] of [[1.4, pele.contorno], [0, cor]] as const) {
    poligono(ctx, asa(g, -1), c); poligono(ctx, asa(g, 1), c)
    poligono(ctx, [[-9 - g, -1.6 - g * .5], [7 + g, -2 - g * .4], [11 + g, 0], [7 + g, 2 + g * .4], [-9 - g, 1.6 + g * .5]], c)
  }
  poligono(ctx, [[-6, -.8], [6, -1.2], [8, 0], [6, .6], [-6, .6]], pele.meio)
  ctx.fillStyle = BRANCO; ctx.fillRect(6, -1, 1.4, 1.2)
  ctx.restore()
}

function pena(ctx: CanvasRenderingContext2D, p: Ponto, giro: number, s: number, pele: Pele): void {
  if (s < .3) return
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(giro)
  poligono(ctx, [[-4 * s - 1, 0], [0, -1.6 * s - 1], [4 * s + 1, 0], [0, 1.6 * s + 1]], ESCURO)
  poligono(ctx, [[-4 * s, 0], [0, -1.6 * s], [4 * s, 0], [0, 1.6 * s]], pele.nucleo)
  ctx.fillStyle = pele.base; ctx.fillRect(-4 * s, -.4, 8 * s, .8)
  ctx.restore()
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "The user soars and then strikes its target on the next turn." */
  fly(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Sobe: a ave de vento decola de quem ataca e some no alto, soltando penas.
    const sobe = janela(ms, 0, 150)
    if (sobe !== null) {
      ave(ctx, { x: origem.x, y: origem.y - 40 * entrada(sobe) }, .9, Math.abs(Math.sin(ms / 40)), -Math.PI / 2, s.pele)
      for (let k = 0; k < 3; k++) pena(ctx, { x: origem.x + (k - 1) * 8, y: origem.y - 4 + sobe * 10 }, sobe * 4 + k, 1 - sobe * .6, s.pele)
    }
    // Volta: mergulha do alto direto no alvo.
    const desce = janela(ms, 190, p.contato - 190)
    if (desce !== null) {
      const de = { x: alvo.x - s.ux * 18, y: alvo.y - 48 }
      const q = entrePontos(de, alvo, entrada(desce))
      rastro(ctx, de, q, s.c.pedir(3 + s.c.tier), 5, s.pele, rngSemeado(s.semente + 1))
      ave(ctx, q, 1, .25, Math.atan2(alvo.y - de.y, alvo.x - de.x), s.pele)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 11)
    for (let k = 0; k < Math.min(s.c.pedir(4), 4); k++) pena(ctx, { x: alvo.x + (k - 1.5) * 8 * saida(t), y: alvo.y - 4 + 16 * t * (k % 2 ? 1 : .6) }, t * 5 + k, 1 - t * .7, s.pele)
  },

  /** "Bounces up high, then drops on the target on the second turn. May paralyze." */
  bounce(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Mola: quem ataca afunda (molas comprimidas) e é lançado num arco alto.
    const mola = janela(ms, 0, 140)
    if (mola !== null) {
      const comprime = Math.sin(mola * Math.PI)
      for (const lado of [-1, 1]) {
        ctx.strokeStyle = ESCURO; ctx.lineWidth = 2.6; ctx.beginPath()
        for (let i = 0; i <= 6; i++) ctx.lineTo(origem.x + lado * 8 + (i % 2 ? 2 : -2), origem.y + 12 - i * (2.4 - comprime * 1.2))
        ctx.stroke()
        ctx.strokeStyle = s.pele.meio; ctx.lineWidth = 1.2; ctx.stroke()
      }
    }
    // Arco: a bola quica bem alto e cai sobre o alvo.
    const voo = janela(ms, 120, p.contato - 120)
    if (voo !== null) {
      const q = entrePontos(origem, alvo, voo)
      q.y -= Math.sin(voo * Math.PI) * 58
      bola(ctx, q, 6, s.pele)
      if (voo > .5) rastro(ctx, { x: q.x, y: q.y - 22 }, q, s.c.pedir(2), 4, s.pele, rngSemeado(s.semente + 1), .7)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, limitar(t * 1.3), 12)
    nuvem(ctx, s.pe(alvo), limitar(t * 1.3), s.c.pedir(4), 14, s.pele, rngSemeado(s.semente + 2))
    // Pode paralisar: estática presa no alvo.
    estatica(ctx, alvo, saida(limitar((t - .2) / .2)) * (1 - limitar((t - .8) / .2)), PELES.ELECTRIC, s.semente + 90 + s.passo)
  },

  /** "Takes the target into the sky, then drops it during the next turn." */
  sky_drop(p, s) {
    const { ctx, ms, alvo } = s.c
    // Garras agarram o alvo e sobem com ele (linhas de subida); no chão fica a
    // sombra do alvo encolhendo. Depois: queda e baque no chão.
    const agarra = janela(ms, 0, 200)
    const chao = s.pe(alvo)
    if (agarra !== null) {
      const sobe = saida(limitar((agarra - .3) / .7))
      const garra = { x: alvo.x, y: alvo.y - 12 - sobe * 20 }
      ave(ctx, { x: garra.x, y: garra.y - 10 }, 1, Math.abs(Math.sin(ms / 35)), 0, s.pele)
      for (const lado of [-1, 1]) poligono(ctx, [[garra.x + lado * 3, garra.y - 2], [garra.x + lado * 7, garra.y + 6], [garra.x + lado * 4, garra.y + 4]], ESCURO)
      if (sobe > 0) for (const dx of [-8, 0, 8]) poligono(ctx, [[alvo.x + dx - .7, alvo.y + 6 - sobe * 18], [alvo.x + dx + .7, alvo.y + 6 - sobe * 18], [alvo.x + dx + .7, alvo.y + 14 - sobe * 10], [alvo.x + dx - .7, alvo.y + 14 - sobe * 10]], BRANCO)
    }
    const sombra = janela(ms, 0, p.contato)
    if (sombra !== null) {
      const r = 10 * (sombra < .55 ? 1 - .6 * saida(sombra / .55) : .4 + .6 * entrada((sombra - .55) / .45))
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(chao.x, chao.y, r, r * .35, 0, 0, Math.PI * 2); ctx.fill()
    }
    const cai = janela(ms, 220, p.contato - 220)
    if (cai !== null) rastro(ctx, { x: alvo.x, y: alvo.y - 46 }, { x: alvo.x, y: alvo.y - 46 + 40 * entrada(cai) }, s.c.pedir(4), 8, s.pele, rngSemeado(s.semente + 1))
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 12, { x: alvo.x, y: alvo.y + 6 })
    nuvem(ctx, chao, t, s.c.pedir(5 + s.c.tier), 18, PELES.GROUND, rngSemeado(s.semente + 2))
  },

  /** "Diving on the first turn, the user floats up and attacks on the next turn." */
  dive(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Mergulha: anel de água e respingo onde quem ataca some.
    const mergulho = janela(ms, 0, 200)
    if (mergulho !== null) {
      const chao = s.pe(origem)
      for (const [w, c] of [[3.2, s.pele.contorno], [1.6, s.pele.meio]] as const) {
        ctx.strokeStyle = c; ctx.lineWidth = w * (1 - mergulho)
        ctx.beginPath(); ctx.ellipse(chao.x, chao.y, 6 + mergulho * 12, (6 + mergulho * 12) * .35, 0, 0, Math.PI * 2); ctx.stroke()
      }
      for (let k = 0; k < 5; k++) bola(ctx, { x: chao.x + (k - 2) * 4, y: chao.y - 14 * Math.sin(mergulho * Math.PI) * (1 - Math.abs(k - 2) * .2) }, 2 * (1 - mergulho * .5), s.pele)
    }
    // Volta: um gêiser sobe por baixo do alvo e quem ataca sai de dentro.
    const geiser = janela(ms, p.contato - 80, p.fim + 80)
    if (geiser !== null) {
      const chao = s.pe(alvo)
      const h = 34 * saida(limitar(geiser / .3)) * (1 - entrada(limitar((geiser - .6) / .4)))
      const w = 8
      if (h > 1) {
        poligono(ctx, [[chao.x - w - 1.4, chao.y], [chao.x + w + 1.4, chao.y], [chao.x + w * .6 + 1.4, chao.y - h], [chao.x - w * .6 - 1.4, chao.y - h]], s.pele.contorno)
        poligono(ctx, [[chao.x - w, chao.y], [chao.x + w, chao.y], [chao.x + w * .6, chao.y - h], [chao.x - w * .6, chao.y - h]], s.pele.base)
        poligono(ctx, [[chao.x - w * .3, chao.y], [chao.x + w * .3, chao.y], [chao.x + w * .2, chao.y - h], [chao.x - w * .2, chao.y - h]], BRANCO)
        for (let k = 0; k < 6; k++) bola(ctx, { x: chao.x + (k - 2.5) * 5, y: chao.y - h - 3 + Math.sin(k + ms / 40) * 2 }, 2.6, s.pele)
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 10)
  },

  /** "The user burrows, then attacks on the next turn." */
  dig(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    const terra = PELES.GROUND
    // Cava: monte de terra onde quem ataca some, pedrinhas voando.
    const cava = janela(ms, 0, 180)
    if (cava !== null) {
      nuvem(ctx, s.pe(origem), cava, s.c.pedir(4), 10, terra, rngSemeado(s.semente + 1))
      estilhacos(ctx, s.pe(origem), s.c.pedir(3), 14, cava, terra, rngSemeado(s.semente + 2))
    }
    // Por baixo da terra: um calombo corre pelo chão até o alvo.
    const tunel = janela(ms, 150, p.contato - 150)
    if (tunel !== null) {
      const q = entrePontos(s.pe(origem), s.pe(alvo), tunel)
      for (const [g, c] of [[1.4, terra.contorno], [0, terra.base], [-1.4, terra.meio]] as const) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(q.x, q.y - 1 - (g < 0 ? 1 : 0), 7 + g, 3.4 + g * .6, 0, Math.PI, 0); ctx.fill()
      }
      if (tunel > .1) nuvem(ctx, { x: q.x - s.ux * 6, y: q.y }, (tunel * 3) % 1, s.c.pedir(2), 5, terra, rngSemeado(s.semente + 3 + Math.floor(tunel * 3)))
    }
    // Sai debaixo do alvo: erupção de terra e pedras.
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 11)
    estilhacos(ctx, s.pe(alvo), s.c.pedir(5 + s.c.tier), 24, t, terra, rngSemeado(s.semente + 4))
    nuvem(ctx, s.pe(alvo), t, s.c.pedir(4), 14, terra, rngSemeado(s.semente + 5), .45, 10)
  },

  /** "Extends its shadow and attacks the target from behind. Always goes first." */
  shadow_sneak(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // A sombra de quem ataca se ESTICA pelo chão até a sombra do alvo...
    const estica = janela(ms, 0, p.contato + p.fim)
    if (estica !== null) {
      const u = saida(limitar(ms / (p.contato - 60)))
      const some = 1 - limitar((ms - p.contato - 60) / 160)
      const a = s.pe(origem), b = entrePontos(a, { x: alvo.x + s.ux * 8, y: alvo.y + 11 }, u)
      const nx = -(b.y - a.y), ny = b.x - a.x, L = Math.hypot(nx, ny) || 1
      const w = 4 * some
      if (w > .3) poligono(ctx, [[a.x + nx / L * w, a.y + ny / L * w * .4], [b.x + nx / L * w * .6, b.y + ny / L * w * .3], [b.x + s.ux * 3, b.y], [b.x - nx / L * w * .6, b.y - ny / L * w * .3], [a.x - nx / L * w, a.y - ny / L * w * .4]], ESCURO)
    }
    // ...e uma mão de sombra sobe ATRÁS do alvo e golpeia pelas costas.
    const mao = janela(ms, p.contato - 90, 200)
    if (mao !== null) {
      const atras = { x: alvo.x + s.ux * 9, y: alvo.y + 11 }
      const h = 22 * saida(limitar(mao / .45)) * (1 - entrada(limitar((mao - .6) / .4)))
      if (h > 1) {
        poligono(ctx, [[atras.x - 4.6, atras.y], [atras.x + 4.6, atras.y], [atras.x + 2 - s.ux * 6, atras.y - h], [atras.x - 5 - s.ux * 8, atras.y - h + 4]], s.pele.contorno)
        poligono(ctx, [[atras.x - 3, atras.y], [atras.x + 3, atras.y], [atras.x + 1 - s.ux * 6, atras.y - h + 1.6], [atras.x - 3.6 - s.ux * 7, atras.y - h + 4.6]], s.pele.base)
        for (const k of [-1, 0, 1]) poligono(ctx, [[atras.x - s.ux * 7 + k * 2.4, atras.y - h + 2], [atras.x - s.ux * 11 + k * 3, atras.y - h - 3], [atras.x - s.ux * 8 + k * 2.4, atras.y - h + 3]], s.pele.meio)
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 9, { x: alvo.x + s.ux * 4, y: alvo.y - 3 })
  },

  /** "Tucks in its wings and charges from a low altitude. Damages the user quite a lot." */
  brave_bird(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Ave de fogo azul com as asas recolhidas, rasante, deixando rastro de chama.
    const u = janela(ms, 30, p.contato - 30)
    if (u !== null) {
      const de = { x: origem.x, y: origem.y + 4 }, q = entrePontos(de, alvo, saida(u))
      emitirParticulas(ctx, s.pele, q, s.c.pedir(4 + s.c.tier), 12, (u * 1.4) % 1, 5, rngSemeado(s.semente + 1))
      rastro(ctx, de, q, s.c.pedir(3 + s.c.tier), 4, s.pele, rngSemeado(s.semente + 2))
      ave(ctx, q, 1.15, .05, Math.atan2(alvo.y - de.y, alvo.x - de.x), s.pele, s.pele.meio)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 14)
    crescente(ctx, alvo, 16 + t * 8, Math.atan2(s.uy, s.ux) - .9, Math.atan2(s.uy, s.ux) + .9, 3, t, 0, s.pele, 1)
    for (let k = 0; k < 4; k++) pena(ctx, { x: alvo.x + (k - 1.5) * 9 * saida(t), y: alvo.y - 6 + 14 * t }, t * 4 + k, 1 - t * .6, s.pele)
    // Recuo: quem atacou leva um estalo também.
    const tr = (t - .1) / .7
    if (tr > 0 && tr < 1) estrelaDeImpacto(ctx, { x: origem.x, y: origem.y - 3 }, 9, tr, s.pele, rngSemeado(s.semente + 80))
  },

  /** "Approaches the target disarmingly, then throws a sucker punch. Never misses." */
  feint_attack(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Chega "inofensivo": uma florzinha/brilho amistoso vai até o alvo... e,
    // do lado de trás, sai o golpe escuro de surpresa.
    const chega = janela(ms, 0, p.contato - 40)
    if (chega !== null) {
      const q = entrePontos(origem, { x: alvo.x - s.ux * 10, y: alvo.y - 8 }, saida(chega))
      brilho(ctx, q.x, q.y + Math.sin(ms / 60) * 2, 3, s.pele.nucleo)
    }
    const golpe = janela(ms, p.contato - 60, 60)
    if (golpe !== null) {
      const de = { x: alvo.x + s.ux * 24, y: alvo.y - 10 }, q = entrePontos(de, { x: alvo.x + s.ux * 6, y: alvo.y - 3 }, saida(golpe))
      crescente(ctx, q, 8, Math.atan2(-s.uy, -s.ux) - 1, Math.atan2(-s.uy, -s.ux) + 1, 4, .55, 0, s.pele, 1)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 10)
  },

  /** "Hits a target using a move such as Protect or Detect. Also lifts their effects." */
  feint(p, s) {
    const { ctx, ms, alvo } = s.c
    // O alvo está protegido por uma redoma — o golpe a ESTILHAÇA.
    const redoma = janela(ms, 0, p.contato + 20)
    if (redoma !== null) {
      const r = 15 * saida(limitar(redoma / .3))
      for (const [w, c] of [[3, ESCURO], [1.6, PELES.GRASS.meio], [.6, BRANCO]] as const) {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(alvo.x, alvo.y - 2, r, r * 1.05, 0, 0, Math.PI * 2); ctx.stroke()
      }
    }
    const golpe = janela(ms, p.contato - 70, 70)
    if (golpe !== null) rastro(ctx, s.c.origem, entrePontos(s.c.origem, alvo, saida(golpe)), s.c.pedir(3), 5, s.pele, rngSemeado(s.semente + 1))
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 9)
    estilhacos(ctx, { x: alvo.x, y: alvo.y - 2 }, s.c.pedir(7 + s.c.tier), 26, t, { ...PELES.GRASS, meio: BRANCO }, rngSemeado(s.semente + 2))
  },
}

const COMPLEMENTOS: Record<string, string[]> = {
  bounce: [PELES.ELECTRIC.base, PELES.ELECTRIC.meio, PELES.ELECTRIC.contorno],
  sky_drop: [PELES.GROUND.contorno, PELES.GROUND.base, PELES.GROUND.meio],
  feint: [PELES.GRASS.contorno, PELES.GRASS.meio, PELES.GRASS.base],
}

export const SOME_E_VOLTA_POR_GOLPE = montarFamilia(PERFIS_DE_SOME_E_VOLTA, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim,
  contato: p => p.contato,
  alcance: 56,
  margem: () => ({ cima: 75, baixo: 56, lados: 56 }),
  pele: (id) => COMPLEMENTOS[id]?.length ? comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...COMPLEMENTOS[id]) : undefined,
})
