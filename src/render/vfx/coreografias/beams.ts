import { PELES } from '../paletas'
import { rngSemeado } from '../aleatorio'
import { limitar, saida, estrelaDeImpacto } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele } from '../tipos'
import { desenharImpactoBeam, type AssinaturaBeam } from './impactoBeam'

interface Perfil { assinatura: AssinaturaBeam; carga: number; contato: number; sustentar: number; duracao: number; largura: number; pele: Pele }
const PRISMA = ['#f786c7', '#67e8e4', '#ffe99b', '#a49aff'] as const
const SOLAR: Pele = { ...PELES.GRASS, contorno: '#24321b', base: '#4dba58', meio: '#e0eb69', nucleo: '#ffffdf', estrela: '#f5ed8b', acento: ['#a7f0a0'] }
const HIPER: Pele = { ...PELES.NORMAL, contorno: '#542730', base: '#e97836', meio: '#ffd277', nucleo: '#fff8d6', estrela: '#ffd277', acento: ['#a94635'] }
export const PERFIS_DE_BEAM: Record<string, Perfil> = {
  ice_beam: { assinatura: 'gelo', carga: 120, contato: 200, sustentar: 250, duracao: 800, largura: 6, pele: PELES.ICE },
  aurora_beam: { assinatura: 'aurora', carga: 100, contato: 200, sustentar: 300, duracao: 820, largura: 5, pele: { ...PELES.ICE, acento: PRISMA } },
  psybeam: { assinatura: 'mental', carga: 100, contato: 220, sustentar: 250, duracao: 760, largura: 3, pele: { ...PELES.PSYCHIC, base: '#7651bc', acento: ['#b799ef', '#77dbeb'] } },
  signal_beam: { assinatura: 'sinal', carga: 70, contato: 170, sustentar: 260, duracao: 720, largura: 3, pele: { ...PELES.BUG, contorno: '#262340', base: '#bd4eaa', meio: '#70e7d2', nucleo: '#effff4', estrela: '#70e7d2', acento: ['#f582cc'] } },
  charge_beam: { assinatura: 'eletrico', carga: 130, contato: 220, sustentar: 180, duracao: 700, largura: 4, pele: PELES.ELECTRIC },
  bubble_beam: { assinatura: 'bolhas', carga: 50, contato: 190, sustentar: 250, duracao: 750, largura: 5, pele: { ...PELES.WATER, acento: ['#b7d4fa'] } },
  solar_beam: { assinatura: 'solar', carga: 260, contato: 360, sustentar: 260, duracao: 1000, largura: 9, pele: SOLAR },
  hyper_beam: { assinatura: 'hiper', carga: 220, contato: 300, sustentar: 300, duracao: 1050, largura: 11, pele: HIPER },
}

