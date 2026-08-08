// Onde a lista de especies de cada hunt e decidida de verdade.
//
// O sync (scripts/sync-planilha.js#buildTypeRoster) monta uma hunt por TIPO
// elemental e joga toda especie daquele tipo dentro dela, sem olhar regiao —
// e por isso a "Zona Nivel 11-20 (Planicie)" de Johto vinha com Pidgey,
// Rattata, Meowth e Snorlax (todos Kanto) e a "Kanto Zona 60-70 (Penhascos)"
// vinha com Hoothoot e Ledyba (Johto).
//
// Pedido explicito do usuario: "Apenas Pokemon de Johto devem aparecer nas
// hunts de Johto; o mesmo vale para Kanto".
//
// POR QUE ISSO NAO E "SO FILTRAR O ARRAY": filtrar por regiao ESVAZIA hunt.
// Medido no roster real (226 especies):
//
//   - Johto nao tem NENHUMA especie POISON primaria (Pantano ficaria vazia)
//     nem DRAGON, e so 1 FIGHTING e 1 GHOST.
//   - Kanto nao tem NENHUMA especie DARK nem STEEL primaria — os dois tipos
//     so existem a partir da Gen2 (Covil Sombrio ficaria vazia).
//   - Filtrando as 19 hunts pela regiao do rotulo `continent` atual, 3
//     ficariam vazias e ~100 especies perderiam qualquer hunt onde spawnar.
//
// Solucao adotada: cada BIOMA passa a existir NAS DUAS regioes (quando a
// regiao tem especie daquele tipo). A hunt original mantem id/nome/nivel e
// fica com a regiao do rotulo dela; a regiao oposta ganha uma hunt IRMA, com
// id novo (`${id}_${regiao}`), mesmo bioma e mesma faixa de nivel. Resultado
// medido: 35 hunts (era 19), toda hunt com pelo menos 1 especie, e ZERO
// especie orfa — cada uma cai na hunt do proprio tipo primario dentro da
// propria regiao. A unica combinacao descartada e Kanto+DARK, que nao existe
// no dado real.
//
// Consequencia assumida: cada regiao passa a ter uma escada completa de
// nivel (Johto tambem chega a Lv105, Kanto tambem comeca em Lv2). O portao
// do Campeao Lance continua valendo — ele libera o CONTINENTE Kanto inteiro,
// ou seja, metade do elenco.
//
// Este arquivo tambem e o unico ponto onde as hunts normais, o espelho do
// Modo Pesadelo e as hunts BOSS/Lance sao juntados: `data/maps.ts` e
// `data/enemies.ts` so reexportam cada metade do resultado.
import { MAPS_DATA } from './generated/maps.generated'
import { ENCOUNTERS_DATA } from './generated/enemies.generated'
import { buildNightmareMirror, BOSS_MAPS_DATA, BOSS_ENCOUNTERS_DATA } from './nightmareMaps'
import { SPECIES_DATA } from './generated/pokes.generated'
import { LEGENDARY_SPECIES_IDS } from './legendaries'
import { NON_WILD_SPECIES, REGIONS, REGION_LABEL, pokedexNumber, regionOfSpecies, type Region } from './regions'
import type { ElementType } from './generated/types'
import type { HuntMapDef, HuntEncounter } from './huntTypes'

// ---------------------------------------------------------------------------
// Tabela de bioma por hunt
// ---------------------------------------------------------------------------
// Escrita a mao porque o tipo do bioma NAO viaja no dado gerado: ele vive em
// scripts/sync-planilha.js#TYPE_BIOME_PLAN e some na emissao (o `.generated`
// so guarda o resultado). Sao 18 linhas fixas; qualquer hunt nova que o sync
// crie sem entrada aqui ESTOURA no boot (ver a checagem no fim do arquivo),
// em vez de nascer sem regra de spawn e sem ninguem notar.
const HUNT_BIOME: Record<string, ElementType> = {
  lv_1_10_floresta: 'GRASS',
  lv_1_10_bosque: 'BUG',
  lv_11_20_costa: 'WATER',
  lv_11_20_planicie: 'NORMAL',
  lv_21_30_caverna: 'ROCK',
  lv_21_30_deserto: 'GROUND',
  lv_31_40_vulcanico: 'FIRE',
  lv_31_40_usina: 'ELECTRIC',
  lv_41_50_pantano: 'POISON',
  lv_41_50_dojo: 'FIGHTING',
  kanto_lv_1_10_geleira: 'ICE',
  kanto_lv_1_10_fabrica: 'STEEL',
  kanto_lv_11_20_penhascos: 'FLYING',
  kanto_lv_11_20_torre_mistica: 'PSYCHIC',
  kanto_lv_21_35_cemiterio: 'GHOST',
  kanto_lv_21_35_covil_sombrio: 'DARK',
  kanto_lv_36_55_ruinas_ancestrais: 'DRAGON',
  kanto_lv_36_55_profundezas: 'WATER',
}

