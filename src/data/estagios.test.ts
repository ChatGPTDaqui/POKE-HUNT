// PH-425: o modelo de estagio entra SEM CONSUMIDOR, entao estes testes sao a
// unica coisa que segura a regua e a curva de profundidade contra regressao
// silenciosa ate a PH-426/427 ligarem o arquivo no jogo.
import { describe, expect, it } from 'vitest'

import { BIOMAS, BIOMA_POR_CHAVE, type SubBiomaDef } from './biomas'
import {
  ALCANCE_PADRAO,
  ESTAGIOS,
  ESTAGIOS_POR_BIOMA,
  ESTAGIO_POR_ID,
  PERFIL_POR_SUB_BIOMA,
  SALAS_POR_BIOMA,
  SALAS_POR_ESTAGIO,
  TETO_DO_MODO_NORMAL,
  estagioId,
  estagioValido,
  niveisDoEstagio,
  parseEstagioId,
  pesosDoEstagio,
  pesosPorProfundidade,
  posicaoDoEstagio,
  salasDoEstagio,
  zonaMaximaDoEstagio,
} from './estagios'
import { ABATES_POR_SALA } from './biomas'

const TODOS_OS_ESTAGIOS = Array.from({ length: ESTAGIOS_POR_BIOMA }, (_, i) => i + 1)

describe('a regua de estagio', () => {
  it('da 55 salas e 1.650 abates por bioma', () => {
    expect(SALAS_POR_ESTAGIO).toEqual([3, 4, 4, 5, 5, 6, 6, 7, 7, 8])
    expect(SALAS_POR_BIOMA).toBe(55)
    expect(SALAS_POR_BIOMA * ABATES_POR_SALA).toBe(1650)
  })

  it('cobre Lv 1-100 com os 10 estagios contiguos e sem sobreposicao', () => {
    let anterior = 0
    for (const estagio of TODOS_OS_ESTAGIOS) {
      const [lo, hi] = niveisDoEstagio(estagio)
      expect(lo, `estagio ${estagio} nao comeca onde o anterior acabou`).toBe(anterior + 1)
      expect(hi).toBe(lo + 9)
      anterior = hi
    }
    expect(anterior).toBe(TETO_DO_MODO_NORMAL)
    expect(TETO_DO_MODO_NORMAL).toBe(100)
  })

  it('casa a zona maxima com a escala de spawnStrength (zona 0 = Lv 1-10)', () => {
    for (const estagio of TODOS_OS_ESTAGIOS) {
      const [lo, hi] = niveisDoEstagio(estagio)
      const zona = zonaMaximaDoEstagio(estagio)
      // A zona `z` cobre Lv `z*10+1` a `z*10+10` — a mesma janela do estagio.
      expect([zona * 10 + 1, zona * 10 + 10]).toEqual([lo, hi])
    }
    // A faixa1 antiga (Lv 1-30) ia ate a zona 2: o estagio 3 preserva isso.
    expect(zonaMaximaDoEstagio(3)).toBe(2)
  })

  it('rejeita estagio fora de 1..10 e nao inteiro', () => {
    expect(estagioValido(1)).toBe(true)
    expect(estagioValido(10)).toBe(true)
    expect(estagioValido(0)).toBe(false)
    expect(estagioValido(11)).toBe(false)
    expect(estagioValido(2.5)).toBe(false)
    expect(estagioValido(NaN)).toBe(false)
  })
})

describe('id de estagio', () => {
  it('vai e volta nos 120', () => {
    expect(ESTAGIOS.length).toBe(BIOMAS.length * ESTAGIOS_POR_BIOMA)
    expect(ESTAGIOS.length).toBe(120)
    for (const def of ESTAGIOS) {
      expect(def.id).toBe(estagioId(def.bioma, def.estagio))
      expect(parseEstagioId(def.id)).toEqual({ bioma: def.bioma, estagio: def.estagio })
      expect(ESTAGIO_POR_ID[def.id]).toBe(def)
    }
    expect(Object.keys(ESTAGIO_POR_ID).length).toBe(120)
  })

  it('sobrevive a chave de bioma com underline', () => {
    // `campo_aberto` e `aguas_interiores` sao a razao de o parse nao poder ser
    // um `split('_')`.
    expect(parseEstagioId('campo_aberto_e1')).toEqual({ bioma: 'campo_aberto', estagio: 1 })
    expect(parseEstagioId('aguas_interiores_e10')).toEqual({
      bioma: 'aguas_interiores',
      estagio: 10,
    })
  })

  it('nao confunde mapId que nao e estagio de bioma', () => {
    // Hunt inicial, BOSS, faixa antiga: nenhum pode virar estagio por engano.
    expect(parseEstagioId('route_46')).toBeNull()
    expect(parseEstagioId('boss_articuno')).toBeNull()
    expect(parseEstagioId('campo_aberto_faixa1')).toBeNull()
    // O prefixo do Modo Pesadelo casaria com o padrao e inventaria o bioma
    // `nightmare_marinho` se o parse nao validasse a chave contra BIOMAS.
    expect(parseEstagioId('nightmare_marinho_e7')).toBeNull()
    // Estagio fora da regua nao vira sessao valida.
    expect(parseEstagioId('marinho_e0')).toBeNull()
    expect(parseEstagioId('marinho_e11')).toBeNull()
    expect(parseEstagioId('bioma_que_nao_existe_e3')).toBeNull()
  })
})

