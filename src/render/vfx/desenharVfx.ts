// Porta de entrada do VFX procedural pro laco de desenho (render/sprites.ts).
//
// Contrato com `drawImpactBurst` / `drawAoeRing`: devolve `true` quando o efeito
// PERTENCE ao procedural — mesmo que neste quadro nao haja nada a desenhar
// (antes do `delay` ou depois do fim da coreografia). Devolver `false` nesses
// quadros faria a tira PNG antiga aparecer no rabo de um efeito anime.
//
// So LE o efeito. Nada aqui escreve em `WorldEffect` — trancado em
// soVisual.test.ts, que congela o objeto e desenha por cima.
import { getAbility } from '@/data/abilities'
import type { WorldEffect } from '@/engine/types'
import { hashTexto, rngSemeado } from './aleatorio'
import { orcamentoDoQuadro, type Orcamento } from './orcamento'
import { PELES, paletaDaPele } from './paletas'
import { desenharPixelizado, type Retangulo } from './pixelizador'
import { resolverVfx, type VfxResolvido } from './resolverVfx'
import type { Ponto } from './tipos'

/** Duracao quando a coreografia nao declarou o tier pedido: a do maior tier declarado abaixo dele. */
export function duracaoDoTier(r: VfxResolvido): number {
  for (let t = r.tier; t >= 1; t--) {
    const d = r.entrada.duracao[t as keyof typeof r.entrada.duracao]
    if (d) return d
  }
  return 900
}

/** Folga lateral da area alem do raio: chamas e brasas passam um pouco da borda. */
const FOLGA_DA_AREA = 20

export function retanguloDoEfeito(origem: Ponto, alvo: Ponto, alcance: number, raio: number): Retangulo {
  if (raio > 0) {
    // AREA: o chao da camera 3/4 e uma ELIPSE achatada (0,45 na altura), nao
    // um circulo. Tratar como circulo fazia o pixelizador varrer um quadrado de
    // 690x690 quase vazio no Eruption — 3 ms so de getImageData. Aqui a altura
    // e o que o efeito sobe acima do peito (`alcance`) + o chao ate a borda da
    // elipse. O topo tambem cobre a borda DE TRAS da elipse (acima do peito
    // quando o raio e grande): sem isso a metade de tras do alcance era cortada.
    const x0 = alvo.x - raio - FOLGA_DA_AREA, x1 = alvo.x + raio + FOLGA_DA_AREA
    const y0 = Math.min(alvo.y - alcance, alvo.y + 12 - raio * 0.45 - FOLGA_DA_AREA)
    const y1 = alvo.y + 12 + raio * 0.45 + FOLGA_DA_AREA
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }
  const folga = alcance
  const x0 = Math.min(origem.x, alvo.x) - folga, y0 = Math.min(origem.y, alvo.y) - folga
  const x1 = Math.max(origem.x, alvo.x) + folga, y1 = Math.max(origem.y, alvo.y) + folga
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * Quanto (ms) o numero de dano de um golpe deve esperar pra aparecer junto do
 * PRIMEIRO impacto da coreografia. 0 quando o golpe nao tem coreografia nova —
 * o numero continua saindo no instante do hit, como sempre.
 */
export function atrasoDoNumeroDeDano(abilityId: string | undefined, critico?: boolean): number {
  if (!abilityId) return 0
  const area = getAbility(abilityId)?.target === 'aoe'
  const r = resolverVfx({ abilityId, area, critico })
  return r?.entrada.impactos?.[r.tier]?.[0] ?? 0
}

export interface OpcoesDeDesenho {
  orcamento?: Orcamento
  /** Troca o pixelizador — testes passam um que so chama `pintar`. */
  pixelizar?: typeof desenharPixelizado
}

export function desenharVfxDeGolpe(
  ctx: CanvasRenderingContext2D, effect: Readonly<WorldEffect>, opcoes: OpcoesDeDesenho = {},
): boolean {
  const r = resolverVfx({
    abilityId: effect.abilityId, elementType: effect.elementType, area: !!effect.isAoe, critico: effect.isCrit,
  })
  if (!r) return false

  const ms = (effect.age - effect.delay) * 1000
  const duracao = duracaoDoTier(r)
  if (ms < 0 || ms > duracao) return true

  const alvo = { x: effect.targetX ?? effect.x, y: effect.targetY ?? effect.y }
  const origem = effect.origemX !== undefined && effect.origemY !== undefined
    ? { x: effect.origemX, y: effect.origemY }
    : alvo
  const raio = r.area ? (effect.worldSize ?? 0) / 2 : 0
  const pele = PELES[r.tipo]
  const orcamento = opcoes.orcamento ?? orcamentoDoQuadro()
  const pixelizar = opcoes.pixelizar ?? desenharPixelizado

  pixelizar(ctx, retanguloDoEfeito(origem, alvo, r.entrada.alcance, raio), paletaDaPele(pele), c => {
    r.entrada.desenhar({
      ctx: c, ms, duracao, origem, alvo,
      angulo: effect.anguloDeAtaque ?? 0,
      raio, tier: r.tier, pele,
      // Semente nova a cada quadro, mesma sequencia: e isso que torna a
      // coreografia funcao pura de `ms` (ver aleatorio.ts).
      rng: rngSemeado(hashTexto(effect.id)),
      pedir: orcamento.pedir,
    })
  })
  return true
}
