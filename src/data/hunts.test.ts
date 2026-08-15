// Invariantes do mundo de hunts.
//
// Quase toda falha aqui e SILENCIOSA, e e por isso que estes testes existem:
// uma especie sem hunt nenhuma continua no catalogo (aparece no Bestiario, tem
// sprite, tem moveset) e simplesmente nunca spawna — foi exatamente assim que a
// linha do Dratini sumiu do jogo por uma leva inteira sem ninguem notar. Uma
// hunt com pool vazio so estoura quando alguem entra nela. Um sub-bioma
// inalcancavel nao da erro em lugar nenhum.
import { describe, expect, it } from 'vitest'
import { MAPS, ENCOUNTERS, POOL_POR_SALA, STARTER_HUNT_ID } from './huntSpawnOverrides'
import { SPECIES, type Species } from './pokes'
import { SPECIES_DATA } from './generated/pokes.generated'
import { SUB_BIOMA_ESPECIES } from './generated/subBiomas.generated'
import {
  BIOMAS, FAIXAS, FAIXAS_INICIAIS, GRUPOS_DO_LANCE, MAX_INIMIGOS_HUNT_INICIAL, huntId,
} from './biomas'
import { LEGENDARY_SPECIES_IDS } from './legendaries'
import { NON_WILD_SPECIES } from './regions'
import { baseStatTotal, especieForte, zonaMinimaDaEspecie } from './spawnStrength'
import { huntOdds } from '@/features/hunt/HuntMenu'

const BASE_STARTERS = ['charmander', 'squirtle', 'bulbasaur']

const wildSpecies = Object.keys(SPECIES_DATA).filter(
  (id) => !BASE_STARTERS.includes(id) && !LEGENDARY_SPECIES_IDS.includes(id) && !NON_WILD_SPECIES.has(id),
)

const bossHunts = Object.values(MAPS).filter((m) => m.id.startsWith('boss_'))
const nightmareHunts = Object.values(MAPS).filter((m) => m.id.startsWith('nightmare_'))
// Hunts "normais": as 36 de bioma + a inicial. Sem o espelho do Pesadelo (mesma
// composicao, nivel deslocado) e sem as BOSS (elenco proprio, curado a mao).
const huntsNormais = Object.values(MAPS).filter(
  (m) => !m.id.startsWith('nightmare_') && !m.id.startsWith('boss_'),
)

const especiesDe = (encIds: string[]) => encIds.map((id) => ENCOUNTERS[id].speciesId)

describe('estrutura', () => {
  it('existe uma hunt por bioma x faixa, mais a inicial', () => {
    for (const bioma of BIOMAS) {
      for (const faixa of FAIXAS) {
        const id = huntId(bioma.chave, faixa.id)
        expect(MAPS[id], `hunt ausente: ${id}`).toBeTruthy()
      }
    }
    expect(MAPS[STARTER_HUNT_ID]).toBeTruthy()
    expect(huntsNormais.length).toBe(BIOMAS.length * FAIXAS.length + 1)
  })

  it('todo sub-bioma declarado em biomas.ts tem elenco gerado, e vice-versa', () => {
    const declarados = new Set(BIOMAS.flatMap((b) => b.subBiomas.map((s) => s.chave)))
    const gerados = new Set(Object.keys(SUB_BIOMA_ESPECIES))
    expect([...declarados].filter((c) => !gerados.has(c)), 'em biomas.ts sem elenco gerado').toEqual([])
    expect([...gerados].filter((c) => !declarados.has(c)), 'gerado e nao agrupado em nenhum bioma').toEqual([])
  })

  // Mais forte que "alcancavel em alguma faixa": TODA sala de TODA faixa
  // precisa ter pool. Uma sala vazia nao da erro — o jogador entra e nada
  // spawna. Foi assim que o Templo ficou mudo nas faixas II e III (todos os
  // estagios dele ja tinham evoluido antes do Lv31 e as formas evoluidas
  // moravam noutro sub-bioma).
  it('nenhuma sala fica com pool vazio em nenhuma faixa', () => {
    const vazios: string[] = []
    for (const bioma of BIOMAS) {
      for (const faixa of FAIXAS) {
        for (const sub of bioma.subBiomas) {
          const pool = POOL_POR_SALA[huntId(bioma.chave, faixa.id)]?.[sub.chave] ?? []
          if (pool.length === 0) vazios.push(`${bioma.chave}/${faixa.id}/${sub.chave}`)
        }
      }
    }
    expect(vazios).toEqual([])
  })

  it('o peso de sala de todo sub-bioma e positivo', () => {
    for (const bioma of BIOMAS) {
      for (const sub of bioma.subBiomas) {
        expect(sub.peso, `${bioma.chave}/${sub.chave}`).toBeGreaterThan(0)
      }
    }
  })

  it('o gate das hunts e o esperado: faixa1/faixa2 abertas, faixa3 e Pesadelo pelo Lance', () => {
    for (const bioma of BIOMAS) {
      for (const faixa of FAIXAS) {
        expect(MAPS[huntId(bioma.chave, faixa.id)].continent).toBe(faixa.id)
      }
    }
    for (const m of nightmareHunts) expect(m.continent, m.id).toBe('nightmare')
    // A hunt do Lance e a excecao entre as `boss_`: ela tem que estar num grupo
    // ABERTO, senao so seria alcancavel depois de ja ter sido vencida.
    for (const m of bossHunts) {
      if (m.id === 'boss_lance') continue
      expect(m.continent, m.id).toBe('nightmare')
    }
    expect(FAIXAS_INICIAIS).toContain(MAPS.boss_lance.continent)
    expect(MAPS.boss_lance.unlocksContinentOnClear).toEqual(GRUPOS_DO_LANCE)
  })
})

