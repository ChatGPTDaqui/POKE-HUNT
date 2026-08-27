// "Tasks & Missões" (PH-199) — cadeia de missões de abate por tipo elemental,
// equivalente ao "Linked Tasks" do pokedream.com.br. Mecanica de referencia
// (cadeia sequencial por tipo, bonus ao completar); numeros e fonte de dado
// sao proprios deste jogo.
//
// A cadeia NAO e uma lista de especies hardcoded (nem aqui nem na RPC — ver
// `reivindicar_missao` na migration): e derivada de `SPECIES` por tipo,
// ordenada por numero de Pokedex, exatamente como a RPC deriva a mesma cadeia
// de `species` no Postgres. Os dois lados so precisam concordar numa
// FORMULA pequena (alvo/recompensa por posicao), nao numa lista de ~245
// linhas — a mesma lista duplicada em dois lugares e o tipo de coisa que diverge
// sem ninguem notar (ver CLAUDE.md sobre `COLUNAS_ITENS`/etc).
import { SPECIES } from './pokes'
import { pokedexNumber } from './regions'
import { TYPE_COLORS } from './typeColors'
import type { ElementType } from './generated/types'

export const MISSAO_TYPES = Object.keys(TYPE_COLORS) as ElementType[]

// alvo(posicao) = abates da especie pra reivindicar aquela posicao da cadeia.
// recompensa(posicao) = gold pago ao reivindicar.
// Primeira leva — sem playtest ainda, ajustavel aqui sem mexer em RPC nem UI
// (so os 4 numeros abaixo, e o par tem que concordar com a copia na migration).
const MISSAO_ALVO_BASE = 50
const MISSAO_ALVO_INCREMENTO = 25
const MISSAO_RECOMPENSA_BASE = 100
const MISSAO_RECOMPENSA_INCREMENTO = 50
// Bonus fixo (lump-sum) ao reivindicar a ULTIMA missao da cadeia de um tipo —
// nao e multiplicador de XP como o "Bônus de Elementos Completos" do site de
// referencia: bonus percentual exigiria um novo ponto de leitura no calculo de
// XP (que hoje so sai de combate, resolvido pelo flush de sessao — ver
// `authority/src/progresso.ts`). Lump-sum de gold reusa o mesmo caminho de
// escrita que toda missao ja usa, sem inventar um segundo.
export const MISSAO_BONUS_CADEIA_COMPLETA = 5000

export function alvoDaMissao(posicao: number): number {
  return MISSAO_ALVO_BASE + posicao * MISSAO_ALVO_INCREMENTO
}

export function recompensaDaMissao(posicao: number, ehUltima: boolean): number {
  const base = MISSAO_RECOMPENSA_BASE + posicao * MISSAO_RECOMPENSA_INCREMENTO
  return ehUltima ? base + MISSAO_BONUS_CADEIA_COMPLETA : base
}

export interface MissaoInfo {
  speciesId: string
  posicao: number
  alvo: number
  recompensa: number
  ehUltima: boolean
}

// So especies do NOSSO catalogo (dex <=251) entram — `SPECIES` ja e recortado
// assim (ver recorteDaPokedex.test.ts), entao nao ha filtro extra a fazer:
// uma especie do pokedream.com.br que nao exista aqui simplesmente nunca
// aparece em `SPECIES.values()`.
export function cadeiaDoTipo(tipo: ElementType): MissaoInfo[] {
  const especies = Object.values(SPECIES)
    .filter((s) => s.type === tipo || s.type2 === tipo)
    .sort((a, b) => pokedexNumber(a.id) - pokedexNumber(b.id))

  return especies.map((especie, posicao) => {
    const ehUltima = posicao === especies.length - 1
    return {
      speciesId: especie.id,
      posicao,
      alvo: alvoDaMissao(posicao),
      recompensa: recompensaDaMissao(posicao, ehUltima),
      ehUltima,
    }
  })
}

export function chaveDaMissao(tipo: ElementType, speciesId: string): string {
  return `${tipo}:${speciesId}`
}

/** Inversa de `chaveDaMissao` — species id nunca tem ':' (e um slug snake_case). */
export function missaoDaChave(chave: string): { tipo: ElementType; speciesId: string } {
  const i = chave.indexOf(':')
  return { tipo: chave.slice(0, i) as ElementType, speciesId: chave.slice(i + 1) }
}
