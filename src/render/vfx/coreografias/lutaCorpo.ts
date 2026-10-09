// Família Luta corporal (09/10): tapas, arremessos e revides — 22 golpes, cada
// um a partir da descrição do jogo (frase no comentário). Bide e Metal Burst
// ficam de fora: nunca disparam no motor (abilities.ts).
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { crescente, entrada, estilhacos, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { noChao } from './comum'
import { BRANCO, ESCURO, brilho, comAcento, entrePontos, estatica, janela, montarFamilia, nuvem, poligono, rastro, setasDeStatus } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_LUTA: Record<string, Perfil> = {
  double_slap: { contato: 110, fim: 520 },
  wake_up_slap: { contato: 220, fim: 300 },
  smelling_salts: { contato: 200, fim: 300 },
  arm_thrust: { contato: 90, fim: 480 },
  brick_break: { contato: 220, fim: 300 },
  revenge: { contato: 230, fim: 260 },
  counter: { contato: 260, fim: 260 },
  reversal: { contato: 240, fim: 280 },
  endeavor: { contato: 200, fim: 380 },
  flail: { contato: 260, fim: 300 },
  vital_throw: { contato: 300, fim: 260 },
  circle_throw: { contato: 300, fim: 300 },
  storm_throw: { contato: 260, fim: 280 },
  seismic_toss: { contato: 380, fim: 280 },
  submission: { contato: 300, fim: 300 },
  superpower: { contato: 260, fim: 340 },
  close_combat: { contato: 120, fim: 560 },
  fake_out: { contato: 140, fim: 280 },
  double_hit: { contato: 160, fim: 360 },
  rage: { contato: 220, fim: 280 },
  final_gambit: { contato: 300, fim: 320 },
}

export const PERFIS_DE_LUTA_EM_AREA: Record<string, Perfil> = {
  brutal_swing: { contato: 200, fim: 320 },
}

const LARANJA = '#ff9a3a', VERMELHO = '#e0303a', AZUL = '#58a6f0', VERDE = '#5cd65c', AMARELO = '#ffd23a'

interface Cena { c: ContextoVfx; pele: Pele; semente: number; ux: number; uy: number; lado: number; contato: number; centro: Ponto }

function cena(p: Perfil, c: ContextoVfx): Cena {
  const dx = c.alvo.x - c.origem.x, dy = c.alvo.y - c.origem.y, L = Math.hypot(dx, dy) || 1
  return { c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), ux: dx / L, uy: dy / L, lado: dx < 0 ? -1 : 1, contato: p.contato, centro: { x: c.alvo.x, y: c.alvo.y - 3 } }
}

function choque(s: Cena, t: number, tamanho: number, ponto = s.centro): void {
  const rng = rngSemeado(s.semente + 50)
  estrelaDeImpacto(s.c.ctx, ponto, tamanho + s.c.tier * 1.2, t, s.pele, rng)
  riscos(s.c.ctx, ponto, s.c.pedir(2 + s.c.tier), 16 + s.c.tier * 3, t, s.pele.meio, rng)
}

/** Mão ABERTA (palma com 4 dedos e polegar), dedos pra +Y quando `angulo` 0. */
function palma(ctx: CanvasRenderingContext2D, p: Ponto, angulo: number, s: number, cor: string, luz: string): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angulo); ctx.scale(s, s)
  const dedos = (g: number, c: string) => {
    ctx.fillStyle = c
    ctx.beginPath(); ctx.ellipse(0, 0, 5.4 + g, 5 + g, 0, 0, Math.PI * 2); ctx.fill()
    for (const [x, comp] of [[-3.6, 6], [-1.2, 7.4], [1.2, 7.4], [3.6, 6]] as const) {
      ctx.fillRect(x - 1 - g, -comp - g, 2 + g * 2, comp + g)
    }
    ctx.save(); ctx.rotate(.9); ctx.fillRect(-1 - g, -9 - g, 2.2 + g * 2, 6 + g); ctx.restore()
  }
  dedos(1.3, ESCURO); dedos(0, cor)
  ctx.fillStyle = luz; ctx.fillRect(-3, -2, 3, 3)
  ctx.restore()
}

