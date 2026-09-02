// PH-259 — a hunt inicial parou de ser um mapa vazio com um bicho no fim dele.
//
// O relato: "tem pouco pokemon e o POKE precisa andar muito ate chegar no
// proximo inimigo". Medindo com o motor headless
// (scripts/harness/spawn-da-hunt-inicial.mjs, 20 sementes por configuracao), o
// POKE passava 52% do tempo andando.
//
// A correcao tem duas metades, e a segunda e a que precisa de teste:
//
//  1. `spawnDistancia: [150, 350]` — o selvagem nasce mais perto. Sozinho, isso
//     rendeu +17% de abates sem mexer na mortalidade.
//  2. `maxEnemiesPorNivel` — o campo enche conforme o POKE cresce. E aqui que
//     mora o risco de regressao: o numero fixo de 1 inimigo foi MEDIDO contra o
//     servidor real pra impedir a morte de conta nova no primeiro minuto (6
//     inimigos matavam 10/10, 2 matavam 4/10). Se os degraus escorregarem e o
//     POKE Lv1 encontrar dois selvagens, essa medicao volta a valer contra nos.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { STARTER_HUNT_ID } from '@/data/huntSpawnOverrides'
import { MAX_INIMIGOS_HUNT_INICIAL } from '@/data/biomas'
import { getMap } from '@/data/maps'
import { WILD_AGGRO_RADIUS } from '@/data/huntTypes'
import { buildMapWorld, limiteDeInimigos } from './simulation'

const HUNT_DE_BIOMA = 'mata_e1'

function mundoDaInicial(nivel: number, semente: number) {
  const rng = createRng(semente)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const poke = createPokeInstance(rng, 'charmander', nivel)
  return buildMapWorld(STARTER_HUNT_ID, poke, { seed: semente, rng, counters })
}

describe('limiteDeInimigos (PH-259)', () => {
  it('hunt sem degraus responde `maxEnemies`, para qualquer nivel', () => {
    const mapa = getMap(HUNT_DE_BIOMA)!
    expect(mapa.maxEnemiesPorNivel).toBeUndefined()
    expect(limiteDeInimigos(mapa, { level: 1 })).toBe(mapa.maxEnemies)
    expect(limiteDeInimigos(mapa, { level: 60 })).toBe(mapa.maxEnemies)
  })

  it('sem POKE em campo cai no `maxEnemies` — o lado seguro e o menor', () => {
    // Acontece na construcao do mundo antes de o jogador existir. Escolher o
    // teto alto ali encheria o campo pra um POKE que ainda nem entrou.
    const inicial = getMap(STARTER_HUNT_ID)!
    expect(limiteDeInimigos(inicial, null)).toBe(MAX_INIMIGOS_HUNT_INICIAL)
  })

  it('na hunt inicial o limite sobe com o nivel, e o Lv1 continua com um so', () => {
    const inicial = getMap(STARTER_HUNT_ID)!
    // Lv1 e Lv2 sao a janela em que conta nova morre. Este e o caso que a
    // medicao contra o servidor real protege.
    expect(limiteDeInimigos(inicial, { level: 1 })).toBe(1)
    expect(limiteDeInimigos(inicial, { level: 2 })).toBe(1)
    expect(limiteDeInimigos(inicial, { level: 3 })).toBe(2)
    expect(limiteDeInimigos(inicial, { level: 4 })).toBe(2)
    expect(limiteDeInimigos(inicial, { level: 5 })).toBe(3)
    // Acima do ultimo degrau o valor dele continua valendo — nao volta ao base.
    expect(limiteDeInimigos(inicial, { level: 40 })).toBe(3)
  })
})

describe('o campo da hunt inicial acompanha o nivel (PH-259)', () => {
  it('POKE Lv1 entra e encontra UM selvagem', () => {
    for (let semente = 1; semente <= 5; semente++) {
      expect(mundoDaInicial(1, semente).enemies.length).toBe(1)
    }
  })

  it('POKE Lv5 entra e encontra tres', () => {
    for (let semente = 1; semente <= 5; semente++) {
      expect(mundoDaInicial(5, semente).enemies.length).toBe(3)
    }
  })

  it('com mais de um em campo, eles nascem alem do raio de aggro um do outro', () => {
    // A folga padrao (170) e MENOR que o raio de aggro (175): dois vizinhos
    // notariam o jogador no mesmo instante, que e exatamente o que a medicao
    // antiga registrou como morte de conta nova. Por isso a hunt inicial pede
    // folga propria.
    const inicial = getMap(STARTER_HUNT_ID)!
    expect(inicial.spawnEntreInimigos).toBeGreaterThan(WILD_AGGRO_RADIUS)

    // Melhor esforco: `randomSpawnPoint` nao PROMETE a folga (num corredor
    // apertado ela cede pro cone de visao), entao o teste mede a mediana em vez
    // de exigir o minimo em toda semente — exigir garantia aqui seria trancar
    // uma promessa que o motor nunca fez.
    const distancias: number[] = []
    for (let semente = 1; semente <= 20; semente++) {
      const enemies = mundoDaInicial(5, semente).enemies
      for (let i = 0; i < enemies.length; i++) {
        for (let j = i + 1; j < enemies.length; j++) {
          distancias.push(Math.hypot(enemies[i].x - enemies[j].x, enemies[i].y - enemies[j].y))
        }
      }
    }
    distancias.sort((a, b) => a - b)
    const mediana = distancias[Math.floor(distancias.length / 2)]
    expect(mediana).toBeGreaterThan(WILD_AGGRO_RADIUS)
  })

  it('o selvagem nasce mais perto do que a distancia padrao de outras hunts', () => {
    const inicial = getMap(STARTER_HUNT_ID)!
    const deBioma = getMap(HUNT_DE_BIOMA)!
    // A faixa padrao (250-550) e o que fazia o POKE atravessar o mapa entre um
    // abate e o proximo. Ela continua valendo em toda hunt de bioma.
    expect(deBioma.spawnDistancia).toBeUndefined()
    expect(inicial.spawnDistancia).toBeTruthy()
    expect(inicial.spawnDistancia![1]).toBeLessThan(550)
  })
})
