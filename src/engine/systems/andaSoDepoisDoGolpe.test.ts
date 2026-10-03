// O POKE SO ANDA DEPOIS QUE O GOLPE TERMINA (02/10).
//
// Pedido do dono: "o poke para rapidamente e ja comeca a andar de novo caso ele
// tenha derrotado o inimigo, isso faz com que a skill fique para tras". A trava
// era so a pose (0,5 s); o efeito nasce quando o golpe pousa e dura mais 0,6 a
// 2,1 s. Agora o POKE fica parado a pose E o efeito.
//
// O cenario e o caso exato da queixa: o golpe DERROTA o alvo, e ha outro
// inimigo longe pra onde o POKE quer andar. Mede, no motor inteiro
// (`stepWorld`), quando a posicao do jogador muda pela primeira vez depois do
// disparo — e nos DOIS modos, porque o servidor re-simula em `silent` e o
// efeito nem nasce la. Trava so com efeito seria divergencia de autoridade.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { BASIC_ATTACK } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import { duracaoVisualDoGolpe } from '@/data/duracaoDoVfx'
import { useGameStateStore } from '@/stores/gameStateStore'
import { createEnemyEntity } from '../entity'
import { buildMapWorld, stepWorld } from '../simulation'
import { ATTACK_ANIM_DURATION } from './animationSystem'

const PASSO = 1 / 60
const GOLPE = 'ember'

function calado(especie: string, nivel: number, rng: ReturnType<typeof createRng>) {
  const poke = createPokeInstance(rng, especie, nivel)
  poke.disabledAbilities = Object.fromEntries(
    [...golpesUtilizaveis(poke, SPECIES[poke.speciesId], true), BASIC_ATTACK.id].map((id) => [id, true]),
  )
  return poke
}

function cenario() {
  const rng = createRng(7)
  const gs = useGameStateStore.getState()
  gs.resetToDefaults()
  const jogador = createPokeInstance(rng, 'charmander', 60)
  // Um golpe so: o teste mede UM uso.
  jogador.unlockedAbilities = [...jogador.unlockedAbilities, GOLPE]
  jogador.activeAbilities = [GOLPE]
  jogador.disabledAbilities = { [BASIC_ATTACK.id]: true }
  gs.addPokeToTeam(jogador)
  gs.setActiveIndex(0)
  const world = buildMapWorld('route_46', useGameStateStore.getState().team[0], {
    seed: 0, rng, counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  const player = world.player!
  player.cooldowns = {}
  player.globalCooldown = 0

  // Alvo colado e fragil: o golpe DERROTA (o caso da queixa).
  const fragil = calado('rattata', 2, rng)
  fragil.hp = 1
  const alvo = createEnemyEntity(world.counters, { poke: fragil, x: player.x, y: player.y, encounterId: 'route_46_rattata' })
  // Encostado sem sobrepor: corpo dentro de corpo faz a separacao empurrar o
  // jogador, e isso nao e "andar".
  alvo.x = player.x - (player.radius + alvo.radius + 2)
  alvo.state = 'engaged'
  alvo.targetId = player.id
  // Outro inimigo LONGE: e pra ele que o POKE quer andar depois do abate.
  const longe = createEnemyEntity(world.counters, { poke: calado('rattata', 2, rng), x: player.x + 160, y: player.y, encounterId: 'route_46_rattata' })
  longe.aggroRadius = 0
  world.enemies = [alvo, longe]
  return { world, player, gameState: useGameStateStore.getState() }
}

/** Segundos do disparo do golpe ate o jogador sair do lugar. */
function ateAndar(silent: boolean): number {
  const { world, player, gameState } = cenario()
  let disparo = -1
  let t = 0
  let x = player.x
  for (let i = 0; i < 6 * 60; i++) {
    stepWorld(world, PASSO, gameState, { silent })
    t += PASSO
    if (disparo < 0 && player.attackAnimTimer > 0) { disparo = t; x = player.x }
    // Andar = ir na direcao do inimigo longe (que esta a direita).
    if (disparo >= 0 && player.x - x > 1) return t - disparo
  }
  return Infinity
}

describe('o POKE so anda depois que o efeito do golpe acaba (02/10)', () => {
  const efeito = duracaoVisualDoGolpe(GOLPE, false) / 1000

  it('o golpe do cenario tem coreografia (anti-teste-vacuo)', () => {
    expect(efeito).toBeGreaterThan(0.5)
  })

  it.each([
    { modo: 'cliente', silent: false },
    { modo: 'servidor (silent, sem efeito nenhum)', silent: true },
  ])('$modo: fica parado a pose E o efeito, e anda logo depois', ({ silent }) => {
    const andou = ateAndar(silent)
    // Antes: andava logo depois da pose (~0,5 s), com o efeito no meio.
    expect(andou, 'andou com o efeito ainda na tela').toBeGreaterThanOrEqual(ATTACK_ANIM_DURATION + efeito - 2 * PASSO)
    // E nao fica preso alem disso.
    expect(andou, 'ficou parado alem do fim do efeito').toBeLessThan(ATTACK_ANIM_DURATION + efeito + 0.25)
  })

  it('cliente e servidor travam o MESMO tempo', () => {
    expect(ateAndar(false)).toBeCloseTo(ateAndar(true), 5)
  })
})
