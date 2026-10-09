// Famílias Investida elemental e Cabeçada (09/10): doze golpes de carga.
//
// Mesma PROA da família Investida (o VFX não move o corpo de quem ataca),
// agora VESTIDA pelo elemento ou pela cabeça: raios em volta da proa (Wild
// Charge, Spark, Volt Switch), corpo em chamas (Flare Blitz), trilha de fogo
// no chão (Flame Charge), jato d'água (Aqua Jet), aura de dragão (Dragon
// Rush), anéis psíquicos (Zen Headbutt), brilho de aço (Iron Head), pedras
// girando (Head Smash), farpas de madeira (Wood Hammer) e o escudo que o
// Skull Bash levanta antes de sair. Duas famílias, uma coreografia.
import { getAbility } from '@/data/abilities'
import { emitirParticulas } from '../particulas'
import { PELES } from '../paletas'
import { crescente, estilhacos, estrelaDeImpacto, limitar, pontosDeRaio, riscos, saida, tracarRaio } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, bola, brilho, comAcento, entrePontos, janela, montarFamilia, poligono, rastro } from './formas'
import { ondaDeChoque, proa } from './investidas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

type Veste = 'raio' | 'fogo' | 'trilha' | 'agua' | 'dragao' | 'psi' | 'aco' | 'rocha' | 'madeira' | 'escudo'

interface Perfil {
  veste: Veste
  preparo: number
  viagem: number
  tamanho: number
  /** Quem bate sente: estalo menor do lado de quem atacou. */
  recuo?: boolean
  /** Bate e volta (Volt Switch). */
  volta?: boolean
}

export const PERFIS_DE_INVESTIDA_ELEMENTAL: Record<string, Perfil> = {
  wild_charge: { veste: 'raio', preparo: 120, viagem: 120, tamanho: 1.15, recuo: true },
  spark: { veste: 'raio', preparo: 60, viagem: 110, tamanho: .9 },
  volt_switch: { veste: 'raio', preparo: 50, viagem: 100, tamanho: .9, volta: true },
  flare_blitz: { veste: 'fogo', preparo: 150, viagem: 120, tamanho: 1.25, recuo: true },
  flame_charge: { veste: 'trilha', preparo: 70, viagem: 130, tamanho: .95 },
  aqua_jet: { veste: 'agua', preparo: 30, viagem: 90, tamanho: .95 },
  dragon_rush: { veste: 'dragao', preparo: 140, viagem: 120, tamanho: 1.25 },
}

export const PERFIS_DE_CABECADA: Record<string, Perfil> = {
  skull_bash: { veste: 'escudo', preparo: 220, viagem: 120, tamanho: 1.25 },
  zen_headbutt: { veste: 'psi', preparo: 110, viagem: 120, tamanho: 1.05 },
  iron_head: { veste: 'aco', preparo: 90, viagem: 110, tamanho: 1.05 },
  head_smash: { veste: 'rocha', preparo: 180, viagem: 130, tamanho: 1.35, recuo: true },
  wood_hammer: { veste: 'madeira', preparo: 150, viagem: 120, tamanho: 1.2, recuo: true },
}

const CHOQUE = 280, RETORNO = 160
const contatoDe = (p: Perfil) => p.preparo + p.viagem
const duracaoDe = (p: Perfil) => contatoDe(p) + CHOQUE + (p.volta ? RETORNO - 60 : 0)

const MADEIRA = PELES.GROUND

function raiosEmVolta(ctx: CanvasRenderingContext2D, p: Ponto, raio: number, n: number, pele: Pele, semente: number, largura = 1.4): void {
  const rng = rngSemeado(semente)
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, r = raio * (.7 + rng() * .5)
    tracarRaio(ctx, pontosDeRaio({ x: p.x + Math.cos(a) * raio * .3, y: p.y + Math.sin(a) * raio * .3 }, { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }, 3, 2, rng), largura, pele)
  }
}

/** Escudo de energia: hexágono que se fecha em volta de quem vai bater (Skull Bash). */
function escudo(ctx: CanvasRenderingContext2D, p: Ponto, r: number, pele: Pele): void {
  const pts = (R: number) => Array.from({ length: 6 }, (_, i) => [p.x + Math.cos(i * Math.PI / 3 + Math.PI / 6) * R, p.y + Math.sin(i * Math.PI / 3 + Math.PI / 6) * R * .9] as const)
  ctx.lineJoin = 'miter'
  for (const [w, cor] of [[3.6, pele.contorno], [2, pele.meio], [.8, BRANCO]] as const) {
    ctx.strokeStyle = cor; ctx.lineWidth = w; ctx.beginPath()
    pts(r).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke()
  }
}

