// Linha crua de `pvp_time`/`pvp_sessao.anfitriao_time` (snapshot jsonb de
// `pokemon_instances`, ver `pvp_snapshot_time` na migration) -> `PokeInstance`
// que `pvpSimulator` entende.
//
// DELIBERADAMENTE NAO reaproveita `rowToPoke` de `src/data/remote/
// playerMapper.ts`: aquele arquivo importa `@/stores/gameStateStore` (Zustand)
// e `@/data/missaoChave`/`progressoDeBioma` — cadeia nunca testada dentro do
// bundle de autoridade (`vite.edge.config.ts`), que ate hoje so importa
// `@/data/*` puro via `#engine`. Reimplementar so o pedaço que o PvP usa e
// mais barato que arriscar puxar um import runtime que quebra em Deno.
//
// Usa o `stat_*` GRAVADO (cache), nao recalculado — mesma confianca que o
// fluxo amistoso ja dá ao `anfitriao_poke`/`convidado_poke` jsonb (validados
// contra a linha real por `pvp_validar_poke`, nunca recomputados a partir de
// IV/natureza). Consistente, não uma escolha nova.
import { activeAbilitiesPadrao, golpesAprendidosAte, sanearEscolhaDeGolpes } from '@/data/activeAbilities'
import { SPECIES, type PokeInstance } from '@/data/pokes'

export interface LinhaTimePvp {
  id: string
  species_id: string
  level: number
  is_shiny: boolean
  rarity: string
  stat_hp: number
  stat_atk_fis: number
  stat_atk_esp: number
  stat_def: number
  stat_def_esp: number
  stat_speed: number
  active_abilities: string[] | null
}

export function pvpRowToPoke(row: LinhaTimePvp): PokeInstance | null {
  const species = SPECIES[row.species_id]
  if (!species) return null

  const conhecidos = golpesAprendidosAte(species, row.level)
  const stats = {
    hp: row.stat_hp, atkFis: row.stat_atk_fis, atkEsp: row.stat_atk_esp,
    def: row.stat_def, defEsp: row.stat_def_esp, speed: row.stat_speed,
  }

  return {
    uid: row.id,
    speciesId: row.species_id,
    level: row.level,
    exp: 0,
    hp: stats.hp,
    isShiny: row.is_shiny,
    rarity: row.rarity as PokeInstance['rarity'],
    ivs: { hp: 0, atkFis: 0, atkEsp: 0, def: 0, defEsp: 0, speed: 0 },
    nature: undefined,
    stats,
    unlockedAbilities: conhecidos,
    golpesDeMaquina: [],
    disabledAbilities: {},
    activeAbilities: sanearEscolhaDeGolpes(
      row.active_abilities ?? activeAbilitiesPadrao(species, row.level),
      conhecidos,
      species,
      row.level,
    ),
    status: null,
    locked: false,
    capturedAt: new Date(0).toISOString(),
  }
}
