// Invariantes do mundo de hunts.
//
// Quase toda falha aqui e SILENCIOSA, e e por isso que estes testes existem:
// uma especie sem hunt nenhuma continua no catalogo (aparece no Bestiario, tem
// sprite, tem moveset) e simplesmente nunca spawna — foi exatamente assim que a
// linha do Dratini sumiu do jogo por uma leva inteira sem ninguem notar. Uma
// hunt com pool vazio so estoura quando alguem entra nela. Um sub-bioma
// inalcancavel nao da erro em lugar nenhum.
import { describe, expect, it } from 'vitest'
import { MAPS, ENCOUNTERS, POOL_POR_SALA, STARTER_HUNT_ID, TETO_DE_FATIA, POOL_MINIMO_PRA_TETO } from './huntSpawnOverrides'
import { SPECIES, type Species } from './pokes'
import { SPECIES_DATA } from './generated/pokes.generated'
import { SUB_BIOMA_ESPECIES } from './generated/subBiomas.generated'
import { SPAWN_WEIGHT_BY_SPECIES } from './generated/spawnTiers.generated'
import {
  BIOMAS, FAIXAS, FAIXAS_INICIAIS, GRUPOS_DO_LANCE, MAX_INIMIGOS_HUNT_INICIAL, huntId,
} from './biomas'
import { LEGENDARY_SPECIES_IDS } from './legendaries'
import { contextoDeSpawn, janelaDaSala } from '@/engine/systems/salaSystem'
import { SALAS_POR_HUNT } from './biomas'
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
// composicao, nivel deslocado), sem as BOSS (elenco proprio, curado a mao) e sem
// o Treinamento (`noRewards`, ver data/trainingDummy.ts — fixture de teste, nao
// concorre com bioma nenhum na grade nem no numero de inimigos em campo).
const huntsNormais = Object.values(MAPS).filter(
  (m) => !m.id.startsWith('nightmare_') && !m.id.startsWith('boss_') && !m.noRewards,
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
  // O PESO TEM QUE VIR DO DADO, E NAO DO FALLBACK.
  //
  // `huntSpawnOverrides.ts` resolve peso com `SPAWN_WEIGHT_BY_SPECIES[id] ??
  // DEFAULT_WEIGHT`, e esse `??` e uma falha silenciosa por construcao: especie
  // sem tier nao da erro, ela so passa a spawnar com peso "incomum" plano. Foi
  // o que aconteceu com Hoenn inteira — `scripts/spawn-tiers-gen3.json` foi
  // derivado em 25/08 e `gerar-spawn-tiers.mjs` nunca foi ligado nele, entao
  // 125 das 353 especies com sub-bioma (35%) spawnavam com peso inventado por
  // tres semanas, sem um sintoma sequer.
  //
  // Este teste e o alarme que faltava, e ele cobre a proxima geracao importada
  // tambem: ela vai chegar exatamente do mesmo jeito (sprite e catalogo
  // primeiro, tabela de tier depois).
  it('toda especie com sub-bioma tem tier proprio, sem cair no fallback', () => {
    const alocadas = [...new Set(Object.values(SUB_BIOMA_ESPECIES).flat())]
    const semTier = alocadas.filter((id) => SPAWN_WEIGHT_BY_SPECIES[id] == null).sort()
    expect(semTier).toEqual([])
  })

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

  // ESTE TESTE MEDE A HUNT, E A HUNT NAO E O QUE O JOGADOR ENFRENTA.
  //
  // Ele guarda o pool de FALLBACK — o `enemyPool`, que so vira pool de sorteio
  // quando nao ha sala (inicial, BOSS, Lance, e o intervalo antes de o servidor
  // dizer a sala). Ele passou verde durante toda a vida do bug que o teste
  // seguinte pega: por medir a uniao das salas, ele nunca viu Leito de Praia
  // III em 50%.
  //
  // Sem o teto, um pool pequeno com um tier alto vira hunt de uma especie so:
  // medido, Unown ocupava 50,8% do Sagrado.
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

  // O TESTE QUE MEDE O QUE O JOGADOR ENFRENTA DE VERDADE.
  //
  // O sorteio roda sobre o pool da SALA recortado pela JANELA DE NIVEL dela, e e
  // esse conjunto — nao o `enemyPool` da hunt — que precisa respeitar o teto.
  // Sao 33 sub-biomas x 3 faixas x 10 indices de sala. Com o teto so no nivel da
  // hunt, 9 das 99 combinacoes (sub-bioma x faixa) ja passavam de 35%:
  //
  //   beach/III 50,0%   laboratory/II 50,0%   beach/I 42,9%   graveyard/I 40,0%
  //   snowy-forest/I 39,5%   ruins/III 39,5%   graveyard/III 37,0%   ...
  //
  // Percorre `contextoDeSpawn`, e nao uma reimplementacao da conta, de proposito:
  // o que precisa estar certo e o numero que o motor usa no `weightedPick`, nao
  // um numero parecido calculado no teste.
  it('nenhuma especie passa de 35% de nenhuma SALA, em nenhum indice', () => {
    const erros: string[] = []
    for (const [huntId, salas] of Object.entries(POOL_POR_SALA)) {
      const mapDef = MAPS[huntId]
      for (const chave of Object.keys(salas)) {
        for (let indice = 0; indice < SALAS_POR_HUNT; indice++) {
          const sala = { chave, indice, abates: 0, ciclos: 0 }
          const ctx = contextoDeSpawn(huntId, mapDef.levelRange, sala, mapDef.enemyPool)
          if (ctx.pool.length < POOL_MINIMO_PRA_TETO) continue
          const total = ctx.pool.reduce((s, id) => s + ctx.peso(id), 0)
          for (const id of ctx.pool) {
            const fatia = ctx.peso(id) / total
            if (fatia > TETO_DE_FATIA + 1e-9) {
              const janela = janelaDaSala(mapDef.levelRange, indice).join('-')
              erros.push(`${huntId}/${chave}#${indice} (Lv ${janela}) ${ENCOUNTERS[id].speciesId} = ${(fatia * 100).toFixed(1)}%`)
            }
          }
        }
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
  it('tem as 9 especies de primeira rota, e so elas', () => {
    const especies = especiesDe(MAPS[STARTER_HUNT_ID].enemyPool).sort()
    expect(especies).toEqual([
      'caterpie', 'hoothoot', 'pidgey', 'poochyena', 'rattata',
      'sentret', 'weedle', 'wurmple', 'zigzagoon',
    ])
  })

  // O QUE SUBSTITUIU O INVARIANTE "TODOS NORMAL".
  //
  // A hunt tinha tres especies e todas eram NORMAL, e havia um teste afirmando
  // isso. Era descricao das tres escolhidas, nao regra de desenho: caterpie e
  // weedle sao BUG, poochyena e DARK, e nenhum dos tres tem nada de errado numa
  // primeira rota.
  //
  // O que a hunt inicial precisa garantir de verdade e que o inimigo seja
  // FRACO — um POKE inicial Lv1 tem 12 HP. Entao o invariante passa a ser o
  // teto de forca, ancorado no elenco que a hunt ja tinha antes: ninguem entra
  // mais forte que o mais forte de la.
  it('ninguem e mais forte que o elenco original da hunt', () => {
    const tetoOriginal = Math.max(...['sentret', 'hoothoot', 'rattata'].map(baseStatTotal))
    for (const id of especiesDe(MAPS[STARTER_HUNT_ID].enemyPool)) {
      expect(baseStatTotal(id), id).toBeLessThanOrEqual(tetoOriginal)
    }
  })

  // Lv1-3 com o 3 raro. O peso do Lv1 nao e detalhe de sabor: a unica janela em
  // que conta nova morre sao os primeiros 30-60 segundos, com o POKE ainda Lv1
  // (ver data/biomas.ts#MAX_INIMIGOS_HUNT_INICIAL), e e o Lv1 majoritario que
  // segura essa janela. Um dia alguem vai querer "deixar mais interessante"
  // achatando isto pra 34/33/33 — este teste e o lugar onde essa conversa
  // acontece.
  it('sai Lv1-3, com Lv1 majoritario e Lv3 raro', () => {
    for (const encId of MAPS[STARTER_HUNT_ID].enemyPool) {
      const pesos = ENCOUNTERS[encId].levelWeights
      expect(pesos).toEqual([
        { level: 1, weight: 76 },
        { level: 2, weight: 21 },
        { level: 3, weight: 3 },
      ])
      const total = pesos!.reduce((s, p) => s + p.weight, 0)
      expect(pesos![0].weight / total).toBeGreaterThan(0.5)
      expect(pesos![2].weight).toBeLessThan(pesos![0].weight)
    }
    expect(MAPS[STARTER_HUNT_ID].levelRange).toEqual([1, 3])
  })

  // As seis que mudaram de casa nao podem ter sumido do mundo: elas SAIRAM do
  // `town` (scripts/gerar-subbiomas.mjs#SAI_DO_SUB_BIOMA) e a hunt inicial vai
  // so ate o Lv3, entao quem quiser pegar uma delas depois precisa achar onde.
  // O teste geral "toda especie selvagem tem pelo menos uma hunt" nao cobre
  // isto: a propria hunt inicial ja o satisfaz.
  it('quem saiu do town continua com casa numa hunt de bioma', () => {
    const mudaramDeCasa = ['pidgey', 'caterpie', 'weedle', 'zigzagoon', 'poochyena', 'wurmple']
    const emTown = new Set(SUB_BIOMA_ESPECIES['town'])
    const emBioma = new Set(
      Object.entries(SUB_BIOMA_ESPECIES).flatMap(([sub, ids]) => (sub === 'town' ? [] : ids)),
    )
    for (const id of mudaramDeCasa) {
      expect(emTown.has(id), `${id} devia ter saido do town`).toBe(false)
      expect(emBioma.has(id), `${id} ficou sem nenhuma hunt de bioma`).toBe(true)
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
      // Treinamento (`noRewards`) e um fixture de teste, nao uma hunt de
      // caça — 1 boneco em campo e o design, nao um esquecimento.
      if (map.id === STARTER_HUNT_ID || map.noRespawn || map.noRewards) continue
      expect(inicial, map.id).toBeLessThan(map.maxEnemies)
    }
  })
})

// ---------------------------------------------------------------------------
// Modo Pesadelo espelha a hunt de origem INTEIRA, salas incluidas
// ---------------------------------------------------------------------------
// A falha silenciosa: o espelho copiava mapa e encontros e nao o cadastro de
// salas, entao `temSalas('nightmare_mata_faixa1')` dava `false` e aquelas 36
// hunts rodavam como arena unica — sem sub-bioma, sem chip de sala, sem aviso
// de nova area, sem janela de nivel por sala, e com o pool inteiro spawnando de
// uma vez. Metade do conteudo de bioma com regra diferente da outra metade, e
// nada no jogo apontando isso.
describe('espelho do Modo Pesadelo', () => {
  const espelhos = Object.keys(MAPS).filter((id) => id.startsWith('nightmare_'))

  it('existe um espelho por hunt espelhavel (senao o teste passa de vazio)', () => {
    expect(espelhos.length).toBeGreaterThan(30)
  })

  it.each(espelhos)('%s tem as mesmas salas da hunt de origem', (id) => {
    const origem = id.slice('nightmare_'.length)
    const salasDaOrigem = POOL_POR_SALA[origem]
    const salasDoEspelho = POOL_POR_SALA[id]

    if (!salasDaOrigem) {
      // Origem fora do sistema de salas (a hunt inicial): o espelho tambem fica
      // fora. O que nao pode e um dos dois ter salas e o outro nao.
      expect(salasDoEspelho, `${id} ganhou salas que ${origem} nao tem`).toBeUndefined()
      return
    }

    expect(salasDoEspelho, `${id} sem salas, mas ${origem} tem`).toBeDefined()
    expect(Object.keys(salasDoEspelho!).sort()).toEqual(Object.keys(salasDaOrigem).sort())
  })

  it.each(espelhos)('%s: toda sala tem pool nao-vazio e de encontro existente', (id) => {
    const salas = POOL_POR_SALA[id]
    if (!salas) return
    for (const [chave, pool] of Object.entries(salas)) {
      // Sala com pool vazio nao lanca erro: o jogador entra e nada spawna.
      expect(pool.length, `${id}/${chave} sem encontro`).toBeGreaterThan(0)
      for (const encId of pool) {
        expect(ENCOUNTERS[encId], `${id}/${chave} aponta pro encontro inexistente ${encId}`).toBeDefined()
      }
      // E o pool da sala tem que estar dentro do pool da hunt, senao o
      // `poolAtivo` da sala spawna bicho que a hunt diz nao ter.
      const daHunt = new Set(MAPS[id].enemyPool)
      for (const encId of pool) expect(daHunt.has(encId), `${encId} fora do enemyPool de ${id}`).toBe(true)
    }
  })

  it('o nivel do espelho continua deslocado (o espelho nao virou copia crua)', () => {
    for (const id of espelhos) {
      const origem = MAPS[id.slice('nightmare_'.length)]
      const espelho = MAPS[id]
      expect(espelho.levelRange[0], id).toBeGreaterThan(origem.levelRange[0])
      for (const encId of espelho.enemyPool) {
        const enc = ENCOUNTERS[encId]
        // Mesmo teste que ja pegou o bug dos `levelWeights` nao deslocados.
        for (const lw of enc.levelWeights ?? []) {
          expect(lw.level, `${encId} com levelWeights fora da faixa`).toBeGreaterThanOrEqual(enc.minLevel)
        }
      }
    }
  })
})
