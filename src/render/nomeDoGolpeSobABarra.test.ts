// PH-275 — o nome do golpe fica LOGO ABAIXO DA BARRA DE VIDA de quem atacou.
//
// Antes ele nascia no alto da coluna de texto, junto com os numeros de dano — e
// as duas coisas respondem perguntas diferentes: o numero e de quem RECEBEU, o
// nome do golpe e de quem USOU. Empilhados no mesmo lugar, o jogador nao tem
// como saber qual e qual.
//
// A medicao e a mesma regua da PH-189 (`medirTextoDeCombate`, a funcao que o
// `Renderer` chama todo quadro), e nao inspecao visual: o criterio aqui e
// geometrico e cabe em numero.
//
// A geometria da placa, de cima pra baixo (`y` cresce pra baixo, `topo` e
// `entity.y - visualTopOffset(entity)`):
//
//   topo - 26   nome da especie
//   topo - 15   Lv
//   topo - 13   barra de vida (5px), terminando em `topo - 8`
//   topo +  3   NOME DO GOLPE   <- o que este arquivo tranca
//   topo        cabeca do sprite
import { describe, expect, it } from 'vitest'

import { medirTextoDeCombate } from './sprites'
import { alturaDaFonte, type Medidor } from './textoDeCombate'
import type { WorldEffect, WorldEntity, WorldState } from '@/engine/types'

// Mesma metrica de monospace do teste da PH-189: o jsdom nao mede texto.
const medidor: Medidor = {
  larguraDe: (texto, font) => texto.length * alturaDaFonte(font) * 0.6,
}

const RAIO = 16
const Y_DO_CORPO = 150
/** `visualTopOffset` cai no raio quando nao ha `battleAnim` — ver PH-189. */
const TOPO_DO_CORPO = Y_DO_CORPO - RAIO
/** `drawHpBar`: a barra termina 8px acima do topo do corpo. */
const FIM_DA_BARRA = TOPO_DO_CORPO - 8

function mundoComGolpe(lane = 0): WorldState {
  const jogador = {
    id: 'player-1', x: 100, y: Y_DO_CORPO, radius: RAIO, battleAnim: null, facing: { x: 0, y: 1 },
    poke: { speciesId: 'charmeleon', level: 12, hp: 40, stats: { hp: 60 }, isShiny: false },
  } as unknown as WorldEntity
  const golpe = {
    id: 'g1', type: 'abilityName', ownerId: 'player-1', text: 'Lanca-Chamas',
    x: 0, y: 0, radius: 10, color: '#fff', duration: 0.8, delay: 0, age: 0.2, lane, laneSize: 1,
  } as unknown as WorldEffect
  return { player: jogador, enemies: [], effects: [golpe], sala: null } as unknown as WorldState
}

describe('nome do golpe embaixo da barra de vida (PH-275)', () => {
  it('a caixa do nome do golpe ENCOSTA no fim da barra', () => {
    const { moveis } = medirTextoDeCombate(medidor, mundoComGolpe())
    expect(moveis).toHaveLength(1)
    // `y` da caixa e o TOPO dela, e `y` cresce pra baixo — encostar e o topo da
    // caixa coincidir com o fim da barra.
    //
    // PH-283 apertou isto: antes bastava ficar ABAIXO, e com os 3px de folga o
    // nome flutuava entre a barra e o POKE, sem ler como parte da placa. Quem da
    // o respiro agora e a placa de fundo, nao o vao.
    expect(
      Math.abs(moveis[0].y - FIM_DA_BARRA),
      'o nome do golpe descolou da barra (ou voltou pro alto da coluna)',
    ).toBeLessThanOrEqual(1)
  })

  it('e nao desce a ponto de cobrir o corpo inteiro', () => {
    // O texto pode encostar no topo do sprite (e ali que ele fica legivel, com o
    // contorno preto de 3px por cima da arte), mas nao pode cair no meio do
    // POKE: dali pra baixo ele deixa de ler como rotulo da placa e vira texto
    // solto sobre o bicho.
    const { moveis } = medirTextoDeCombate(medidor, mundoComGolpe())
    const alturaDoCorpo = RAIO * 2
    expect(moveis[0].y).toBeLessThan(TOPO_DO_CORPO + alturaDoCorpo / 2)
  })

  it('o SEGUNDO golpe do mesmo POKE sobe uma raia, em vez de escrever por cima', () => {
    // Criterio de aceite da issue: dois golpes seguidos nao podem deixar dois
    // textos empilhados no mesmo lugar. A raia (`lane`) ja existia e continua
    // valendo — a mudanca de ancora nao pode ter cancelado ela.
    const primeira = medirTextoDeCombate(medidor, mundoComGolpe(0)).moveis[0]
    const segunda = medirTextoDeCombate(medidor, mundoComGolpe(1)).moveis[0]
    expect(segunda.y, 'a raia parou de separar os dois').toBeLessThan(primeira.y)
  })
})
