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
import { BASIC_ATTACK } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import { typedAoeMoveKey } from '@/data/typedAoeMoves'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import { updateCombat } from './combatSystem'

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
