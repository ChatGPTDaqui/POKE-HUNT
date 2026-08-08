// Invariantes do mundo de hunts.
//
// Os dois primeiros testes existem porque a falha correspondente e SILENCIOSA:
// uma especie sem hunt nenhuma continua no catalogo (aparece no Bestiario, tem
// sprite, tem moveset) e simplesmente nunca spawna — foi exatamente assim que a
// linha do Dratini sumiu do jogo por uma leva inteira sem ninguem notar. E uma
// hunt com pool vazio so estoura quando alguem entra nela.
import { describe, expect, it } from 'vitest'
import { MAPS, ENCOUNTERS } from './huntSpawnOverrides'
import { SPECIES_DATA } from './generated/pokes.generated'
import { LEGENDARY_SPECIES_IDS } from './legendaries'
import { NON_WILD_SPECIES, regionOfSpecies } from './regions'

const BASE_STARTERS = ['charmander', 'squirtle', 'bulbasaur']

const wildSpecies = Object.keys(SPECIES_DATA).filter(
  (id) => !BASE_STARTERS.includes(id) && !LEGENDARY_SPECIES_IDS.includes(id) && !NON_WILD_SPECIES.has(id)
)

// Hunts BOSS/Lance tem elenco proprio (lendario sozinho, time do Lance) e nao
// seguem a regra de regiao.
const regularHunts = Object.values(MAPS).filter((map) => map.continent !== 'nightmare' || map.id.startsWith('nightmare_'))
const wildHunts = regularHunts.filter((map) => !map.id.startsWith('boss_'))

describe('hunts', () => {
  it('nenhuma hunt fica sem especie', () => {
    const vazias = Object.values(MAPS).filter((map) => map.enemyPool.length === 0)
    expect(vazias.map((m) => m.id)).toEqual([])
  })

  it('todo encontro aponta pra uma especie e uma hunt reais', () => {
    for (const map of Object.values(MAPS)) {
      for (const encId of map.enemyPool) {
        const enc = ENCOUNTERS[encId]
        expect(enc, `${map.id} referencia encontro inexistente ${encId}`).toBeTruthy()
        expect(SPECIES_DATA[enc.speciesId], `${encId} aponta pra especie inexistente`).toBeTruthy()
      }
    }
  })

  it('toda especie selvagem tem pelo menos uma hunt onde spawna', () => {
    const comCasa = new Set<string>()
    for (const map of wildHunts) {
      for (const encId of map.enemyPool) comCasa.add(ENCOUNTERS[encId].speciesId)
    }
    const orfas = wildSpecies.filter((id) => !comCasa.has(id))
    expect(orfas).toEqual([])
  })

  it('hunt de uma regiao so tem POKE daquela regiao', () => {
    const erros: string[] = []
    for (const map of wildHunts) {
      // O espelho do Modo Pesadelo carrega `continent: 'nightmare'`; a regiao
      // dele e a da hunt de origem, recuperada pelo id.
      const origem = map.id.startsWith('nightmare_') ? MAPS[map.id.slice('nightmare_'.length)] : map
      const regiao = origem?.continent
      if (regiao !== 'johto' && regiao !== 'kanto') continue
      for (const encId of map.enemyPool) {
        const speciesId = ENCOUNTERS[encId].speciesId
        if (regionOfSpecies(speciesId) !== regiao) erros.push(`${map.id} [${regiao}] tem ${speciesId}`)
      }
    }
    expect(erros).toEqual([])
  })

  it('Porygon, Porygon2 e Eevee nao spawnam em hunt nenhuma', () => {
    const achados: string[] = []
    for (const map of Object.values(MAPS)) {
      for (const encId of map.enemyPool) {
        const speciesId = ENCOUNTERS[encId].speciesId
        if (NON_WILD_SPECIES.has(speciesId)) achados.push(`${map.id}: ${speciesId}`)
      }
    }
    expect(achados).toEqual([])
  })

  it('a hunt inicial sai 80% nivel 1 e 20% nivel 2', () => {
    const inicial = MAPS.route_46
    expect(inicial).toBeTruthy()
    for (const encId of inicial.enemyPool) {
      expect(ENCOUNTERS[encId].levelWeights).toEqual([
        { level: 1, weight: 80 },
        { level: 2, weight: 20 },
      ])
    }
  })
})
