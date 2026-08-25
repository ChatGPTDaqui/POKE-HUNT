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
  'endeavor', 'final_gambit', 'low_kick', 'heavy_slam',
] as const

function cenario(golpeId: string, {
  nivelJogador = 30, nivelInimigo = 60,
  especieJogador = 'charmander', especieInimigo = 'rattata',
  // Stats do alvo forcados quando o teste compara DOIS alvos diferentes: sem
  // isto a medicao pegaria a diferenca de Defesa/HP entre as duas especies em
  // vez da regra sob teste.
  statsDoInimigo = null as null | { hp: number; def: number },
} = {}) {
  const rng = createRng(11)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const jogadorPoke = createPokeInstance(rng, especieJogador, nivelJogador)
  jogadorPoke.unlockedAbilities = [...jogadorPoke.unlockedAbilities, golpeId]
  jogadorPoke.activeAbilities = [golpeId]
  // AOE de nivel 50 e Ataque Basico desligados: os dois competem pelo turno e
  // roubariam o unico uso que o teste mede.
  jogadorPoke.disabledAbilities = {
    [typedAoeMoveKey(SPECIES[especieJogador].type)]: true,
    [BASIC_ATTACK.id]: true,
  }
  const world = buildMapWorld('route_46', jogadorPoke, { seed: 0, rng, counters })
  const player = world.player!
  player.cooldowns = {}
  player.globalCooldown = 0

  const enemyPoke = createPokeInstance(rng, especieInimigo, nivelInimigo)
  if (statsDoInimigo) {
    enemyPoke.stats = { ...enemyPoke.stats, hp: statsDoInimigo.hp, def: statsDoInimigo.def }
    enemyPoke.hp = statsDoInimigo.hp
  }
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
// e 0.3s desde o PH-117, e MIN_ACTION_GAP e 2s — ou seja 0.6 pousa o golpe e
// ainda nao deixa o POKE agir de novo no meio da medicao).
function umUso(mundo: ReturnType<typeof cenario>) {
  updateCombat(mundo.world, 0)
  updateCombat(mundo.world, 0.6)
}

describe('golpes de dano por regra propria que estavam inertes', () => {
  it('os 9 implementados sao reconhecidos como golpe de dano', () => {
    for (const id of IMPLEMENTADOS) {
      expect(DANO_SEM_PODER_BASE.has(id), id).toBe(true)
      expect(isDamagingAbility(getAbility(id)), id).toBe(true)
    }
  })

  it('cada um dos 9 tira HP de verdade quando dispara', () => {
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
  it('os 6 sem regra implementada continuam FORA de DANO_SEM_PODER_BASE', () => {
    for (const id of DANO_POR_REGRA_NAO_IMPLEMENTADA) {
      expect(ABILITIES_DATA[id], id).toBeDefined()
      expect(DANO_SEM_PODER_BASE.has(id), id).toBe(false)
      expect(isDamagingAbility(getAbility(id)), id).toBe(false)
    }
  })
})

// GOLPES DE PESO (low_kick, heavy_slam). Ficaram inertes na primeira versao do
// PH-69 porque o catalogo nao tinha peso nenhum; `pesoHg` foi adicionado direto
// da PokeAPI (scripts/fetch-usum-catalog.js, 226 especies) e as duas formulas
// dos jogos passaram a ser calculaveis.
//
// Os testes abaixo medem a FORMULA, nao o dano final: dano depende de ataque,
// defesa, nivel e tipo, e comparar dois POKEs diferentes misturaria tudo isso.
// Aqui a comparacao e sempre "mesmo atacante, alvos de peso diferente" (ou o
// inverso), que isola a variavel de peso.
describe('golpes que dependem do peso da especie', () => {
  it('toda especie do jogo tem peso, em hectogramas', () => {
    const semPeso = Object.values(SPECIES).filter((e) => !(e.pesoHg > 0)).map((e) => e.id)
    expect(semPeso).toEqual([])
    // Ancoras conferidas contra os jogos: Gastly 0,1 kg e Snorlax 460 kg sao os
    // extremos do elenco, e Machamp 130 kg cai numa faixa do meio do Low Kick.
    expect(SPECIES.gastly.pesoHg).toBe(1)
    expect(SPECIES.machamp.pesoHg).toBe(1300)
    expect(SPECIES.snorlax.pesoHg).toBe(4600)
  })


  // Os dois alvos sao NORMAL de proposito: Low Kick e FIGHTING, e o POKE mais
  // leve do elenco (Gastly, 0,1 kg) e GHOST — IMUNE. Com ele o teste mediria a
  // imunidade de tipo, nao a tabela de peso. Rattata (3,5 kg) cai na primeira
  // faixa (poder 20) e Snorlax (460 kg) na ultima (poder 120).
  //
  // `statsDoInimigo` iguala Defesa e HP dos dois: sem isso a medicao pegaria a
  // diferenca de stats entre Rattata e Snorlax em vez da tabela.
  it('low_kick: alvo mais pesado leva mais dano', () => {
    const mesmosStats = { hp: 99999, def: 100 }
    const leve = cenario('low_kick', { nivelInimigo: 40, especieInimigo: 'rattata', statsDoInimigo: mesmosStats })
    const hpAntesLeve = leve.enemy.poke.hp
    umUso(leve)
    const danoNoLeve = hpAntesLeve - leve.enemy.poke.hp

    const pesado = cenario('low_kick', { nivelInimigo: 40, especieInimigo: 'snorlax', statsDoInimigo: mesmosStats })
    const hpAntesPesado = pesado.enemy.poke.hp
    umUso(pesado)
    const danoNoPesado = hpAntesPesado - pesado.enemy.poke.hp

    expect(danoNoLeve).toBeGreaterThan(0)
    expect(danoNoPesado).toBeGreaterThan(danoNoLeve * 2)
  })

  it('heavy_slam: quanto mais pesado o usuario for que o alvo, mais forte', () => {
    // Onix (210 kg) usando o golpe. Contra Rattata (3,5 kg) a razao passa de 5
    // (poder maximo, 120); contra Snorlax (460 kg) fica abaixo de 1 (poder
    // minimo, 40).
    const mesmosStats = { hp: 99999, def: 100 }
    const contraLeve = cenario('heavy_slam', {
      especieJogador: 'onix', nivelInimigo: 40, especieInimigo: 'rattata', statsDoInimigo: mesmosStats,
    })
    const hpAntesLeve = contraLeve.enemy.poke.hp
    umUso(contraLeve)
    const danoContraLeve = hpAntesLeve - contraLeve.enemy.poke.hp

    const contraPesado = cenario('heavy_slam', {
      especieJogador: 'onix', nivelInimigo: 40, especieInimigo: 'snorlax', statsDoInimigo: mesmosStats,
    })
    const hpAntesPesado = contraPesado.enemy.poke.hp
    umUso(contraPesado)
    const danoContraPesado = hpAntesPesado - contraPesado.enemy.poke.hp

    expect(danoContraPesado).toBeGreaterThan(0)
    expect(danoContraLeve).toBeGreaterThan(danoContraPesado * 2)
  })
})
