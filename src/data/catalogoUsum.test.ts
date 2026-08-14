// Invariantes do catalogo de Pokemon Ultra Sun (Gen VII) e do tipo Fada.
//
// POR QUE ESTES TESTES EXISTEM
//
// A migracao de Gen2 para Gen VII trocou stats, tipos, movesets, formulas e
// acrescentou um 18o tipo. Praticamente nenhuma falha desse conjunto lanca
// excecao: um tipo sem cor sai cinza, um tipo sem icone cai no rotulo de 3
// letras, uma celula faltando na tabela de tipos vira multiplicador 1, um golpe
// do moveset sem entrada em ABILITIES_DATA e simplesmente ignorado pelo
// combate. Tudo isso passa despercebido em `tsc` e em qualquer clique manual.
//
// O gate byte-a-byte que existia antes (`npm run catalog:verificar`, planilha x
// Postgres) foi aposentado com a migracao — provava que o dado NAO mudava, e o
// objetivo desta leva e justamente que ele mude. Este arquivo e metade do que
// entrou no lugar; a outra metade e `npm run usum:conferir`, que confere o
// catalogo contra a Bulbapedia.
import { describe, it, expect } from 'vitest'
import { TYPE_COLORS } from './typeColors'
import { abilityIconUrl } from './abilityIcons'
import { IMPACT_SHAPE_BY_TYPE } from './impactShapes'
import { STONE_TYPES, stoneItemId } from './stones'
import { TYPED_AOE_MOVES, typedAoeMoveKey } from './typedAoeMoves'
import { TYPE_CHART, getEffectiveness } from './generated/typeChart.generated'
import { SPECIES_DATA } from './generated/pokes.generated'
import { ABILITIES_DATA } from './generated/abilities.generated'
import { FORMULAS } from './generated/formulas.generated'
import { createFormulaEngine } from '@/core/formulaEngine'
import { totalExpForLevel } from './pokes'
import type { ElementType, GrowthCurve } from './generated/types'

const TIPOS = Object.keys(TYPE_COLORS) as ElementType[]
const engine = createFormulaEngine(FORMULAS)

