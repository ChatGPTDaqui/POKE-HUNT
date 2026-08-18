import { describe, expect, it } from 'vitest'
import { createPokeInstance, createRng, defaultGameStateData } from '#engine'
import { criarEstadoDoJogador } from './estadoDoJogador.js'

// Bug real achado nesta leva: `healTeamFully` do servidor so resetava `hp`,
// nao `status` — sob autoridade do servidor, curar no Hospital devolvia o
// POKE de HP cheio e AINDA envenenado/queimado/paralisado. O fallback local
// (gameStateStore.ts) ja fazia os dois desde sempre; so o adaptador do
// servidor divergia.
describe('healTeamFully', () => {
  it('limpa HP e status nao-volatil de todo o time', () => {
    const dados = defaultGameStateData()
    const rng = createRng(1)
    const poke = createPokeInstance(rng, 'charmander', 10, {})
    poke.hp = 1
    poke.status = { tipo: 'poison', turnosRestantes: 3 }
    dados.team = [poke]

    const { store, dados: saida } = criarEstadoDoJogador(dados)
    store.healTeamFully()

    expect(saida.team[0].hp).toBe(saida.team[0].stats.hp)
    expect(saida.team[0].status).toBeNull()
  })
})
