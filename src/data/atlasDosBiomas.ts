// O ATLAS DOS BIOMAS: o que a Wiki mostra e a Pokedex consulta sobre cada
// sub-bioma e cada sala especial.
//
// Tudo aqui e DERIVADO dos mesmos dados que o motor usa (`BIOMAS`, a curva de
// `pesosDoEstagio`, a tabela de elenco, o clima e o loot). Nenhum numero e
// digitado, pelo mesmo motivo da aba Mundo da Wiki (ver o cabecalho de
// `features/wiki/abaMundo.tsx`): texto digitado a mao apodrece no primeiro
// rebalanceamento, e o jogador le a explicacao de outro jogo.
import {
  BIOMAS, LOOT, type BiomaDef, type SalaEspecialDef, type SubBiomaDef,
} from './biomas'
import { ESTAGIOS_POR_BIOMA, pesosDoEstagio } from './estagios'
import { ELENCO_DO_SUB_BIOMA, ELENCO_POR_ESTAGIO } from './generated/elencoPorEstagio.generated'
import { SUB_BIOMA_CLIMA } from './generated/subBiomas.generated'
import type { ClimaTipo } from '@/engine/types'

export interface FichaDoSubBioma {
  sub: SubBiomaDef
  /** Estagios do bioma em que a sala pode cair neste sub-bioma, em ordem. */
  estagios: number[]
  /** O estagio em que ele tem a maior fatia do bioma. */
  pico: number
  /** Fatia dele no estagio de pico (0..1). */
  fatiaNoPico: number
  /** Climas possiveis, do mais provavel pro menos. */
  climas: { tipo: ClimaTipo | 'limpo'; chance: number }[]
  /** Itens que o lugar solta, na ordem do perfil. */
  itens: string[]
  /** As linhas evolutivas mais comuns no estagio de pico (raiz da linha). */
  destaques: string[]
}

export interface FichaDaSalaEspecial {
  sala: SalaEspecialDef
  climas: FichaDoSubBioma['climas']
  itens: string[]
  /** Toda especie que pode nascer nela. */
  especies: readonly string[]
  /** As que NAO nascem em nenhum sub-bioma comum: so aqui. */
  exclusivas: readonly string[]
}

export interface FichaDoBioma {
  bioma: BiomaDef
  subBiomas: FichaDoSubBioma[]
  especiais: FichaDaSalaEspecial[]
  /** Composicao de cada estagio (1..10): fatia de cada sub-bioma, soma 1. */
  composicao: Record<string, number>[]
}

function climasDe(chave: string): FichaDoSubBioma['climas'] {
  const pesos = SUB_BIOMA_CLIMA[chave] ?? {}
  const total: number = Object.values(pesos).reduce<number>((a, b) => a + (b ?? 0), 0)
  if (!(total > 0)) return [{ tipo: 'limpo', chance: 1 }]
  return Object.entries(pesos)
    .map(([tipo, peso]) => ({ tipo: tipo as ClimaTipo | 'limpo', chance: (peso ?? 0) / total }))
    .sort((a, b) => b.chance - a.chance)
}

const itensDe = (sub: SubBiomaDef) => LOOT[sub.loot].map((d) => d.itemId)

/** Especies que nascem em algum sub-bioma COMUM (nao sala especial). */
const NO_MATO_COMUM = new Set(
  BIOMAS.flatMap((b) => b.subBiomas.flatMap((s) => ELENCO_DO_SUB_BIOMA[s.chave] ?? [])),
)

function fichaDoBioma(bioma: BiomaDef): FichaDoBioma {
  const composicao = Array.from({ length: ESTAGIOS_POR_BIOMA }, (_, i) => pesosDoEstagio(bioma, i + 1))
  const subBiomas = bioma.subBiomas.map((sub): FichaDoSubBioma => {
    const estagios: number[] = []
    let pico = 1
    let fatiaNoPico = 0
    composicao.forEach((pesos, i) => {
      const f = pesos[sub.chave] ?? 0
      // Fatia abaixo de meio por cento e arredondamento da curva, e nao um
      // lugar onde o jogador vai cair de verdade: fica fora da lista.
      if (f >= 0.005) estagios.push(i + 1)
      if (f > fatiaNoPico) { fatiaNoPico = f; pico = i + 1 }
    })
    const destaques = (ELENCO_POR_ESTAGIO[sub.chave]?.[pico] ?? []).slice(0, 4).map(([raiz]) => raiz)
    return { sub, estagios, pico, fatiaNoPico, climas: climasDe(sub.chave), itens: itensDe(sub), destaques }
  })
  const especiais = (bioma.especiais ?? []).map((sala): FichaDaSalaEspecial => {
    const especies = ELENCO_DO_SUB_BIOMA[sala.chave] ?? []
    return {
      sala,
      climas: climasDe(sala.chave),
      itens: itensDe(sala),
      especies,
      exclusivas: especies.filter((sp) => !NO_MATO_COMUM.has(sp)),
    }
  })
  return { bioma, subBiomas, especiais, composicao }
}

export const ATLAS_DOS_BIOMAS: FichaDoBioma[] = BIOMAS.map(fichaDoBioma)

/** As salas especiais onde esta especie pode nascer, com o bioma de cada uma. */
export function salasEspeciaisDaEspecie(speciesId: string): { sala: FichaDaSalaEspecial; bioma: BiomaDef }[] {
  return ATLAS_DOS_BIOMAS.flatMap((f) => f.especiais
    .filter((e) => e.especies.includes(speciesId))
    .map((sala) => ({ sala, bioma: f.bioma })))
}

/** A especie so existe em sala especial (Eevee, Porygon, os iniciais de Kanto)? */
export function soEmSalaEspecial(speciesId: string): boolean {
  return !NO_MATO_COMUM.has(speciesId) && salasEspeciaisDaEspecie(speciesId).length > 0
}
