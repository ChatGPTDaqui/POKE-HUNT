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
import { isTerceiraEvolucao } from './evolutionStage'

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

  // O bug que este teste tranca: o NOME da zona e o NIVEL que ela spawna eram
  // dois numeros de origens diferentes, e discordavam. "Zona Nivel 31-40"
  // entregava POKE de nivel 15 e de nivel 51. Agora a faixa e a fonte unica —
  // e a unica forma de isso voltar a divergir e alguem reintroduzir uma segunda
  // fonte, que este teste pega.
  it('todo encontro respeita estritamente a faixa da propria zona', () => {
    const erros: string[] = []
    for (const map of Object.values(MAPS)) {
      const [min, max] = map.levelRange
      for (const encId of map.enemyPool) {
        const enc = ENCOUNTERS[encId]
        if (enc.minLevel < min || enc.maxLevel > max) {
          erros.push(`${map.id} (Lv ${min}-${max}) tem ${enc.speciesId} em Lv ${enc.minLevel}-${enc.maxLevel}`)
        }
        for (const lw of enc.levelWeights ?? []) {
          if (lw.level < min || lw.level > max) {
            erros.push(`${map.id} (Lv ${min}-${max}) sorteia nivel ${lw.level}`)
          }
        }
      }
    }
    expect(erros).toEqual([])
  })

  it('as zonas normais sao faixas fechadas de 10 niveis, sem buraco entre elas', () => {
    // O espelho do Modo Pesadelo herda o nome (com o numero da zona) mas nao a
    // faixa: ele e a mesma zona deslocada em +100 com piso 150, entao "10
    // niveis fechados" nao vale nem deveria valer pra ele.
    const zonas = Object.values(MAPS)
      .filter((m) => !m.id.startsWith('nightmare_'))
      .filter((m) => / Zona \d+ /.test(m.name))
      .map((m) => ({ id: m.id, nome: m.name, min: m.levelRange[0], max: m.levelRange[1] }))
    expect(zonas.length).toBeGreaterThan(0)
    for (const z of zonas) {
      // O numero escrito no nome tem que ser o numero da faixa: e a coisa que
      // o jogador le antes de entrar.
      const numero = Number(z.nome.match(/ Zona (\d+) /)?.[1])
      expect(z.max - z.min, `${z.id} nao tem 10 niveis`).toBe(9)
      expect(z.min, `${z.nome} comeca no nivel errado`).toBe(numero * 10 + 1)
    }
  })

  // A soma dos pesos e o denominador do `weightedPick`: peso zero (ou negativo,
  // ou NaN vindo de um encontro sem tier) faria uma especie nunca spawnar sem
  // erro nenhum, e uma hunt com soma zero travaria o sorteio.
  it('a matriz de spawn fecha: todo peso e positivo e toda hunt soma mais que zero', () => {
    const erros: string[] = []
    for (const map of Object.values(MAPS)) {
      let soma = 0
      for (const encId of map.enemyPool) {
        const peso = ENCOUNTERS[encId].weight
        if (!Number.isFinite(peso) || peso <= 0) erros.push(`${map.id}/${encId} tem peso ${peso}`)
        else soma += peso
      }
      if (soma <= 0) erros.push(`${map.id} tem soma de pesos ${soma}`)
    }
    expect(erros).toEqual([])
  })

  it('as chances de spawn de cada hunt somam 100%', () => {
    for (const map of Object.values(MAPS)) {
      const total = map.enemyPool.reduce((s, id) => s + ENCOUNTERS[id].weight, 0)
      const soma = map.enemyPool.reduce((s, id) => s + (ENCOUNTERS[id].weight / total) * 100, 0)
      expect(soma, `${map.id}`).toBeCloseTo(100, 6)
    }
  })

  // Pedido explicito: 0,2% exatos. E um numero facil de quebrar sem perceber —
  // qualquer mexida no peso base de uma especie (`spawn-tiers.json`) ou no pool
  // de uma hunt muda o denominador, e a chance so seria "quase" 0,2% de novo.
  it('todo POKE de 3a evolucao aparece em exatamente 0,2% da hunt', () => {
    const erros: string[] = []
    for (const map of Object.values(MAPS)) {
      // Hunts BOSS (inclusive a do Campeao Lance) ficam de fora: la a "chance
      // de aparicao" nao existe — o elenco E a luta, com os POKEs escolhidos a
      // mao. Aplicar 0,2% ali significaria 99,8% de nada aparecer.
      if (map.id.startsWith('boss_')) continue
      const total = map.enemyPool.reduce((s, id) => s + ENCOUNTERS[id].weight, 0)
      const fixos = map.enemyPool.filter((id) => isTerceiraEvolucao(ENCOUNTERS[id].speciesId))
      // Hunt so de formas finais nao tem como dar 0,2% pra cada uma (ver a nota
      // em huntSpawnOverrides): fica de fora da checagem, de proposito.
      if (!fixos.length || fixos.length === map.enemyPool.length) continue
      for (const id of fixos) {
        const chance = (ENCOUNTERS[id].weight / total) * 100
        if (Math.abs(chance - 0.2) > 1e-6) {
          erros.push(`${map.id}/${ENCOUNTERS[id].speciesId} = ${chance.toFixed(4)}%`)
        }
      }
    }
    expect(erros).toEqual([])
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
