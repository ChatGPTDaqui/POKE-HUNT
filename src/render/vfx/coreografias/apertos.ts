// Família Aperto e pinça (09/10): oito golpes desenhados a partir da
// descrição do jogo (frase no comentário de cada golpe). Aqui o alvo é PRESO:
// a forma principal fica em volta dele, não viaja. Guillotine fica de fora:
// OHKO desligado por balanceamento, o golpe nunca dispara (abilities.ts).
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { entrada, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, bola, brilho, comAcento, corda, entrePontos, janela, montarFamilia, poligono, setasDeStatus } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_APERTO: Record<string, Perfil> = {
  wrap: { contato: 220, fim: 320 },
  bind: { contato: 220, fim: 320 },
  constrict: { contato: 240, fim: 320 },
  wring_out: { contato: 260, fim: 300 },
  clamp: { contato: 200, fim: 320 },
  vice_grip: { contato: 200, fim: 280 },
  crabhammer: { contato: 220, fim: 280 },
}

interface Cena { c: ContextoVfx; pele: Pele; semente: number; lado: number; centro: Ponto; contato: number }

function cena(p: Perfil, c: ContextoVfx): Cena {
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), lado: c.alvo.x < c.origem.x ? -1 : 1, centro: { x: c.alvo.x, y: c.alvo.y - 3 }, contato: p.contato }
}

function choque(s: Cena, t: number, tamanho: number, ponto = s.centro): void {
  const rng = rngSemeado(s.semente + 50)
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier * 1.2, t, s.pele, rng)
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 16 + s.c.tier * 3, t, s.pele.meio, rng)
}

/** Linhas de aperto: traços curtos apontando PRA DENTRO do alvo, pulsando. */
function aperto(ctx: CanvasRenderingContext2D, p: Ponto, k: number, ms: number): void {
  if (k <= .05) return
  const pulso = Math.floor(ms / 80) % 2 ? 1 : .8
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, r0 = 20 * pulso, r1 = r0 - 6 * k
    poligono(ctx, [[p.x + Math.cos(a - .12) * r0, p.y + Math.sin(a - .12) * r0 * .8], [p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1 * .8], [p.x + Math.cos(a + .12) * r0, p.y + Math.sin(a + .12) * r0 * .8]], BRANCO)
  }
}

