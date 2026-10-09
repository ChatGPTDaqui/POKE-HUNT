// Família Lâmina (09/10): nove golpes de corte.
//
// A forma é o ARCO DE CORTE: um crescente que nasce pela cabeça, atravessa o
// alvo e se recolhe pela cauda (primitiva `crescente`). Garra são três riscos
// paralelos; lâmina é UM gume limpo e largo. Cada golpe muda a inclinação, o
// número de cortes (o X do Cross Chop/Cross Poison, a escada do Fury Cutter),
// de onde vem (o Psycho Cut é arremessado, o Night Slash sai de trás do alvo)
// e o que sobra (gotas, veneno, brilho).
import { crescente, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, bola, brilho, entrePontos, janela, montarFamilia, rastro, talho } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Corte {
  /** ms depois do início do primeiro corte. */
  atraso: number
  /** Ângulo do meio do arco (direção em que o gume passa pelo alvo). */
  meio: number
  raio: number
  /** Abertura do arco em radianos. */
  arco: number
  espessura: number
  /** true: gume reto (Karate Chop) no lugar do arco. */
  reto?: boolean
}

type Extra = 'nenhum' | 'sombra' | 'arremesso' | 'varrida' | 'concha' | 'veneno'

interface Perfil {
  contato: number
  cortes: readonly Corte[]
  extra: Extra
  /** Usa o meio (não o núcleo) como cor do gume: corte colorido do tipo. */
  colorido?: boolean
}

const DIAG = -.75, CONTRA = Math.PI + .75

export const PERFIS_DE_LAMINA: Record<string, Perfil> = {
  slash: { contato: 130, extra: 'nenhum', cortes: [{ atraso: 0, meio: DIAG, raio: 20, arco: 1.9, espessura: 5 }] },
  night_slash: { contato: 120, extra: 'sombra', colorido: true, cortes: [{ atraso: 0, meio: CONTRA, raio: 20, arco: 2, espessura: 5.5 }] },
  karate_chop: { contato: 110, extra: 'nenhum', colorido: true, cortes: [{ atraso: 0, meio: Math.PI / 2, raio: 0, arco: 0, espessura: 4.2, reto: true }] },
  cross_chop: {
    contato: 150, extra: 'nenhum', colorido: true, cortes: [
      { atraso: 0, meio: 0, raio: 0, arco: .8, espessura: 4.6, reto: true },
      { atraso: 80, meio: 0, raio: 0, arco: -.8, espessura: 4.6, reto: true },
    ],
  },
  psycho_cut: { contato: 200, extra: 'arremesso', colorido: true, cortes: [{ atraso: 0, meio: DIAG, raio: 18, arco: 1.8, espessura: 5 }] },
  aerial_ace: { contato: 150, extra: 'varrida', cortes: [{ atraso: 0, meio: -1.4, raio: 24, arco: 2.8, espessura: 4.4 }] },
  razor_shell: {
    contato: 140, extra: 'concha', colorido: true, cortes: [
      { atraso: 0, meio: DIAG, raio: 18, arco: 1.7, espessura: 5 },
      { atraso: 70, meio: CONTRA - Math.PI / 2, raio: 18, arco: 1.7, espessura: 5 },
    ],
  },
  fury_cutter: {
    contato: 100, extra: 'nenhum', colorido: true, cortes: [
      { atraso: 0, meio: DIAG, raio: 11, arco: 1.6, espessura: 3 },
      { atraso: 70, meio: CONTRA, raio: 15, arco: 1.7, espessura: 3.8 },
      { atraso: 140, meio: DIAG + .3, raio: 20, arco: 1.9, espessura: 4.8 },
    ],
  },
  cross_poison: {
    contato: 140, extra: 'veneno', colorido: true, cortes: [
      { atraso: 0, meio: DIAG, raio: 19, arco: 1.8, espessura: 4.8 },
      { atraso: 60, meio: -Math.PI - DIAG, raio: 19, arco: 1.8, espessura: 4.8 },
    ],
  },
}

/** Vida de cada corte: cresce, atravessa e se recolhe. */
const CORTE = 230
const ultimoCorte = (p: Perfil) => p.cortes[p.cortes.length - 1].atraso
const duracaoDe = (p: Perfil) => p.contato + ultimoCorte(p) + CORTE + 140

