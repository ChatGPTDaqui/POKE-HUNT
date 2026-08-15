// STUB TEMPORARIO (worktree agent-a204bcaf85f55462c). Ainda nao existe um
// catalogo real de Habilidades Passivas (Traits) neste branch -- este
// arquivo so existe pra `traitOf` ter uma implementacao concreta pro hook
// de punicao por contato em combatSystem.ts compilar e rodar. `traitOf`
// sempre devolve null aqui, entao nenhuma das 7 Traits (static, flame_body,
// poison_point, rough_skin, aftermath, effect_spore, iron_barbs) dispara de
// fato ainda -- o hook fica pronto, esperando o catalogo Especie -> Trait
// real chegar na mesclagem com main. SUBSTITUIR por essa implementacao real
// no merge, nao manter os dois.
export type TraitKey =
  | 'static'
  | 'flame_body'
  | 'poison_point'
  | 'rough_skin'
  | 'aftermath'
  | 'effect_spore'
  | 'iron_barbs'

export function traitOf(_speciesId: string): TraitKey | null {
  return null
}
