// Salas especiais (onda 2, 16/10/2026): sorteio proprio, fora da curva de
// profundidade, com 5% de chance durante o beta.
//
// O que estas guardas protegem, na ordem do estrago se quebrar:
//  - a primeira sala da sessao NUNCA e especial (sem isso, entrar e sair da hunt
//    vira uma maquina de 5% de graca);
//  - a chance e a constante declarada, e nao outra;
//  - a sala respeita o estagio minimo e so sai no bioma dela;
//  - o espelho do Pesadelo tambem tem as especiais, com encontro de verdade;
//  - o shiny do Lago da Furia multiplica so o Gyarados, e com teto;
//  - a Pedra tematica so existe em sala especial.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import {
  BIOMAS, BIOMA_POR_CHAVE, CHANCE_DE_SALA_ESPECIAL, MULTIPLICADOR_DE_SHINY_MAXIMO,
  SALA_ESPECIAL_POR_CHAVE, SUB_BIOMA_POR_CHAVE,
} from '@/data/biomas'
import { ESTAGIOS_POR_BIOMA, estagioId, niveisDoEstagio } from '@/data/estagios'
import { ELENCO_POR_ESTAGIO } from '@/data/generated/elencoPorEstagio.generated'
import { SUB_BIOMA_ESPECIES } from '@/data/generated/subBiomas.generated'
import { STONE_TYPES } from '@/data/stones'
import { createPokeInstance } from '@/data/pokes'
import { POOL_POR_SALA } from '@/data/huntSpawnOverrides'
import { getEncounter } from '@/data/enemies'
import { MAPS } from '@/data/maps'
import {
  contextoDeSpawn, ehSalaEspecial, novaSala, pedraTematicaDaSala, salasEspeciaisPossiveis,
  sortearSalaEspecial,
} from './salaSystem'

const TODAS = BIOMAS.flatMap((b) => (b.especiais ?? []).map((e) => ({ bioma: b, e })))

describe('catalogo das salas especiais', () => {
  it('sao 20, e todo bioma tem pelo menos uma', () => {
    expect(TODAS.length).toBe(20)
    // O Igneo so ganhou a dele quando a Mansao Pokemon (Cinnabar) saiu do
    // Industrial: ela e um laboratorio queimado numa ilha vulcanica.
    for (const bioma of BIOMAS) expect((bioma.especiais ?? []).length, bioma.chave).toBeGreaterThan(0)
  })

  it('chave unica, que nao colide com sub-bioma comum, e com tabela de elenco', () => {
    const comuns = new Set(BIOMAS.flatMap((b) => b.subBiomas.map((s) => s.chave)))
    for (const { e } of TODAS) {
      expect(comuns.has(e.chave), e.chave).toBe(false)
      expect(SUB_BIOMA_POR_CHAVE[e.chave]?.sub, e.chave).toBe(e)
      expect(ELENCO_POR_ESTAGIO[e.chave], e.chave).toBeDefined()
    }
  })

  it('estagio minimo de 1 a 10, Pedra de um tipo que existe, shiny com teto', () => {
    for (const { e } of TODAS) {
      expect(e.estagioMinimo, e.chave).toBeGreaterThanOrEqual(1)
      expect(e.estagioMinimo, e.chave).toBeLessThanOrEqual(ESTAGIOS_POR_BIOMA)
      if (e.pedra) expect(STONE_TYPES, e.chave).toContain(e.pedra)
      if (e.shiny) expect(e.shiny.multiplicador, e.chave).toBeLessThanOrEqual(MULTIPLICADOR_DE_SHINY_MAXIMO)
    }
  })
})