const TAU = Math.PI * 2
/** Formas no eixo local +X: contorno e luz em cores chapadas, nunca blur. */
function losango(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, cor: string, comprido = 1): void {
  ctx.fillStyle = cor; ctx.beginPath(); ctx.moveTo(x - r * comprido, y)
  ctx.lineTo(x, y - r); ctx.lineTo(x + r * comprido, y); ctx.lineTo(x, y + r); ctx.closePath(); ctx.fill()
}
function orbe(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, p: Pele): void {
  for (const [cor, k] of [[p.contorno, 1.18], [p.base, 1], [p.meio, .73], [p.nucleo, .4]] as const) {
    ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(x, y, r * k, 0, TAU); ctx.fill()
  }
}
function linha(ctx: CanvasRenderingContext2D, pontos: readonly (readonly [number, number])[], cor: string, largura: number): void {
  ctx.strokeStyle = cor; ctx.lineWidth = largura; ctx.lineCap = 'butt'; ctx.lineJoin = 'bevel'
  ctx.beginPath(); pontos.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke()
}
/** Fita de largura variável; ponta cresce até o alvo e cauda recolhe no colapso. */
function fita(ctx: CanvasRenderingContext2D, a: number, b: number, largura: number, cor: string, centro: (x: number) => number, afinar = 0): void {
  const n = 24
  ctx.fillStyle = cor; ctx.beginPath()
  for (const lado of [-1, 1]) for (let i = 0; i <= n; i++) {
    const u = lado < 0 ? i / n : 1 - i / n, x = a + (b - a) * u
    const r = largura * (.55 + afinar * u) * Math.min(1, .4 + u * 5, .4 + (1 - u) * 5)
    ctx.lineTo(x, centro(x) + lado * r)
  }
  ctx.closePath(); ctx.fill()
}
function anelOptico(ctx: CanvasRenderingContext2D, x: number, r: number, cor: string, largura = 1.2): void {
  ctx.strokeStyle = cor; ctx.lineWidth = largura; ctx.beginPath(); ctx.ellipse(x, 0, r * .35, r, 0, 0, TAU); ctx.stroke()
}
function bolha(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, p: Pele): void {
  // Centro oco: deixa o cenário passar, diferente de Hydro Pump ou Ice Beam.
  for (const [cor, w] of [[p.contorno, 2.5], [p.meio, 1.2]] as const) {
    ctx.strokeStyle = cor; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke()
  }
  ctx.fillStyle = p.nucleo; ctx.fillRect(x - r * .55, y - r * .65, 2, 2)
}

function preparar(c: ContextoVfx, p: Perfil, boca: number): void {
  const { ctx, ms, pele } = c, t = limitar(ms / p.carga)
  const ainda = ms < p.carga ? 1 : 1 - limitar((ms - p.carga) / 180)
  if (ainda <= 0) return
  const r = (2 + p.largura * .65 * saida(t)) * ainda
  if (p.assinatura === 'bolhas') { bolha(ctx, boca, -2, r, pele); return }
  if (p.assinatura === 'sinal') {
    orbe(ctx, boca, -r * .65, r * .7, { ...pele, meio: pele.acento![0] })
    orbe(ctx, boca, r * .65, r * .7, pele)
  } else orbe(ctx, boca, 0, r, pele)
  if (p.assinatura === 'aurora' || p.assinatura === 'mental') {
    anelOptico(ctx, boca, r + 3, pele.acento![0], 1.5)
    losango(ctx, boca, 0, r * .6, pele.nucleo, 2)
  }
  const n = c.pedir(p.assinatura === 'solar' || p.assinatura === 'hiper' ? 8 : 4)
  for (let i = 0; i < n; i++) {
    const a = i / 8 * TAU + .4, d = (8 + (1 - t) * 20) * ainda
    const x = boca + Math.cos(a) * d, y = Math.sin(a) * d
    if (p.assinatura === 'eletrico') linha(ctx, [[x,y],[x-3,y+2],[boca,0]], pele.meio, 1)
    else losango(ctx, x, y, (1.2 + t) * ainda, pele.meio, p.assinatura === 'solar' ? 2 : 1)
  }
}

