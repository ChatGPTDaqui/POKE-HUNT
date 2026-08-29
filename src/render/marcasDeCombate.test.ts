// PH-189 — com 4 corpos em cena, o campo nao dizia qual POKE e o meu nem em
// quem eu estou batendo, e o HP no campo era so o comprimento de um traco de
// 32x5px.
//
// `player.targetId` ja existia e ja era publicado por `combatSystem#updateCombat`
// (a `StatusEffectsBar` le). O canvas simplesmente nao desenhava nada com ele.
//
// O que este arquivo tranca:
//   - as duas marcas existem, e sao marcas de FORMA e POSICAO diferentes (anel
//     no chao x colchete em volta do corpo), nao duas cores da mesma coisa;
//   - a porcentagem de HP sai no meu POKE e no alvo, e NAO num mob de passagem
//     — devolver texto pra todo mundo e o excesso que a issue esta tirando;
//   - `Renderer#renderMap` liga as duas coisas a quem de direito.
import { describe, expect, it } from 'vitest'

import { drawHpBar, drawMarcaDoAlvo, drawMarcaDoJogador } from './sprites'
import { Renderer } from './renderer'
import type { MapDef } from '@/data/maps'
import type { WorldEntity, WorldState } from '@/engine/types'

interface Traco { x: number; y: number }

function ctxEspiao() {
  const escritas: string[] = []
  const elipses: { x: number; y: number; rx: number }[] = []
  const linhas: Traco[] = []
  const alvo = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '', lineCap: '',
    textAlign: '', textBaseline: '', globalAlpha: 1, filter: '',
    save() {}, restore() {}, translate() {}, scale() {}, clearRect() {}, fillRect() {}, drawImage() {},
    fillText(texto: string) { escritas.push(texto) },
    strokeText() {},
    measureText: (t: string) => ({ width: t.length * 6 }),
    beginPath() {}, closePath() {}, stroke() {}, fill() {}, arc() {}, rect() {}, clip() {},
    moveTo(x: number, y: number) { linhas.push({ x, y }) },
    lineTo(x: number, y: number) { linhas.push({ x, y }) },
    arcTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    ellipse(x: number, y: number, rx: number) { elipses.push({ x, y, rx }) },
    createRadialGradient() { return { addColorStop() {} } as unknown as CanvasGradient },
    createLinearGradient() { return { addColorStop() {} } as unknown as CanvasGradient },
    createPattern() { return null },
    setTransform() {}, resetTransform() {}, getImageData() { return { data: [] } },
  }
  return { ctx: alvo as unknown as CanvasRenderingContext2D, escritas, elipses, linhas }
}

function entidade(id: string, over: Partial<WorldEntity> = {}): WorldEntity {
  return {
    id, x: 100, y: 100, radius: 16, battleAnim: null, facing: { x: 0, y: 1 },
    targetId: null, fainted: false,
    poke: { speciesId: 'rattata', level: 9, hp: 30, stats: { hp: 60 }, isShiny: false, ivs: {} },
    ...over,
  } as unknown as WorldEntity
}

describe('marca do meu POKE e do alvo (PH-189)', () => {
  it('a marca do jogador e um anel no CHAO, embaixo do corpo', () => {
    const { ctx, elipses } = ctxEspiao()
    const eu = entidade('player-1')
    drawMarcaDoJogador(ctx, eu)
    expect(elipses.length).toBeGreaterThanOrEqual(2) // dois aneis concentricos
    for (const e of elipses) {
      expect(e.x).toBeCloseTo(eu.x, 5)
      // No chao: na altura dos pes, nunca acima do centro do corpo.
      expect(e.y).toBeGreaterThanOrEqual(eu.y)
    }
    // O anel interno e menor que o externo — e o que faz os dois lerem como
    // marcador sobre grama de alta frequencia, e nao como um traco perdido.
    expect(elipses[1].rx).toBeLessThan(elipses[0].rx)
  })

  it('a marca do alvo sao quatro colchetes em VOLTA do corpo, nao um anel', () => {
    const { ctx, elipses, linhas } = ctxEspiao()
    drawMarcaDoAlvo(ctx, entidade('enemy-1'))
    expect(elipses).toHaveLength(0)
    // 4 cantos x 3 pontos (moveTo + 2 lineTo) = 12 pontos.
    expect(linhas).toHaveLength(12)
    const xs = linhas.map((p) => p.x)
    const ys = linhas.map((p) => p.y)
    // Cerca o corpo dos dois lados nos dois eixos.
    expect(Math.min(...xs)).toBeLessThan(100)
    expect(Math.max(...xs)).toBeGreaterThan(100)
    expect(Math.min(...ys)).toBeLessThan(100)
    expect(Math.max(...ys)).toBeGreaterThan(100)
  })
})