describe('os 18 tipos da Gen VI+ estao completos em toda tabela indexada por tipo', () => {
  it('sao 18 tipos, com FAIRY entre eles', () => {
    expect(TIPOS).toHaveLength(18)
    expect(TIPOS).toContain('FAIRY')
  })

  // Cada uma destas tabelas e um `Record<ElementType, ...>`, entao o tsc pega a
  // ausencia — MENOS as que sao Partial (background do Modo Pesadelo) e as que
  // dependem de um arquivo existir no disco (icone). Testar o conjunto todo
  // custa nada e cobre os dois casos de uma vez.
  it.each(TIPOS)('%s tem cor, icone, forma de impacto e pedra', (tipo) => {
    expect(TYPE_COLORS[tipo]).toMatch(/^#[0-9a-f]{6}$/i)
    expect(abilityIconUrl(tipo)).toBeTruthy()
    expect(IMPACT_SHAPE_BY_TYPE[tipo]).toBeTruthy()
    expect(STONE_TYPES).toContain(tipo)
    expect(stoneItemId(tipo)).toBe(`stone_${tipo.toLowerCase()}`)
  })

  it('todo tipo tem o golpe de area de nivel 50', () => {
    for (const tipo of TIPOS) {
      const chave = typedAoeMoveKey(tipo)
      expect(TYPED_AOE_MOVES[chave], `faltou ${chave}`).toBeTruthy()
      expect(TYPED_AOE_MOVES[chave].type).toBe(tipo)
    }
  })
})

describe('tabela de tipos da Gen VI+', () => {
  it('e 18x18, sem celula faltando', () => {
    expect(Object.keys(TYPE_CHART)).toHaveLength(18)
    for (const atacante of TIPOS) {
      for (const defensor of TIPOS) {
        const m = TYPE_CHART[atacante][defensor]
        expect(m, `${atacante} x ${defensor}`).toBeTypeOf('number')
        expect([0, 0.5, 1, 2]).toContain(m)
      }
    }
  })

  // As relacoes que a Gen VI introduziu, e que sao exatamente o que quebraria
  // em silencio se a tabela viesse do dado antigo: uma celula errada aqui muda
  // o dano de combate sem nenhum sintoma visivel.
  it('respeita as mudancas da Gen VI', () => {
    expect(getEffectiveness('DRAGON', 'FAIRY', null)).toBe(0)
    expect(getEffectiveness('FAIRY', 'DRAGON', null)).toBe(2)
    expect(getEffectiveness('FAIRY', 'DARK', null)).toBe(2)
    expect(getEffectiveness('FAIRY', 'FIGHTING', null)).toBe(2)
    expect(getEffectiveness('POISON', 'FAIRY', null)).toBe(2)
    expect(getEffectiveness('STEEL', 'FAIRY', null)).toBe(2)
    // Aco DEIXOU de resistir Fantasma e Sombrio na Gen VI. E a mudanca que
    // afeta especies que nao tem nada a ver com Fada (Steelix, Scizor,
    // Magneton) e por isso a mais facil de nao perceber.
    expect(getEffectiveness('GHOST', 'STEEL', null)).toBe(1)
    expect(getEffectiveness('DARK', 'STEEL', null)).toBe(1)
  })

  it('empilha os dois tipos do defensor', () => {
    // Fada x Dragao/Voador: 2x pelo Dragao, 1x pelo Voador.
    expect(getEffectiveness('FAIRY', 'DRAGON', 'FLYING')).toBe(2)
    // Dragao x qualquer coisa com Fada: imune, mesmo no slot 2.
    expect(getEffectiveness('DRAGON', 'WATER', 'FAIRY')).toBe(0)
  })
})

describe('integridade do catalogo', () => {
  it('todo golpe de todo moveset existe em ABILITIES_DATA', () => {
    const orfaos: string[] = []
    for (const especie of Object.values(SPECIES_DATA)) {
      for (const entrada of especie.abilities) {
        if (!ABILITIES_DATA[entrada.key]) orfaos.push(`${especie.id}:${entrada.key}`)
      }
    }
    expect(orfaos).toEqual([])
  })

  it('todo tipo de especie e de golpe e um dos 18', () => {
    for (const especie of Object.values(SPECIES_DATA)) {
      expect(TIPOS, especie.id).toContain(especie.type)
      if (especie.type2) expect(TIPOS, especie.id).toContain(especie.type2)
    }
    for (const golpe of Object.values(ABILITIES_DATA)) {
      expect(TIPOS, golpe.id).toContain(golpe.type)
    }
  })

  it('toda evolucao aponta para uma especie que existe', () => {
    for (const especie of Object.values(SPECIES_DATA)) {
      if (!especie.evolvesTo) continue
      expect(SPECIES_DATA[especie.evolvesTo], `${especie.id} -> ${especie.evolvesTo}`).toBeTruthy()
      expect(especie.evolvesAtLevel, especie.id).toBeGreaterThan(0)
    }
  })

  it('categoria de golpe e uma das tres reais, e status nunca causa dano', () => {
    for (const golpe of Object.values(ABILITIES_DATA)) {
      expect(['physical', 'special', 'status'], golpe.id).toContain(golpe.category)
      if (golpe.category === 'status') expect(golpe.power, golpe.id).toBe(0)
    }
  })

  it('existe golpe de area vindo do dado, nao so os de nivel 50', () => {
    // A lista de 6 chaves escrita a mao que `data/abilities.ts` usava
    // desatualizou em silencio quando `selfdestruct` virou `self_destruct`.
    // Agora o alvo vem do catalogo; se voltar a ser lista fixa, isto cai.
    const emArea = Object.values(ABILITIES_DATA).filter((g) => g.target === 'aoe' && g.power > 0)
    expect(emArea.length).toBeGreaterThan(20)
    expect(ABILITIES_DATA.self_destruct?.target).toBe('aoe')
    expect(ABILITIES_DATA.earthquake?.target).toBe('aoe')
  })

  it('a descricao da especie carrega o numero da Pokedex (regions.ts depende disso)', () => {
    for (const especie of Object.values(SPECIES_DATA)) {
      expect(especie.description, especie.id).toMatch(/Nº\s*\d+/)
    }
  })
})

describe('formulas da Geracao VII', () => {
  it('critico e 1/24 e multiplica por 1.5 (era 17/256 e 2x na Gen II)', () => {
    expect(engine.eval('CRIT_CHANCE')).toBeCloseTo(1 / 24, 10)
    expect(engine.eval('CRIT_MULTIPLIER')).toBe(1.5)
  })

  it('EXP_GAIN e a formula escalada: maxima no nivel empatado, decrescente acima dele', () => {
    const base = { baseExp: 100, level: 20 }
    const empatado = engine.eval('EXP_GAIN', { ...base, winnerLevel: 20 })
    const acima = engine.eval('EXP_GAIN', { ...base, winnerLevel: 60 })
    const abaixo = engine.eval('EXP_GAIN', { ...base, winnerLevel: 5 })
    // Empatado: o termo escalado vale 1, entao sobra baseExp*level/5 (+1).
    expect(empatado).toBe(Math.floor((100 * 20) / 5) + 1)
    expect(acima).toBeLessThan(empatado)
    // Abaixo do proprio nivel o termo passa de 1 — o jogo NAO limita isso, e a
    // formula real tambem nao.
    expect(abaixo).toBeGreaterThan(empatado)
  })

  it('a cadeia de captura da Gen VII cresce com a taxa e satura em 1', () => {
    const chance = (catchRate: number) => {
      const a = engine.eval('CATCH_MODIFIED_RATE', {
        hpMax: 100, hpAtual: 0, catchRate, ballMultiplier: 1, statusBonus: 1, catchMultiplier: 1,
      })
      const shakeProbability = engine.eval('CATCH_SHAKE_PROBABILITY', { a })
      return engine.eval('CATCH_CHANCE', { shakeProbability, shakes: engine.eval('CATCH_SHAKES') })
    }
    expect(chance(255)).toBe(1)
    expect(chance(45)).toBeGreaterThan(chance(3))
    expect(chance(255)).toBeGreaterThan(chance(45))
    expect(chance(3)).toBeGreaterThan(0)
  })

  it('alvo machucado e mais facil de capturar que alvo com vida cheia', () => {
    const taxa = (hpAtual: number) => engine.eval('CATCH_MODIFIED_RATE', {
      hpMax: 100, hpAtual, catchRate: 45, ballMultiplier: 1, statusBonus: 1, catchMultiplier: 1,
    })
    expect(taxa(0)).toBeGreaterThan(taxa(100))
  })

  it('as 6 curvas de experiencia sao crescentes, incluindo as por partes', () => {
    const curvas: GrowthCurve[] = ['FAST', 'MEDIUM_FAST', 'MEDIUM_SLOW', 'SLOW', 'ERRATIC', 'FLUCTUATING']
    for (const curva of curvas) {
      let anterior = -1
      for (let n = 1; n <= 100; n++) {
        const total = totalExpForLevel(n, curva)
        expect(Number.isFinite(total), `${curva} no nivel ${n}`).toBe(true)
        // Estritamente crescente a partir do nivel 2: uma curva que empatasse
        // deixaria dois niveis com o mesmo requisito e o level-up dispararia
        // dois de uma vez.
        if (n > 1) expect(total, `${curva} no nivel ${n}`).toBeGreaterThan(anterior)
        anterior = total
      }
    }
  })

  it('as curvas por partes batem com os valores publicados no nivel 100', () => {
    // Erratic e Fluctuating fecham em 600.000 e 1.640.000 no nivel 100. Sao os
    // dois numeros que provam que os ramos da funcao por partes foram
    // escolhidos nas fronteiras certas.
    expect(totalExpForLevel(100, 'ERRATIC')).toBe(600000)
    expect(totalExpForLevel(100, 'FLUCTUATING')).toBe(1640000)
    expect(totalExpForLevel(100, 'MEDIUM_FAST')).toBe(1000000)
    expect(totalExpForLevel(100, 'FAST')).toBe(800000)
    expect(totalExpForLevel(100, 'SLOW')).toBe(1250000)
    expect(totalExpForLevel(100, 'MEDIUM_SLOW')).toBe(1059860)
  })
})
