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
  podeReceberStatus, sortearDuracao, TURNOS_DE_IMUNIDADE_APOS_CURA, multiplicadorDeEstagio,
} from '@/data/statusEffects'
import {
  aplicarStatus, curarStatus, tickStatus, tentarAgir, statusVaiPegar,
  aplicarEfeitosDoGolpe, aplicarMudancasDeStat, limparEstadoVolatil,
} from './statusSystem'
import { getAbility, ABILITIES } from '@/data/abilities'
import type { WorldEntity } from '../types'
import type { StatusCondition } from '@/data/statusEffects'

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
    estagios: {},
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

describe('o caminho do GOLPE aplica os seis status', () => {
  // Observando uma hora de hunt em seis mapas diferentes, cinco dos seis status
  // apareceram sozinhos; congelamento nao. Nao por bug — sao 6 golpes no
  // catalogo inteiro, quase todos com 10% de chance secundaria, e o alvo
  // precisa nao ser ICE. Este teste cobre o que a sorte nao cobriu: percorre o
  // catalogo, acha um golpe real para CADA status e confere que o caminho
  // completo (`aplicarEfeitosDoGolpe`) aplica.
  const TIPOS: StatusCondition[] = ['poison', 'burn', 'paralysis', 'sleep', 'freeze', 'confusion']

  for (const tipo of TIPOS) {
    it(`${tipo}: existe golpe no catalogo e ele aplica`, () => {
      const golpe = Object.values(ABILITIES).find((a) => a.status === tipo)
      expect(golpe, `nenhum golpe causa ${tipo}`).toBeTruthy()

      // Alvo escolhido pra nao ser imune ao status em teste. Rattata e NORMAL
      // puro: nao resiste a nenhum dos seis.
      const alvo = entidade('rattata')
      // A chance real do golpe pode ser 10%; o que se testa aqui e o CAMINHO,
      // nao o sorteio (a chance ja tem teste proprio). Forca 100%.
      const forcado = { ...golpe!, statusChance: 100 }
      const aplicado = aplicarEfeitosDoGolpe(createRng(1), alvo, forcado)

      expect(aplicado?.tipo).toBe(tipo)
      const guardado = tipo === 'confusion' ? alvo.statusVolatil : alvo.poke.status
      expect(guardado?.tipo).toBe(tipo)
    })
  }
})

describe('golpes de tick volatil novos (leech_seed/curse/nightmare/ingrain/aqua_ring)', () => {
  it('leech_seed tira 1/8 do HP maximo do alvo e devolve quem drenar', () => {
    const alvo = entidade('rattata', 160)
    alvo.seeded = { sourceId: 'origem-1' }
    const r = tickStatus(createRng(1), alvo, 2)
    expect(r.dano).toBe(20) // 160/8
    expect(r.drenoParaOrigem).toEqual({ sourceId: 'origem-1', amount: 20 })
  })

  it('curseDot tira 1/4 do HP maximo por turno, sem timer (continua ligado)', () => {
    const alvo = entidade('rattata', 160)
    alvo.curseDot = true
    const r = tickStatus(createRng(1), alvo, 2)
    expect(r.dano).toBe(40) // 160/4
    expect(alvo.curseDot).toBe(true) // so sai quando o alvo desmaiar/a batalha acabar
  })

  it('nightmareDot so causa dano enquanto o alvo estiver com status sleep', () => {
    const acordado = entidade('rattata', 160)
    acordado.nightmareDot = true
    expect(tickStatus(createRng(1), acordado, 2).dano).toBe(0)

    const dormindo = entidade('rattata', 160)
    dormindo.nightmareDot = true
    aplicarStatus(createRng(1), dormindo, 'sleep', 100)
    expect(tickStatus(createRng(1), dormindo, 2).dano).toBe(40) // 160/4
  })

  it('regenPercent (Ingrain/Aqua Ring, mesmo campo pros dois) cura 1/16 do HP maximo por turno', () => {
    const alvo = entidade('rattata', 160)
    alvo.poke.hp = 100
    alvo.regenPercent = 1 / 16
    tickStatus(createRng(1), alvo, 2)
    expect(alvo.poke.hp).toBe(110) // 100 + 160/16
  })

  it('limparEstadoVolatil zera os quatro campos novos junto com statusVolatil/estagios', () => {
    const e = entidade('rattata')
    e.seeded = { sourceId: 'x' }
    e.curseDot = true
    e.nightmareDot = true
    e.regenPercent = 1 / 16
    limparEstadoVolatil(e)
    expect(e.seeded).toBeUndefined()
    expect(e.curseDot).toBeUndefined()
    expect(e.nightmareDot).toBeUndefined()
    expect(e.regenPercent).toBeUndefined()
  })
})

