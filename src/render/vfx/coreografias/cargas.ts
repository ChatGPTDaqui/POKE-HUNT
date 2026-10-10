// Investida elemental e Cabeçada (09/10): doze golpes de carga, cada um
// desenhado a partir da DESCRIÇÃO do golpe (texto do jogo/PokeAPI), não de uma
// forma de família. A frase do jogo vai no comentário de cada golpe; o desenho
// é o que ela diz.
import { getAbility } from '@/data/abilities'
import { emitirParticulas } from '../particulas'
import { PELES } from '../paletas'
import { crescente, entrada, estilhacos, estrelaDeImpacto, limitar, pontosDeRaio, riscos, saida, tracarRaio } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, bola, brilho, comAcento, entrePontos, janela, montarFamilia, ondaDeChoque, poligono, proa, rastro } from './formas'

import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { preparo: number; viagem: number; recuo?: boolean; volta?: boolean; duracaoExtra?: number }

export const PERFIS_DE_INVESTIDA_ELEMENTAL: Record<string, Perfil> = {
  wild_charge: { preparo: 140, viagem: 120, recuo: true },
  spark: { preparo: 60, viagem: 100, duracaoExtra: 120 },
  volt_switch: { preparo: 60, viagem: 90, volta: true, duracaoExtra: 180 },
  flare_blitz: { preparo: 150, viagem: 130, recuo: true },
  flame_charge: { preparo: 80, viagem: 120, duracaoExtra: 160 },
  aqua_jet: { preparo: 40, viagem: 40 },
  dragon_rush: { preparo: 200, viagem: 110 },
}

export const PERFIS_DE_CABECADA: Record<string, Perfil> = {
  skull_bash: { preparo: 260, viagem: 110 },
  zen_headbutt: { preparo: 200, viagem: 110 },
  iron_head: { preparo: 110, viagem: 110 },
  head_smash: { preparo: 200, viagem: 120, recuo: true, duracaoExtra: 80 },
  wood_hammer: { preparo: 170, viagem: 120, recuo: true },
}

const CHOQUE = 280
const contatoDe = (p: Perfil) => p.preparo + p.viagem
const duracaoDe = (p: Perfil) => contatoDe(p) + CHOQUE + (p.duracaoExtra ?? 0)
const MADEIRA = PELES.GROUND

interface Cena {
  c: ContextoVfx; pele: Pele; semente: number; passo: number; tier: number
  angulo: number; ux: number; uy: number; L: number
  saidaDe: Ponto; chegada: Ponto; contato: number
}

function cena(perfil: Perfil, c: ContextoVfx): Cena {
  const { origem, alvo } = c
  const dx = alvo.x - origem.x, dy = alvo.y - origem.y, L = Math.hypot(dx, dy)
  const angulo = L > .01 ? Math.atan2(dy, dx) : c.angulo
  const ux = Math.cos(angulo), uy = Math.sin(angulo)
  return {
    c, pele: c.pele, semente: Math.floor(c.rng() * 0xffffffff), passo: Math.floor(c.ms / 66), tier: c.tier,
    angulo, ux, uy, L, contato: contatoDe(perfil),
    saidaDe: { x: origem.x + ux * 6, y: origem.y + uy * 6 }, chegada: { x: alvo.x - ux * 8, y: alvo.y - uy * 8 },
  }
}

function raios(ctx: CanvasRenderingContext2D, p: Ponto, raio: number, n: number, pele: Pele, semente: number, largura = 1.4): void {
  const rng = rngSemeado(semente)
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, r = raio * (.7 + rng() * .5)
    tracarRaio(ctx, pontosDeRaio({ x: p.x + Math.cos(a) * raio * .3, y: p.y + Math.sin(a) * raio * .3 }, { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }, 3, 2, rng), largura, pele)
  }
}

