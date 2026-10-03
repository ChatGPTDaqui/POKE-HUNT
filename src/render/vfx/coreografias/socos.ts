import { emitirParticulas } from '../particulas'
import { estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto, Tier } from '../tipos'

type Gesto = 'jab' | 'pesado' | 'concentrado' | 'explosivo' | 'cometa' | 'curvo' | 'elemental' | 'sombra' | 'surpresa'
interface Perfil { gesto: Gesto; contato: number; tamanho: number }
export const PERFIS_DE_SOCO: Record<string, Perfil> = {
  mega_punch: { gesto: 'pesado', contato: 180, tamanho: 1.12 },
  mach_punch: { gesto: 'jab', contato: 100, tamanho: .9 },
  dynamic_punch: { gesto: 'explosivo', contato: 200, tamanho: 1.18 },
  focus_punch: { gesto: 'concentrado', contato: 240, tamanho: 1.18 },
  comet_punch: { gesto: 'cometa', contato: 90, tamanho: .88 },
  dizzy_punch: { gesto: 'curvo', contato: 160, tamanho: 1 },
  fire_punch: { gesto: 'elemental', contato: 140, tamanho: 1.04 },
  ice_punch: { gesto: 'elemental', contato: 140, tamanho: 1.04 },
  thunder_punch: { gesto: 'elemental', contato: 120, tamanho: 1.04 },
  shadow_punch: { gesto: 'sombra', contato: 130, tamanho: 1 },
  sucker_punch: { gesto: 'surpresa', contato: 100, tamanho: .98 },
}

/** Silhueta própria de mão fechada, apontada para +X. O pixelizador final mantém cores chapadas. */
function punho(ctx: CanvasRenderingContext2D, p: Ponto, angulo: number, escala: number, pele: Pele): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angulo); ctx.scale(escala, escala)
  const forma = (pontos: readonly (readonly [number, number])[], cor: string) => {
    ctx.fillStyle = cor; ctx.beginPath()
    pontos.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
    ctx.closePath(); ctx.fill()
  }
  // Pulso, palma, quatro nós e polegar: o contorno é geometria, não blur/stroke arredondado.
  forma([[-25,-8],[-15,-8],[-15,-15],[-9,-18],[7,-18],[13,-15],[16,-10],[17,7],[12,14],[4,17],[-11,15],[-16,10],[-25,10]], pele.contorno)
  forma([[-23,-5],[-12,-5],[-12,-12],[-7,-15],[6,-15],[11,-12],[13,-7],[14,6],[10,11],[3,14],[-10,12],[-13,7],[-23,7]], pele.base)
  forma([[-10,-12],[5,-12],[10,-9],[11,5],[7,9],[-7,7]], pele.meio)
  forma([[-8,-12],[4,-12],[8,-8],[8,-3],[-8,-3]], pele.nucleo)
  // Articulações na face frontal (quatro dedos), separadas por sulcos escuros.
  for (let i = 0; i < 4; i++) {
    const y = -12 + i * 6
    ctx.fillStyle = pele.contorno; ctx.fillRect(4, y + 3, 10, 2)
    ctx.fillStyle = i < 2 ? pele.nucleo : pele.meio; ctx.fillRect(8, y, 5, 3)
  }
  forma([[-11,1],[-5,-1],[3,2],[6,7],[3,12],[-6,10],[-11,6]], pele.contorno)
  forma([[-8,2],[-4,1],[1,4],[3,7],[1,9],[-5,7],[-8,5]], pele.meio)
  ctx.fillStyle = pele.nucleo; ctx.fillRect(-6,2,5,3)
  ctx.fillStyle = pele.meio; ctx.fillRect(-23,-4,8,3)
  ctx.restore()
}

