// GOLPES DE DANO POR REGRA PROPRIA (PH-69).
//
// 15 golpes cuja descricao promete dano vinham do catalogo com `power: 0` e
// ficaram fora de DANO_SEM_PODER_BASE — `isDamagingAbility` era falso, eles nao
// tem `status` nem valem como apoio, e `pickAbilityDaFila` dava `continue` neles
// em TODA rotacao. Slot morto pra sempre, e no pior caso (4 slots desses) o POKE
// do jogador nao ataca nada, porque desde 2026-08-18 a fila dele nao tem
// fallback pro Ataque Basico.
//
// 7 foram implementados; os outros 8 continuam inertes de proposito e estao em
// DANO_POR_REGRA_NAO_IMPLEMENTADA, com o motivo de cada um em data/abilities.ts.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import {
  BASIC_ATTACK, DANO_POR_REGRA_NAO_IMPLEMENTADA, DANO_SEM_PODER_BASE, getAbility,
  isDamagingAbility,
} from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import { typedAoeMoveKey } from '@/data/typedAoeMoves'
import { ABILITIES_DATA } from '@/data/generated/abilities.generated'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import { updateCombat } from './combatSystem'

const IMPLEMENTADOS = [
  'gyro_ball', 'electro_ball', 'wring_out', 'punishment', 'sonic_boom',
  'endeavor', 'final_gambit',
] as const

function cenario(golpeId: string, { nivelJogador = 30, nivelInimigo = 60 } = {}) {
  const rng = createRng(11)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const jogadorPoke = createPokeInstance(rng, 'charmander', nivelJogador)
  jogadorPoke.unlockedAbilities = [...jogadorPoke.unlockedAbilities, golpeId]
  jogadorPoke.activeAbilities = [golpeId]
  // AOE de nivel 50 e Ataque Basico desligados: os dois competem pelo turno e
  // roubariam o unico uso que o teste mede.
  jogadorPoke.disabledAbilities = {
    [typedAoeMoveKey(SPECIES.charmander.type)]: true,
    [BASIC_ATTACK.id]: true,
  }
  const world = buildMapWorld('route_46', jogadorPoke, { rng, counters })
  const player = world.player!
  player.cooldowns = {}
  player.globalCooldown = 0

  const enemyPoke = createPokeInstance(rng, 'rattata', nivelInimigo)
  const enemySpecies = SPECIES[enemyPoke.speciesId]
  // Inimigo calado: contra-ataque dele mexeria no HP dos dois lados e nenhuma
  // das medicoes abaixo sobreviveria a isso.
  enemyPoke.disabledAbilities = Object.fromEntries(
    [...golpesUtilizaveis(enemyPoke, enemySpecies, true), BASIC_ATTACK.id].map((id) => [id, true]),
  )
  const enemy = createEnemyEntity(world.counters, {
    poke: enemyPoke, x: player.x, y: player.y, encounterId: 'route_46_rattata',
  })
  enemy.state = 'engaged'
  enemy.targetId = player.id
  world.enemies = [enemy]
  return { world, player, enemy }
}

// Um uso: `updateCombat(0)` enfileira, `updateCombat(0.6)` pousa (HIT_LAND_DELAY
// e 0.5s e MIN_ACTION_GAP e 2s, ou seja o POKE nao age de novo no meio).
function umUso(mundo: ReturnType<typeof cenario>) {
  updateCombat(mundo.world, 0)
  updateCombat(mundo.world, 0.6)
}

