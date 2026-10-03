// Golpe -> qual coreografia, em que tier, com que pele.
//
// Unica porta de entrada do VFX procedural. Devolve `null` sempre que o desenho
// deve seguir o caminho antigo (tira PNG): tipo ainda nao migrado, golpe de
// status, golpe desconhecido. E esse `null` que deixa a migracao ser TIPO A
// TIPO sem o jogo nunca ficar sem efeito (decisao D4 do spec).
import { getAbility, isDamagingAbility } from '@/data/abilities'
import { motivoDoGolpe, tetoDoTier, tierDoPoder } from '@/data/tierDoVfx'
import type { ElementType } from '@/data/generated/types'
import { REGISTRO_DE_AREA, REGISTRO_DE_MOTIVO, REGISTRO_SINGLE, REGISTRO_POR_GOLPE } from './registro'
import type { EntradaDeCoreografia, Motivo, Tier } from './tipos'

// Faixas de poder, teto e motivo moraram aqui ate 02/10; foram pra
// data/tierDoVfx.ts (02/10). Reexportados pra quem ja importava daqui.
export { motivoDoGolpe, tetoDoTier, tierDoPoder }

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
  // Exceção aprovada: manter a sprite original, sem editar a arte/configuração.
  if (golpe.id === 'bullet_punch' && !pedido.area) return null
  const tipo = pedido.elementType ?? golpe.type
  const area = pedido.area

  // Critico sobe um degrau visual (D7), com teto no maior tier do alvo.
  const base = tierDoPoder(golpe.power, area)
  const tier = Math.min(base + (pedido.critico ? 1 : 0), tetoDoTier(area)) as Tier

  // Motivo manda (D5) — mas so em golpe alvo-unico: area de "soco" nao existe
  // no catalogo, e um Earthquake nao tem forma de punho.
  const motivo = area ? null : motivoDoGolpe(golpe.id)
  const porGolpe = area ? undefined : REGISTRO_POR_GOLPE[golpe.id]
  if (porGolpe) return { entrada: porGolpe, tipo, tier, area, motivo }
  if (motivo) {
    const entrada = REGISTRO_DE_MOTIVO[motivo]
    if (entrada) return { entrada, tipo, tier, area, motivo }
  }

  const entrada = (area ? REGISTRO_DE_AREA : REGISTRO_SINGLE)[tipo]?.[tier]
  return entrada ? { entrada, tipo, tier, area, motivo: null } : null
}
