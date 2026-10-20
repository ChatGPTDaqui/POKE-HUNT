// Mural de contratos e ovos (20/10/2026, design aprovado pelo dono em
// docs/planos/2026-10-20-mural-de-contratos-e-ovos-design.md).
//
// Este arquivo e a fonte dos NUMEROS. O servidor repete todos eles no SQL das
// RPCs (`mural_de_contratos`, `refresh_mural`, `reivindicar_contrato`,
// `chocar_ovo`), porque o sorteio de verdade acontece la. A defesa contra os
// dois lados divergirem e `ovos.test.ts`, que le a migration e compara numero
// a numero — mesmo padrao de `eeveeSorteado.test.ts`.
import type { RarityKey } from './rarity'

/** Raridades de contrato/ovo. Nao ha ovo Mitico: o Mitico vem so pela sorte. */
export type RaridadeDoOvo = Exclude<RarityKey, 'mythic'>
export const RARIDADES_DO_OVO: readonly RaridadeDoOvo[] = ['comum', 'incomum', 'raro', 'ultra', 'legendary']

/** Chance (%) de cada raridade de contrato aparecer no mural. Soma 100. */
export const CHANCE_DO_CONTRATO: Record<RaridadeDoOvo, number> = {
  comum: 50, incomum: 28, raro: 15, ultra: 6, legendary: 1,
}

/** Abates na equipe para o ovo chocar. */
export const ABATES_PARA_CHOCAR: Record<RaridadeDoOvo, number> = {
  comum: 200, incomum: 400, raro: 800, ultra: 1500, legendary: 3000,
}

/** Raridade do POKE que nasce, por raridade do ovo (%). Cada linha soma 100. */
export const RARIDADE_AO_CHOCAR: Record<RaridadeDoOvo, Record<RarityKey, number>> = {
  comum: { comum: 60, incomum: 30, raro: 8, ultra: 1.6, legendary: 0.35, mythic: 0.05 },
  incomum: { comum: 40, incomum: 38, raro: 17, ultra: 4, legendary: 0.85, mythic: 0.15 },
  raro: { comum: 20, incomum: 35, raro: 32, ultra: 10, legendary: 2.5, mythic: 0.5 },
  ultra: { comum: 5, incomum: 20, raro: 40, ultra: 27, legendary: 6.5, mythic: 1.5 },
  legendary: { comum: 0, incomum: 5, raro: 30, ultra: 40, legendary: 20, mythic: 5 },
}

/** Abates pedidos num contrato "derrote N", numa especie de peso de spawn cheio. */
export const ABATES_DO_CONTRATO: Record<RaridadeDoOvo, number> = {
  comum: 50, incomum: 100, raro: 200, ultra: 400, legendary: 800,
}
/** Peso de spawn de referencia: especie mais rara pede proporcionalmente menos. */
export const PESO_DE_REFERENCIA = 30
export const ABATES_MINIMOS_DO_CONTRATO = 10
/** Especie com peso de spawn menor que isto nao vira contrato (aparece raro demais). */
export const PESO_MINIMO_DO_CONTRATO = 5

/** Contrato shiny: so de raridade Raro ou maior, e so de especie que aparece bastante. */
export const CHANCE_DE_CONTRATO_SHINY = 0.45
export const PESO_MINIMO_PRO_SHINY = 20
/** Ovo de contrato shiny: chance de o POKE nascer shiny. */
export const CHANCE_SHINY_DO_OVO_SHINY = 0.25

export const CONTRATOS_POR_DIA = 5
/** Refresh: 10, 20, 40, 80... diamantes no mesmo dia. */
export const PRECO_BASE_DO_REFRESH = 10
export const precoDoRefresh = (refreshesHoje: number) => PRECO_BASE_DO_REFRESH * 2 ** refreshesHoje

/** IV minimo do POKE que nasce de ovo (pra valer a pena). */
export const IV_MINIMO_DO_OVO = 15

/** Bioma sempre disponivel no mural, mesmo sem estagio limpo. */
export const BIOMA_INICIAL_DO_MURAL = 'campo_aberto'

export function abatesDoContrato(raridade: RaridadeDoOvo, peso: number): number {
  return Math.max(ABATES_MINIMOS_DO_CONTRATO, Math.round(ABATES_DO_CONTRATO[raridade] * Math.min(1, peso / PESO_DE_REFERENCIA)))
}

// --------------------------------------------------------------- estado

export interface Contrato {
  slot: number
  speciesId: string
  baseId: string
  raridade: RaridadeDoOvo
  tipo: 'abates' | 'shiny'
  alvo: number
  /** Abates (ou abates shiny) da especie quando o contrato apareceu. */
  base: number
  reivindicado: boolean
}

export interface Mural {
  dia: string
  contratos: Contrato[]
  refreshes: number
}

export interface Ovo {
  id: string
  speciesId: string
  raridade: RaridadeDoOvo
  shiny: boolean
  abatesRestantes: number
  naEquipe: boolean
}

/** Progresso do contrato contra a Pokedex atual. */
export function progressoDoContrato(c: Contrato, kills: { normal?: number; shiny?: number } | undefined): number {
  const atual = c.tipo === 'shiny' ? (kills?.shiny ?? 0) : (kills?.normal ?? 0) + (kills?.shiny ?? 0)
  return Math.max(0, Math.min(c.alvo, atual - c.base))
}

/** Cada abate desconta 1 de todo ovo NA EQUIPE (espelho de `_descontar_abates_dos_ovos`). */
export function descontarAbatesDosOvos(ovos: Ovo[], abates: number): Ovo[] {
  if (abates <= 0) return ovos
  return ovos.map((o) => (o.naEquipe && o.abatesRestantes > 0
    ? { ...o, abatesRestantes: Math.max(0, o.abatesRestantes - abates) }
    : o))
}

/** Vagas da equipe ocupadas: POKEs + ovos na equipe (max 6). */
export function vagasOcupadas(team: readonly unknown[], ovos: readonly Ovo[] | undefined): number {
  return team.length + (ovos ?? []).filter((o) => o.naEquipe).length
}
