import FONTE from '../../scripts/usum/maquinas.json'
import { getAbility } from './abilities'
import { createRng, nextFloat } from '@/core/rng'

// PH-512: sorteio único por abate; a loja compra, mas não fornece TMs.
export const CHANCE_DROP_TM = 0.001
export const PRECO_VENDA_TM = 1000

export interface TmItem {
  id: string
  name: string
  kind: 'tm'
  numero: number
  golpe: string
  description: string
  sellPrice: number
}

export const TM_ITEMS: Record<string, TmItem> = Object.fromEntries(
  FONTE.tms.flatMap(({ numero, golpe }) => {
    const habilidade = getAbility(golpe)
    if (!habilidade) throw new Error(`TM sem implementação: ${golpe}`)
    const id = `tm_${String(numero).padStart(2, '0')}`
    return [[id, {
      id, numero, golpe, kind: 'tm' as const,
      name: `TM${String(numero).padStart(2, '0')} — ${habilidade.name}`,
      description: `Ensina ${habilidade.name} permanentemente a um POKE compatível. Consumida ao usar.`,
      sellPrice: PRECO_VENDA_TM,
    }]]
  }),
)
export const TMS_DROPAVEIS = Object.values(TM_ITEMS)
const DROP_POR_ESPECIE = Object.fromEntries(Object.keys(FONTE.especies).map(id =>
  [id, TMS_DROPAVEIS.filter(tm => aceitaTm(id, tm.id))],
))

/** Fluxo de RNG independente: não desloca captura, IV, shiny nem combate. */
export function sortearTm(speciesId: string, estadoRng: number): TmItem | null {
  const pool = DROP_POR_ESPECIE[speciesId] ?? []
  if (!pool.length) return null
  const rngTm = createRng(estadoRng ^ 0x544d0512)
  if (nextFloat(rngTm) >= CHANCE_DROP_TM) return null
  return pool[Math.floor(nextFloat(rngTm) * pool.length)]
}

export function aceitaTm(speciesId: string, itemId: string): boolean {
  const tm = TM_ITEMS[itemId]
  const especie = FONTE.especies[speciesId as keyof typeof FONTE.especies]
  return Boolean(tm && especie && (especie.tm as number[]).includes(tm.numero))
}
