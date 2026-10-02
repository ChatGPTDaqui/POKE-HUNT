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
//   GROUND    01/10/2026 — aprovado pelo dono no lab do staging.
//   PSYCHIC, BUG, ROCK, FAIRY, DARK, STEEL, ICE, GHOST, DRAGON — 01/10/2026,
//             aprovados pelo dono no lab do staging, de uma vez. Com eles os
//             18 tipos estao migrados: nenhum golpe de dano cai mais na tira.
import type { ElementType } from '@/data/generated/types'
import { AGUA_AREA, AGUA_SINGLE } from './coreografias/agua'
import { ELETRICO_AREA, ELETRICO_SINGLE } from './coreografias/eletrico'
import { FOGO_AREA, FOGO_SINGLE } from './coreografias/fogo'
import { GRAMA_AREA, GRAMA_SINGLE } from './coreografias/grama'
import { LUTADOR_AREA, LUTADOR_SINGLE } from './coreografias/lutador'
import { NORMAL_AREA, NORMAL_SINGLE } from './coreografias/normal'
import { TERRA_AREA, TERRA_SINGLE } from './coreografias/terra'
import { VENENO_AREA, VENENO_SINGLE } from './coreografias/veneno'
import { VOADOR_AREA, VOADOR_SINGLE } from './coreografias/voador'
import { PSIQUICO_AREA, PSIQUICO_SINGLE } from './coreografias/psiquico'
import { INSETO_AREA, INSETO_SINGLE } from './coreografias/inseto'
import { ROCHA_AREA, ROCHA_SINGLE } from './coreografias/rocha'
import { FADA_AREA, FADA_SINGLE } from './coreografias/fada'
import { SOMBRIO_AREA, SOMBRIO_SINGLE } from './coreografias/sombrio'
import { ACO_AREA, ACO_SINGLE } from './coreografias/aco'
import { GELO_AREA, GELO_SINGLE } from './coreografias/gelo'
import { FANTASMA_AREA, FANTASMA_SINGLE } from './coreografias/fantasma'
import { DRAGAO_AREA, DRAGAO_SINGLE } from './coreografias/dragao'
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
  GROUND: TERRA_SINGLE,
  PSYCHIC: PSIQUICO_SINGLE,
  BUG: INSETO_SINGLE,
  ROCK: ROCHA_SINGLE,
  FAIRY: FADA_SINGLE,
  DARK: SOMBRIO_SINGLE,
  STEEL: ACO_SINGLE,
  ICE: GELO_SINGLE,
  GHOST: FANTASMA_SINGLE,
  DRAGON: DRAGAO_SINGLE,
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
  GROUND: TERRA_AREA,
  PSYCHIC: PSIQUICO_AREA,
  BUG: INSETO_AREA,
  ROCK: ROCHA_AREA,
  FAIRY: FADA_AREA,
  DARK: SOMBRIO_AREA,
  STEEL: ACO_AREA,
  ICE: GELO_AREA,
  GHOST: FANTASMA_AREA,
  DRAGON: DRAGAO_AREA,
}

export const REGISTRO_DE_MOTIVO: Partial<Record<Motivo, EntradaDeCoreografia>> = {}