// A hunt inicial nao e um bioma: e a primeira tela do jogo, com elenco curto
// e escolhido a mao. Fica de fora da regra generica.
const STARTER_HUNT_ID = 'route_46'
// So especies de Johto (a hunt e de Johto), de nivel baixo e sem evolucao
// intimidadora. Sentret veio de um pedido explicito anterior do usuario; as
// outras tres sao os POKEs de rota mais comuns do inicio de Johto real.
const STARTER_HUNT_SPECIES = ['sentret', 'hoothoot', 'ledyba', 'spinarak']
// Pedido explicito: a primeira hunt sai 80% nivel 1 e 20% nivel 2.
const STARTER_LEVEL_WEIGHTS = [
  { level: 1, weight: 80 },
  { level: 2, weight: 20 },
]

// Especie que deve cair num bioma diferente do tipo primario dela. Pedido
// explicito anterior do usuario (Wooper/Quagsire saem da hunt de Agua e vao
// pra de Terra) — os dois sao WATER/GROUND de verdade, entao isto e a mesma
// regra de "tipagem dupla pode spawnar no bioma de qualquer um dos dois
// tipos" que o sync ja usa, so que escolhida a mao.
const SPECIES_BIOME_OVERRIDE: Record<string, ElementType> = {
  wooper: 'GROUND',
  quagsire: 'GROUND',
}

// Abaixo disto o pool e reforcado com especies de tipagem SECUNDARIA igual —
// mesmo numero e mesma regra do sync (MIN_TYPE_POOL). Sem isso, biomas como
// Penhascos (FLYING nao e tipo primario de NINGUEM em Gen1/Gen2, fato real
// do dado) nasceriam vazios.
const MIN_TYPE_POOL = 4

// 1% exato pro Dragonite nas Ruinas Ancestrais (pedido explicito anterior).
const DRAGONITE_HUNT_SHARE = 0.01

// ---------------------------------------------------------------------------
// Elenco elegivel
// ---------------------------------------------------------------------------
// Os 3 iniciais base so saem da tela de escolha (as formas evoluidas deles
// continuam selvagens normais); lendarios sao exclusivos de hunt BOSS; e
// NON_WILD_SPECIES sao as de cassino/presente (ver data/regions.ts).
const BASE_STARTERS = new Set(['charmander', 'squirtle', 'bulbasaur'])
const LEGENDARY = new Set<string>(LEGENDARY_SPECIES_IDS)

const WILD_SPECIES_IDS = Object.keys(SPECIES_DATA)
  .filter((id) => !BASE_STARTERS.has(id) && !LEGENDARY.has(id) && !NON_WILD_SPECIES.has(id))
  .sort((a, b) => pokedexNumber(a) - pokedexNumber(b))

function biomeOf(speciesId: string): ElementType {
  return SPECIES_BIOME_OVERRIDE[speciesId] ?? SPECIES_DATA[speciesId].type
}

function poolFor(region: Region, biome: ElementType): string[] {
  const mine = WILD_SPECIES_IDS.filter((id) => regionOfSpecies(id) === region)
  const primary = mine.filter((id) => biomeOf(id) === biome)
  if (primary.length >= MIN_TYPE_POOL) return primary
  const secondary = mine.filter((id) => SPECIES_DATA[id].type2 === biome && !primary.includes(id))
  return [...primary, ...secondary]
}

// Peso de spawn (tier real do Gen1/Gen2, ver scripts/derive-spawn-tiers.js).
// Ele ja viaja em todo encontro gerado e e o MESMO pra especie em qualquer
// hunt — conferido: 212 especies, zero divergencia. Reaproveitar em vez de
// reinventar mantem a raridade relativa que o jogo ja tinha.
const WEIGHT_BY_SPECIES: Record<string, number> = {}
for (const enc of Object.values(ENCOUNTERS_DATA)) WEIGHT_BY_SPECIES[enc.speciesId] = enc.weight
// So cai aqui especie que hoje nao spawna em lugar nenhum e passou a spawnar
// com a separacao por regiao. 10 = tier "incomum", o meio da escala.
const DEFAULT_WEIGHT = 10

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------
const maps: Record<string, HuntMapDef> = {}
const encounters: Record<string, HuntEncounter> = {}