function desenhar(perfil: Perfil, c: ContextoVfx): void {
  const { ctx, ms, tier, origem, alvo } = c
  const pele = c.pele
  const semente = Math.floor(c.rng() * 0xffffffff)
  const passo = Math.floor(ms / 66)
  const dx = alvo.x - origem.x, dy = alvo.y - origem.y, L = Math.hypot(dx, dy)
  const angulo = L > .01 ? Math.atan2(dy, dx) : c.angulo
  const ux = Math.cos(angulo), uy = Math.sin(angulo)
  const escala = .62 * perfil.tamanho * (1 + (tier - 1) * .07)
  const contato = contatoDe(perfil)
  const chegada = { x: alvo.x - ux * 9 * escala, y: alvo.y - uy * 9 * escala }
  const saidaDe = { x: origem.x + ux * 6, y: origem.y + uy * 6 }

  // --- preparo: o elemento junta em volta de quem ataca ---
  const tp = janela(ms, 0, perfil.preparo)
  if (tp !== null) {
    const forca = saida(tp)
    switch (perfil.veste) {
      case 'raio': raiosEmVolta(ctx, origem, 10 + 4 * forca, 1 + (tp > .5 ? 1 : 0), pele, semente + passo); break
      case 'fogo': emitirParticulas(ctx, pele, { x: origem.x, y: origem.y + 6 }, c.pedir(3 + tier), 10, tp, 4, rngSemeado(semente + 1)); break
      case 'escudo': escudo(ctx, origem, 6 + 10 * forca, pele); break
      case 'psi':
        for (let k = 0; k < 2; k++) {
          const u = (tp * 2 + k * .5) % 1
          crescente(ctx, origem, 6 + u * 12, -Math.PI, Math.PI, 2.2, .5, 0, pele, .9)
        }
        break
      case 'rocha': case 'madeira':
        estilhacos(ctx, origem, c.pedir(3), 12, 1 - tp, perfil.veste === 'madeira' ? MADEIRA : pele, rngSemeado(semente + 2))
        break
      case 'dragao': crescente(ctx, origem, 12 + forca * 4, -Math.PI, Math.PI, 2.8, .5, 0, pele, 1); break
      case 'aco': brilho(ctx, origem.x + 6, origem.y - 6, 3 * forca, BRANCO); break
      default: break
    }
  }

  // --- viagem ---
  const u = (ms - perfil.preparo) / perfil.viagem
  if (u >= 0 && u < 1.35) {
    const v = saida(limitar(u))
    const p = entrePontos(saidaDe, chegada, v)
    const encolhe = 1 - limitar((u - 1) / .35)
    rastro(ctx, saidaDe, p, c.pedir(3 + tier), 6, pele, rngSemeado(semente + 3), encolhe)
    if (perfil.veste === 'trilha') {
      // Flame Charge: chamas que ficam acesas no chão por onde passou.
      for (let k = 0; k < 4; k++) {
        const pos = (k + .5) / 4
        if (pos > v) continue
        const q = entrePontos(saidaDe, chegada, pos)
        emitirParticulas(ctx, pele, { x: q.x, y: q.y + 10 }, Math.min(c.pedir(2), 2), 5, limitar((u - pos) * 1.6), 3.2, rngSemeado(semente + 20 + k))
      }
    }
    if (perfil.veste === 'agua' && u < 1) {
      for (let k = 1; k <= 4; k++) bola(ctx, { x: p.x - ux * k * 7 + (k % 2 ? 2 : -2), y: p.y - uy * k * 7 + 3 * Math.sin(k + v * 6) }, 2.8 - k * .4, pele)
    }
    if (u < 1) {
      if (perfil.veste === 'fogo') emitirParticulas(ctx, pele, p, c.pedir(5 + tier), 14, (v * 1.3) % 1, 5, rngSemeado(semente + 4))
      if (perfil.veste === 'dragao') proa(ctx, { x: p.x - ux * 5, y: p.y - uy * 5 }, angulo, escala * 1.15, 1.2, { ...pele, base: pele.contorno }, pele.meio)
      proa(ctx, p, angulo, escala, perfil.veste === 'escudo' ? 1.25 : 1, pele,
        perfil.veste === 'fogo' ? pele.meio : perfil.veste === 'dragao' ? pele.base : undefined)
      if (perfil.veste === 'raio') raiosEmVolta(ctx, p, 13, 2 + (tier >= 3 ? 1 : 0), pele, semente + 30 + passo, 1.3)
      if (perfil.veste === 'escudo') escudo(ctx, p, 12 * escala / .62, pele)
      if (perfil.veste === 'psi') crescente(ctx, p, 12, angulo - 1.4, angulo + 1.4, 2.4, .5, 0, pele, 1)
      if (perfil.veste === 'aco') {
        // Reflexo branco correndo pela proa.
        const k = (v * 2) % 1
        poligono(ctx, [[p.x - 6 + k * 10, p.y - 8], [p.x - 3 + k * 10, p.y - 8], [p.x - 7 + k * 10, p.y + 8], [p.x - 10 + k * 10, p.y + 8]], BRANCO)
      }
      if (perfil.veste === 'rocha' || perfil.veste === 'madeira') {
        // Pedras/farpas orbitando a cabeça.
        for (let k = 0; k < 3; k++) {
          const a = k * 2.1 + v * 7, q = { x: p.x + Math.cos(a) * 11, y: p.y + Math.sin(a) * 9 }
          const s = perfil.veste === 'rocha' ? 2.6 : 1.8
          const cor = perfil.veste === 'rocha' ? pele.base : MADEIRA.meio
          poligono(ctx, [[q.x - s - 1, q.y], [q.x, q.y - s - 1], [q.x + s + 1, q.y], [q.x, q.y + s + 1]], ESCURO)
          poligono(ctx, [[q.x - s, q.y], [q.x, q.y - s], [q.x + s, q.y], [q.x, q.y + s]], cor)
        }
      }
    }
  }

  // --- volta (Volt Switch) ---
  if (perfil.volta) {
    const t = janela(ms, contato + 60, RETORNO)
    if (t !== null) {
      const v = saida(t), curva = Math.sin(v * Math.PI) * 14
      const q = { x: chegada.x + (saidaDe.x - chegada.x) * v - uy * curva, y: chegada.y + (saidaDe.y - chegada.y) * v + ux * curva }
      bola(ctx, q, 4.2, pele)
      raiosEmVolta(ctx, q, 9, 1, pele, semente + 40 + passo, 1.1)
    }
  }

  // --- choque ---
  const t = janela(ms, contato, CHOQUE)
  if (t === null) return
  const rng = rngSemeado(semente + 50)
  const forte = perfil.tamanho >= 1.2
  estrelaDeImpacto(ctx, alvo, (forte ? 14 : 10) + tier * 1.5, t, pele, rng)
  ondaDeChoque(ctx, alvo, angulo, t, 13 + tier * 2, forte ? 2 : 1, pele)
  riscos(ctx, alvo, c.pedir(2 + tier), 20 + tier * 4, t, pele.meio, rng)
  switch (perfil.veste) {
    case 'raio': if (t < .6) raiosEmVolta(ctx, alvo, 18 + tier * 2, 3, pele, semente + 60 + passo, 1.8 * (1 - t)); break
    case 'fogo': case 'trilha': emitirParticulas(ctx, pele, alvo, c.pedir(5 + tier), 22 + tier * 2, t, 5, rng); break
    case 'agua':
      // Coroa de respingo.
      for (let k = 0; k < Math.min(c.pedir(5 + tier), 8); k++) {
        const a = -Math.PI / 2 + (k / 7 - .5) * 2.4, v = 16 + (k % 3) * 4
        bola(ctx, { x: alvo.x + Math.cos(a) * v * t, y: alvo.y - 2 + Math.sin(a) * v * t + 30 * t * t }, 2.4 * (1 - limitar((t - .6) / .4)), pele)
      }
      break
    case 'dragao': case 'escudo': ondaDeChoque(ctx, alvo, angulo, limitar(t * 1.2), 20 + tier * 2, 2, pele); break
    case 'psi':
      for (let k = 0; k < 2; k++) {
        const u2 = limitar((t - k * .15) / .8)
        if (u2 > 0 && u2 < 1) crescente(ctx, alvo, 8 + u2 * 12, -Math.PI, Math.PI, 2.4 * (1 - u2) + .4, .5, 0, pele, .8)
      }
      break
    case 'aco':
      for (let k = 0; k < Math.min(c.pedir(3 + tier), 6); k++) {
        const a = rng() * Math.PI * 2, d = (8 + rng() * 14) * saida(t)
        brilho(ctx, alvo.x + Math.cos(a) * d, alvo.y + Math.sin(a) * d * .8, 2.4 * (1 - t), pele.acento?.[1] ?? pele.meio)
      }
      break
    case 'rocha': estilhacos(ctx, alvo, c.pedir(4 + tier), 26 + tier * 3, t, pele, rng); break
    case 'madeira': estilhacos(ctx, alvo, c.pedir(4 + tier), 24 + tier * 3, t, MADEIRA, rng); break
  }
  if (perfil.recuo) {
    const tr = (t - .1) / .7
    if (tr > 0 && tr < 1) estrelaDeImpacto(ctx, { x: chegada.x - ux * 12, y: chegada.y - uy * 12 - 4 }, 7, tr, pele, rngSemeado(semente + 80))
  }
}

const peleDe = (id: string, p: Perfil): Pele | undefined => {
  if (p.veste !== 'madeira') return undefined
  return comAcento(PELES[getAbility(id)?.type ?? 'GRASS'], MADEIRA.contorno, MADEIRA.base, MADEIRA.meio, MADEIRA.nucleo)
}

const opcoes = { desenhar, duracao: duracaoDe, contato: contatoDe, alcance: 62, pele: peleDe }
export const INVESTIDAS_ELEMENTAIS_POR_GOLPE = montarFamilia(PERFIS_DE_INVESTIDA_ELEMENTAL, opcoes)
export const CABECADAS_POR_GOLPE = montarFamilia(PERFIS_DE_CABECADA, opcoes)
