// PH-370: paralisia e queimadura ganharam simbolo SOBRE O CORPO, alem da tinta.
//
// Por que isto precisa de teste e nao "confia no cadastro": a tira estar em
// `TIRA_POR_CONDICAO_NO_CORPO` nao prova que alguem a desenha. Este projeto ja
// perdeu 23 artes por golpe exatamente assim (PH-82) e mais tres na PH-367 —
// cadastradas, em disco, cobertas por teste de existencia de arquivo, e nunca
// na tela. O sintoma observavel e o mesmo dos dois casos: uma tentativa de
// desenho tem que resultar num `new Image()` com `src` apontando pra arte.
//
// A tinta no corpo NAO e o que este arquivo mede — ela e uma propriedade de
// dado (`COR_DE_STATUS_NO_CORPO`) e `vfxTiras.test.ts` ja tranca as duas
// tabelas juntas. Aqui e so o desenho.
import { describe, it, expect, beforeEach, vi } from 'vitest'

import type { WorldEntity } from '@/engine/types'

let pedidas: string[] = []

class ImagemPronta {
  complete = true
  naturalWidth = 400
  naturalHeight = 20
  #src = ''
  set src(valor: string) { this.#src = valor; pedidas.push(valor) }
  get src() { return this.#src }
  addEventListener() {}
  removeEventListener() {}
}

vi.stubGlobal('Image', ImagemPronta)

function ctxFalso() {
  return new Proxy({}, {
    get: (_alvo, prop) => {
      if (prop === 'canvas') return { width: 300, height: 300 }
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
        return () => ({ addColorStop() {} })
      }
      return () => {}
    },
  }) as unknown as CanvasRenderingContext2D
}

function entidade(status: string | null, volatil: string | null = null): WorldEntity {
  return {
    id: 'e1', x: 100, y: 100, radius: 16, battleAnim: null, facing: 'down',
    statusVolatil: volatil ? { tipo: volatil } : undefined,
    poke: {
      speciesId: 'pikachu', level: 30, isShiny: false, hp: 50,
      stats: { hp: 100 }, ivs: {},
      status: status ? { tipo: status } : undefined,
    },
  } as unknown as WorldEntity
}

// Aquecimento fora de qualquer `it` (PH-129): a primeira importacao de
// `sprites.ts` custa ~550ms de transformacao e cairia dentro do primeiro caso.
await import('./sprites')

const { TIRA_POR_CONDICAO_NO_CORPO } = await import('@/data/vfxTiras')

async function spritesNovo() {
  vi.resetModules()
  pedidas = []
  return import('./sprites')
}

describe('simbolo de condicao sobre o corpo', () => {
  beforeEach(() => { pedidas = [] })

  it.each(['paralysis', 'burn'] as const)('POKE com %s pede a arte da condicao', async (status) => {
    const url = TIRA_POR_CONDICAO_NO_CORPO[status]!.url
    const { drawEntity } = await spritesNovo()
    drawEntity(ctxFalso(), entidade(status))
    expect(pedidas, `${status} tem simbolo e ele tem que ser desenhado`).toContain(url)
  })

  it.each(['poison', 'freeze', 'sleep'] as const)('POKE com %s NAO pede arte de condicao', async (status) => {
    // O outro lado: veneno e congelamento ficaram de fora de proposito (roxo e
    // ciano quase nao colidem com o elenco), e sono ja tem o badge de canto.
    const daCondicao = Object.values(TIRA_POR_CONDICAO_NO_CORPO).map((t) => t!.url)
    const { drawEntity } = await spritesNovo()
    drawEntity(ctxFalso(), entidade(status))
    for (const url of daCondicao) expect(pedidas, status).not.toContain(url)
  })

  it('POKE sem status nenhum nao pede nada de condicao', async () => {
    const daCondicao = Object.values(TIRA_POR_CONDICAO_NO_CORPO).map((t) => t!.url)
    const { drawEntity } = await spritesNovo()
    drawEntity(ctxFalso(), entidade(null))
    for (const url of daCondicao) expect(pedidas).not.toContain(url)
  })

  it('confusao continua com o badge de canto, e ela CONVIVE com a queimadura', async () => {
    // `poke.status` guarda um status nao-volatil e `statusVolatil` guarda a
    // confusao, entao os dois coexistem. O canal e separado justamente pra os
    // dois aparecerem: no slot unico do badge um apagaria o outro.
    const { drawEntity } = await spritesNovo()
    const { TIRA_CONFUSAO } = await import('@/data/vfxTiras')
    drawEntity(ctxFalso(), entidade('burn', 'confusion'))
    expect(pedidas).toContain(TIRA_CONFUSAO.url)
    expect(pedidas).toContain(TIRA_POR_CONDICAO_NO_CORPO.burn!.url)
  })
})