/** Barra de HP pequena (verde/amarela/vermelha pelo `frac`). */
function barraDeHp(ctx: CanvasRenderingContext2D, p: Ponto, frac: number, largura = 22): void {
  poligono(ctx, [[p.x - largura / 2 - 1.4, p.y - 2.4], [p.x + largura / 2 + 1.4, p.y - 2.4], [p.x + largura / 2 + 1.4, p.y + 2.4], [p.x - largura / 2 - 1.4, p.y + 2.4]], ESCURO)
  poligono(ctx, [[p.x - largura / 2, p.y - 1.2], [p.x + largura / 2, p.y - 1.2], [p.x + largura / 2, p.y + 1.2], [p.x - largura / 2, p.y + 1.2]], '#3a3040')
  const cor = frac > .5 ? VERDE : frac > .2 ? AMARELO : VERMELHO
  const w = largura * limitar(frac)
  if (w > .5) poligono(ctx, [[p.x - largura / 2, p.y - 1.2], [p.x - largura / 2 + w, p.y - 1.2], [p.x - largura / 2 + w, p.y + 1.2], [p.x - largura / 2, p.y + 1.2]], cor)
}

/** Linhas de susto (flinch) acima da cabeça. */
function susto(ctx: CanvasRenderingContext2D, alvo: Ponto, k: number): void {
  if (k <= 0) return
  for (const dx of [-6, 0, 6]) poligono(ctx, [[alvo.x + dx - 1, alvo.y - 16], [alvo.x + dx + 1, alvo.y - 16], [alvo.x + dx * 1.4 + .6, alvo.y - 16 - 7 * k], [alvo.x + dx * 1.4 - .6, alvo.y - 16 - 7 * k]], ESCURO)
}

