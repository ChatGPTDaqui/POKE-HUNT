// PH-367: golpe de status com arte PROPRIA tem que desenhar a arte propria.
//
// A falha nao lanca erro e nao aparece em tipo nenhum. `drawAbilityEffect`
// tentava o GIF de status por tipo+direcao ANTES de consultar
// `VFX_POR_GOLPE`, e `drawStatusEffect` devolve true pra todo golpe de status
// cujo TIPO tem sheet no catalogo (16 dos 18). Resultado: `charm` (FAIRY),
// `taunt` (DARK) e `spider_web` (BUG) desenhavam o brilho genérico do tipo, e
// a arte nomeada deles — coracoes, estrelas vermelhas, teia — nunca chegava na
// tela. `dragon_dance` era o unico que funcionava, por acidente: DRAGON esta
// fora de `TIPOS_COM_ARTE`.
//
// O que o teste observa e o mesmo sintoma da PH-82: uma tentativa de desenho
// tem que resultar num `new Image()` com `src` apontando pra arte certa. A
// diferenca crucial em relacao a `carregaArteAoDesenhar.test.ts` e que aqui a
// imagem falsa fica PRONTA — com imagem que nunca carrega, `drawStatusEffect`
// devolve false, o desenho cai no caminho de baixo e o defeito desaparece.
import { describe, it, expect, beforeEach, vi } from 'vitest'

let pedidas: string[] = []

class ImagemPronta {
  // PRONTA de proposito: e a unica condicao em que `drawStatusEffect` devolve
  // true e o `return` antecipado acontece.
  complete = true
  naturalWidth = 480
  naturalHeight = 32
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

function efeitoDeStatus(abilityId: string, elementType: string, isAoe = false) {
  return {
    id: 'e1', type: 'abilityEffect' as const, x: 150, y: 150, targetX: 150, targetY: 150,
    radius: 14, color: '#b8b8d0', duration: 1, delay: 0, age: 0.3,
    elementType: elementType as never, abilityId, anguloDeAtaque: 0,
    statusDirection: 'diminui' as const, isAoe, worldSize: isAoe ? 60 : undefined,
    laneSize: 1, ownerId: null, lane: 0,
  }
}

const mundoVazio = { player: null, enemies: [] } as never

// `sprites.ts` guarda o cache de imagem em modulo — reusar a instancia entre
// casos faria o segundo caso medir o cache quente do primeiro.
async function spritesNovo() {
  vi.resetModules()
  pedidas = []
  return import('./sprites')
}

// Aquecimento fora de qualquer `it`, pelo mesmo motivo da PH-129: a PRIMEIRA
// importacao de `sprites.ts` custa ~550 ms de transformacao e cairia dentro do
// primeiro caso, que reprovaria por carga da maquina e nao por defeito.
await import('./sprites')

const { vfxDoGolpe } = await import('@/data/moveVfx')
const { statusVfxUrl } = await import('@/data/statusVfx')

// Os tres golpes de status que tinham arte propria engolida, com o TIPO que
// causava o engolimento. Sao dados, nao suposicao: cada um sai do cadastro.
const ENGOLIDOS: [string, string][] = [
  ['charm', 'FAIRY'],
  ['taunt', 'DARK'],
  ['spider_web', 'BUG'],
]

describe('arte propria de golpe de status', () => {
  beforeEach(() => { pedidas = [] })

  it('os tres golpes continuam sendo status de tipo COM GIF (senao o teste nao mede nada)', () => {
    for (const [golpe, tipo] of ENGOLIDOS) {
      expect(vfxDoGolpe(golpe)?.single.url, golpe).toBeDefined()
      expect(statusVfxUrl(tipo as never, 'diminui'), tipo).toBeTruthy()
    }
  })

  it.each(ENGOLIDOS)('%s pede a arte do golpe, nao o GIF do tipo', async (golpe, tipo) => {
    const { drawEffect } = await spritesNovo()
    drawEffect(ctxFalso(), efeitoDeStatus(golpe, tipo), mundoVazio)
    expect(pedidas, `${golpe} tem arte propria e ela tem que vencer a do tipo`)
      .toContain(vfxDoGolpe(golpe)!.single.url)
    expect(pedidas, `${golpe} nao deveria nem tentar o GIF do tipo`)
      .not.toContain(statusVfxUrl(tipo as never, 'diminui'))
  })

  it('golpe de status SEM arte propria continua no GIF do tipo', async () => {
    // O outro lado da guarda: os ~194 golpes de status restantes nao mudam de
    // comportamento. `growl` e NORMAL/status/aoe e nao tem entrada em
    // VFX_POR_GOLPE.
    expect(vfxDoGolpe('growl')).toBeNull()
    const { drawEffect } = await spritesNovo()
    drawEffect(ctxFalso(), efeitoDeStatus('growl', 'NORMAL', true), mundoVazio)
    expect(pedidas).toContain(statusVfxUrl('NORMAL', 'diminui'))
  })

  it('golpe de status de AREA com arte so de alvo-unico fica no GIF do tipo', async () => {
    // A guarda olha o RAMO, nao a existencia da entrada. `charm` tem `single` e
    // nao tem `aoe`; num efeito de area, deixar a arte de golpe vencer levaria
    // o desenho pra tira de AREA do tipo — arte generica, e ainda por cima
    // esticada pro diametro do splash. O GIF le melhor.
    expect(vfxDoGolpe('charm')?.aoe).toBeUndefined()
    const { drawEffect } = await spritesNovo()
    drawEffect(ctxFalso(), efeitoDeStatus('charm', 'FAIRY', true), mundoVazio)
    expect(pedidas).toContain(statusVfxUrl('FAIRY', 'diminui'))
  })
})
