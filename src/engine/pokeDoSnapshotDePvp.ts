// Linha crua de `pvp_sessao.anfitriao_time`/`convidado_time` (snapshot jsonb de
// `pokemon_instances`, ver `pvp_snapshot_time` na migration) -> `PokeInstance`
// que a arena luta.
//
// MORA NO MOTOR (PH-540) porque servidor E cliente precisam montar o MESMO
// POKE a partir do mesmo snapshot — stats gravados, golpes saneados igual —
// senao a luta reproduzida no cliente diverge da resolvida no servidor.
// Deliberadamente nao reaproveita `rowToPoke` (playerMapper.ts): aquele
// recalcula atributos e importa store do cliente.
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
  golpes_de_maquina?: string[] | null
  /** Golpes do slot do preset (PH-563); vazio/ausente = kit do POKE. */
  golpes_escolhidos?: string[] | null
}

export function pvpRowToPoke(row: LinhaTimePvp): PokeInstance | null {
  const species = SPECIES[row.species_id]
  if (!species) return null

  // Golpe de TM conta como conhecido, igual `rowToPoke` do cliente — sem
  // isso `sanearEscolhaDeGolpes` descartava a escolha do jogador em silencio.
  const golpesDeMaquina = [...new Set(row.golpes_de_maquina ?? [])]
  const conhecidos = [...new Set([...golpesAprendidosAte(species, row.level), ...golpesDeMaquina])]
  const stats = {
    hp: row.stat_hp, atkFis: row.stat_atk_fis, atkEsp: row.stat_atk_esp,
    def: row.stat_def, defEsp: row.stat_def_esp, speed: row.stat_speed,
  }
  const escolhaDoPreset = row.golpes_escolhidos?.length ? row.golpes_escolhidos : null
  const escolha = escolhaDoPreset ?? row.active_abilities ?? activeAbilitiesPadrao(species, row.level)

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
    golpesDeMaquina,
    disabledAbilities: {},
    activeAbilities: sanearEscolhaDeGolpes(escolha, conhecidos, species, row.level),
    status: null,
    locked: false,
    capturedAt: new Date(0).toISOString(),
  }
}
