// PH-189 — duas caixas de texto de donos DIFERENTES nao podem ocupar o mesmo
// pixel.
//
// A raia do motor (`engine/entity.ts#claimEffectLane`) resolve dois efeitos do
// MESMO POKE e nao resolve nada entre vizinhos: cada dono reivindica a raia 0
// dele, e as duas caixas caem na mesma faixa. Medido no harness da issue, um
// instante com 4 POKE em campo dava 4 colisoes em 13 caixas.
//
// O criterio de aceite pede MEDICAO das caixas, nao inspecao visual — entao o
// teste mede o mesmo que o jogo mede (`medirTextoDeCombate`, a funcao que o
// `Renderer` chama todo quadro) e confere sobreposicao com regua.
//
// O primeiro caso e a GUARDA ANTI-VACUO dos outros: ele prova que a cena
// montada aqui de fato colide sem a resolucao. Sem ele, um bug que fizesse
// `medirTextoDeCombate` devolver lista vazia deixaria os outros dois passarem
// com zero colisoes e zero informacao.
import { describe, expect, it } from 'vitest'

import { medirTextoDeCombate } from './sprites'
import {
  alturaDaFonte, resolverColunasDeTexto, seSobrepoem,
  type Caixa, type CaixaDeEfeito, type Janela, type Medidor,
} from './textoDeCombate'
import type { WorldEffect, WorldEntity, WorldState } from '@/engine/types'

/**
 * Largura de texto em monospace: ~0,6 em do tamanho declarado, por caractere.
 *
 * Nao e uma aproximacao qualquer — e a metrica real de uma fonte monoespacada,
 * que e a familia que TODO texto de combate usa (ver `FONTE`). O jsdom nao mede
 * texto (`measureText` devolve 0), entao sem isto o teste comprovaria que
 * caixas de largura zero nao colidem.
 */
const medidor: Medidor = {
  larguraDe: (texto, font) => texto.length * alturaDaFonte(font) * 0.6,
}

function entidade(id: string, x: number, speciesId = 'rattata'): WorldEntity {
  // `battleAnim: null` faz `visualTopOffset` cair no raio — o teste e sobre
  // colisao de caixas, e amarra-lo a arte de uma especie especifica o quebraria
  // no dia em que alguem reexportar o sheet.
  return {
    id, x, y: 150, radius: 16, battleAnim: null, facing: { x: 0, y: 1 },
    poke: { speciesId, level: 12, hp: 40, stats: { hp: 60 }, isShiny: false },
  } as unknown as WorldEntity
}

function efeito(over: Partial<WorldEffect> & Pick<WorldEffect, 'id' | 'type' | 'ownerId'>): WorldEffect {
  return {
    x: 0, y: 0, radius: 10, color: '#ffffff', duration: 0.9, delay: 0,
    age: 0.3, lane: 0, laneSize: 1,
    ...over,
  } as WorldEffect
}

/**
 * O instante de combate mais cheio que o jogo produz HOJE: 4 POKE em campo, 7
 * caixas.
 *
 * Sao 7 e nao as 13 que a issue mediu porque a PH-191 tirou os dois `rewardText`
 * por abate do campo (eles voam ate a carteira agora). A reducao e o que tornou
 * a resolucao possivel — 13 caixas nao cabiam na faixa util de 169px de mundo em
 * nenhum arranjo, e isso e limite de espaco, nao de algoritmo.
 */
function cenaCheia(): WorldState {
  const jogador = entidade('player-1', 40, 'charmeleon')
  const inimigos = [entidade('enemy-1', 82), entidade('enemy-2', 124), entidade('enemy-3', 166)]
  return {
    player: jogador,
    enemies: inimigos,
    effects: [
      // o hit que EU levei, com rotulo de efetividade (laneSize 2, como o motor faz)
      efeito({ id: 'e1', type: 'damageNumber', ownerId: 'player-1', value: 148, lane: 0, laneSize: 2,
        effectiveness: 'weak', effectivenessLabel: 'Pouco efetivo...' }),
      // o golpe que EU usei
      efeito({ id: 'e2', type: 'abilityName', ownerId: 'player-1', text: 'Lanca-Chamas', lane: 2 }),
      efeito({ id: 'e3', type: 'damageNumber', ownerId: 'enemy-1', value: 62, lane: 0 }),
      efeito({ id: 'e4', type: 'damageNumber', ownerId: 'enemy-2', value: 240, isCrit: true, lane: 0 }),
      efeito({ id: 'e5', type: 'abilityName', ownerId: 'enemy-2', text: 'Envenenado!', lane: 1 }),
      efeito({ id: 'e6', type: 'damageNumber', ownerId: 'enemy-3', value: 31, lane: 0,
        effectiveness: 'super', effectivenessLabel: 'Super efetivo!' }),
      efeito({ id: 'e7', type: 'abilityName', ownerId: 'enemy-3', text: 'Ataque ↓', lane: 2 }),
    ],
  } as unknown as WorldState
}

