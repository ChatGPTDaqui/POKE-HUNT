// PH-480: golpe de status com a arte ainda BAIXANDO nao pode cair na tira de
// tipo — que e a arte de impacto de ataque.
//
// POR QUE ESTE ARQUIVO EXISTE SEPARADO DE `arteDeGolpeDeStatus.test.ts`
// -----------------------------------------------------------------------------
// Aquele arquivo carrega imagens PRONTAS, e com imagem pronta o selo desenha e a
// funcao devolve antes de chegar em qualquer fallback. Ou seja: ele prova que o
// caminho feliz nao empresta arte de ataque, e nao prova nada sobre a guarda.
//
// A guarda (`permitirTiraDeTipo`) so entra em jogo no INTERVALO — golpe de
// status com arte propria cuja imagem ainda nao chegou. Era exatamente esse
// intervalo o defeito: `drawImpactBurst` tenta a arte do golpe, ela nao esta
// pronta, e a linha seguinte pede a tira do TIPO. Um Rosnado desenhando a
// explosao de NORMAL no peito do alvo.
//
// A DIFERENCA DE MEDICAO: aqui o que se observa e o PEDIDO da imagem
// (`new Image().src`), nao o desenho. `getOrLoadImage` dispara o download antes
// de saber se vai dar pra desenhar, entao o pedido acontece mesmo com a imagem
// fria — e e por isso que `not.toContain` diz alguma coisa.
import { describe, it, expect, beforeEach, vi } from 'vitest'

let pedidas: string[] = []

/** NUNCA carrega — e o estado que a guarda existe pra cobrir. */
class ImagemPendente {
  complete = false
  naturalWidth = 0
  naturalHeight = 0
  #src = ''
  set src(valor: string) { this.#src = valor; pedidas.push(valor) }
  get src() { return this.#src }
  addEventListener() {}
  removeEventListener() {}
}

vi.stubGlobal('Image', ImagemPendente)

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

function efeito(abilityId: string, isAoe: boolean, deStatus: boolean) {
  return {
    id: 'e1', type: 'abilityEffect' as const, x: 150, y: 150, targetX: 150, targetY: 150,
    radius: 14, color: '#b8b8d0', duration: 1, delay: 0, age: 0.3,
    elementType: 'FAIRY' as never, abilityId, anguloDeAtaque: 0,
    statusDirection: deStatus ? ('diminui' as const) : undefined,
    statusStat: deStatus ? ('atkFis' as const) : undefined,
    isAoe, worldSize: isAoe ? 60 : undefined,
    laneSize: 1, ownerId: null, lane: 0,
  } as never
}

const mundoVazio = { player: null, enemies: [] } as never

async function spritesNovo() {
  vi.resetModules()
  pedidas = []
  return import('./sprites')
}

// Aquecimento fora de qualquer `it` (PH-129/PH-411).
await import('./sprites')

const { vfxDoGolpe } = await import('@/data/moveVfx')
const { tiraDoElemento, tiraDeAreaDoElemento } = await import('@/data/vfxTiras')

describe('a guarda do fallback de status (PH-480)', () => {
  beforeEach(() => { pedidas = [] })

  it('`charm` com a arte fria pede a arte dele, e NAO a tira de impacto de FAIRY', async () => {
    // `charm` e um dos tres golpes de status com arte propria (PH-367), e e o
    // unico caso em que o desenho de status chega no burst.
    const propria = vfxDoGolpe('charm')!.single.url
    const doTipo = tiraDoElemento('FAIRY' as never)!.url
    expect(propria, 'sem arte propria o caso nao mede nada').toBeTruthy()
    expect(doTipo, 'sem tira de FAIRY o caso nao mede nada').toBeTruthy()

    const { drawEffect } = await spritesNovo()
    drawEffect(ctxFalso(), efeito('charm', false, true), mundoVazio)

    expect(pedidas, 'a arte do golpe continua sendo pedida').toContain(propria)
    expect(pedidas, 'a tira de tipo e arte de ATAQUE — status nao pode cair nela')
      .not.toContain(doTipo)
  })

  it('status em AREA so pede o selo — nem arte de golpe, nem tira de area', async () => {
    // ESTE CASO NAO EXERCITA A GUARDA, e dizer isso e o ponto. Hoje nenhum golpe
    // de status tem arte de AREA propria, entao `drawAbilityEffect` nem chega a
    // chamar `drawAoeRing` — ele para no selo. O `permitirTiraDeTipo` de
    // `drawAoeRing` e cinto para o dia em que um golpe de status ganhar `aoe`;
    // sabotar a guarda hoje deixa este caso verde, e isso e informacao, nao
    // falha (ver a memoria "guarda que so cobre o caso vazio").
    //
    // O que ELE trava e o resultado, que e o que o dono pediu: um Rosnado em
    // area nao desenha explosao nenhuma no corpo de ninguem.
    const deArea = tiraDeAreaDoElemento('FAIRY' as never)!.url
    const doTipo = tiraDoElemento('FAIRY' as never)!.url
    expect(vfxDoGolpe('charm')?.aoe, 'se `charm` ganhar arte de area, o caso muda de sentido')
      .toBeUndefined()
    const { drawEffect } = await spritesNovo()
    drawEffect(ctxFalso(), efeito('charm', true, true), mundoVazio)
    expect(pedidas).not.toContain(deArea)
    expect(pedidas).not.toContain(doTipo)
  })

  it('golpe de DANO com a arte fria CONTINUA caindo na tira do tipo', async () => {
    // O contra-caso, e ele e obrigatorio: cortar o fallback pra todo mundo
    // apagaria a arte de impacto do jogo inteiro e os dois casos acima
    // passariam igual.
    const propria = vfxDoGolpe('charm')!.single.url
    const doTipo = tiraDoElemento('FAIRY' as never)!.url
    const { drawEffect } = await spritesNovo()
    drawEffect(ctxFalso(), efeito('charm', false, false), mundoVazio)
    expect(pedidas).toContain(propria)
    expect(pedidas).toContain(doTipo)
  })
})
