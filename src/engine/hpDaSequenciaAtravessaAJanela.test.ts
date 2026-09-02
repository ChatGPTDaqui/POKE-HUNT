// PH-307: o HP do membro da sequencia (Campeao Lance) tem que atravessar a
// reconstrucao de mundo que o servidor faz a cada janela de flush.
//
// O QUE ESTAVA ACONTECENDO, medido em PRODUCAO em 30/08:
//
//   map_id       sessoes  limpas  maior_indice
//   boss_lance         2       0             5
//
// As duas sessoes chegaram ao indice 5 — o ULTIMO dos 6 — e `sequence_cleared`
// nunca virou true. `hall_da_fama` vazia, ninguem com `faixa3`, Eevee da
// primeira vitoria (PH-164) nunca enviado: os tres pendurados na mesma flag.
//
// A causa nao era o combate: `spawnSequenceEnemy` cria o membro SEMPRE com HP
// cheio, e `buildMapWorld` nao tinha por onde restaurar o HP salvo. A cada
// janela (~30s) o servidor jogava fora o dano da anterior. Quem nao derrubasse
// um membro inteiro dentro de uma janela nunca o derrubava — e o cliente, que
// simula continuamente e nao perde nada nas bordas, terminava a luta, anunciava
// a vitoria e liberava a Faixa III localmente. O estado seguinte do servidor
// apagava tudo.
//
// Mesma correcao que PH-217 fez pro protetor da sala (`sala_protetor.hp_atual`).
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, type PokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld, type ProgressoDaSessao } from './simulation'
import { MAPS } from '@/data/maps'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { WorldState } from './types'

const LANCE = 'boss_lance'
const TAMANHO_DA_SEQUENCIA = MAPS[LANCE]!.sequence!.length

/** Forte o bastante pra a luta ser decidida por tempo, nao por dificuldade. */
function pokeForte(): PokeInstance {
  const poke = createPokeInstance(createRng(7), 'entei', 100)
  return poke
}

function mundo(progresso?: ProgressoDaSessao): WorldState {
  return buildMapWorld(LANCE, useGameStateStore.getState().team[0], {
    seed: 0, rng: createRng(1), counters: { entity: 1, effect: 1, pendingHit: 1 },
  }, progresso)
}

/** O que o servidor grava no fim da janela (authority#hpDaSequencia). */
function hpDaSequencia(world: WorldState): number | null {
  if (!world.mapDef?.sequence) return null
  const vivo = world.enemies.find((e) => e.poke.hp > 0)
  return vivo ? vivo.poke.hp : 0
}