/** Setas de aumento de status (↑) subindo em volta de alguém. */
function setasDeStatus(ctx: CanvasRenderingContext2D, p: Ponto, t: number, cor: string, n = 3): void {
  for (let k = 0; k < n; k++) {
    const u = (t * 1.4 + k / n) % 1, x = p.x + (k - (n - 1) / 2) * 9, y = p.y + 8 - u * 22
    const s = 3.4 * (1 - entrada(u))
    if (s < .5) continue
    poligono(ctx, [[x, y - s - 1.4], [x + s + 1.4, y + 1], [x + s * .4 + .8, y + 1], [x + s * .4 + .8, y + s + 1.4], [x - s * .4 - .8, y + s + 1.4], [x - s * .4 - .8, y + 1], [x - s - 1.4, y + 1]], ESCURO)
    poligono(ctx, [[x, y - s], [x + s, y], [x + s * .4, y], [x + s * .4, y + s], [x - s * .4, y + s], [x - s * .4, y], [x - s, y]], cor)
  }
}

/** Recuo: o golpe machuca quem bateu — estalo do lado de quem atacou. */
function recuo(s: Cena, t: number, tamanho: number): void {
  const tr = (t - .12) / .7
  if (tr > 0 && tr < 1) estrelaDeImpacto(s.c.ctx, { x: s.c.origem.x, y: s.c.origem.y - 3 }, tamanho, tr, s.pele, rngSemeado(s.semente + 80))
}

function choqueBase(s: Cena, t: number, forte: boolean): void {
  const { ctx, alvo } = s.c
  const rng = rngSemeado(s.semente + 50)
  estrelaDeImpacto(ctx, alvo, (forte ? 14 : 10) + s.tier * 1.5, t, s.pele, rng)
  riscos(ctx, alvo, s.c.pedir(2 + s.tier), 20 + s.tier * 4, t, s.pele.meio, rng)
}

// ---------------------------------------------------------------------------
// Golpe a golpe
// ---------------------------------------------------------------------------

