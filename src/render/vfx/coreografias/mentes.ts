// Família Força mental (09/10): nove golpes a partir da descrição do jogo
// (frase no comentário). Confusion, Psybeam, Psychic, Psystrike e
// Synchronoise são golpes-vitrine do tipo.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { crescente, entrada, estilhacos, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, bola, brilho, comAcento, entrePontos, janela, montarFamilia, poligono, setasDeStatus } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_MENTE: Record<string, Perfil> = {
  extrasensory: { contato: 260, fim: 320 },
  psyshock: { contato: 260, fim: 320 },
  psywave: { contato: 280, fim: 260 },
  psycho_boost: { contato: 340, fim: 360 },
  future_sight: { contato: 420, fim: 300 },
  stored_power: { contato: 300, fim: 280 },
  heart_stamp: { contato: 260, fim: 300 },
  mirror_coat: { contato: 300, fim: 280 },
  doom_desire: { contato: 440, fim: 320 },
}

const AZUL = '#58a6f0', ROSA = '#ff6f9e', AMARELO = '#ffd23a', ARCO_IRIS = ['#e0303a', '#ff9a3a', '#ffd23a', '#5cd65c', '#58a6f0']

interface Cena { c: ContextoVfx; pele: Pele; semente: number; ux: number; uy: number; contato: number; centro: Ponto }
function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy) || 1
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), ux: dx / L, uy: dy / L, contato: p.contato, centro: { x: c.alvo.x, y: c.alvo.y - 3 } }
}
function choque(s: Cena, t: number, tamanho: number, ponto = s.centro): void {
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier * 1.2, t, s.pele, rngSemeado(s.semente + 50))
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 16 + s.c.tier * 3, t, s.pele.meio, rngSemeado(s.semente + 51))
}

