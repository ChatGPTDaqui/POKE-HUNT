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

  // OS QUATRO, e nao dois (PH-416). Veneno e congelamento entraram no canal de
  // corpo junto com a arte deles — a PH-370 os havia deixado de fora apostando
  // que "roxo e ciano quase nao colidem com o elenco", e a mesma bancada que
  // aprovou paralisia e queimadura (`condicao-sobre-o-corpo.mjs`) mostrou um
  // Gengar envenenado indistinguivel de um Gengar saudavel.
  it.each(['poison', 'burn', 'paralysis', 'freeze'] as const)(
    'POKE com %s pede a arte da condicao',
    async (status) => {
      const url = TIRA_POR_CONDICAO_NO_CORPO[status]!.url
      const { drawEntity } = await spritesNovo()
      drawEntity(ctxFalso(), entidade(status))
      expect(pedidas, `${status} tem glifo e ele tem que ser desenhado`).toContain(url)
    },
  )

  it('POKE dormindo NAO pede arte de condicao — sono e badge de canto', async () => {
    // O sono e o unico status nao-volatil que fica fora do canal de corpo, e
    // isso e decisao e nao lacuna: ele nao tem cor de corpo (um POKE dormindo se
    // le pelo simbolo, nao pelo tom) e o "Z" ja mora no slot de badge.
    const daCondicao = Object.values(TIRA_POR_CONDICAO_NO_CORPO).map((t) => t!.url)
    const { drawEntity } = await spritesNovo()
    drawEntity(ctxFalso(), entidade('sleep'))
    for (const url of daCondicao) expect(pedidas, 'sleep').not.toContain(url)
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
