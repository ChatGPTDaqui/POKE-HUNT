// TRAIT = habilidade PASSIVA de especie (o que os jogos reais chamam de
// "Ability" no sentido de Pokemon). Nao pode se chamar "Ability" neste
// projeto: esse nome ja esta ocupado pelo GOLPE (`type Ability` em
// `engine/types.ts`, `abilities.generated.ts`, `pickAbility`). Pra nao colidir
// com esse vocabulario existente, a habilidade passiva de especie e sempre
// "Trait" no codigo. O jogador le "Habilidade" na tela — a colisao e so aqui
// dentro.
//
// ---------------------------------------------------------------------------
// 2026-08-18: A ATRIBUICAO PASSOU A SER O DADO DO JOGO, E NAO ESCOLHA A MAO
// ---------------------------------------------------------------------------
// Ate esta leva este arquivo era uma tabela hand-authored `speciesId -> 1
// trait`, escrita a olho, cobrindo ~150 das 226 especies. Tinha dois problemas
// que so um deles era visivel:
//
//   1. cobertura parcial — 76 especies sem habilidade nenhuma, em silencio;
//   2. atribuicao INVENTADA — Gengar estava com `levitate`, que ele de fato
//      teve ate a Gen VI e PERDEU na Gen VII (no Ultra Sun ele so tem Cursed
//      Body). O catalogo do jogo e Ultra Sun; a tabela nao era.
//
// Agora a atribuicao vem de `generated/traits.generated.ts`, que sai da PokeAPI
// pelo mesmo pipeline do resto do catalogo (`npm run usum:baixar` +
// `usum:gerar`). Cada especie traz os slots NORMAIS (1 e 2) e a HABILIDADE
// OCULTA, exatamente como nos jogos — e cada POKE sorteia a dele no nascimento
// (`data/pokes.ts#createPokeInstance`), em vez de a especie inteira ter uma so.
//
// O QUE ISSO NAO FAZ: implementar as 132. Este arquivo e a ATRIBUICAO e o
// CATALOGO; quais delas tem efeito mecanico de verdade esta em
// `TRAITS_IMPLEMENTADAS` abaixo, e a lista do que ficou de fora (com o motivo
// de cada uma) esta em `docs/14-habilidades.md`.
import { TRAITS_DATA } from './generated/traits.generated'
import type { SpeciesTraits, TraitCatalogEntry } from './generated/types'
import { randInt, rollChance } from '@/core/random'
import type { Rng } from '@/core/rng'

/**
 * Chave de habilidade. String e nao union: as 132 vem de arquivo GERADO, e um
 * union escrito a mao ao lado dele so criaria duas verdades. A checagem de que
 * toda chave citada no motor existe no catalogo e feita por teste
 * (`traits.test.ts`), que e onde ela consegue ver o dado gerado.
 */
export type TraitId = string

export const TRAITS: Record<string, TraitCatalogEntry> = TRAITS_DATA.catalogo

/** Quais habilidades cada especie pode ter, na forma dos jogos. */
export function traitsDaEspecie(speciesId: string): SpeciesTraits | null {
  return TRAITS_DATA.porEspecie[speciesId] ?? null
}

/**
 * Chance de um POKE nascer com a HABILIDADE OCULTA.
 *
 * DESVIO CONSCIENTE, e o unico deste arquivo. No Ultra Sun a oculta NAO sai de
 * um encontro selvagem comum: ela vem de cadeia de SOS (a partir do 5o
 * chamado), Island Scan, Ilha Rolo e transferencia — quatro mecanicas que este
 * motor nao tem e nao vai ter tao cedo (nao ha "chamar reforco" num
 * auto-battler de 1 contra N). A alternativa a este numero seria a oculta ser
 * dado MORTO: presente no catalogo, inalcancavel no jogo.
 *
 * 5% e a taxa base da propria cadeia de SOS no jogo real, aplicada como uma
 * chance direta no encontro. Registrado como desvio em docs/14-habilidades.md.
 */
export const CHANCE_DE_TRAIT_OCULTA = 0.05

/**
 * Sorteia a habilidade de UM POKE. `rng` obrigatorio e primeiro parametro pelo
 * mesmo motivo de `createPokeInstance`: e um sorteio que o servidor precisa
 * poder reconferir, e um default pra `Math.random()` abriria um caminho
 * silencioso de volta pro nao-verificavel.
 */
export function sortearTrait(rng: Rng, speciesId: string): string | null {
  const disponiveis = traitsDaEspecie(speciesId)
  if (!disponiveis) return null
  if (disponiveis.oculta && rollChance(rng, CHANCE_DE_TRAIT_OCULTA)) return disponiveis.oculta
  if (disponiveis.normais.length === 0) return disponiveis.oculta
  return disponiveis.normais[randInt(rng, 0, disponiveis.normais.length - 1)]
}

/**
 * A habilidade DESTE POKE.
 *
 * O fallback pro slot 1 da especie NAO e defensividade a toa: todo POKE salvo
 * antes desta leva tem `trait` ausente, e sao milhares. Sem ele, um time
 * inteiro perderia habilidade de uma vez na primeira carga depois do deploy —
 * e a habilidade e invisivel no combate (ninguem "ve" o Intimidate faltando),
 * entao o sintoma seria so "o jogo ficou mais fraco".
 */
export function traitDoPoke(poke: { speciesId: string; trait?: string | null } | null | undefined): TraitId | null {
  if (!poke) return null
  if (poke.trait && TRAITS[poke.trait]) return poke.trait
  return traitsDaEspecie(poke.speciesId)?.normais[0] ?? null
}

/** A habilidade e oculta? So pra ficha do POKE marcar. */
export function traitEhOculta(speciesId: string, trait: string | null | undefined): boolean {
  return Boolean(trait) && traitsDaEspecie(speciesId)?.oculta === trait
}

export function nomeDaTrait(trait: string | null | undefined): string | null {
  return (trait && TRAITS[trait]?.nome) || null
}