/**
 * A janela visivel em coordenada de MUNDO.
 *
 * `_computeCamera` poe o jogador em 58% da altura da tela, entao a borda de cima
 * fica `altura * 0,58 / zoom` acima dele. E essa borda que corta ate onde uma
 * caixa pode subir — texto empurrado pra fora da tela nao colide com nada e
 * tambem nao informa nada.
 */
function janela(_larguraTela: number, alturaTela: number, zoom: number, jogadorY = 150): Janela {
  return { y: jogadorY - (alturaTela * 0.58) / zoom, h: alturaTela / zoom }
}

function colisoesEntreDonos(caixas: readonly CaixaDeEfeito[], desvios?: Map<string, number>): string[] {
  const posicionadas = caixas.map((c) => ({ ...c, y: c.y - (desvios?.get(c.id) ?? 0) }))
  const achadas: string[] = []
  for (let i = 0; i < posicionadas.length; i++) {
    for (let j = i + 1; j < posicionadas.length; j++) {
      const a = posicionadas[i]
      const b = posicionadas[j]
      if (a.ownerId === b.ownerId) continue
      if (seSobrepoem(a, b)) achadas.push(`${a.id} x ${b.id}`)
    }
  }
  return achadas
}

function colisoesComRotulos(caixas: readonly CaixaDeEfeito[], fixas: readonly Caixa[], desvios: Map<string, number>): string[] {
  const achadas: string[] = []
  for (const c of caixas) {
    const posicionada = { ...c, y: c.y - (desvios.get(c.id) ?? 0) }
    for (const f of fixas) if (seSobrepoem(posicionada, f)) achadas.push(c.id)
  }
  return achadas
}

describe('layout do texto de combate com 4 POKE em campo (PH-189)', () => {
  it('a cena montada COLIDE sem a resolucao — senao os outros casos nao provam nada', () => {
    const { moveis } = medirTextoDeCombate(medidor, cenaCheia())
    expect(moveis).toHaveLength(7)
    expect(colisoesEntreDonos(moveis).length).toBeGreaterThan(0)
  })

  it('zero sobreposicao entre donos diferentes em 390px com zoom 2,2', () => {
    const { moveis, fixas } = medirTextoDeCombate(medidor, cenaCheia())
    const desvios = resolverColunasDeTexto(moveis, fixas, janela(390, 844, 2.2))
    expect(colisoesEntreDonos(moveis, desvios)).toEqual([])
  })

  it('zero sobreposicao entre donos diferentes em 1280px com zoom 1,5', () => {
    const { moveis, fixas } = medirTextoDeCombate(medidor, cenaCheia())
    const desvios = resolverColunasDeTexto(moveis, fixas, janela(1280, 800, 1.5))
    expect(colisoesEntreDonos(moveis, desvios)).toEqual([])
  })

  it('o texto de combate tambem nao cai em cima do nome/nivel de ninguem', () => {
    // O rotulo fixo identifica o corpo embaixo dele e nao pode sair do lugar;
    // quem se move e o texto de combate. Era uma das colisoes medidas na issue.
    const { moveis, fixas } = medirTextoDeCombate(medidor, cenaCheia())
    expect(fixas).toHaveLength(4)
    const desvios = resolverColunasDeTexto(moveis, fixas, janela(390, 844, 2.2))
    expect(colisoesComRotulos(moveis, fixas, desvios)).toEqual([])
  })

  it('nenhuma caixa e empurrada pra fora da borda de cima da tela', () => {
    const j = janela(390, 844, 2.2)
    const { moveis, fixas } = medirTextoDeCombate(medidor, cenaCheia())
    const desvios = resolverColunasDeTexto(moveis, fixas, j)
    for (const c of moveis) {
      expect(c.y - (desvios.get(c.id) ?? 0)).toBeGreaterThanOrEqual(j.y)
    }
  })

  it('a resolucao e estavel: a mesma cena resolvida duas vezes da o mesmo lugar', () => {
    // A passada roda a cada quadro. Uma ordem que dependesse da ordem do array
    // faria a mesma caixa saltar de altura entre dois quadros, que le pior que a
    // sobreposicao que ela conserta.
    const cena = cenaCheia()
    const a = medirTextoDeCombate(medidor, cena)
    const embaralhada = { ...cena, effects: [...cena.effects].reverse() } as WorldState
    const b = medirTextoDeCombate(medidor, embaralhada)
    const da = resolverColunasDeTexto(a.moveis, a.fixas, janela(390, 844, 2.2))
    const db = resolverColunasDeTexto(b.moveis, b.fixas, janela(390, 844, 2.2))
    for (const c of a.moveis) expect(db.get(c.id)).toBe(da.get(c.id))
  })
})
