// Formas pixel-autorais reaproveitadas pelas famílias de golpes (09/10).
//
// Tudo com contorno escuro por baixo e faixas chapadas: o pixelizador encaixa
// as cores na paleta e o contorno é o que separa o efeito do tileset.
import { NEUTROS } from '../paletas'
import { entrada, limitar, pontosDeRaio, saida, tracarRaio } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'

export const [ESCURO, BRANCO] = NEUTROS

export function poligono(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], cor: string): void {
  ctx.fillStyle = cor; ctx.beginPath()
  pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
  ctx.closePath(); ctx.fill()
}

/** Brilho de 4 pontas com contorno. */
export function brilho(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, cor: string): void {
  if (r <= .5) return
  const forma = (R: number, k: number) => [[x, y - R], [x + R * k, y - R * k], [x + R, y], [x + R * k, y + R * k], [x, y + R], [x - R * k, y + R * k], [x - R, y], [x - R * k, y - R * k]] as const
  poligono(ctx, forma(r + 1.2, .4), ESCURO)
  poligono(ctx, forma(r, .3), cor)
  ctx.fillStyle = BRANCO; ctx.fillRect(x - .8, y - .8, 1.6, 1.6)
}

/**
 * Talho afilado nas duas pontas de `a` até `b`: cresce pela cabeça (`cresce`
 * 0..1) e se recolhe pela cauda quando `some` sobe. Forma-base de garra e corte.
 */
export function talho(
  ctx: CanvasRenderingContext2D, a: Ponto, b: Ponto, largura: number, cresce: number, some: number,
  pele: Pele, meio: string = pele.meio, nucleo: string = BRANCO,
): void {
  const s = limitar(some), w = largura * (1 - entrada(s) * .7), u = saida(limitar(cresce))
  if (w <= .3 || u <= 0 || s >= 1) return
  const fim = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
  const ini = { x: a.x + (b.x - a.x) * entrada(s), y: a.y + (b.y - a.y) * entrada(s) }
  const dx = fim.x - ini.x, dy = fim.y - ini.y, L = Math.hypot(dx, dy)
  if (L < .8) return
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux
  const mx = ini.x + dx * .45, my = ini.y + dy * .45
  const forma = (k: number, g: number) => [
    [ini.x - ux * g, ini.y - uy * g], [mx + nx * (w * k + g), my + ny * (w * k + g)],
    [fim.x + ux * g, fim.y + uy * g], [mx - nx * (w * k * .35 + g), my - ny * (w * k * .35 + g)],
  ] as const
  poligono(ctx, forma(1, 1.3), pele.contorno)
  poligono(ctx, forma(1, 0), meio)
  poligono(ctx, forma(.4, 0), nucleo)
}

/** Riscos de velocidade paralelos de `de` até `ate`. */
export function rastro(ctx: CanvasRenderingContext2D, de: Ponto, ate: Ponto, n: number, abertura: number, pele: Pele, rng: () => number, encolhe = 1): void {
  const dx = ate.x - de.x, dy = ate.y - de.y, L = Math.hypot(dx, dy)
  if (L < 2) return
  const ux = dx / L, uy = dy / L
  ctx.lineCap = 'round'
  for (let i = 0; i < n; i++) {
    const lado = (rng() * 2 - 1) * abertura, ini = rng() * .5, comp = (.35 + rng() * .5) * encolhe
    const a = { x: de.x + dx * ini - uy * lado, y: de.y + dy * ini + ux * lado }
    const b = { x: a.x + ux * L * comp * (1 - ini), y: a.y + uy * L * comp * (1 - ini) }
    ctx.strokeStyle = pele.contorno; ctx.lineWidth = 2.6
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    ctx.strokeStyle = i % 2 ? BRANCO : pele.meio; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
  }
}

/** Nuvem de poeira/fumaça: bolas que se espalham, sobem um pouco e encolhem. */
export function nuvem(
  ctx: CanvasRenderingContext2D, p: Ponto, t: number, n: number, espalha: number, pele: Pele, rng: () => number,
  achatar = .35, sobe = 5, base = pele.base, meio = pele.meio,
): void {
  const bolas: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, d = espalha * (.4 + rng() * .6), r0 = 2.4 + rng() * 2.2
    const r = r0 * (1 - entrada(limitar((t - .35) / .65))) * (.6 + saida(limitar(t * 3)) * .4)
    if (r <= .4) continue
    bolas.push({ x: p.x + Math.cos(a) * d * saida(t), y: p.y + Math.sin(a) * d * achatar * saida(t) - sobe * t, r })
  }
  for (const [g, cor] of [[1.3, pele.contorno], [0, base], [-1, meio]] as const) {
    ctx.fillStyle = cor
    for (const b of bolas) {
      if (b.r + g <= .3) continue
      ctx.beginPath(); ctx.arc(b.x - (g < 0 ? .6 : 0), b.y - (g < 0 ? .6 : 0), b.r + g, 0, Math.PI * 2); ctx.fill()
    }
  }
}