/** Um golpe por entrada: não depende de state/store nem do rng de combate. */
function coreografia(perfil: Perfil, c: ContextoVfx): void {
  const { ctx, ms, tier, pele, origem, alvo } = c
  if (ms < 0 || ms >= c.duracao) return
  const semente = Math.floor(c.rng() * 0xffffffff)
  const dx = alvo.x - origem.x, dy = alvo.y - origem.y
  const angulo = Math.hypot(dx, dy) > .01 ? Math.atan2(dy, dx) : c.angulo
  const ux = Math.cos(angulo), uy = Math.sin(angulo)
  const escala = .76 * perfil.tamanho * (1 + (tier - 1) * .06)
  const contatos = perfil.gesto === 'cometa' ? Math.max(1, Math.min(5, Math.trunc(c.acertos ?? 2))) : 1
  for (let i = 0; i < contatos; i++) {
    const contato = perfil.contato + i * 100
    const inicio = perfil.gesto === 'surpresa' ? contato - 55
      : perfil.gesto === 'sombra' ? contato - 75
      : perfil.gesto === 'concentrado' ? contato - 80 : Math.max(0, contato - 120)
    const t = (ms - inicio) / (contato - inicio)
    const depois = (ms - contato) / 210
    const rng = rngSemeado(semente + i * 97)
    const alterna = perfil.gesto === 'cometa' ? (i % 2 ? -4 : 4) : 0
    const destino = { x: alvo.x - uy * alterna, y: alvo.y + ux * alterna }
    if (t >= 0 && depois < .38) {
      const u = saida(limitar(t))
      const curva = perfil.gesto === 'curvo' ? Math.sin(u * Math.PI) * 11 : 0
      const final = { x: destino.x - ux * 16 * escala, y: destino.y - uy * 16 * escala }
      const p = { x: origem.x + ux * 7 + (final.x - origem.x - ux * 7) * u - uy * curva,
        y: origem.y + uy * 7 + (final.y - origem.y - uy * 7) * u + ux * curva }
      // O rastro acompanha o punho, nunca passa pelo alvo nem lança um projétil.
      const encolher = depois < 0 ? 1 : 1 - limitar(depois / .38)
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angulo)
      ctx.fillStyle = pele.contorno
      ctx.beginPath(); ctx.moveTo(-13, -8); ctx.lineTo(-30 - 10 * u, 0); ctx.lineTo(-13, 8); ctx.closePath(); ctx.fill()
      ctx.fillStyle = pele.meio; ctx.fillRect(-28 - u * 8, -2, 16 + u * 8, 4)
      ctx.restore()
      punho(ctx, p, angulo + (perfil.gesto === 'curvo' ? (1 - u) * -.35 : 0), escala * encolher, pele)
      if (perfil.gesto === 'elemental' || perfil.gesto === 'sombra') {
        emitirParticulas(ctx, pele, p, c.pedir(4), 12, limitar(u * .7), 4, rng)
      }
    }
    if (depois >= 0 && depois < 1) {
      const forte = perfil.gesto === 'explosivo' || perfil.gesto === 'concentrado' || perfil.gesto === 'pesado'
      estrelaDeImpacto(ctx, destino, (forte ? 23 : 16) + tier * 2, depois, pele, rng)
      riscos(ctx, destino, c.pedir(4 + tier * 2), 24 + tier * 5, depois, pele.meio, rng)
      emitirParticulas(ctx, pele, destino, c.pedir(4 + tier), 24 + tier * 2, depois, 4, rng)
      if (perfil.gesto === 'explosivo' && depois < .75) {
        // Choque angular extra, não um segundo acerto nem um clarão de tela.
        const r = (18 + tier * 3) * (.5 + saida(depois) * .6)
        ctx.strokeStyle = pele.base; ctx.lineWidth = 3 * (1 - depois)
        ctx.beginPath()
        for (let j = 0; j < 6; j++) {
          const a = angulo + j * Math.PI / 3
          ctx.moveTo(destino.x + Math.cos(a) * r, destino.y + Math.sin(a) * r)
          ctx.lineTo(destino.x + Math.cos(a + .65) * r, destino.y + Math.sin(a + .65) * r)
        }
        ctx.stroke()
      }
      if (perfil.gesto === 'curvo' && depois < .85) {
        ctx.strokeStyle = pele.meio; ctx.lineWidth = 2; ctx.beginPath()
        for (let j = 0; j < 20; j++) {
          const a = j * .45 + depois * 5, r = (4 + j * .7) * (1 - depois)
          const x = destino.x + Math.cos(a) * r, y = destino.y + Math.sin(a) * r * .7
          if (!j) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    }
  }
  // Focus concentra luz na mão, não muda o turno nem adiciona espera de combate.
  const preparado = perfil.gesto === 'concentrado' || perfil.gesto === 'pesado' || perfil.gesto === 'explosivo'
  const preparacao = perfil.contato - (perfil.gesto === 'concentrado' ? 80 : 120)
  if (preparado && ms < preparacao) {
    const t = ms / preparacao
    punho(ctx, { x: origem.x + ux * 7, y: origem.y + uy * 7 }, angulo, escala * (.65 + .35 * t), pele)
    if (perfil.gesto === 'concentrado') riscos(ctx, origem, c.pedir(4), 18, 1 - t, pele.meio, rngSemeado(semente))
  }
}

const TIERS: readonly Tier[] = [1, 2, 3, 4]
export const SOCOS_POR_GOLPE: Record<string, EntradaDeCoreografia> = Object.fromEntries(
  Object.entries(PERFIS_DE_SOCO).map(([id, perfil]) => [id, {
    desenhar: (c: ContextoVfx) => coreografia(perfil, c),
    duracao: Object.fromEntries(TIERS.map(t => [t, perfil.gesto === 'cometa' ? 740 : perfil.contato + 230])),
    impactos: Object.fromEntries(TIERS.map(t => [t, [perfil.contato]])),
    alcance: 66,
  }]),
)
