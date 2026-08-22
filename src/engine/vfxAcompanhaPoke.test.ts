// BUG REAL RELATADO PELO USUARIO (PH-77): "o pokemon andava mas a sprite de
// ataque dele ficava para tras".
//
// A arte de golpe (`abilityEffect`) nasce com as coordenadas da entidade
// congeladas no instante em que o hit pousa, e vive de 1,0 a 1,2 segundos. Um
// POKE andando cobre uma distancia bem visivel nesse tempo, entao a arte fica
// plantada onde ele estava. Os efeitos de TEXTO ja nao tinham o problema: eles
// guardam `ownerId` e o desenho resolve a ancora na entidade viva todo frame
// (sprites.ts#effectAnchor). Faltava o equivalente pra arte.
//
// A correcao translada o efeito pelo DESLOCAMENTO da entidade a cada tick, em
// vez de reancorar por offset fixo — assim `x`/`y` e `targetX`/`targetY` andam
// juntos sem o motor precisar saber o que cada um significa em cada tipo de
// efeito.
import { describe, expect, it } from 'vitest'

import { createWorldEffect, seguirDono } from './effect'
import type { BaseEntity, WorldCounters } from './types'

function contadores(): WorldCounters {
  return { entity: 1, effect: 1, pendingHit: 1 }
}

// So a parte de BaseEntity que o acompanhamento le. O cast evita montar um
// POKE inteiro pra testar duas coordenadas.
function entidade(id: string, x: number, y: number): BaseEntity {
  return { id, x, y } as unknown as BaseEntity
}

function efeitoDeGolpe(seguir: BaseEntity | null) {
  return createWorldEffect(contadores(), {
    type: 'abilityEffect',
    x: 100, y: 200,
    targetX: 100, targetY: 200 - 18, // o `-radius * 0.6` dos call-sites reais
    seguir,
  })
}

describe('arte de golpe acompanha quem ela marca', () => {
  it('anda o mesmo tanto que a entidade andou', () => {
    const poke = entidade('player', 100, 200)
    const efeito = efeitoDeGolpe(poke)

    poke.x = 140
    poke.y = 230
    seguirDono(efeito, poke)

    expect(efeito.x).toBe(140)
    expect(efeito.y).toBe(230)
    // A folga vertical de 18 sobrevive: o efeito translada, nao reancora.
    expect(efeito.targetX).toBe(140)
    expect(efeito.targetY).toBe(212)
  })

  it('varios ticks somam, sem drift', () => {
    const poke = entidade('player', 100, 200)
    const efeito = efeitoDeGolpe(poke)

    for (let i = 0; i < 10; i++) {
      poke.x += 3.5
      seguirDono(efeito, poke)
    }

    expect(efeito.x).toBeCloseTo(135, 6)
    expect(efeito.targetX).toBeCloseTo(135, 6)
  })

  it('entidade parada nao mexe no efeito', () => {
    const poke = entidade('player', 100, 200)
    const efeito = efeitoDeGolpe(poke)
    seguirDono(efeito, poke)
    expect(efeito.x).toBe(100)
    expect(efeito.targetY).toBe(182)
  })

  it('entidade que sumiu do mundo deixa o efeito onde estava', () => {
    // O alvo morre e sai de `world.enemies` no meio da animacao. Nao pode
    // sumir com a arte nem joga-la pra origem do mundo.
    const alvo = entidade('enemy-3', 100, 200)
    const efeito = efeitoDeGolpe(alvo)

    alvo.x = 160
    seguirDono(efeito, alvo)
    seguirDono(efeito, null)
    seguirDono(efeito, null)

    expect(efeito.x).toBe(160)
    expect(efeito.targetX).toBe(160)
  })

  it('efeito sem `seguir` fica congelado — texto flutuante nao muda de caminho', () => {
    const poke = entidade('player', 100, 200)
    const efeito = efeitoDeGolpe(null)

    poke.x = 500
    seguirDono(efeito, poke)

    expect(efeito.seguirId).toBeUndefined()
    expect(efeito.x).toBe(100)
    expect(efeito.targetX).toBe(100)
  })

  it('acompanhar NAO reserva raia de texto', () => {
    // `owner` empurra numero de dano e nome de golpe pra cima (claimEffectLane).
    // `seguir` nao pode fazer isso: sao dois mecanismos distintos.
    const poke = entidade('player', 100, 200)
    poke.effectLanes = []
    const efeito = efeitoDeGolpe(poke)

    expect(efeito.ownerId).toBeNull()
    expect(efeito.lane).toBe(0)
    expect(poke.effectLanes).toHaveLength(0)
  })
})
