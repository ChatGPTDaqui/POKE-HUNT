// O nome do golpe fica EMBAIXO DOS PES de quem usou, centrado nele (02/10).
//
// Ate entao (PH-275/283) ele ficava colado embaixo da barra de vida. O dono
// pediu pra descer: a placa de cima ja tem nome, Lv e barra, e e por ali que
// sobem os numeros de dano; o que o POKE FEZ vai pro chao, onde nao disputa.
//
// A medicao usa a mesma regua da PH-189 (`medirTextoDeCombate`, a funcao que o
// `Renderer` chama todo quadro): o criterio e geometrico e cabe em numero.
//
// Sem `battleAnim`, o pe fica em `entity.y + radius` (`groundOffset`).
import { describe, expect, it } from 'vitest'

import { medirTextoDeCombate } from './sprites'
import { alturaDaFonte, type Medidor } from './textoDeCombate'
import type { WorldEffect, WorldEntity, WorldState } from '@/engine/types'

// Mesma metrica de monospace do teste da PH-189: o jsdom nao mede texto.
const medidor: Medidor = {
  larguraDe: (texto, font) => texto.length * alturaDaFonte(font) * 0.6,
}

const RAIO = 16
const X_DO_CORPO = 100
const Y_DO_CORPO = 150
const PE = Y_DO_CORPO + RAIO

function mundoComGolpe(lane = 0): WorldState {
  const jogador = {
    id: 'player-1', x: X_DO_CORPO, y: Y_DO_CORPO, radius: RAIO, battleAnim: null, facing: { x: 0, y: 1 },
    poke: { speciesId: 'charmeleon', level: 12, hp: 40, stats: { hp: 60 }, isShiny: false },
  } as unknown as WorldEntity
  const golpe = {
    id: 'g1', type: 'abilityName', ownerId: 'player-1', text: 'Lanca-Chamas',
    x: 0, y: 0, radius: 10, color: '#fff', duration: 0.8, delay: 0, age: 0.2, lane, laneSize: 1,
  } as unknown as WorldEffect
  return { player: jogador, enemies: [], effects: [golpe], sala: null } as unknown as WorldState
}

describe('nome do golpe embaixo dos pes', () => {
  it('a caixa do nome comeca logo abaixo do pe — nem em cima do corpo, nem solta no chao', () => {
    const { moveis } = medirTextoDeCombate(medidor, mundoComGolpe())
    expect(moveis).toHaveLength(1)
    // `y` e o TOPO da caixa e cresce pra baixo.
    expect(moveis[0].y, 'o nome subiu pro corpo').toBeGreaterThanOrEqual(PE)
    expect(moveis[0].y, 'o nome descolou do pe').toBeLessThanOrEqual(PE + 6)
  })

  it('e fica centrado no POKE, nao na coluna de texto deslocada pra esquerda', () => {
    const { moveis } = medirTextoDeCombate(medidor, mundoComGolpe())
    const centro = moveis[0].x + moveis[0].w / 2
    expect(Math.abs(centro - X_DO_CORPO)).toBeLessThanOrEqual(1)
  })

  it('o SEGUNDO texto do mesmo POKE desce uma linha, em vez de escrever por cima', () => {
    // Dois golpes seguidos (ou o golpe e o "Ataque ↓" logo depois) nao podem
    // deixar dois textos empilhados no mesmo lugar.
    const primeira = medirTextoDeCombate(medidor, mundoComGolpe(0)).moveis[0]
    const segunda = medirTextoDeCombate(medidor, mundoComGolpe(1)).moveis[0]
    expect(segunda.y, 'a raia parou de separar os dois').toBeGreaterThanOrEqual(primeira.y + primeira.h - 4)
  })
})
