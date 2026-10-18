// A pixel art de batalha nao pode sair borrada (18/10/2026). Mudar
// canvas.width/height zera o estado do contexto e religa
// `imageSmoothingEnabled`; o <GameCanvas> redimensiona DEPOIS de construir o
// Renderer, entao a suavizacao do construtor se perdia.
import { describe, expect, it } from 'vitest'
import { Renderer } from './renderer'

describe('pixel art nitida', () => {
  it('o redimensionamento desliga a suavizacao de novo', () => {
    const ctx = { imageSmoothingEnabled: true } as unknown as CanvasRenderingContext2D
    const canvas = { width: 800, height: 600, getContext: () => ctx } as unknown as HTMLCanvasElement
    const renderer = new Renderer(canvas)
    expect(ctx.imageSmoothingEnabled).toBe(false)
    // O que o navegador faz ao trocar width: o contexto volta ao padrao.
    canvas.width = 1024
    ctx.imageSmoothingEnabled = true
    renderer.handleResize()
    expect(ctx.imageSmoothingEnabled).toBe(false)
  })
})