function olho(ctx: CanvasRenderingContext2D, p: Ponto, larg: number, abre: number, pele: Pele): void {
  if (abre <= .05) return
  const h = larg * .45 * abre
  ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.moveTo(p.x - larg - 1.4, p.y); ctx.quadraticCurveTo(p.x, p.y - h - 2, p.x + larg + 1.4, p.y); ctx.quadraticCurveTo(p.x, p.y + h + 2, p.x - larg - 1.4, p.y); ctx.fill()
  ctx.fillStyle = BRANCO; ctx.beginPath(); ctx.moveTo(p.x - larg, p.y); ctx.quadraticCurveTo(p.x, p.y - h, p.x + larg, p.y); ctx.quadraticCurveTo(p.x, p.y + h, p.x - larg, p.y); ctx.fill()
  ctx.fillStyle = pele.base; ctx.beginPath(); ctx.arc(p.x, p.y, Math.min(h, larg * .4), 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(p.x, p.y, Math.min(h, larg * .4) * .45, 0, Math.PI * 2); ctx.fill()
}

function coracaoGrande(ctx: CanvasRenderingContext2D, p: Ponto, r: number, cor: string): void {
  if (r < .5) return
  const forma = (R: number) => { ctx.beginPath(); ctx.moveTo(p.x, p.y + R); ctx.bezierCurveTo(p.x - R * 1.6, p.y - R * .2, p.x - R * .8, p.y - R * 1.4, p.x, p.y - R * .5); ctx.bezierCurveTo(p.x + R * .8, p.y - R * 1.4, p.x + R * 1.6, p.y - R * .2, p.x, p.y + R); ctx.fill() }
  ctx.fillStyle = ESCURO; forma(r + 1.4); ctx.fillStyle = cor; forma(r); ctx.fillStyle = BRANCO; ctx.fillRect(p.x - r * .7, p.y - r * .6, r * .3, r * .3)
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "Attacks with an odd, unseeable power. May make the target flinch." */
  extrasensory(p, s) {
    const { ctx, ms } = s.c
    // Poder invisível: um OLHO gigante se abre acima do alvo e o encara; o ar
    // em volta dele ondula (anéis tortos); o alvo se encolhe.
    const abre = janela(ms, 0, p.contato + p.fim * .5)
    if (abre !== null) {
      const k = saida(limitar(ms / 160)) * (1 - entrada(limitar((ms - p.contato) / (p.fim * .5))))
      olho(ctx, { x: s.centro.x, y: s.centro.y - 20 }, 12, k, s.pele)
      for (let i = 0; i < 2; i++) {
        const u = (ms / 300 + i * .5) % 1
        crescente(ctx, s.centro, 6 + u * 14, u * 3, u * 3 + 4.4, 1.6 * (1 - u) + .4, .5, 0, s.pele, .7)
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 10)
  },

  /** "Materializes an odd psychic wave to attack the target. This attack does physical damage." */
  psyshock(p, s) {
    const { ctx, ms } = s.c
    // A onda psíquica VIRA MATÉRIA: blocos sólidos rosados (cristais) surgem em
    // volta do alvo e se chocam contra ele.
    const n = 5
    for (let k = 0; k < n; k++) {
      const a = k * Math.PI * 2 / n + .3, surge = saida(limitar((ms - k * 30) / 120))
      const fecha = entrada(limitar((ms - p.contato + 80) / 80))
      if (ms > p.contato + 20 || surge <= 0) continue
      const d = 22 * (1 - fecha)
      const q = { x: s.centro.x + Math.cos(a) * d, y: s.centro.y + Math.sin(a) * d * .8 }
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(a + ms / 200); ctx.scale(surge, surge)
      poligono(ctx, [[0, -6.4], [4.4, 0], [0, 6.4], [-4.4, 0]], ESCURO)
      poligono(ctx, [[0, -5], [3.2, 0], [0, 5], [-3.2, 0]], s.pele.meio)
      poligono(ctx, [[0, -5], [3.2, 0], [0, 0]], s.pele.nucleo)
      ctx.restore()
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 12)
    estilhacos(ctx, s.centro, s.c.pedir(5), 22, t, s.pele, rngSemeado(s.semente + 2))
  },

  /** "Attacked with an odd psychic wave. The attack varies in intensity." */
  psywave(p, s) {
    const { ctx, ms, origem } = s.c
    // Onda psíquica senoidal cuja AMPLITUDE muda o tempo todo (intensidade variável).
    const u = janela(ms, 0, p.contato + 60)
    if (u !== null) {
      const fim = saida(limitar(ms / p.contato))
      const pts: Ponto[] = []
      for (let i = 0; i <= 24; i++) {
        const v = (i / 24) * fim, base = entrePontos({ x: origem.x + s.ux * 8, y: origem.y - 4 }, s.centro, v)
        const amp = (3 + 5 * Math.abs(Math.sin(ms / 70 + i * .3))) * Math.sin(v * 30 - ms / 25)
        pts.push({ x: base.x - s.uy * amp, y: base.y + s.ux * amp })
      }
      for (const [w, c] of [[4, ESCURO], [2.2, s.pele.meio], [.8, BRANCO]] as const) {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke()
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 6 + (Math.floor(s.semente % 3) * 3))
  },

  /** "Attacks at full power. The recoil harshly lowers the user's Sp. Atk." */
  psycho_boost(p, s) {
    const { ctx, ms, origem } = s.c
    // Força total: uma esfera psíquica ENORME se forma acima de quem ataca,
    // desce sobre o alvo; depois duas setas azuis caem em quem usou.
    const forma = janela(ms, 0, p.contato)
    if (forma !== null) {
      const cresce = saida(limitar(ms / 200)), desce = entrada(limitar((ms - 200) / (p.contato - 200)))
      const q = entrePontos({ x: origem.x, y: origem.y - 30 }, s.centro, desce)
      const r = 4 + 10 * cresce
      bola(ctx, q, r, s.pele, s.pele.base, s.pele.meio)
      crescente(ctx, q, r + 4, ms / 40, ms / 40 + 2.4, 2, .5, 0, { ...s.pele, meio: s.pele.nucleo }, 1)
      crescente(ctx, q, r + 4, ms / 40 + Math.PI, ms / 40 + Math.PI + 2.4, 2, .5, 0, { ...s.pele, meio: s.pele.nucleo }, 1)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 16)
    estilhacos(ctx, s.centro, s.c.pedir(6), 28, t, s.pele, rngSemeado(s.semente + 2))
    if (t > .3) setasDeStatus(ctx, origem, (t - .3) / .7, AZUL, 2, true)
  },

  /** "Two turns after this move is used, a hunk of psychic energy attacks the target." */
  future_sight(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Visão do futuro: um olho se abre em quem ataca e uma esfera sobe e SOME
    // no céu... silêncio... e ela cai do alto sobre o alvo.
    const ve = janela(ms, 0, 160)
    if (ve !== null) olho(ctx, { x: origem.x, y: origem.y - 18 }, 7, Math.sin(ve * Math.PI), s.pele)
    const sobe = janela(ms, 60, 160)
    if (sobe !== null) bola(ctx, { x: origem.x, y: origem.y - 18 - 40 * entrada(sobe) }, 5 * (1 - sobe * .5), s.pele, s.pele.meio, s.pele.nucleo)
    const cai = janela(ms, p.contato - 100, 100)
    if (cai !== null) {
      const q = { x: alvo.x, y: alvo.y - 50 + 47 * entrada(cai) }
      bola(ctx, q, 8, s.pele, s.pele.meio, s.pele.nucleo)
      for (let k = 0; k < 3; k++) poligono(ctx, [[q.x + (k - 1) * 4 - .6, q.y - 8], [q.x + (k - 1) * 4 + .6, q.y - 8], [q.x + (k - 1) * 4 + .6, q.y - 22], [q.x + (k - 1) * 4 - .6, q.y - 22]], s.pele.nucleo)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 14)
    for (let k = 0; k < 2; k++) {
      const u = limitar((t - k * .15) / .8)
      if (u > 0 && u < 1) crescente(ctx, s.centro, 6 + u * 16, -Math.PI, Math.PI, 2.4 * (1 - u) + .4, .5, 0, s.pele, .7)
    }
  },

  /** "Attacks with stored power. The more the user's stats are raised, the greater the power." */
  stored_power(p, s) {
    const { ctx, ms, origem } = s.c
    // As setas de aumento de status de quem ataca se juntam numa esfera e ela
    // é disparada (mais setas = mais força).
    const junta = janela(ms, 0, 200)
    if (junta !== null) ARCO_IRIS.forEach((cor, k) => {
      const a = k * Math.PI * 2 / 5, d = 16 * (1 - saida(junta))
      setasDeStatus(ctx, { x: origem.x + Math.cos(a) * d, y: origem.y - 10 + Math.sin(a) * d * .7 - 8 }, .3, cor, 1)
    })
    const u = janela(ms, 180, p.contato - 180)
    const forma = janela(ms, 140, 60)
    const q = forma !== null ? { x: origem.x, y: origem.y - 10 } : u !== null ? entrePontos({ x: origem.x, y: origem.y - 10 }, s.centro, saida(u)) : null
    if (q) { bola(ctx, q, 6, s.pele, s.pele.meio, s.pele.nucleo); ARCO_IRIS.forEach((cor, k) => brilho(ctx, q.x + Math.cos(k * 1.26 + ms / 60) * 9, q.y + Math.sin(k * 1.26 + ms / 60) * 9, 1.6, cor)) }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 11)
  },

  /** "Unleashes a vicious blow after its cute act makes the target less wary. May flinch." */
  heart_stamp(p, s) {
    const { ctx, ms } = s.c
    // Fofura: corações pequenos boiando pro alvo (ele relaxa)... e um CORAÇÃO
    // gigante cai como carimbo em cima dele.
    for (let k = 0; k < 3; k++) {
      const u = janela(ms, k * 40, p.contato - 100)
      if (u === null) continue
      const q = entrePontos({ x: s.c.origem.x, y: s.c.origem.y - 12 }, { x: s.centro.x, y: s.centro.y - 12 }, saida(u))
      coracaoGrande(ctx, { x: q.x, y: q.y + Math.sin(ms / 70 + k) * 2 }, 3, ROSA)
    }
    const carimba = janela(ms, p.contato - 80, 80)
    if (carimba !== null) coracaoGrande(ctx, { x: s.centro.x, y: s.centro.y - 30 + 28 * entrada(carimba) }, 9, ROSA)
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    coracaoGrande(ctx, s.centro, 10 * (1 - entrada(limitar((t - .4) / .6))), ROSA)
    choque(s, t, 9)
  },

  /** "A retaliation move that counters any special attack, inflicting double the damage taken." */
  mirror_coat(p, s) {
    const { ctx, ms, origem } = s.c
    // Espelho: uma lâmina espelhada brilha na frente de quem ataca, um raio
    // fraco vindo do alvo bate nela e VOLTA em dobro, em cores de arco-íris.
    const espelho = janela(ms, 0, p.contato)
    const m = { x: origem.x + s.ux * 12, y: origem.y - 4 }
    if (espelho !== null) {
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(Math.atan2(s.uy, s.ux))
      poligono(ctx, [[-2.4, -12], [2.4, -12], [2.4, 12], [-2.4, 12]], ESCURO)
      poligono(ctx, [[-1.2, -10.6], [1.2, -10.6], [1.2, 10.6], [-1.2, 10.6]], AZUL)
      const b = ((ms / 120) % 1) * 20 - 10
      poligono(ctx, [[-1.2, b - 2], [1.2, b - 4], [1.2, b], [-1.2, b + 2]], BRANCO)
      ctx.restore()
    }
    const vem = janela(ms, 40, 120)
    if (vem !== null) {
      const q = entrePontos(s.centro, m, saida(vem))
      ctx.strokeStyle = s.pele.meio; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(s.centro.x, s.centro.y); ctx.lineTo(q.x, q.y); ctx.stroke()
    }
    const volta = janela(ms, 180, p.contato - 180 + 80)
    if (volta !== null) {
      const fim = entrePontos(m, s.centro, saida(limitar(volta * 1.4)))
      const w = 5 * (1 - entrada(limitar((volta - .6) / .4)))
      ARCO_IRIS.forEach((cor, k) => {
        const off = (k - 2) * w * .5
        ctx.strokeStyle = cor; ctx.lineWidth = Math.max(.6, w * .5)
        ctx.beginPath(); ctx.moveTo(m.x - s.uy * off, m.y + s.ux * off); ctx.lineTo(fim.x - s.uy * off, fim.y + s.ux * off); ctx.stroke()
      })
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 13)
  },

  /** "Two turns after this move is used, a concentrated bundle of light blasts the target." */
  doom_desire(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Desejo: uma estrela de luz sobe de quem ataca e some (o desejo foi feito)...
    // depois vários FEIXES de luz caem do céu e convergem no alvo.
    const sobe = janela(ms, 0, 200)
    if (sobe !== null) brilho(ctx, origem.x, origem.y - 14 - 40 * entrada(sobe), 5 * (1 - sobe * .4), AMARELO)
    const cai = janela(ms, p.contato - 120, 160)
    if (cai !== null) for (let k = 0; k < 5; k++) {
      const x0 = alvo.x + (k - 2) * 14, desce = saida(limitar(cai * 1.5 - k * .08))
      const fim = { x: alvo.x + (x0 - alvo.x) * (1 - desce), y: alvo.y - 50 + 47 * desce }
      ctx.strokeStyle = ESCURO; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(x0, alvo.y - 54); ctx.lineTo(fim.x, fim.y); ctx.stroke()
      ctx.strokeStyle = k % 2 ? BRANCO : AMARELO; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x0, alvo.y - 54); ctx.lineTo(fim.x, fim.y); ctx.stroke()
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 15)
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, d = 18 * saida(t); brilho(ctx, s.centro.x + Math.cos(a) * d, s.centro.y + Math.sin(a) * d * .8, 2.6 * (1 - t), AMARELO) }
  },
}

export const MENTES_POR_GOLPE = montarFamilia(PERFIS_DE_MENTE, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 58,
  margem: () => ({ cima: 82, baixo: 58, lados: 58 }),
  pele: id => comAcento(PELES[getAbility(id)?.type ?? 'PSYCHIC'], AZUL, ROSA, AMARELO, ...ARCO_IRIS),
})