/** Golpes de palma rápidos: um por `n`, alternando lados. */
function tapas(s: Cena, n: number, passo: number, alterna: boolean): void {
  const { ctx, ms } = s.c
  for (let k = 0; k < n; k++) {
    const ini = s.contato - 60 + k * passo
    const lado = alterna ? (k % 2 ? -1 : 1) : 1
    const de = { x: s.centro.x - s.ux * 18 - s.uy * 10 * lado, y: s.centro.y - s.uy * 18 + s.ux * 10 * lado - 6 }
    const t = janela(ms, ini, 100)
    if (t !== null) palma(ctx, entrePontos(de, { x: s.centro.x - s.ux * 6, y: s.centro.y + (alterna ? 0 : [0, -5, 4, -3, 5][k]) }, saida(t)), Math.atan2(s.uy, s.ux) - Math.PI / 2 + lado * .5 * (1 - t), 1.1, s.pele.nucleo, BRANCO)
    const tc = janela(ms, ini + 60, 200)
    if (tc !== null) choque(s, tc, 6, { x: s.centro.x + lado * 3, y: s.centro.y + (alterna ? 0 : [0, -5, 4, -3, 5][k]) })
  }
}

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "Slapped repeatedly, back and forth, two to five times in a row." */
  double_slap(_p, s) {
    tapas(s, Math.max(2, Math.min(5, Math.trunc(s.c.acertos ?? 3))), 100, true)
  },

  /** "Big damage on a sleeping target. This also wakes the target up." */
  wake_up_slap(p, s) {
    const { ctx, ms } = s.c
    // "Zzz" boiando em cima do alvo; o tapa estoura os Z e sobra um "!" de acordado.
    const zz = janela(ms, 0, p.contato + 40)
    if (zz !== null) for (let k = 0; k < 3; k++) {
      const y = s.centro.y - 14 - k * 6 - (ms / 40 % 4), x = s.centro.x + 4 + k * 4, z = 2 + k * .6
      ctx.strokeStyle = ESCURO; ctx.lineWidth = 2.6
      ctx.beginPath(); ctx.moveTo(x - z, y - z); ctx.lineTo(x + z, y - z); ctx.lineTo(x - z, y + z); ctx.lineTo(x + z, y + z); ctx.stroke()
      ctx.strokeStyle = BRANCO; ctx.lineWidth = 1.1; ctx.stroke()
    }
    tapas(s, 1, 0, false)
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    estilhacos(ctx, { x: s.centro.x + 8, y: s.centro.y - 20 }, s.c.pedir(4), 14, t, { ...s.pele, meio: BRANCO }, rngSemeado(s.semente + 2))
    const k = saida(limitar((t - .2) / .2)) * (1 - limitar((t - .8) / .2))
    if (k > .05) {
      const x = s.centro.x + 10, y = s.centro.y - 18
      poligono(ctx, [[x - 2.4 * k, y - 8 * k], [x + 2.4 * k, y - 8 * k], [x + 1.2 * k, y + 1], [x - 1.2 * k, y + 1]], ESCURO)
      poligono(ctx, [[x - 1.4 * k, y - 7 * k], [x + 1.4 * k, y - 7 * k], [x + .6 * k, y], [x - .6 * k, y]], AMARELO)
      ctx.fillStyle = ESCURO; ctx.fillRect(x - 1.8, y + 2, 3.6, 3.6); ctx.fillStyle = AMARELO; ctx.fillRect(x - 1, y + 2.8, 2, 2)
    }
  },

  /** "Power doubles on a paralyzed target. This also cures the target's paralysis." */
  smelling_salts(p, s) {
    const { ctx, ms } = s.c
    // Estática de paralisia presa no alvo; o tapa a "cura": as faíscas se soltam e somem.
    const presa = janela(ms, 0, p.contato + 20)
    if (presa !== null) estatica(ctx, s.c.alvo, saida(limitar(presa / .3)), PELES.ELECTRIC, s.semente + Math.floor(ms / 66))
    tapas(s, 1, 0, false)
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    const rng = rngSemeado(s.semente + 3)
    for (let k = 0; k < 6; k++) {
      const a = rng() * Math.PI * 2, d = 6 + 20 * saida(t)
      brilho(ctx, s.centro.x + Math.cos(a) * d, s.centro.y + Math.sin(a) * d * .8, 2.2 * (1 - t), PELES.ELECTRIC.meio)
    }
  },

  /** "A flurry of open-palmed arm thrusts that hit two to five times in a row." */
  arm_thrust(_p, s) {
    tapas(s, Math.max(2, Math.min(5, Math.trunc(s.c.acertos ?? 3))), 85, false)
  },

  /** "A swift chop. It can also break barriers, such as Light Screen and Reflect." */
  brick_break(p, s) {
    const { ctx, ms } = s.c
    // Uma parede de tijolos na frente do alvo; o cutelo desce e ela parte ao meio.
    const parede = janela(ms, 0, p.contato + 160)
    const px = s.centro.x - s.ux * 13
    if (parede !== null) {
      const abre = ms < p.contato ? 0 : saida(limitar((ms - p.contato) / 160))
      for (const lado of [-1, 1]) for (let fila = 0; fila < 4; fila++) {
        const y = s.centro.y - 12 + fila * 6, dx = lado * (abre * 8) + (fila % 2 ? 1.5 : 0), cai = abre * abre * 10
        const x0 = px + (lado < 0 ? -6 : 0) + dx
        poligono(ctx, [[x0 - .7, y - .7 + cai], [x0 + 6.7, y - .7 + cai], [x0 + 6.7, y + 5.7 + cai], [x0 - .7, y + 5.7 + cai]], ESCURO)
        poligono(ctx, [[x0, y + cai], [x0 + 6, y + cai], [x0 + 6, y + 5 + cai], [x0, y + 5 + cai]], fila % 2 ? '#c0603a' : '#d8784a')
      }
    }
    const chop = janela(ms, p.contato - 80, 120)
    if (chop !== null) palma(ctx, { x: px, y: s.centro.y - 26 + 26 * saida(chop) }, Math.PI, 1, s.pele.nucleo, BRANCO)
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 10, { x: px, y: s.centro.y })
  },

  /** "Power doubles if the user has been hurt by the opponent in the same turn." */
  revenge(p, s) {
    const { ctx, ms, origem } = s.c
    // Quem ataca acende em vermelho (foi ferido) e devolve com tudo.
    const acende = janela(ms, 0, p.contato - 40)
    if (acende !== null) {
      const r = 10 + 4 * Math.sin(acende * Math.PI * 3)
      crescente(ctx, origem, r, -Math.PI, Math.PI, 2.4, .5, 0, { ...s.pele, meio: VERMELHO }, 1)
    }
    const vai = janela(ms, p.contato - 90, 90)
    if (vai !== null) rastro(ctx, origem, entrePontos(origem, s.centro, saida(vai)), s.c.pedir(3 + s.c.tier), 5, { ...s.pele, meio: VERMELHO }, rngSemeado(s.semente + 1))
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 12)
  },

  /** "A retaliation move that counters any physical attack, inflicting double the damage taken." */
  counter(p, s) {
    const { ctx, ms, origem } = s.c
    // Uma pancada pequena VEM do alvo, bate num escudo de quem ataca e VOLTA o dobro.
    const vem = janela(ms, 0, 120)
    if (vem !== null) {
      const q = entrePontos(s.centro, origem, saida(vem))
      estrelaDeImpacto(ctx, q, 5, .3, s.pele, rngSemeado(s.semente + 1))
    }
    const bloqueia = janela(ms, 100, 100)
    if (bloqueia !== null) crescente(ctx, origem, 12, Math.atan2(s.uy, s.ux) - 1.2, Math.atan2(s.uy, s.ux) + 1.2, 3.4, .55, 0, { ...s.pele, meio: BRANCO }, 1)
    const volta = janela(ms, 200, p.contato - 200)
    if (volta !== null) {
      const q = entrePontos(origem, s.centro, saida(volta))
      rastro(ctx, origem, q, s.c.pedir(3), 6, { ...s.pele, meio: VERMELHO }, rngSemeado(s.semente + 2))
      estrelaDeImpacto(ctx, q, 9, .3, { ...s.pele, estrela: VERMELHO }, rngSemeado(s.semente + 3))
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 14)
  },

  /** "An all-out attack that becomes more powerful the less HP the user has." */
  reversal(p, s) {
    const { ctx, ms, origem } = s.c
    // HP quase no fim: barrinha vermelha piscando sobre quem ataca, aura de
    // desespero; tudo explode num golpe só.
    const pisca = janela(ms, 0, p.contato)
    if (pisca !== null) {
      barraDeHp(ctx, { x: origem.x, y: origem.y - 18 }, Math.floor(ms / 80) % 2 ? .12 : .06, 18)
      for (let k = 0; k < 2; k++) {
        const u = (pisca * 2 + k * .5) % 1
        crescente(ctx, origem, 6 + u * 12, -Math.PI, Math.PI, 2 * (1 - u) + .4, .5, 0, { ...s.pele, meio: VERMELHO }, .9)
      }
    }
    const vai = janela(ms, p.contato - 70, 70)
    if (vai !== null) rastro(ctx, origem, entrePontos(origem, s.centro, saida(vai)), s.c.pedir(4), 7, { ...s.pele, meio: LARANJA }, rngSemeado(s.semente + 1))
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) { choque(s, t, 14); estilhacos(ctx, s.centro, s.c.pedir(4), 22, t, { ...s.pele, meio: LARANJA }, rngSemeado(s.semente + 2)) }
  },

  /** "Cuts down the target's HP to equal the user's HP." */
  endeavor(p, s) {
    const { ctx, ms, origem } = s.c
    // Literal: duas barras de HP. A do alvo (cheia) é CORTADA até o tamanho da de quem ataca (baixa).
    const mostra = janela(ms, 0, p.contato + p.fim)
    if (mostra === null) return
    const meu = .25
    const corta = ms < p.contato ? 0 : saida(limitar((ms - p.contato) / 160))
    barraDeHp(ctx, { x: origem.x, y: origem.y - 18 }, meu)
    barraDeHp(ctx, { x: s.centro.x, y: s.centro.y - 16 }, 1 - (1 - meu) * corta)
    // Linha tracejada mostrando o nível que vai ser igualado.
    if (ms > 80 && ms < p.contato + 60) {
      const x = s.centro.x - 11 + 22 * meu
      for (let k = 0; k < 3; k++) poligono(ctx, [[x - .6, s.centro.y - 22 + k * 4], [x + .6, s.centro.y - 22 + k * 4], [x + .6, s.centro.y - 20 + k * 4], [x - .6, s.centro.y - 20 + k * 4]], BRANCO)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 8)
  },

  /** "Flails about aimlessly to attack. The less HP the user has, the greater the power." */
  flail(p, s) {
    const { ctx, ms, origem } = s.c
    // Debatendo-se sem rumo: braços (arcos) girando pra todo lado, gotas de suor;
    // alguns acertam o alvo.
    const debate = janela(ms, 0, p.contato + 120)
    if (debate !== null) {
      const rng = rngSemeado(s.semente + Math.floor(ms / 50))
      for (let k = 0; k < 2; k++) {
        const a = rng() * Math.PI * 2
        crescente(ctx, origem, 11 + rng() * 6, a, a + 1.4, 2.8, .55, 0, s.pele, 1)
      }
      for (let k = 0; k < 2; k++) {
        const x = origem.x + (k ? 9 : -9), y = origem.y - 12 + (ms / 30 + k * 7) % 10
        ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = AZUL; ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill()
      }
    }
    for (const atraso of [0, 90]) {
      const t = janela(ms, s.contato + atraso, p.fim - atraso)
      if (t !== null) choque(s, t, atraso ? 6 : 9, { x: s.centro.x + (atraso ? 5 : -2), y: s.centro.y + (atraso ? -4 : 2) })
    }
  },

  /** "The user attacks last. In return, this throw move never misses." */
  vital_throw(p, s) {
    const { ctx, ms, alvo } = s.c
    // Arremesso por cima do ombro: um arco grande sai do alvo, passa por cima de
    // quem ataca e o alvo "cai" atrás — poeira onde aterrissa.
    const arco = janela(ms, 80, p.contato - 80)
    if (arco !== null) {
      const de = s.centro, ate = { x: alvo.x + s.ux * 16, y: alvo.y + 6 }
      const pts = Array.from({ length: 10 }, (_, i) => {
        const v = (i / 9) * saida(arco)
        return { x: de.x + (ate.x - de.x) * v - s.ux * Math.sin(v * Math.PI) * 6, y: de.y + (ate.y - de.y) * v - Math.sin(v * Math.PI) * 26 }
      })
      ctx.lineCap = 'round'
      for (const [w, c] of [[4.2, ESCURO], [2.4, s.pele.meio], [.9, BRANCO]] as const) {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke()
      }
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    const chao = { x: alvo.x + s.ux * 16, y: alvo.y + 9 }
    choque(s, t, 11, { x: chao.x, y: chao.y - 4 })
    nuvem(ctx, chao, t, s.c.pedir(4 + s.c.tier), 14, PELES.GROUND, rngSemeado(s.semente + 2))
  },

  /** "The target is thrown, and a different Pokémon is dragged out." */
  circle_throw(p, s) {
    const { ctx, ms } = s.c
    // Gira o alvo num círculo completo e o lança pra fora; redemoinho de troca.
    const gira = janela(ms, 60, p.contato - 60)
    if (gira !== null) crescente(ctx, s.centro, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * saida(gira), 3.6, .55, 0, s.pele, .8)
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 10)
    rastro(ctx, s.centro, { x: s.centro.x + s.ux * 34 * saida(limitar(t / .6)), y: s.centro.y + s.uy * 34 * saida(limitar(t / .6)) - 6 }, s.c.pedir(4), 6, s.pele, rngSemeado(s.semente + 1), 1 - limitar((t - .6) / .4))
    const g = limitar((t - .4) / .6)
    if (g > 0 && g < 1) crescente(ctx, { x: s.centro.x, y: s.centro.y + 5 }, 10 * (1 - g) + 4, g * 12, g * 12 + 4, 2.4, .5, 0, s.pele, .5)
  },

  /** "Strikes the target with a fierce blow. This attack always results in a critical hit." */
  storm_throw(p, s) {
    const { ctx, ms } = s.c
    // Um redemoinho (tempestade) envolve o alvo e o golpe sai sempre crítico:
    // brilho de crítico grande no impacto.
    const gira = janela(ms, 0, p.contato + 80)
    if (gira !== null) for (let k = 0; k < 3; k++) {
      const a = ms / 50 + k * 2.1
      crescente(ctx, s.centro, 9 + k * 4, a, a + 1.8, 2.4 - k * .4, .55, 0, { ...s.pele, meio: k % 2 ? BRANCO : s.pele.meio }, .6)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 13)
    if (t < .5) brilho(ctx, s.centro.x + 10, s.centro.y - 12, 5 * (1 - t / .5), AMARELO)
  },

  /** "The target is thrown using the power of gravity. Damage equal to the user's level." */
  seismic_toss(p, s) {
    const { ctx, ms, alvo } = s.c
    // Leva o alvo LÁ EM CIMA (linha subindo, alvo girando num globo) e despenca
    // com gravidade: queda vertical e terremoto curto no chão.
    const sobe = janela(ms, 0, 200)
    if (sobe !== null) {
      rastro(ctx, { x: alvo.x, y: alvo.y }, { x: alvo.x, y: alvo.y - 50 * saida(sobe) }, s.c.pedir(3), 6, s.pele, rngSemeado(s.semente + 1))
      const topo = { x: alvo.x, y: alvo.y - 50 * saida(sobe) }
      crescente(ctx, topo, 8, ms / 30, ms / 30 + 4, 2.4, .5, 0, s.pele, .5)
    }
    const cai = janela(ms, 200, p.contato - 200)
    if (cai !== null) rastro(ctx, { x: alvo.x, y: alvo.y - 50 }, { x: alvo.x, y: alvo.y - 50 + 50 * entrada(cai) }, s.c.pedir(4), 7, s.pele, rngSemeado(s.semente + 2))
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 14, { x: alvo.x, y: alvo.y + 4 })
    nuvem(ctx, { x: alvo.x, y: alvo.y + 11 }, t, s.c.pedir(5 + s.c.tier), 20, PELES.GROUND, rngSemeado(s.semente + 3))
    for (const lado of [-1, 1]) {
      const k = 1 - limitar((t - .4) / .6)
      if (k > 0) poligono(ctx, [[alvo.x, alvo.y + 11], [alvo.x + lado * 6, alvo.y + 9.6], [alvo.x + lado * 14 * k, alvo.y + 12], [alvo.x + lado * 5, alvo.y + 12.4]], ESCURO)
    }
  },

  /** "Grabs the target and recklessly dives for the ground. Also damages the user a little." */
  submission(p, s) {
    const { ctx, ms, origem } = s.c
    // Briga de desenho animado: uma NUVEM DE POEIRA com estrelas e braços
    // girando (os dois embolados) que rola até o alvo e se espatifa no chão.
    const rola = janela(ms, 0, p.contato)
    if (rola !== null) {
      const q = entrePontos(origem, s.centro, saida(rola))
      nuvem(ctx, { x: q.x, y: q.y + 4 }, .45, 7, 10, PELES.GROUND, rngSemeado(s.semente + Math.floor(ms / 70)), .6, 0)
      const rng = rngSemeado(s.semente + 7 + Math.floor(ms / 70))
      for (let k = 0; k < 2; k++) brilho(ctx, q.x + (rng() - .5) * 18, q.y - 2 + (rng() - .5) * 12, 2.4, AMARELO)
      palma(ctx, { x: q.x + (rng() - .5) * 14, y: q.y - 8 }, rng() * 6, .6, s.pele.nucleo, BRANCO)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 12)
    nuvem(ctx, { x: s.centro.x, y: s.centro.y + 14 }, t, s.c.pedir(5), 18, PELES.GROUND, rngSemeado(s.semente + 3))
    const tr = (t - .15) / .7
    if (tr > 0 && tr < 1) estrelaDeImpacto(ctx, { x: origem.x, y: origem.y - 3 }, 7, tr, s.pele, rngSemeado(s.semente + 80))
  },

  /** "Attacks with great power. However, this also lowers the user's Attack and Defense." */
  superpower(p, s) {
    const { ctx, ms, origem } = s.c
    // Força bruta: veias de força (raios laranja) inflando em quem ataca, golpe
    // gigante — e depois duas setas AZUIS caem em quem atacou (Ataque e Defesa).
    const infla = janela(ms, 0, p.contato - 60)
    if (infla !== null) for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + .4, r = 8 + 8 * saida(infla)
      poligono(ctx, [[origem.x + Math.cos(a) * r, origem.y - 2 + Math.sin(a) * r], [origem.x + Math.cos(a + .2) * (r + 6), origem.y - 2 + Math.sin(a + .2) * (r + 6)], [origem.x + Math.cos(a - .2) * (r + 6), origem.y - 2 + Math.sin(a - .2) * (r + 6)]], LARANJA)
    }
    const vai = janela(ms, p.contato - 60, 60)
    if (vai !== null) rastro(ctx, origem, entrePontos(origem, s.centro, saida(vai)), s.c.pedir(4), 8, { ...s.pele, meio: LARANJA }, rngSemeado(s.semente + 1))
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 15)
    estilhacos(ctx, s.centro, s.c.pedir(4), 24, t, { ...s.pele, meio: LARANJA }, rngSemeado(s.semente + 2))
    const desce = janela(ms, s.contato + 120, p.fim - 120)
    if (desce !== null) setasDeStatus(ctx, origem, desce, AZUL, 2, true)
  },

  /** "Fights up close without guarding itself. Lowers the user's Defense and Sp. Def." */
  close_combat(p, s) {
    const { ctx, ms, origem } = s.c
    // Rajada de socos e chutes de perto, de todos os lados (sem guarda) — e a
    // guarda caindo depois: setas azuis pra baixo.
    const n = 6
    for (let k = 0; k < n; k++) {
      const ini = p.contato - 40 + k * 55
      const a = Math.atan2(s.uy, s.ux) + [0, .9, -.8, .4, -.5, 0][k]
      const de = { x: s.centro.x - Math.cos(a) * 16, y: s.centro.y - Math.sin(a) * 14 }
      const t = janela(ms, ini, 80)
      if (t !== null) palma(ctx, entrePontos(de, { x: s.centro.x - Math.cos(a) * 5, y: s.centro.y - Math.sin(a) * 4 }, saida(t)), a - Math.PI / 2, .65, s.pele.nucleo, BRANCO)
      const tc = janela(ms, ini + 50, 160)
      if (tc !== null) choque(s, tc, 5 + (k === n - 1 ? 5 : 0), { x: s.centro.x + [0, 4, -4, 2, -3, 0][k], y: s.centro.y + [0, -4, 3, 5, -2, 0][k] })
    }
    const desce = janela(ms, p.contato + 300, p.fim - 300)
    if (desce !== null) setasDeStatus(ctx, origem, desce, AZUL, 2, true)
  },

  /** "Hits first and makes the target flinch. Only works the first turn." */
  fake_out(p, s) {
    const { ctx, ms } = s.c
    // Bate-palma bem na cara do alvo: duas palmas se fecham e ele se assusta.
    const fecha = janela(ms, 0, p.contato + 60)
    if (fecha !== null) {
      const u = ms < p.contato ? saida(ms / p.contato) : 1
      for (const lado of [-1, 1]) palma(ctx, { x: s.centro.x - s.ux * 8 + lado * (16 - 13 * u), y: s.centro.y - 6 }, lado * Math.PI / 2, .85, s.pele.nucleo, BRANCO)
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 8, { x: s.centro.x - s.ux * 8, y: s.centro.y - 6 })
    susto(ctx, s.c.alvo, 1 - limitar((t - .5) / .5))
  },

  /** "Slams the target with a long tail, vines, or a tentacle. Hit twice in a row." */
  double_hit(p, s) {
    const { ctx, ms } = s.c
    // Duas chicotadas seguidas, uma de cada lado, em arco.
    for (const [k, lado] of [[0, 1], [1, -1]] as const) {
      const ini = p.contato - 70 + k * 130
      const arco = janela(ms, ini, 110)
      if (arco !== null) {
        const a = Math.atan2(s.uy, s.ux) + Math.PI + lado * (1.4 - 1.4 * saida(arco))
        crescente(ctx, { x: s.centro.x + Math.cos(a) * 12, y: s.centro.y + Math.sin(a) * 10 }, 14, a + Math.PI - .9, a + Math.PI + .9, 3.4, arco, 0, s.pele, 1)
      }
      const tc = janela(ms, ini + 70, 220)
      if (tc !== null) choque(s, tc, 8, { x: s.centro.x + lado * 3, y: s.centro.y })
    }
  },

  /** "As long as this move is in use, the Attack stat rises each time the user is hit." */
  rage(p, s) {
    const { ctx, ms, origem } = s.c
    // Fúria acumulando: chamas vermelhas em volta de quem ataca e setas de Ataque subindo.
    const ferve = janela(ms, 0, p.contato + p.fim)
    if (ferve !== null) {
      const k = 1 - limitar((ms - p.contato - p.fim * .5) / (p.fim * .5))
      for (let i = 0; i < 4; i++) {
        const x = origem.x + (i - 1.5) * 6, h = (6 + 4 * Math.abs(Math.sin(ms / 60 + i))) * k
        poligono(ctx, [[x - 3, origem.y + 8], [x + 3, origem.y + 8], [x + .6, origem.y + 8 - h]], VERMELHO)
      }
      setasDeStatus(ctx, origem, ferve, VERMELHO, 2)
    }
    const vai = janela(ms, p.contato - 70, 70)
    if (vai !== null) rastro(ctx, origem, entrePontos(origem, s.centro, saida(vai)), s.c.pedir(3), 5, { ...s.pele, meio: VERMELHO }, rngSemeado(s.semente + 1))
    const t = janela(ms, s.contato, p.fim)
    if (t !== null) choque(s, t, 9)
  },

  /** "Risks everything to attack. The user faints but does damage equal to its HP." */
  final_gambit(p, s) {
    const { ctx, ms, origem } = s.c
    // Toda a vida de quem ataca sai do corpo como um globo dourado que esvazia
    // a barra de HP dele, voa e explode no alvo; quem atacou fica com o
    // redemoinho de desmaio.
    const sai = janela(ms, 0, p.contato)
    if (sai !== null) {
      barraDeHp(ctx, { x: origem.x, y: origem.y - 18 }, 1 - saida(limitar(sai / .5)))
      const r = 3 + 6 * saida(limitar(sai / .5))
      const q = entrePontos({ x: origem.x, y: origem.y - 4 }, s.centro, entrada(limitar((sai - .5) / .5)))
      ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(q.x, q.y, r + 1.4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = AMARELO; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = BRANCO; ctx.beginPath(); ctx.arc(q.x - r * .3, q.y - r * .3, r * .5, 0, Math.PI * 2); ctx.fill()
    }
    const t = janela(ms, s.contato, p.fim)
    if (t === null) return
    choque(s, t, 15)
    estilhacos(ctx, s.centro, s.c.pedir(5), 26, t, { ...s.pele, meio: AMARELO }, rngSemeado(s.semente + 2))
    // Desmaio: espiral girando sobre quem atacou.
    crescente(ctx, { x: origem.x, y: origem.y - 14 }, 5, t * 14, t * 14 + 5, 1.6, .5, 0, s.pele, .6)
  },
}