describe('porcentagem de HP no campo (PH-189)', () => {
  it('sai quando pedida, e nao sai quando nao', () => {
    const com = ctxEspiao()
    drawHpBar(com.ctx, entidade('e1'), true)
    expect(com.escritas).toContain('50%')

    const sem = ctxEspiao()
    drawHpBar(sem.ctx, entidade('e1'))
    expect(sem.escritas.some((t) => t.includes('%'))).toBe(false)
  })

  it('POKE com 1 de HP mostra 1%, e nao 0% — "0%" le como morto', () => {
    const { ctx, escritas } = ctxEspiao()
    drawHpBar(ctx, entidade('e1', {
      poke: { speciesId: 'rattata', level: 9, hp: 1, stats: { hp: 300 }, isShiny: false, ivs: {} },
    } as unknown as Partial<WorldEntity>), true)
    expect(escritas).toContain('1%')
  })
})

/**
 * Mapa minimo pra `renderMap` rodar. `bg.image` vazio faz o desenho de fundo e a
 * camada de ambiente virarem no-op — o que este teste julga e quem recebe marca
 * e quem recebe porcentagem, nao o cenario.
 */
function mapaFake(): MapDef {
  return {
    id: 'teste', bounds: { width: 800, height: 600 },
    bg: { image: '', tint: '#000000' }, collisionGrid: null,
  } as unknown as MapDef
}

/** `entidade` devolve o minimo comum; o campo `player` do mundo e tipado como
 * `PlayerEntity`, que exige mais. O elenco fica aqui, num lugar so. */
function comoJogador(e: WorldEntity): WorldState['player'] {
  return e as unknown as WorldState['player']
}

function mundo(over: Partial<WorldState> = {}): WorldState {
  const alvo = entidade('enemy-1', { x: 140 })
  const passante = entidade('enemy-2', { x: 220 })
  return {
    mapDef: mapaFake(),
    player: comoJogador(entidade('player-1', { targetId: 'enemy-1' })),
    enemies: [alvo, passante],
    effects: [],
    sala: null,
    clima: null,
    ...over,
  } as unknown as WorldState
}

function renderizar(world: WorldState) {
  const espiao = ctxEspiao()
  const canvas = {
    width: 390, height: 844,
    getContext: () => espiao.ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }),
  } as unknown as HTMLCanvasElement
  new Renderer(canvas).renderMap(world.mapDef!, world)
  return espiao
}

describe('quem recebe marca e porcentagem, no quadro de verdade (PH-189)', () => {
  it('o alvo e o meu POKE recebem porcentagem; o mob de passagem nao', () => {
    const { escritas } = renderizar(mundo())
    // jogador (50%) e alvo (50%) — duas porcentagens, nao tres.
    expect(escritas.filter((t) => t.endsWith('%'))).toHaveLength(2)
  })

  it('sem alvo, so o meu POKE recebe porcentagem', () => {
    const w = mundo()
    const { escritas } = renderizar(mundo({ player: comoJogador(entidade('player-1', { targetId: null })), enemies: w.enemies }))
    expect(escritas.filter((t) => t.endsWith('%'))).toHaveLength(1)
  })

  it('com o meu POKE derrubado nao sobra marca nenhuma na tela', () => {
    // Uma mira sobrando em cima de um mob sem POKE meu em campo leria como
    // ordem — "ataque este" — quando nao ha nada pra atacar com.
    const w = mundo()
    const { escritas, elipses } = renderizar(mundo({
      player: comoJogador(entidade('player-1', { targetId: 'enemy-1', fainted: true })),
      enemies: w.enemies,
    }))
    expect(escritas.filter((t) => t.endsWith('%'))).toHaveLength(0)
    expect(elipses.filter((e) => e.x === 100)).toHaveLength(0)
  })
})