/** Gume reto de cima pra baixo (inclinado por `inclina`), como uma mão em cutelo. */
function gumeReto(ctx: CanvasRenderingContext2D, alvo: Ponto, inclina: number, t: number, esp: number, pele: Pele, cor: string): void {
  const L = 16, ux = Math.sin(inclina), uy = Math.cos(inclina)
  const a = { x: alvo.x - ux * L, y: alvo.y - uy * L - 2 }, b = { x: alvo.x + ux * L, y: alvo.y + uy * L - 2 }
  talho(ctx, a, b, esp, t / .3, (t - .45) / .55, pele, cor)
}

function desenhar(perfil: Perfil, c: ContextoVfx): void {
  const { ctx, ms, tier, origem, alvo } = c
  const pele = c.pele
  const semente = Math.floor(c.rng() * 0xffffffff)
  const centro = { x: alvo.x, y: alvo.y - 3 }
  const escala = 1 + (tier - 1) * .07
  const gume = perfil.colorido ? pele.meio : pele.nucleo
  const comeco = perfil.contato - 70

  // Night Slash: um instante de escuridão (meia-lua escura) atrás do alvo antes do corte.
  if (perfil.extra === 'sombra') {
    const t = janela(ms, comeco - 80, 120)
    if (t !== null) crescente(ctx, centro, 16, CONTRA - 1, CONTRA + 1, 4, .5, 0, { ...pele, meio: pele.base, nucleo: pele.contorno }, 1)
  }
  // Psycho Cut: a lâmina é arremessada de quem ataca e gira até o alvo.
  if (perfil.extra === 'arremesso') {
    const t = janela(ms, comeco - 110, 120)
    if (t !== null) {
      const p = entrePontos(origem, centro, saida(t))
      const giro = t * Math.PI * 3
      crescente(ctx, p, 9, giro - .9, giro + .9, 3.6, .55, 0, pele, 1)
      rastro(ctx, origem, p, c.pedir(2 + tier), 4, pele, rngSemeado(semente + 1), .8)
    }
  }
  // Aerial Ace: rastro de velocidade de quem ataca até o alvo, antes da varrida.
  if (perfil.extra === 'varrida') {
    const t = janela(ms, comeco - 60, 100)
    if (t !== null) rastro(ctx, origem, centro, c.pedir(3 + tier), 8, pele, rngSemeado(semente + 2), 1 - t * .5)
  }

  perfil.cortes.forEach((corte, i) => {
    const ini = comeco + corte.atraso
    const t = janela(ms, ini, CORTE)
    // Estrela atrás do gume, no contato deste corte.
    const tc = janela(ms, ini + 70, 240)
    const rng = rngSemeado(semente + 10 + i)
    if (tc !== null) estrelaDeImpacto(ctx, centro, 7 + tier * 1.2 + (perfil.cortes.length > 1 && i === perfil.cortes.length - 1 ? 3 : 0), tc, pele, rng)
    if (t === null) return
    const esp = corte.espessura * escala
    if (corte.reto) gumeReto(ctx, centro, corte.arco, t, esp, pele, gume)
    else {
      const R = corte.raio * escala
      const c0 = { x: centro.x - Math.cos(corte.meio) * R, y: centro.y - Math.sin(corte.meio) * R }
      crescente(ctx, c0, R, corte.meio - corte.arco / 2, corte.meio + corte.arco / 2, esp, t, 0, { ...pele, meio: gume, nucleo: BRANCO }, 1)
    }
    if (tc !== null) riscos(ctx, centro, c.pedir(2 + tier), 18 + tier * 3, tc, pele.meio, rng)
  })

  // Rescaldo depois do último corte.
  const t = janela(ms, comeco + ultimoCorte(perfil) + 70, 300)
  if (t === null) return
  const rng = rngSemeado(semente + 50)
  if (perfil.extra === 'concha' || perfil.extra === 'veneno') {
    // Gotas (água / veneno) que espirram do gume e caem.
    for (let k = 0; k < Math.min(c.pedir(3 + tier), 6); k++) {
      const a = -Math.PI / 2 + (rng() - .5) * 2.6, v = 12 + rng() * 10
      const p = { x: centro.x + Math.cos(a) * v * t, y: centro.y + Math.sin(a) * v * t + 28 * t * t }
      bola(ctx, p, 2 * (1 - limitar((t - .6) / .4)), pele)
    }
  }
  if (perfil.extra === 'varrida') brilho(ctx, centro.x + 10, centro.y - 10, 3.6 * (1 - t), BRANCO)
}

export const LAMINAS_POR_GOLPE = montarFamilia(PERFIS_DE_LAMINA, {
  desenhar,
  duracao: duracaoDe,
  contato: p => p.contato,
  alcance: 46,
})
