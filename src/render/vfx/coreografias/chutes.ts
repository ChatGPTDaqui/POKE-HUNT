// Família Chute e pisão (09/10): dez golpes de pé.
//
// A forma é o PÉ: uma bota de perfil desenhada na grade (calcanhar, sola,
// bico), irmã do punho dos socos. Muda o CAMINHO do pé — reto, saltando de
// cima, girando em volta do alvo, rasteiro na altura das patas, descendo
// sobre o alvo (pisão) — e o que ele deixa: poeira, chama, rachadura no chão.
import { getAbility } from '@/data/abilities'
import { emitirParticulas } from '../particulas'
import { PELES } from '../paletas'
import { crescente, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, entrePontos, janela, montarFamilia, nuvem, poligono, rastro } from './formas'
import { CORES_SECUNDARIAS, secundario } from './secundarios'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

type Caminho = 'reto' | 'salto' | 'giro' | 'rasteira' | 'pisao'
type Extra = 'nenhum' | 'chama' | 'poeira' | 'tremor' | 'triplo'

interface Perfil {
  caminho: Caminho
  extra: Extra
  contato: number
  /** Duração do movimento do pé até o contato. */
  golpe: number
  tamanho: number
}

export const PERFIS_DE_CHUTE: Record<string, Perfil> = {
  jump_kick: { caminho: 'salto', extra: 'nenhum', contato: 170, golpe: 130, tamanho: 1.05 },
  high_jump_kick: { caminho: 'salto', extra: 'nenhum', contato: 230, golpe: 160, tamanho: 1.25 },
  rolling_kick: { caminho: 'giro', extra: 'nenhum', contato: 160, golpe: 140, tamanho: 1 },
  triple_kick: { caminho: 'reto', extra: 'triplo', contato: 100, golpe: 80, tamanho: .8 },
  low_kick: { caminho: 'rasteira', extra: 'poeira', contato: 130, golpe: 100, tamanho: .95 },
  low_sweep: { caminho: 'rasteira', extra: 'poeira', contato: 150, golpe: 120, tamanho: 1.05 },
  mega_kick: { caminho: 'reto', extra: 'nenhum', contato: 220, golpe: 110, tamanho: 1.3 },
  blaze_kick: { caminho: 'reto', extra: 'chama', contato: 160, golpe: 110, tamanho: 1.1 },
  stomp: { caminho: 'pisao', extra: 'poeira', contato: 170, golpe: 120, tamanho: 1.2 },
  stomping_tantrum: { caminho: 'pisao', extra: 'tremor', contato: 150, golpe: 100, tamanho: 1.05 },
}

/** Triple Kick: intervalo entre chutes; Stomping Tantrum: entre pisões. */
const SEGUINTE = 110
const CHOQUE = 260
const repeticoes = (p: Perfil, acertos?: number) =>
  p.extra === 'triplo' ? Math.max(1, Math.min(3, Math.trunc(acertos ?? 3))) : p.extra === 'tremor' ? 3 : 1
const duracaoDe = (p: Perfil) => p.contato + (p.extra === 'triplo' || p.extra === 'tremor' ? 2 * SEGUINTE : 0) + CHOQUE + 20

/** Bota de perfil com o bico pra +X e a sola pra +Y. */
function pe(ctx: CanvasRenderingContext2D, p: Ponto, angulo: number, escala: number, pele: Pele, espelha = false): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angulo); ctx.scale(escala, escala * (espelha ? -1 : 1))
  const bota: readonly (readonly [number, number])[] = [[-11, -11], [-3, -11], [-1, -4], [6, -3], [12, 0], [13, 4], [10, 7], [-11, 7]]
  const grossa = bota.map(([x, y]) => [x * 1.12 + (x > 0 ? .4 : -.4), y * 1.15] as const)
  poligono(ctx, grossa, pele.contorno)
  poligono(ctx, bota, pele.base)
  poligono(ctx, [[-9, -9], [-4.5, -9], [-2.6, -3], [5, -1.6], [10.5, 1], [-9, 1]], pele.meio)
  poligono(ctx, [[-8, -8], [-5, -8], [-3.6, -3.4], [-8, -3]], pele.nucleo)
  // Sola escura com o bico claro: é o que lê como "pé" e não como bloco.
  poligono(ctx, [[-11, 4.6], [11.6, 4.6], [10, 7], [-11, 7]], ESCURO)
  ctx.fillStyle = BRANCO; ctx.fillRect(9, -.6, 2.4, 2)
  ctx.restore()
}

