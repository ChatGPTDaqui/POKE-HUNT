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
import { especialidadeNiveisDefault } from '@/data/especialidades'
import { createEnemyEntity } from '../entity'
import { criarInimigoDeTeste } from '../testes/inimigoDeTeste'
import { darEstagio } from '../testes/estagioDeTeste'
import { buildMapWorld } from '../simulation'
import {
  updateCombat, multiplicadorDeAtaquePorTrait, multiplicadorDeDefesaPorTrait, velocidadeEfetiva,
} from './combatSystem'

function construirCenarioExplosao(golpe = 'explosion') {
  const rng = createRng(1)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const jogadorPoke = createPokeInstance(rng, 'charmander', 50)
  jogadorPoke.unlockedAbilities = [golpe]
  // `activeAbilities` E o que a fila do jogador usa (golpesUtilizaveis) — sem
  // esta linha a escolha caia em `activeAbilitiesPadrao`, que deriva do
  // learnset da especie, e o filtro por `unlockedAbilities` a esvaziava: o POKE
  // lutava de Ataque Basico e o golpe sob teste nunca saia. Os dois testes
  // abaixo passavam de qualquer forma porque o jogador esta a 1 de HP e o
  // contra-ataque do inimigo bastava pra derruba-lo.
  jogadorPoke.activeAbilities = [golpe]
  // O AOE de nivel 50 vive fora dos 4 slots e ja esta desbloqueado neste
  // nivel — desligado pra sobrar so o golpe sob teste.
  jogadorPoke.disabledAbilities = { [typedAoeMoveKey(SPECIES.charmander.type)]: true }
  const world = buildMapWorld('route_46', jogadorPoke, { seed: 0, rng, counters })
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

  // PH-73: a chave da lista de auto-KO era `selfdestruct` e o catalogo do Ultra
  // Sun renomeou pra `self_destruct`. Enquanto ficou orfa, Autodestruicao
  // causava os 200 de poder EM AREA e quem usou nao pagava NADA — nuke de
  // graca. Aqui o teste e de COMPORTAMENTO; chavesDoCatalogo.test.ts cobre a
  // lista.
  //
  // O cenario e o OPOSTO do teste do PH-10 acima: jogador com HP CHEIO e
  // inimigo calado. Com o jogador a 1 de HP (como la), ele desmaiaria do
  // contra-ataque de qualquer forma e o teste passaria mesmo com o bug — foi
  // exatamente o que aconteceu na primeira versao deste teste.
  it('Autodestruicao cobra o mesmo custo de HP que Explosao', () => {
    const { world, player, enemy } = construirCenarioExplosao('self_destruct')
    player.poke.hp = player.poke.stats.hp
    // Inimigo calado: qualquer dano que ele fizesse se somaria ao custo do
    // golpe e o teste nao mediria mais so o auto-dano.
    const enemySpecies = SPECIES[enemy.poke.speciesId]
    enemy.poke.disabledAbilities = Object.fromEntries(
      [...golpesUtilizaveis(enemy.poke, enemySpecies, true), BASIC_ATTACK.id].map((id) => [id, true]),
    )

    updateCombat(world, 0)
    updateCombat(world, 999)

    // SELF_DESTRUCT_HP_LOSS_PERCENT e 0.5 do HP ATUAL — neste motor o golpe
    // custa metade da vida, nao a vida inteira (decisao de balanceamento: um
    // auto-KO de verdade encerraria a hunt do jogador).
    expect(player.poke.hp).toBeLessThanOrEqual(Math.ceil(player.poke.stats.hp / 2))
    expect(player.poke.hp).toBeGreaterThan(0)
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
// Os dois vivem FORA dos 4 slots (activeAbilities.ts) e por isso nao aparecem
// na tela de Equipes — o jeito de recusar cada um e o duplo-clique na barra de
// golpes, que grava em `disabledAbilities` (RPC `alternar_habilidade`). Estes
// testes travam o outro lado do contrato: que o combate REALMENTE obedece.
describe('AOE elemental e Ataque Basico sao opcionais', () => {
  function cenario(nivel: number) {
    const rng = createRng(7)
    const counters = { entity: 1, effect: 1, pendingHit: 1 }
    const jogadorPoke = createPokeInstance(rng, 'charmander', nivel)
    const world = buildMapWorld('route_46', jogadorPoke, { seed: 0, rng, counters })
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

  it('a Explosao Elemental some da rotacao quando desligada', () => {
    const aoe = typedAoeMoveKey(SPECIES.charmander.type)

    // Desde 2026-08-18 ela SO entra se o jogador gastar um slot nela — nao ha
    // mais anexo automatico depois dos 4. O liga/desliga continua existindo em
    // cima disso, e e o que este teste cobre.
    const ligado = cenario(60)
    ligado.player.poke.activeAbilities = [aoe]
    expect(golpesUtilizaveis(ligado.player.poke, SPECIES[ligado.player.poke.speciesId], false)).toContain(aoe)

    const desligado = cenario(60)
    desligado.player.poke.activeAbilities = [aoe]
    desligado.player.poke.disabledAbilities = { [aoe]: true }
    expect(golpesUsados(desligado, 40).has(aoe)).toBe(false)
  })

  it('o Ataque Basico some da rotacao quando desligado, mesmo sendo o unico slot', () => {
    const mundo = cenario(3)
    // Unico golpe escolhido: se o desligamento nao valesse, ele seria usado a
    // forca — e o caso mais apertado do contrato.
    mundo.player.poke.activeAbilities = [BASIC_ATTACK.id]
    mundo.player.poke.disabledAbilities = { [BASIC_ATTACK.id]: true }

    expect(golpesUsados(mundo, 40).has(BASIC_ATTACK.id)).toBe(false)
  })

  it('...e continua sendo usado quando NAO esta desligado (prova que o teste acima vale)', () => {
    const mundo = cenario(3)
    mundo.player.poke.activeAbilities = [BASIC_ATTACK.id]

    expect(golpesUsados(mundo, 40).has(BASIC_ATTACK.id)).toBe(true)
  })

  // O outro lado da mesma regra, e a mudanca de comportamento mais facil de
  // confundir com bug: SEM o Ataque Basico num slot, o POKE do jogador nao
  // recebe nenhum golpe de graca. Ate 2026-08-18 ele era injetado na rotacao
  // pelo motor; agora quem nao o escolhe simplesmente nao o usa.
  it('sem nenhum slot escolhido, o jogador NAO ganha o Ataque Basico de graca', () => {
    const mundo = cenario(3)
    mundo.player.poke.activeAbilities = []

    expect(golpesUsados(mundo, 40).size).toBe(0)
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

// Pedido explicito do usuario: com golpes de buff/debuff/area no jogo, quem
// decide QUANDO usar cada golpe e o jogador pela ordem dos 4 slots — nao mais
// uma IA que sempre repete o(s) golpe(s) de maior dano esperado e deixa o
// resto do moveset parado. `pickAbilityDaFila` percorre `activeAbilities` a
// partir de `filaGolpeIndex`, avancando so quando um golpe da fila e de fato
// escolhido.
describe('POKE do jogador usa os golpes na ordem escolhida (fila), nao so o de maior dano', () => {
  function cenarioFila() {
    const rng = createRng(3)
    const counters = { entity: 1, effect: 1, pendingHit: 1 }
    const jogadorPoke = createPokeInstance(rng, 'charmander', 60)
    // scratch/ember/flamethrower: dano bem diferente entre si (o ranking
    // greedy antigo travaria sempre no de maior dano esperado, flamethrower).
    jogadorPoke.unlockedAbilities = [...jogadorPoke.unlockedAbilities, 'flamethrower']
    jogadorPoke.activeAbilities = ['scratch', 'ember', 'flamethrower']
    // Ataque Basico agora tem posicao fixa na fila (pickAbility injeta) —
    // desligado aqui pra isolar a ordem dos 3 slots escolhidos, que e o que
    // este cenario testa. Comportamento do Basico tem describe proprio mais
    // abaixo.
    jogadorPoke.disabledAbilities = {
      [typedAoeMoveKey(SPECIES.charmander.type)]: true,
      [BASIC_ATTACK.id]: true,
    }
    const world = buildMapWorld('route_46', jogadorPoke, { seed: 0, rng, counters })
    const player = world.player!
    player.cooldowns = {}
    player.globalCooldown = 0
    player.poke.stats = { ...player.poke.stats, hp: 999999 }
    player.poke.hp = 999999

    const enemyPoke = createPokeInstance(rng, 'rattata', 60)
    enemyPoke.stats = { ...enemyPoke.stats, hp: 999999, atkFis: 1, atkEsp: 1 }
    enemyPoke.hp = 999999
    const enemy = createEnemyEntity(world.counters, {
      poke: enemyPoke, x: player.x, y: player.y, encounterId: 'route_46_rattata',
    })
    enemy.state = 'engaged'
    enemy.targetId = player.id
    world.enemies = [enemy]
    return { world, player, enemy }
  }

  it('percorre os 3 golpes de dano na ordem dos slots em vez de travar no de maior dano esperado', () => {
    const { world, player } = cenarioFila()
    const escolhas: string[] = []
    // Cooldown zerado a cada volta (mesmo truque do teste de precisao acima):
    // isola a ESCOLHA de pickAbility do tempo real de recarga de cada golpe.
    for (let i = 0; i < 6; i++) {
      player.cooldowns = {}
      player.globalCooldown = 0
      updateCombat(world, 1, { silent: true })
      if (player.lastUsedAbilityId) escolhas.push(player.lastUsedAbilityId)
    }
    // Prova o bug relatado: o ranking antigo (maior dano esperado) escolheria
    // SEMPRE flamethrower (90 de poder) e nunca scratch/ember — os 6 turnos
    // seriam ['flamethrower', 'flamethrower', ...]. Com a fila, os 3 primeiros
    // turnos ja cobrem os 3 slots na ordem exata escolhida.
    expect(escolhas.slice(0, 3)).toEqual(['scratch', 'ember', 'flamethrower'])
    // E a fila e CICLICA: volta pro comeco em vez de parar no ultimo.
    expect(escolhas.slice(3, 6)).toEqual(['scratch', 'ember', 'flamethrower'])
  })

  it('golpe da vez em cooldown nao trava o turno — pula pro proximo pronto sem perder a ordem', () => {
    const { world, player } = cenarioFila()
    // scratch (1o da fila) fica preso em cooldown por varios turnos —
    // ember/flamethrower devem continuar sendo usados no meio tempo.
    player.cooldowns = { scratch: 999 }
    player.globalCooldown = 0
    updateCombat(world, 1, { silent: true })
    expect(player.lastUsedAbilityId).toBe('ember')
    player.globalCooldown = 0
    updateCombat(world, 1, { silent: true })
    expect(player.lastUsedAbilityId).toBe('flamethrower')

    // scratch libera: a fila retoma dele, sem ter "perdido a vez" pra sempre.
    player.cooldowns = {}
    player.globalCooldown = 0
    updateCombat(world, 1, { silent: true })
    expect(player.lastUsedAbilityId).toBe('scratch')
  })
})

// O Ataque Basico participa da fila como QUALQUER outro golpe, na posicao em
// que o jogador o colocou. Ate 2026-08-18 ele era injetado pelo motor como
// posicao fixa e gratuita antes dos 4 slots; agora ele gasta um dos 4 (pedido
// explicito do usuario). O que NAO mudou: quando esta na fila, ele executa
// toda vez que a vez dele chega e nao esta em cooldown, mesmo com golpe forte
// pronto — custa DPS, e agora isso e escolha do jogador.
//
// Ele NAO atualiza `lastUsedAbilityId` (ver executePlayerAction), entao o
// sinal de que foi escolhido e o proprio `cooldowns[BASIC_ATTACK.id]`.
describe('Ataque Basico na fila do jogador', () => {
  function cenarioFilaComBasico() {
    const rng = createRng(3)
    const counters = { entity: 1, effect: 1, pendingHit: 1 }
    const jogadorPoke = createPokeInstance(rng, 'charmander', 60)
    jogadorPoke.unlockedAbilities = [...jogadorPoke.unlockedAbilities, 'flamethrower']
    // Basico na PRIMEIRA posicao: e a mesma ordem que o describe testava
    // quando o motor o injetava sozinho, agora escrita como escolha.
    jogadorPoke.activeAbilities = [BASIC_ATTACK.id, 'scratch', 'ember', 'flamethrower']
    jogadorPoke.disabledAbilities = { [typedAoeMoveKey(SPECIES.charmander.type)]: true }
    const world = buildMapWorld('route_46', jogadorPoke, { seed: 0, rng, counters })
    const player = world.player!
    player.cooldowns = {}
    player.globalCooldown = 0
    player.poke.stats = { ...player.poke.stats, hp: 999999 }
    player.poke.hp = 999999

    const enemyPoke = createPokeInstance(rng, 'rattata', 60)
    enemyPoke.stats = { ...enemyPoke.stats, hp: 999999, atkFis: 1, atkEsp: 1 }
    enemyPoke.hp = 999999
    const enemy = createEnemyEntity(world.counters, {
      poke: enemyPoke, x: player.x, y: player.y, encounterId: 'route_46_rattata',
    })
    enemy.state = 'engaged'
    enemy.targetId = player.id
    world.enemies = [enemy]
    return { world, player, enemy }
  }

  it('executa na 1a posicao da fila mesmo com golpe de verdade pronto', () => {
    const { world, player } = cenarioFilaComBasico()
    updateCombat(world, 1, { silent: true })
    // PH-176: cooldown so arma quando o hit pousa (HIT_LAND_DELAY), nao mais
    // no disparo — sem resetar globalCooldown, este 2o tick so deixa o hit ja
    // enfileirado pousar, nao dispara acao nova.
    updateCombat(world, 1, { silent: true })
    expect(player.cooldowns[BASIC_ATTACK.id]).toBeGreaterThan(0)
    expect(player.lastUsedAbilityId).toBeUndefined()

    // Fila avancou pra posicao 1 (scratch), que atualiza lastUsedAbilityId.
    player.globalCooldown = 0
    updateCombat(world, 1, { silent: true })
    expect(player.lastUsedAbilityId).toBe('scratch')
  })

  it('pula Ataque Basico quando ele esta em cooldown, sem travar o turno', () => {
    const { world, player } = cenarioFilaComBasico()
    player.cooldowns[BASIC_ATTACK.id] = 999
    updateCombat(world, 1, { silent: true })
    expect(player.lastUsedAbilityId).toBe('scratch')
  })

  it('loop e ciclico: volta pro Ataque Basico depois do ultimo slot', () => {
    const { world, player } = cenarioFilaComBasico()
    const usouBasico: boolean[] = []
    // 4 posicoes: basico, scratch, ember, flamethrower. 5 voltas cobre um
    // ciclo completo + a volta seguinte, provando que nao para no ultimo.
    for (let i = 0; i < 5; i++) {
      player.cooldowns = {}
      player.globalCooldown = 0
      updateCombat(world, 1, { silent: true })
      // PH-176: deixa o hit pousar (HIT_LAND_DELAY) antes de ler o cooldown
      // como sinal de "foi escolhido" — sem resetar globalCooldown, nao
      // dispara acao nova.
      updateCombat(world, 1, { silent: true })
      usouBasico.push((player.cooldowns[BASIC_ATTACK.id] ?? 0) > 0)
    }
    expect(usouBasico).toEqual([true, false, false, false, true])
  })

  it('desligado pelo jogador, sai completamente da rotacao', () => {
    const { world, player } = cenarioFilaComBasico()
    player.poke.disabledAbilities = { ...player.poke.disabledAbilities, [BASIC_ATTACK.id]: true }
    updateCombat(world, 1, { silent: true })
    expect(player.lastUsedAbilityId).toBe('scratch')
    expect(player.cooldowns[BASIC_ATTACK.id]).toBeUndefined()
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
    // do teste de precisao acima). Ataque Basico agora tem posicao fixa na
    // fila (pickAbility injeta) — desligado pelo mesmo motivo, senao ele
    // rouba o primeiro turno do golpe sob teste.
    jogadorPoke.disabledAbilities = {
      [typedAoeMoveKey(SPECIES[especieJogador].type)]: true,
      [BASIC_ATTACK.id]: true,
    }
    const world = buildMapWorld('route_46', jogadorPoke, { seed: 0, rng, counters })
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
      updateCombat(world, 0.6) // hit pousa (HIT_LAND_DELAY=0.3) -> wish entra na fila
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

// Jogador + UM inimigo engajado, globalCooldown alto nos dois lados (trava
// qualquer ACAO nova neste tick). `enemy.state === 'engaged'` continua
// verdadeiro pra `engagedEnemies.length > 0` e o combate NAO cair no ramo de
// "fim de batalha" (que chamaria `limparEstadoVolatil` e apagaria os campos
// volateis que os testes acabaram de setar).
/**
 * `traits` explicitas desde 2026-08-18: a habilidade deixou de ser propriedade
 * da ESPECIE e virou sorteio por INDIVIDUO entre os slots reais dela
 * (src/data/traits.ts). Marill nasce Thick Fat OU Huge Power; um teste que
 * mede Huge Power precisa dizer qual dos dois este Marill tirou, senao ele
 * mede o sorteio e nao a mecanica.
 */
function cenarioDeSuporte(
  especieJogador: string,
  especieInimigo: string,
  nivel = 50,
  traits: { jogador?: string; inimigo?: string } = {},
) {
  const rng = createRng(1)
  const jogadorPoke = createPokeInstance(rng, especieJogador, nivel)
  if (traits.jogador) jogadorPoke.trait = traits.jogador
  const world = buildMapWorld('route_46', jogadorPoke, { seed: 0, rng, counters: { entity: 1, effect: 1, pendingHit: 1 } })
  const player = world.player!
  player.cooldowns = {}
  player.globalCooldown = 999

  const enemy = criarInimigoDeTeste(world, especieInimigo, nivel, { x: player.x, y: player.y })
  if (traits.inimigo) enemy.poke.trait = traits.inimigo
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
    darEstagio(player, 'atkFis', -1, { proprio: false, id: 'growl' })
    darEstagio(enemy, 'atkFis', 3, { id: 'swords_dance' })
    darEstagio(enemy, 'speed', 1, { id: 'agility' })

    resolverHit(world, player.id, enemy.id, 'psych_up')

    // PH-418: copia as FONTES com prazo cheio, e nao o cache — senao o estagio
    // copiado nasceria sem prazo e ficaria eterno no usuario.
    expect(player.estagios).toEqual({ atkFis: 3, speed: 1 })
    expect(player.estagiosFonte?.atkFis?.map((f) => f.id)).toEqual(['swords_dance'])
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
    const { world, player, enemy } = cenarioDeSuporte('geodude', 'rattata', 50, { jogador: 'sturdy' })
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
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'abra', 50, { inimigo: 'synchronize' })
    const golpeForcado = { ...getAbility('thunder_wave')!, statusChance: 100 }

    resolverHitComAbility(world, player.id, enemy.id, golpeForcado)

    expect(enemy.poke.status?.tipo).toBe('paralysis')
    expect(player.poke.status?.tipo).toBe('paralysis')
  })

  it('Inner Focus (Zubat): imune a flinch', () => {
    const { world, player, enemy } = cenarioDeSuporte('rattata', 'zubat', 50, { inimigo: 'inner_focus' })
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
    const { player } = cenarioDeSuporte('teddiursa', 'rattata', 50, { jogador: 'quick_feet' })
    player.poke.stats = { ...player.poke.stats, speed: 100 }
    player.poke.status = { tipo: 'paralysis', turnosRestantes: null }

    // Sem Quick Feet, paralisia cortaria pela metade (50). Com Quick Feet
    // ativo, sobe 50% em vez disso (150) -- o oposto do que paralisia faria.
    expect(velocidadeEfetiva(player)).toBeCloseTo(150)
  })

  it('...sem status ativo, Quick Feet nao muda a Velocidade', () => {
    const { player } = cenarioDeSuporte('teddiursa', 'rattata', 50, { jogador: 'quick_feet' })
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

    const { world, player, enemy } = cenarioDeSuporte('corsola', 'rattata', 50, { jogador: 'hustle' })
    world.pessimista = true
    player.poke.stats = { ...player.poke.stats, atkFis: 100 }
    enemy.poke.stats = { ...enemy.poke.stats, def: 100, hp: 999 }
    enemy.poke.hp = 999

    resolverHit(world, player.id, enemy.id, 'tackle')

    expect(enemy.poke.hp).toBe(999 - 24) // atk efetivo 150 -> dano 24 (ver conta acima)
  })

  it('Guts (Machop): +50% de Ataque Fisico SO com status alterado ativo', () => {
    const comStatus = cenarioDeSuporte('machop', 'rattata', 50, { jogador: 'guts' })
    comStatus.world.pessimista = true
    comStatus.player.poke.stats = { ...comStatus.player.poke.stats, atkFis: 100 }
    comStatus.enemy.poke.stats = { ...comStatus.enemy.poke.stats, def: 100, hp: 999 }
    comStatus.enemy.poke.hp = 999
    comStatus.player.poke.status = { tipo: 'poison', turnosRestantes: null } // poison nao mexe em dano fisico (so Guts entra)

    resolverHit(comStatus.world, comStatus.player.id, comStatus.enemy.id, 'tackle')
    expect(comStatus.enemy.poke.hp).toBe(999 - 24)

    const semStatus = cenarioDeSuporte('machop', 'rattata', 50, { jogador: 'guts' })
    semStatus.world.pessimista = true
    semStatus.player.poke.stats = { ...semStatus.player.poke.stats, atkFis: 100 }
    semStatus.enemy.poke.stats = { ...semStatus.enemy.poke.stats, def: 100, hp: 999 }
    semStatus.enemy.poke.hp = 999

    resolverHit(semStatus.world, semStatus.player.id, semStatus.enemy.id, 'tackle')
    expect(semStatus.enemy.poke.hp).toBe(999 - 16) // atk cru 100 -> dano 16, sem o bonus
  })

  it('Huge Power (Marill): dobra o Ataque Fisico no dano real', () => {
    const { world, player, enemy } = cenarioDeSuporte('marill', 'rattata', 50, { jogador: 'huge_power' })
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

// GOLPE DE MULTIPLOS ACERTOS (PH-68). O `power` desses 16 golpes e POR ACERTO
// (15 a 40) e o motor batia UMA vez — ~1/3 do dano pretendido. Nao era slot
// desperdicado: desde 2026-08-18 o POKE do jogador roda a fila dos 4 slots sem
// fallback pro Ataque Basico (poder 40), entao Fury Attack (15) gastava o turno
// batendo menos da metade do golpe gratuito. Ver data/abilities.ts#MULTI_HIT_OVERRIDES.
describe('golpe de multiplos acertos', () => {
  function cenarioMultiAcerto(golpeId: string, semente = 7) {
    const rng = createRng(semente)
    const counters = { entity: 1, effect: 1, pendingHit: 1 }
    // Atacante FRACO (nivel 5) contra alvo forte (nivel 60) de proposito: o
    // alvo precisa SOBREVIVER aos 5 acertos, senao a sequencia para no KO e o
    // teste mediria a morte em vez da contagem de acertos.
    const jogadorPoke = createPokeInstance(rng, 'charmander', 5)
    jogadorPoke.unlockedAbilities = [...jogadorPoke.unlockedAbilities, golpeId]
    jogadorPoke.activeAbilities = [golpeId]
    jogadorPoke.disabledAbilities = {
      [typedAoeMoveKey(SPECIES.charmander.type)]: true,
      [BASIC_ATTACK.id]: true,
    }
    const world = buildMapWorld('route_46', jogadorPoke, { seed: 0, rng, counters })
    const player = world.player!
    player.cooldowns = {}
    player.globalCooldown = 0

    const enemyPoke = createPokeInstance(rng, 'rattata', 60)
    const enemySpecies = SPECIES[enemyPoke.speciesId]
    // Inimigo silenciado: um contra-ataque dele somaria numeros de dano no
    // mesmo `world.effects` que este teste conta.
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

  // Um uso do golpe: `updateCombat(0)` enfileira o hit e `updateCombat(0.6)`
  // pousa ele (HIT_LAND_DELAY e 0.3s). 0.6 e menor que MIN_ACTION_GAP (o turno), ou
  // seja o POKE nao age de novo e cada numero de dano contado abaixo pertence a
  // ESTE uso.
  function umUsoDoGolpe(world: ReturnType<typeof cenarioMultiAcerto>['world']) {
    updateCombat(world, 0)
    updateCombat(world, 0.6)
    return world.effects.filter((e) => e.type === 'damageNumber').map((e) => e.value ?? 0)
  }

  it('fury_swipes acerta de 2 a 5 vezes, e o HP perdido e a soma dos acertos', () => {
    const { world, enemy } = cenarioMultiAcerto('fury_swipes')
    const hpAntes = enemy.poke.hp

    const acertos = umUsoDoGolpe(world)

    expect(acertos.length).toBeGreaterThanOrEqual(2)
    expect(acertos.length).toBeLessThanOrEqual(5)
    expect(enemy.poke.hp).toBeGreaterThan(0) // o cenario garante que ele sobrevive
    expect(hpAntes - enemy.poke.hp).toBe(acertos.reduce((s, n) => s + n, 0))
  })

  it('double_kick acerta exatamente 2 vezes (contagem fixa, sem sorteio)', () => {
    const { world } = cenarioMultiAcerto('double_kick')
    expect(umUsoDoGolpe(world)).toHaveLength(2)
  })

  it('golpe normal continua com um acerto so', () => {
    const { world } = cenarioMultiAcerto('scratch')
    expect(umUsoDoGolpe(world)).toHaveLength(1)
  })
})

// PH-198: os testes de `data/especialidades.test.ts` cobrem a MATEMATICA do
// multiplicador isolada; estes cobrem a FIACAO — que `computeDamage` recebe
// `world.especialidadeNiveis` de verdade e aplica no dano que sai do combate,
// nao so numa funcao pura desacompanhada do resto do pipeline.
describe('Especialidades (PH-198) aplicam no dano real do combate', () => {
  it('bonus de ataque FIRE nivel 5 aumenta em ~5% o dano causado pelo jogador', () => {
    function cenarioOfensivo(especialidadeNiveis: ReturnType<typeof especialidadeNiveisDefault> | null) {
      const rng = createRng(7)
      const counters = { entity: 1, effect: 1, pendingHit: 1 }
      const jogadorPoke = createPokeInstance(rng, 'charmander', 50)
      // Ember e o unico golpe ativo: dano previsivel, sempre FIRE (STAB).
      jogadorPoke.activeAbilities = ['ember']
      const world = buildMapWorld('route_46', jogadorPoke, { seed: 0, rng, counters }, undefined, especialidadeNiveis)
      const player = world.player!
      player.cooldowns = {}
      player.globalCooldown = 0

      const enemyPoke = createPokeInstance(rng, 'rattata', 50)
      const enemyHpAntes = enemyPoke.hp
      const enemy = createEnemyEntity(world.counters, {
        poke: enemyPoke, x: player.x, y: player.y, encounterId: 'route_46_rattata',
      })
      enemy.state = 'engaged'
      enemy.targetId = player.id
      // Trava o contra-ataque: so o dano CAUSADO pelo jogador entra na medicao.
      enemy.globalCooldown = 999
      world.enemies = [enemy]
      return { world, enemy, enemyHpAntes }
    }

    const niveisMax = especialidadeNiveisDefault()
    niveisMax.FIRE = { dano: 5, defesa: 0 }

    const semBonus = cenarioOfensivo(null)
    updateCombat(semBonus.world, 0)
    updateCombat(semBonus.world, 999)

    const comBonus = cenarioOfensivo(niveisMax)
    updateCombat(comBonus.world, 0)
    updateCombat(comBonus.world, 999)

    const danoSemBonus = semBonus.enemyHpAntes - semBonus.enemy.poke.hp
    const danoComBonus = comBonus.enemyHpAntes - comBonus.enemy.poke.hp

    // Mesma seed, mesma sequencia de chamadas dos dois lados -> os sorteios de
    // critico/variacao de dano saem identicos, entao a diferenca so pode vir
    // do multiplicador de Especialidade.
    expect(danoSemBonus).toBeGreaterThan(0)
    expect(danoComBonus).toBeGreaterThan(danoSemBonus)
    expect(danoComBonus / danoSemBonus).toBeCloseTo(1.05, 2)
  })

  it('reducao de defesa NORMAL nivel 5 diminui em ~5% o dano recebido pelo jogador', () => {
    function cenarioDefensivo(especialidadeNiveis: ReturnType<typeof especialidadeNiveisDefault> | null) {
      const rng = createRng(9)
      const counters = { entity: 1, effect: 1, pendingHit: 1 }
      const jogadorPoke = createPokeInstance(rng, 'charmander', 50)
      const world = buildMapWorld('route_46', jogadorPoke, { seed: 0, rng, counters }, undefined, especialidadeNiveis)
      const player = world.player!
      // Jogador nunca ataca: so o dano RECEBIDO entra na medicao.
      player.globalCooldown = 999
      const playerHpAntes = player.poke.hp

      const enemyPoke = createPokeInstance(rng, 'rattata', 50)
      const enemySpecies = SPECIES.rattata
      // Toda a lista selvagem desligada -> cai no Ataque Basico, que herda o
      // tipo da especie (NORMAL pro Rattata, STAB) — mesmo golpe previsivel
      // dos dois lados.
      enemyPoke.disabledAbilities = Object.fromEntries(
        golpesUtilizaveis(enemyPoke, enemySpecies, true).map((id) => [id, true]),
      )
      const enemy = createEnemyEntity(world.counters, {
        poke: enemyPoke, x: player.x, y: player.y, encounterId: 'route_46_rattata',
      })
      enemy.state = 'engaged'
      enemy.targetId = player.id
      enemy.cooldowns = {}
      enemy.globalCooldown = 0
      world.enemies = [enemy]
      return { world, player, playerHpAntes }
    }

    const niveisMax = especialidadeNiveisDefault()
    niveisMax.NORMAL = { dano: 0, defesa: 5 }

    const semReducao = cenarioDefensivo(null)
    updateCombat(semReducao.world, 0)
    updateCombat(semReducao.world, 999)

    const comReducao = cenarioDefensivo(niveisMax)
    updateCombat(comReducao.world, 0)
    updateCombat(comReducao.world, 999)

    const danoSemReducao = semReducao.playerHpAntes - semReducao.player.poke.hp
    const danoComReducao = comReducao.playerHpAntes - comReducao.player.poke.hp

    expect(danoSemReducao).toBeGreaterThan(0)
    expect(danoComReducao).toBeLessThan(danoSemReducao)
    // Precisao menor que o teste ofensivo (1 casa, nao 2): o dano bruto aqui e
    // pequeno o bastante (Rattata nivel 50 batendo com Ataque Basico) pra o
    // arredondamento pra HP inteiro pesar no percentual — 5% de um numero
    // pequeno e menos de 1 HP.
    expect(danoComReducao / danoSemReducao).toBeCloseTo(0.95, 1)
  })
})
