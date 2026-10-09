// Família Garra (09/10): sete golpes de arranhar.
//
// A forma é o RASGO: três talhos paralelos que atravessam o alvo na diagonal,
// crescendo um depois do outro como um passar de unhas, e se recolhendo pela
// cauda. Cada golpe muda o número de passadas, a espessura, o que aparece
// antes (a mão de sombra do Shadow Claw) e o que fica depois (lascas do Crush
// Claw, fagulhas do Metal Claw, brilho dracônico do Dragon Claw).
import { estilhacos, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, brilho, janela, montarFamilia, poligono, rastro, talho } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

type Estilo = 'arranhao' | 'furia' | 'esmaga' | 'metal' | 'sombra' | 'dragao' | 'poupa'

interface Perfil {
  estilo: Estilo
  contato: number
  /** Número de talhos por passada. */
  talhos: number
  /** Comprimento e espessura de cada talho. */
  comprimento: number
  espessura: number
}

export const PERFIS_DE_GARRA: Record<string, Perfil> = {
  scratch: { estilo: 'arranhao', contato: 110, talhos: 3, comprimento: 22, espessura: 2.2 },
  fury_swipes: { estilo: 'furia', contato: 100, talhos: 3, comprimento: 18, espessura: 1.9 },
  crush_claw: { estilo: 'esmaga', contato: 170, talhos: 3, comprimento: 27, espessura: 3.4 },
  metal_claw: { estilo: 'metal', contato: 140, talhos: 3, comprimento: 24, espessura: 2.6 },
  shadow_claw: { estilo: 'sombra', contato: 190, talhos: 3, comprimento: 28, espessura: 3 },
  dragon_claw: { estilo: 'dragao', contato: 160, talhos: 3, comprimento: 28, espessura: 3.2 },
  false_swipe: { estilo: 'poupa', contato: 120, talhos: 1, comprimento: 24, espessura: 2.4 },
}

/** Fury Swipes: intervalo entre passadas (uma por acerto resolvido). */
const PASSADA = 95
/** Tempo do talho crescer, ficar e se recolher. */
const RISCA = 70, FICA = 90, RECOLHE = 160

const passadasDe = (p: Perfil, acertos?: number) => p.estilo === 'furia' ? Math.max(1, Math.min(5, Math.trunc(acertos ?? 2))) : 1
const duracaoDe = (p: Perfil) => p.contato + (p.estilo === 'furia' ? 4 * PASSADA : 0) + RISCA + FICA + RECOLHE + 20

/** Mão de sombra que sobe do chão com três unhas curvas (Shadow Claw). */
function maoDeSombra(ctx: CanvasRenderingContext2D, p: Ponto, s: number, pele: Pele): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(s, s)
  for (const [x, inclina] of [[-7, -.35], [0, 0], [7, .35]] as const) {
    ctx.save(); ctx.translate(x, -6); ctx.rotate(inclina)
    poligono(ctx, [[-3.6, 2], [3.6, 2], [2.6, -9], [-1, -15.5], [.2, -9]], ESCURO)
    poligono(ctx, [[-2.4, 1], [2.4, 1], [1.6, -8], [-.6, -13.4], [-.4, -8]], pele.meio)
    poligono(ctx, [[-.6, -6], [.8, -6], [-.4, -12]], BRANCO)
    ctx.restore()
  }
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2); ctx.fillStyle = ESCURO; ctx.fill()
  ctx.beginPath(); ctx.ellipse(0, -.5, 11.5, 5.6, 0, 0, Math.PI * 2); ctx.fillStyle = pele.base; ctx.fill()
  ctx.restore()
}