describe('estagios de atributo', () => {
  it('a formula e a assimetrica dos jogos, nao 1 + n/2', () => {
    // +1 da 1.5x mas -1 da 0.67x, nao 0.5x. Usar a simetrica "obvia" tornaria
    // debuff bem mais forte do que e — em -6 daria 0 (alvo imortal) em vez de
    // 0.25.
    expect(multiplicadorDeEstagio(0)).toBe(1)
    expect(multiplicadorDeEstagio(1)).toBeCloseTo(1.5)
    expect(multiplicadorDeEstagio(2)).toBe(2)
    expect(multiplicadorDeEstagio(6)).toBe(4)
    expect(multiplicadorDeEstagio(-1)).toBeCloseTo(2 / 3)
    expect(multiplicadorDeEstagio(-2)).toBe(0.5)
    expect(multiplicadorDeEstagio(-6)).toBe(0.25)
  })

  it('nao passa de +6 nem de -6, mesmo com estagio absurdo', () => {
    expect(multiplicadorDeEstagio(99)).toBe(4)
    expect(multiplicadorDeEstagio(-99)).toBe(0.25)
  })

  it('Danca das Espadas sobe o Ataque de QUEM USOU, nao do alvo', () => {
    const atacante = entidade('rattata')
    const alvo = entidade('pidgey')
    const aplicadas = aplicarMudancasDeStat(createRng(1), atacante, alvo, getAbility('swords_dance')!)
    expect(aplicadas).toHaveLength(1)
    expect(atacante.estagios.atkFis).toBe(2)
    expect(alvo.estagios.atkFis).toBeUndefined()
  })

  it('Rosnado baixa o Ataque do ALVO', () => {
    const atacante = entidade('rattata')
    const alvo = entidade('pidgey')
    aplicarMudancasDeStat(createRng(1), atacante, alvo, getAbility('growl')!)
    expect(alvo.estagios.atkFis).toBe(-1)
    expect(atacante.estagios.atkFis).toBeUndefined()
  })

  it('no teto de +6 o golpe nao reporta mudanca nenhuma', () => {
    const atacante = entidade('rattata')
    const alvo = entidade('pidgey')
    atacante.estagios.atkFis = 6
    expect(aplicarMudancasDeStat(createRng(1), atacante, alvo, getAbility('swords_dance')!)).toEqual([])
  })

  it('fim de batalha zera estagio e confusao, mas NAO o status nao-volatil', () => {
    const e = entidade('rattata')
    e.estagios.atkFis = -4
    aplicarStatus(createRng(1), e, 'confusion', 100)
    aplicarStatus(createRng(2), e, 'poison', 100)

    limparEstadoVolatil(e)

    expect(e.estagios).toEqual({})
    expect(e.statusVolatil).toBeNull()
    // Veneno sobrevive a batalha nos jogos — e por isso que existe Antidoto.
    expect(e.poke.status?.tipo).toBe('poison')
  })
})

describe('o desvio aprovado esta onde diz que esta', () => {
  it('a imunidade de reaplicacao dura os turnos declarados no status.json', () => {
    expect(TURNOS_DE_IMUNIDADE_APOS_CURA).toBe(3)
  })
})
