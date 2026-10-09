// Família Truque sombrio (09/10): oito golpes de malandragem, cada um a partir
// da descrição do jogo (frase no comentário). Vários falam do ITEM que o alvo
// segura; no jogo não há item, então o efeito mostra a ideia (uma bolsinha
// roubada, derrubada) sem prometer mecânica.
import { estrelaDeImpacto, crescente, entrada, limitar, riscos, saida } from '../primitivas'
import { PELES } from '../paletas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, bola, comAcento, entrePontos, janela, montarFamilia, poligono, rastro, setasDeStatus } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_TRUQUE: Record<string, Perfil> = {
  covet: { contato: 230, fim: 320 },
  thief: { contato: 150, fim: 320 },
  knock_off: { contato: 140, fim: 320 },
  punishment: { contato: 230, fim: 260 },
  payback: { contato: 260, fim: 280 },
  assurance: { contato: 220, fim: 300 },
  foul_play: { contato: 280, fim: 260 },
}

const VERMELHO = '#e0405a', ROSA = '#ff6f9e', BOLSA = ['#c8873a', '#f0c070'] as const

interface Cena { c: ContextoVfx; pele: Pele; semente: number; ux: number; uy: number; contato: number }

function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy) || 1
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), ux: dx / L, uy: dy / L, contato: p.contato }
}

function choque(s: Cena, t: number, tamanho: number, ponto = s.c.alvo): void {
  const rng = rngSemeado(s.semente + 50)
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier * 1.2, t, s.pele, rng)
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 16 + s.c.tier * 3, t, s.pele.meio, rng)
}

/** Bolsinha amarrada (o "item segurado"). */
function bolsa(ctx: CanvasRenderingContext2D, p: Ponto, s = 1, giro = 0): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(giro); ctx.scale(s, s)
  ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(0, 1.4, 5.4, 4.8, 0, 0, Math.PI * 2); ctx.fill()
  poligono(ctx, [[-2.6, -3.6], [2.6, -3.6], [3.6, -6.6], [-3.6, -6.6]], ESCURO)
  ctx.fillStyle = BOLSA[0]; ctx.beginPath(); ctx.ellipse(0, 1.4, 4.2, 3.6, 0, 0, Math.PI * 2); ctx.fill()
  poligono(ctx, [[-1.8, -3], [1.8, -3], [2.6, -5.6], [-2.6, -5.6]], BOLSA[0])
  ctx.fillStyle = BOLSA[1]; ctx.fillRect(-2.4, -.6, 2, 2)
  ctx.fillStyle = BRANCO; ctx.fillRect(-2.6, -3.6, 5.2, 1.2)
  ctx.restore()
}

function coracao(ctx: CanvasRenderingContext2D, p: Ponto, s: number): void {
  if (s < .2) return
  const px = [[1,0],[2,0],[4,0],[5,0],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[1,3],[2,3],[3,3],[4,3],[5,3],[2,4],[3,4],[4,4],[3,5]]
  ctx.fillStyle = ESCURO
  for (const [i, j] of px) ctx.fillRect(p.x + (i - 3.5) * s - s * .35, p.y + (j - 3) * s - s * .35, s * 1.7, s * 1.7)
  ctx.fillStyle = ROSA
  for (const [i, j] of px) ctx.fillRect(p.x + (i - 3.5) * s, p.y + (j - 3) * s, s, s)
}

