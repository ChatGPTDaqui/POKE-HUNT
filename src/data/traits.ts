// STUB TEMPORARIO — src/data/traits.ts ainda nao existe nesta worktree.
// Criado so pra nao quebrar o build enquanto as Habilidades passivas
// (blaze/torrent/overgrow/swarm/multiscale) sao ligadas em combatSystem.ts.
// Substituir por implementacao real (mapa speciesId -> trait) na mesclagem
// com main, onde presumivelmente ja existe ou sera adicionado de verdade.
export type Trait = 'blaze' | 'torrent' | 'overgrow' | 'swarm' | 'multiscale'

export function traitOf(_speciesId: string): Trait | null {
  return null
}