/** Anel enrolado em volta do alvo (uma volta de corpo/cipó), visto de lado. */
function volta(ctx: CanvasRenderingContext2D, c: Ponto, rx: number, ry: number, esp: number, pele: Pele, fecha: number, frente: boolean): void {
  const a0 = frente ? 0 : Math.PI, a1 = a0 + Math.PI * fecha
  ctx.lineCap = 'round'
  for (const [w, cor] of [[esp + 2.6, pele.contorno], [esp, pele.base], [esp * .35, pele.meio]] as const) {
    ctx.strokeStyle = cor; ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, -.15, a0, a1); ctx.stroke()
  }
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "A long body, vines, or the like are used to wrap and squeeze the target for four to five turns." */
  wrap(p, s) {
    const { ctx, ms } = s.c
    // Corpo longo dá VOLTAS em espiral em volta do alvo e aperta.
    const t = janela(ms, 0, p.contato + p.fim)
    if (t === null) return
    const enrola = saida(limitar(ms / p.contato))
    const solta = 1 - entrada(limitar((ms - p.contato - p.fim * .6) / (p.fim * .4)))
    const aperta = ms > p.contato ? .85 + (Math.floor(ms / 80) % 2) * .05 : 1
    for (let k = 0; k < 3; k++) {
      const c = { x: s.centro.x, y: s.centro.y - 6 + k * 6 }
      volta(ctx, c, 13 * aperta * solta, 4, 3.4, s.pele, limitar(enrola * 3 - k), false)
    }
    for (let k = 0; k < 3; k++) {
      const c = { x: s.centro.x, y: s.centro.y - 6 + k * 6 }
      volta(ctx, c, 13 * aperta * solta, 4, 3.4, s.pele, limitar(enrola * 3 - k), true)
    }
    if (ms > p.contato) aperto(ctx, s.centro, 1 - limitar((ms - p.contato) / p.fim), ms)
    const tc = janela(ms, s.contato, p.fim)
    if (tc !== null) choque(s, tc, 7)
  },

  /** "Things such as long bodies or tentacles are used to bind and squeeze the target." */
  bind(p, s) {
    const { ctx, ms, origem } = s.c
    // Tentáculos saem de quem ataca e AMARRAM o alvo em X.
    const vai = janela(ms, 0, p.contato + p.fim)
    if (vai === null) return
    const u = saida(limitar(ms / p.contato))
    const solta = 1 - limitar((ms - p.contato - p.fim * .6) / (p.fim * .4))
    for (const [dy, inclina] of [[-6, 1], [6, -1]] as const) {
      const fim = { x: s.centro.x + s.lado * 10 * inclina * (1 - u) + s.lado * 8, y: s.centro.y + dy }
      const pts = [origem, { x: (origem.x + s.centro.x) / 2, y: origem.y - 10 * inclina }, entrePontos(origem, fim, u)]
      if (solta > .05) corda(ctx, pts, 3 * solta, s.pele)
    }
    if (u > .9 && solta > .1) {
      // As duas cordas cruzam por cima do alvo: o X da amarração.
      corda(ctx, [{ x: s.centro.x - 9, y: s.centro.y - 8 }, { x: s.centro.x + 9, y: s.centro.y + 8 }], 2.6 * solta, s.pele)
      corda(ctx, [{ x: s.centro.x + 9, y: s.centro.y - 8 }, { x: s.centro.x - 9, y: s.centro.y + 8 }], 2.6 * solta, s.pele)
      aperto(ctx, s.centro, solta, ms)
    }
    const tc = janela(ms, s.contato, p.fim)
    if (tc !== null) choque(s, tc, 7)
  },

  /** "Attacked with long, creeping tentacles, vines, or the like. May lower the target's Speed." */
  constrict(p, s) {
    const { ctx, ms } = s.c
    // Gavinhas RASTEJAM do chão e sobem pelo corpo do alvo; a Speed cai (setas pra baixo).
    const chao = { x: s.c.alvo.x, y: s.c.alvo.y + 11 }
    const sobe = saida(limitar(ms / p.contato))
    const solta = 1 - limitar((ms - p.contato - p.fim * .5) / (p.fim * .5))
    if (solta > .05) for (let k = 0; k < 3; k++) {
      const x0 = chao.x + (k - 1) * 9, h = 24 * sobe
      const pts = Array.from({ length: 7 }, (_, i) => ({ x: x0 + Math.sin(i * 1.3 + k + ms / 90) * 3 * (i / 6), y: chao.y - (i / 6) * h }))
      corda(ctx, pts, 2.2 * solta, s.pele)
    }
    const tc = janela(ms, s.contato, p.fim)
    if (tc === null) return
    choque(s, tc, 7)
    setasDeStatus(ctx, s.c.alvo, tc, PELES.WATER.meio, 2, true)
  },

  /** "Powerfully wrings the target. The more HP the target has, the greater the power." */
  wring_out(p, s) {
    const { ctx, ms } = s.c
    // TORCER: duas mãos-faixa giram em sentidos opostos (como espremer um pano)
    // e gotas são espremidas pra fora.
    const t = janela(ms, 0, p.contato + p.fim * .7)
    if (t !== null) {
      const torce = ms / 70
      for (const [dy, sentido] of [[-7, 1], [7, -1]] as const) {
        ctx.save(); ctx.translate(s.centro.x, s.centro.y + dy); ctx.rotate(torce * sentido * .35)
        poligono(ctx, [[-14, -3.4], [14, -3.4], [14, 3.4], [-14, 3.4]], ESCURO)
        poligono(ctx, [[-12.6, -2], [12.6, -2], [12.6, 2], [-12.6, 2]], s.pele.base)
        poligono(ctx, [[-12.6, -2], [12.6, -2], [12.6, -.6], [-12.6, -.6]], s.pele.meio)
        ctx.restore()
      }
    }
    const tc = janela(ms, s.contato, p.fim)
    if (tc === null) return
    choque(s, tc, 9)
    for (let k = 0; k < Math.min(s.c.pedir(4 + s.c.tier), 6); k++) {
      const a = k * Math.PI / 3 + .3, v = 18 * saida(tc)
      bola(ctx, { x: s.centro.x + Math.cos(a) * v, y: s.centro.y + Math.sin(a) * v * .7 + 12 * tc * tc }, 1.8 * (1 - tc * .5), PELES.WATER)
    }
  },

  /** "Clamped and squeezed by the user's very thick and sturdy shell for four to five turns." */
  clamp(p, s) {
    const { ctx, ms } = s.c
    // Concha bivalve grossa: as duas valvas abrem atrás do alvo e FECHAM nele.
    const t = janela(ms, 0, p.contato + p.fim)
    if (t === null) return
    const abre = ms < p.contato ? 1 - entrada(limitar((ms - p.contato + 70) / 70)) : 0
    const solta = 1 - limitar((ms - p.contato - p.fim * .6) / (p.fim * .4))
    if (solta <= .05) return
    for (const cima of [-1, 1]) {
      const a = cima * (.15 + abre * .9)
      ctx.save(); ctx.translate(s.centro.x - s.lado * 12, s.centro.y); ctx.rotate(a * s.lado); ctx.scale(s.lado * solta, cima * solta)
      const valva = (g: number) => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(6, 15 + g, 26 + g, 3); ctx.lineTo(26 + g, 0); ctx.closePath() }
      valva(1.6); ctx.fillStyle = s.pele.contorno; ctx.fill()
      valva(0); ctx.fillStyle = s.pele.base; ctx.fill()
      ctx.strokeStyle = s.pele.meio; ctx.lineWidth = 1
      for (const k of [8, 14, 20]) { ctx.beginPath(); ctx.moveTo(2, 1); ctx.lineTo(k, 9 - k * .2); ctx.stroke() }
      ctx.fillStyle = BRANCO; ctx.fillRect(14, 1, 6, 1.4)
      ctx.restore()
    }
    if (ms > p.contato) aperto(ctx, s.centro, solta, ms)
    const tc = janela(ms, s.contato, p.fim)
    if (tc !== null) choque(s, tc, 7)
  },

  /** "The target is gripped and squeezed from both sides." */
  vice_grip(p, s) {
    const { ctx, ms } = s.c
    // Morsa: duas chapas planas chegam DOS DOIS LADOS e espremem, com a rosca girando.
    const t = janela(ms, 0, p.contato + p.fim * .7)
    if (t === null) return
    const fecha = saida(limitar(ms / p.contato))
    for (const lado of [-1, 1]) {
      const x = s.centro.x + lado * (24 - 12 * fecha)
      poligono(ctx, [[x - 3.4, s.centro.y - 12], [x + 3.4, s.centro.y - 12], [x + 3.4, s.centro.y + 12], [x - 3.4, s.centro.y + 12]], ESCURO)
      poligono(ctx, [[x - 2, s.centro.y - 10.6], [x + 2, s.centro.y - 10.6], [x + 2, s.centro.y + 10.6], [x - 2, s.centro.y + 10.6]], s.pele.meio)
      for (let k = -2; k <= 2; k++) poligono(ctx, [[x - lado * 2, s.centro.y + k * 4 - 1], [x - lado * 4.6, s.centro.y + k * 4], [x - lado * 2, s.centro.y + k * 4 + 1]], BRANCO)
      // Rosca girando atrás da chapa.
      const g = (ms / 40) % 2 < 1 ? 1.6 : -1.6
      poligono(ctx, [[x + lado * 3.4, s.centro.y - 1.6], [x + lado * 10, s.centro.y - 1.6 + g * .3], [x + lado * 10, s.centro.y + 1.6 + g * .3], [x + lado * 3.4, s.centro.y + 1.6]], s.pele.base)
    }
    const tc = janela(ms, s.contato, p.fim)
    if (tc !== null) { choque(s, tc, 8); aperto(ctx, s.centro, 1 - tc, ms) }
  },

  /** "The target is hammered with a large pincer. Critical hits land more easily." */
  crabhammer(p, s) {
    const { ctx, ms } = s.c
    // Pinça GIGANTE de caranguejo erguida no alto e martelando de cima.
    const t = janela(ms, 0, p.contato + 80)
    if (t !== null) {
      const sobe = ms < p.contato - 70 ? saida(ms / (p.contato - 70)) : 1 - entrada(limitar((ms - p.contato + 70) / 70))
      const q = { x: s.centro.x - s.lado * 4, y: s.centro.y - 8 - 22 * sobe }
      pincaGrande(ctx, q, s.lado, .95 + s.c.tier * .05, 0, s.pele, PELES.FIRE)
    }
    const tc = janela(ms, s.contato, p.fim)
    if (tc === null) return
    choque(s, tc, 12, { x: s.centro.x, y: s.centro.y - 4 })
    for (let k = 0; k < Math.min(s.c.pedir(5 + s.c.tier), 8); k++) {
      const a = -Math.PI / 2 + (k / 7 - .5) * 2.6, v = 16 + (k % 3) * 5
      bola(ctx, { x: s.centro.x + Math.cos(a) * v * tc, y: s.centro.y + Math.sin(a) * v * tc + 30 * tc * tc }, 2.2 * (1 - limitar((tc - .6) / .4)), s.pele)
    }
    if (tc < .4) brilho(ctx, s.centro.x + 10, s.centro.y - 14, 3.4 * (1 - tc / .4), BRANCO)
  },

}

