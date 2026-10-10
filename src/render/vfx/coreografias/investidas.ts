// Família Investida (09/10, refeita golpe a golpe pela descrição): dezoito
// golpes em que o CORPO é a arma. O VFX não move o sprite de quem ataca, então
// cada golpe mostra o corpo do jeito que a descrição pede — vulto que se
// choca, imagens residuais de velocidade, peso que despenca, os quatro golpes
// do Last Resort, o aliado caído do Retaliate, o status do Facade... A frase
// do jogo vai no comentário de cada golpe.
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { crescente, entrada, estilhacos, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import {
  BRANCO, ESCURO, bola, brilho, comAcento, entrePontos, estatica, janela, montarFamilia, nuvem,
  ondaDeChoque, poligono, rastro, setasDeStatus,
} from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_INVESTIDA: Record<string, Perfil> = {
  tackle: { contato: 180, fim: 260 },
  quick_attack: { contato: 80, fim: 260 },
  extreme_speed: { contato: 120, fim: 360 },
  take_down: { contato: 230, fim: 300 },
  double_edge: { contato: 260, fim: 340 },
  body_slam: { contato: 260, fim: 320 },
  giga_impact: { contato: 340, fim: 420 },
  high_horsepower: { contato: 250, fim: 300 },
  last_resort: { contato: 380, fim: 300 },
  retaliate: { contato: 280, fim: 300 },
  chip_away: { contato: 160, fim: 420 },
  facade: { contato: 260, fim: 300 },
  return: { contato: 260, fim: 340 },
  frustration: { contato: 240, fim: 340 },
  strength: { contato: 300, fim: 300 },
  heavy_slam: { contato: 280, fim: 340 },
  u_turn: { contato: 160, fim: 380 },
  acrobatics: { contato: 260, fim: 280 },
}

const VERMELHO = '#e0303a', ROSA = '#ff6f9e', AMARELO = '#ffd23a', AZUL = '#58a6f0', LARANJA = '#ff9a3a'
const CORES_DOS_GOLPES = ['#e0303a', '#58a6f0', '#5cd65c', '#ffd23a'] as const

interface Cena { c: ContextoVfx; pele: Pele; semente: number; ux: number; uy: number; angulo: number; contato: number; centro: Ponto; saida: Ponto; chegada: Ponto }
function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy) || 1
  const ux = dx / L, uy = dy / L
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), ux, uy, angulo: Math.atan2(uy, ux), contato: p.contato,
    centro: { x: c.alvo.x, y: c.alvo.y - 3 }, saida: { x: c.origem.x + ux * 4, y: c.origem.y - 2 }, chegada: { x: c.alvo.x - ux * 11, y: c.alvo.y - uy * 11 - 3 } }
}
function choque(s: Cena, t: number, tamanho: number, ponto = s.centro): void {
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier * 1.2, t, s.pele, rngSemeado(s.semente + 50))
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 18 + s.c.tier * 3, t, s.pele.meio, rngSemeado(s.semente + 51))
}

/**
 * Vulto do corpo de quem investe: massa oval que estica na direção do
 * movimento (`estica` 0..1) — é o corpo inteiro batendo, não um projétil.
 */