describe('golpes de dano por regra propria que estavam inertes', () => {
  it('os 7 implementados sao reconhecidos como golpe de dano', () => {
    for (const id of IMPLEMENTADOS) {
      expect(DANO_SEM_PODER_BASE.has(id), id).toBe(true)
      expect(isDamagingAbility(getAbility(id)), id).toBe(true)
    }
  })

  it('cada um dos 7 tira HP de verdade quando dispara', () => {
    for (const id of IMPLEMENTADOS) {
      const mundo = cenario(id)
      const hpAntes = mundo.enemy.poke.hp
      umUso(mundo)
      expect(mundo.enemy.poke.hp, id).toBeLessThan(hpAntes)
    }
  })

  it('final_gambit cobra metade do HP de quem usa (nao e nuke de graca)', () => {
    const mundo = cenario('final_gambit')
    const meuHpAntes = mundo.player.poke.hp
    umUso(mundo)
    expect(mundo.player.poke.hp).toBeLessThanOrEqual(Math.ceil(meuHpAntes / 2))
    // Desvio consciente do jogo original, onde o usuario desmaia: a fila dispara
    // sozinha em rotacao e um auto-KO fiel encerraria a hunt a cada volta.
    expect(mundo.player.poke.hp).toBeGreaterThan(0)
  })

  it('gyro_ball bate mais forte quanto mais LENTO o usuario, e electro_ball ao contrario', () => {
    // Mesmo cenario, so mexendo na Velocidade dos dois lados. Os dois golpes
    // leem `velocidadeEfetiva`, entao esta e a medicao direta da regra.
    const lento = cenario('gyro_ball')
    lento.player.poke.stats = { ...lento.player.poke.stats, speed: 10 }
    lento.enemy.poke.stats = { ...lento.enemy.poke.stats, speed: 200 }
    const hpAntesLento = lento.enemy.poke.hp
    umUso(lento)
    const danoDoLento = hpAntesLento - lento.enemy.poke.hp

    const rapido = cenario('gyro_ball')
    rapido.player.poke.stats = { ...rapido.player.poke.stats, speed: 200 }
    rapido.enemy.poke.stats = { ...rapido.enemy.poke.stats, speed: 10 }
    const hpAntesRapido = rapido.enemy.poke.hp
    umUso(rapido)
    const danoDoRapido = hpAntesRapido - rapido.enemy.poke.hp

    expect(danoDoLento).toBeGreaterThan(danoDoRapido)

    const eletricoRapido = cenario('electro_ball')
    eletricoRapido.player.poke.stats = { ...eletricoRapido.player.poke.stats, speed: 200 }
    eletricoRapido.enemy.poke.stats = { ...eletricoRapido.enemy.poke.stats, speed: 10 }
    const hpAntesEletrico = eletricoRapido.enemy.poke.hp
    umUso(eletricoRapido)
    const danoRapidoEletrico = hpAntesEletrico - eletricoRapido.enemy.poke.hp

    const eletricoLento = cenario('electro_ball')
    eletricoLento.player.poke.stats = { ...eletricoLento.player.poke.stats, speed: 10 }
    eletricoLento.enemy.poke.stats = { ...eletricoLento.enemy.poke.stats, speed: 200 }
    const hpAntesEletricoLento = eletricoLento.enemy.poke.hp
    umUso(eletricoLento)
    const danoLentoEletrico = hpAntesEletricoLento - eletricoLento.enemy.poke.hp

    expect(danoRapidoEletrico).toBeGreaterThan(danoLentoEletrico)
  })

  it('sonic_boom tira exatamente 20, como a descricao diz', () => {
    const mundo = cenario('sonic_boom')
    const hpAntes = mundo.enemy.poke.hp
    umUso(mundo)
    expect(hpAntes - mundo.enemy.poke.hp).toBe(20)
  })

  // O outro lado do contrato: golpe cuja regra NAO da pra implementar aqui nao
  // pode entrar em DANO_SEM_PODER_BASE. Se entrasse, viraria golpe de dano 0
  // escolhivel e o aviso de golpe inerte da ficha sumiria — pior que o bug
  // original, porque nada na tela explicaria o slot morto.
  it('os 8 sem regra implementada continuam FORA de DANO_SEM_PODER_BASE', () => {
    for (const id of DANO_POR_REGRA_NAO_IMPLEMENTADA) {
      expect(ABILITIES_DATA[id], id).toBeDefined()
      expect(DANO_SEM_PODER_BASE.has(id), id).toBe(false)
      expect(isDamagingAbility(getAbility(id)), id).toBe(false)
    }
  })
})
