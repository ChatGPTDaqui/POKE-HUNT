// A ARTE DO GOLPE ESPERA A POSE DE ATAQUE TERMINAR (PH-175).
//
// O QUE ESTE TESTE TRANCA
//
// Substitui `arteDoGolpeComecaNaPose.test.ts` (PH-117): aquele pedido tornava
// `HIT_LAND_DELAY` (0,3s) menor que `ATTACK_ANIM_DURATION` (0,5s) de proposito,
// pra pose e arte se SOBREPOREM nos ultimos 0,2s — leitura pretendida era "o
// golpe conectando". Pedido explicito revertendo aquilo: a sobreposicao lia
// como incoerente, nao como golpe conectando. `HIT_LAND_DELAY` volta a ser
// `ATTACK_ANIM_DURATION` — sequencial, pose inteira primeiro.
//
// A afirmacao aqui e sobre as DUAS pontas, e nenhuma das duas sozinha basta:
//
//   1. a arte NAO nasce antes do tempo de tela da pose (`ATTACK_ANIM_DURATION`)
//      ter decorrido;
//   2. ela nasce logo depois disso, nao muito mais tarde (senao o caso passaria
//      so por `HIT_LAND_DELAY` ter virado grande demais, nao por estar CERTO).
//
// Mede pelo TEMPO SIMULADO decorrido, nao por `player.attackAnimTimer`: este
// teste chama `updateCombat` isolado (sem o `stepWorld`/`updateAnimations`
// completo que decrementa aquele timer de verdade), entao ele ficaria travado
// no valor inicial e nao provaria nada. O que interessa e o que o jogador ve
// na tela, e isso e o tempo decorrido ate a arte aparecer.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { BASIC_ATTACK } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import { typedAoeMoveKey } from '@/data/typedAoeMoves'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import { updateCombat } from './combatSystem'
import { ATTACK_ANIM_DURATION } from './animationSystem'

/** Passo de quadro da medicao. */
const QUADRO = 0.05

/** Golpe de dano de alvo unico do Charmander. */
const GOLPE_UNICO = 'ember'

/**
 * Teto da janela em que a arte tem que aparecer.
 *
 * ATTACK_ANIM_DURATION e 0,5s; somar 0,05 dez vezes acumula residuo de ponto
 * flutuante, entao o teto fica um quadro acima (0,56) pra nao reprovar por
 * aritmetica, so por comportamento.
 */
const TETO = 0.56

/**
 * Cenario de um golpe, um atacante, um alvo calado.
 *
 * `aoe` escolhe entre o golpe de alvo unico (Ember) e o golpe de area
 * por tipo — os dois enfileiram por caminhos diferentes (`queueHit` e
 * `queueAoeVisual`), e o anel de area nasce em outro ramo de `resolveHit`.
 */
function cenario({ aoe = false } = {}) {
  const rng = createRng(7)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const jogadorPoke = createPokeInstance(rng, 'charmander', 40)
  const golpeAoe = typedAoeMoveKey(SPECIES.charmander.type)
  const golpe = aoe ? golpeAoe : GOLPE_UNICO
  // Um golpe SO, pra o teste medir o instante de um uso e nao a mistura de dois.
  // O Ataque Basico fica de fora dos dois casos: ele e o Struggle deste jogo e
  // competiria pelo mesmo turno.
  jogadorPoke.unlockedAbilities = [...jogadorPoke.unlockedAbilities, golpe]
  jogadorPoke.activeAbilities = [golpe]
  jogadorPoke.disabledAbilities = {
    [BASIC_ATTACK.id]: true,
    [aoe ? GOLPE_UNICO : golpeAoe]: true,
  }

  const world = buildMapWorld('route_46', jogadorPoke, { seed: 0, rng, counters })
  const player = world.player!
  player.cooldowns = {}
  player.globalCooldown = 0

  const inimigoPoke = createPokeInstance(rng, 'rattata', 30)
  const especie = SPECIES[inimigoPoke.speciesId]
  // Inimigo calado: a arte do golpe DELE contaria como "arte na tela" e o teste
  // mediria o golpe errado.
  inimigoPoke.disabledAbilities = Object.fromEntries(
    [...golpesUtilizaveis(inimigoPoke, especie, true), BASIC_ATTACK.id].map((id) => [id, true]),
  )
  // HP alto: alvo que desmaia no primeiro golpe para de existir e a segunda
  // metade da medicao mediria uma cena vazia.
  inimigoPoke.stats = { ...inimigoPoke.stats, hp: 9999 }
  inimigoPoke.hp = 9999

  const enemy = createEnemyEntity(world.counters, {
    poke: inimigoPoke, x: player.x, y: player.y, encounterId: 'route_46_rattata',
  })
  enemy.state = 'engaged'
  enemy.targetId = player.id
  world.enemies = [enemy]
  return { world, player }
}

/** Quantas artes de golpe estao na tela agora. */
function artesDeGolpe(world: ReturnType<typeof cenario>['world']): number {
  return world.effects.filter((e) => e.type === 'abilityEffect').length
}

describe.each([
  { nome: 'alvo unico', aoe: false },
  { nome: 'area', aoe: true },
])('arte do golpe de $nome espera a pose terminar (PH-175)', ({ aoe }) => {
  it('nao nasce no instante do disparo', () => {
    const { world, player } = cenario({ aoe })
    updateCombat(world, 0)
    // A pose comecou — sem isto o caso passaria por o golpe nem ter saido.
    expect(player.attackAnimTimer, 'a pose de ataque nao comecou').toBeGreaterThan(0)
    expect(artesDeGolpe(world), 'arte apareceu junto com o disparo').toBe(0)
  })

  it('nao nasce antes do tempo de tela da pose decorrer', () => {
    const { world } = cenario({ aoe })
    updateCombat(world, 0)
    // Para ANTES de ATTACK_ANIM_DURATION (0,5s) — o ultimo quadro medido aqui
    // ainda esta dentro da janela da pose.
    for (let t = 0; t * QUADRO < ATTACK_ANIM_DURATION - QUADRO; t++) {
      updateCombat(world, QUADRO)
      expect(artesDeGolpe(world), `arte apareceu antes da pose acabar (t=${(t + 1) * QUADRO})`).toBe(0)
    }
  })

  it('nasce logo depois que a pose termina, ate 0,56s', () => {
    const { world } = cenario({ aoe })
    updateCombat(world, 0)
    let quandoApareceu = -1
    for (let t = 1; t <= 12 && quandoApareceu < 0; t++) {
      updateCombat(world, QUADRO)
      if (artesDeGolpe(world) > 0) quandoApareceu = t * QUADRO
    }
    expect(quandoApareceu, 'nenhuma arte de golpe ate 0,56s').toBeGreaterThan(0)
    // O CASO QUE IMPORTA: reintroduzir HIT_LAND_DELAY menor que
    // ATTACK_ANIM_DURATION faria a arte nascer bem antes de 0,5s.
    expect(quandoApareceu, 'arte apareceu antes do tempo de tela da pose').toBeGreaterThanOrEqual(ATTACK_ANIM_DURATION)
    expect(quandoApareceu).toBeLessThanOrEqual(TETO)
  })
})