const GOLPES: Record<string, (p: Perfil, s: Cena) => void> = {
  /** "Shrouds itself in electricity and smashes into its target. Also damages the user a little." */
  wild_charge(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Casulo elétrico: uma bola de raios envolvendo o corpo, que cresce e depois sai.
    const tp = janela(ms, 0, p.preparo)
    if (tp !== null) {
      // Casulo de raios em volta (sem bola cheia: ela apagava quem ataca).
      crescente(ctx, origem, 9 + 4 * saida(tp), -Math.PI, Math.PI, 2, .5, 0, s.pele, 1)
      raios(ctx, origem, 10 + 8 * saida(tp), 3, s.pele, s.semente + s.passo, 1.4)
    }
    const u = janela(ms, p.preparo, p.viagem)
    if (u !== null) {
      const q = entrePontos(s.saidaDe, s.chegada, saida(u))
      rastro(ctx, s.saidaDe, q, s.c.pedir(3 + s.tier), 9, s.pele, rngSemeado(s.semente + 1))
      bola(ctx, q, 8, s.pele, s.pele.meio, s.pele.nucleo)
      raios(ctx, q, 20, 4, s.pele, s.semente + 30 + s.passo, 1.6)
    }
    const t = janela(ms, s.contato, CHOQUE)
    if (t === null) return
    choqueBase(s, t, true)
    if (t < .6) raios(ctx, alvo, 22 + s.tier * 2, 4, s.pele, s.semente + 60 + s.passo, 2 * (1 - t))
    // O raio volta e acerta quem atacou: o recuo é elétrico.
    if (t > .1 && t < .5) tracarRaio(ctx, pontosDeRaio(alvo, origem, 7, 3, rngSemeado(s.semente + 70 + s.passo)), 1.6, s.pele)
    recuo(s, t, 8)
  },

  /** "Throws an electrically charged tackle. May leave the target with paralysis." */
  spark(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Faíscas estalando nas bochechas/corpo antes da trombada.
    const tp = janela(ms, 0, p.preparo)
    if (tp !== null) for (const lado of [-1, 1]) brilho(ctx, origem.x + lado * 7, origem.y - 3, 2.4 * (Math.floor(ms / 33) % 2 ? 1 : .6), s.pele.meio)
    const u = janela(ms, p.preparo, p.viagem)
    if (u !== null) {
      const q = entrePontos(s.saidaDe, s.chegada, saida(u))
      rastro(ctx, s.saidaDe, q, s.c.pedir(2 + s.tier), 5, s.pele, rngSemeado(s.semente + 1))
      proa(ctx, q, s.angulo, .55, 1, s.pele)
      raios(ctx, q, 10, 1, s.pele, s.semente + s.passo, 1.2)
    }
    const t = janela(ms, s.contato, CHOQUE + 120)
    if (t === null) return
    if (t < .7) choqueBase(s, t / .7, false)
    // Paralisia: estática presa no alvo — zigue-zagues curtos que tremem em cima dele.
    const k = saida(limitar(t / .2)) * (1 - entrada(limitar((t - .7) / .3)))
    if (k > .1) for (let i = 0; i < 3; i++) {
      const rng = rngSemeado(s.semente + 90 + i * 7 + s.passo)
      const a = { x: alvo.x - 9 + i * 9, y: alvo.y - 10 + rng() * 4 }
      tracarRaio(ctx, pontosDeRaio(a, { x: a.x + (rng() - .5) * 6, y: a.y + 14 }, 3, 2, rng), 1.2 * k, s.pele)
    }
  },

  /** "After making its attack, the user rushes back to switch places with a party Pokémon." */
  volt_switch(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    const u = janela(ms, p.preparo - 40, p.viagem + 40)
    if (u !== null) {
      // Raio sai de quem ataca e vai até o alvo.
      const fim = entrePontos(origem, alvo, saida(u))
      tracarRaio(ctx, pontosDeRaio(origem, fim, 6, 3, rngSemeado(s.semente + s.passo)), 2, s.pele)
    }
    const t = janela(ms, s.contato, CHOQUE)
    if (t !== null) choqueBase(s, t, false)
    // E VOLTA: uma bola elétrica corre de volta pra quem atacou...
    const tv = janela(ms, s.contato + 60, 140)
    if (tv !== null) {
      const v = saida(tv), q = entrePontos(alvo, origem, v)
      q.y -= Math.sin(v * Math.PI) * 14
      bola(ctx, q, 4.6, s.pele)
      raios(ctx, q, 9, 1, s.pele, s.semente + 40 + s.passo, 1.1)
    }
    // ...e quem atacou vira um facho de luz de troca (o recolher da Poké Ball).
    const tt = janela(ms, s.contato + 190, 180)
    if (tt !== null) {
      const h = 34 * saida(limitar(tt / .3)), w = 9 * (1 - entrada(limitar((tt - .5) / .5)))
      if (w > .4) {
        poligono(ctx, [[origem.x - w - 1.4, origem.y + 12], [origem.x + w + 1.4, origem.y + 12], [origem.x + w * .5 + 1.4, origem.y + 12 - h], [origem.x - w * .5 - 1.4, origem.y + 12 - h]], s.pele.contorno)
        poligono(ctx, [[origem.x - w, origem.y + 12], [origem.x + w, origem.y + 12], [origem.x + w * .5, origem.y + 12 - h], [origem.x - w * .5, origem.y + 12 - h]], s.pele.meio)
        poligono(ctx, [[origem.x - w * .4, origem.y + 12], [origem.x + w * .4, origem.y + 12], [origem.x + w * .2, origem.y + 12 - h], [origem.x - w * .2, origem.y + 12 - h]], BRANCO)
      }
    }
  },

  /** "Cloaks itself in fire and charges. Damages the user quite a lot. May burn." */
  flare_blitz(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Manto de fogo: o corpo inteiro some numa labareda que cresce no lugar.
    const tp = janela(ms, 0, p.preparo)
    if (tp !== null) emitirParticulas(ctx, s.pele, { x: origem.x, y: origem.y + 8 }, s.c.pedir(5 + s.tier), 12 + 6 * tp, (tp * 1.5) % 1, 6, rngSemeado(s.semente + 1))
    const u = janela(ms, p.preparo, p.viagem)
    if (u !== null) {
      // Cometa de fogo: cabeça grande, cauda longa de chamas.
      const q = entrePontos(s.saidaDe, s.chegada, saida(u))
      for (let k = 6; k >= 0; k--) {
        const r = 10 - k * 1.2, atras = { x: q.x - s.ux * k * 5, y: q.y - s.uy * k * 5 + Math.sin(k + ms / 40) * 1.5 }
        bola(ctx, atras, r, s.pele, k > 3 ? s.pele.base : s.pele.meio, k > 3 ? s.pele.meio : s.pele.nucleo)
      }
      emitirParticulas(ctx, s.pele, q, s.c.pedir(4 + s.tier), 14, (u * 1.4) % 1, 5, rngSemeado(s.semente + 2))
    }
    const t = janela(ms, s.contato, CHOQUE)
    if (t === null) return
    choqueBase(s, t, true)
    emitirParticulas(ctx, s.pele, alvo, s.c.pedir(6 + s.tier), 26 + s.tier * 2, t, 6, rngSemeado(s.semente + 3))
    // Recuo pesado: quem atacou também pega fogo.
    emitirParticulas(ctx, s.pele, origem, s.c.pedir(3), 12, limitar(t * 1.2), 4, rngSemeado(s.semente + 4))
    recuo(s, t, 9)
  },

  /** "Cloaking itself in flame, the user attacks. Then, building up more power, raises its Speed." */
  flame_charge(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    const u = janela(ms, p.preparo, p.viagem)
    if (u !== null) {
      const q = entrePontos(s.saidaDe, s.chegada, saida(u))
      rastro(ctx, s.saidaDe, q, s.c.pedir(2 + s.tier), 5, s.pele, rngSemeado(s.semente + 1))
      emitirParticulas(ctx, s.pele, q, s.c.pedir(3 + s.tier), 9, (u * 1.6) % 1, 4, rngSemeado(s.semente + 2))
    }
    const t = janela(ms, s.contato, CHOQUE)
    if (t !== null) {
      choqueBase(s, t, false)
      emitirParticulas(ctx, s.pele, alvo, s.c.pedir(3 + s.tier), 18, t, 4, rngSemeado(s.semente + 3))
    }
    // Depois do golpe, a Speed sobe: setas de fogo subindo em quem atacou, com riscos de velocidade.
    const ts = janela(ms, s.contato + 80, CHOQUE + 80)
    if (ts !== null) {
      setasDeStatus(ctx, origem, ts, s.pele.meio)
      rastro(ctx, { x: origem.x - s.ux * 14, y: origem.y + 6 }, { x: origem.x - s.ux * 2, y: origem.y + 6 }, s.c.pedir(2), 6, s.pele, rngSemeado(s.semente + 5), 1 - ts)
    }
  },

  /** "Lunges at the target at a speed that makes it almost invisible. Always goes first." */
  aqua_jet(_p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Quase invisível: nada de corpo viajando — um traço d'água instantâneo de
    // ponta a ponta que fica e se desfaz em gotas.
    const t = janela(ms, 40, 220)
    if (t !== null) {
      const fio = 1 - entrada(limitar((t - .25) / .5))
      if (fio > .05) {
        for (const [w, cor] of [[6 * fio + 1.6, s.pele.contorno], [5 * fio, s.pele.base], [2.2 * fio, BRANCO]] as const) {
          ctx.strokeStyle = cor; ctx.lineWidth = w; ctx.lineCap = 'round'
          ctx.beginPath(); ctx.moveTo(origem.x, origem.y); ctx.lineTo(s.chegada.x, s.chegada.y); ctx.stroke()
        }
      }
      for (let k = 1; k < 6; k++) {
        const q = entrePontos(origem, s.chegada, k / 6)
        bola(ctx, { x: q.x, y: q.y + 14 * t * t * (k % 2 ? 1 : .6) }, 2.2 * (1 - t), s.pele)
      }
    }
    const tc = janela(ms, s.contato, CHOQUE)
    if (tc === null) return
    choqueBase(s, tc, false)
    for (let k = 0; k < Math.min(s.c.pedir(5 + s.tier), 8); k++) {
      const a = -Math.PI / 2 + (k / 7 - .5) * 2.4, v = 16 + (k % 3) * 4
      bola(ctx, { x: alvo.x + Math.cos(a) * v * tc, y: alvo.y - 2 + Math.sin(a) * v * tc + 30 * tc * tc }, 2.4 * (1 - limitar((tc - .6) / .4)), s.pele)
    }
  },

  /** "Tackles the target while exhibiting overwhelming menace. May make the target flinch." */
  dragon_rush(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // A ameaça: uma cabeça de dragão de energia se ergue sobre quem ataca e
    // ruge (boca abre), depois avança junto com a carga.
    const tp = janela(ms, 0, p.preparo + p.viagem)
    if (tp !== null) {
      const sobe = saida(limitar(ms / p.preparo))
      const u = limitar((ms - p.preparo) / p.viagem)
      const q = entrePontos({ x: origem.x, y: origem.y - 10 * sobe }, s.chegada, saida(u))
      const ruge = ms < p.preparo ? Math.abs(Math.sin(ms / 50)) : 1
      cabecaDeDragao(ctx, q, s.ux < 0, .55 + .25 * sobe + s.tier * .03, ruge, s.pele)
      if (u > 0) rastro(ctx, s.saidaDe, q, s.c.pedir(3 + s.tier), 9, s.pele, rngSemeado(s.semente + 1))
    }
    const t = janela(ms, s.contato, CHOQUE)
    if (t === null) return
    choqueBase(s, t, true)
    ondaDeChoque(ctx, alvo, s.angulo, t, 16 + s.tier * 2, 2, s.pele)
    // Recuo de medo no alvo (flinch): três linhas de susto acima da cabeça.
    const k = 1 - limitar((t - .5) / .5)
    if (k > 0) for (const dx of [-6, 0, 6]) poligono(ctx, [[alvo.x + dx - 1, alvo.y - 16], [alvo.x + dx + 1, alvo.y - 16], [alvo.x + dx * 1.4 + .6, alvo.y - 16 - 7 * k], [alvo.x + dx * 1.4 - .6, alvo.y - 16 - 7 * k]], ESCURO)
  },

  /** "Tucks in its head to raise its Defense on the first turn, then rams the target." */
  skull_bash(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Turno 1: encolhe atrás de um escudo hexagonal e a Defesa sobe (setas).
    const tp = janela(ms, 0, p.preparo)
    if (tp !== null) {
      escudo(ctx, origem, 6 + 10 * saida(limitar(tp * 1.6)), s.pele)
      setasDeStatus(ctx, origem, tp, s.pele.meio, 2)
    }
    const u = janela(ms, p.preparo, p.viagem)
    if (u !== null) {
      const q = entrePontos(s.saidaDe, s.chegada, saida(u))
      rastro(ctx, s.saidaDe, q, s.c.pedir(3 + s.tier), 7, s.pele, rngSemeado(s.semente + 1))
      proa(ctx, q, s.angulo, .8, 1.2, s.pele)
      escudo(ctx, q, 14, s.pele)
    }
    const t = janela(ms, s.contato, CHOQUE)
    if (t === null) return
    choqueBase(s, t, true)
    ondaDeChoque(ctx, alvo, s.angulo, t, 18 + s.tier * 2, 2, s.pele)
  },

  /** "Focuses its willpower to its head and attacks the target. May make the target flinch." */
  zen_headbutt(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Força de vontade concentrada NA CABEÇA: uma joia de luz rosa acima de
    // quem ataca, que encolhe enquanto brilha mais (concentração).
    const cabeca = { x: origem.x, y: origem.y - 13 }
    const tp = janela(ms, 0, p.preparo)
    if (tp !== null) {
      for (let k = 0; k < 3; k++) {
        const v = (tp * 2 + k / 3) % 1
        crescente(ctx, cabeca, 18 * (1 - v) + 3, -Math.PI, Math.PI, 1.8, .5, 0, s.pele, .7)
      }
      bola(ctx, cabeca, 2.5 + 2 * tp, s.pele, s.pele.meio, s.pele.nucleo)
    }
    const u = janela(ms, p.preparo, p.viagem)
    if (u !== null) {
      const q = entrePontos(cabeca, { x: s.chegada.x, y: s.chegada.y - 6 }, saida(u))
      rastro(ctx, cabeca, q, s.c.pedir(2 + s.tier), 4, s.pele, rngSemeado(s.semente + 1))
      bola(ctx, q, 5, s.pele, s.pele.meio, s.pele.nucleo)
    }
    const t = janela(ms, s.contato, CHOQUE)
    if (t === null) return
    choqueBase(s, t, false)
    for (let k = 0; k < 2; k++) {
      const v = limitar((t - k * .15) / .8)
      if (v > 0 && v < 1) crescente(ctx, { x: alvo.x, y: alvo.y - 6 }, 6 + v * 12, -Math.PI, Math.PI, 2.2 * (1 - v) + .4, .5, 0, s.pele, .8)
    }
  },

  /** "Slams the target with its steel-hard head. May make the target flinch." */
  iron_head(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Cabeça de aço: um elmo de metal brilha em quem ataca; no choque, CLANG —
    // anéis de sino vibrando e fagulhas.
    const tp = janela(ms, 0, p.preparo + p.viagem)
    if (tp !== null) {
      const u = limitar((ms - p.preparo) / p.viagem)
      const q = entrePontos({ x: origem.x, y: origem.y - 6 }, { x: s.chegada.x, y: s.chegada.y - 4 }, saida(u))
      elmo(ctx, q, s.ux < 0, .9 + s.tier * .04, s.pele, limitar(ms / p.preparo))
      if (u > 0) rastro(ctx, s.saidaDe, q, s.c.pedir(2 + s.tier), 5, s.pele, rngSemeado(s.semente + 1))
    }
    const t = janela(ms, s.contato, CHOQUE)
    if (t === null) return
    choqueBase(s, t, false)
    for (let k = 0; k < 3; k++) {
      const v = limitar((t - k * .1) / .6)
      if (v <= 0 || v >= 1) continue
      ctx.strokeStyle = k % 2 ? s.pele.meio : BRANCO; ctx.lineWidth = 2 * (1 - v) + .5
      ctx.beginPath(); ctx.ellipse(alvo.x, alvo.y - 3, 8 + v * 16, (8 + v * 16) * .55, 0, 0, Math.PI * 2); ctx.stroke()
    }
    const rng = rngSemeado(s.semente + 60)
    for (let k = 0; k < Math.min(s.c.pedir(3 + s.tier), 6); k++) {
      const a = rng() * Math.PI * 2, d = (8 + rng() * 14) * saida(t)
      brilho(ctx, alvo.x + Math.cos(a) * d, alvo.y + Math.sin(a) * d * .8, 2.4 * (1 - t), s.pele.acento?.[1] ?? s.pele.meio)
    }
  },

  /** "Attacks with a hazardous, full-power headbutt. This also damages the user terribly." */
  head_smash(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Força total: quem ataca recua (carrega pra trás) antes de sair.
    const tp = janela(ms, 0, p.preparo)
    if (tp !== null) estilhacos(ctx, origem, s.c.pedir(3), 10 + tp * 6, 1 - tp, s.pele, rngSemeado(s.semente + 2))
    const u = janela(ms, p.preparo, p.viagem)
    if (u !== null) {
      const q = entrePontos(s.saidaDe, s.chegada, entrada(u))
      rastro(ctx, s.saidaDe, q, s.c.pedir(3 + s.tier), 8, s.pele, rngSemeado(s.semente + 1))
      proa(ctx, q, s.angulo, .85, 1.1, s.pele)
    }
    const t = janela(ms, s.contato, CHOQUE + 80)
    if (t === null) return
    choqueBase(s, t, true)
    // O choque racha o ar: rachaduras grandes saindo do ponto de impacto.
    const k = saida(limitar(t / .15)) * (1 - entrada(limitar((t - .5) / .5)))
    if (k > .05) for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + .3, rng = rngSemeado(s.semente + 90 + i)
      tracarRaio(ctx, pontosDeRaio(alvo, { x: alvo.x + Math.cos(a) * 24 * k, y: alvo.y + Math.sin(a) * 18 * k }, 4, 2, rng), 2 * k, { ...s.pele, meio: s.pele.base, nucleo: BRANCO })
    }
    estilhacos(ctx, alvo, s.c.pedir(5 + s.tier), 28 + s.tier * 3, t, s.pele, rngSemeado(s.semente + 3))
    // Recuo TERRÍVEL: estrela grande e pedrinhas caindo em quem atacou.
    recuo(s, t, 12)
    estilhacos(ctx, { x: origem.x, y: origem.y - 6 }, s.c.pedir(3), 12, limitar(t * 1.3), s.pele, rngSemeado(s.semente + 4))
  },

  /** "Slams its rugged body into the target. This also damages the user quite a lot." */
  wood_hammer(p, s) {
    const { ctx, ms, origem, alvo } = s.c
    // Um tronco de madeira (o "martelo") se ergue atrás de quem ataca e desce
    // em arco sobre o alvo, como uma marretada.
    const t0 = janela(ms, 0, p.preparo + p.viagem + 90)
    if (t0 !== null) {
      const u = limitar((ms - p.preparo) / p.viagem)
      const giro = ms < p.preparo ? -1.9 * saida(ms / p.preparo) : -1.9 + 2.6 * entrada(u)
      // Fica um instante cravado no alvo depois da marretada.
      const pivo = entrePontos(origem, alvo, .25)
      const lado = s.ux < 0 ? -1 : 1
      tronco(ctx, pivo, giro * lado + (lado < 0 ? Math.PI : 0), 26 + s.tier, s.pele)
    }
    const t = janela(ms, s.contato, CHOQUE)
    if (t === null) return
    choqueBase(s, t, true)
    estilhacos(ctx, alvo, s.c.pedir(4 + s.tier), 24 + s.tier * 3, t, MADEIRA, rngSemeado(s.semente + 3))
    emitirParticulas(ctx, s.pele, alvo, s.c.pedir(3), 18, t, 4, rngSemeado(s.semente + 5))
    recuo(s, t, 9)
  },
}