/** "Swings its body around violently to inflict damage on everything in its vicinity." (área) */
function brutalSwing(p: Perfil, c: ContextoVfx): void {
  const { ctx, ms, origem, raio, tier } = c
  const pele = c.pele
  const semente = Math.floor(c.rng() * 0xffffffff)
  // Giros violentos: arcos enormes de varrida rodando em volta de quem ataca,
  // cada volta mais aberta, até a borda da área; o chão inteiro apanha.
  for (let k = 0; k < 3; k++) {
    const t = janela(ms, k * 70, p.contato + 100)
    if (t === null) continue
    const r = (raio * .35 + raio * .6 * saida(t)) * (1 - k * .15)
    const a = t * Math.PI * 3 + k * 2
    ctx.save(); ctx.translate(origem.x, origem.y + 12); ctx.scale(1, .45)
    crescente(ctx, { x: 0, y: 0 }, r, a, a + 2.2, 7 - k * 1.5, .55, 0, { ...pele, meio: k ? pele.meio : VERMELHO }, 1)
    ctx.restore()
  }
  const t = janela(ms, p.contato, p.fim)
  if (t === null) return
  const rng = rngSemeado(semente + 1)
  // Estalos espalhados pelo INTERIOR da área (todo mundo dentro apanha).
  for (let k = 0; k < Math.min(c.pedir(6 + tier), 9); k++) {
    const q = noChao(origem, rng() * Math.PI * 2, raio * (.25 + rng() * .7))
    const tk = limitar((t - k * .05) / .7)
    if (tk > 0 && tk < 1) estrelaDeImpacto(ctx, { x: q.x, y: q.y - 8 }, 7, tk, pele, rngSemeado(semente + 10 + k))
  }
}

const peleDe = (id: string): Pele => {
  return comAcento(PELES[getAbility(id)?.type ?? 'FIGHTING'], LARANJA, VERMELHO, AZUL, VERDE, AMARELO, '#3a3040', '#c0603a', '#d8784a',
    PELES.GROUND.contorno, PELES.GROUND.base, PELES.GROUND.meio, PELES.ELECTRIC.meio, PELES.ELECTRIC.base, PELES.ELECTRIC.contorno)
}

export const LUTA_POR_GOLPE = montarFamilia(PERFIS_DE_LUTA, {
  desenhar: (p, c, id) => GOLPES[id](p, cena(p, c)),
  duracao: p => p.contato + p.fim,
  contato: p => p.contato,
  alcance: 56,
  margem: () => ({ cima: 75, baixo: 56, lados: 56 }),
  pele: id => peleDe(id),
})

export const LUTA_EM_AREA_POR_GOLPE = montarFamilia(PERFIS_DE_LUTA_EM_AREA, {
  desenhar: brutalSwing,
  duracao: p => p.contato + p.fim,
  contato: p => p.contato,
  alcance: 30,
  pele: id => peleDe(id),
})
