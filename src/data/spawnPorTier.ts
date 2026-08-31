// A chance de aparicao de cada especie DENTRO de uma sala.
//
// ---------------------------------------------------------------------------
// DE ONDE VEM A TABELA
// ---------------------------------------------------------------------------
// Do PokeRogue, `src/field/arena.ts#randomSpecies`. Ele sorteia um TIER primeiro
// e so depois uma especie dentro dele:
//
//   const rollMax = isBossSpecies ? 64 : 512
//   const rngRoll = randSeedInt(rollMax - luckModifier)
//   tier = (isBossSpecies ? generateBossBiomeTier : generateNonBossBiomeTier)(rngRoll)
//
// com os cortes de `generateNonBossBiomeTier` (>=156 COMMON, >=32 UNCOMMON,
// >=6 RARE, >=1 SUPER_RARE, senao ULTRA_RARE) e `generateBossBiomeTier` (>=20
// BOSS, >=6 BOSS_RARE, >=1 BOSS_SUPER_RARE, senao BOSS_ULTRA_RARE). Os numeros
// abaixo sao esses cortes virados em largura de faixa.
//
// O `luckModifier` NAO entra: Sorte e um sistema de run do PokeRogue que nao
// existe aqui, e importar meio sistema daria uma constante morta multiplicando
// tudo por 1.
//
// ---------------------------------------------------------------------------
// DUAS DIVERGENCIAS DELIBERADAS DO POKEROGUE
// ---------------------------------------------------------------------------
// 1. DENTRO DO TIER ELE SORTEIA UNIFORME (`randSeedItem(tierPool)`); aqui o
//    tier real de encontro do Gen1/Gen2 e Gen3 DESEMPATA
//    (`SPAWN_WEIGHT_BY_SPECIES`). E o dado melhor fundamentado do projeto —
//    derivado de disassembly, nao de wiki — e o unico custo de usa-lo e que
//    Rattata aparece mais que Sentret dentro do mesmo COMMON, que e
//    exatamente o que acontece nos jogos.
//
// 2. O COLAPSO DE TIER VAZIO E BIDIRECIONAL; no PokeRogue so desce
//    (`while (pool[tier].length === 0 && tier > COMMON) tier--`), e quando
//    COMMON tambem esta vazio ele cai num sorteio global de especie que aqui
//    nao existe. Nao e detalhe: as nossas salas recortam o pool por FAIXA DE
//    NIVEL, e na faixa III as formas base ja evoluiram — medido, 32 das 99
//    salas ficam com COMMON VAZIO, incluindo toda a faixa III de 20
//    sub-biomas. So-descer sortearia sobre pool vazio em um terco do jogo.
import type { TierSelvagem, TierDeProtetor } from './generated/types'
import { SUB_BIOMA_TIERS } from './generated/subBiomas.generated'

/** Do mais comum ao mais raro — a ordem E a raridade, igual ao enum do PokeRogue. */
export const TIERS_SELVAGENS: readonly TierSelvagem[] = [
  'COMMON', 'UNCOMMON', 'RARE', 'SUPER_RARE', 'ULTRA_RARE',
]

export const TIERS_DE_PROTETOR: readonly TierDeProtetor[] = [
  'BOSS', 'BOSS_RARE', 'BOSS_SUPER_RARE', 'BOSS_ULTRA_RARE',
]

/** Largura de cada faixa do `randSeedInt(512)` do PokeRogue. Soma 512. */
export const CHANCE_DO_TIER: Record<TierSelvagem, number> = {
  COMMON: (512 - 156) / 512,   // 69,53%
  UNCOMMON: (156 - 32) / 512,  // 24,22%
  RARE: (32 - 6) / 512,        //  5,08%
  SUPER_RARE: (6 - 1) / 512,   //  0,98%
  ULTRA_RARE: 1 / 512,         //  0,20%
}

/** O mesmo, do `randSeedInt(64)` do lado de chefe. Soma 64. */
export const CHANCE_DO_TIER_DE_PROTETOR: Record<TierDeProtetor, number> = {
  BOSS: (64 - 20) / 64,              // 68,75%
  BOSS_RARE: (20 - 6) / 64,          // 21,88%
  BOSS_SUPER_RARE: (6 - 1) / 64,     //  7,81%
  BOSS_ULTRA_RARE: 1 / 64,           //  1,56%
}

// Sub-bioma -> especie -> indice em TIERS_SELVAGENS. Montado sob demanda: o
// arquivo gerado e grande e nem toda sessao entra em toda hunt.
const reverso = new Map<string, Map<string, number>>()

