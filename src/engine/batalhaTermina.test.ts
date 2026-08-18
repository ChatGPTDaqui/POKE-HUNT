// Uma batalha tem que TERMINAR.
//
// Bug relatado pelo usuario e reproduzido aqui: "o Kangaskhan ficava com a vida
// vazia e o Typhlosion batendo nele por muitos minutos sem que ele morresse".
//
// A CAUSA E ENDURE. Kangaskhan leva Endure no kit selvagem a partir do Nv50, o
// golpe recarrega em 4s (o PP dele e 10, e neste jogo PP E a base do cooldown)
// e o POKE do jogador ataca a cada ~2-3s. Resultado: o hit que mataria caia em
// cima da flag quase toda vez, e o inimigo ficava parado em 1 de HP.
//
// A REGRA QUE FECHA ISSO NOS JOGOS NAO E O PP — e a falha por USO CONSECUTIVO
// (Gen V+): 100%, 50%, 25%, 12,5%... e qualquer outro golpe zera o contador.
// Ver combatSystem.ts#chanceDeProtecao.
//
// ---------------------------------------------------------------------------
// O QUE ESTE ARQUIVO MEDIU E DESCARTOU (nao repetir sem evidencia nova)
// ---------------------------------------------------------------------------
// A primeira versao desta suite acusava golpe de CURA (Roost/Recover/Slack Off)
// como segunda causa: Noctowl Nv60 sobrevivia 600s a um Typhlosion Nv40,
// curando 112 vezes. Era ARTEFATO DO ARNES — aquela medicao mantinha o jogador
// IMORTAL pra isolar o alvo, e um jogador imortal e a unica situacao em que uma
// cura de 50% a cada 8s nunca perde a corrida.
//
// Medido de novo com o jogador MORTAL, que e o jogo de verdade:
//
//   ty40 vs noctowl60   JOGADOR CAIU em  9s
//   ty50 vs noctowl60   JOGADOR CAIU em  9s
//   ty55 vs noctowl60   inimigo caiu em 15s
//   ty60 vs noctowl60   inimigo caiu em  9s
//
// Nao existe faixa de nivel em que a luta nao termine: ou o jogador mata rapido,
// ou morre rapido. O mesmo vale pra Pidgeot e Slowpoke. Por isso NAO ha limite
// de usos pra golpe de cura — seria inventar consumo de PP pra consertar um
// problema que so o arnes tinha.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { getAbility } from '@/data/abilities'
import { buildMapWorld, stepWorld } from './simulation'
import { criarInimigoDeTeste } from './testes/inimigoDeTeste'
import { updateCombat } from './systems/combatSystem'
import { useGameStateStore } from '@/stores/gameStateStore'

const TETO_DE_SEGUNDOS = 240

/**
 * Jogador IMORTAL contra um inimigo bem acima do nivel — o pior caso possivel
 * pro travamento. A imortalidade e o que isola "o inimigo cai?" de "quem ganha
 * a luta?", e e legitima pro caso de PROTECAO (Endure nao se alimenta do dano
 * que o jogador leva). Nao seria legitima pra golpe de DRENO, que se alimenta —
 * ver o aviso no fim do arquivo.
 */
