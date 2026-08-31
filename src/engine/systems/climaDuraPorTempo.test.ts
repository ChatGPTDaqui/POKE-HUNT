// PH-329 — o prazo do clima de golpe/habilidade e TEMPO, e nao "turno de
// combate do jogador vivo".
//
// Toda falha desta area e silenciosa, e foi assim que ela chegou aqui. O
// decremento antigo vivia no fim de `updateCombat`, atras de duas condicoes que
// ninguem escolheu de propósito: `!isDead(player)` e o relogio de turno DO
// JOGADOR. Nenhuma das duas levanta erro quando nao e satisfeita — o clima
// simplesmente para de gastar prazo e fica em campo. Na tela isso le como
// "choveu muito tempo", que e indistinguivel de balanceamento.
//
// Os quatro casos abaixo sao exatamente os quatro jeitos de o prazo nao ser
// tempo: sem combate, com o POKE desmaiado, com a tela congelada por overlay de
// transicao, e o clima de habilidade que nao tinha prazo nenhum.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { TURNO_SEGUNDOS } from '@/data/abilities'
import { useGameStateStore } from '@/stores/gameStateStore'
import { buildMapWorld, stepWorld } from '../simulation'
import { criarInimigoDeTeste } from '../testes/inimigoDeTeste'
import { updateCombat } from './combatSystem'
import {
  CLIMA_DE_GOLPE_TURNOS, CLIMA_DE_GOLPE_SEGUNDOS, climaDeAmbiente, tickClimaDeGolpe,
} from './climaAmbiente'

import type { Clima, ClimaTipo, WorldState } from '../types'

const HUNT = 'mata_faixa1'