function vulto(ctx: CanvasRenderingContext2D, p: Ponto, angulo: number, r: number, estica: number, pele: Pele, cor = pele.base, soContorno = false): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angulo); ctx.scale(1 + estica * .6, 1 - estica * .25)
  if (soContorno) {
    ctx.strokeStyle = ESCURO; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(0, 0, r, r * .85, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = pele.meio; ctx.lineWidth = 1; ctx.stroke()
  } else {
    ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(0, 0, r + 1.4, r * .85 + 1.4, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = cor; ctx.beginPath(); ctx.ellipse(0, 0, r, r * .85, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = pele.meio; ctx.beginPath(); ctx.ellipse(r * .2, -r * .25, r * .55, r * .35, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = BRANCO; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 0, r * .9, -.7, .7); ctx.stroke()
  }
  ctx.restore()
}

/** Investida em linha reta com vulto + imagens residuais; devolve a posição. */
function carga(s: Cena, ms: number, ini: number, dura: number, r: number, residuos: number, cor?: string): Ponto | null {
  const u = janela(ms, ini, dura)
  if (u === null) return null
  const v = entrada(u) * .35 + saida(u) * .65
  const q = entrePontos(s.saida, s.chegada, v)
  for (let k = residuos; k >= 1; k--) vulto(s.c.ctx, entrePontos(s.saida, s.chegada, Math.max(0, v - k * .12)), s.angulo, r * (1 - k * .08), .3, s.pele, undefined, true)
  rastro(s.c.ctx, s.saida, q, s.c.pedir(2 + s.c.tier), r * .6, s.pele, rngSemeado(s.semente + 1), .8)
  vulto(s.c.ctx, q, s.angulo, r, u, s.pele, cor)
  return q
}

function recuo(s: Cena, t: number, tamanho: number): void {
  const tr = (t - .12) / .7
  if (tr > 0 && tr < 1) estrelaDeImpacto(s.c.ctx, { x: s.c.origem.x, y: s.c.origem.y - 3 }, tamanho, tr, s.pele, rngSemeado(s.semente + 80))
}

function coracao(ctx: CanvasRenderingContext2D, p: Ponto, s: number, cor: string): void {
  if (s < .2) return
  const px = [[1,0],[2,0],[4,0],[5,0],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[1,3],[2,3],[3,3],[4,3],[5,3],[2,4],[3,4],[4,4],[3,5]]
  ctx.fillStyle = ESCURO
  for (const [i, j] of px) ctx.fillRect(p.x + (i - 3.5) * s - s * .35, p.y + (j - 3) * s - s * .35, s * 1.7, s * 1.7)
  ctx.fillStyle = cor
  for (const [i, j] of px) ctx.fillRect(p.x + (i - 3.5) * s, p.y + (j - 3) * s, s, s)
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "A physical attack in which the user charges and slams into the target with its whole body." */
  tackle(p, s) {
    // Corpo inteiro: o vulto avança, achata no contato e o alvo é empurrado.
    carga(s, s.c.ms, 40, p.contato - 40, 8, 1)
    const t = janela(s.c.ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 9)
    ondaDeChoque(s.c.ctx, s.c.alvo, s.angulo, t, 13, 1, s.pele)
  },

  /** "Lunges at the target at a speed that makes it almost invisible. Always goes first." */
  quick_attack(p, s) {
    const { ctx, ms } = s.c
    // Quase invisível: só aparecem os CONTORNOS do corpo em três pontos do
    // caminho e um traço branco; nenhum vulto cheio.
    const t0 = janela(ms, 0, p.contato + 80)
    if (t0 !== null) {
      for (let k = 0; k < 3; k++) {
        const v = (k + 1) / 4
        if (ms > p.contato * v + 60) continue
        vulto(ctx, entrePontos(s.saida, s.chegada, v), s.angulo, 7, .6, s.pele, undefined, true)
      }
      const fio = 1 - limitar((ms - p.contato) / 80)
      ctx.strokeStyle = BRANCO; ctx.lineWidth = 2 * fio + .3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(s.saida.x, s.saida.y); ctx.lineTo(s.chegada.x, s.chegada.y); ctx.stroke()
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 8)
  },

  /** "Charges the target at blinding speed. This move always goes first." */
  extreme_speed(p, s) {
    const { ctx, ms } = s.c
    // Velocidade CEGANTE: o corpo pisca em quatro lugares em volta do alvo
    // (some e aparece) e acerta de lados diferentes, rápido demais pra seguir.
    for (let k = 0; k < 4; k++) {
      const a = s.angulo + Math.PI + [0, 2.2, -2.1, .9][k]
      const q = { x: s.centro.x + Math.cos(a) * 14, y: s.centro.y + Math.sin(a) * 11 }
      const pisca = janela(ms, p.contato - 60 + k * 70, 50)
      if (pisca !== null) { vulto(ctx, q, a + Math.PI, 7, .8, s.pele); rastro(ctx, { x: q.x + Math.cos(a) * 16, y: q.y + Math.sin(a) * 16 }, q, 2, 3, s.pele, rngSemeado(s.semente + k)) }
      const t = janela(ms, p.contato - 10 + k * 70, 180)
      if (t !== null) choque(s, t, 6 + (k === 3 ? 4 : 0), { x: s.centro.x - Math.cos(a) * 3, y: s.centro.y - Math.sin(a) * 2 })
    }
  },

  /** "A reckless, full-body charge attack for slamming into the target. Also damages the user a little." */
  take_down(p, s) {
    const { ctx, ms, origem } = s.c
    // Imprudente: o pé raspa o chão levantando poeira, carga pesada e, no
    // choque, quem bateu também leva um estalinho.
    const raspa = janela(ms, 0, 120)
    if (raspa !== null) nuvem(ctx, { x: origem.x - s.ux * 8, y: origem.y + 11 }, raspa, s.c.pedir(3), 7, PELES.GROUND, rngSemeado(s.semente + 2))
    carga(s, ms, 110, p.contato - 110, 9, 2)
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 11)
    ondaDeChoque(ctx, s.c.alvo, s.angulo, t, 14, 2, s.pele)
    recuo(s, t, 6)
  },

  /** "A reckless, life-risking tackle. This also damages the user quite a lot." */
  double_edge(p, s) {
    const { ctx, ms, origem } = s.c
    // Arriscando a vida: o corpo vem com um gume DUPLO (borda vermelha por
    // fora) e o recuo é grande — um anel vermelho em quem bateu.
    const q = carga(s, ms, 120, p.contato - 120, 9.5, 2)
    if (q) crescente(ctx, q, 12, s.angulo - 1.1, s.angulo + 1.1, 2.6, .55, 0, { ...s.pele, meio: VERMELHO, nucleo: BRANCO }, 1)
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 13)
    ondaDeChoque(ctx, s.c.alvo, s.angulo, t, 16, 2, s.pele)
    recuo(s, t, 10)
    if (t > .1 && t < .5) crescente(ctx, origem, 10, -Math.PI, Math.PI, 2.4, .5, 0, { ...s.pele, meio: VERMELHO }, 1)
  },

  /** "Drops onto the target with its full body weight. May leave the target with paralysis." */
  body_slam(p, s) {
    const { ctx, ms, alvo } = s.c
    // Peso total: a sombra do corpo cresce em cima do alvo e o vulto ENORME cai
    // de cima, achatando; o chão espirra e o alvo fica com estática (paralisia).
    const chao = { x: alvo.x, y: alvo.y + 11 }
    const cai = janela(ms, 40, p.contato - 40)
    if (cai !== null) {
      const r = 6 + 9 * cai
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(chao.x, chao.y, r, r * .35, 0, 0, Math.PI * 2); ctx.fill()
      vulto(ctx, { x: alvo.x, y: alvo.y - 46 + 38 * entrada(cai) }, Math.PI / 2, 12, cai * .4, s.pele)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    if (t < .25) vulto(ctx, { x: alvo.x, y: alvo.y - 6 }, 0, 12, 0, s.pele)
    choque(s, t, 12, { x: alvo.x, y: alvo.y + 2 })
    nuvem(ctx, chao, t, s.c.pedir(5 + s.c.tier), 20, PELES.GROUND, rngSemeado(s.semente + 2))
    estatica(ctx, alvo, saida(limitar((t - .25) / .2)) * (1 - limitar((t - .85) / .15)), PELES.ELECTRIC, s.semente + 90 + Math.floor(ms / 66))
  },

  /** "Charges at the target using every bit of its power. The user can't move on the next turn." */
  giga_impact(p, s) {
    const { ctx, ms, origem } = s.c
    // TODA a força: aura roxa e laranja pulsando; carga com o corpo envolto num
    // cometa; choque gigante com estilhaços; e depois quem atacou fica exausto
    // (gotas de suor caindo, sem se mexer).
    const junta = janela(ms, 0, 200)
    if (junta !== null) for (let k = 0; k < 2; k++) {
      const u = (junta * 2 + k * .5) % 1
      crescente(ctx, origem, 6 + u * 14, -Math.PI, Math.PI, 3 * (1 - u) + .4, .5, 0, { ...s.pele, meio: k ? LARANJA : PELES.GHOST.meio }, 1)
    }
    const q = carga(s, ms, 200, p.contato - 200, 11, 3)
    if (q) crescente(ctx, q, 14, s.angulo - 1.3, s.angulo + 1.3, 3.6, .55, 0, { ...s.pele, meio: LARANJA }, 1)
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 16)
    ondaDeChoque(ctx, s.c.alvo, s.angulo, t, 20, 3, { ...s.pele, meio: LARANJA })
    estilhacos(ctx, s.centro, s.c.pedir(5 + s.c.tier), 28, t, PELES.ROCK, rngSemeado(s.semente + 3))
    if (t > .4) for (const d of [-1, 1]) {
      const v = ((t - .4) / .6 * 2 + (d > 0 ? .5 : 0)) % 1
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(origem.x + d * 9, origem.y - 10 + v * 8, 2.2, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = AZUL; ctx.beginPath(); ctx.arc(origem.x + d * 9, origem.y - 10 + v * 8, 1.4, 0, Math.PI * 2); ctx.fill()
    }
  },

  /** "The user fiercely attacks the target using its entire body." */
  high_horsepower(p, s) {
    const { ctx, ms } = s.c
    // Galope feroz: marcas de casco ficando no chão em ritmo de galope, poeira
    // em cada batida e o vulto avançando aos solavancos.
    const u = janela(ms, 0, p.contato)
    if (u !== null) {
      for (let k = 0; k < 5; k++) {
        const v = (k + .5) / 5
        if (v > u) continue
        const q = entrePontos({ x: s.saida.x, y: s.saida.y + 13 }, { x: s.chegada.x, y: s.chegada.y + 13 }, v)
        const lado = k % 2 ? 2.4 : -2.4
        ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(q.x, q.y + lado, 2.4, 1.2, 0, 0, Math.PI * 2); ctx.fill()
        const tp = (u - v) * 5
        if (tp < 1) nuvem(ctx, q, tp, Math.min(s.c.pedir(2), 2), 4, PELES.GROUND, rngSemeado(s.semente + 10 + k))
      }
      const q = entrePontos(s.saida, s.chegada, saida(u))
      q.y -= Math.abs(Math.sin(u * Math.PI * 5)) * 3
      vulto(ctx, q, s.angulo, 9, .4, s.pele)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 12)
    estilhacos(ctx, s.c.alvo, s.c.pedir(4), 22, t, PELES.GROUND, rngSemeado(s.semente + 3))
  },

  /** "Can be used only after the user has used all the other moves it knows in the battle." */
  last_resort(p, s) {
    const { ctx, ms, origem } = s.c
    // Último recurso: os QUATRO golpes que ele sabe aparecem como quatro orbes
    // em volta (um de cada cor), acendem um por um, se fundem e o corpo
    // carrega com a força de todos.
    const junta = janela(ms, 0, 260)
    if (junta !== null) CORES_DOS_GOLPES.forEach((cor, k) => {
      const aceso = junta > k * .18
      const a = -Math.PI / 2 + k * Math.PI / 2 + junta * 2, d = 16 * (1 - entrada(limitar((junta - .7) / .3)))
      bola(ctx, { x: origem.x + Math.cos(a) * d, y: origem.y - 6 + Math.sin(a) * d * .7 }, aceso ? 3.4 : 2, s.pele, aceso ? cor : '#5e5766', BRANCO)
    })
    const q = carga(s, ms, 260, p.contato - 260, 9, 2)
    if (q) CORES_DOS_GOLPES.forEach((cor, k) => brilho(ctx, q.x + Math.cos(k * 1.57 + ms / 40) * 11, q.y + Math.sin(k * 1.57 + ms / 40) * 9, 2.2, cor))
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 13)
    CORES_DOS_GOLPES.forEach((cor, k) => { const a = k * Math.PI / 2 + .4, d = 18 * saida(t); brilho(ctx, s.centro.x + Math.cos(a) * d, s.centro.y + Math.sin(a) * d * .8, 3 * (1 - t), cor) })
  },

  /** "Gets revenge for a fainted ally. If an ally fainted in the previous turn, power increases." */
  retaliate(p, s) {
    const { ctx, ms, origem } = s.c
    // Vingança: o vulto apagado de um aliado caído (com espiral de desmaio)
    // aparece ao lado de quem ataca; ele acende em vermelho e investe.
    const aliado = janela(ms, 0, p.contato)
    if (aliado !== null) {
      const k = saida(limitar(aliado / .3)) * (1 - entrada(limitar((aliado - .7) / .3)))
      const q = { x: origem.x - s.ux * 14, y: origem.y - 4 }
      if (k > .05) {
        vulto(ctx, q, 0, 7 * k, 0, s.pele, undefined, true)
        crescente(ctx, { x: q.x, y: q.y - 10 }, 3 * k, ms / 40, ms / 40 + 4, 1.2, .5, 0, s.pele, .6)
      }
      crescente(ctx, origem, 10, -Math.PI, Math.PI, 2.6 * aliado, .5, 0, { ...s.pele, meio: VERMELHO }, 1)
    }
    carga(s, ms, 160, p.contato - 160, 9, 2, VERMELHO)
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 12)
  },

  /** "Looking for an opening, the user strikes consistently. The target's stat changes don't affect it." */
  chip_away(p, s) {
    const { ctx, ms } = s.c
    // Procurando brecha: o alvo tem um escudo de status (anel e setas); golpes
    // curtos e CONSTANTES no mesmo ponto vão lascando o escudo até ele rachar.
    const escudo = janela(ms, 0, p.contato + 260)
    if (escudo !== null) {
      const racha = limitar((ms - p.contato) / 260)
      crescente(ctx, s.centro, 15, -Math.PI, Math.PI, 2.6 * (1 - racha), .5, 0, { ...s.pele, meio: AZUL }, 1)
      if (racha < .8) setasDeStatus(ctx, s.c.alvo, .3, AZUL, 2)
    }
    const ponto = { x: s.centro.x - s.ux * 12, y: s.centro.y - s.uy * 12 }
    for (let k = 0; k < 4; k++) {
      const ini = p.contato - 40 + k * 70
      const g = janela(ms, ini, 60)
      if (g !== null) vulto(ctx, entrePontos({ x: ponto.x - s.ux * 10, y: ponto.y - s.uy * 10 }, ponto, saida(g)), s.angulo, 5, .6, s.pele)
      const t = janela(ms, ini + 50, 180)
      if (t !== null) { choque(s, t, 5, ponto); estilhacos(ctx, ponto, Math.min(s.c.pedir(2), 2), 12, t, { ...s.pele, meio: AZUL }, rngSemeado(s.semente + 20 + k)) }
    }
  },

  /** "This attack move doubles its power if the user is poisoned, burned, or paralyzed." */
  facade(p, s) {
    const { ctx, ms, origem } = s.c
    // Fachada: os ícones de status de quem ataca (chama, gota de veneno,
    // faísca) giram em volta dele e viram combustível — estouro POW no alvo.
    const icones = janela(ms, 0, p.contato)
    if (icones !== null) {
      const junta = entrada(limitar((icones - .5) / .5))
      const pts = [[-11, -10], [0, -16], [11, -10]].map(([x, y]) => ({ x: origem.x + x * (1 - junta), y: origem.y + y * (1 - junta) }))
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y - 5); ctx.quadraticCurveTo(pts[0].x + 4, pts[0].y, pts[0].x, pts[0].y + 3); ctx.quadraticCurveTo(pts[0].x - 4, pts[0].y, pts[0].x, pts[0].y - 5); ctx.fill()
      ctx.fillStyle = LARANJA; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y - 4); ctx.quadraticCurveTo(pts[0].x + 3, pts[0].y, pts[0].x, pts[0].y + 2); ctx.quadraticCurveTo(pts[0].x - 3, pts[0].y, pts[0].x, pts[0].y - 4); ctx.fill()
      bola(ctx, pts[1], 2.6, s.pele, PELES.POISON.meio, BRANCO)
      brilho(ctx, pts[2].x, pts[2].y, 2.8, AMARELO)
    }
    carga(s, ms, p.contato - 110, 110, 9, 1)
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    const r = (15 + s.c.tier * 2) * saida(limitar(t / .18)) * (1 - entrada(limitar((t - .5) / .5)))
    if (r > 1) {
      const estrela = (R: number) => { ctx.beginPath(); for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, rr = i % 2 ? R * .62 : R * (i % 4 ? 1 : .86); ctx.lineTo(s.centro.x + Math.cos(a) * rr, s.centro.y + Math.sin(a) * rr * .8) } ctx.closePath() }
      estrela(r + 2); ctx.fillStyle = ESCURO; ctx.fill(); estrela(r); ctx.fillStyle = AMARELO; ctx.fill(); estrela(r * .55); ctx.fillStyle = BRANCO; ctx.fill()
    }
  },

  /** "This full-power attack grows more powerful the more the user likes its Trainer." */
  return(p, s) {
    const { ctx, ms, origem } = s.c
    // Amizade: corações sobem de quem ataca (carinho pelo treinador), o corpo
    // carrega envolto em corações e o impacto solta um coração grande.
    const ama = janela(ms, 0, p.contato)
    if (ama !== null) for (let k = 0; k < 3; k++) { const v = (ama * 1.5 + k / 3) % 1; coracao(ctx, { x: origem.x + (k - 1) * 9, y: origem.y - 8 - v * 14 }, .8 * (1 - v), ROSA) }
    const q = carga(s, ms, 140, p.contato - 140, 9, 1)
    if (q) for (let k = 0; k < 2; k++) coracao(ctx, { x: q.x - s.ux * (12 + k * 10), y: q.y - 8 + k * 3 }, .7, ROSA)
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 11)
    coracao(ctx, { x: s.centro.x, y: s.centro.y - 10 - 14 * saida(t) }, 1.5 * (1 - entrada(limitar((t - .6) / .4))), ROSA)
  },

  /** "This full-power attack grows more powerful the less the user likes its Trainer." */
  frustration(p, s) {
    const { ctx, ms, origem } = s.c
    // Frustração: um CORAÇÃO PARTIDO acima de quem ataca, as metades se
    // separando; a carga sai bufando e o rabisco de raiva fica no alvo.
    const parte = janela(ms, 0, p.contato)
    if (parte !== null) {
      const abre = saida(limitar((parte - .3) / .4)) * 3
      ctx.save(); ctx.beginPath(); ctx.rect(origem.x - 20, origem.y - 30, 20, 30); ctx.clip()
      coracao(ctx, { x: origem.x - abre, y: origem.y - 18 }, 1, '#8a6f84'); ctx.restore()
      ctx.save(); ctx.beginPath(); ctx.rect(origem.x, origem.y - 30, 20, 30); ctx.clip()
      coracao(ctx, { x: origem.x + abre, y: origem.y - 18 + abre * .6 }, 1, '#8a6f84'); ctx.restore()
    }
    carga(s, ms, 140, p.contato - 140, 9, 1)
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 11)
    const k = saida(limitar(t / .25)) * (1 - entrada(limitar((t - .65) / .35)))
    if (k > .05) {
      const rng = rngSemeado(s.semente + 90 + Math.floor(ms / 100))
      const pts: Ponto[] = Array.from({ length: 12 }, () => ({ x: s.centro.x + (rng() - .5) * 22 * k, y: s.centro.y - 14 + (rng() - .5) * 12 * k }))
      for (const [cor, w] of [[BRANCO, 4.4], [ESCURO, 2.2]] as const) {
        ctx.strokeStyle = cor; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath()
        pts.forEach((q, i) => i ? ctx.quadraticCurveTo((q.x + pts[i - 1].x) / 2 + 3, (q.y + pts[i - 1].y) / 2 - 3, q.x, q.y) : ctx.moveTo(q.x, q.y))
        ctx.stroke()
      }
    }
  },

  /** "The target is slugged with a punch thrown at maximum power." */
  strength(p, s) {
    const { ctx, ms, origem } = s.c
    // Força máxima: o punho recua bem pra trás (preparo longo, tremendo) e sai
    // num soco gigante; o ar em volta do alvo é empurrado numa parede.
    const recua = janela(ms, 0, p.contato - 80)
    const tremor = Math.floor(ms / 33) % 2 ? 1 : -1
    if (recua !== null) punhoGrande(ctx, { x: origem.x - s.ux * (6 + 8 * saida(recua)) + tremor * recua, y: origem.y - 4 }, s.angulo, .9, s.pele)
    const soco = janela(ms, p.contato - 80, 120)
    if (soco !== null) {
      const q = entrePontos({ x: origem.x - s.ux * 14, y: origem.y - 4 }, s.chegada, saida(limitar(soco * 1.4)))
      rastro(ctx, origem, q, s.c.pedir(3), 6, s.pele, rngSemeado(s.semente + 1))
      punhoGrande(ctx, q, s.angulo, 1.15 + s.c.tier * .04, s.pele)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 15)
    ondaDeChoque(ctx, s.c.alvo, s.angulo, t, 18, 2, s.pele)
    nuvem(ctx, { x: s.c.alvo.x, y: s.c.alvo.y + 11 }, t, s.c.pedir(4), 14, PELES.GROUND, rngSemeado(s.semente + 2))
  },

  /** "Slams into the target with its heavy body. The more the user outweighs the target, the greater the power." */
  heavy_slam(p, s) {
    const { ctx, ms, alvo } = s.c
    // PESO: um peso de ferro gigante (com alça) cai em cima do alvo; o chão
    // racha em estrela e espirra.
    const chao = { x: alvo.x, y: alvo.y + 11 }
    const cai = janela(ms, 60, p.contato - 60)
    if (cai !== null) {
      const r = 5 + 10 * cai
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(chao.x, chao.y, r, r * .35, 0, 0, Math.PI * 2); ctx.fill()
      pesoDeFerro(ctx, { x: alvo.x, y: alvo.y - 52 + 44 * entrada(cai) }, s.pele)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    if (t < .3) pesoDeFerro(ctx, { x: alvo.x, y: alvo.y - 6 }, s.pele)
    choque(s, t, 13, { x: alvo.x, y: alvo.y + 4 })
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3, L = 18 * saida(limitar(t / .3)) * (1 - limitar((t - .7) / .3))
      if (L > 1) poligono(ctx, [[chao.x, chao.y], [chao.x + Math.cos(a + .1) * L, chao.y + Math.sin(a + .1) * L * .4], [chao.x + Math.cos(a) * L * 1.1, chao.y + Math.sin(a) * L * .44], [chao.x + Math.cos(a - .1) * L, chao.y + Math.sin(a - .1) * L * .4]], ESCURO)
    }
    nuvem(ctx, chao, t, s.c.pedir(4), 18, PELES.GROUND, rngSemeado(s.semente + 2))
  },

  /** "After making its attack, the user rushes back to switch places with a party Pokémon." */
  u_turn(p, s) {
    const { ctx, ms, origem } = s.c
    // Bate e VOLTA em U, e na volta vira o facho de troca (o recolher da Poké Ball).
    carga(s, ms, 20, p.contato - 20, 7.5, 2)
    const t = janela(ms, s.contato, 240)
    if (t !== null) choque(s, t, 10)
    const volta = janela(ms, s.contato + 40, 160)
    if (volta !== null) {
      const v = saida(volta), curva = Math.sin(v * Math.PI) * 16
      const q = { x: s.chegada.x + (s.saida.x - s.chegada.x) * v - s.uy * curva, y: s.chegada.y + (s.saida.y - s.chegada.y) * v + s.ux * curva }
      rastro(ctx, s.chegada, q, s.c.pedir(2), 4, s.pele, rngSemeado(s.semente + 3))
      vulto(ctx, q, s.angulo + Math.PI, 7, .5, s.pele)
    }
    const troca = janela(ms, s.contato + 200, 180)
    if (troca !== null) {
      const h = 34 * saida(limitar(troca / .3)), w = 9 * (1 - entrada(limitar((troca - .5) / .5)))
      if (w > .4) {
        poligono(ctx, [[origem.x - w - 1.4, origem.y + 12], [origem.x + w + 1.4, origem.y + 12], [origem.x + w * .5 + 1.4, origem.y + 12 - h], [origem.x - w * .5 - 1.4, origem.y + 12 - h]], s.pele.contorno)
        poligono(ctx, [[origem.x - w, origem.y + 12], [origem.x + w, origem.y + 12], [origem.x + w * .5, origem.y + 12 - h], [origem.x - w * .5, origem.y + 12 - h]], VERMELHO)
        poligono(ctx, [[origem.x - w * .4, origem.y + 12], [origem.x + w * .4, origem.y + 12], [origem.x + w * .2, origem.y + 12 - h], [origem.x - w * .2, origem.y + 12 - h]], BRANCO)
      }
    }
  },

  /** "Nimbly strikes the target. If the user is not holding an item, massive damage." */
  acrobatics(p, s) {
    const { ctx, ms, alvo } = s.c
    // Ágil: o corpo dá uma CAMBALHOTA no ar (laço visível) sobre o alvo e
    // acerta três vezes leves: de cima, de lado e de baixo.
    const voo = janela(ms, 0, p.contato)
    if (voo !== null) {
      const v = saida(voo)
      const meio = entrePontos(s.saida, { x: alvo.x, y: alvo.y - 24 }, Math.min(1, v * 1.4))
      const a = v * Math.PI * 2.4
      crescente(ctx, meio, 10, a - 2.4, a, 2.4, .55, 0, { ...s.pele, meio: BRANCO }, 1)
      vulto(ctx, { x: meio.x + Math.cos(a) * 10, y: meio.y + Math.sin(a) * 10 }, a + Math.PI / 2, 6.5, .4, s.pele)
    }
    for (const [k, dx, dy] of [[0, 0, -8], [1, 7, -2], [2, -4, 5]] as const) {
      const t = janela(ms, s.contato + k * 60, 200)
      if (t !== null) choque(s, t, 6 + k, { x: s.centro.x + dx, y: s.centro.y + dy })
    }
  },
}