function segundosParaDerrubar(especieInimiga: string, nivelJogador: number, nivelInimigo: number): number {
  const gameState = useGameStateStore.getState()
  const rng = createRng(7)
  const poke = createPokeInstance(rng, 'typhlosion', nivelJogador, { rarity: 'comum' })
  const world = buildMapWorld('route_46', poke, {
    rng: createRng(7),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  for (const inimigo of world.enemies) {
    inimigo.poke = createPokeInstance(rng, especieInimiga, nivelInimigo, { rarity: 'comum' })
  }
  const alvo = world.enemies[0]
  let t = 0
  while (t < TETO_DE_SEGUNDOS && alvo.poke.hp > 0) {
    world.player!.poke.hp = world.player!.poke.stats.hp
    world.player!.fainted = false
    stepWorld(world, 0.1, gameState, {})
    t += 0.1
  }
  return t
}

describe('golpe de protecao nao deixa a batalha eterna', () => {
  it('Kangaskhan nao fica eterno em 1 HP com Endure', () => {
    expect(segundosParaDerrubar('kangaskhan', 40, 60)).toBeLessThan(TETO_DE_SEGUNDOS)
  })

  it('nenhuma especie do elenco com Endure/Protect trava a luta', () => {
    // Escolhidas por CARREGAREM Endure/Protect no kit selvagem de Nv60 (a
    // lista sai de `species.abilities`, nao de memoria) e por serem as mais
    // tanques delas — num POKE frageis o teste passaria por falta de HP, nao
    // porque a regra funciona.
    for (const especie of ['kangaskhan', 'blastoise', 'kingler', 'piloswine']) {
      expect(segundosParaDerrubar(especie, 40, 60), especie).toBeLessThan(TETO_DE_SEGUNDOS)
    }
  })
})

describe('a chance de protecao cai pela metade a cada uso seguido', () => {
  /** Usa `abilityId` `vezes` seguidas e conta quantas de fato pegaram. */
  function pegouEm(abilityId: string, vezes: number, semente: number): number {
    const rng = createRng(semente)
    const poke = createPokeInstance(rng, 'kangaskhan', 50, { rarity: 'comum' })
    const world = buildMapWorld('route_46', poke, {
      rng: createRng(semente),
      counters: { entity: 1, effect: 1, pendingHit: 1 },
    })
    const player = world.player!
    const enemy = criarInimigoDeTeste(world, 'rattata', 50, { x: player.x, y: player.y })
    // `targetId` E OBRIGATORIO: `updateCombat` monta a lista de engajados por
    // `state === 'engaged' && targetId === player.id`. Sem isso ele conclui FIM
    // DE BATALHA no mesmo frame e `limparEstadoVolatil` apaga `enduraAtiva` e o
    // contador de protecoes — o teste mediria a limpeza, e nao o sorteio.
    enemy.targetId = player.id
    world.enemies = [enemy]

    let pegou = 0
    for (let i = 0; i < vezes; i++) {
      player.enduraAtiva = false
      player.protegida = false
      world.pendingHits.push({
        id: `hit-${world.counters.pendingHit++}`,
        timer: 0, attackerId: player.id, targetId: enemy.id, ability: getAbility(abilityId)!,
      })
      updateCombat(world, 0, { silent: true })
      if (player.enduraAtiva || player.protegida) pegou++
    }
    return pegou
  }

  it('o PRIMEIRO uso sempre pega', () => {
    for (let semente = 0; semente < 20; semente++) {
      expect(pegouEm('endure', 1, semente), `semente ${semente}`).toBe(1)
    }
  })

  it('dez usos SEGUIDOS nunca pegam dez vezes', () => {
    // MEDIDO: 6,8 de 10 em media (30 sementes). NAO e a soma 1+1/2+1/4+... = 2,
    // e o motivo e a propria regra dos jogos: a FALHA tambem zera o contador,
    // entao a tentativa seguinte volta a 100%. O processo e uma renovacao —
    // sucesso, ~metade, falha, sucesso de novo — e assenta perto de 2/3.
    //
    // 2/3 basta pra fechar o travamento porque Endure so entra abaixo de 25% de
    // HP e recarrega em 4s: uma falha em tres ja abre a janela do golpe que
    // mata. Medido no duelo real: Kangaskhan Nv60 caiu de "minutos" pra 25,3s.
    //
    // O teto de 8 (e nao 6,9) e folga deliberada contra flutuacao de semente. O
    // que este caso guarda e o SINTOMA: sem a regra, dez usos pegavam dez vezes.
    let total = 0
    const AMOSTRA = 30
    for (let semente = 0; semente < AMOSTRA; semente++) {
      const pegou = pegouEm('endure', 10, semente)
      expect(pegou, `semente ${semente}`).toBeLessThan(10)
      total += pegou
    }
    expect(total / AMOSTRA).toBeLessThan(8)
  })

  it('Protect segue a mesma regra que Endure', () => {
    for (let semente = 0; semente < 20; semente++) {
      expect(pegouEm('protect', 10, semente), `semente ${semente}`).toBeLessThan(10)
    }
  })
})

// CUIDADO COM O ARNES IMORTAL DA PRIMEIRA SUITE: ele da a GOLPE DE DRENO do
// inimigo (Dream Eater, Giga Drain, Leech Life) uma fonte infinita de cura — o
// alvo nunca cai, entao o dreno nunca para. Gengar e Haunter "nao morrem" ali
// por esse motivo, e NAO por um bug do jogo: numa luta de verdade o jogador
// teria caido antes. Nao acrescente especie com dreno ou com cura a lista sem
// tirar a imortalidade junto.
