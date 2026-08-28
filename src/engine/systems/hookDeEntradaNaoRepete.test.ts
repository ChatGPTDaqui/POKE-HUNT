// O HOOK DE ENTRADA EM COMBATE do JOGADOR dispara UMA vez por luta — inclusive
// quando o jogador esta ANDANDO com inimigo engajado nele.
//
// O bug (achado desenhando o lure, PH-235, mas anterior a ele): o rearme do
// hook olhava `player.state !== 'engaged'`, e `player.state` e 'engaged' so
// quando o MOVIMENTO decidiu parar em cima do alvo mais proximo. Um inimigo pode
// estar engajado no jogador enquanto o jogador ainda esta em 'chase' — correndo
// atras de um shiny do outro lado do mapa (regra que ja existia), ou, desde o
// lure, atravessando a hunt pra puxar o proximo selvagem.
//
// Nesses frames o par se alternava a 60 Hz: "reseta porque state != engaged" no
// comeco do tick, "dispara porque entradaProcessada e false" no fim. Intimidate
// derrubava o Ataque do oponente ate o piso (-6) em ~6 frames em vez de tirar 1,
// e o chat levava uma linha por frame.
//
// O lure transforma isso de caso de borda em regra: reunir E andar com inimigo
// atras. Por isso o contrato virou teste.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { BASIC_ATTACK } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import { updateCombat } from './combatSystem'

const PASSO = 1 / 60

/** Deixa o POKE incapaz de atacar — o teste e sobre o hook, nao sobre dano. */
function desarmar(poke: ReturnType<typeof createPokeInstance>) {
  const species = SPECIES[poke.speciesId]
  poke.disabledAbilities = Object.fromEntries(
    [...golpesUtilizaveis(poke, species, true), BASIC_ATTACK.id].map((id) => [id, true]),
  )
  poke.stats = { ...poke.stats, hp: 99999 }
  poke.hp = 99999
}

function cenario() {
  const rng = createRng(31)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const jogadorPoke = createPokeInstance(rng, 'charmander', 40)
  desarmar(jogadorPoke)
  // Intimidate e o caso mais legivel dos hooks de entrada: ele deixa um efeito
  // ACUMULAVEL no oponente, entao "disparou uma vez" e "disparou 60 vezes" tem
  // resultados diferentes e mediveis.
  jogadorPoke.trait = 'intimidate'

  const world = buildMapWorld('mata_faixa1', jogadorPoke, { seed: 0, rng, counters })
  const player = world.player!

  const enemyPoke = createPokeInstance(rng, 'rattata', 40)
  desarmar(enemyPoke)
  const enemy = createEnemyEntity(world.counters, {
    poke: enemyPoke, x: player.x, y: player.y, encounterId: world.mapDef!.enemyPool[0],
  })
  // O selvagem esta ENGAJADO no jogador...
  enemy.state = 'engaged'
  enemy.targetId = player.id
  world.enemies = [enemy]
  // ...e o jogador esta ANDANDO (puxando outro, perseguindo shiny — o motivo nao
  // importa aqui, so o estado).
  player.state = 'chase'
  return { world, player, enemy }
}

describe('hook de entrada em combate do jogador (PH-235)', () => {
  it('Intimidate tira UM estagio, mesmo com o jogador em chase por 60 ticks', () => {
    const { world, player, enemy } = cenario()

    for (let i = 0; i < 60; i++) {
      updateCombat(world, PASSO, { silent: true })
      // `updateMovement` nao roda neste teste: quem manda no estado aqui e o
      // cenario. Reafirmar todo tick e o que reproduz o bug — era exatamente
      // isso que acontecia de verdade enquanto o jogador atravessava o mapa.
      player.state = 'chase'
      enemy.state = 'engaged'
      enemy.targetId = player.id
    }

    expect(enemy.estagios.atkFis).toBe(-1)
  })

  it('rearma quando a luta ACABA (ninguem mais engajado) e dispara de novo', () => {
    const { world, player, enemy } = cenario()

    updateCombat(world, PASSO, { silent: true })
    expect(enemy.estagios.atkFis).toBe(-1)

    // Fim de batalha: o selvagem soltou o aggro.
    enemy.state = 'wander'
    enemy.targetId = null
    updateCombat(world, PASSO, { silent: true })
    expect(player.entradaProcessada).toBe(false)

    // Reengajou: e uma luta NOVA, e Intimidate vale de novo — como uma troca de
    // POKE nos jogos reais.
    //
    // -2 e nao -1: `limparEstadoVolatil` do fim de batalha zera os estagios do
    // JOGADOR, nao os do selvagem (ver updateCombat), entao o -1 anterior dele
    // continua de pe e o novo disparo soma. Isso e comportamento de sempre deste
    // motor e nao muda aqui; o que este teste garante e que houve UM disparo por
    // engajamento, e nao um por frame — com o bug, o primeiro `updateCombat`
    // sozinho ja teria chegado no piso -6.
    enemy.state = 'engaged'
    enemy.targetId = player.id
    player.state = 'chase'
    updateCombat(world, PASSO, { silent: true })
    expect(enemy.estagios.atkFis).toBe(-2)
  })
})