/** Bola com contorno, base, brilho de meio e ponto branco (projétil, gota, bolha). */
export function bola(ctx: CanvasRenderingContext2D, p: Ponto, r: number, pele: Pele, base = pele.base, meio = pele.meio): void {
  if (r <= .4) return
  ctx.fillStyle = pele.contorno; ctx.beginPath(); ctx.arc(p.x, p.y, r + 1.3, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = base; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = meio; ctx.beginPath(); ctx.arc(p.x - r * .25, p.y - r * .25, r * .6, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = BRANCO; ctx.fillRect(p.x - r * .5, p.y - r * .55, Math.max(1.2, r * .35), Math.max(1.2, r * .35))
}

/** Pele do tipo com cores de contraste extras na paleta do pixelizador. */
export function comAcento(pele: Pele, ...cores: string[]): Pele {
  return { ...pele, acento: [...(pele.acento ?? []), ...cores] }
}

/** Fração 0..1 dentro de `[ini, ini + dura)`; fora, null. */
export function janela(ms: number, ini: number, dura: number): number | null {
  const t = (ms - ini) / dura
  return t >= 0 && t < 1 ? t : null
}

/** Ponto a fração `u` de `a` até `b`. */
export const entrePontos = (a: Ponto, b: Ponto, u: number): Ponto => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u })

/**
 * Monta o `<FAMILIA>_POR_GOLPE` a partir dos perfis: mesma duração e mesmo
 * contato em todo tier (o tier só muda a elaboração dentro da coreografia).
 */
export function montarFamilia<P>(perfis: Record<string, P>, o: {
  desenhar: (perfil: P, c: ContextoVfx, id: string) => void
  duracao: (perfil: P) => number
  contato: (perfil: P) => number
  alcance: number | ((perfil: P) => number)
  margem?: (perfil: P) => EntradaDeCoreografia['margem'] | undefined
  pele?: (id: string, perfil: P) => Pele | undefined
}): Record<string, EntradaDeCoreografia> {
  const tiers = [1, 2, 3, 4] as const
  return Object.fromEntries(Object.entries(perfis).map(([id, perfil]) => {
    const margem = o.margem?.(perfil), pele = o.pele?.(id, perfil)
    return [id, {
      desenhar: (c: ContextoVfx) => { if (c.ms >= 0 && c.ms < c.duracao) o.desenhar(perfil, c, id) },
      duracao: Object.fromEntries(tiers.map(t => [t, o.duracao(perfil)])),
      impactos: Object.fromEntries(tiers.map(t => [t, [o.contato(perfil)]])),
      alcance: typeof o.alcance === 'number' ? o.alcance : o.alcance(perfil),
      ...(margem ? { margem } : {}),
      ...(pele ? { pele } : {}),
    }]
  }))
}

/**
 * Setas de mudança de status (↑ sobe, ↓ desce) em volta de alguém — o jeito
 * do jogo de dizer "a Speed subiu", "a Defesa caiu".
 */
export function setasDeStatus(ctx: CanvasRenderingContext2D, p: Ponto, t: number, cor: string, n = 3, desce = false): void {
  for (let k = 0; k < n; k++) {
    const u = (t * 1.4 + k / n) % 1, x = p.x + (k - (n - 1) / 2) * 9
    const y = desce ? p.y - 14 + u * 22 : p.y + 8 - u * 22
    const s = 3.4 * (1 - entrada(u)), d = desce ? -1 : 1
    if (s < .5) continue
    const seta = (S: number, g: number) => [[x, y - d * (S + g)], [x + S + g, y + d * g], [x + S * .4 + g * .6, y + d * g], [x + S * .4 + g * .6, y + d * (S + g)], [x - S * .4 - g * .6, y + d * (S + g)], [x - S * .4 - g * .6, y + d * g], [x - S - g, y + d * g]] as const
    poligono(ctx, seta(s, 1.4), ESCURO)
    poligono(ctx, seta(s, 0), cor)
  }
}

/** Curva grossa com contorno (cipó, cauda, tentáculo) por pontos, afinando na ponta. */
export function corda(ctx: CanvasRenderingContext2D, pts: readonly Ponto[], largura: number, pele: Pele, cor = pele.base, luz = pele.meio): void {
  if (pts.length < 2) return
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const [w, c] of [[largura + 2.6, pele.contorno], [largura, cor], [largura * .35, luz]] as const) {
    for (let i = 1; i < pts.length; i++) {
      const k = 1 - (i / pts.length) * .55
      ctx.strokeStyle = c; ctx.lineWidth = Math.max(.6, w * k)
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke()
    }
  }
}

/** Estática de paralisia presa no alvo: zigue-zagues curtos que tremem (re-sorteados pela semente). */
export function estatica(ctx: CanvasRenderingContext2D, alvo: Ponto, k: number, pele: Pele, semente: number): void {
  if (k <= .1) return
  for (let i = 0; i < 3; i++) {
    const r = rngSemeado(semente + i * 7)
    const a = { x: alvo.x - 9 + i * 9, y: alvo.y - 10 + r() * 4 }
    tracarRaio(ctx, pontosDeRaio(a, { x: a.x + (r() - .5) * 6, y: a.y + 14 }, 3, 2, r), 1.2 * k, pele)
  }
}