function punhoGrande(ctx: CanvasRenderingContext2D, p: Ponto, angulo: number, s: number, pele: Pele): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angulo); ctx.scale(s, s)
  ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(0, 0, 9.4, 8, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = pele.base; ctx.beginPath(); ctx.ellipse(0, 0, 8, 6.6, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = pele.meio; ctx.beginPath(); ctx.ellipse(-1, -2, 5, 3, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = ESCURO; for (let k = 0; k < 3; k++) ctx.fillRect(3, -4 + k * 3, 4.6, 1)
  ctx.fillStyle = BRANCO; ctx.fillRect(-4, -4, 2, 2)
  ctx.restore()
}

function pesoDeFerro(ctx: CanvasRenderingContext2D, p: Ponto, pele: Pele): void {
  poligono(ctx, [[p.x - 13, p.y + 8], [p.x + 13, p.y + 8], [p.x + 9, p.y - 7], [p.x - 9, p.y - 7]], ESCURO)
  poligono(ctx, [[p.x - 11.6, p.y + 6.8], [p.x + 11.6, p.y + 6.8], [p.x + 8, p.y - 5.8], [p.x - 8, p.y - 5.8]], pele.base)
  poligono(ctx, [[p.x - 7, p.y - 5.8], [p.x + 2, p.y - 5.8], [p.x - 1, p.y + 6.8], [p.x - 10, p.y + 6.8]], pele.meio)
  ctx.strokeStyle = ESCURO; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y - 8, 4, Math.PI, 0); ctx.stroke()
}

const ACENTOS = [VERMELHO, ROSA, AMARELO, AZUL, LARANJA, '#8a6f84', '#5e5766', ...CORES_DOS_GOLPES,
  PELES.GROUND.base, PELES.GROUND.meio, PELES.GROUND.contorno, PELES.GHOST.meio, PELES.POISON.meio,
  PELES.ELECTRIC.base, PELES.ELECTRIC.meio, PELES.ELECTRIC.contorno, PELES.ROCK.base, PELES.ROCK.meio, PELES.ROCK.contorno]

export const INVESTIDAS_POR_GOLPE = montarFamilia(PERFIS_DE_INVESTIDA, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 60,
  margem: () => ({ cima: 80, baixo: 60, lados: 60 }),
  pele: id => comAcento(PELES[getAbility(id)?.type ?? 'NORMAL'], ...ACENTOS),
})
