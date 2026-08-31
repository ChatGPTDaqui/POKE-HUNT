// A conta de chance por tier, isolada do mundo de hunts.
import { describe, expect, it } from 'vitest'
import {
  CHANCE_DO_TIER, CHANCE_DO_TIER_DE_PROTETOR, TIERS_SELVAGENS, TIERS_DE_PROTETOR,
  RAZAO_MAXIMA_NO_TIER, colapsarTiers, pesosPorTier, tierDaEspecie,
} from './spawnPorTier'
import { SUB_BIOMA_TIERS, SUB_BIOMA_ESPECIES } from './generated/subBiomas.generated'

const CHANCES = TIERS_SELVAGENS.map((t) => CHANCE_DO_TIER[t])

describe('a tabela e a do PokeRogue', () => {
  // Os cortes de `arena.ts#generateNonBossBiomeTier` sobre `randSeedInt(512)`.
  // Se alguem "arredondar pra ficar bonito", isto reprova.
  it('as cinco faixas selvagens somam 1 e batem com os cortes de 512', () => {
    expect(CHANCES.reduce((s, c) => s + c, 0)).toBeCloseTo(1, 12)
    expect(CHANCES.map((c) => Math.round(c * 512))).toEqual([356, 124, 26, 5, 1])
  })

  it('as quatro faixas de chefe somam 1 e batem com os cortes de 64', () => {
    const c = TIERS_DE_PROTETOR.map((t) => CHANCE_DO_TIER_DE_PROTETOR[t])
    expect(c.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12)
    expect(c.map((x) => Math.round(x * 64))).toEqual([44, 14, 5, 1])
  })

  it('cada tier e estritamente mais raro que o anterior', () => {
    for (let i = 1; i < CHANCES.length; i++) expect(CHANCES[i]).toBeLessThan(CHANCES[i - 1])
  })
})

describe('colapso de tier vazio', () => {
  it('sem buraco nenhum, nao mexe em nada', () => {
    const r = colapsarTiers(new Set([0, 1, 2, 3, 4]), CHANCES)
    expect(r).toEqual([...CHANCES])
  })

  it('desce: sem ULTRA_RARE, a chance dele vai pro SUPER_RARE (e nao pro COMMON)', () => {
    const r = colapsarTiers(new Set([0, 1, 2, 3]), CHANCES)
    expect(r[3]).toBeCloseTo(CHANCES[3] + CHANCES[4], 12)
    expect(r[0]).toBeCloseTo(CHANCES[0], 12)
  })

  // O CASO QUE O POKEROGUE NAO TRATA. O `while (tier > COMMON) tier--` dele so
  // desce, e com COMMON vazio ele cai num sorteio global de especie que aqui nao
  // existe. Nas nossas salas isso nao e canto: a janela de nivel da faixa III ja
  // expulsou as formas base, e 32 das 99 salas ficam sem COMMON nenhum.
  it('sobe: com COMMON vazio, a chance dele vai pro UNCOMMON', () => {
    const r = colapsarTiers(new Set([1, 2, 3, 4]), CHANCES)
    expect(r[1]).toBeCloseTo(CHANCES[0] + CHANCES[1], 12)
    expect(r[0]).toBe(0)
  })

  it('sobra tudo pro unico tier presente, seja ele qual for', () => {
    for (let i = 0; i < CHANCES.length; i++) {
      const r = colapsarTiers(new Set([i]), CHANCES)
      expect(r[i]).toBeCloseTo(1, 12)
    }
  })

  it('pool vazio devolve tudo zero, sem estourar', () => {
    expect(colapsarTiers(new Set(), CHANCES)).toEqual([0, 0, 0, 0, 0])
  })
})

describe('peso por tier', () => {
  const idx = (x: [number, number]) => x[0]
  const peso = (x: [number, number]) => x[1]

  it('os pesos somam 1', () => {
    const pool: [number, number][] = [[0, 30], [0, 20], [2, 5], [4, 1]]
    const r = pesosPorTier(pool, idx, peso)
    expect([...r.values()].reduce((s, w) => s + w, 0)).toBeCloseTo(1, 12)
  })

  it('o tier manda: qualquer COMMON ganha de qualquer ULTRA_RARE', () => {
    const pool: [number, number][] = [[0, 1], [4, 30]]
    const r = pesosPorTier(pool, idx, peso)
    expect(r.get(pool[0])!).toBeGreaterThan(r.get(pool[1])!)
  })

  it('o desempate ordena dentro do tier', () => {
    const pool: [number, number][] = [[0, 30], [0, 20], [0, 10]]
    const r = pesosPorTier(pool, idx, peso)
    expect(r.get(pool[0])!).toBeGreaterThan(r.get(pool[1])!)
    expect(r.get(pool[1])!).toBeGreaterThan(r.get(pool[2])!)
  })

  // Sem o limite, `muito_comum` (30) contra `muito_raro` (1) no mesmo tier abre
  // 30:1, e em cima do tier isso produzia Alakazam com 0,0070% de uma sala.
  it('o desempate nao abre mais que a razao maxima dentro do tier', () => {
    const pool: [number, number][] = [[0, 30], [0, 1]]
    const r = pesosPorTier(pool, idx, peso)
    expect(r.get(pool[0])! / r.get(pool[1])!).toBeCloseTo(RAZAO_MAXIMA_NO_TIER, 9)
  })

  it('desempate zerado vira uniforme, e nao peso zero', () => {
    const pool: [number, number][] = [[0, 0], [0, 0]]
    const r = pesosPorTier(pool, idx, peso)
    expect(r.get(pool[0])).toBeCloseTo(0.5, 12)
    expect(r.get(pool[1])).toBeCloseTo(0.5, 12)
  })
})

describe('o dado gerado fecha com a conta', () => {
  it('toda especie de SUB_BIOMA_ESPECIES tem tier selvagem no mesmo sub-bioma', () => {
    // Uma especie no pool sem tier cairia em COMMON pelo fallback e ficaria
    // comum num lugar onde ela devia ser rara — silencioso.
    const erros: string[] = []
    for (const [sub, ids] of Object.entries(SUB_BIOMA_ESPECIES)) {
      for (const id of ids) if (!tierDaEspecie(sub, id)) erros.push(`${sub}/${id}`)
    }
    expect(erros).toEqual([])
  })

  it('os tiers selvagens de um sub-bioma sao exatamente o elenco dele, sem repetir', () => {
    for (const [sub, ids] of Object.entries(SUB_BIOMA_ESPECIES)) {
      const doTier = TIERS_SELVAGENS.flatMap((t) => SUB_BIOMA_TIERS[sub][t])
      expect(new Set(doTier).size, `${sub} repete especie entre tiers`).toBe(doTier.length)
      expect([...doTier].sort(), sub).toEqual([...ids].sort())
    }
  })

  // O pool de chefe e dado DIRETO do PokeRogue, sem heranca de familia — entao
  // ele pode ser vazio, mas nao pode conter quem nao mora no sub-bioma.
  it('todo chefe de um sub-bioma tambem esta no elenco dele', () => {
    const erros: string[] = []
    for (const [sub, ids] of Object.entries(SUB_BIOMA_ESPECIES)) {
      const elenco = new Set(ids)
      for (const t of TIERS_DE_PROTETOR) {
        for (const id of SUB_BIOMA_TIERS[sub][t]) if (!elenco.has(id)) erros.push(`${sub}/${t}/${id}`)
      }
    }
    expect(erros).toEqual([])
  })
})
