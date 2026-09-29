// Onde cada coreografia pronta se inscreve.
//
// Inscrever um tipo aqui e o que o "migra": o resolver passa a devolver a
// coreografia e o desenho deixa de cair na tira PNG. Tipo ausente segue na
// tira, sem mudanca nenhuma — a migracao e tipo a tipo (decisao D4 do spec).
//
// Migrados:
//   FIRE  28/09/2026 — 4 single + 3 area aprovados pelo dono no lab.
import type { ElementType } from '@/data/generated/types'
import { FOGO_AREA, FOGO_SINGLE } from './coreografias/fogo'
import type { EntradaDeCoreografia, Motivo, Tier } from './tipos'

type PorTier = Partial<Record<Tier, EntradaDeCoreografia>>

export const REGISTRO_SINGLE: Partial<Record<ElementType, PorTier>> = {
  FIRE: FOGO_SINGLE,
}

export const REGISTRO_DE_AREA: Partial<Record<ElementType, PorTier>> = {
  FIRE: FOGO_AREA,
}

export const REGISTRO_DE_MOTIVO: Partial<Record<Motivo, EntradaDeCoreografia>> = {}