/** Pinça de caranguejo grande: palma oval e dois dedos curvos em "C", abertura pra baixo. */
function pincaGrande(ctx: CanvasRenderingContext2D, p: Ponto, lado: number, s: number, abre: number, pele: Pele, casca: Pele): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(lado * s, s)
  const dedo = (g: number, ladoDedo: number) => {
    ctx.beginPath(); ctx.moveTo(ladoDedo * (3 - g), 0)
    ctx.quadraticCurveTo(ladoDedo * (13 + g), 4, ladoDedo * (4 + abre), 15 + g)
    ctx.quadraticCurveTo(ladoDedo * (7 + g * .5), 6, ladoDedo * (-1 - g), 2); ctx.closePath()
  }
  for (const [g, cor] of [[1.4, ESCURO], [0, casca.base]] as const) {
    dedo(g, 1); ctx.fillStyle = cor; ctx.fill()
    dedo(g, -1); ctx.fillStyle = cor; ctx.fill()
    ctx.beginPath(); ctx.ellipse(0, -5, 9 + g, 7 + g, 0, 0, Math.PI * 2); ctx.fillStyle = cor; ctx.fill()
  }
  ctx.beginPath(); ctx.ellipse(-2, -7, 5, 3.4, 0, 0, Math.PI * 2); ctx.fillStyle = casca.meio; ctx.fill()
  ctx.fillStyle = BRANCO; ctx.fillRect(-4, -9, 2.4, 1.6)
  void pele
  ctx.restore()
}

export const APERTOS_POR_GOLPE = montarFamilia(PERFIS_DE_APERTO, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim,
  contato: p => p.contato,
  alcance: 54,
  pele: id => {
    const base = PELES[getAbility(id)?.type ?? 'NORMAL']
    if (id === 'crabhammer') return comAcento(base, PELES.FIRE.base, PELES.FIRE.meio)
    if (id === 'wring_out') return comAcento(base, PELES.WATER.base, PELES.WATER.meio, PELES.WATER.contorno)
    if (id === 'constrict') return comAcento(base, PELES.WATER.meio)
    return undefined
  },
})