function addEncounter(
  huntId: string,
  speciesId: string,
  minLevel: number,
  maxLevel: number,
  levelWeights?: { level: number; weight: number }[],
): string {
  const id = `${huntId}_${speciesId}`
  encounters[id] = {
    id,
    speciesId,
    minLevel,
    maxLevel,
    // Mesmos valores fixos que todo encontro gerado usa
    // (scripts/sync-planilha.js#syncMapsAndEncounters).
    aggroRadius: 175,
    wanderRadius: 60,
    weight: WEIGHT_BY_SPECIES[speciesId] ?? DEFAULT_WEIGHT,
    ...(levelWeights ? { levelWeights } : {}),
  }
  return id
}

// "Zona Nivel 11-20 (Planicie)" e "Kanto Zona Nivel 52-62 (Geleira)" viram
// "Johto Zona ..." / "Kanto Zona ...". Prefixo em TODA hunt (nao so nas
// novas): com o mesmo bioma existindo nas duas regioes, um nome sem regiao
// vira ambiguo no chat, no HUD e no relatorio de farm offline, onde nao ha
// aba de continente por perto pra desambiguar.
function nameFor(baseName: string, region: Region): string {
  const stripped = baseName.replace(/^(Kanto|Johto)\s+/, '')
  return `${REGION_LABEL[region]} ${stripped}`
}

for (const base of Object.values(MAPS_DATA)) {
  if (base.id === STARTER_HUNT_ID) {
    const pool = STARTER_HUNT_SPECIES.filter((id) => SPECIES_DATA[id])
    maps[base.id] = {
      ...base,
      name: nameFor(base.name, 'johto'),
      continent: 'johto',
      levelRange: [
        STARTER_LEVEL_WEIGHTS[0].level,
        STARTER_LEVEL_WEIGHTS[STARTER_LEVEL_WEIGHTS.length - 1].level,
      ],
      enemyPool: pool.map((speciesId) =>
        addEncounter(base.id, speciesId, STARTER_LEVEL_WEIGHTS[0].level, STARTER_LEVEL_WEIGHTS[STARTER_LEVEL_WEIGHTS.length - 1].level, STARTER_LEVEL_WEIGHTS)
      ),
    }
    continue
  }

  const biome = HUNT_BIOME[base.id]
  if (!biome) {
    throw new Error(
      `Hunt "${base.id}" sem bioma em HUNT_BIOME (data/huntSpawnOverrides.ts). ` +
      'Toda hunt gerada precisa declarar o tipo elemental dela pro recorte por regiao funcionar.'
    )
  }

  for (const region of REGIONS) {
    const pool = poolFor(region, biome)
    if (!pool.length) continue // ex.: Kanto + DARK — nao existe no dado real
    const isHome = base.continent === region
    const id = isHome ? base.id : `${base.id}_${region}`
    const name = nameFor(base.name, region)
    maps[id] = {
      ...base,
      id,
      name,
      description: `Local selvagem: ${name} (nivel ${base.levelRange[0]}-${base.levelRange[1]}).`,
      continent: region,
      enemyPool: pool.map((speciesId) => addEncounter(id, speciesId, base.levelRange[0], base.levelRange[1])),
    }
  }
}

// Dragonite fica em exatamente 1% do pool das Ruinas Ancestrais. A conta sai
// do peso dos OUTROS (weightedPick usa `peso / soma dos pesos`), nao de um
// numero fixo: continua 1% mesmo se o resto do pool mudar.
for (const map of Object.values(maps)) {
  const dragoniteEncId = map.enemyPool.find((id) => encounters[id]?.speciesId === 'dragonite')
  if (!dragoniteEncId) continue
  const othersWeight = map.enemyPool
    .filter((id) => id !== dragoniteEncId)
    .reduce((sum, id) => sum + (encounters[id]?.weight ?? 0), 0)
  if (othersWeight > 0) {
    encounters[dragoniteEncId].weight = (othersWeight * DRAGONITE_HUNT_SHARE) / (1 - DRAGONITE_HUNT_SHARE)
  }
}

// Espelho do Modo Pesadelo tirado do resultado ACIMA (ja recortado por
// regiao), nao do dado gerado cru — senao o Pesadelo continuaria com a
// composicao misturada antiga e sem espelho pras hunts novas.
const nightmare = buildNightmareMirror(maps, encounters)

export const MAPS: Record<string, HuntMapDef> = { ...maps, ...nightmare.maps, ...BOSS_MAPS_DATA }
export const ENCOUNTERS: Record<string, HuntEncounter> = { ...encounters, ...nightmare.encounters, ...BOSS_ENCOUNTERS_DATA }
