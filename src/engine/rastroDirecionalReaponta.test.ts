// PH-110 — o rastro de golpe DIRECIONAL continua apontando pro atacante.
//
// O QUE ESTE TESTE TRANCA, E POR QUE O DO PH-103 NAO BASTOU
//
// `golpeAcompanhaNoCombate.test.ts` (PH-103) mede a distancia entre a arte e a
// entidade que ela ACOMPANHA, e passa: `seguirId` esta em todo efeito e a
// distancia e zero. Mas ele usa um charmander nivel 12, e nenhum dos golpes
// desse learnset e direcional. O furo nao era o `seguir` — era o ANGULO.
//
// Arte direcional (`bullet_punch`, `scratch`, `fury_swipes`, `shadow_punch`) e um
// risco que LIGA atacante e alvo: a faisca de impacto fica no alvo e o rastro se
// estende de volta pra quem bateu. Com `anguloDeAtaque` congelado no instante do
// hit, o atacante andar durante o ~1s de animacao descola o rastro do punho.
// Bullet Punch e o pior caso do lote: rastro horizontal de 84px de mundo
// recortado pra 37px, que e exatamente a distancia de combate.
//
// A asserçao aqui NAO e sobre distancia, e sobre o angulo concordar com a
// geometria viva das duas entidades — que e a unica forma de dizer "o rastro
// aponta pro atacante" sem desenhar nada.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { ehDirecional } from '@/data/moveVfx'
import { buildMapWorld, stepWorld } from './simulation'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { BaseEntity, WorldState } from './types'

const SEMENTE = 987654321
const MAPA = 'route_46'
const PASSO = 1 / 60
const PASSOS = 60 * 90

// Scizor tem `bullet_punch` no learnset; um charmander nao tem golpe direcional
// nenhum, que e exatamente por isso que o teste do PH-103 passou com o bug em pe.
const ESPECIE = 'scizor'
const NIVEL = 60
const GOLPE = 'bullet_punch'

// Folga do angulo, em radianos. ~5.7 graus.
//
// Nao e zero porque o reapontamento roda uma vez por frame: entre dois frames o
// atacante andou, e o angulo gravado descreve a geometria do fim do frame
// anterior. O que este numero precisa separar e "um frame atras" de "congelado
// no instante do hit" — no segundo caso, um POKE cruzando a area de combate
// durante 1s de animacao gira a geometria em dezenas de graus.
const FOLGA_RAD = 0.1

function acharEntidade(world: WorldState, id: string): BaseEntity | null {
  if (world.player && world.player.id === id) return world.player
  return world.enemies.find((e) => e.id === id) ?? null
}

/** Menor diferenca entre dois angulos, respeitando a volta em 2pi. */
function difAngular(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2)
  return d > Math.PI ? Math.PI * 2 - d : d
}

interface Achados {
  amostrasDirecionais: number
  comApontar: number
  semApontar: number
  piorDif: number
  amostrasNaoDirecionais: number
  naoDirecionalComApontar: number
}

function lutar(golpeForcado: string | null): Achados {
  const gameState = useGameStateStore.getState()
  const poke = createPokeInstance(createRng(SEMENTE), ESPECIE, NIVEL)
  // Forcado porque a selecao automatica de 4 golpes nao escolhe `bullet_punch`
  // pro Scizor — sem isto o combate roda 90s sem produzir uma unica arte
  // direcional, e o teste passaria por vacuidade.
  if (golpeForcado) poke.activeAbilities = [golpeForcado]

  const world = buildMapWorld(MAPA, poke, {
    rng: createRng(SEMENTE),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  })

  const achados: Achados = {
    amostrasDirecionais: 0, comApontar: 0, semApontar: 0, piorDif: 0,
    amostrasNaoDirecionais: 0, naoDirecionalComApontar: 0,
  }

  for (let i = 0; i < PASSOS; i++) {
    // `silent: false` obrigatorio: a criacao de VFX vive toda dentro de
    // `if (!silent)` (PH-11).
    stepWorld(world, PASSO, gameState, { silent: false })

    for (const efeito of world.effects) {
      if (efeito.type !== 'abilityEffect') continue

      if (!ehDirecional(efeito.abilityId)) {
        achados.amostrasNaoDirecionais++
        if (efeito.apontarParaId) achados.naoDirecionalComApontar++
        continue
      }

      achados.amostrasDirecionais++
      if (!efeito.apontarParaId) {
        achados.semApontar++
        continue
      }
      achados.comApontar++

      const atacante = acharEntidade(world, efeito.apontarParaId)
      // Atacante fora do mundo deixa o ultimo angulo valido no lugar, de
      // proposito — nao ha geometria pra comparar.
      if (!atacante || efeito.anguloDeAtaque === undefined) continue
      const esperado = Math.atan2(efeito.y - atacante.y, efeito.x - atacante.x)
      achados.piorDif = Math.max(achados.piorDif, difAngular(efeito.anguloDeAtaque, esperado))
    }
  }
  return achados
}

describe('rastro de golpe direcional aponta pro atacante (PH-110)', () => {
  const achados = lutar(GOLPE)

  it('o combate simulado de fato produziu arte direcional', () => {
    // Guarda contra vacuidade: se a selecao de golpes, o mapa ou o `silent`
    // mudarem e nenhum direcional sair, tudo abaixo passa sem olhar nada.
    expect(achados.amostrasDirecionais, `nenhuma arte de ${GOLPE} no combate`).toBeGreaterThan(0)
  })

  it('todo efeito de arte direcional carrega o atacante', () => {
    expect(achados.semApontar, 'arte direcional sem `apontarParaId` — o rastro vai congelar').toBe(0)
  })

  it('o angulo concorda com a geometria viva das duas entidades', () => {
    expect(achados.piorDif).toBeLessThan(FOLGA_RAD)
  })

})

describe('arte NAO direcional continua com o angulo congelado (PH-110)', () => {
  // Grupo de controle, com os 4 golpes que a selecao automatica escolhe pro
  // Scizor (iron_head, x_scissor, razor_wind, metal_claw) — nenhum direcional.
  // Sem este segundo combate nao ha como afirmar que o resto do jogo nao mudou:
  // marcar TODO efeito como reapontavel passaria nas asserçoes de cima e
  // mudaria a animacao de todo golpe sem ninguem notar.
  const controle = lutar(null)

  it('o combate de controle produziu arte nao direcional', () => {
    expect(controle.amostrasNaoDirecionais, 'sem arte nao direcional, este describe e vacuo')
      .toBeGreaterThan(0)
  })

  it('nenhuma delas ganhou reapontamento', () => {
    expect(controle.naoDirecionalComApontar, 'arte nao direcional ganhou reapontamento').toBe(0)
  })
})
