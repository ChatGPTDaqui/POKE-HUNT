// PH-493: quem é mais RÁPIDO resolve o golpe primeiro — e quem cai não devolve.
//
// A QUEIXA, palavras do dono do projeto: "se os dois atacam ao mesmo tempo os
// dois tomam dano, mesmo se um deles morrer... em caso o pokemon mais veloz
// derrotar o outro com o golpe, o pokemon derrotado não efetuará o golpe."
//
// O CANCELAMENTO JÁ EXISTIA E NUNCA DISPARAVA, e é isso que este arquivo
// tranca. `resolveHit` desiste na primeira linha quando o atacante já está
// morto — mas dois golpes disparados no mesmo tick nascem com o mesmo
// `HIT_LAND_DELAY`, pousam no mesmo tick, e a ordem de resolução era a de
// ENFILEIRAMENTO. Quem empurrou primeiro batia primeiro, e a Velocidade não
// decidia nada.
//
// POR QUE O TESTE MONTA `pendingHits` A MÃO. O caminho natural — dois POKE se
// aproximando e atacando — não deixa esta pergunta observável: para reproduzir
// o empate seria preciso alinhar posição, alcance, cooldown e precisão dos dois
// lados no mesmo tick, e cada um desses é um motivo diferente de o teste ficar
// vermelho um dia sem que a ordem tenha mudado. Os hits pendentes são o estado
// EXATO que o defeito produz, e é sobre eles que a correção age.
import { describe, expect, it, vi } from 'vitest'

import { BASIC_ATTACK } from '@/data/abilities'
import { updateCombat } from './systems/combatSystem'
import type { WorldState } from './types'

vi.mock('@/stores/toastStore', () => ({
  useToastStore: { getState: () => ({ pushToast() {} }) },
}))

/**
 * Dois lutadores encostados, com o MESMO golpe pendente um contra o outro e o
 * timer já vencido — o instante em que o defeito acontece.
 *
 * `hp: 1` nos dois: qualquer dano derruba, então a pergunta "quem morre" some
 * do teste e sobra só "quem age primeiro", que é o que ele mede.
 */
function duelo(velocidadeDoJogador: number, velocidadeDoInimigo: number) {
  const stats = (speed: number) => ({
    hp: 100, atkFis: 200, atkEsp: 200, def: 1, defEsp: 1, speed,
  })
  const corpo = (id: string, speed: number, x: number) => ({
    id,
    x, y: 100, radius: 14,
    facing: { x: 1, y: 0 },
    state: 'engaged' as const,
    fainted: false,
    targetId: null as string | null,
    cooldowns: {} as Record<string, number>,
    globalCooldown: 0,
    estagios: {},
    flashTimer: 0,
    lastDamageTaken: {
      physical: { amount: 0, age: 99 },
      special: { amount: 0, age: 99 },
    },
    battleAnim: null,
    effectLanes: [],
    entradaProcessada: true,
    proximoTurnoDeStatus: 3,
    poke: {
      uid: `${id}-uid`, speciesId: 'rattata', level: 50, isShiny: false,
      hp: 1, exp: 0, ivs: {}, stats: stats(speed),
      activeAbilities: [BASIC_ATTACK.id], unlockedAbilities: [], disabledAbilities: [],
    },
  })

  const player = corpo('player-1', velocidadeDoJogador, 100)
  const enemy = corpo('enemy-1', velocidadeDoInimigo, 120)
  player.targetId = enemy.id
  enemy.targetId = player.id

  return {
    mapDef: { id: 'mata_e1', bounds: { width: 800, height: 600 }, respawnDelay: 5 },
    player,
    enemies: [enemy],
    effects: [],
    // A ORDEM DE ENFILEIRAMENTO É SEMPRE A MESMA nos dois casos do teste: o
    // inimigo empurra primeiro. É o que faz a Velocidade ser a ÚNICA variável —
    // sem isso, um teste que passasse poderia estar só lendo a ordem do array.
    pendingHits: [
      { id: 'hit-1', timer: 0, attackerId: 'enemy-1', targetId: 'player-1', ability: BASIC_ATTACK },
      { id: 'hit-2', timer: 0, attackerId: 'player-1', targetId: 'enemy-1', ability: BASIC_ATTACK },
    ],
    pendingWishes: [],
    counters: { effect: 0, pendingHit: 3, enemy: 0 },
    clima: null,
    sala: null,
    enemyHazards: [],
    playerHazards: [],
    rng: { state: 1 },
  } as unknown as WorldState
}

/** Um tick de combate com os dois hits já vencidos. `silent` pula todo desenho. */
function resolver(world: WorldState) {
  return updateCombat(world, 0.016, { silent: true })
}

describe('ordem de resolucao por Velocidade (PH-493)', () => {
  it('o MAIS RAPIDO derruba e o derrotado NAO devolve o golpe', () => {
    const world = duelo(300, 50)
    resolver(world)
    expect(world.enemies[0].poke.hp, 'o inimigo lento tinha que cair').toBe(0)
    expect(world.player!.poke.hp, 'o inimigo caido ainda devolveu o golpe').toBe(1)
    expect(world.player!.fainted).toBe(false)
  })

  it('invertida a Velocidade, inverte quem sobra — e a ordem da fila nao muda', () => {
    // O CONTRA-CASO É OBRIGATÓRIO. Sem ele, um bug que simplesmente cancelasse
    // o segundo hit de todo tick (ou que sempre deixasse o jogador vivo)
    // passaria no caso de cima. A fila é idêntica nos dois; só a Velocidade
    // troca de lado.
    const world = duelo(50, 300)
    resolver(world)
    expect(world.player!.poke.hp, 'o jogador lento tinha que cair').toBe(0)
    expect(world.enemies[0].poke.hp, 'o jogador caido ainda devolveu o golpe').toBe(1)
  })

  it('com HP de sobra os DOIS batem — a ordem so decide quando alguem cai', () => {
    // A correção é sobre o cancelamento por morte, e não sobre "só um golpe por
    // tick". Um POKE que sobrevive ao golpe do rápido continua devolvendo o
    // dele — trocar isso mudaria o combate inteiro, e ninguém pediu.
    const world = duelo(300, 50)
    // 100.000 e nao 500: com Ataque 200 contra Defesa 1 no nivel 50 o golpe
    // passa de 500 de dano, e a 500 de HP o teste voltaria a medir 'quem morreu'
    // — que e o caso ACIMA. Aqui ninguem pode cair.
    const CHEIO = 100_000
    world.player!.poke.hp = CHEIO
    world.player!.poke.stats.hp = CHEIO
    world.enemies[0].poke.hp = CHEIO
    world.enemies[0].poke.stats.hp = CHEIO
    resolver(world)
    expect(world.player!.poke.hp).toBeLessThan(CHEIO)
    expect(world.enemies[0].poke.hp).toBeLessThan(CHEIO)
  })
})
