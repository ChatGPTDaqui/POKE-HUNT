// Família Fúria (09/10): golpes de surra descontrolada. Descrição dos dois:
// "rampages and attacks for two to three turns. The user then becomes
// confused" — então: surra de vários lados e, no fim, tontura em quem atacou.
// — Thrash e Petal Dance
// (Outrage é o golpe-vitrine do dragão T4 e fica com a coreografia do tipo).
//
// A forma é a SURRA: vários golpes curtos de lados diferentes, sem ritmo
// regular, cada um com estrelinha e riscos — o alvo apanha de todo lado. O
// Petal Dance acrescenta o redemoinho de pétalas que gira em quem dança e
// depois varre o alvo.
import { estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { PELES } from '../paletas'
import { rngSemeado } from '../aleatorio'
import { ESCURO, brilho, comAcento, janela, montarFamilia, poligono, rastro } from './formas'
import { proa } from './investidas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { petalas: boolean; preparo: number }

export const PERFIS_DE_FURIA: Record<string, Perfil> = {
  thrash: { petalas: false, preparo: 60 },
  petal_dance: { petalas: true, preparo: 180 },
}

/** Instantes dos golpes da surra (ms depois do preparo): irregulares de propósito. */
const SURRA = [0, 85, 150, 250, 310] as const
const DIRECOES = [0, 2.4, -2.2, .9, -1] as const
const CHOQUE = 200
const contatoDe = (p: Perfil) => p.preparo + 60
/** Depois da surra, quem atacou fica confuso (descrição dos dois golpes). */
const TONTURA = 320
const duracaoDe = (p: Perfil) => p.preparo + 60 + SURRA[SURRA.length - 1] + CHOQUE + TONTURA

const PETALA = ['#ff9ccb', '#ffd8ea'] as const

function petala(ctx: CanvasRenderingContext2D, p: Ponto, giro: number, s: number): void {
  if (s <= .3) return
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(giro)
  poligono(ctx, [[-s * 2.2, 0], [0, -s - 1], [s * 2.2, 0], [0, s + 1]], ESCURO)
  poligono(ctx, [[-s * 1.7, 0], [0, -s * .8], [s * 1.7, 0], [0, s * .8]], PETALA[0])
  poligono(ctx, [[-s * .6, -s * .2], [s * .9, -s * .3], [0, s * .1]], PETALA[1])
  ctx.restore()
}

function desenhar(perfil: Perfil, c: ContextoVfx): void {
  const { ctx, ms, tier, origem, alvo } = c
  const pele: Pele = c.pele
  const semente = Math.floor(c.rng() * 0xffffffff)
  const centro = { x: alvo.x, y: alvo.y - 3 }

  if (perfil.petalas) {
    // Redemoinho de pétalas: gira em quem dança e depois corre pro alvo em espiral.
    const n = 6 + Math.min(c.pedir(tier * 2), 6)
    for (let i = 0; i < n; i++) {
      const fase = i / n
      const ida = limitar((ms - perfil.preparo * .7 - fase * 120) / 260)
      const a = fase * Math.PI * 2 + ms / 90
      const roda = { x: origem.x + Math.cos(a) * 13, y: origem.y - 2 + Math.sin(a) * 7 }
      const ali = { x: centro.x + Math.cos(a * 1.3) * 12 * (1 - ida * .4), y: centro.y + Math.sin(a * 1.3) * 9 * (1 - ida * .4) }
      const u = saida(ida)
      const p = { x: roda.x + (ali.x - roda.x) * u, y: roda.y + (ali.y - roda.y) * u }
      const some = 1 - limitar((ms - (duracaoDe(perfil) - 140)) / 120)
      petala(ctx, p, a * 1.7, 1.8 * some)
    }
  }

  const ini = perfil.preparo + 60
  SURRA.forEach((dt, k) => {
    if (k >= 3 + (tier >= 3 ? 2 : tier >= 2 ? 1 : 0)) return
    const rng = rngSemeado(semente + 10 + k)
    const de = DIRECOES[k] + Math.atan2(alvo.y - origem.y, alvo.x - origem.x)
    // Cada golpe chega rápido de um lado: proa curta + riscos.
    const tv = janela(ms, ini + dt - 50, 50)
    if (tv !== null) {
      const fora = { x: centro.x - Math.cos(de) * 26, y: centro.y - Math.sin(de) * 20 }
      const p = { x: fora.x + (centro.x - Math.cos(de) * 7 - fora.x) * saida(tv), y: fora.y + (centro.y - Math.sin(de) * 6 - fora.y) * saida(tv) }
      rastro(ctx, fora, p, c.pedir(2), 3, pele, rng, .8)
      proa(ctx, p, de, .5, 1, pele)
    }
    const t = janela(ms, ini + dt, CHOQUE)
    if (t === null) return
    const p = { x: centro.x + [0, 6, -5, 3, -4][k], y: centro.y + [0, -4, 3, 5, -2][k] }
    estrelaDeImpacto(ctx, p, 7 + tier + (k === 0 ? 3 : 0), t, pele, rng)
    riscos(ctx, p, c.pedir(2 + (tier >> 1)), 14 + tier * 2, t, pele.meio, rng)
  })

  // Confusão em quem atacou: estrelinhas girando em volta da cabeça.
  const tt = janela(ms, duracaoDe(perfil) - TONTURA - 40, TONTURA)
  if (tt !== null) {
    const k = saida(limitar(tt / .2)) * (1 - limitar((tt - .8) / .2))
    for (let i = 0; i < 3; i++) {
      const a = tt * Math.PI * 4 + i * Math.PI * 2 / 3
      brilho(ctx, origem.x + Math.cos(a) * 10, origem.y - 15 + Math.sin(a) * 3.5, 3.4 * k, i % 2 ? pele.nucleo : '#ffd23a')
    }
  }
}

export const FURIAS_POR_GOLPE = montarFamilia(PERFIS_DE_FURIA, {
  desenhar,
  duracao: duracaoDe,
  contato: contatoDe,
  alcance: 48,
  pele: (_id, p) => p.petalas ? comAcento(PELES.GRASS, ...PETALA, '#ffd23a') : comAcento(PELES.NORMAL, '#ffd23a'),
})
