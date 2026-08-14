// As regras de status contra os numeros da Gen VII.
//
// Cada bloco cita a regra que esta trancando. Sao numeros que a Bulbapedia
// define e que nao tem como um teste de tipo pegar: 1/16 e 1/8 sao os dois
// `number`, e trocar um pelo outro dobraria o dano de queimadura sem quebrar
// nada visivelmente.
import { describe, it, expect } from 'vitest'
import { createRng } from '@/core/rng'
import { SPECIES, type PokeInstance } from '@/data/pokes'
import {
  danoPorTurno, multiplicadorDeDanoFisico, multiplicadorDeVelocidade,
  podeReceberStatus, sortearDuracao, TURNOS_DE_IMUNIDADE_APOS_CURA,
} from '@/data/statusEffects'
import {
  aplicarStatus, curarStatus, tickStatus, tentarAgir, statusVaiPegar,
  aplicarEfeitosDoGolpe,
} from './statusSystem'
import { getAbility } from '@/data/abilities'
import type { WorldEntity } from '../types'

function poke(speciesId: string, hpMax = 160): PokeInstance {
  const species = SPECIES[speciesId]
  return {
    uid: `uid-${speciesId}`,
    speciesId,
    level: 50,
    isShiny: false,
    rarity: 'comum',
    exp: 0,
    ivs: { hp: 15, atkFis: 15, atkEsp: 15, def: 15, defEsp: 15, speed: 15 },
    stats: { hp: hpMax, atkFis: 100, atkEsp: 100, def: 100, defEsp: 100, speed: 100 },
    hp: hpMax,
    unlockedAbilities: species.abilities.map((a) => a.key),
    status: null,
  }
}

function entidade(speciesId: string, hpMax = 160): WorldEntity {
  return {
    id: `e-${speciesId}`,
    kind: 'enemy',
    poke: poke(speciesId, hpMax),
    statusVolatil: null,
    imunidadeDeStatus: 0,
    proximoTurnoDeStatus: 2,
  } as unknown as WorldEntity
}

describe('imunidade por tipo', () => {
  const casos: Array<[string, string, string]> = [
    ['burn', 'charmander', 'FIRE nao queima'],
    ['paralysis', 'pikachu', 'ELECTRIC nao paralisa'],
    ['poison', 'ekans', 'POISON nao envenena'],
    ['poison', 'magnemite', 'STEEL nao envenena'],
    ['freeze', 'articuno', 'ICE nao congela'],
  ]
  for (const [status, especie, motivo] of casos) {
    it(motivo, () => {
      const e = SPECIES[especie]
      expect(podeReceberStatus(status as never, { tipo1: e.type, tipo2: e.type2, statusAtual: null })).toBe(false)
    })
  }

  it('sono nao tem imunidade por tipo', () => {
    const e = SPECIES.charmander
    expect(podeReceberStatus('sleep', { tipo1: e.type, tipo2: e.type2, statusAtual: null })).toBe(true)
  })

  it('GRASS ignora golpe de po, mas nao golpe de sono comum', () => {
    const e = SPECIES.bulbasaur
    const alvo = { tipo1: e.type, tipo2: e.type2, statusAtual: null }
    expect(podeReceberStatus('sleep', alvo, 'sleep_powder')).toBe(false)
    expect(podeReceberStatus('sleep', alvo, 'hypnosis')).toBe(true)
  })
})

describe('numeros da Gen VII', () => {
  it('veneno tira 1/8 do HP maximo por turno', () => {
    expect(danoPorTurno('poison', 160)).toBe(20)
  })

  it('queimadura tira 1/16 do HP maximo por turno', () => {
    expect(danoPorTurno('burn', 160)).toBe(10)
  })

  it('dano de turno nunca arredonda pra zero', () => {
    // 1/16 de 10 e 0.625. Sem o piso, queimadura em POKE de nivel baixo nao
    // faria nada.
    expect(danoPorTurno('burn', 10)).toBe(1)
  })

  it('queimadura corta o dano fisico pela metade', () => {
    expect(multiplicadorDeDanoFisico('burn')).toBe(0.5)
  })

  it('paralisia corta a Velocidade pela metade (Gen VII, era 1/4 antes)', () => {
    expect(multiplicadorDeVelocidade('paralysis')).toBe(0.5)
  })

  it('veneno nao mexe em Velocidade nem em dano fisico', () => {
    expect(multiplicadorDeVelocidade('poison')).toBe(1)
    expect(multiplicadorDeDanoFisico('poison')).toBe(1)
  })

  it('sono dura de 2 a 4 turnos; confusao, de 2 a 5', () => {
    const rng = createRng(7)
    for (let i = 0; i < 200; i++) {
      const sono = sortearDuracao(rng, 'sleep')!
      expect(sono).toBeGreaterThanOrEqual(2)
      expect(sono).toBeLessThanOrEqual(4)
      const conf = sortearDuracao(rng, 'confusion')!
      expect(conf).toBeGreaterThanOrEqual(2)
      expect(conf).toBeLessThanOrEqual(5)
    }
  })

  it('veneno, queimadura e paralisia nao passam sozinhos', () => {
    const rng = createRng(3)
    for (const tipo of ['poison', 'burn', 'paralysis'] as const) {
      expect(sortearDuracao(rng, tipo)).toBeNull()
    }
  })
})

