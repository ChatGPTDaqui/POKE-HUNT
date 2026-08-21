// Salas: a hunt e percorrida em 10 sub-biomas sorteados, e limpar a quota de
// abates leva pra proxima.
//
// Toda falha aqui e silenciosa. Uma sala que nao avanca deixa o jogador no
// mesmo sub-bioma pra sempre e nada no jogo denuncia; um pool de sala ignorado
// faz o spawn voltar a ser o da hunt inteira e a feature simplesmente nao
// existe, tambem sem erro. Foi assim que o `sequenceIndex` do Campeao Lance
// ficou quebrado por levas.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld } from './simulation'
import {
  janelaDaSala, poolAtivo, registrarAbate, temSalas, aplicarTransicaoDeSala, SALA_TRANSITION_COUNTDOWN,
  reconciliarSalaDaAutoridade, ESPERA_MAXIMA_PELA_AUTORIDADE,
} from './systems/salaSystem'
import { POOL_POR_SALA } from '@/data/huntSpawnOverrides'
import { ABATES_POR_SALA, SALAS_POR_HUNT } from '@/data/biomas'
import { ENCOUNTERS } from '@/data/huntSpawnOverrides'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { WorldState } from './types'

const HUNT = 'mata_faixa1'

function mundo(semente: number, mapa = HUNT): WorldState {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', 20)
  return buildMapWorld(mapa, poke, {
    rng: createRng(semente),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
}

/**
 * Conta abates direto, sem esperar o combate — o alvo aqui e a maquina de
 * salas. Ao fechar a quota, `registrarAbate` so ARMA a transicao (ver
 * salaSystem.ts); resolve na hora (equivalente a um tick de `stepWorld` com
 * dt >= SALA_TRANSITION_COUNTDOWN) pra poder continuar contando abates da
 * sala seguinte no mesmo loop.
 */
function abater(world: WorldState, quantos: number) {
  const eventos = []
  for (let i = 0; i < quantos; i++) {
    eventos.push(registrarAbate(world, world.mapDef!.id))
    if (world.salaCountdownRemaining != null) {
      aplicarTransicaoDeSala(world, world.mapDef!.id)
      world.salaCountdownRemaining = null
    }
  }
  return eventos
}

describe('salas', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('hunt de bioma nasce dentro de uma sala; inicial e BOSS nao tem sala', () => {
    expect(temSalas(HUNT)).toBe(true)
    expect(temSalas('route_46')).toBe(false)
    expect(temSalas('boss_lance')).toBe(false)

    const world = mundo(1)
    expect(world.sala).not.toBeNull()
    expect(world.sala!.indice).toBe(0)
    expect(world.sala!.abates).toBe(0)
    expect(world.sala!.ciclos).toBe(0)
    expect(POOL_POR_SALA[HUNT][world.sala!.chave]).toBeTruthy()

    expect(mundo(1, 'route_46').sala).toBeNull()
    expect(mundo(1, 'boss_lance').sala).toBeNull()
  })

  it('a sala avanca exatamente na quota de abates, nao antes', () => {
    const world = mundo(2)
    const antes = world.sala!.chave

    const parciais = abater(world, ABATES_POR_SALA - 1)
    expect(parciais.every((e) => !e.avancou)).toBe(true)
    expect(world.sala!.indice).toBe(0)
    expect(world.sala!.abates).toBe(ABATES_POR_SALA - 1)
    expect(world.salaCountdownRemaining).toBeNull()

    // O abate que fecha a quota so ARMA a transicao — a sala AINDA e a
    // antiga ate a contagem regressiva zerar (ver salaSystem.ts).
    const ultimo = registrarAbate(world, world.mapDef!.id)
    expect(ultimo.avancou).toBe(true)
    expect(ultimo.fechouCiclo).toBe(false)
    expect(world.sala!.indice).toBe(0)
    expect(world.salaCountdownRemaining).toBe(SALA_TRANSITION_COUNTDOWN)
    expect(world.salaPendente).not.toBeNull()
    expect(world.salaPendente!.indice).toBe(1)

    aplicarTransicaoDeSala(world, world.mapDef!.id)
    expect(world.sala!.indice).toBe(1)
    expect(world.sala!.abates).toBe(0)
    expect(world.salaPendente).toBeNull()
    // A sala nova pode calhar de ser o mesmo sub-bioma (o sorteio e com
    // reposicao); o que nao pode e o contador nao zerar.
    expect(typeof world.sala!.chave).toBe('string')
    expect(antes).toBeTruthy()
  })

  it('a contagem regressiva entre salas congela o mundo e troca tudo do zero ao zerar', () => {
    const world = mundo(6)
    const gameState = useGameStateStore.getState()

    for (let i = 0; i < ABATES_POR_SALA; i++) registrarAbate(world, world.mapDef!.id)
    expect(world.salaCountdownRemaining).toBe(SALA_TRANSITION_COUNTDOWN)
    expect(world.sala!.indice).toBe(0)

    // Congelado: um tick pequeno so desconta a contagem, nada mais muda.
    const enemiesAntes = world.enemies.length
    stepWorld(world, 0.1, gameState, { silent: true })
    expect(world.sala!.indice).toBe(0)
    expect(world.enemies.length).toBe(enemiesAntes)

    // Tick grande o bastante zera a contagem: sala nova, area do zero.
    stepWorld(world, SALA_TRANSITION_COUNTDOWN, gameState, { silent: true })
    expect(world.salaCountdownRemaining).toBeNull()
    expect(world.sala!.indice).toBe(1)
    expect(world.sala!.abates).toBe(0)
    expect(world.enemies.length).toBeGreaterThan(0)
    const daSalaNova = new Set(POOL_POR_SALA[HUNT][world.sala!.chave].map((id) => ENCOUNTERS[id].speciesId))
    for (const inimigo of world.enemies) {
      expect(daSalaNova.has(inimigo.poke.speciesId)).toBe(true)
    }
  })

  it('fechar as 10 salas reinicia o ciclo em vez de acabar a hunt', () => {
    const world = mundo(3)
    // Um ciclo inteiro menos o ultimo abate.
    const eventos = abater(world, ABATES_POR_SALA * SALAS_POR_HUNT)
    const fechamentos = eventos.filter((e) => e.fechouCiclo)

    expect(fechamentos.length).toBe(1)
    expect(world.sala!.indice).toBe(0)
    expect(world.sala!.ciclos).toBe(1)
    // "Acabar a hunt" faria 6 horas de farm offline valerem os poucos minutos
    // ate a sala 10.
    expect(world.sala).not.toBeNull()
  })

  it('so nasce inimigo do pool da sala atual', () => {
    const world = mundo(4)
    const daSala = new Set(POOL_POR_SALA[HUNT][world.sala!.chave])
    const especiesDaSala = new Set([...daSala].map((id) => ENCOUNTERS[id].speciesId))

    // O mundo ja nasce com `maxEnemies` inimigos; todos tem que vir da sala.
    expect(world.enemies.length).toBeGreaterThan(0)
    for (const inimigo of world.enemies) {
      expect(especiesDaSala.has(inimigo.poke.speciesId), `${inimigo.poke.speciesId} fora da sala ${world.sala!.chave}`).toBe(true)
    }

    // E o respawn, que roda por outro caminho no stepWorld, tambem.
    const gameState = useGameStateStore.getState()
    for (let i = 0; i < 3000; i++) stepWorld(world, 0.1, gameState, { silent: true })
    const salaAgora = world.sala!.chave
    const permitidas = new Set(POOL_POR_SALA[HUNT][salaAgora].map((id) => ENCOUNTERS[id].speciesId))
    for (const inimigo of world.enemies) {
      expect(permitidas.has(inimigo.poke.speciesId), `${inimigo.poke.speciesId} fora da sala ${salaAgora}`).toBe(true)
    }
  })

  it('a sala sobrevive a reconstrucao do mundo', () => {
    // Este e o teste que o Campeao Lance nao tinha. O servidor reconstroi o
    // mundo a cada janela de flush (~30s); sem passar o progresso, a hunt
    // voltaria pra sala 1 de meio em meio minuto pra sempre.
    const poke = createPokeInstance(createRng(5), 'charmander', 20)
    const salva = { indice: 6, chave: 'jungle', abates: 4, ciclos: 2 }
    const world = buildMapWorld(
      HUNT, poke,
      { rng: createRng(5), counters: { entity: 1, effect: 1, pendingHit: 1 } },
      { sala: salva },
    )
    expect(world.sala).toEqual(salva)

    const permitidas = new Set(POOL_POR_SALA[HUNT].jungle.map((id) => ENCOUNTERS[id].speciesId))
    for (const inimigo of world.enemies) {
      expect(permitidas.has(inimigo.poke.speciesId)).toBe(true)
    }
  })

  it('sem sala, o pool ativo e o da hunt inteira', () => {
    const inteiro = ['a', 'b']
    expect(poolAtivo(HUNT, null, inteiro)).toBe(inteiro)
  })

  // Uma faixa cobre 30 niveis. Sem a janela, a PRIMEIRA sala ja podia jogar um
  // POKE Lv30 contra quem acabou de sair do Hospital — medido no motor
  // headless: Charmander Lv25 morreu em 4 abates em 30 minutos de "Mata I", e
  // com a janela fez 114 abates e chegou na sala 10.
  it('a janela de nivel sobe com a sala e cobre a faixa inteira sem buraco', () => {
    const faixa: [number, number] = [1, 30]
    const janelas = Array.from({ length: SALAS_POR_HUNT }, (_, i) => janelaDaSala(faixa, i))

    expect(janelas[0][0]).toBe(1)
    expect(janelas[SALAS_POR_HUNT - 1][1]).toBe(30)
    for (const [lo, hi] of janelas) {
      expect(lo).toBeGreaterThanOrEqual(1)
      expect(hi).toBeLessThanOrEqual(30)
      expect(hi).toBeGreaterThanOrEqual(lo)
    }
    // Contigua: a sala seguinte nunca comeca depois do fim da anterior, senao
    // haveria nivel nenhuma sala alcanca.
    for (let i = 1; i < janelas.length; i++) {
      expect(janelas[i][0], `buraco entre a sala ${i} e a ${i + 1}`).toBeLessThanOrEqual(janelas[i - 1][1] + 1)
    }
    // E monotonica: a hunt afunda, nunca volta.
    for (let i = 1; i < janelas.length; i++) {
      expect(janelas[i][0]).toBeGreaterThanOrEqual(janelas[i - 1][0])
    }
  })

  it('a sala so faz nascer inimigo dentro da janela dela', () => {
    const poke = createPokeInstance(createRng(9), 'charmander', 20)
    const world = buildMapWorld(
      HUNT, poke,
      { rng: createRng(9), counters: { entity: 1, effect: 1, pendingHit: 1 } },
      { sala: { indice: 0, chave: 'tall-grass', abates: 0, ciclos: 0 } },
    )
    const [, teto] = janelaDaSala(world.mapDef!.levelRange, 0)
    for (const inimigo of world.enemies) {
      expect(inimigo.poke.level, `${inimigo.poke.speciesId} acima da janela da sala 1`).toBeLessThanOrEqual(teto)
    }
  })
})

// ---------------------------------------------------------------------------
// Sala sob AUTORIDADE do servidor
// ---------------------------------------------------------------------------
// O bug que este bloco tranca foi observado ao vivo (log em
// salaSystem.ts#registrarAbate): as duas simulacoes sorteiam sub-bioma com
// sequencias diferentes, entao o cliente aplicava o palpite dele e o flush
// escrevia o do servidor por cima — sem aviso na tela e sem trocar o mapa
// desenhado. Nada disso lanca erro: o HUD mostra um nome, o canvas desenha
// outro sub-bioma, e a colisao continua a da sala anterior.
describe('sala sob autoridade do servidor', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('o cliente conta o abate e NAO sorteia a proxima sala', () => {
    const world = mundo(7)
    world.salaSobAutoridade = true
    const daPrimeira = world.sala!.chave

    for (let i = 0; i < ABATES_POR_SALA + 5; i++) registrarAbate(world, world.mapDef!.id)

    expect(world.sala!.chave).toBe(daPrimeira)
    expect(world.sala!.indice).toBe(0)
    expect(world.sala!.abates).toBe(ABATES_POR_SALA) // com teto, sem estourar a quota
    expect(world.salaPendente).toBeNull()
    expect(world.salaCountdownRemaining).toBeNull()
  })

  it('sem autoridade remota o sorteio local continua valendo', () => {
    const world = mundo(7)
    expect(world.salaSobAutoridade).toBe(false)
    for (let i = 0; i < ABATES_POR_SALA; i++) registrarAbate(world, world.mapDef!.id)
    expect(world.salaPendente).not.toBeNull()
    expect(world.salaCountdownRemaining).toBe(SALA_TRANSITION_COUNTDOWN)
  })

  it('sala do servidor IGUAL: so o contador anda, sem aviso e sem trocar cena', () => {
    const world = mundo(11)
    const atual = world.sala!
    reconciliarSalaDaAutoridade(world, { ...atual, abates: 7 })
    expect(world.sala!.abates).toBe(7)
    expect(world.salaPendente).toBeNull()
    expect(world.salaCountdownRemaining).toBeNull()
  })

  it('contador do servidor nunca puxa a barra pra tras', () => {
    // Entre o inicio da janela e a resposta o jogador continuou matando: o
    // contador local ja passou do que o servidor viu. Aceitar o menor fazia a
    // barra do HUD recuar sozinha — foi um dos sintomas do log.
    const world = mundo(11)
    world.sala!.abates = 9
    reconciliarSalaDaAutoridade(world, { ...world.sala!, abates: 4 })
    expect(world.sala!.abates).toBe(9)
  })

  it('sala do servidor DIFERENTE entra pela transicao, nao por escrita direta', () => {
    const world = mundo(11)
    const antes = world.sala!.chave
    const outra = Object.keys(POOL_POR_SALA[HUNT]).find((c) => c !== antes)!

    reconciliarSalaDaAutoridade(world, { indice: 1, chave: outra, abates: 0, ciclos: 0 })

    // A sala em campo NAO troca na hora: quem troca mapa/colisao/inimigos e
    // `aplicarTransicaoDeSala`, no fim da contagem regressiva.
    expect(world.sala!.chave).toBe(antes)
    expect(world.salaPendente!.chave).toBe(outra)
    expect(world.salaCountdownRemaining).toBe(SALA_TRANSITION_COUNTDOWN)
  })

  it('sala ANTERIOR do servidor e ignorada (nao volta pra sala 1)', () => {
    const world = mundo(11)
    const primeira = world.sala!.chave
    world.sala = { indice: 3, chave: primeira, abates: 5, ciclos: 0 }
    const outra = Object.keys(POOL_POR_SALA[HUNT]).find((c) => c !== primeira)!

    reconciliarSalaDaAutoridade(world, { indice: 0, chave: outra, abates: 0, ciclos: 0 })

    expect(world.sala!.indice).toBe(3)
    expect(world.salaPendente).toBeNull()
    expect(world.salaCountdownRemaining).toBeNull()
  })

  it('ciclo NOVO conta como avanco, mesmo com indice menor', () => {
    const world = mundo(11)
    const primeira = world.sala!.chave
    world.sala = { indice: 9, chave: primeira, abates: ABATES_POR_SALA, ciclos: 0 }
    const outra = Object.keys(POOL_POR_SALA[HUNT]).find((c) => c !== primeira)!

    reconciliarSalaDaAutoridade(world, { indice: 0, chave: outra, abates: 0, ciclos: 1 })

    expect(world.salaPendente!.ciclos).toBe(1)
    expect(world.salaCountdownRemaining).toBe(SALA_TRANSITION_COUNTDOWN)
  })

  it('a transicao vinda do servidor troca a cena inteira, como a local', () => {
    const world = mundo(11)
    const outra = Object.keys(POOL_POR_SALA[HUNT]).find((c) => c !== world.sala!.chave)!
    world.enemies.push(...world.enemies) // qualquer coisa em campo
    reconciliarSalaDaAutoridade(world, { indice: 1, chave: outra, abates: 0, ciclos: 0 })

    const gameState = useGameStateStore.getState()
    stepWorld(world, SALA_TRANSITION_COUNTDOWN + 0.1, gameState, { silent: true })

    expect(world.sala!.chave).toBe(outra)
    expect(world.salaPendente).toBeNull()
    // Pool da sala NOVA, nao da anterior: e a prova de que a cena trocou de
    // verdade, e nao so o rotulo do HUD. Era exatamente aqui que o bug morava —
    // o nome mudava e o mundo (arte, colisao, spawn) ficava na sala velha.
    const especiesDaNova = new Set(POOL_POR_SALA[HUNT][outra].map((id) => ENCOUNTERS[id].speciesId))
    expect(world.enemies.length).toBeGreaterThan(0)
    for (const inimigo of world.enemies) {
      expect(especiesDaNova.has(inimigo.poke.speciesId), inimigo.poke.speciesId + ' fora da sala ' + outra).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Quota fechada vale por si — o livelock da janela curta
// ---------------------------------------------------------------------------
// `salaPendente`/`salaCountdownRemaining` sao efemeros: nao atravessam a
// reconstrucao de mundo que o servidor faz a cada janela de flush. Enquanto a
// transicao dependia do PROXIMO abate, uma janela curta demais pra caber
// "matar + 3s de contagem" perdia a transicao e recomecava do zero na janela
// seguinte — a sala travava em `abates: 30` pra sempre. Observado ao vivo em
// 2026-08-19 com janelas de 5s (o cliente passou a pedir flush na hora que a
// quota fecha), e invisivel antes porque a janela normal e de 30s.
describe('quota de sala fechada atravessa a janela', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('sala que ABRE a janela com a quota cheia troca sem depender de abate novo', () => {
    const world = mundo(21)
    const daPrimeira = world.sala!.chave
    world.sala!.abates = ABATES_POR_SALA
    // Sem inimigo em campo: nada pode morrer, entao a unica coisa capaz de
    // armar a transicao e a quota ja fechada.
    world.enemies = []
    world.respawnTimer = 999

    const gameState = useGameStateStore.getState()
    for (let i = 0; i < 60; i++) stepWorld(world, 0.1, gameState, { silent: true })

    expect(world.sala!.indice).toBe(1)
    expect(world.salaPendente).toBeNull()
    expect(world.salaCountdownRemaining).toBeNull()
    // Sub-bioma novo (pode repetir por sorteio, mas o indice tem que ter andado)
    expect(typeof world.sala!.chave).toBe('string')
    expect(daPrimeira).toBeTruthy()
  })

  it('a janela do servidor troca a sala mesmo sem abate nenhum nela', () => {
    // Cada iteracao imita uma janela de flush: mundo reconstruido do progresso
    // persistido, simulacao, progresso lido de volta. Com a transicao dependendo
    // de abate, o indice ficava em 0 pra sempre.
    //
    // 5 segundos e o piso REAL da janela: o cliente nao pede flush de sala mais
    // de uma vez a cada 5s (autoridade.ts#REPETIR_PEDIDO_DE_SALA_MS), e a
    // contagem regressiva e de 3. Janela mais curta que a contagem nao completa a
    // troca — ela apenas rearma na janela seguinte, sem travar.
    let progresso = { indice: 0, chave: '', abates: ABATES_POR_SALA, ciclos: 0 }
    const primeiro = mundo(33)
    progresso = { ...progresso, chave: primeiro.sala!.chave }

    const gameState = useGameStateStore.getState()
    const poke = createPokeInstance(createRng(33), 'charmander', 20)
    const world = buildMapWorld(HUNT, poke, {
      rng: createRng(33),
      counters: { entity: 1, effect: 1, pendingHit: 1 },
    }, { sala: { ...progresso } })
    world.enemies = []
    world.respawnTimer = 999
    for (let i = 0; i < 50; i++) stepWorld(world, 0.1, gameState, { silent: true })

    expect(world.sala!.indice, 'a sala nao avancou numa janela de 5s sem abate').toBe(1)
    expect(world.sala!.abates).toBe(0)
  })

  it('sob autoridade remota a quota cheia NAO arma nada (quem decide e o servidor)', () => {
    const world = mundo(21)
    world.salaSobAutoridade = true
    const daPrimeira = world.sala!.chave
    world.sala!.abates = ABATES_POR_SALA
    world.enemies = []
    world.respawnTimer = 999

    const gameState = useGameStateStore.getState()
    for (let i = 0; i < 60; i++) stepWorld(world, 0.1, gameState, { silent: true })

    expect(world.sala!.indice).toBe(0)
    expect(world.sala!.chave).toBe(daPrimeira)
    expect(world.salaPendente).toBeNull()
  })
})

// A rede de seguranca de VERSAO: servidor publicado antes de 2026-08-19 nunca
// fecha a transicao quando a janela e curta, e o cliente — que parou de sortear —
// ficaria com a barra cheia e a sala parada pra sempre. Depois da espera, a
// predicao local volta a valer.
describe('espera pela autoridade tem teto', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('cliente volta a sortear se o servidor nao trouxer sala nova', () => {
    const world = mundo(45)
    world.salaSobAutoridade = true
    world.sala!.abates = ABATES_POR_SALA
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()

    // Antes do teto: nada acontece, o cliente espera.
    for (let i = 0; i < Math.floor((ESPERA_MAXIMA_PELA_AUTORIDADE - 2) / 0.1); i++) {
      stepWorld(world, 0.1, gameState, { silent: true })
    }
    expect(world.sala!.indice).toBe(0)
    expect(world.salaPendente).toBeNull()

    // Passado o teto (mais a contagem regressiva), a sala anda.
    for (let i = 0; i < Math.floor((2 + SALA_TRANSITION_COUNTDOWN + 1) / 0.1); i++) {
      stepWorld(world, 0.1, gameState, { silent: true })
    }
    expect(world.sala!.indice).toBe(1)
  })

  it('a espera zera quando a sala do servidor chega', () => {
    const world = mundo(45)
    world.salaSobAutoridade = true
    world.sala!.abates = ABATES_POR_SALA
    world.enemies = []
    world.respawnTimer = 999
    const gameState = useGameStateStore.getState()
    for (let i = 0; i < 100; i++) stepWorld(world, 0.1, gameState, { silent: true })
    expect(world.salaEsperaDaAutoridade).toBeGreaterThan(0)

    const outra = Object.keys(POOL_POR_SALA[HUNT]).find((c) => c !== world.sala!.chave)!
    reconciliarSalaDaAutoridade(world, { indice: 1, chave: outra, abates: 0, ciclos: 0 })
    expect(world.salaEsperaDaAutoridade).toBe(0)
  })
})