describe('cobertura de especies', () => {
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
    for (const map of huntsNormais) for (const id of especiesDe(map.enemyPool)) comCasa.add(id)
    expect(wildSpecies.filter((id) => !comCasa.has(id))).toEqual([])
  })

  it('lendario so aparece em hunt BOSS', () => {
    const achados: string[] = []
    for (const map of [...huntsNormais, ...nightmareHunts]) {
      for (const id of especiesDe(map.enemyPool)) {
        if (LEGENDARY_SPECIES_IDS.includes(id)) achados.push(`${map.id}: ${id}`)
      }
    }
    expect(achados).toEqual([])
  })

  it('Porygon, Porygon2 e Eevee nao spawnam em hunt nenhuma', () => {
    const achados: string[] = []
    for (const map of Object.values(MAPS)) {
      for (const id of especiesDe(map.enemyPool)) {
        if (NON_WILD_SPECIES.has(id)) achados.push(`${map.id}: ${id}`)
      }
    }
    expect(achados).toEqual([])
  })
})

describe('niveis', () => {
  it('todo encontro respeita estritamente a faixa da propria hunt', () => {
    const erros: string[] = []
    for (const map of Object.values(MAPS)) {
      const [min, max] = map.levelRange
      for (const encId of map.enemyPool) {
        const enc = ENCOUNTERS[encId]
        if (enc.minLevel < min || enc.maxLevel > max) {
          erros.push(`${map.id} (Lv ${min}-${max}) tem ${enc.speciesId} em Lv ${enc.minLevel}-${enc.maxLevel}`)
        }
        // BUG REAL que este ramo pegou uma vez: o espelho do Pesadelo deslocava
        // min/max mas nao os `levelWeights`, que sao o sorteio de FATO quando
        // existem. A hunt anunciava Lv150 e spawnava Lv1.
        for (const lw of enc.levelWeights ?? []) {
          if (lw.level < min || lw.level > max) erros.push(`${map.id} (Lv ${min}-${max}) sorteia nivel ${lw.level}`)
        }
      }
    }
    expect(erros).toEqual([])
  })

  it('as 3 faixas sao contiguas e o nome da hunt casa com a faixa dela', () => {
    let esperado = 1
    for (const faixa of FAIXAS) {
      expect(faixa.niveis[0], `faixa ${faixa.nome} nao comeca onde a anterior acabou`).toBe(esperado)
      esperado = faixa.niveis[1] + 1
    }
    for (const bioma of BIOMAS) {
      for (const faixa of FAIXAS) {
        const map = MAPS[huntId(bioma.chave, faixa.id)]
        expect(map.levelRange).toEqual(faixa.niveis)
        expect(map.name).toBe(`${bioma.nome} ${faixa.nome}`)
      }
    }
  })

  // O motivo de existir a regra "uma linha, estagios em faixas disjuntas".
  // Sem ela: Caterpie (que evolui no 7) nascendo Lv60.
  it('nenhum encontro poe um POKE num nivel em que ele ja deveria ter evoluido', () => {
    const erros: string[] = []
    for (const map of huntsNormais) {
      for (const encId of map.enemyPool) {
        const enc = ENCOUNTERS[encId]
        const especie: Species | undefined = SPECIES[enc.speciesId]
        const alvo = especie?.evolvesTo
        // Evolucao ESPECIAL (ex-troca) exige Nivel 80 + 20 Pedras pro jogador;
        // pro selvagem o gatilho e outro (ver nivelDeTroca), entao ela nao
        // conta como "ja deveria ter evoluido".
        if (!alvo || !SPECIES[alvo] || especie.isSpecialEvolution) continue
        const nivel = especie.evolvesAtLevel
        if (nivel != null && enc.maxLevel >= nivel) {
          erros.push(`${map.id}: ${enc.speciesId} ate Lv ${enc.maxLevel} mas evolui no ${nivel}`)
        }
      }
    }
    expect(erros).toEqual([])
  })

  // Corolario do anterior: dois estagios da mesma linha na mesma hunt nao podem
  // dividir nivel nenhum, senao o mesmo nivel produziria ora um ora outro.
  it('estagios da mesma linha nao se sobrepoem dentro de uma hunt', () => {
    const raizDe = (id: string) => {
      let atual = id
      for (let i = 0; i < 10; i++) {
        const anterior = Object.values(SPECIES).find((s) => s.evolvesTo === atual)
        if (!anterior) break
        atual = anterior.id
      }
      return atual
    }
    const erros: string[] = []
    for (const map of huntsNormais) {
      const porLinha = new Map<string, { id: string; min: number; max: number }[]>()
      for (const encId of map.enemyPool) {
        const enc = ENCOUNTERS[encId]
        const raiz = raizDe(enc.speciesId)
        const lista = porLinha.get(raiz) ?? []
        lista.push({ id: enc.speciesId, min: enc.minLevel, max: enc.maxLevel })
        porLinha.set(raiz, lista)
      }
      for (const [raiz, trechos] of porLinha) {
        for (let i = 0; i < trechos.length; i++) {
          for (let j = i + 1; j < trechos.length; j++) {
            const a = trechos[i], b = trechos[j]
            if (a.min <= b.max && b.min <= a.max) {
              erros.push(`${map.id} linha ${raiz}: ${a.id} Lv${a.min}-${a.max} e ${b.id} Lv${b.min}-${b.max}`)
            }
          }
        }
      }
    }
    expect(erros).toEqual([])
  })

  it('nenhum POKE forte aparece em hunt que termina antes do Lv 30', () => {
    const erros: string[] = []
    for (const map of huntsNormais) {
      if (map.levelRange[1] >= 30) continue
      for (const id of especiesDe(map.enemyPool)) {
        if (especieForte(id)) erros.push(`${map.id} (Lv ${map.levelRange[0]}-${map.levelRange[1]}) tem ${id} (BST ${baseStatTotal(id)})`)
      }
    }
    expect(erros).toEqual([])
  })

  it('toda especie respeita a propria zona minima', () => {
    const erros: string[] = []
    for (const map of huntsNormais) {
      if (map.id === STARTER_HUNT_ID) continue
      const faixa = FAIXAS.find((f) => f.niveis[0] === map.levelRange[0])
      if (!faixa) continue
      for (const id of especiesDe(map.enemyPool)) {
        const minima = zonaMinimaDaEspecie(id)
        if (minima > faixa.zonaMaxima) erros.push(`${map.id} (ate zona ${faixa.zonaMaxima}) tem ${id} (minima ${minima})`)
      }
    }
    expect(erros).toEqual([])
  })
})

