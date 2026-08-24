// A ARTE DO GOLPE COMECA DURANTE A POSE DE ATAQUE, NAO DEPOIS DELA (PH-117).
//
// O QUE ESTE TESTE TRANCA
//
// `HIT_LAND_DELAY` era literalmente `ATTACK_ANIM_DURATION`, e o comentario dizia
// que era pra tudo pousar "em sincronia com a pose terminando". Na tela isso
// saia em SEQUENCIA — pose inteira, e SO ENTAO a arte do golpe. O pedido foi
// 0,3s: a arte comeca ainda durante a pose de 0,5s.
//
// A afirmacao aqui e sobre as DUAS pontas, e nenhuma das duas sozinha basta:
//
//   1. a arte NAO nasce no instante do disparo (senao seria "0s", nao "0,3s");
//   2. quando ela nasce, a pose de ataque AINDA ESTA TOCANDO.
//
// (2) e o que impede alguem de reamarrar as duas constantes de novo: com
// `HIT_LAND_DELAY = ATTACK_ANIM_DURATION`, no quadro em que a arte aparece o
// `attackAnimTimer` ja chegou a zero, e o caso reprova.
//
// Por que medir `attackAnimTimer` em vez de comparar as duas constantes: a
// constante e detalhe interno, e comparar numero com numero passaria mesmo que a
// arte parasse de ser criada. O que interessa e o que o jogador ve.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { BASIC_ATTACK } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import { typedAoeMoveKey } from '@/data/typedAoeMoves'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import { updateCombat } from './combatSystem'

/** Passo de quadro da medicao. Menor que os 0,3s de propósito. */
const QUADRO = 0.05

/** Golpe de dano de alvo unico do Charmander. */
const GOLPE_UNICO = 'ember'

/**
 * Teto da janela em que a arte tem que aparecer.
 *
 * 0,36 e nao 0,35: somar 0.05 sete vezes da 0.35000000000000003, e o pouso cai
 * no setimo quadro justamente por causa desse residuo. Comparar com 0,35 exato
 * reprovaria por aritmetica de ponto flutuante, nao por comportamento.
 */
const TETO = 0.36

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
])('arte do golpe de $nome comeca durante a pose (PH-117)', ({ aoe }) => {
  it('nao nasce no instante do disparo', () => {
    const { world, player } = cenario({ aoe })
    updateCombat(world, 0)
    // A pose comecou — sem isto o caso passaria por o golpe nem ter saido.
    expect(player.attackAnimTimer, 'a pose de ataque nao comecou').toBeGreaterThan(0)
    expect(artesDeGolpe(world), 'arte apareceu junto com o disparo').toBe(0)
  })

  it('nao nasce antes de 0,25s', () => {
    const { world } = cenario({ aoe })
    updateCombat(world, 0)
    for (let t = 0; t < 5; t++) updateCombat(world, QUADRO)
    expect(artesDeGolpe(world), 'arte apareceu antes dos 0,3s').toBe(0)
  })

  it('nasce ate 0,35s, com a pose AINDA tocando', () => {
    const { world, player } = cenario({ aoe })
    updateCombat(world, 0)
    let quandoApareceu = -1
    let poseNoInstante = -1
    for (let t = 1; t <= 7 && quandoApareceu < 0; t++) {
      updateCombat(world, QUADRO)
      if (artesDeGolpe(world) > 0) {
        quandoApareceu = t * QUADRO
        poseNoInstante = player.attackAnimTimer
      }
    }
    expect(quandoApareceu, 'nenhuma arte de golpe em 0,35s').toBeGreaterThan(0)
    expect(quandoApareceu).toBeLessThanOrEqual(TETO)
    // O CASO QUE IMPORTA: reamarrar HIT_LAND_DELAY a ATTACK_ANIM_DURATION zera
    // este numero, porque a arte passaria a nascer no quadro em que a pose
    // acaba — as duas animacoes voltariam a ficar em fila.
    expect(poseNoInstante, 'a pose ja tinha terminado quando a arte apareceu').toBeGreaterThan(0)
  })
})
