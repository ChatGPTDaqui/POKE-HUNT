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
import { SOCOS_POR_GOLPE } from './coreografias/socos'
import { BEAMS_POR_GOLPE } from './coreografias/beams'
import { PUNHOS_PESADOS_POR_GOLPE } from './coreografias/punhosPesados'
import { VENTOS_EM_AREA_POR_GOLPE, VENTOS_POR_GOLPE } from './coreografias/ventos'
import { ONDAS_EM_AREA_POR_GOLPE, ONDAS_POR_GOLPE } from './coreografias/ondas'
import { EXPLOSOES_EM_AREA_POR_GOLPE, EXPLOSOES_POR_GOLPE } from './coreografias/explosoes'
import { LUZES_EM_AREA_POR_GOLPE, LUZES_POR_GOLPE } from './coreografias/luzes'
import { MENTES_POR_GOLPE } from './coreografias/mentes'
import { SONS_EM_AREA_POR_GOLPE, SONS_POR_GOLPE } from './coreografias/sons'
import { NEVOAS_EM_AREA_POR_GOLPE, NEVOAS_POR_GOLPE } from './coreografias/nevoas'
import { SOPROS_POR_GOLPE } from './coreografias/sopros'
import { PEDRAS_EM_AREA_POR_GOLPE, PEDRAS_POR_GOLPE } from './coreografias/pedras'
import { RAJADAS_POR_GOLPE } from './coreografias/rajadas'
import { ESFERAS_POR_GOLPE } from './coreografias/esferas'
import { LUTA_EM_AREA_POR_GOLPE, LUTA_POR_GOLPE } from './coreografias/lutaCorpo'
import { TRUQUES_POR_GOLPE } from './coreografias/truques'
import { PERFURAR_POR_GOLPE } from './coreografias/perfurar'
import { APERTOS_POR_GOLPE } from './coreografias/apertos'
import { CAUDAS_POR_GOLPE } from './coreografias/caudas'
import { SOME_E_VOLTA_POR_GOLPE } from './coreografias/someEVolta'
import { FURIAS_POR_GOLPE } from './coreografias/furias'
import { ROLAMENTOS_POR_GOLPE } from './coreografias/rolamentos'
import { CABECADAS_POR_GOLPE, INVESTIDAS_ELEMENTAIS_POR_GOLPE } from './coreografias/cargas'
import { CHUTES_POR_GOLPE } from './coreografias/chutes'
import { LAMINAS_POR_GOLPE } from './coreografias/laminas'
import { GARRAS_POR_GOLPE } from './coreografias/garras'
import { MORDIDAS_POR_GOLPE } from './coreografias/mordidas'
import { INVESTIDAS_POR_GOLPE } from './coreografias/investidas'

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
// Famílias de golpes por forma (plano docs/planos/2026-10-09-familias-de-golpes.md).
export const REGISTRO_POR_GOLPE: Record<string, EntradaDeCoreografia> = {
  ...SOCOS_POR_GOLPE, ...BEAMS_POR_GOLPE, ...MORDIDAS_POR_GOLPE, ...INVESTIDAS_POR_GOLPE,
  ...GARRAS_POR_GOLPE,
  ...LAMINAS_POR_GOLPE,
  ...CHUTES_POR_GOLPE,
  ...INVESTIDAS_ELEMENTAIS_POR_GOLPE, ...CABECADAS_POR_GOLPE,
  ...ROLAMENTOS_POR_GOLPE,
  ...FURIAS_POR_GOLPE,
  ...SOME_E_VOLTA_POR_GOLPE,
  ...CAUDAS_POR_GOLPE,
  ...APERTOS_POR_GOLPE,
  ...PERFURAR_POR_GOLPE,
  ...TRUQUES_POR_GOLPE,
  ...LUTA_POR_GOLPE,
  ...ESFERAS_POR_GOLPE,
  ...RAJADAS_POR_GOLPE,
  ...PEDRAS_POR_GOLPE,
  ...SOPROS_POR_GOLPE,
  ...NEVOAS_POR_GOLPE,
  ...SONS_POR_GOLPE,
  ...MENTES_POR_GOLPE,
  ...LUZES_POR_GOLPE,
  ...EXPLOSOES_POR_GOLPE,
  ...ONDAS_POR_GOLPE,
  ...VENTOS_POR_GOLPE,
  ...PUNHOS_PESADOS_POR_GOLPE,
}
export const REGISTRO_POR_GOLPE_DE_AREA: Record<string, EntradaDeCoreografia> = {
  ...LUTA_EM_AREA_POR_GOLPE,  ...PEDRAS_EM_AREA_POR_GOLPE,  ...NEVOAS_EM_AREA_POR_GOLPE,  ...SONS_EM_AREA_POR_GOLPE,  ...LUZES_EM_AREA_POR_GOLPE,  ...EXPLOSOES_EM_AREA_POR_GOLPE,  ...ONDAS_EM_AREA_POR_GOLPE,  ...VENTOS_EM_AREA_POR_GOLPE,
}