function desenharFeixe(c: ContextoVfx, p: Perfil, a: number, b: number, distancia: number, forca: number): void {
  const { ctx, pele, ms, tier } = c
  const w = p.largura * forca * (1 + (tier - 1) * .07)
  const reto = () => 0
  const onda = (x: number) => Math.sin(x * .11 - ms * .014) * 3.5 * forca
  if (p.assinatura === 'bolhas') {
    const n = 8 + c.pedir(4 + tier)
    for (let i = 0; i < n; i++) {
      const u = ((ms - p.carga) / 260 + i / n) % 1, x = a + (b - a) * u
      bolha(ctx, x, Math.sin(i * 2.4 + ms * .007) * 5 * forca, (2.5 + i % 3) * forca, pele)
    }
    return
  }
  if (p.assinatura === 'aurora') {
    fita(ctx, a, b, w + 2, pele.contorno, onda)
    PRISMA.forEach((cor, i) => fita(ctx, a, b, 1.5 * forca, cor, x => onda(x) + (i - 1.5) * 2 * forca))
    fita(ctx, a, b, .9 * forca, pele.nucleo, onda)
  } else if (p.assinatura === 'sinal') {
    for (const lado of [-1, 1]) {
      const eixo = (x: number) => lado * Math.sin(x * .18 - ms * .016) * 5 * forca
      fita(ctx, a, b, w + 1, pele.contorno, eixo)
      fita(ctx, a, b, w, lado < 0 ? pele.acento![0] : pele.meio, eixo)
      fita(ctx, a, b, .65 * forca, pele.nucleo, eixo)
    }
  } else {
    const afinar = p.assinatura === 'hiper' ? .5 : .12
    for (const [cor, k] of [[pele.contorno, 1.2], [pele.base, 1], [pele.meio, .7], [pele.nucleo, .3]] as const) {
      fita(ctx, a, b, w * k, cor, reto, afinar)
    }
    if (p.assinatura === 'hiper') {
      // Fraturas quentes longitudinais: recortam a massa, não um laser genérico grosso.
      for (const lado of [-1, 1]) {
        const pts = Array.from({ length: 9 }, (_, i) => {
          const x = a + (b-a) * i/8
          return [x, lado * w * (.6 + .18 * Math.sin(i * 2 + ms * .012))] as const
        })
        linha(ctx, pts, pele.base, 1.8 * forca)
      }
    }
  }
  if (p.assinatura === 'gelo' || p.assinatura === 'solar') {
    for (const lado of [-1, 1]) linha(ctx, [[a, lado*w], [b, lado*w*.85]], pele.meio, 1.3 * forca)
  }
  if (p.assinatura === 'eletrico') {
    for (const lado of [-1, 1]) {
      const pts = Array.from({ length: 13 }, (_, i) => [a+(b-a)*i/12, lado*(w+Math.sin(i*2.3+ms*.009)*4*forca)] as const)
      linha(ctx, pts, pele.contorno, 2.7 * forca); linha(ctx, pts, pele.meio, 1.2 * forca)
    }
  }
  if (p.assinatura === 'mental') {
    for (const lado of [-1, 1]) fita(ctx, a, b, 1.2 * forca, lado < 0 ? pele.meio : pele.acento![0], x => lado * Math.sin(x*.16-ms*.012)*7*forca)
    for (let i = 0; i < 5; i++) {
      const x = ((ms * .12 + i * distancia / 5) % Math.max(1, distancia))
      if (x >= a && x <= b) anelOptico(ctx, x, 7 * forca, pele.acento![1])
    }
  }
  const n = c.pedir(4 + tier * 2)
  for (let i = 0; i < n; i++) {
    const x = a + (b - a) * ((i / Math.max(1,n) + ms * .0018) % 1)
    const y = (i % 2 ? -1 : 1) * (w + 3 + i % 3) * forca
    const cor = p.assinatura === 'aurora' ? PRISMA[i%4] : pele.meio
    losango(ctx, x, y, (p.assinatura === 'gelo' ? 2.2 : 1.2) * forca, cor, p.assinatura === 'gelo' ? 2.5 : 1.5)
  }
}

