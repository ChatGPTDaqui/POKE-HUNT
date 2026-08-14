// Salas: a hunt e percorrida em 10 sub-biomas sorteados, e limpar a quota de
// abates leva pra proxima.
//
// Toda falha aqui e silenciosa. Uma sala que nao avanca deixa o jogador no
// mesmo sub-bioma pra sempre e nada no jogo denuncia; um pool de sala ignorado
// faz o spawn voltar a ser o da hunt inteira e a feature simplesmente nao
// existe, tambem sem erro. Foi assim que o `sequenceIndex` do Campeao Lance
// ficou quebrado por levas.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld } from './simulation'
import { janelaDaSala, poolAtivo, registrarAbate, temSalas } from './systems/salaSystem'
import { POOL_POR_SALA } from '@/data/huntSpawnOverrides'
import { ABATES_POR_SALA, SALAS_POR_HUNT } from '@/data/biomas'
import { ENCOUNTERS } from '@/data/huntSpawnOverrides'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { WorldState } from './types'

const HUNT = 'mata_faixa1'

function mundo(semente: number, mapa = HUNT): WorldState {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', 20)
  return buildMapWorld(mapa, poke, {
    rng: createRng(semente),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
}

/** Conta abates direto, sem esperar o combate — o alvo aqui e a maquina de salas. */
function abater(world: WorldState, quantos: number) {
  const eventos = []
  for (let i = 0; i < quantos; i++) eventos.push(registrarAbate(world, world.mapDef!.id))
  return eventos
}

describe('salas', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('hunt de bioma nasce dentro de uma sala; inicial e BOSS nao tem sala', () => {
    expect(temSalas(HUNT)).toBe(true)
    expect(temSalas('route_46')).toBe(false)
    expect(temSalas('boss_lance')).toBe(false)

    const world = mundo(1)
    expect(world.sala).not.toBeNull()
    expect(world.sala!.indice).toBe(0)
    expect(world.sala!.abates).toBe(0)
    expect(world.sala!.ciclos).toBe(0)
    expect(POOL_POR_SALA[HUNT][world.sala!.chave]).toBeTruthy()

    expect(mundo(1, 'route_46').sala).toBeNull()
    expect(mundo(1, 'boss_lance').sala).toBeNull()
  })

  it('a sala avanca exatamente na quota de abates, nao antes', () => {
    const world = mundo(2)
    const antes = world.sala!.chave

    const parciais = abater(world, ABATES_POR_SALA - 1)
    expect(parciais.every((e) => !e.avancou)).toBe(true)
    expect(world.sala!.indice).toBe(0)
    expect(world.sala!.abates).toBe(ABATES_POR_SALA - 1)

    const [ultimo] = abater(world, 1)
    expect(ultimo.avancou).toBe(true)
    expect(ultimo.fechouCiclo).toBe(false)
    expect(world.sala!.indice).toBe(1)
    expect(world.sala!.abates).toBe(0)
    // A sala nova pode calhar de ser o mesmo sub-bioma (o sorteio e com
    // reposicao); o que nao pode e o contador nao zerar.
    expect(typeof world.sala!.chave).toBe('string')
    expect(antes).toBeTruthy()
  })

  it('fechar as 10 salas reinicia o ciclo em vez de acabar a hunt', () => {
    const world = mundo(3)
    // Um ciclo inteiro menos o ultimo abate.
    const eventos = abater(world, ABATES_POR_SALA * SALAS_POR_HUNT)
    const fechamentos = eventos.filter((e) => e.fechouCiclo)

    expect(fechamentos.length).toBe(1)
    expect(world.sala!.indice).toBe(0)
    expect(world.sala!.ciclos).toBe(1)
    // "Acabar a hunt" faria 6 horas de farm offline valerem os poucos minutos
    // ate a sala 10.
    expect(world.sala).not.toBeNull()
  })

  it('so nasce inimigo do pool da sala atual', () => {
    const world = mundo(4)
    const daSala = new Set(POOL_POR_SALA[HUNT][world.sala!.chave])
    const especiesDaSala = new Set([...daSala].map((id) => ENCOUNTERS[id].speciesId))

    // O mundo ja nasce com `maxEnemies` inimigos; todos tem que vir da sala.
    expect(world.enemies.length).toBeGreaterThan(0)
    for (const inimigo of world.enemies) {
      expect(especiesDaSala.has(inimigo.poke.speciesId), `${inimigo.poke.speciesId} fora da sala ${world.sala!.chave}`).toBe(true)
    }

    // E o respawn, que roda por outro caminho no stepWorld, tambem.
    const gameState = useGameStateStore.getState()
    for (let i = 0; i < 3000; i++) stepWorld(world, 0.1, gameState, { silent: true })
    const salaAgora = world.sala!.chave
    const permitidas = new Set(POOL_POR_SALA[HUNT][salaAgora].map((id) => ENCOUNTERS[id].speciesId))
    for (const inimigo of world.enemies) {
      expect(permitidas.has(inimigo.poke.speciesId), `${inimigo.poke.speciesId} fora da sala ${salaAgora}`).toBe(true)
    }
  })

  it('a sala sobrevive a reconstrucao do mundo', () => {
    // Este e o teste que o Campeao Lance nao tinha. O servidor reconstroi o
    // mundo a cada janela de flush (~30s); sem passar o progresso, a hunt
    // voltaria pra sala 1 de meio em meio minuto pra sempre.
    const poke = createPokeInstance(createRng(5), 'charmander', 20)
    const salva = { indice: 6, chave: 'jungle', abates: 4, ciclos: 2 }
    const world = buildMapWorld(
      HUNT, poke,
      { rng: createRng(5), counters: { entity: 1, effect: 1, pendingHit: 1 } },
      { sala: salva },
    )
    expect(world.sala).toEqual(salva)

    const permitidas = new Set(POOL_POR_SALA[HUNT].jungle.map((id) => ENCOUNTERS[id].speciesId))
    for (const inimigo of world.enemies) {
      expect(permitidas.has(inimigo.poke.speciesId)).toBe(true)
    }
  })

  it('sem sala, o pool ativo e o da hunt inteira', () => {
    const inteiro = ['a', 'b']
    expect(poolAtivo(HUNT, null, inteiro)).toBe(inteiro)
  })

  // Uma faixa cobre 30 niveis. Sem a janela, a PRIMEIRA sala ja podia jogar um
  // POKE Lv30 contra quem acabou de sair do Hospital — medido no motor
  // headless: Charmander Lv25 morreu em 4 abates em 30 minutos de "Mata I", e
  // com a janela fez 114 abates e chegou na sala 10.
  it('a janela de nivel sobe com a sala e cobre a faixa inteira sem buraco', () => {
    const faixa: [number, number] = [1, 30]
    const janelas = Array.from({ length: SALAS_POR_HUNT }, (_, i) => janelaDaSala(faixa, i))

    expect(janelas[0][0]).toBe(1)
    expect(janelas[SALAS_POR_HUNT - 1][1]).toBe(30)
    for (const [lo, hi] of janelas) {
      expect(lo).toBeGreaterThanOrEqual(1)
      expect(hi).toBeLessThanOrEqual(30)
      expect(hi).toBeGreaterThanOrEqual(lo)
    }
    // Contigua: a sala seguinte nunca comeca depois do fim da anterior, senao
    // haveria nivel nenhuma sala alcanca.
    for (let i = 1; i < janelas.length; i++) {
      expect(janelas[i][0], `buraco entre a sala ${i} e a ${i + 1}`).toBeLessThanOrEqual(janelas[i - 1][1] + 1)
    }
    // E monotonica: a hunt afunda, nunca volta.
    for (let i = 1; i < janelas.length; i++) {
      expect(janelas[i][0]).toBeGreaterThanOrEqual(janelas[i - 1][0])
    }
  })

  it('a sala so faz nascer inimigo dentro da janela dela', () => {
    const poke = createPokeInstance(createRng(9), 'charmander', 20)
    const world = buildMapWorld(
      HUNT, poke,
      { rng: createRng(9), counters: { entity: 1, effect: 1, pendingHit: 1 } },
      { sala: { indice: 0, chave: 'tall-grass', abates: 0, ciclos: 0 } },
    )
    const [, teto] = janelaDaSala(world.mapDef!.levelRange, 0)
    for (const inimigo of world.enemies) {
      expect(inimigo.poke.level, `${inimigo.poke.speciesId} acima da janela da sala 1`).toBeLessThanOrEqual(teto)
    }
  })
})
