// Onde cada coreografia pronta se inscreve.
//
// Inscrever um tipo aqui e o que o "migra": o resolver passa a devolver a
// coreografia e o desenho deixa de cair na tira PNG. Tipo ausente segue na
// tira, sem mudanca nenhuma — a migracao e tipo a tipo (decisao D4 do spec).
//
// Migrados:
//   FIRE      28/09/2026 — 4 single + 3 area aprovados pelo dono no lab.
//   ELECTRIC  30/09/2026 — aprovado pelo dono no lab do staging.
//   WATER     30/09/2026 — aprovado pelo dono no lab do staging.
//   GRASS     30/09/2026 — aprovado pelo dono no lab do staging.
//   NORMAL    30/09/2026 — aprovado pelo dono no lab do staging.
//   FIGHTING  30/09/2026 — aprovado pelo dono; sem A1 (nenhum golpe de lutador cai nele).
//   FLYING    30/09/2026 — aprovado pelo dono no lab do staging.
//   POISON    01/10/2026 — com o acabamento de impacto (acabamento.ts), no plano
//             que o dono mandou levar ate producao.
import type { ElementType } from '@/data/generated/types'
import { AGUA_AREA, AGUA_SINGLE } from './coreografias/agua'
import { ELETRICO_AREA, ELETRICO_SINGLE } from './coreografias/eletrico'
import { FOGO_AREA, FOGO_SINGLE } from './coreografias/fogo'
import { GRAMA_AREA, GRAMA_SINGLE } from './coreografias/grama'
import { LUTADOR_AREA, LUTADOR_SINGLE } from './coreografias/lutador'
import { NORMAL_AREA, NORMAL_SINGLE } from './coreografias/normal'
import { VENENO_AREA, VENENO_SINGLE } from './coreografias/veneno'
import { VOADOR_AREA, VOADOR_SINGLE } from './coreografias/voador'
import type { EntradaDeCoreografia, Motivo, Tier } from './tipos'

type PorTier = Partial<Record<Tier, EntradaDeCoreografia>>

export const REGISTRO_SINGLE: Partial<Record<ElementType, PorTier>> = {
  FIRE: FOGO_SINGLE,
  ELECTRIC: ELETRICO_SINGLE,
  WATER: AGUA_SINGLE,
  GRASS: GRAMA_SINGLE,
  NORMAL: NORMAL_SINGLE,
  FIGHTING: LUTADOR_SINGLE,
  FLYING: VOADOR_SINGLE,
  POISON: VENENO_SINGLE,
}

export const REGISTRO_DE_AREA: Partial<Record<ElementType, PorTier>> = {
  FIRE: FOGO_AREA,
  ELECTRIC: ELETRICO_AREA,
  WATER: AGUA_AREA,
  GRASS: GRAMA_AREA,
  NORMAL: NORMAL_AREA,
  FIGHTING: LUTADOR_AREA,
  FLYING: VOADOR_AREA,
  POISON: VENENO_AREA,
}

export const REGISTRO_DE_MOTIVO: Partial<Record<Motivo, EntradaDeCoreografia>> = {}