describe('aplicacao', () => {
  it('so cabe um status nao-volatil por vez', () => {
    const alvo = entidade('rattata')
    expect(aplicarStatus(createRng(1), alvo, 'poison', 100)).not.toBeNull()
    expect(aplicarStatus(createRng(2), alvo, 'burn', 100)).toBeNull()
    expect(alvo.poke.status?.tipo).toBe('poison')
  })

  it('confusao convive com status nao-volatil', () => {
    const alvo = entidade('rattata')
    aplicarStatus(createRng(1), alvo, 'poison', 100)
    expect(aplicarStatus(createRng(2), alvo, 'confusion', 100)).not.toBeNull()
    expect(alvo.poke.status?.tipo).toBe('poison')
    expect(alvo.statusVolatil?.tipo).toBe('confusion')
  })

  it('confusao nao empilha nem estende', () => {
    const alvo = entidade('rattata')
    aplicarStatus(createRng(1), alvo, 'confusion', 100)
    const turnos = alvo.statusVolatil!.turnosRestantes
    expect(aplicarStatus(createRng(2), alvo, 'confusion', 100)).toBeNull()
    expect(alvo.statusVolatil!.turnosRestantes).toBe(turnos)
  })

  it('curar liga a imunidade de reaplicacao, e ela bloqueia o proximo status', () => {
    const alvo = entidade('rattata')
    aplicarStatus(createRng(1), alvo, 'poison', 100)
    expect(curarStatus(alvo, 'poison')).toBe(true)
    expect(alvo.poke.status).toBeNull()
    expect(alvo.imunidadeDeStatus).toBeGreaterThan(0)
    expect(aplicarStatus(createRng(2), alvo, 'poison', 100)).toBeNull()
  })

  it('a imunidade expira e o status volta a pegar', () => {
    const alvo = entidade('rattata')
    aplicarStatus(createRng(1), alvo, 'poison', 100)
    curarStatus(alvo, 'poison')
    // 3 turnos de 2s = 6s. Passa o tempo em fatias.
    for (let i = 0; i < 40; i++) tickStatus(createRng(5), alvo, 0.2)
    expect(alvo.imunidadeDeStatus).toBe(0)
    expect(aplicarStatus(createRng(9), alvo, 'poison', 100)).not.toBeNull()
  })

  it('golpe de FIRE com dano descongela o alvo', () => {
    const alvo = entidade('rattata')
    aplicarStatus(createRng(1), alvo, 'freeze', 100)
    expect(alvo.poke.status?.tipo).toBe('freeze')
    aplicarEfeitosDoGolpe(createRng(2), alvo, getAbility('ember')!)
    expect(alvo.poke.status).toBeNull()
  })

  it('chance 0 nao aplica nada', () => {
    const alvo = entidade('rattata')
    expect(aplicarStatus(createRng(1), alvo, 'poison', 0)).toBeNull()
  })
})

describe('passagem do tempo', () => {
  it('veneno so cobra no fechamento do turno, nao a cada frame', () => {
    const alvo = entidade('rattata', 160)
    aplicarStatus(createRng(1), alvo, 'poison', 100)
    // 9 frames de 0.2s = 1.8s: ainda dentro do turno de 2s.
    let total = 0
    for (let i = 0; i < 9; i++) total += tickStatus(createRng(2), alvo, 0.2).dano
    expect(total).toBe(0)
    total += tickStatus(createRng(2), alvo, 0.2).dano
    expect(total).toBe(20)
  })

  it('sono conta os turnos e expira sozinho', () => {
    const alvo = entidade('rattata')
    aplicarStatus(createRng(1), alvo, 'sleep', 100)
    const turnos = alvo.poke.status!.turnosRestantes!
    for (let i = 0; i < turnos; i++) tickStatus(createRng(4), alvo, 2)
    expect(alvo.poke.status).toBeNull()
  })

  it('sono impede a acao enquanto dura', () => {
    const alvo = entidade('rattata')
    aplicarStatus(createRng(1), alvo, 'sleep', 100)
    expect(tentarAgir(createRng(3), alvo, () => 0).agir).toBe(false)
  })

  it('veneno NAO impede a acao', () => {
    const alvo = entidade('rattata')
    aplicarStatus(createRng(1), alvo, 'poison', 100)
    expect(tentarAgir(createRng(3), alvo, () => 0).agir).toBe(true)
  })

  it('congelamento sai por sorteio, nao por contador', () => {
    const alvo = entidade('rattata')
    aplicarStatus(createRng(1), alvo, 'freeze', 100)
    expect(alvo.poke.status!.turnosRestantes).toBeNull()
    // Com 20% por turno, 200 turnos praticamente garantem o descongelamento.
    const rng = createRng(11)
    let saiu = false
    for (let i = 0; i < 200 && !saiu; i++) {
      saiu = tickStatus(rng, alvo, 2).expirados.includes('freeze')
    }
    expect(saiu).toBe(true)
  })
})

describe('a IA so tenta status que vai pegar', () => {
  it('nao tenta paralisar um ELECTRIC', () => {
    expect(statusVaiPegar(entidade('pikachu'), 'paralysis', 'thunder_wave')).toBe(false)
  })

  it('nao tenta status em quem ja tem um', () => {
    const alvo = entidade('rattata')
    aplicarStatus(createRng(1), alvo, 'sleep', 100)
    expect(statusVaiPegar(alvo, 'paralysis', 'thunder_wave')).toBe(false)
  })

  it('nao tenta durante a janela de reaplicacao', () => {
    const alvo = entidade('rattata')
    aplicarStatus(createRng(1), alvo, 'poison', 100)
    curarStatus(alvo, 'poison')
    expect(statusVaiPegar(alvo, 'poison', 'toxic')).toBe(false)
  })

  it('tenta quando o alvo esta limpo e nao e imune', () => {
    expect(statusVaiPegar(entidade('rattata'), 'paralysis', 'thunder_wave')).toBe(true)
  })
})

describe('o desvio aprovado esta onde diz que esta', () => {
  it('a imunidade de reaplicacao dura os turnos declarados no status.json', () => {
    expect(TURNOS_DE_IMUNIDADE_APOS_CURA).toBe(3)
  })
})
