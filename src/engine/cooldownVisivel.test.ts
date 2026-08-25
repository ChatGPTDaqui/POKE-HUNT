// A contagem que o HUD mostra tem que ser o tempo REAL ate o golpe sair.
//
// BUG REAL RELATADO PELO USUARIO: "o visual da contagem de cooldown dos golpes
// nao esta sincronizado com o cooldown real". A causa sao DOIS relogios, e o
// HUD lia so um:
//
//   1. `cooldowns[id]` — o cooldown proprio do golpe, derivado do PP e escalado
//      pela Velocidade.
//   2. `globalCooldown` — o TURNO (MIN_ACTION_GAP, 2s). `executePlayerAction`
//      chama `canAct` antes de qualquer coisa, entao ele barra TODA acao,
//      inclusive um golpe cujo cooldown proprio ja zerou.
//
// Sintomas: o slot apagava a contagem e acendia o anel de "pronto" com o POKE
// ainda travado pelo turno, e um golpe marcado "0.4s" so saia 1.6s depois.
//
// Nenhuma das duas falhas lanca excecao — a barra so mente. Por isso vira
// teste.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld } from './simulation'
import { segundosAtePoderUsar, startCooldown, startGlobalCooldown, tickCooldowns } from './entity'

function jogador() {
  const rng = createRng(7)
  const world = buildMapWorld('route_46', createPokeInstance(rng, 'typhlosion', 40), { seed: 0,
    rng, counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  return world.player!
}

describe('segundosAtePoderUsar: os dois relogios juntos', () => {
  it('sem nada rodando, o golpe esta pronto', () => {
    expect(segundosAtePoderUsar(jogador(), 'ember')).toBe(0)
  })

  it('so o cooldown do golpe: manda o cooldown do golpe', () => {
    const p = jogador()
    startCooldown(p, 'ember', 3)
    expect(segundosAtePoderUsar(p, 'ember')).toBe(3)
  })

  it('so o turno global: o golpe NAO esta pronto, mesmo sem cooldown proprio', () => {
    // Este e o caso que a barra escondia: anel branco de "pronto" num golpe
    // que o motor ia recusar.
    const p = jogador()
    startGlobalCooldown(p, 2)
    expect(segundosAtePoderUsar(p, 'ember')).toBe(2)
  })

  it('os dois rodando: manda o MAIOR, nunca a soma', () => {
    const p = jogador()
    startCooldown(p, 'ember', 0.4)
    startGlobalCooldown(p, 2)
    // Somar (2.4) mentiria pro outro lado — os dois correm ao mesmo tempo.
    expect(segundosAtePoderUsar(p, 'ember')).toBe(2)
  })

  it('o turno global vale pra TODOS os golpes, nao so pro que foi usado', () => {
    const p = jogador()
    startCooldown(p, 'ember', 5)
    startGlobalCooldown(p, 2)
    expect(segundosAtePoderUsar(p, 'ember')).toBe(5)
    expect(segundosAtePoderUsar(p, 'flamethrower')).toBe(2)
  })

  it('desce junto com o tempo e chega a zero', () => {
    const p = jogador()
    startCooldown(p, 'ember', 1)
    startGlobalCooldown(p, 2)
    for (let i = 0; i < 20; i++) tickCooldowns(p, 0.1)
    expect(segundosAtePoderUsar(p, 'ember')).toBe(0)
  })
})