function escudo(ctx: CanvasRenderingContext2D, p: Ponto, r: number, pele: Pele): void {
  const pts = Array.from({ length: 6 }, (_, i) => [p.x + Math.cos(i * Math.PI / 3 + Math.PI / 6) * r, p.y + Math.sin(i * Math.PI / 3 + Math.PI / 6) * r * .9] as const)
  ctx.lineJoin = 'miter'
  for (const [w, cor] of [[3.6, pele.contorno], [2, pele.meio], [.8, BRANCO]] as const) {
    ctx.strokeStyle = cor; ctx.lineWidth = w; ctx.beginPath()
    pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke()
  }
}

/** Cabeça de dragão de perfil (focinho pra +X), boca abrindo com `ruge`. */
function cabecaDeDragao(ctx: CanvasRenderingContext2D, p: Ponto, vira: boolean, s: number, ruge: number, pele: Pele): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(s * (vira ? -1 : 1), s)
  const abre = 5 * ruge
  const cima: [number, number][] = [[-14, -8], [-6, -14], [-2, -20], [0, -13], [8, -11], [18, -6 - abre * .4], [16, -2 - abre * .3], [-14, 0]]
  const baixo: [number, number][] = [[-14, 0], [14, 1 + abre * .6], [12, 5 + abre], [-12, 8]]
  for (const [g, cor] of [[1.4, pele.contorno], [0, pele.base]] as const) {
    poligono(ctx, cima.map(([x, y]) => [x * (1 + g / 14), y * (1 + g / 14)] as const), cor)
    poligono(ctx, baixo.map(([x, y]) => [x * (1 + g / 14), y * (1 + g / 14)] as const), cor)
  }
  poligono(ctx, [[-10, -8], [-4, -12], [6, -9], [14, -5], [-10, -3]], pele.meio)
  for (const x of [6, 10, 14]) poligono(ctx, [[x - 1.2, -1.6 - abre * .25], [x + 1.2, -1.6 - abre * .25], [x, 1.4 - abre * .1]], BRANCO)
  ctx.fillStyle = BRANCO; ctx.fillRect(1, -10, 3, 2)
  ctx.fillStyle = ESCURO; ctx.fillRect(2.4, -10, 1.2, 2)
  ctx.restore()
}