function mundo(): WorldState {
  const rng = createRng(7)
  const poke = createPokeInstance(rng, 'charmander', 30)
  return buildMapWorld(HUNT, poke, {
    seed: 0, rng: createRng(7), counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
}

/** Clima de golpe recem-lancado, do jeito que `resolveHit` o monta. */
function deGolpe(tipo: ClimaTipo = 'chuva'): Clima {
  return { tipo, turnosRestantes: CLIMA_DE_GOLPE_TURNOS, origem: 'golpe' }
}

/**
 * Avanca `segundos` de tempo simulado em passos de `passo`.
 *
 * Passo pequeno, e nao um `stepWorld` gigante: o motor inteiro roda por tick, e
 * um unico salto de 20 segundos resolveria combate, spawn e sala de uma vez —
 * mediria outra coisa. 0,1 s e o mesmo passo que os testes de sala usam.
 */
function correr(world: WorldState, segundos: number, passo = 0.1): void {
  const gameState = useGameStateStore.getState()
  for (let gasto = 0; gasto < segundos - 1e-9; gasto += passo) {
    stepWorld(world, Math.min(passo, segundos - gasto), gameState, { silent: true })
  }
}

beforeEach(() => {
  useGameStateStore.getState().resetToDefaults()
})

describe('o prazo do clima de golpe e tempo corrido (PH-329)', () => {
  it('e 10 turnos, e o valor em segundos sai da duracao de turno — nao de um numero solto', () => {
    // Se alguem reescrever o prazo como constante literal, este caso e o que
    // reprova: o pedido e "10 vezes a duracao de um turno", e a duracao de turno
    // mora em UM lugar (`TURNO_SEGUNDOS`, gerado da planilha).
    expect(CLIMA_DE_GOLPE_TURNOS).toBe(10)
    expect(CLIMA_DE_GOLPE_SEGUNDOS).toBe(10 * TURNO_SEGUNDOS)
  })

  it('expira SEM combate nenhum — o caso que o decremento antigo nao alcancava', () => {
    const world = mundo()
    // Campo vazio: `updateCombat` nao tem ninguem engajado, entao o relogio de
    // turno do jogador nunca fecha. Era aqui que o clima congelava.
    world.enemies = []
    world.clima = deGolpe()
    world.climaAmbiente = null

    correr(world, CLIMA_DE_GOLPE_SEGUNDOS - 0.5)
    expect(world.clima?.origem, 'saiu antes do prazo').toBe('golpe')

    correr(world, 1)
    expect(world.clima, 'nao expirou sem combate').toBeNull()
  })

  it('expira com o POKE do jogador DESMAIADO', () => {
    const world = mundo()
    world.enemies = []
    const player = world.player!
    player.poke.hp = 0
    player.fainted = true
    world.clima = deGolpe('sol')
    world.climaAmbiente = null

    correr(world, CLIMA_DE_GOLPE_SEGUNDOS + 0.5)
    expect(world.clima, 'clima congelado enquanto o POKE esta desmaiado').toBeNull()
  })

  it('expira mesmo com a transicao de sala congelando movimento e combate', () => {
    // `salaCountdownRemaining` faz `stepWorld` retornar antes de movimento e
    // combate. Se o prazo fosse gasto depois desse gate, cada overlay de
    // "Entrando em nova area" seria tempo gratis de clima.
    const world = mundo()
    world.enemies = []
    world.clima = deGolpe()
    world.climaAmbiente = null
    world.salaCountdownRemaining = CLIMA_DE_GOLPE_SEGUNDOS * 2

    correr(world, CLIMA_DE_GOLPE_SEGUNDOS + 0.5)
    expect(world.salaCountdownRemaining, 'a transicao devia continuar aberta').toBeGreaterThan(0)
    expect(world.clima, 'a pausa da transicao virou prazo gratis').toBeNull()
  })

  it('ao expirar, o clima do LUGAR volta — nao ceu limpo', () => {
    const world = mundo()
    world.enemies = []
    world.climaAmbiente = climaDeAmbiente('areia')
    world.clima = deGolpe('chuva')

    correr(world, CLIMA_DE_GOLPE_SEGUNDOS + 0.5)
    expect(world.clima).toEqual({ tipo: 'areia', turnosRestantes: Infinity, origem: 'ambiente' })
  })

  it('o gasto e proporcional ao dt — meia duracao gasta metade do prazo', () => {
    // Guarda contra a regressao obvia: alguem trocar `dt / TURNO_SEGUNDOS` por
    // `1` e o prazo voltar a ser "um turno por tick", que a 60 Hz expira em 1/6
    // de segundo.
    const world = mundo()
    world.enemies = []
    world.clima = deGolpe()
    world.climaAmbiente = null

    correr(world, CLIMA_DE_GOLPE_SEGUNDOS / 2)
    expect(world.clima?.turnosRestantes).toBeCloseTo(CLIMA_DE_GOLPE_TURNOS / 2, 5)
  })
})

describe('fim de batalha nao derruba mais o clima de golpe (PH-329)', () => {
  it('o vao entre um spawn e o proximo nao apaga a chuva', () => {
    // `updateCombat` chama o reset de fim de batalha sempre que nao ha inimigo
    // ENGAJADO — o que num auto-battler de campo aberto acontece a cada vao
    // entre grupos. Ate a PH-329 esse reset levava o clima de golpe junto, e o
    // prazo de 10 turnos nunca chegava a ser gasto.
    const world = mundo()
    world.enemies = []
    world.climaAmbiente = null
    world.clima = deGolpe()

    updateCombat(world, 0.1, { silent: true })

    expect(world.clima?.origem, 'o fim de batalha voltou a apagar o clima').toBe('golpe')
    expect(world.clima?.tipo).toBe('chuva')
  })

  it('mas o resto do estado volatil de fim de batalha continua sendo limpo', () => {
    // Guarda contra a correcao larga demais: a mudanca e SO sobre o clima. Os
    // estagios de atributo tem que continuar voltando a zero, senao volta o bug
    // que custou 27% das kills/hora (ver o comentario em combatSystem.ts).
    const world = mundo()
    world.enemies = []
    const player = world.player!
    player.estagios = { atkFis: -3 }

    updateCombat(world, 0.1, { silent: true })

    expect(player.estagios).toEqual({})
  })
})

describe('clima de sub-bioma (sala) nao tem prazo (PH-140, reconfirmado na PH-329)', () => {
  it('nao gasta nada, por muito tempo que passe', () => {
    const world = mundo()
    world.enemies = []
    world.climaAmbiente = climaDeAmbiente('neve')
    world.clima = world.climaAmbiente

    correr(world, CLIMA_DE_GOLPE_SEGUNDOS * 3)
    expect(world.clima).toEqual({ tipo: 'neve', turnosRestantes: Infinity, origem: 'ambiente' })
  })

  it('`tickClimaDeGolpe` ignora o clima de ambiente mesmo chamado direto', () => {
    const world = mundo()
    world.climaAmbiente = climaDeAmbiente('nevoa')
    world.clima = world.climaAmbiente
    tickClimaDeGolpe(world, 9999)
    expect(world.clima?.turnosRestantes).toBe(Infinity)
  })
})

describe('clima de HABILIDADE tem o mesmo prazo do de golpe (PH-329)', () => {
  it('Drizzle liga chuva com 10 turnos, e ela expira — antes era `Infinity`', () => {
    const world = mundo()
    const player = world.player!
    player.poke.trait = 'drizzle'
    player.cooldowns = {}
    player.entradaProcessada = false
    world.climaAmbiente = climaDeAmbiente('areia')
    world.clima = world.climaAmbiente

    // Um inimigo encostado no jogador engaja e dispara o hook de entrada, que e
    // quem liga o clima da habilidade.
    const enemy = criarInimigoDeTeste(world, 'sentret', 30, { x: player.x, y: player.y })
    enemy.targetId = player.id
    enemy.state = 'engaged'
    world.enemies = [enemy]
    updateCombat(world, 0, { silent: true })

    expect(world.clima?.tipo, 'Drizzle nao ligou a chuva').toBe('chuva')
    expect(world.clima?.origem).toBe('golpe')
    expect(
      Number.isFinite(world.clima!.turnosRestantes),
      'clima de habilidade voltou a ser sem prazo',
    ).toBe(true)
    expect(world.clima?.turnosRestantes).toBe(CLIMA_DE_GOLPE_TURNOS)
  })

  it('o prazo do clima de habilidade e gasto pelo mesmo tick de tempo', () => {
    const world = mundo()
    world.enemies = []
    world.climaAmbiente = climaDeAmbiente('areia')
    // Mesma forma que `resolveEntryHook` monta pra Drizzle e companhia.
    world.clima = { tipo: 'chuva', turnosRestantes: CLIMA_DE_GOLPE_TURNOS, origem: 'golpe' }

    correr(world, CLIMA_DE_GOLPE_SEGUNDOS + 0.5)
    expect(world.clima).toEqual({ tipo: 'areia', turnosRestantes: Infinity, origem: 'ambiente' })
  })
})
