// O GOLPE SAI NO APICE DA POSE E O DANO CAI NO IMPACTO DO VFX (11/10).
//
// Pedido do dono: "a animacao do golpe tem que sair junto com o apice da
// animacao de ataque" — o POKE ja tinha atacado pela arte e o VFX ainda nem
// tinha saido. Substitui arteDoGolpeEsperaAPoseTerminar.test.ts (PH-175: pose
// de 0,5 s fixos inteira, depois arte, com o dano no nascimento da arte).
//
// O que fica trancado, por caso (pose propria Shoot do Pikachu, pose Charge
// em loop do Charmander que nao tem Shoot, e golpe em area):
//   1. o VFX nasce no DISPARO com `delay` = apice da arte da especie — e o
//      apice cai DENTRO da pose (nao no fim dela, que era o defeito);
//   2. o dano nao acontece antes do primeiro impacto do VFX e acontece nele;
//   3. no servidor (`silent`) nao nasce efeito, mas o dano cai no MESMO instante;
//   4. golpe cancelado (atacante caiu antes do impacto) leva o VFX junto.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { BASIC_ATTACK } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import { typedAoeMoveKey } from '@/data/typedAoeMoves'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import { tempoDoGolpe } from '../tempoDoGolpe'
import { poseDeAtaque } from './animationSystem'
import { updateCombat } from './combatSystem'

const QUADRO = 1 / 60

interface Caso { nome: string; especie: string; golpe: (especie: string) => string }
const CASOS: Caso[] = [
  { nome: 'Shoot propria (Pikachu, Thunder Shock)', especie: 'pikachu', golpe: () => 'thunder_shock' },
  { nome: 'Charge em loop (Charmander, Ember)', especie: 'charmander', golpe: () => 'ember' },
  { nome: 'area (Pikachu, golpe de area do tipo)', especie: 'pikachu', golpe: (e) => typedAoeMoveKey(SPECIES[e].type) },
]

function cenario(caso: Caso) {
  const rng = createRng(7)
  const jogadorPoke = createPokeInstance(rng, caso.especie, 40)
  const golpe = caso.golpe(caso.especie)
  // Um golpe so: o teste mede UM uso. Ataque Basico fora (competiria pelo turno).
  jogadorPoke.unlockedAbilities = [...jogadorPoke.unlockedAbilities, golpe]
  jogadorPoke.activeAbilities = [golpe]
  jogadorPoke.disabledAbilities = { [BASIC_ATTACK.id]: true }

  const world = buildMapWorld('route_46', jogadorPoke, { seed: 0, rng, counters: { entity: 1, effect: 1, pendingHit: 1 } })
  const player = world.player!
  player.cooldowns = {}
  player.globalCooldown = 0

  // Inimigo calado (a arte do golpe dele contaria como arte na tela) e de HP
  // alto (alvo que desmaia some e a medicao viraria cena vazia).
  const inimigoPoke = createPokeInstance(rng, 'rattata', 30)
  inimigoPoke.disabledAbilities = Object.fromEntries(
    [...golpesUtilizaveis(inimigoPoke, SPECIES[inimigoPoke.speciesId], true), BASIC_ATTACK.id].map((id) => [id, true]),
  )
  inimigoPoke.stats = { ...inimigoPoke.stats, hp: 9999 }
  inimigoPoke.hp = 9999
  const enemy = createEnemyEntity(world.counters, { poke: inimigoPoke, x: player.x, y: player.y, encounterId: 'route_46_rattata' })
  enemy.state = 'engaged'
  enemy.targetId = player.id
  world.enemies = [enemy]
  const area = golpe.startsWith('aoe')
  const tempo = tempoDoGolpe(caso.especie, poseDeAtaque(area, false), golpe)
  return { world, player, enemy, golpe, tempo }
}

const artes = (world: ReturnType<typeof cenario>['world']) => world.effects.filter((e) => e.type === 'abilityEffect')

/** Segundos desde o disparo ate o alvo perder HP (Infinity se nao perdeu). */
function ateODano(caso: Caso, silent: boolean): number {
  const { world, enemy } = cenario(caso)
  updateCombat(world, 0, { silent })
  const hp = enemy.poke.hp
  for (let i = 1; i <= 3 * 60; i++) {
    updateCombat(world, QUADRO, { silent })
    if (enemy.poke.hp < hp) return i * QUADRO
  }
  return Infinity
}

describe.each(CASOS)('golpe no apice da pose — $nome', (caso) => {
  it('o VFX nasce no disparo, marcado pro apice, e o apice cai dentro da pose', () => {
    const { world, player, tempo } = cenario(caso)
    updateCombat(world, 0)
    expect(player.attackAnimTimer, 'a pose nao comecou').toBeGreaterThan(0)
    const [arte] = artes(world)
    expect(arte, 'o VFX nao nasceu no disparo').toBeDefined()
    expect(arte.delay).toBeCloseTo(tempo.apice, 6)
    expect(tempo.apice).toBeGreaterThan(0)
    expect(tempo.apice, 'apice depois do fim da pose').toBeLessThan(tempo.pose)
    // A pose toca a arte da especie inteira (nao mais 0,5 s fixos).
    expect(player.attackAnimTimer).toBeCloseTo(tempo.pose, 6)
  })

  it('o dano cai no primeiro impacto do VFX, nao antes', () => {
    const { tempo } = cenario(caso)
    const t = ateODano(caso, false)
    expect(t, 'dano antes do impacto').toBeGreaterThanOrEqual(tempo.impacto - QUADRO / 2)
    expect(t, 'dano bem depois do impacto').toBeLessThan(tempo.impacto + 2 * QUADRO)
  })

  it('servidor (silent): sem efeito, mesmo instante de dano', () => {
    const { world } = cenario(caso)
    updateCombat(world, 0, { silent: true })
    expect(artes(world)).toHaveLength(0)
    expect(ateODano(caso, true)).toBeCloseTo(ateODano(caso, false), 6)
  })
})

describe('golpe cancelado leva o VFX junto', () => {
  it('atacante que cai antes do impacto: sem dano e sem arte no ar', () => {
    const { world, player, enemy } = cenario(CASOS[0])
    updateCombat(world, 0)
    expect(artes(world)).toHaveLength(1)
    const hp = enemy.poke.hp
    player.poke.hp = 0
    for (let i = 0; i < 60; i++) updateCombat(world, QUADRO)
    expect(enemy.poke.hp).toBe(hp)
    expect(artes(world)).toHaveLength(0)
  })
})