/** Mão de sombra com dedos em garra, apontando pra `angulo`. */
function maoEscura(ctx: CanvasRenderingContext2D, p: Ponto, angulo: number, s: number, fecha: number, pele: Pele): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angulo); ctx.scale(s, s)
  ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(-2, 0, 7, 6, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = pele.base; ctx.beginPath(); ctx.ellipse(-2, 0, 5.6, 4.6, 0, 0, Math.PI * 2); ctx.fill()
  for (const k of [-1, 0, 1]) {
    const a = k * (.5 - fecha * .35)
    poligono(ctx, [[3, k * 2.6 - 1.2], [3 + Math.cos(a) * 9, k * 2.6 + Math.sin(a) * 9 - .6], [3 + Math.cos(a) * 9 - 2, k * 2.6 + Math.sin(a) * 9 + 1.6], [3, k * 2.6 + 1.2]], VERMELHO)
  }
  ctx.restore()
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "Endearingly approaches the target, then steals the target's held item." */
  covet(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Chega toda fofa (corações flutuando até o alvo)...
    const chega = janela(ms, 0, p.contato)
    if (chega !== null) for (let k = 0; k < 3; k++) {
      const u = limitar(chega * 1.3 - k * .15)
      if (u <= 0) continue
      const q = entrePontos({ x: origem.x, y: origem.y - 10 }, { x: alvo.x - s.ux * 6, y: alvo.y - 14 }, saida(u))
      coracao(ctx, { x: q.x, y: q.y + Math.sin(ms / 70 + k) * 2 }, .8 * (1 - entrada(limitar((u - .8) / .2))))
    }
    const t = janela(ms, s.contato, 220)
    if (t !== null) choque(s, t, 8)
    // ...e leva a bolsinha embora num arco.
    const leva = janela(ms, s.contato + 20, p.fim - 20)
    if (leva !== null) {
      const q = entrePontos({ x: alvo.x, y: alvo.y - 6 }, { x: origem.x, y: origem.y - 8 }, saida(leva))
      q.y -= Math.sin(leva * Math.PI) * 12
      bolsa(ctx, q, 1, leva * 2)
    }
  },

  /** "Attacks and steals the target's held item simultaneously." */
  thief(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Mão de sombra dispara, AGARRA a bolsinha no mesmo golpe e puxa de volta rápido.
    const vai = janela(ms, 30, p.contato - 30)
    if (vai !== null) {
      const q = entrePontos(origem, { x: alvo.x - s.ux * 6, y: alvo.y - 4 }, saida(vai))
      rastro(ctx, origem, q, s.c.pedir(2 + s.c.tier), 4, s.pele, rngSemeado(s.semente + 1))
      maoEscura(ctx, q, Math.atan2(s.uy, s.ux), .9, 0, s.pele)
    }
    const t = janela(ms, s.contato, 220)
    if (t !== null) choque(s, t, 8)
    const volta = janela(ms, s.contato, p.fim - 60)
    if (volta !== null) {
      const q = entrePontos({ x: alvo.x - s.ux * 6, y: alvo.y - 4 }, origem, entrada(volta))
      maoEscura(ctx, q, Math.atan2(s.uy, s.ux), .9, 1, s.pele)
      bolsa(ctx, { x: q.x + s.ux * 6, y: q.y }, .9)
    }
  },

  /** "Slaps down the target's held item; more damage if the target has a held item." */
  knock_off(p, s) {
    const { ctx, ms, alvo } = s.c
    // Tapa de cima pra baixo: a bolsinha sai voando do alvo, quica no chão e some.
    const tapa = janela(ms, p.contato - 90, 120)
    if (tapa !== null) {
      const a = -1.6 + 1.7 * saida(tapa)
      crescente(ctx, { x: alvo.x - s.ux * 4, y: alvo.y - 4 }, 16, a - .7, a, 4.4, tapa, 0, s.pele, 1)
    }
    const t = janela(ms, s.contato, 220)
    if (t !== null) choque(s, t, 9)
    const cai = janela(ms, s.contato, p.fim)
    if (cai !== null) {
      const x = alvo.x + s.ux * 26 * cai, chao = alvo.y + 9
      const y = cai < .55 ? alvo.y - 6 + (chao - alvo.y + 6) * entrada(cai / .55) : chao - Math.sin((cai - .55) / .45 * Math.PI) * 6
      bolsa(ctx, { x, y }, 1 - entrada(limitar((cai - .8) / .2)), cai * 8)
    }
  },

  /** "The more the target has powered up with stat changes, the greater the move's power." */
  punishment(p, s) {
    const { ctx, ms, alvo } = s.c
    // As setas de aumento do alvo aparecem — e um X escuro as CASTIGA e quebra.
    const mostra = janela(ms, 0, p.contato + 40)
    if (mostra !== null) setasDeStatus(ctx, alvo, mostra, VERMELHO, 3)
    const corta = janela(ms, p.contato - 60, 160)
    if (corta !== null) for (const d of [1, -1]) {
      const a = Math.PI / 4 * d
      crescente(ctx, { x: alvo.x - Math.cos(a + Math.PI / 2) * 30, y: alvo.y - 6 - Math.sin(a + Math.PI / 2) * 30 }, 30, a + Math.PI / 2 - .5, a + Math.PI / 2 + .5, 4, corta, 0, s.pele, 1)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 10)
    // Setas partidas caindo.
    for (let k = 0; k < 3; k++) {
      const x = alvo.x + (k - 1) * 9, y = alvo.y - 10 + 22 * t * t
      poligono(ctx, [[x - 2, y], [x + 1, y - 3], [x + 2, y + 1]], VERMELHO)
    }
  },

  /** "Stores power, then attacks. If the user moves after the target, power doubles." */
  payback(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Guarda força: bolinhas escuras se juntam em quem ataca (encolhendo pra dentro);
    // depois solta tudo numa onda escura de revide.
    const junta = janela(ms, 0, p.contato - 80)
    if (junta !== null) for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + junta * 2, d = 22 * (1 - saida(junta))
      bola(ctx, { x: origem.x + Math.cos(a) * d, y: origem.y - 2 + Math.sin(a) * d * .7 }, 2.4, s.pele, s.pele.base, VERMELHO)
    }
    const solta = janela(ms, p.contato - 80, 120)
    if (solta !== null) {
      const q = entrePontos(origem, alvo, saida(solta))
      crescente(ctx, q, 12, Math.atan2(s.uy, s.ux) - 1.2, Math.atan2(s.uy, s.ux) + 1.2, 5, .55, 0, { ...s.pele, meio: s.pele.base, nucleo: VERMELHO }, 1)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 11)
  },

  /** "If the target has already taken some damage in the same turn, power doubles." */
  assurance(p, s) {
    const { ctx, ms, alvo } = s.c
    // Marca a FERIDA: um X vermelho já no alvo; o golpe acerta em cima dela duas vezes.
    const marca = janela(ms, 0, p.contato + 200)
    if (marca !== null) {
      const k = saida(limitar(marca / .2)) * (1 - limitar((marca - .8) / .2))
      for (const d of [1, -1]) poligono(ctx, [[alvo.x - 6 * k, alvo.y - 3 - 6 * k * d], [alvo.x - 5 * k, alvo.y - 3 - 7 * k * d], [alvo.x + 6 * k, alvo.y - 3 + 6 * k * d], [alvo.x + 5 * k, alvo.y - 3 + 7 * k * d]], VERMELHO)
    }
    for (const [k, atraso] of [[0, 0], [1, 90]] as const) {
      const golpe = janela(ms, p.contato - 60 + atraso, 70)
      if (golpe !== null) rastro(ctx, s.c.origem, entrePontos(s.c.origem, alvo, saida(golpe)), s.c.pedir(2), 4, s.pele, rngSemeado(s.semente + 1 + k))
      const t = janela(ms, s.contato + atraso, p.fim - atraso)
      if (t !== null) choque(s, t, 8 + k * 3, { x: alvo.x, y: alvo.y - 3 })
    }
  },

  /** "Turns the target's power against it. The higher the target's Attack, the greater the power." */
  foul_play(p, s) {
    const { ctx, ms, alvo } = s.c
    // A força do PRÓPRIO alvo (aura vermelha) é arrancada dele, sobe num arco e
    // cai de volta em cima dele.
    const arranca = janela(ms, 0, 140)
    if (arranca !== null) for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3, d = 12 + 4 * arranca
      bola(ctx, { x: alvo.x + Math.cos(a) * d * (1 - arranca), y: alvo.y - 3 + Math.sin(a) * d * .7 * (1 - arranca) - 10 * arranca }, 2.2, s.pele, VERMELHO, '#ff9a9a')
    }
    const arco = janela(ms, 140, p.contato - 140)
    if (arco !== null) {
      const ang = -Math.PI / 2 + (arco - .5) * 2.4
      const q = { x: alvo.x + Math.cos(ang) * 18 * Math.sin(arco * Math.PI), y: alvo.y - 13 - Math.sin(arco * Math.PI) * 18 + arco * 10 }
      bola(ctx, q, 4.6 + arco * 2, s.pele, VERMELHO, '#ff9a9a')
      rastro(ctx, { x: alvo.x, y: alvo.y - 13 }, q, s.c.pedir(2), 3, s.pele, rngSemeado(s.semente + 1), .7)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 11, { x: alvo.x, y: alvo.y - 4 })
  },
}

export const TRUQUES_POR_GOLPE = montarFamilia(PERFIS_DE_TRUQUE, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim,
  contato: p => p.contato,
  alcance: 52,
  pele: id => comAcento(PELES[id === 'covet' ? 'NORMAL' : 'DARK'], VERMELHO, ROSA, '#ff9a9a', ...BOLSA),
})