describe('PH-307: HP da sequencia atravessa a janela do servidor', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
    useGameStateStore.getState().addPokeToTeam(pokeForte())
    useGameStateStore.getState().setActiveIndex(0)
  })

  it('luta em andamento: o HP salvo entra no lugar do HP cheio', () => {
    // `sequenceIndex: 1`, e nao 0: com indice 0 e sequencia nao iniciada,
    // `buildMapWorld` arma a contagem de entrada do Lance (5s) e nao spawna
    // ninguem. "Retomando" e o estado que o servidor de fato reconstroi.
    const world = mundo({ sequenceIndex: 1, sequenceCleared: false, sequenceHp: 11 })
    const inimigo = world.enemies.find((e) => e.poke.hp > 0)
    expect(inimigo).toBeDefined()
    expect(inimigo!.poke.hp).toBe(11)
    // O teto continua sendo o HP maximo da especie: valor gravado por uma
    // versao com outra formula de stat nao pode inflar o inimigo.
    expect(inimigo!.poke.hp).toBeLessThanOrEqual(inimigo!.poke.stats.hp)
  })

  it('sem informacao (sessao nova ou servidor antigo), nasce com HP cheio', () => {
    for (const hp of [null, undefined]) {
      const progresso = { sequenceIndex: 1, sequenceCleared: false, sequenceHp: hp }
      const world = mundo(progresso as ProgressoDaSessao)
      const inimigo = world.enemies.find((e) => e.poke.hp > 0)
      expect(inimigo).toBeDefined()
      expect(inimigo!.poke.hp).toBe(inimigo!.poke.stats.hp)
    }
  })

  it('membro ja caido (0) nao ressuscita — o campo nasce vazio', () => {
    const world = mundo({ sequenceIndex: 2, sequenceCleared: false, sequenceHp: 0 })
    expect(world.enemies.filter((e) => e.poke.hp > 0)).toEqual([])
  })

  it('o ULTIMO caido na borda da janela fecha a sequencia na reconstrucao', () => {
    const gameState = useGameStateStore.getState()
    const world = mundo({
      sequenceIndex: TAMANHO_DA_SEQUENCIA - 1, sequenceCleared: false, sequenceHp: 0,
    })
    expect(world.sequenceCleared).toBe(false)
    // Um tick basta: o gate de fim de sequencia so pede campo vazio no ultimo
    // indice. Sem o caso `0`, o Dragonite renascia inteiro aqui e a Faixa III
    // nunca abria — que e exatamente o que producao mostrou.
    stepWorld(world, 0.1, gameState, { silent: true })
    expect(world.sequenceCleared).toBe(true)
    // PH-432: o Lance concede SO o Modo Pesadelo. A "faixa III" que ele abria
    // virou os estagios 7 a 10, liberados um a um pelo progresso do bioma.
    expect(gameState.isContinentUnlocked('nightmare')).toBe(true)
  })

  // O `0` tem um caminho perigoso: numa sessao NOVA, a contagem de entrada do
  // Lance (5s) segura o spawn, entao uma janela que feche antes dela grava `0`
  // sem ninguem ter caido. Se esse `0` pulasse o spawn na reconstrucao, o
  // PRIMEIRO POKE do Lance seria pulado — o jogador ganharia de graca o
  // Gyarados. Nao acontece: com indice 0 e sequencia nao iniciada o mundo nao
  // esta "retomando", entao a contagem rearma e e ELA quem spawna o indice 0.
  // Preso aqui porque a analise e sutil demais pra ficar so no comentario.
  it('janela que fecha durante a contagem de entrada nao pula o primeiro do Lance', () => {
    const gameState = useGameStateStore.getState()
    let world = mundo()
    // 1 segundo — bem menos que a contagem de entrada.
    for (let t = 0; t < 10; t++) stepWorld(world, 0.1, gameState, { silent: true })
    expect(hpDaSequencia(world)).toBe(0)

    world = mundo({ sequenceIndex: world.sequenceIndex, sequenceCleared: false, sequenceHp: 0 })
    for (let t = 0; t < 100; t++) stepWorld(world, 0.1, gameState, { silent: true })

    expect(world.sequenceIndex).toBe(0)
    const emCampo = world.enemies.find((e) => e.poke.hp > 0)
    expect(emCampo).toBeDefined()
    // O primeiro da ordem real do Lance. O id do ENCONTRO nao e o da especie
    // (os encontros do Lance sao gerados), entao a comparacao e pela especie.
    expect(emCampo!.poke.speciesId).toBe('gyarados')
  })

  it('o dano de uma janela continua valendo na seguinte, ate o membro cair', () => {
    const gameState = useGameStateStore.getState()
    let progresso: ProgressoDaSessao = { sequenceIndex: 1, sequenceCleared: false, sequenceHp: null }
    let world = mundo(progresso)
    const hpCheio = world.enemies.find((e) => e.poke.hp > 0)!.poke.stats.hp

    // Janelas CURTAS de proposito: 3 segundos nao derrubam ninguem, entao o
    // unico jeito de o HP chegar a zero e o dano se acumular entre elas.
    const hps: Array<number | null> = []
    for (let janela = 0; janela < 25; janela++) {
      for (let t = 0; t < 30; t++) stepWorld(world, 0.1, gameState, { silent: true })
      const hp = hpDaSequencia(world)
      hps.push(hp)
      progresso = { sequenceIndex: world.sequenceIndex, sequenceCleared: world.sequenceCleared, sequenceHp: hp }
      world = mundo(progresso)
      if (world.sequenceIndex > 1 || world.sequenceCleared) break
    }

    // Prova de que o acumulo aconteceu: em algum momento o HP gravado ficou
    // ABAIXO do cheio e continuou caindo — sem a correcao, toda janela
    // recomecaria em `hpCheio` e a lista seria constante.
    const menoresQueOCheio = hps.filter((h): h is number => h != null && h > 0 && h < hpCheio)
    expect(menoresQueOCheio.length).toBeGreaterThan(1)
    expect(Math.min(...menoresQueOCheio)).toBeLessThan(Math.max(...menoresQueOCheio))
  })
})
