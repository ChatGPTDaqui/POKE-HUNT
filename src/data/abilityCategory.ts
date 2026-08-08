// Resolve a categoria (Fisico/Especial) de um golpe pra um atacante.
//
// Todo golpe da planilha ja tem categoria fixa e passa direto. A excecao sao os
// golpes de nivel 50 (`typedAoeMoves.ts`, `category: 'dynamic'`): eles nao tem
// categoria propria, ela e decidida por qual dos dois atributos de ataque do
// POKE e maior.
//
// A REGRA DE MOMENTO (pedido explicito do usuario): a comparacao usa os
// atributos que o POKE tem **exatamente no nivel 50** — o nivel em que o golpe
// e aprendido —, e nao os atuais. Sem isso a categoria oscilava: o golpe podia
// ser Fisico no nivel 50, virar Especial no 63 (crescimento desigual dos
// atributos) e voltar a Fisico depois de uma evolucao, mudando a formula de
// dano e a cor da moldura do slot no meio do jogo.
//
// POR QUE ISSO E DERIVADO E NAO GRAVADO NO POKE: `computeStatsAtLevel` e
// deterministica sobre (especie, nivel, IVs, raridade, shiny) — todos campos que
// o POKE ja carrega e que o banco ja persiste. Um snapshot gravado exigiria
// coluna nova, backfill pra todo save existente (que nao tem o valor) e um
// caminho de escrita a mais no momento do level-up; derivar da os mesmos numeros
// sem nenhum dos tres. A especie usada e a ATUAL de proposito: a propria chave do
// golpe de nivel 50 vem do tipo primario da especie atual
// (`pokes.ts` -> `typedAoeMoveKey(species.type)`), entao congelar os atributos de
// uma pre-evolucao enquanto o golpe segue a evolucao deixaria os dois
// discordando sobre de quem sao os numeros.
//
// Este modulo e separado de `abilities.ts` por causa de ciclo de import:
// `pokes.ts` importa `abilities.ts` (getAbility), entao `abilities.ts` nao pode
// importar `pokes.ts` de volta pra chamar `computeStatsAtLevel`.
import { SPECIES, computeStatsAtLevel, type PokeInstance, type StatBlock } from './pokes'
import { TYPED_AOE_LEVEL } from './typedAoeMoves'
import type { Ability } from './abilities'
import type { AbilityCategory } from './generated/types'

/** O bloco de atributos que este POKE tem (ou tera) exatamente no nivel 50. */
export function statsAtTypedAoeLevel(poke: PokeInstance): StatBlock {
  const species = SPECIES[poke.speciesId]
  // POKE com especie invalida (save legado) nao pode derrubar o combate — cai
  // nos atributos atuais, que e o comportamento anterior a esta regra.
  if (!species) return poke.stats
  return computeStatsAtLevel(species, TYPED_AOE_LEVEL, poke.ivs, poke.rarity, poke.isShiny)
}

export function resolveAbilityCategory(ability: Ability, poke: PokeInstance): AbilityCategory {
  if (ability.category !== 'dynamic') return ability.category
  const stats = statsAtTypedAoeLevel(poke)
  return stats.atkFis >= stats.atkEsp ? 'physical' : 'special'
}