function finalizar(c: ContextoVfx, p: Perfil, distancia: number, impactoNovo: boolean): void {
  const { ctx, pele, ms, tier } = c
  if (ms < p.contato) return
  const t = limitar((ms - p.contato) / (p.duracao - p.contato))
  const r = (p.assinatura === 'hiper' ? 23 : p.assinatura === 'solar' ? 19 : 12) * (1 + (tier-1)*.04)
  // Estrela tem stream separado: encerrar o flash não muda a trajetória dos resíduos.
  const sementeDaEstrela = Math.floor(c.rng() * 0xffffffff)
  if (impactoNovo) desenharImpactoBeam(c,p,distancia,sementeDaEstrela)
  if (ms < p.contato + (impactoNovo ? 90 : 180)) {
    estrelaDeImpacto(ctx, { x: distancia, y: 0 }, r * (impactoNovo ? .48 : 1), (ms-p.contato)/(impactoNovo ? 90 : 180), pele, rngSemeado(sementeDaEstrela))
  }
  // Resíduos têm direção/material próprios, sem sugerir status ou acertos extras.
  const n = c.pedir(6 + tier * 2)
  for (let i = 0; i < n; i++) {
    const a = c.rng() * TAU, d = (8 + c.rng()*24) * saida(t)
    const x = distancia + Math.cos(a)*d, y = Math.sin(a)*d - Math.sin(t*Math.PI)*7
    const tam = (1.5 + c.rng()*2) * (1-t)**2
    if (tam < .2) continue
    if (p.assinatura === 'bolhas') bolha(ctx,x,y,tam*1.5,pele)
    else if (p.assinatura === 'eletrico') linha(ctx,[[x-2,y+2],[x,y],[x+2,y-2]],pele.meio,tam*.65)
    else losango(ctx,x,y,tam,p.assinatura === 'aurora' ? PRISMA[i%4] : p.assinatura === 'sinal' && i%2 ? pele.acento![0] : pele.meio,p.assinatura === 'gelo' ? 2 : 1)
  }
  if (p.assinatura === 'mental' && t < .8) {
    const pts = Array.from({ length: 28 }, (_, i) => {
      const a = i/27*TAU*1.5 + ms*.004, r = i/27*16*(1-t)
      return [distancia+Math.cos(a)*r,Math.sin(a)*r] as const
    })
    linha(ctx,pts,pele.meio,1.2*(1-t))
  }
}

function coreografia(c: ContextoVfx, p: Perfil, impactoNovo: boolean): void {
  if (c.ms < 0 || c.ms >= c.duracao) return
  const { ctx, origem, alvo, ms } = c
  const distancia = Math.hypot(alvo.x-origem.x, alvo.y-origem.y)
  const angulo = distancia > .01 ? Math.atan2(alvo.y-origem.y,alvo.x-origem.x) : c.angulo
  const boca = Math.min(8, distancia * .25)
  ctx.save(); ctx.translate(origem.x,origem.y); ctx.rotate(angulo)
  preparar(c,p,boca)
  const fim = p.contato + p.sustentar
  if (distancia > .01 && ms >= p.carga && ms < fim + 130) {
    const ponta = boca + (distancia-boca) * limitar((ms-p.carga)/(p.contato-p.carga))
    const colapso = limitar((ms-fim)/130), cauda = boca + (distancia-boca) * saida(colapso)
    if (ponta > cauda) desenharFeixe(c,p,cauda,ponta,distancia,(.75+.25*limitar((ms-p.carga)/60))*(1-colapso))
  }
  finalizar(c,p,distancia,impactoNovo)
  ctx.restore()
}

export const BEAMS_POR_GOLPE: Record<string, EntradaDeCoreografia> = Object.fromEntries(
  Object.entries(PERFIS_DE_BEAM).map(([id,p]) => [id, {
    desenhar: (c: ContextoVfx) => coreografia(c,p,true), pele: p.pele,
    alcance: 52, duracao: { 1:p.duracao, 2:p.duracao, 3:p.duracao, 4:p.duracao },
    impactos: { 1:[p.contato], 2:[p.contato], 3:[p.contato], 4:[p.contato] },
  }]),
)

/** Comparativo de QA: mesmo feixe, mas com o contato anterior da 7.81. */
export const BEAMS_COM_IMPACTO_ANTERIOR: Record<string, EntradaDeCoreografia> = Object.fromEntries(
  Object.entries(PERFIS_DE_BEAM).map(([id,p]) => [id, { ...BEAMS_POR_GOLPE[id], desenhar: (c: ContextoVfx) => coreografia(c,p,false) }]),
)
