// Explosao/Autodestruicao aplicam 50% de recoil no proprio atacante — se o
// atacante ja estava em HP baixo, o recoil pode mata-lo no mesmo tick em que
// o dano real do golpe pousa no alvo. `resolveHit` cancela qualquer hit
// enfileirado se o atacante ja estiver morto (guard contra acao enfileirada
// antes de um desmaio anterior); com o recoil enfileirado ANTES do dano real
// (bug original), esse guard cancelava o dano no alvo tambem. PH-10: dano
// real tem que pousar antes do recoil matar quem usou o golpe.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { BASIC_ATTACK, getAbility, TURNO_SEGUNDOS, type Ability } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import { typedAoeMoveKey } from '@/data/typedAoeMoves'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import type { EnemyEntity } from '../types'
import {
  updateCombat, multiplicadorDeAtaquePorTrait, multiplicadorDeDefesaPorTrait, velocidadeEfetiva,
} from './combatSystem'

function construirCenarioExplosao() {
  const rng = createRng(1)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const jogadorPoke = createPokeInstance(rng, 'charmander', 50)
  jogadorPoke.unlockedAbilities = ['explosion']
  const world = buildMapWorld('route_46', jogadorPoke, { rng, counters })
  const player = world.player!
  player.poke.hp = 1
  player.cooldowns = {}
  player.globalCooldown = 0

  const enemyPoke = createPokeInstance(rng, 'rattata', 50)
  const enemyHpAntes = enemyPoke.hp
  const enemy = createEnemyEntity(world.counters, {
    poke: enemyPoke, x: player.x, y: player.y, encounterId: 'route_46_rattata',
  })
  enemy.state = 'engaged'
  enemy.targetId = player.id
  world.enemies = [enemy]

  return { world, player, enemy, enemyHpAntes }
}

describe('Explosao/Autodestruicao com atacante em HP baixo (PH-10)', () => {
  it('atacante morre do proprio recoil, mas o alvo ainda leva o dano real do golpe', () => {
    const { world, player, enemy, enemyHpAntes } = construirCenarioExplosao()

    // Tick 1: engajado e sem cooldown -> executePlayerAction escolhe Explosao
    // (maior poder no ranking de dano estimado) e enfileira os hits.
    updateCombat(world, 0)
    expect(world.pendingHits.length).toBeGreaterThan(0)

    // Tick 2: os hits pousam no mesmo tick (mesmo timer). Sem o fix, o
    // recoil matava o atacante antes do dano real resolver e o alvo saia
    // ileso.
    updateCombat(world, 999)

    expect(enemy.poke.hp).toBeLessThan(enemyHpAntes)
    expect(player.fainted).toBe(true)
  })
})

describe('silent pula criacao de WorldEffect sem afetar dano (PH-11)', () => {
  it('silent:true aplica dano/derrota normalmente mas nao cria nenhum WorldEffect', () => {
    const { world, player, enemy, enemyHpAntes } = construirCenarioExplosao()

    updateCombat(world, 0, { silent: true })
    expect(world.pendingHits.length).toBeGreaterThan(0)
    updateCombat(world, 999, { silent: true })

    // Mesmo resultado de combate do teste do PH-10 (dano real + recoil letal)...
    expect(enemy.poke.hp).toBeLessThan(enemyHpAntes)
    expect(player.fainted).toBe(true)
    // ...mas nenhum efeito visual (damageNumber/abilityEffect) foi alocado.
    expect(world.effects.length).toBe(0)
  })

  it('silent:false (default) cria WorldEffect pro mesmo cenario — prova que o gate e real', () => {
    const { world, enemy, enemyHpAntes } = construirCenarioExplosao()

    updateCombat(world, 0)
    updateCombat(world, 999)

    expect(enemy.poke.hp).toBeLessThan(enemyHpAntes)
    expect(world.effects.length).toBeGreaterThan(0)
  })
})

