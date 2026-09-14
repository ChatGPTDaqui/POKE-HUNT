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