describe('pesos de spawn', () => {
  // A soma dos pesos e o denominador do `weightedPick`: peso zero (ou negativo,
  // ou NaN vindo de um encontro sem tier) faria uma especie nunca spawnar sem
  // erro nenhum, e uma hunt com soma zero travaria o sorteio.
  it('todo peso e positivo e toda hunt soma mais que zero', () => {
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

  // O pool de cada SALA tambem tem que fechar sozinho: e ele que vira o
  // `enemyPool` ativo quando a sala esta em vigor.
  it('todo pool de sala fecha o sorteio sozinho', () => {
    const erros: string[] = []
    for (const [hunt, salas] of Object.entries(POOL_POR_SALA)) {
      for (const [sub, ids] of Object.entries(salas)) {
        if (ids.length === 0) continue
        const soma = ids.reduce((s, id) => s + ENCOUNTERS[id].weight, 0)
        if (!(soma > 0)) erros.push(`${hunt}/${sub} soma ${soma}`)
      }
    }
    expect(erros).toEqual([])
  })

  // Sem o teto, um pool pequeno com um tier alto vira hunt de uma especie so:
  // medido, Unown ocupava 50,8% do Sagrado. A hunt inicial (3 especies curadas
  // a mao) fica de fora — com 3, o minimo possivel ja e 33%.
  it('nenhuma especie passa de 35% de uma hunt com 5 ou mais especies', () => {
    const erros: string[] = []
    for (const map of huntsNormais) {
      if (map.enemyPool.length < 5) continue
      const total = map.enemyPool.reduce((s, id) => s + ENCOUNTERS[id].weight, 0)
      for (const id of map.enemyPool) {
        const fatia = ENCOUNTERS[id].weight / total
        if (fatia > 0.35 + 1e-9) erros.push(`${map.id}/${ENCOUNTERS[id].speciesId} = ${(fatia * 100).toFixed(1)}%`)
      }
    }
    expect(erros).toEqual([])
  })

  // O que o cartao da hunt mostra tem que ser uma distribuicao de verdade. Com
  // salas, a chance e P(sala) x P(especie | sala) somada sobre as salas — uma
  // conta facil de quebrar sem perceber (esquecer de normalizar por sala faz a
  // soma passar de 100% e ninguem ve).
  it('as chances mostradas em cada hunt somam 100%', () => {
    for (const map of Object.values(MAPS)) {
      const soma = huntOdds(map).species.reduce((s, e) => s + e.pct, 0)
      expect(soma, map.id).toBeCloseTo(100, 6)
    }
  })

  it('o enemyPool da hunt e exatamente a uniao dos pools de sala', () => {
    for (const [hunt, salas] of Object.entries(POOL_POR_SALA)) {
      const uniao = [...new Set(Object.values(salas).flat())].sort()
      expect([...MAPS[hunt].enemyPool].sort(), hunt).toEqual(uniao)
    }
  })
})

describe('hunt inicial', () => {
  it('so tem Sentret, Hoothoot e Rattata, todos NORMAL', () => {
    const especies = especiesDe(MAPS[STARTER_HUNT_ID].enemyPool).sort()
    expect(especies).toEqual(['hoothoot', 'rattata', 'sentret'])
    for (const id of especies) expect(SPECIES_DATA[id].type).toBe('NORMAL')
  })

  it('sai 80% nivel 1 e 20% nivel 2', () => {
    for (const encId of MAPS[STARTER_HUNT_ID].enemyPool) {
      expect(ENCOUNTERS[encId].levelWeights).toEqual([
        { level: 1, weight: 80 },
        { level: 2, weight: 20 },
      ])
    }
  })

  it('fica fora do sistema de salas', () => {
    expect(POOL_POR_SALA[STARTER_HUNT_ID]).toBeUndefined()
  })

  // Sem isto, "unificar a geometria das hunts" devolve os 6 inimigos em campo
  // e a hunt inicial volta a matar um POKE Lv1 (medido: 8/20 mortes em 30
  // minutos contra 2/20 com dois inimigos). Nada no jogo lanca erro quando isso
  // acontece — o jogador so morre no primeiro minuto e nao entende por que.
  it('poe menos inimigos em campo que qualquer hunt de bioma', () => {
    const inicial = MAPS[STARTER_HUNT_ID].maxEnemies
    expect(inicial).toBe(MAX_INIMIGOS_HUNT_INICIAL)
    for (const map of Object.values(MAPS)) {
      if (map.id === STARTER_HUNT_ID || map.noRespawn) continue
      expect(inicial, map.id).toBeLessThan(map.maxEnemies)
    }
  })
})