// "A explosao elemental ele aprende, mas nao e obrigado a usar, e o ataque
// basico ele aprende, mas tambem nao e obrigado a usar."
//
// Pedido explicito do usuario (revertendo uma decisao anterior desta mesma
// sessao): os dois PARARAM de viver fora dos 4 slots — sao golpes normais,
// aparecem na tela de Equipes, escolhidos/removidos pelo mesmo
// `setActiveAbilities` de qualquer golpe. O duplo-clique na barra
// (`disabledAbilities`, RPC `alternar_habilidade`) continua existindo como
// liga/desliga GENERICO de qualquer golpe ja escolhido — nao e mais exclusivo
// destes dois. Estes testes travam que o combate obedece os dois caminhos:
// tirar do slot-de-4, ou desligar via toggle.
describe('AOE elemental e Ataque Basico sao opcionais', () => {
  function cenario(nivel: number) {
    const rng = createRng(7)
    const counters = { entity: 1, effect: 1, pendingHit: 1 }
    const jogadorPoke = createPokeInstance(rng, 'charmander', nivel)
    const world = buildMapWorld('route_46', jogadorPoke, { rng, counters })
    const player = world.player!
    player.cooldowns = {}
    player.globalCooldown = 0
    // Jogador e alvo com HP absurdo: a luta precisa durar dezenas de turnos, e
    // qualquer um dos dois caindo encerraria a medicao no primeiro golpe.
    player.poke.stats = { ...player.poke.stats, hp: 999999 }
    player.poke.hp = 999999

    const enemyPoke = createPokeInstance(rng, 'rattata', nivel)
    // HP absurdo de proposito: o alvo tem que SOBREVIVER pra a luta durar varios
    // turnos e dar chance de o golpe recusado aparecer.
    enemyPoke.stats = { ...enemyPoke.stats, hp: 999999, atkFis: 1, atkEsp: 1 }
    enemyPoke.hp = 999999
    // `world.counters`, NAO o literal acima: `buildMapWorld` guarda o proprio
    // contador, e criar o inimigo a partir do literal fazia ele nascer com o
    // MESMO id do jogador (entity-1) — os golpes do inimigo entravam na conta
    // do jogador e o teste acusava um bug que nao existia.
    const enemy = createEnemyEntity(world.counters, {
      poke: enemyPoke, x: player.x, y: player.y, encounterId: 'route_46_rattata',
    })
    enemy.state = 'engaged'
    enemy.targetId = player.id
    world.enemies = [enemy]
    return { world, player, enemy }
  }

  // Roda a luta por varios turnos e devolve todo golpe que o JOGADOR chegou a
  // usar. Le `pendingHits` porque `pickAbility` e interna ao modulo.
  function golpesUsados(mundo: ReturnType<typeof cenario>, turnos: number): Set<string> {
    const usados = new Set<string>()
    for (let i = 0; i < turnos; i++) {
      updateCombat(mundo.world, 1, { silent: true })
      for (const hit of mundo.world.pendingHits) {
        if (hit.attackerId === mundo.player.id) usados.add(hit.ability.id)
      }
    }
    return usados
  }

  it('o AOE de nivel 50 some da rotacao quando desligado (via disabledAbilities) ou tirado do slot', () => {
    const aoe = typedAoeMoveKey(SPECIES.charmander.type)
    // Golpe normal agora: precisa estar EXPLICITAMENTE nos 4 escolhidos pra
    // entrar em rotacao (nao e mais garantido por padrao).
    const escolha = [aoe, 'ember', 'scratch', 'growl']

    const ligado = cenario(60)
    ligado.player.poke.activeAbilities = escolha
    // Pre-condicao: escolhido e sem desligar, ele ESTA disponivel pro combate.
    expect(golpesUtilizaveis(ligado.player.poke, SPECIES[ligado.player.poke.speciesId], false)).toContain(aoe)

    const desligadoPorToggle = cenario(60)
    desligadoPorToggle.player.poke.activeAbilities = escolha
    desligadoPorToggle.player.poke.disabledAbilities = { [aoe]: true }
    expect(golpesUsados(desligadoPorToggle, 40).has(aoe)).toBe(false)

    const removidoDoSlot = cenario(60)
    removidoDoSlot.player.poke.activeAbilities = ['ember', 'scratch', 'growl']
    expect(golpesUsados(removidoDoSlot, 40).has(aoe)).toBe(false)
  })

  it('o Ataque Basico some da rotacao quando desligado, mesmo sendo o ultimo recurso', () => {
    const mundo = cenario(3)
    // Sem nenhum golpe escolhido, o Ataque Basico e a UNICA saida — e o caso em
    // que ele seria usado a forca.
    mundo.player.poke.activeAbilities = []
    mundo.player.poke.disabledAbilities = { [BASIC_ATTACK.id]: true }

    expect(golpesUsados(mundo, 40).has(BASIC_ATTACK.id)).toBe(false)
  })

  it('...e continua sendo usado quando NAO esta desligado (prova que o teste acima vale)', () => {
    const mundo = cenario(3)
    mundo.player.poke.activeAbilities = []

    expect(golpesUsados(mundo, 40).has(BASIC_ATTACK.id)).toBe(true)
  })

  // A precisao de cada golpe bate com o Ultra Sun — 501 golpes conferidos contra
  // a Bulbapedia por `npm run usum:learnsets`. Este teste cobre o outro lado: que
  // o numero e USADO, e nao so guardado. Ele ja foi dado como implementado uma
  // vez sem nunca ter sido ligado.
  it('a precisao do golpe muda quantas vezes ele pousa', () => {
    // Inferno: 100 de poder, 50% de precisao. Flamethrower: 90 de poder, 100%.
    function pousos(golpe: string, turnos: number): number {
      const mundo = cenario(60)
      mundo.player.poke.unlockedAbilities = [...mundo.player.poke.unlockedAbilities, golpe]
      mundo.player.poke.activeAbilities = [golpe]
      // O AOE de nivel 50 vive fora dos 4 slots e ganharia a escolha por dano
      // esperado, que ja e descontado pela precisao — o POKE simplesmente nunca
      // usaria Inferno. Desligado aqui pra sobrar UM golpe e a medicao ser dele.
      mundo.player.poke.disabledAbilities = { [typedAoeMoveKey(SPECIES.charmander.type)]: true }
      let n = 0
      const vistos = new Set<string>()
      for (let i = 0; i < turnos; i++) {
        // Zera o cooldown a cada volta: o que se quer medir e "de N usos,
        // quantos pousam", e esperar o cooldown real so encolheria a amostra
        // ate o resultado virar ruido.
        mundo.player.cooldowns = {}
        mundo.player.globalCooldown = 0
        updateCombat(mundo.world, 1, { silent: true })
        for (const hit of mundo.world.pendingHits) {
          if (hit.attackerId !== mundo.player.id || hit.ability.id !== golpe) continue
          if (vistos.has(hit.id)) continue
          vistos.add(hit.id)
          n++
        }
      }
      return n
    }

    const certeiro = pousos('flamethrower', 400)
    const impreciso = pousos('inferno', 400)

    // Faixa larga de proposito: o que esta sendo provado e que a precisao TEM
    // efeito, nao que o gerador de numeros e perfeito. Um valor ignorado daria
    // os dois iguais.
    expect(certeiro).toBeGreaterThan(0)
    expect(impreciso).toBeLessThan(certeiro * 0.8)
    expect(impreciso).toBeGreaterThan(certeiro * 0.2)
  })
})