/** Elmo de aço que brilha com uma faixa de reflexo (Iron Head). */
function elmo(ctx: CanvasRenderingContext2D, p: Ponto, vira: boolean, s: number, pele: Pele, brilhoT: number): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(s * (vira ? -1 : 1), s)
  const forma = (g: number) => { ctx.beginPath(); ctx.moveTo(-9 - g, 4 + g); ctx.quadraticCurveTo(-10 - g, -10 - g, 2, -10 - g); ctx.quadraticCurveTo(12 + g, -9 - g, 11 + g, 4 + g); ctx.closePath() }
  forma(1.5); ctx.fillStyle = pele.contorno; ctx.fill()
  forma(0); ctx.fillStyle = pele.base; ctx.fill()
  ctx.save(); ctx.translate(2, -2); ctx.scale(.7, .65); forma(0); ctx.fillStyle = pele.meio; ctx.fill(); ctx.restore()
  const x = -6 + brilhoT * 14
  poligono(ctx, [[x, -8], [x + 2.4, -8], [x - 1, 3], [x - 3.4, 3]], BRANCO)
  ctx.restore()
}

/** Tronco de madeira com anéis na ponta, girando em volta de `pivo`. */
function tronco(ctx: CanvasRenderingContext2D, pivo: Ponto, angulo: number, comp: number, pele: Pele): void {
  ctx.save(); ctx.translate(pivo.x, pivo.y); ctx.rotate(angulo)
  poligono(ctx, [[-2, -6.4], [comp + 1.4, -6.4], [comp + 1.4, 6.4], [-2, 6.4]], ESCURO)
  poligono(ctx, [[-.6, -5], [comp, -5], [comp, 5], [-.6, 5]], MADEIRA.base)
  poligono(ctx, [[-.6, -5], [comp, -5], [comp, -2], [-.6, -2]], MADEIRA.meio)
  for (const x of [comp * .3, comp * .6]) { ctx.fillStyle = MADEIRA.contorno; ctx.fillRect(x, -5, 1.2, 10) }
  ctx.fillStyle = MADEIRA.nucleo; ctx.beginPath(); ctx.ellipse(comp, 0, 2.6, 5, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = MADEIRA.base; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(comp, 0, 1.2, 2.6, 0, 0, Math.PI * 2); ctx.stroke()
  // Folhas presas no tronco: é Grass.
  poligono(ctx, [[comp * .45, -5], [comp * .55, -10], [comp * .65, -5]], pele.base)
  ctx.restore()
}

function desenhar(id: string) {
  return (perfil: Perfil, c: ContextoVfx) => GOLPES[id](perfil, cena(perfil, c))
}

const peleDe = (id: string): Pele | undefined => id === 'wood_hammer'
  ? comAcento(PELES[getAbility(id)?.type ?? 'GRASS'], MADEIRA.contorno, MADEIRA.base, MADEIRA.meio, MADEIRA.nucleo)
  : undefined

const opcoes = {
  desenhar: (p: Perfil, c: ContextoVfx, id: string) => desenhar(id)(p, c),
  duracao: duracaoDe, contato: contatoDe, alcance: 62, pele: peleDe,
  margem: () => ({ cima: 70, baixo: 62, lados: 62 }),
}
export const INVESTIDAS_ELEMENTAIS_POR_GOLPE = montarFamilia(PERFIS_DE_INVESTIDA_ELEMENTAL, opcoes)
export const CABECADAS_POR_GOLPE = montarFamilia(PERFIS_DE_CABECADA, opcoes)
