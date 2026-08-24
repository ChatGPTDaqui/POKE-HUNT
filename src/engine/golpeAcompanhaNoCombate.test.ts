// PH-103: garante no CALL-SITE o que o PH-77 corrigiu.
//
// O PH-77 era um bug relatado pelo usuario: "o pokemon andava mas a sprite de
// ataque dele ficava para tras". A arte de golpe nascia com as coordenadas da
// entidade congeladas no instante do hit e vivia de 1,0 a 1,2 segundos — tempo
// em que um POKE andando cobre uma distancia bem visivel.
//
// A correcao foi `WorldEffect.seguirId` + `effect.ts#seguirDono`, e ela tem
// teste: `vfxAcompanhaPoke.test.ts`. Mas aquele teste cobre a FUNCAO, com
// entidades de mentira. Nada cobria o call-site.
//
// O furo importa porque o modo de falha nao denuncia: se alguem adicionar um
// `abilityEffect` novo (golpe novo, arte nova, refatoracao do bloco de VFX) e
// esquecer o `seguir`, a arte aparece, a animacao toca e o dano e aplicado. So
// fica no lugar errado por um segundo. Foi o usuario quem percebeu na primeira
// vez, e seria de novo.
//
// Entao aqui o combate e REAL: motor de verdade, mapa de verdade, e a asserçao
// e sobre `world.effects` durante a luta.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld } from './simulation'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { BaseEntity, WorldEffect, WorldState } from './types'

const SEMENTE = 987654321
const MAPA = 'route_46'
// Mesmo passo do jogo ao vivo (useGameLoop roda a 1/60): a arte de golpe vive
// ~1s, entao um passo grosso pularia por cima da janela inteira em que ela
// existe — que e justamente o que este teste observa.
const PASSO = 1 / 60
const PASSOS = 60 * 90 // 90 segundos de combate

// Folga da asserçao de acompanhamento, em unidades de mundo.
//
// Nao e zero de proposito: `seguirDono` roda no laco de efeitos, que acontece
// ANTES dos hits pendentes pousarem no mesmo `stepWorld`. Um efeito criado
// neste tick so e transladado no seguinte, entao ele fica um frame de
// movimento atras — alguns pixels.
//
// O que este numero precisa separar e "um frame atras" de "ficou plantado onde
// o POKE estava": sem `seguir`, um POKE andando durante 1s de animacao deixa a
// arte a centenas de unidades. 40 (uma celula da grade antiga) e folgado pro
// primeiro caso e impossivel pro segundo.
const FOLGA = 40

function acharEntidade(world: WorldState, id: string): BaseEntity | null {
  if (world.player && world.player.id === id) return world.player
  return world.enemies.find((e) => e.id === id) ?? null
}

interface Achados {
  artesDeGolpe: number
  semSeguir: WorldEffect[]
  piorDistancia: number
  piorEfeito: string | null
}

function lutar(): Achados {
  const gameState = useGameStateStore.getState()
  const rng = createRng(SEMENTE)
  const poke = createPokeInstance(rng, 'charmander', 12)
  const world = buildMapWorld(MAPA, poke, { seed: 0,
    rng: createRng(SEMENTE),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  })

  const achados: Achados = { artesDeGolpe: 0, semSeguir: [], piorDistancia: 0, piorEfeito: null }
  const jaContados = new Set<string>()

  for (let i = 0; i < PASSOS; i++) {
    // `silent: false` e obrigatorio: a criacao de VFX vive toda dentro de
    // `if (!silent)` (PH-11, pra o resim headless nao montar 250 mil efeitos
    // que ninguem desenha). Com `silent: true` este teste passaria sem nunca
    // ter olhado um efeito.
    stepWorld(world, PASSO, gameState, { silent: false })

    for (const efeito of world.effects) {
      if (efeito.type !== 'abilityEffect') continue
      if (!jaContados.has(efeito.id)) {
        jaContados.add(efeito.id)
        achados.artesDeGolpe++
        if (!efeito.seguirId) achados.semSeguir.push(efeito)
      }
      if (!efeito.seguirId) continue
      const dono = acharEntidade(world, efeito.seguirId)
      // Dono fora do mundo (inimigo abatido e removido) deixa o efeito parado
      // onde estava, de propósito — nao ha o que medir.
      if (!dono) continue
      const d = Math.hypot(efeito.x - dono.x, efeito.y - dono.y)
      if (d > achados.piorDistancia) {
        achados.piorDistancia = d
        achados.piorEfeito = `${efeito.id} (${efeito.abilityId ?? 'sem abilityId'})`
      }
    }
  }
  return achados
}

describe('arte de golpe acompanha o POKE num combate real (PH-103)', () => {
  const achados = lutar()

  it('o combate simulado de fato produziu arte de golpe', () => {
    // Sem esta guarda o teste inteiro seria vacuo: um combate que nao acontece
    // (POKE fraco demais, mapa sem inimigo, `silent` errado) passa em todas as
    // asserçoes abaixo sem ter olhado nada.
    expect(achados.artesDeGolpe).toBeGreaterThan(0)
  })

  it('TODA arte de golpe viva declara quem ela acompanha', () => {
    // Esta e a asserçao que da o valor: ela reprova no dia em que um golpe novo
    // entrar sem `seguir`, que e o unico caminho pelo qual o PH-77 voltaria.
    //
    // A mensagem lista os `abilityId` culpados porque o proximo a ver isto
    // vermelho vai estar adicionando um golpe, nao lendo este arquivo.
    const culpados = achados.semSeguir.map((e) => e.abilityId ?? e.id)
    expect(culpados, `abilityEffect sem seguir: ${culpados.join(', ')}`).toEqual([])
  })

  it('a arte nunca fica para tras de quem ela marca', () => {
    expect(
      achados.piorDistancia,
      `pior caso: ${achados.piorEfeito} a ${achados.piorDistancia.toFixed(1)} unidades do dono`,
    ).toBeLessThan(FOLGA)
  })
})

// `captureAnim` fica FORA da regra acima de propósito, e isto esta escrito aqui
// pra ninguem "consertar" o que esta certo:
//
// ela e criada em `simulation.ts` sobre o inimigo que acabou de ser derrotado,
// com `delay: DEATH_ANIM_GRACE_PERIOD`. Inimigo abatido nao anda, e o corpo
// dele fica em campo 4 segundos enquanto a animacao da bola dura ~1 — nao ha
// deslocamento pra acompanhar. Dar `seguir` a ela seria custo sem efeito, e no
// caminho em que o corpo e removido antes do fim (`keepCorpses` falso mais
// respawn apertado) ainda pioraria: a bola pararia de andar no meio em vez de
// simplesmente terminar onde comecou.
//
// Os efeitos de TEXTO (`damageNumber`, `abilityName`, `rewardText`) tambem
// ficam fora, por outro motivo: eles usam `owner`, e `sprites.ts#effectAnchor`
// resolve a ancora na entidade viva a cada frame. Ja acompanham, por um
// mecanismo diferente — foi exatamente a observacao que levou ao PH-77.