function desenhar(perfil: Perfil, c: ContextoVfx): void {
  const { ctx, ms, tier, pele, origem, alvo } = c
  const semente = Math.floor(c.rng() * 0xffffffff)
  const centro = { x: alvo.x, y: alvo.y - 3 }
  const escala = 1 + (tier - 1) * .06
  const passadas = passadasDe(perfil, c.acertos)

  // Shadow Claw: a mão sobe da sombra do alvo antes de rasgar.
  if (perfil.estilo === 'sombra') {
    const t = janela(ms, perfil.contato - 150, 150 + RISCA)
    if (t !== null) {
      const sobe = saida(limitar(t / .6)), varre = limitar((t - .65) / .35)
      const p = { x: centro.x - 8 + varre * 16, y: alvo.y + 14 - sobe * 14 - varre * 18 }
      maoDeSombra(ctx, p, .7 * escala * (1 - varre * .5), pele)
    }
  }
  // Dragon Claw: arco de energia saindo de quem ataca até o alvo.
  if (perfil.estilo === 'dragao') {
    const t = janela(ms, perfil.contato - 90, 130)
    if (t !== null) rastro(ctx, origem, centro, c.pedir(3 + tier), 7, pele, rngSemeado(semente + 1), 1 - limitar((t - .7) / .3))
  }

  for (let k = 0; k < passadas; k++) {
    const ini = perfil.contato + k * PASSADA
    const t = janela(ms, ini - RISCA, RISCA + FICA + RECOLHE)
    if (t === null) continue
    const dt = ms - (ini - RISCA)
    // Diagonal "\" na primeira passada; a fúria alterna "/" e "\".
    const inverte = perfil.estilo === 'furia' && k % 2 === 1
    const ang = (inverte ? -1 : 1) * (perfil.estilo === 'esmaga' ? 1.15 : perfil.estilo === 'sombra' ? -1 : .85)
    const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux
    const L = perfil.comprimento * escala / 2
    const n = perfil.talhos + (perfil.estilo === 'dragao' && tier >= 3 ? 1 : 0)
    // Estrela ATRÁS dos talhos: o rasgo é a forma principal e não pode sumir no clarão.
    const tc = janela(ms, ini, 260)
    const rng = rngSemeado(semente + 10 + k)
    const forte = perfil.estilo === 'esmaga' || perfil.estilo === 'dragao'
    if (tc !== null && (k === 0 || perfil.estilo === 'furia')) estrelaDeImpacto(ctx, centro, (forte ? 11 : 7) + tier * 1.2 - (perfil.estilo === 'furia' ? 2 : 0), tc, pele, rng)
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 6.2 * escala
      const atraso = i * 18
      const cresce = (dt - atraso) / RISCA
      const some = (dt - RISCA - FICA - atraso) / RECOLHE
      const a = { x: centro.x - ux * L + nx * off, y: centro.y - uy * L + ny * off }
      const b = { x: centro.x + ux * L + nx * off, y: centro.y + uy * L + ny * off }
      if (perfil.estilo === 'dragao') talho(ctx, a, b, perfil.espessura * 1.9, cresce, some, pele, pele.base, pele.base)
      const meio = perfil.estilo === 'arranhao' || perfil.estilo === 'furia' || perfil.estilo === 'poupa' ? pele.nucleo : pele.meio
      talho(ctx, a, b, perfil.espessura * escala, cresce, some, pele, meio, BRANCO)
    }

    // Rescaldo do contato, na frente.
    if (tc === null) continue
    riscos(ctx, centro, c.pedir(2 + tier), 18 + tier * 3, tc, pele.meio, rng)
    switch (perfil.estilo) {
      case 'esmaga': estilhacos(ctx, centro, c.pedir(3 + (tier >> 1)), 20 + tier * 3, tc, pele, rng); break
      case 'metal':
        // Fagulhas quentes saindo pela ponta das unhas.
        for (let j = 0; j < Math.min(c.pedir(3 + tier), 6); j++) {
          const a = ang + (rng() - .5) * 1.4 + (j % 2 ? Math.PI : 0), d = (8 + rng() * 14) * saida(tc)
          brilho(ctx, centro.x + Math.cos(a) * d, centro.y + Math.sin(a) * d + 10 * tc * tc, 2.2 * (1 - tc), pele.acento?.[1] ?? pele.meio)
        }
        break
      case 'dragao':
        for (let j = 0; j < Math.min(c.pedir(2 + tier), 5); j++) {
          const a = rng() * Math.PI * 2, d = (10 + rng() * 10) * saida(tc)
          brilho(ctx, centro.x + Math.cos(a) * d, centro.y + Math.sin(a) * d * .8, 2.6 * (1 - tc), pele.meio)
        }
        break
      case 'poupa': {
        // False Swipe: o talho "freia" e sobra um brilho de piedade.
        const tb = limitar((tc - .3) / .7)
        if (tb > 0) brilho(ctx, centro.x + 9, centro.y - 10 - tb * 6, 3.2 * (1 - tb), BRANCO)
        break
      }
    }
  }
}

export const GARRAS_POR_GOLPE = montarFamilia(PERFIS_DE_GARRA, {
  desenhar,
  duracao: duracaoDe,
  contato: p => p.contato,
  alcance: 44,
})
