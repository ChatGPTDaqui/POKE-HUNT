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
import { DURACAO_DE_ESTAGIO_SEGUNDOS } from '@/data/statusEffects'

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

  const world = buildMapWorld('mata_e1', jogadorPoke, { seed: 0, rng, counters })
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

    // Reengajou: e uma luta NOVA, e Intimidate dispara de novo.
    //
    // O QUE MUDOU NA PH-418: o segundo disparo RENOVA o prazo em vez de somar
    // outro degrau, entao o estagio fica em -1 e nao vai pra -2. Este teste dizia
    // -2 e agora diz -1 — e a mudanca esta certa, nao e o teste sendo afrouxado:
    // renovar e o que impede um selvagem que engaja e desengaja em loop de afundar
    // o oponente ate o piso -6, que e a mesma runaway que o Rosnado de multidao
    // tinha. Somar por engajamento, com prazo de 18s por cima, seria pior que o
    // comportamento antigo, porque antes o fim de batalha zerava.
    //
    // O que este teste sempre garantiu continua garantido: UM disparo por
    // engajamento, e nao um por frame. So que agora a prova de que o segundo
    // disparo aconteceu e o PRAZO ter voltado a encher — o degrau nao muda, e
    // olhar so pra ele nao distingue "disparou de novo" de "nao disparou".
    const prazoAntes = enemy.estagiosFonte!.atkFis![0].expiraEm!
    expect(prazoAntes, 'os dois ticks anteriores gastaram prazo')
      .toBeLessThan(DURACAO_DE_ESTAGIO_SEGUNDOS)

    enemy.state = 'engaged'
    enemy.targetId = player.id
    player.state = 'chase'
    updateCombat(world, PASSO, { silent: true })

    expect(enemy.estagios.atkFis, 'renovou, nao somou').toBe(-1)
    expect(enemy.estagiosFonte!.atkFis!, 'uma fonte, nao duas').toHaveLength(1)
    expect(enemy.estagiosFonte!.atkFis![0].expiraEm!, 'o disparo novo encheu o prazo')
      .toBeGreaterThan(prazoAntes)
  })
})