// Golpes novos de tick volatil: leech_seed, curse (variante Ghost),
// nightmare, ingrain/aqua_ring, wish. Todos power:0/category:status no
// catalogo (sem `ability.status`/`statChanges`/`healPercent`), entao o efeito
// E a heuristica de selecao (golpeDeApoioUtil) sao 100% custom — ver
// combatSystem.ts#resolveHit e #golpeDeApoioUtil.
describe('golpes novos de tick volatil', () => {
  function construirCenarioGolpe(golpeId: string, especieJogador: string, nivel = 50) {
    const rng = createRng(3)
    const counters = { entity: 1, effect: 1, pendingHit: 1 }
    const jogadorPoke = createPokeInstance(rng, especieJogador, nivel)
    jogadorPoke.unlockedAbilities = [...jogadorPoke.unlockedAbilities, golpeId]
    jogadorPoke.activeAbilities = [golpeId]
    // O AOE de nivel 50 vive fora dos 4 slots e pode ja estar desbloqueado
    // neste nivel — desligado pra sobrar SO o golpe sob teste (mesmo cuidado
    // do teste de precisao acima).
    jogadorPoke.disabledAbilities = { [typedAoeMoveKey(SPECIES[especieJogador].type)]: true }
    const world = buildMapWorld('route_46', jogadorPoke, { rng, counters })
    const player = world.player!
    player.cooldowns = {}
    player.globalCooldown = 0

    const enemyPoke = createPokeInstance(rng, 'rattata', nivel)
    // O inimigo precisa ficar ENGAJADO pro jogador sequer agir (ver
    // `engagedEnemies` em updateCombat) -- mas os testes abaixo medem valores
    // EXATOS do golpe sob teste (custo do Curse, HoT do Ingrain, etc), e um
    // contra-ataque de verdade do inimigo somaria ruido nao-deterministico em
    // cima disso. Silenciado aqui: nenhuma habilidade dele (incluindo o
    // Ataque Basico) fica disponivel, entao pickAbility devolve null e
    // executeEnemyAction nunca enfileira nada.
    const enemySpecies = SPECIES[enemyPoke.speciesId]
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

  describe('leech_seed', () => {
    it('semeia o alvo (nao-GRASS) e drena 1/8 do HP maximo dele pro atacante a cada turno', () => {
      const { world, player, enemy } = construirCenarioGolpe('leech_seed', 'charmander')

      updateCombat(world, 0) // enfileira o hit
      updateCombat(world, 999) // pousa -> aplica seeded (rattata e NORMAL, nao imune)
      expect(enemy.seeded).toEqual({ sourceId: player.id })

      // Espaco pra ver a cura chegando: HP baixo, bem abaixo do teto.
      player.poke.hp = 1
      const enemyHpAntes = enemy.poke.hp
      updateCombat(world, 0) // proximoTurnoDeStatus ja ficou negativo pelo dt=999 acima -> tick imediato
      expect(enemy.poke.hp).toBeLessThan(enemyHpAntes)
      expect(player.poke.hp).toBeGreaterThan(1)
    })

    it('nao semeia um alvo GRASS', () => {
      const { world, enemy } = construirCenarioGolpe('leech_seed', 'charmander')
      // Mesma entidade/encontro do cenario padrao, so troca o POKE por um
      // GRASS puro -- encounterId real ja validado, sem precisar de um novo.
      const rng = createRng(9)
      enemy.poke = createPokeInstance(rng, 'bulbasaur', 50)

      updateCombat(world, 0)
      updateCombat(world, 999)
      expect(enemy.seeded).toBeUndefined()
    })
  })

  describe('curse (variante Ghost)', () => {
    it('atacante NAO-Ghost nunca usa curse (cai pro Ataque Basico)', () => {
      const { world, player } = construirCenarioGolpe('curse', 'charmander')
      const usados = new Set<string>()
      for (let i = 0; i < 20; i++) {
        player.cooldowns = {}
        player.globalCooldown = 0
        updateCombat(world, 0, { silent: true })
        for (const hit of world.pendingHits) {
          if (hit.attackerId === player.id) usados.add(hit.ability.id)
        }
      }
      expect(usados.has('curse')).toBe(false)
    })

    it('atacante GHOST usa curse: paga 50% do proprio HP MAXIMO e marca curseDot no alvo', () => {
      const { world, player, enemy } = construirCenarioGolpe('curse', 'gastly')
      const hpMax = player.poke.stats.hp
      const hpAntes = player.poke.hp

      updateCombat(world, 0)
      updateCombat(world, 999)

      expect(enemy.curseDot).toBe(true)
      expect(hpAntes - player.poke.hp).toBe(Math.max(1, Math.round(hpMax * 0.5)))
    })
  })

  describe('nightmare', () => {
    it('so causa dano no alvo enquanto ele estiver com status sleep', () => {
      const { world, enemy } = construirCenarioGolpe('nightmare', 'gastly')
      // Forca o alvo a dormir antes do golpe pousar — sem isto golpeDeApoioUtil
      // nunca escolheria nightmare (so e util contra quem JA esta dormindo).
      enemy.poke.status = { tipo: 'sleep', turnosRestantes: 10 }

      updateCombat(world, 0)
      updateCombat(world, 999)
      expect(enemy.nightmareDot).toBe(true)

      const hpAntes = enemy.poke.hp
      updateCombat(world, 0) // clock ja negativo -> tick imediato
      expect(enemy.poke.hp).toBeLessThan(hpAntes)

      // Acordou -> nightmareDot continua true, mas para de causar dano.
      enemy.poke.status = null
      const hpDepoisDeAcordar = enemy.poke.hp
      updateCombat(world, 0)
      expect(enemy.poke.hp).toBe(hpDepoisDeAcordar)
    })
  })

  describe('ingrain / aqua_ring', () => {
    it.each(['ingrain', 'aqua_ring'])('%s cura 1/16 do proprio HP maximo por turno', (golpeId) => {
      const { world, player } = construirCenarioGolpe(golpeId, 'charmander')
      player.poke.hp = 1

      updateCombat(world, 0)
      updateCombat(world, 999)
      expect(player.regenPercent).toBe(1 / 16)

      const hpAntes = player.poke.hp
      updateCombat(world, 0) // clock ja negativo -> tick imediato
      expect(player.poke.hp).toBeGreaterThan(hpAntes)
    })
  })

  describe('wish', () => {
    it('cura 50% do proprio HP MAXIMO de quem lancou, 2 turnos (nao no mesmo tick) depois', () => {
      const { world, player } = construirCenarioGolpe('wish', 'charmander')
      const hpMax = player.poke.stats.hp
      player.poke.hp = 1

      updateCombat(world, 0) // enfileira o hit
      updateCombat(world, 0.6) // hit pousa (HIT_LAND_DELAY=0.5) -> wish entra na fila
      expect(world.pendingWishes.length).toBe(1)
      expect(player.poke.hp).toBe(1) // ainda nao curou -- e uma cura ATRASADA

      updateCombat(world, 999) // avanca os 2 turnos da fila
      expect(world.pendingWishes.length).toBe(0)
      const esperado = Math.max(1, Math.round(hpMax * 0.5))
      expect(player.poke.hp).toBe(Math.min(hpMax, 1 + esperado))
    })

    it('fizzle silencioso se a entidade que lancou nao existir mais', () => {
      const { world } = construirCenarioGolpe('wish', 'gastly')
      world.pendingWishes = [{ timer: 0.01, healAmount: 999, targetId: 'entidade-que-nao-existe-mais' }]

      expect(() => updateCombat(world, 1)).not.toThrow()
      expect(world.pendingWishes.length).toBe(0)
    })
  })
})
// ============================================================================
// FASE 12: golpes sem-dano e Traits passivas.
//
// `resolveHit` nao e exportada (e interna ao modulo, disparada por
// updateCombat quando um PendingHit.timer chega a 0) — os testes abaixo
// injetam o PendingHit diretamente em `world.pendingHits` com timer 0 e
// chamam `updateCombat(world, 0, { silent: true })` pra resolve-lo, o MESMO
// caminho que queueHit/resolveHit usam de verdade, so sem depender da
// escolha de golpe da IA (pickAbility), que o describe acima ja cobre.
// ============================================================================

// Enemy manual (sem createEnemyEntity/getEncounter): varios testes precisam
// de uma especie com Trait especifica que nem sempre tem encontro cadastrado
// no mapa usado pelos outros testes deste arquivo (route_46).
function criarInimigoDeTeste(world: ReturnType<typeof buildMapWorld>, speciesId: string, level: number, junto: { x: number; y: number }): EnemyEntity {
  const enemyPoke = createPokeInstance(createRng(2), speciesId, level)
  const enemy: EnemyEntity = {
    id: `entity-${world.counters.entity++}`,
    kind: 'enemy',
    poke: enemyPoke,
    x: junto.x, y: junto.y,
    facing: { x: 0, y: 1 },
    radius: 15,
    state: 'engaged',
    cooldowns: {},
    globalCooldown: 999, // trava a propria acao -- so o hit injetado pelo teste resolve
    targetId: null,
    deathHandled: false,
    flashTimer: 0,
    lastDamageTaken: { physical: { amount: 0, age: Infinity }, special: { amount: 0, age: Infinity } },
    battleAnim: null,
    animFrame: 0,
    animElapsed: 0,
    attackAnim: null,
    attackAnimTimer: 0,
    effectLanes: [],
    statusVolatil: null,
    estagios: {},
    imunidadeDeStatus: 0,
    proximoTurnoDeStatus: TURNO_SEGUNDOS,
    pathWaypoints: null,
    pathIndex: 0,
    pathRecalcTimer: 0,
    pathTargetX: null,
    pathTargetY: null,
    encounterId: 'teste',
    spawnPoint: { x: junto.x, y: junto.y },
    moveSpeed: 0,
    wanderTarget: null,
    wanderPause: 0,
    aggroRadius: 0,
    wanderRadius: 0,
    leashRadius: 0,
    deathRemovalTimer: null,
  }
  return enemy
}

// Jogador + UM inimigo engajado, globalCooldown alto nos dois lados (trava
// qualquer ACAO nova neste tick). `enemy.state === 'engaged'` continua
// verdadeiro pra `engagedEnemies.length > 0` e o combate NAO cair no ramo de
// "fim de batalha" (que chamaria `limparEstadoVolatil` e apagaria os campos
// volateis que os testes acabaram de setar).
function cenarioDeSuporte(especieJogador: string, especieInimigo: string, nivel = 50) {
  const rng = createRng(1)
  const jogadorPoke = createPokeInstance(rng, especieJogador, nivel)
  const world = buildMapWorld('route_46', jogadorPoke, { rng, counters: { entity: 1, effect: 1, pendingHit: 1 } })
  const player = world.player!
  player.cooldowns = {}
  player.globalCooldown = 999

  const enemy = criarInimigoDeTeste(world, especieInimigo, nivel, { x: player.x, y: player.y })
  enemy.targetId = player.id
  world.enemies = [enemy]

  return { world, player, enemy }
}

function resolverHitComAbility(world: ReturnType<typeof buildMapWorld>, attackerId: string, targetId: string, ability: Ability): void {
  world.pendingHits.push({ id: `hit-${world.counters.pendingHit++}`, timer: 0, attackerId, targetId, ability })
  updateCombat(world, 0, { silent: true })
}

function resolverHit(world: ReturnType<typeof buildMapWorld>, attackerId: string, targetId: string, abilityId: string): void {
  resolverHitComAbility(world, attackerId, targetId, getAbility(abilityId)!)
}

describe('Fase 12: golpes de suporte sem dano', () => {
  it('Endure sobrevive com 1 HP no golpe que mataria, e a flag some depois', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    player.poke.stats = { ...player.poke.stats, hp: 200 }
    player.poke.hp = 10
    player.enduraAtiva = true
    enemy.poke.level = 50 // seismic_toss = dano fixo = nivel do atacante = 50

    resolverHit(world, enemy.id, player.id, 'seismic_toss')

    expect(player.poke.hp).toBe(1)
    expect(player.enduraAtiva).toBe(false)
  })

  it('Endure consome a flag no proximo hit recebido mesmo quando ele NAO mataria', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    player.poke.stats = { ...player.poke.stats, hp: 200 }
    player.poke.hp = 100
    player.enduraAtiva = true
    enemy.poke.level = 50 // 50 de dano fixo, nao mata hp=100

    resolverHit(world, enemy.id, player.id, 'seismic_toss')

    expect(player.poke.hp).toBe(50)
    expect(player.enduraAtiva).toBe(false)
  })

  it('Protect/Detect bloqueia o proximo golpe recebido inteiro, e consome a flag', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    player.protegida = true
    const hpAntes = player.poke.hp

    resolverHit(world, enemy.id, player.id, 'seismic_toss')

    expect(player.poke.hp).toBe(hpAntes)
    expect(player.protegida).toBe(false)
  })

  it('golpe de auto-alvo (Synthesis) ignora o Protect do "alvo" da fila — nunca mirou nele de verdade', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    enemy.protegida = true
    player.poke.hp = Math.floor(player.poke.stats.hp / 2)
    const hpAntes = player.poke.hp

    resolverHit(world, player.id, enemy.id, 'synthesis')

    expect(player.poke.hp).toBeGreaterThan(hpAntes)
    expect(enemy.protegida).toBe(true) // nunca foi "recebido" -- nao consumiu
  })

  it('Destiny Bond: quem mata o usuario tambem morre', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    player.poke.hp = 1
    player.destinyBondAtiva = true
    enemy.poke.stats = { ...enemy.poke.stats, hp: 999 }
    enemy.poke.hp = 999

    resolverHit(world, enemy.id, player.id, 'seismic_toss')

    expect(player.poke.hp).toBe(0)
    expect(enemy.poke.hp).toBe(0)
  })

  it('Haze zera TODOS os estagios dos dois lados', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    player.estagios = { atkFis: 3, speed: -2 }
    enemy.estagios = { def: -4 }

    resolverHit(world, player.id, enemy.id, 'haze')

    expect(player.estagios).toEqual({})
    expect(enemy.estagios).toEqual({})
  })

  it('Psych Up copia os estagios do ALVO pro usuario', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    player.estagios = { atkFis: -1 }
    enemy.estagios = { atkFis: 3, speed: 1 }

    resolverHit(world, player.id, enemy.id, 'psych_up')

    expect(player.estagios).toEqual({ atkFis: 3, speed: 1 })
  })

  it('Pain Split soma o HP dos dois e divide igual', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    player.poke.stats = { ...player.poke.stats, hp: 300 }
    player.poke.hp = 300
    enemy.poke.stats = { ...enemy.poke.stats, hp: 300 }
    enemy.poke.hp = 100

    resolverHit(world, player.id, enemy.id, 'pain_split')

    expect(player.poke.hp).toBe(200)
    expect(enemy.poke.hp).toBe(200)
  })

  it('Heal Block impede golpe de cura enquanto ativo', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    player.curaBloqueadaAte = 10
    player.poke.hp = Math.floor(player.poke.stats.hp / 2)
    const hpAntes = player.poke.hp

    resolverHit(world, player.id, enemy.id, 'synthesis')

    expect(player.poke.hp).toBe(hpAntes)
  })

  it('...mas cura normalmente quando nao esta bloqueado (prova que o teste acima vale)', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    player.poke.hp = Math.floor(player.poke.stats.hp / 2)
    const hpAntes = player.poke.hp

    resolverHit(world, player.id, enemy.id, 'synthesis')

    expect(player.poke.hp).toBeGreaterThan(hpAntes)
  })

  it('usar Heal Block no alvo trava a cura DELE por alguns turnos', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')

    resolverHit(world, player.id, enemy.id, 'heal_block')

    expect(enemy.curaBloqueadaAte).toBeGreaterThan(0)
  })

  it('Rest cura 100% do HP e aplica sleep de 2 turnos no proprio usuario', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    player.poke.hp = 1

    resolverHit(world, player.id, enemy.id, 'rest')

    expect(player.poke.hp).toBe(player.poke.stats.hp)
    expect(player.poke.status).toEqual({ tipo: 'sleep', turnosRestantes: 2 })
  })

  it('Belly Drum perde metade do HP MAXIMO e sobe Ataque Fisico ao teto (+6) de uma vez', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    player.poke.stats = { ...player.poke.stats, hp: 200 }
    player.poke.hp = 200

    resolverHit(world, player.id, enemy.id, 'belly_drum')

    expect(player.poke.hp).toBe(100)
    expect(player.estagios.atkFis).toBe(6)
  })

  it('Acupressure sobe UM stat aleatorio em +2', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')

    resolverHit(world, player.id, enemy.id, 'acupressure')

    const estagios = Object.values(player.estagios)
    expect(estagios).toHaveLength(1)
    expect(estagios[0]).toBe(2)
  })

  it('Aromatherapy/Heal Bell cura o proprio status (sem time de reserva neste motor)', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    player.poke.status = { tipo: 'poison', turnosRestantes: null }

    resolverHit(world, player.id, enemy.id, 'aromatherapy')

    expect(player.poke.status).toBeNull()
  })

  it('Lock-On/Mind Reader marca o proximo golpe do usuario contra aquele alvo', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')

    resolverHit(world, player.id, enemy.id, 'lock_on')

    expect(player.miraGarantidaAlvoId).toBe(enemy.id)
  })

  it('Guard Swap troca def/defEsp entre usuario e alvo (nao mexe em atkFis/atkEsp)', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    player.estagios = { def: 2, atkFis: 1 }
    enemy.estagios = { defEsp: -1 }

    resolverHit(world, player.id, enemy.id, 'guard_swap')

    expect(player.estagios).toEqual({ defEsp: -1, atkFis: 1 })
    expect(enemy.estagios).toEqual({ def: 2 })
  })

  it('Power Swap troca atkFis/atkEsp entre usuario e alvo (nao mexe em def/defEsp)', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    player.estagios = { atkFis: 2, def: 1 }
    enemy.estagios = { atkEsp: -3 }

    resolverHit(world, player.id, enemy.id, 'power_swap')

    expect(player.estagios).toEqual({ atkEsp: -3, def: 1 })
    expect(enemy.estagios).toEqual({ atkFis: 2 })
  })

  it('Soak forca o tipo do alvo pra Water (usado so na efetividade de dano recebido)', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'pikachu')

    resolverHit(world, player.id, enemy.id, 'soak')

    expect(enemy.tipoForcado).toBe('WATER')
  })

  it('Perish Song conta 3 turnos pros dois lados presentes e mata os dois', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')

    resolverHit(world, player.id, enemy.id, 'perish_song')
    expect(player.perishCountdown).toBe(3)
    expect(enemy.perishCountdown).toBe(3)

    for (let i = 0; i < 3; i++) updateCombat(world, TURNO_SEGUNDOS, { silent: true })

    expect(player.poke.hp).toBe(0)
    expect(enemy.poke.hp).toBe(0)
  })

  it('Psycho Shift transfere o status do usuario pro alvo e cura o usuario', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    player.poke.status = { tipo: 'burn', turnosRestantes: null }

    resolverHit(world, player.id, enemy.id, 'psycho_shift')

    expect(player.poke.status).toBeNull()
    expect(enemy.poke.status?.tipo).toBe('burn')
  })
})

