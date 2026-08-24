// PH-82: desenhar uma arte que ainda nao chegou tem que PEDIR a arte.
//
// A falha que este teste tranca nao levanta erro, nao aparece em tipo e nao
// quebra tela nenhuma — ela some dentro de um fallback que funciona.
// `drawQuadroDeTira` checava `isImageReady(url)` e saia no `return false`
// ANTES de chamar `getOrLoadImage`, que e quem dispara o download. O cache
// nunca era preenchido, a checagem seguinte dava falso de novo, e o jogo
// desenhava o burst procedural pra sempre.
//
// Custou as 23 artes POR GOLPE inteiras: elas ficam fora do preload de
// proposito (data/moveVfx.ts), apostando exatamente neste carregamento no
// primeiro uso. Nenhuma jamais apareceu — o Bullet Punch, primeiro golpe a
// ganhar arte propria, saia identico ao burst de aco generico.
//
// O sintoma observavel e um so: uma tentativa de desenho tem que resultar num
// `new Image()` com `src` apontando pra aquela arte.
import { describe, it, expect, beforeEach, vi } from 'vitest'

/** URLs que alguem tentou carregar de verdade. */
let pedidas: string[] = []

class ImagemFalsa {
  // Nunca fica pronta: garante que o desenho SEMPRE caia no fallback, que e
  // justamente a situacao em que o pedido precisa sair mesmo assim.
  complete = false
  naturalWidth = 0
  naturalHeight = 0
  #src = ''
  set src(valor: string) { this.#src = valor; pedidas.push(valor) }
  get src() { return this.#src }
  addEventListener() {}
  removeEventListener() {}
}

vi.stubGlobal('Image', ImagemFalsa)

// O canvas so precisa aceitar as chamadas — o que importa e o pedido de rede,
// nao o pixel. Sem a arte o codigo desenha o burst procedural, que usa estes
// mesmos metodos.
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

function efeitoDeGolpe(abilityId: string, elementType = 'STEEL') {
  return {
    id: 'e1', type: 'abilityEffect' as const, x: 150, y: 150, targetX: 150, targetY: 150,
    radius: 14, color: '#b8b8d0', duration: 1, delay: 0, age: 0.3,
    elementType: elementType as never, abilityId, anguloDeAtaque: 0,
    laneSize: 1, ownerId: null, lane: 0,
  }
}

const mundoVazio = { player: null, enemies: [] } as never

/**
 * `sprites.ts` guarda o cache de imagem em modulo, e ele e justamente o que
 * este teste observa — reusar a instancia entre casos faria o segundo caso
 * medir o cache quente do primeiro. Cada caso comeca com o modulo zerado.
 */
async function spritesNovo() {
  vi.resetModules()
  pedidas = []
  return import('./sprites')
}

// AQUECIMENTO, e nao um import ocioso (PH-129). `sprites.ts` puxa um grafo
// grande, e a PRIMEIRA importacao dele custava ~550 ms de transformacao. Como o
// unico jeito de isolar os casos e `vi.resetModules()` + reimportar, esse custo
// caia dentro do primeiro `it` — que, sozinho, passava em 566 ms e, com a suite
// inteira disputando CPU, estourava o teto de 5 s por 62 ms. O caso reprovava
// por carga da maquina, nunca por defeito.
//
// `vi.resetModules()` limpa o registro de modulos, mas NAO joga fora a
// transformacao que o Vite ja fez do arquivo. Pagar a transformacao aqui, fora
// de qualquer `it`, deixa cada reimportacao custando os mesmos ~18 ms dos outros
// casos, sem afrouxar isolamento nenhum.
await import('./sprites')

const { vfxDoGolpe } = await import('@/data/moveVfx')
const ARTE_BULLET_PUNCH = vfxDoGolpe('bullet_punch')?.single.url

describe('desenhar arte que ainda nao chegou', () => {
  beforeEach(() => { pedidas = [] })

  it('bullet_punch continua com arte propria no catalogo', () => {
    // Guarda de sanidade: se a entrada sumir, os testes abaixo passariam a
    // medir o caminho da arte por TIPO sem ninguem perceber.
    expect(ARTE_BULLET_PUNCH).toBeDefined()
  })

  it('a PRIMEIRA tentativa de desenho ja pede a arte do golpe', async () => {
    // Era exatamente isto que nao acontecia: o desenho consultava o cache,
    // desistia, e nunca mandava buscar.
    const { drawEffect } = await spritesNovo()
    drawEffect(ctxFalso(), efeitoDeGolpe('bullet_punch'), mundoVazio)
    expect(pedidas).toContain(ARTE_BULLET_PUNCH)
  })

  it('desistir do desenho nao significa desistir do download', async () => {
    // A imagem falsa nunca fica `complete`, entao o desenho SEMPRE cai no
    // fallback — e mesmo assim o pedido tem que sair. Este e o par exato do
    // bug: o fallback funcionando escondia a arte que nunca vinha.
    const { drawEffect } = await spritesNovo()
    drawEffect(ctxFalso(), efeitoDeGolpe('bullet_punch'), mundoVazio)
    expect(pedidas.length).toBeGreaterThan(0)
  })

  it('pede uma vez so, nao a cada frame', async () => {
    // `getOrLoadImage` guarda no cache ja na primeira chamada. Sem isso, 60
    // tentativas por segundo virariam 60 downloads por segundo.
    const { drawEffect } = await spritesNovo()
    for (let i = 0; i < 30; i++) drawEffect(ctxFalso(), efeitoDeGolpe('bullet_punch'), mundoVazio)
    expect(pedidas.filter((u) => u === ARTE_BULLET_PUNCH)).toHaveLength(1)
  })

  it('vale pra arte por TIPO tambem, nao so pra a por golpe', async () => {
    // A por tipo e salva pelo preload da hunt; a por golpe nao. Mas o caminho
    // de desenho e o mesmo, e depender do preload pra mascarar o defeito e o
    // que fez ele durar tanto.
    const { drawEffect } = await spritesNovo()
    drawEffect(ctxFalso(), efeitoDeGolpe('golpe_que_nao_tem_arte_propria', 'FIRE'), mundoVazio)
    expect(pedidas.some((u) => u.includes('move-vfx'))).toBe(true)
  })
})