describe('peso de sub-bioma por estagio', () => {
  it('tem perfil declarado pros 33 sub-biomas, e nenhum sobrando', () => {
    const doJogo = new Set(BIOMAS.flatMap((b) => b.subBiomas.map((s) => s.chave)))
    expect(doJogo.size).toBe(33)
    for (const chave of doJogo) {
      expect(PERFIL_POR_SUB_BIOMA[chave], `sub-bioma ${chave} sem perfil`).toBeTruthy()
    }
    for (const chave of Object.keys(PERFIL_POR_SUB_BIOMA)) {
      expect(doJogo.has(chave), `perfil orfao: ${chave}`).toBe(true)
    }
  })

  it('so declara profundidade em 0..1 e pico positivo', () => {
    for (const [chave, perfil] of Object.entries(PERFIL_POR_SUB_BIOMA)) {
      expect(perfil.profundidade, chave).toBeGreaterThanOrEqual(0)
      expect(perfil.profundidade, chave).toBeLessThanOrEqual(1)
      expect(perfil.pico, chave).toBeGreaterThan(0)
    }
  })

  it('soma 1 em todo estagio de todo bioma', () => {
    for (const bioma of BIOMAS) {
      for (const estagio of TODOS_OS_ESTAGIOS) {
        const pesos = pesosDoEstagio(bioma, estagio)
        expect(Object.keys(pesos).length, `${bioma.chave} e${estagio}`).toBe(
          bioma.subBiomas.length,
        )
        const soma = Object.values(pesos).reduce((a, b) => a + b, 0)
        expect(soma, `${bioma.chave} e${estagio} soma ${soma}`).toBeCloseTo(1, 10)
        for (const [sub, p] of Object.entries(pesos)) {
          expect(Number.isFinite(p), `${bioma.chave} e${estagio} ${sub} = ${p}`).toBe(true)
          expect(p).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('todo sub-bioma aparece em pelo menos um estagio', () => {
    // Sem isto um perfil mal posto some do jogo inteiro em silencio: o
    // sub-bioma continua no `BIOMAS`, com arte e loot, e nunca e sorteado.
    for (const bioma of BIOMAS) {
      for (const sub of bioma.subBiomas) {
        const maior = Math.max(
          ...TODOS_OS_ESTAGIOS.map((e) => pesosDoEstagio(bioma, e)[sub.chave]),
        )
        expect(maior, `${sub.chave} nunca e sorteado`).toBeGreaterThan(0)
      }
    }
  })

  it('afunda o Marinho: Praia zera no estagio 10 e o Leito Oceanico domina', () => {
    const marinho = BIOMA_POR_CHAVE['marinho']
    const primeiro = pesosDoEstagio(marinho, 1)
    const ultimo = pesosDoEstagio(marinho, 10)

    // Estagio 1: a costa e o mapa, o fundo nao existe.
    expect(primeiro['beach']).toBeGreaterThan(0)
    expect(primeiro['sea']).toBeGreaterThan(0)
    expect(primeiro['seabed']).toBe(0)

    // Estagio 10: a Praia sumiu e o Leito e maioria.
    expect(ultimo['beach']).toBe(0)
    expect(ultimo['seabed']).toBeGreaterThan(0.5)
    expect(ultimo['seabed']).toBeGreaterThan(ultimo['sea'])
  })

  it('e monotonico do raso pro fundo no Marinho', () => {
    // A Praia so pode cair e o Leito so pode subir — se a curva oscilar, a
    // trilha do menu conta uma historia que a sala nao cumpre.
    const marinho = BIOMA_POR_CHAVE['marinho']
    const praia = TODOS_OS_ESTAGIOS.map((e) => pesosDoEstagio(marinho, e)['beach'])
    const leito = TODOS_OS_ESTAGIOS.map((e) => pesosDoEstagio(marinho, e)['seabed'])
    for (let i = 1; i < praia.length; i++) {
      expect(praia[i]).toBeLessThanOrEqual(praia[i - 1] + 1e-12)
      expect(leito[i]).toBeGreaterThanOrEqual(leito[i - 1] - 1e-12)
    }
  })

  it('da 100% ao sub-bioma unico do Igneo nos 10 estagios', () => {
    const igneo = BIOMA_POR_CHAVE['igneo']
    expect(igneo.subBiomas.length).toBe(1)
    for (const estagio of TODOS_OS_ESTAGIOS) {
      expect(pesosDoEstagio(igneo, estagio)['volcano']).toBeCloseTo(1, 10)
    }
  })

  it('posiciona o estagio 1 em 0 e o 10 em 1', () => {
    expect(posicaoDoEstagio(1)).toBe(0)
    expect(posicaoDoEstagio(10)).toBe(1)
    expect(posicaoDoEstagio(5)).toBeCloseTo(4 / 9, 12)
  })

  it('cai no peso base em vez de dividir por zero quando todos zeram', () => {
    // Caso degenerado sintetico: dois sub-biomas rasos consultados no fundo do
    // bioma. Sem o fallback isto seria 0/0 = NaN em todos os pesos, e a sala
    // nunca sortearia nada.
    const rasos: SubBiomaDef[] = [
      { chave: 'beach', nome: 'Praia', peso: 6, loot: 'basico' },
      { chave: 'town', nome: 'Vilarejo', peso: 2, loot: 'basico' },
    ]
    const pesos = pesosPorProfundidade(rasos, 1)
    expect(pesos['beach'] + pesos['town']).toBeCloseTo(1, 10)
    expect(pesos['beach']).toBeCloseTo(6 / 8, 10)
    expect(pesos['town']).toBeCloseTo(2 / 8, 10)
  })

  it('reparte igual quando nem o peso base existe', () => {
    const semPeso: SubBiomaDef[] = [
      { chave: 'beach', nome: 'Praia', peso: 0, loot: 'basico' },
      { chave: 'town', nome: 'Vilarejo', peso: 0, loot: 'basico' },
    ]
    const pesos = pesosPorProfundidade(semPeso, 1)
    expect(pesos['beach']).toBeCloseTo(0.5, 10)
    expect(pesos['town']).toBeCloseTo(0.5, 10)
  })

  it('sub-bioma sem perfil declarado nao some do jogo', () => {
    const inedito: SubBiomaDef[] = [
      { chave: 'sub_bioma_novo_sem_perfil', nome: 'Novo', peso: 5, loot: 'basico' },
      { chave: 'beach', nome: 'Praia', peso: 6, loot: 'basico' },
    ]
    for (const estagio of TODOS_OS_ESTAGIOS) {
      const pesos = pesosPorProfundidade(inedito, posicaoDoEstagio(estagio))
      expect(pesos['sub_bioma_novo_sem_perfil'], `estagio ${estagio}`).toBeGreaterThan(0)
    }
  })

  it('mantem o alcance padrao em 0,75', () => {
    // O numero decide se o bioma afunda ou vira corredor de salas exclusivas.
    // Trancado aqui pra a mudanca ser deliberada.
    expect(ALCANCE_PADRAO).toBe(0.75)
  })
})

describe('ESTAGIOS', () => {
  it('carrega a regua e os pesos ja resolvidos nos 120', () => {
    for (const def of ESTAGIOS) {
      expect(def.niveis).toEqual(niveisDoEstagio(def.estagio))
      expect(def.zonaMaxima).toBe(zonaMaximaDoEstagio(def.estagio))
      expect(def.salas).toBe(salasDoEstagio(def.estagio))
      const soma = Object.values(def.pesosDeSubBioma).reduce((a, b) => a + b, 0)
      expect(soma, def.id).toBeCloseTo(1, 10)
    }
  })

  it('cobre os 12 biomas com 10 estagios cada', () => {
    for (const bioma of BIOMAS) {
      const doBioma = ESTAGIOS.filter((e) => e.bioma === bioma.chave)
      expect(doBioma.length, bioma.chave).toBe(ESTAGIOS_POR_BIOMA)
      expect(doBioma.map((e) => e.estagio)).toEqual(TODOS_OS_ESTAGIOS)
    }
  })
})
