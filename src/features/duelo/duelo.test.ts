// Bug real achado testando PH-535 em staging: `creditarVitoriaDeDuelo`
// passava `encounterId: mapId` pra `createEnemyEntity` — mas `mapId` cru
// (ex: "boss_regirock") NUNCA foi um id de encontro registrado. Lendario
// registra `${mapId}_encounter`; Lance registra `${mapId}_0`..`${mapId}_5`
// (nightmareMaps.ts). `createEnemyEntity` joga um erro sincrono
// ("Encontro desconhecido") quando o id nao existe, o que aborta o loop de
// recompensa ANTES de creditar qualquer coisa — silenciosamente, sem toast
// de erro (a excecao escapa da função async sem handler). Vitoria contra
// QUALQUER boss/Lance nunca credita XP/ouro/captura/Pokédex.
//
// O fix usa `mapDef.enemyPool[0]` (sempre um encontro real do proprio
// mapa) em vez do `mapId` cru — este teste prova que essa suposicao vale
// pra TODO mapa de duelo, nao so pro caso testado manualmente.
import { describe, expect, it } from 'vitest'
import { BOSS_MAPS_DATA } from '@/data/nightmareMaps'
import { getEncounter } from '@/data/enemies'
import { createPokeInstance } from '@/data/pokes'
import { createRng } from '@/core/rng'
import { createPlayerEntity } from '@/engine/entity'
import { emptyWorldState } from '@/engine/worldState'
import { useGameStateStore } from '@/stores/gameStateStore'
import { creditarVitoriaDeDuelo } from './duelo'

// Immer congela (`Object.freeze`, recursivo) todo estado que produz — e
// `useWorldStore.getState()` (o que `PvpOverlay.tsx` passa pra
// `creditarVitoriaDeDuelo`) e exatamente isso: um snapshot CONGELADO, nao
// um draft mutavel. Reproduz isso aqui em vez de confiar num teste manual
// no browser (que so prova o caminho feliz de UMA rodagem de RNG).
function congelarFundo<T>(valor: T): T {
  if (valor && typeof valor === 'object' && !Object.isFrozen(valor)) {
    Object.freeze(valor)
    for (const chave of Object.keys(valor as object)) {
      congelarFundo((valor as Record<string, unknown>)[chave])
    }
  }
  return valor
}

describe('BOSS_MAPS_DATA — encontro do enemyPool sempre existe (PH-535)', () => {
  for (const [mapId, mapDef] of Object.entries(BOSS_MAPS_DATA)) {
    it(`${mapId}: enemyPool[0] resolve pra um encontro registrado`, () => {
      expect(mapDef.enemyPool.length).toBeGreaterThan(0)
      expect(getEncounter(mapDef.enemyPool[0])).not.toBeNull()
    })

    // O bug de verdade: o `mapId` CRU (o que `creditarVitoriaDeDuelo` usava
    // antes do fix) nunca resolve — confirma que o bug so nao aparecia em
    // testes porque ninguem verificava isto especificamente.
    it(`${mapId}: mapId cru NAO e um encontro valido (documenta o bug corrigido)`, () => {
      expect(getEncounter(mapId)).toBeNull()
    })
  }
})

describe('creditarVitoriaDeDuelo com mundo CONGELADO (PH-535/536)', () => {
  // `useWorldStore.getState()` (o que `PvpOverlay.tsx` de verdade passa)
  // e um snapshot Immer — congelado. `handleEnemyDefeated` foi escrito
  // pra um producer mutavel: sem clonar `counters`/`player`/`effects`/
  // `rng` antes de chamar, qualquer mutacao interna vira "Cannot assign
  // to read only property" e aborta o loop de recompensa no primeiro
  // poke, silenciosamente (excecao escapa da funcao async sem handler,
  // sem toast de erro — so descoberto testando manualmente em staging).
  function mundoDeVitoria(mapId: string, bossTeam: ReturnType<typeof createPokeInstance>[]) {
    const rng = createRng(1)
    const jogadorPoke = createPokeInstance(rng, 'tyranitar', 80)
    const world = emptyWorldState(1)
    const player = createPlayerEntity(world.counters, { poke: jogadorPoke, x: 700, y: 450 })
    world.player = player
    world.pvp = { treinador: 'Boss', estado: 'vitoria', origem: 'duelo', mapId, bossTeam }
    return congelarFundo(world)
  }

  it('lendario: nao lanca com mundo congelado e credita Pokedex/XP/ouro', async () => {
    useGameStateStore.setState({
      team: [createPokeInstance(createRng(2), 'tyranitar', 80)],
      trainer: { name: 'Treinador', level: 1, exp: 0 },
      pokedexKills: {},
    })
    const bossPoke = createPokeInstance(createRng(3), 'regirock', 300)
    const world = mundoDeVitoria('boss_regirock', [bossPoke])

    await expect(creditarVitoriaDeDuelo(world)).resolves.not.toThrow()

    expect(useGameStateStore.getState().pokedexKills.regirock?.normal).toBe(1)
  })

  it('Lance (6 pokes, time inteiro): nao lanca com mundo congelado, credita 6 abates', async () => {
    useGameStateStore.setState({
      team: [createPokeInstance(createRng(4), 'tyranitar', 80)],
      trainer: { name: 'Treinador', level: 1, exp: 0 },
      pokedexKills: {},
    })
    const timeDoLance = [
      createPokeInstance(createRng(5), 'gyarados', 60),
      createPokeInstance(createRng(6), 'dragonite', 55),
      createPokeInstance(createRng(7), 'charizard', 60),
      createPokeInstance(createRng(8), 'dragonite', 56),
      createPokeInstance(createRng(9), 'aerodactyl', 60),
      createPokeInstance(createRng(10), 'dragonite', 65),
    ]
    const world = mundoDeVitoria('boss_lance', timeDoLance)

    await expect(creditarVitoriaDeDuelo(world)).resolves.not.toThrow()

    const kills = useGameStateStore.getState().pokedexKills
    expect(kills.gyarados?.normal).toBe(1)
    expect(kills.dragonite?.normal).toBe(3)
    expect(kills.charizard?.normal).toBe(1)
    expect(kills.aerodactyl?.normal).toBe(1)
  })
})
