// Golpe -> qual coreografia, em que tier, com que pele.
//
// Unica porta de entrada do VFX procedural. Devolve `null` sempre que o desenho
// deve seguir o caminho antigo (tira PNG): tipo ainda nao migrado, golpe de
// status, golpe desconhecido. E esse `null` que deixa a migracao ser TIPO A
// TIPO sem o jogo nunca ficar sem efeito (decisao D4 do spec).
import { getAbility, isDamagingAbility } from '@/data/abilities'
import type { ElementType } from '@/data/generated/types'
import { REGISTRO_DE_AREA, REGISTRO_DE_MOTIVO, REGISTRO_SINGLE } from './registro'
import type { EntradaDeCoreografia, Motivo, Tier } from './tipos'

/**
 * Faixas fixas de poder (D2/D3), iguais pra todo tipo: poder 90 e "forte" em
 * qualquer elemento. Poder entre faixas cai na de BAIXO — o limite e `<`.
 *
 * Os numeros sairam dos quartis reais do catalogo em 2026-09-28 (50/65/90).
 */
const LIMITES_SINGLE = [55, 80, 100] as const
const LIMITES_AREA = [65, 100] as const

/**
 * Golpe de DANO sem poder base (Magnitude, Seismic Toss... — ver
 * `DANO_SEM_PODER_BASE`) cai aqui: o dano existe, so nao tem numero pra
 * comparar. T2 e o meio honesto: nem o estalo do golpe fraco nem o espetaculo
 * do forte.
 */
const TIER_SEM_PODER: Tier = 2

export function tierDoPoder(power: number, area: boolean): Tier {
  if (power <= 0) return TIER_SEM_PODER
  const limites = area ? LIMITES_AREA : LIMITES_SINGLE
  let tier = 1
  for (const limite of limites) if (power >= limite) tier++
  return tier as Tier
}

/** Teto de tier por alvo: area tem 3 degraus, single tem 4. */
export function tetoDoTier(area: boolean): Tier {
  return area ? 3 : 4
}

/**
 * Ordem importa: `high_jump_kick` tem que virar chute, nao investida, e
 * `crush_claw` garra. O primeiro padrao que casa ganha.
 *
 * Por PEDACO do id separado por `_`, nao substring: `peck` nao pode casar em
 * `speck_x` nem `horn` em `thorn_*`.
 */
const MOTIVOS: ReadonlyArray<readonly [Motivo, ReadonlyArray<string>]> = [
  ['soco', ['punch']],
  ['chute', ['kick']],
  ['mordida', ['bite', 'fang', 'crunch']],
  ['garra', ['claw', 'scratch']],
  ['chifre', ['horn', 'megahorn']],
  ['bicada', ['peck']],
  ['corte', ['chop', 'slash', 'cut']],
  ['investida', ['tackle', 'slam', 'rush']],
]

export function motivoDoGolpe(abilityId: string): Motivo | null {
  const pedacos = abilityId.split('_')
  for (const [motivo, chaves] of MOTIVOS) {
    if (pedacos.some(p => chaves.includes(p))) return motivo
  }
  return null
}

export interface VfxResolvido {
  entrada: EntradaDeCoreografia
  tipo: ElementType
  tier: Tier
  area: boolean
  motivo: Motivo | null
}

export interface PedidoDeVfx {
  abilityId?: string
  elementType?: ElementType
  area: boolean
  critico?: boolean
}

export function resolverVfx(pedido: PedidoDeVfx): VfxResolvido | null {
  if (!pedido.abilityId) return null
  const golpe = getAbility(pedido.abilityId)
  if (!golpe || !isDamagingAbility(golpe)) return null
  const tipo = pedido.elementType ?? golpe.type
  const area = pedido.area

  // Critico sobe um degrau visual (D7), com teto no maior tier do alvo.
  const base = tierDoPoder(golpe.power, area)
  const tier = Math.min(base + (pedido.critico ? 1 : 0), tetoDoTier(area)) as Tier

  // Motivo manda (D5) — mas so em golpe alvo-unico: area de "soco" nao existe
  // no catalogo, e um Earthquake nao tem forma de punho.
  const motivo = area ? null : motivoDoGolpe(golpe.id)
  if (motivo) {
    const entrada = REGISTRO_DE_MOTIVO[motivo]
    if (entrada) return { entrada, tipo, tier, area, motivo }
  }

  const entrada = (area ? REGISTRO_DE_AREA : REGISTRO_SINGLE)[tipo]?.[tier]
  return entrada ? { entrada, tipo, tier, area, motivo: null } : null
}