function desenhar(perfil: Perfil, c: ContextoVfx): void {
  const { ctx, ms, tier, origem, alvo } = c
  const pele = c.pele
  const semente = Math.floor(c.rng() * 0xffffffff)
  const dx = alvo.x - origem.x, dy = alvo.y - origem.y, L = Math.hypot(dx, dy)
  const angulo = L > .01 ? Math.atan2(dy, dx) : c.angulo
  const ux = Math.cos(angulo), uy = Math.sin(angulo)
  const vira = ux < 0
  const escala = .62 * perfil.tamanho * (1 + (tier - 1) * .06)
  const n = repeticoes(perfil, c.acertos)
  const chao = { x: alvo.x, y: alvo.y + 11 }

  for (let k = 0; k < n; k++) {
    const contato = perfil.contato + k * SEGUINTE
    const ini = contato - perfil.golpe
    const tam = escala * (perfil.extra === 'triplo' ? .8 + k * .18 : 1)
    const rng = rngSemeado(semente + 10 + k)
    // Onde o pé bate: no peito, nas patas (rasteira) ou em cima (pisão).
    const destino = perfil.caminho === 'rasteira' ? { x: alvo.x - ux * 8, y: alvo.y + 7 }
      : perfil.caminho === 'pisao' ? { x: alvo.x + (perfil.extra === 'tremor' ? [0, -9, 9][k] : 0), y: alvo.y - 2 }
      : { x: alvo.x - ux * 12 * tam, y: alvo.y - uy * 12 * tam - 2 }

    const t = janela(ms, ini, perfil.golpe + 90)
    if (t !== null) {
      const u = limitar((ms - ini) / perfil.golpe)
      const solta = 1 - limitar((ms - contato) / 90)
      let p: Ponto, ang = angulo
      switch (perfil.caminho) {
        case 'salto': {
          // Sobe por trás de quem chuta e desce em diagonal no alvo.
          const alto = perfil.contato > 200 ? 34 : 24
          const de = { x: origem.x - ux * 4, y: origem.y - alto }
          p = entrePontos(de, destino, saida(u))
          ang = Math.atan2(destino.y - de.y, destino.x - de.x)
          if (u < 1) rastro(ctx, de, p, c.pedir(2 + tier), 4, pele, rng, .8)
          break
        }
        case 'giro': {
          // Meia-volta em torno do alvo, de cima pra frente; o rastro é um crescente.
          const R = 17, a0 = -Math.PI / 2 - (vira ? -1.6 : 1.6), a1 = vira ? Math.PI * .1 : Math.PI - Math.PI * .1
          const a = a0 + (a1 - a0) * saida(u)
          p = { x: alvo.x - Math.cos(a) * R * (vira ? -1 : 1), y: alvo.y - 2 + Math.sin(a) * R * .8 }
          ang = a + (vira ? 0 : Math.PI) + Math.PI / 2
          if (u < 1) crescente(ctx, { x: alvo.x, y: alvo.y - 2 }, R, a0, a, 3.2, .6, 0, pele, .8)
          break
        }
        case 'rasteira': {
          const de = { x: origem.x + ux * 4, y: origem.y + 8 }
          p = entrePontos(de, destino, saida(u))
          ang = vira ? Math.PI : 0
          if (u < 1) rastro(ctx, de, p, c.pedir(2 + tier), 2, pele, rng, .9)
          break
        }
        case 'pisao': {
          // Pé gigante desce de cima, sola pra baixo.
          const de = { x: destino.x, y: destino.y - 34 }
          p = entrePontos(de, destino, u * u)
          ang = vira ? Math.PI : 0
          ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(chao.x + (destino.x - alvo.x), chao.y, 8 + 6 * u, 2.6 + 2 * u, 0, 0, Math.PI * 2); ctx.fill()
          if (u < 1) rastro(ctx, de, p, c.pedir(2), 6, pele, rng, .6)
          break
        }
        default: {
          const de = { x: origem.x + ux * 6, y: origem.y + uy * 6 }
          p = entrePontos(de, destino, saida(u))
          if (u < 1) rastro(ctx, de, p, c.pedir(2 + tier), 4, pele, rng, .8)
        }
      }
      if (perfil.extra === 'chama' && solta > 0) emitirParticulas(ctx, pele, p, c.pedir(3 + tier), 10, limitar(u * .8), 4, rng)
      if (solta > .05) pe(ctx, p, ang, tam * (.7 + .3 * solta), pele, vira && perfil.caminho !== 'giro')
    }

    // Choque.
    const tc = janela(ms, contato, CHOQUE)
    if (tc === null) continue
    const forte = perfil.contato >= 200 || perfil.caminho === 'pisao'
    const ponto = perfil.caminho === 'pisao' ? { x: destino.x, y: alvo.y + 4 } : perfil.caminho === 'rasteira' ? { x: alvo.x, y: alvo.y + 6 } : { x: alvo.x, y: alvo.y - 3 }
    estrelaDeImpacto(ctx, ponto, (forte ? 13 : 9) + tier * 1.5 - (perfil.extra === 'triplo' ? 2 - k : 0), tc, pele, rng)
    riscos(ctx, ponto, c.pedir(2 + tier), 18 + tier * 3, tc, pele.meio, rng)
    if (perfil.extra === 'poeira' || perfil.extra === 'tremor' || perfil.caminho === 'salto' && forte) {
      nuvem(ctx, { x: ponto.x, y: chao.y }, tc, c.pedir(4 + tier), 14 + tier * 2, PELES.GROUND, rng)
    }
    if (perfil.extra === 'tremor') {
      // Rachadura curta no chão a cada pisão.
      const k2 = 1 - limitar((tc - .5) / .5)
      if (k2 > 0) for (const lado of [-1, 1]) {
        poligono(ctx, [[ponto.x, chao.y], [ponto.x + lado * 5, chao.y - 1.5], [ponto.x + lado * 9 * k2, chao.y + 1], [ponto.x + lado * 4, chao.y + 1.2]], ESCURO)
      }
    }
    if (perfil.extra === 'chama') emitirParticulas(ctx, pele, ponto, c.pedir(4 + tier), 20 + tier * 2, tc, 4, rng)
  }
}

export const CHUTES_POR_GOLPE = montarFamilia(PERFIS_DE_CHUTE, {
  desenhar: (p, c, id) => { desenhar(p, c); secundario(id, c, p.contato) },
  duracao: duracaoDe,
  contato: p => p.contato,
  alcance: 50,
  // Saltos começam acima de quem chuta: folga extra só pra cima.
  margem: p => p.caminho === 'salto' || p.caminho === 'pisao' ? { cima: 70, baixo: 50, lados: 50 } : { cima: 56, baixo: 50, lados: 50 },
  // A poeira usa a pele do chão: as cores dela precisam estar na paleta.
  pele: id => peleComChao(id),
})

function peleComChao(id: string): Pele {
  const base = PELES[getAbility(id)?.type ?? 'NORMAL'], chao = PELES.GROUND
  return { ...base, acento: [...(base.acento ?? []), chao.base, chao.meio, chao.contorno, ...CORES_SECUNDARIAS] }
}
