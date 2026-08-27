// "Especialidades" (PH-198) — progressao de dano/defesa por tipo elemental,
// 18 tipos x 10 niveis (5 de dano + 5 de defesa), inspirada no menu
// "Maestrias" do pokedream.com.br. Mecanica de referencia; numeros e material
// consumido sao proprios deste jogo, nao copiados de la.
//
// Material consumido: reaproveita as Stones (`data/stones.ts`), que ja
// existem, ja tem fonte de drop (kill universal, ver
// economySystem.ts#awardKillLoot) e ja sao "um item por tipo elemental".
// Criar um item novo so pra isto exigiria tambem inventar uma fonte de drop
// nova — a Stone ja resolve os dois. Efeito colateral aceito: a Stone de um
// tipo agora serve DOIS propositos (evolucao de Nivel 80 e Especialidades),
// concorrendo pelo mesmo drop. Se isso se provar apertado demais em
// playtest, a saida e uma fonte de drop dedicada, nao mudar o material.
import { TYPE_COLORS } from './typeColors'
import type { ElementType } from './generated/types'

export const ESPECIALIDADE_TYPES = Object.keys(TYPE_COLORS) as ElementType[]

export type EspecialidadeTrilha = 'dano' | 'defesa'

export interface EspecialidadeProgresso {
  dano: number
  defesa: number
}

export type EspecialidadeNiveis = Record<ElementType, EspecialidadeProgresso>

export function especialidadeNiveisDefault(): EspecialidadeNiveis {
  return Object.fromEntries(
    ESPECIALIDADE_TYPES.map((tipo) => [tipo, { dano: 0, defesa: 0 }]),
  ) as EspecialidadeNiveis
}

// 5 niveis por trilha, dano e defesa nasceram com a mesma escala (primeira
// leva — ver nota do modulo). `ESPECIALIDADE_CUSTOS[i]` e o custo pra SUBIR
// do nivel `i` pro nivel `i + 1` (indice 0 = alcancar nivel 1).
export const ESPECIALIDADE_NIVEL_MAX = 5

export interface EspecialidadeCusto {
  stoneQtd: number
  gold: number
}

export const ESPECIALIDADE_CUSTOS: EspecialidadeCusto[] = [
  { stoneQtd: 15, gold: 500 },
  { stoneQtd: 35, gold: 1500 },
  { stoneQtd: 70, gold: 4000 },
  { stoneQtd: 130, gold: 10000 },
  { stoneQtd: 220, gold: 25000 },
]

// +1% por nivel, ate +5% no nivel 5 — mesmo teto do pokedream.com.br (a forma
// e referencia; o numero em si e simples e facil de rebalancear).
export const ESPECIALIDADE_BONUS_POR_NIVEL = 0.01

export function custoDoProximoNivel(nivelAtual: number): EspecialidadeCusto | null {
  if (nivelAtual < 0 || nivelAtual >= ESPECIALIDADE_NIVEL_MAX) return null
  return ESPECIALIDADE_CUSTOS[nivelAtual]
}

function nivelDe(niveis: EspecialidadeNiveis | null | undefined, tipo: ElementType, trilha: EspecialidadeTrilha): number {
  return niveis?.[tipo]?.[trilha] ?? 0
}

/**
 * Multiplicador de DANO CAUSADO (1.00 a 1.05) pro tipo do golpe, trilha
 * "dano". So faz sentido aplicar no lado do ATACANTE.
 */
export function bonusDeAtaque(niveis: EspecialidadeNiveis | null | undefined, tipoDoGolpe: ElementType): number {
  return 1 + nivelDe(niveis, tipoDoGolpe, 'dano') * ESPECIALIDADE_BONUS_POR_NIVEL
}

/**
 * Multiplicador de DANO RECEBIDO (1.00 a 0.95) pro tipo do golpe, trilha
 * "defesa". So faz sentido aplicar no lado do DEFENSOR — reduz, nunca
 * amplifica.
 */
export function reducaoDeDefesa(niveis: EspecialidadeNiveis | null | undefined, tipoDoGolpe: ElementType): number {
  return 1 - nivelDe(niveis, tipoDoGolpe, 'defesa') * ESPECIALIDADE_BONUS_POR_NIVEL
}

/** Soma dos 180 niveis possiveis (18 tipos x 10), pro progresso global da tela. */
export function progressoGlobal(niveis: EspecialidadeNiveis): { atual: number; max: number } {
  const atual = ESPECIALIDADE_TYPES.reduce(
    (soma, tipo) => soma + (niveis[tipo]?.dano ?? 0) + (niveis[tipo]?.defesa ?? 0),
    0,
  )
  return { atual, max: ESPECIALIDADE_TYPES.length * ESPECIALIDADE_NIVEL_MAX * 2 }
}

// Titulos de marco pro progresso global — decisao de design, sem formula por
// tras (mesmo espirito dos limiares de estagio do Bestiario).
const TITULOS_POR_PERCENTUAL: { min: number; titulo: string }[] = [
  { min: 0, titulo: 'Novato' },
  { min: 0.2, titulo: 'Aprendiz' },
  { min: 0.4, titulo: 'Veterano' },
  { min: 0.7, titulo: 'Mestre' },
  { min: 1, titulo: 'Lendario' },
]

export function tituloDoProgresso(atual: number, max: number): string {
  const pct = max > 0 ? atual / max : 0
  let titulo = TITULOS_POR_PERCENTUAL[0].titulo
  for (const t of TITULOS_POR_PERCENTUAL) {
    if (pct >= t.min) titulo = t.titulo
  }
  return titulo
}