describe('sorteio da sala especial', () => {
  it('a primeira sala da sessao nunca e especial', () => {
    const mapId = estagioId('urbano', 5)
    for (let seed = 1; seed <= 2000; seed++) {
      expect(sortearSalaEspecial(createRng(seed), mapId, 0, 0)).toBeNull()
      expect(ehSalaEspecial(novaSala(createRng(seed), mapId, 0, 0))).toBe(false)
    }
  })

  it('sai na chance declarada, e so com sala do proprio bioma', () => {
    const mapId = estagioId('urbano', 5)
    const doBioma = new Set((BIOMA_POR_CHAVE['urbano'].especiais ?? []).map((e) => e.chave))
    const rng = createRng(4242)
    const N = 40000
    let especiais = 0
    for (let i = 0; i < N; i++) {
      const chave = sortearSalaEspecial(rng, mapId, 1, 0)
      if (chave) {
        especiais++
        expect(doBioma.has(chave), chave).toBe(true)
      }
    }
    const taxa = especiais / N
    expect(taxa).toBeGreaterThan(CHANCE_DE_SALA_ESPECIAL * 0.85)
    expect(taxa).toBeLessThan(CHANCE_DE_SALA_ESPECIAL * 1.15)
  })

  it('respeita o estagio minimo de cada sala', () => {
    for (const { bioma, e } of TODAS) {
      for (let estagio = 1; estagio <= ESTAGIOS_POR_BIOMA; estagio++) {
        const possiveis = salasEspeciaisPossiveis(estagioId(bioma.chave, estagio)).map((x) => x.chave)
        expect(possiveis.includes(e.chave), `${e.chave} no estagio ${estagio}`).toBe(estagio >= e.estagioMinimo)
      }
    }
  })

  it('o espelho do Pesadelo tem as mesmas salas especiais, com encontro de verdade', () => {
    for (const { bioma, e } of TODAS) {
      const espelho = `nightmare_${estagioId(bioma.chave, ESTAGIOS_POR_BIOMA)}`
      const pool = POOL_POR_SALA[espelho]?.[e.chave] ?? []
      expect(pool.length, `${espelho}/${e.chave}`).toBeGreaterThan(0)
      for (const id of pool) expect(getEncounter(id), id).toBeDefined()
      expect(salasEspeciaisPossiveis(espelho).map((x) => x.chave)).toContain(e.chave)
    }
  })

  it('a sala especial e COMPLETA: todo POKE dela nasce em qualquer estagio', () => {
    // Pedido do dono (16/10/2026): sem diferenca entre estagios. O Jardim
    // Misterioso tem Bulbasaur no estagio 10, e o Canion do Vovo tem Kabuto.
    for (const { bioma, e } of TODAS) {
      const esperado = [...(SUB_BIOMA_ESPECIES[e.chave] ?? [])].sort()
      expect(esperado.length, e.chave).toBeGreaterThan(0)
      for (let estagio = 1; estagio <= ESTAGIOS_POR_BIOMA; estagio++) {
        const mapId = estagioId(bioma.chave, estagio)
        const [lo, hi] = niveisDoEstagio(estagio)
        const pool = POOL_POR_SALA[mapId]?.[e.chave] ?? []
        const especies = [...new Set(pool.map((id) => getEncounter(id)!.speciesId))].sort()
        expect(especies, `${mapId}/${e.chave}`).toEqual(esperado)
        for (const id of pool) {
          expect(getEncounter(id)!.minLevel, id).toBe(lo)
          expect(getEncounter(id)!.maxLevel, id).toBe(hi)
        }
      }
    }
  })

  it('toda sala especial sorteavel tem encontro em todo indice de sala', () => {
    for (const { bioma, e } of TODAS) {
      for (let estagio = e.estagioMinimo; estagio <= ESTAGIOS_POR_BIOMA; estagio++) {
        const mapId = estagioId(bioma.chave, estagio)
        const ctx = contextoDeSpawn(mapId, niveisDoEstagio(estagio), { chave: e.chave, indice: 0, abates: 0, ciclos: 1 }, MAPS[mapId].enemyPool)
        expect(ctx.pool.length, `${mapId}/${e.chave}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('shiny e Pedra da sala especial', () => {
  it('o Lago da Furia multiplica o shiny so do Gyarados', () => {
    const mapId = estagioId('aguas_interiores', 5)
    const sala = { chave: 'lake-of-rage', indice: 1, abates: 0, ciclos: 0 }
    const ctx = contextoDeSpawn(mapId, niveisDoEstagio(5), sala, MAPS[mapId].enemyPool)
    expect(ctx.multiplicadorDeShiny?.('gyarados')).toBe(SALA_ESPECIAL_POR_CHAVE['lake-of-rage'].shiny!.multiplicador)
    expect(ctx.multiplicadorDeShiny?.('magikarp')).toBe(1)
    // Sala comum nao tem multiplicador.
    const comum = contextoDeSpawn(mapId, niveisDoEstagio(5), { chave: 'lake', indice: 1, abates: 0, ciclos: 0 }, MAPS[mapId].enemyPool)
    expect(comum.multiplicadorDeShiny).toBeUndefined()
  })

  it('o multiplicador muda a chance e nao a quantidade de sorteios', () => {
    // Mesma semente, com e sem multiplicador: o RNG tem que andar o mesmo tanto,
    // senao cliente e servidor se desencontram no proximo sorteio.
    const a = createRng(77)
    const b = createRng(77)
    createPokeInstance(a, 'gyarados', 40)
    createPokeInstance(b, 'gyarados', 40, { multiplicadorDeShiny: 10 })
    expect(a.draws).toBe(b.draws)
  })

  it('o multiplicador sobe a taxa de shiny na proporcao', () => {
    const contar = (mult: number) => {
      const rng = createRng(9)
      let n = 0
      for (let i = 0; i < 60000; i++) if (createPokeInstance(rng, 'gyarados', 40, { multiplicadorDeShiny: mult }).isShiny) n++
      return n
    }
    const normal = contar(1)
    const lago = contar(10)
    expect(lago / Math.max(1, normal)).toBeGreaterThan(6)
    expect(lago / Math.max(1, normal)).toBeLessThan(15)
  })

  it('a Pedra tematica so existe em sala especial', () => {
    expect(pedraTematicaDaSala(null)).toBeNull()
    expect(pedraTematicaDaSala({ chave: 'lake', indice: 0, abates: 0, ciclos: 0 })).toBeNull()
    expect(pedraTematicaDaSala({ chave: 'mt-moon', indice: 0, abates: 0, ciclos: 0 })).toBe('FAIRY')
  })
})