describe('Fase 12: Traits passivas', () => {
  it('Sturdy (Geodude): sobrevive com 1 HP em cheio, mas so uma vez', () => {
    const { world, player, enemy } = cenarioDeSuporte('geodude', 'rattata')
    player.poke.stats = { ...player.poke.stats, hp: 30 }
    player.poke.hp = 30 // cheio
    enemy.poke.level = 50 // seismic_toss = 50 >= 30

    resolverHit(world, enemy.id, player.id, 'seismic_toss')
    expect(player.poke.hp).toBe(1)

    // HP nao esta mais cheio -- Sturdy nao segura uma segunda vez.
    resolverHit(world, enemy.id, player.id, 'seismic_toss')
    expect(player.poke.hp).toBe(0)
  })

  it('Synchronize (Abra): reflete paralisia de volta em quem aplicou', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'abra')
    const golpeForcado = { ...getAbility('thunder_wave')!, statusChance: 100 }

    resolverHitComAbility(world, player.id, enemy.id, golpeForcado)

    expect(enemy.poke.status?.tipo).toBe('paralysis')
    expect(player.poke.status?.tipo).toBe('paralysis')
  })

  it('Inner Focus (Zubat): imune a flinch', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'zubat')
    const golpeComFlinch = { ...getAbility('tackle')!, flinchChance: 100 }

    resolverHitComAbility(world, player.id, enemy.id, golpeComFlinch)

    // startGlobalCooldown SOBRESCREVE o valor (nao soma) -- se o flinch tivesse
    // pegado, isto teria caido pra TURNO_SEGUNDOS em vez de continuar em 999.
    expect(enemy.globalCooldown).toBe(999)
  })

  it('...sem Inner Focus, o mesmo flinch tranca o proximo turno normalmente', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'rattata')
    const golpeComFlinch = { ...getAbility('tackle')!, flinchChance: 100 }

    resolverHitComAbility(world, player.id, enemy.id, golpeComFlinch)

    expect(enemy.globalCooldown).toBe(TURNO_SEGUNDOS)
  })

  it('Quick Feet (Teddiursa): +50% Velocidade com status ativo, ignorando o corte de paralisia', () => {
    const { player } = cenarioDeSuporte('teddiursa', 'rattata')
    player.poke.stats = { ...player.poke.stats, speed: 100 }
    player.poke.status = { tipo: 'paralysis', turnosRestantes: null }

    // Sem Quick Feet, paralisia cortaria pela metade (50). Com Quick Feet
    // ativo, sobe 50% em vez disso (150) -- o oposto do que paralisia faria.
    expect(velocidadeEfetiva(player)).toBeCloseTo(150)
  })

  it('...sem status ativo, Quick Feet nao muda a Velocidade', () => {
    const { player } = cenarioDeSuporte('teddiursa', 'rattata')
    player.poke.stats = { ...player.poke.stats, speed: 100 }

    expect(velocidadeEfetiva(player)).toBe(100)
  })

  // Hustle/Guts/Huge Power em modo PESSIMISTA (sem critico, variacao fixa em
  // 0.85) pra dano deterministico: mesma DAMAGE_BASE calculada a mao —
  // floor(floor(floor(2*50/5+2)*40*atk/100)/50)+2, depois *0.85 e arredondado.
  // Tackle e NORMAL e nenhuma das tres especies usadas e NORMAL, entao STAB
  // nunca entra — o unico multiplicador em jogo e o da propria Trait.
  it('Hustle (Corsola): +50% de Ataque Fisico no dano real', () => {
    expect(multiplicadorDeAtaquePorTrait('hustle', true, false)).toBeCloseTo(1.5)
    expect(multiplicadorDeAtaquePorTrait('hustle', false, false)).toBe(1) // so no fisico

    const { world, player, enemy } = cenarioDeSuporte('corsola', 'rattata')
    world.pessimista = true
    player.poke.stats = { ...player.poke.stats, atkFis: 100 }
    enemy.poke.stats = { ...enemy.poke.stats, def: 100, hp: 999 }
    enemy.poke.hp = 999

    resolverHit(world, player.id, enemy.id, 'tackle')

    expect(enemy.poke.hp).toBe(999 - 24) // atk efetivo 150 -> dano 24 (ver conta acima)
  })

  it('Guts (Machop): +50% de Ataque Fisico SO com status alterado ativo', () => {
    const comStatus = cenarioDeSuporte('machop', 'rattata')
    comStatus.world.pessimista = true
    comStatus.player.poke.stats = { ...comStatus.player.poke.stats, atkFis: 100 }
    comStatus.enemy.poke.stats = { ...comStatus.enemy.poke.stats, def: 100, hp: 999 }
    comStatus.enemy.poke.hp = 999
    comStatus.player.poke.status = { tipo: 'poison', turnosRestantes: null } // poison nao mexe em dano fisico (so Guts entra)

    resolverHit(comStatus.world, comStatus.player.id, comStatus.enemy.id, 'tackle')
    expect(comStatus.enemy.poke.hp).toBe(999 - 24)

    const semStatus = cenarioDeSuporte('machop', 'rattata')
    semStatus.world.pessimista = true
    semStatus.player.poke.stats = { ...semStatus.player.poke.stats, atkFis: 100 }
    semStatus.enemy.poke.stats = { ...semStatus.enemy.poke.stats, def: 100, hp: 999 }
    semStatus.enemy.poke.hp = 999

    resolverHit(semStatus.world, semStatus.player.id, semStatus.enemy.id, 'tackle')
    expect(semStatus.enemy.poke.hp).toBe(999 - 16) // atk cru 100 -> dano 16, sem o bonus
  })

  it('Huge Power (Marill): dobra o Ataque Fisico no dano real', () => {
    const { world, player, enemy } = cenarioDeSuporte('marill', 'rattata')
    world.pessimista = true
    player.poke.stats = { ...player.poke.stats, atkFis: 100 }
    enemy.poke.stats = { ...enemy.poke.stats, def: 100, hp: 999 }
    enemy.poke.hp = 999

    resolverHit(world, player.id, enemy.id, 'tackle')

    expect(enemy.poke.hp).toBe(999 - 31) // atk efetivo 200 -> dano 31
  })

  it('Pure Power/Marvel Scale (funcao pura — sem dono no roster Gen1/2 atual)', () => {
    expect(multiplicadorDeAtaquePorTrait('pure_power', true, false)).toBe(2)
    expect(multiplicadorDeDefesaPorTrait('marvel_scale', true, true)).toBeCloseTo(1.5)
    expect(multiplicadorDeDefesaPorTrait('marvel_scale', true, false)).toBe(1) // so com status ativo
    expect(multiplicadorDeDefesaPorTrait('marvel_scale', false, true)).toBe(1) // so no fisico
  })
})