/**
 * Em que tier selvagem `speciesId` esta neste sub-bioma, ou `null` se ele nao
 * mora ali.
 *
 * `null` e um caso real, nao defensivo: o pool de sorteio cai no `enemyPool` da
 * hunt inteira quando a sala nao tem encontro na janela de nivel
 * (`salaSystem#contextoDeSpawn`), e ai entram especies de sub-biomas vizinhos.
 */
export function tierDaEspecie(subBioma: string, speciesId: string): TierSelvagem | null {
  let mapa = reverso.get(subBioma)
  if (!mapa) {
    mapa = new Map()
    const tiers = SUB_BIOMA_TIERS[subBioma]
    if (tiers) {
      TIERS_SELVAGENS.forEach((t, i) => { for (const sp of tiers[t]) mapa!.set(sp, i) })
    }
    reverso.set(subBioma, mapa)
  }
  const i = mapa.get(speciesId)
  return i == null ? null : TIERS_SELVAGENS[i]
}

/**
 * Distribui a chance dos tiers VAZIOS entre os que sobraram.
 *
 * Desce primeiro (na direcao do mais comum), que e o comportamento do
 * PokeRogue, e sobe quando nao ha nada abaixo. A ordem importa: um pool sem
 * ULTRA_RARE deve engrossar o SUPER_RARE, e nao o COMMON.
 *
 * Devolve a chance EFETIVA por indice de tier; indices ausentes do pool ficam
 * em zero.
 */
export function colapsarTiers(
  presentes: ReadonlySet<number>,
  chancePorIndice: readonly number[],
): number[] {
  const efetiva = new Array<number>(chancePorIndice.length).fill(0)
  if (presentes.size === 0) return efetiva
  for (let t = 0; t < chancePorIndice.length; t++) {
    let alvo = -1
    for (let d = t; d >= 0; d--) if (presentes.has(d)) { alvo = d; break }
    if (alvo < 0) for (let u = t + 1; u < chancePorIndice.length; u++) if (presentes.has(u)) { alvo = u; break }
    efetiva[alvo] += chancePorIndice[t]
  }
  return efetiva
}

/**
 * QUANTO O DESEMPATE PODE ABRIR DENTRO DE UM TIER.
 *
 * A escala do Gen1/Gen2 vai de 30 (`muito_comum`) a 1 (`muito_raro`) — 30:1. Em
 * cima do tier do PokeRogue, que ja abre 348:1 entre COMMON e ULTRA_RARE, isso
 * daria uma faixa total de mais de 10.000:1, e a ponta some do jogo. Medido sem
 * o limite: Alakazam ficava com 0,0070% da sala, uma aparicao a cada 14 mil
 * abates.
 *
 * O que o usuario escolheu foi DESEMPATE, e desempate ordena sem dominar: quem
 * manda na raridade e o tier. 4:1 e o suficiente pra ordem sobreviver (dentro
 * de COMMON, `muito_comum` 30 continua na frente de `comum` 20 sem nenhum
 * ajuste — o limite so morde quando o tier junta 30 com 1 ou 5, que e
 * exatamente o caso lopsided).
 */
export const RAZAO_MAXIMA_NO_TIER = 4

/**
 * Peso de sorteio de cada item do pool: a chance do tier dele, colapsada,
 * repartida dentro do tier pelo desempate.
 *
 * Os pesos somam 1 quando o pool nao esta vazio. `weightedPick` normaliza de
 * qualquer jeito, mas somar 1 deixa o numero legivel em log e em teste.
 *
 * Generica em `T` porque quem chama passa id de ENCONTRO, e nao de especie —
 * duas hunts tem encontros diferentes pra mesma especie.
 */
export function pesosPorTier<T>(
  pool: readonly T[],
  indiceDoTier: (item: T) => number,
  desempate: (item: T) => number,
  chancePorIndice: readonly number[] = TIERS_SELVAGENS.map((t) => CHANCE_DO_TIER[t]),
): Map<T, number> {
  const porTier = new Map<number, T[]>()
  for (const item of pool) {
    const i = indiceDoTier(item)
    const lista = porTier.get(i)
    if (lista) lista.push(item)
    else porTier.set(i, [item])
  }
  const efetiva = colapsarTiers(new Set(porTier.keys()), chancePorIndice)
  const pesos = new Map<T, number>()
  for (const [i, itens] of porTier) {
    // Desempate zerado ou ausente vira uniforme dentro do tier, que e o
    // comportamento do PokeRogue — e nao "esta especie nunca aparece".
    const cru = itens.map((x) => (desempate(x) > 0 ? desempate(x) : 1))
    const piso = Math.max(...cru) / RAZAO_MAXIMA_NO_TIER
    const g = cru.map((x) => Math.max(x, piso))
    const soma = g.reduce((s, x) => s + x, 0)
    itens.forEach((item, k) => pesos.set(item, (efetiva[i] * g[k]) / soma))
  }
  return pesos
}
