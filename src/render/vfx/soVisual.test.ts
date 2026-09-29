// A invariante que nao pode quebrar: VFX de golpe e SO DESENHO.
//
// Ligar ou desligar o VFX nao pode mudar dano, ordem de eventos nem relogio de
// combate — PvP e ranked comparam simulacoes, e um desenho que consumisse o rng
// do mundo ou escrevesse no efeito mudaria o resultado so por ter tela ligada.
//
// Como a simulacao roda sem render (headless, offline, flush), a garantia e
// ESTRUTURAL: o motor nao importa render/vfx, e render/vfx nao escreve no que
// recebe nem toca aleatoriedade compartilhada. Os tres casos abaixo trancam isso.
import { describe, expect, it } from 'vitest'
import type { WorldEffect } from '@/engine/types'
import { desenharVfxDeGolpe } from './desenharVfx'
import { novoOrcamento } from './orcamento'
import { REGISTRO_SINGLE } from './registro'
import { isolarRegistros } from './registroDeTeste'
import type { ContextoVfx } from './tipos'

const fontesDoVfx = import.meta.glob('./**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const fontesDoMotor = import.meta.glob('../../engine/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

// Comentario explica o porque e cita `world.rng`/`render/vfx` de proposito —
// a guarda olha so o CODIGO. Tira `/* */` e `//` de fim de linha (sem pegar o
// `//` de dentro de string, que nestes arquivos nao existe).
const semComentario = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1')
const producao = (fontes: Record<string, string>) =>
  Object.entries(fontes).filter(([p]) => !p.endsWith('.test.ts')).map(([p, f]) => [p, semComentario(f)] as const)

isolarRegistros()

function efeito(extra: Partial<WorldEffect> = {}): WorldEffect {
  return Object.freeze({
    id: 'effect-42', type: 'abilityEffect', x: 100, y: 100, targetX: 100, targetY: 90,
    origemX: 60, origemY: 90, anguloDeAtaque: 0, radius: 10, color: '#fff', duration: 3, delay: 0,
    age: 0.3, isAoe: false, elementType: 'FIRE', abilityId: 'flamethrower',
    laneSize: 1, ownerId: null, lane: 0, ...extra,
  }) as WorldEffect
}

const semPixel = (_d: CanvasRenderingContext2D, _r: unknown, _p: unknown, pintar: (c: CanvasRenderingContext2D) => void) => {
  pintar({} as CanvasRenderingContext2D)
  return true
}

describe('VFX de golpe e so visual', () => {
  it('o motor nao importa render/vfx', () => {
    const motor = producao(fontesDoMotor)
    expect(motor.length).toBeGreaterThan(10) // anti-teste-vacuo
    for (const [arquivo, fonte] of motor) expect(fonte, arquivo).not.toMatch(/from ['"][^'"]*render\/vfx/)
  })

  it('render/vfx nao usa aleatoriedade compartilhada e so importa TIPOS do motor', () => {
    const vfx = producao(fontesDoVfx)
    expect(vfx.length).toBeGreaterThan(5)
    for (const [arquivo, fonte] of vfx) {
      expect(fonte, arquivo).not.toMatch(/Math\.random\(/)
      expect(fonte, arquivo).not.toMatch(/world\.rng|nextFloat/)
      for (const linha of fonte.split('\n').filter(l => /from '@\/engine/.test(l))) {
        expect(linha, arquivo).toMatch(/^import type /)
      }
    }
  })

  it('desenhar um efeito congelado nao escreve nele, e a coreografia so ve numeros', () => {
    let visto: ContextoVfx | null = null
    REGISTRO_SINGLE.FIRE = { 3: { desenhar: c => { visto = c }, duracao: { 3: 900 }, alcance: 30 } }
    // Object.freeze + modo estrito dos modulos ES: qualquer escrita lanca.
    expect(desenharVfxDeGolpe({} as CanvasRenderingContext2D, efeito(), { pixelizar: semPixel, orcamento: novoOrcamento() })).toBe(true)
    expect(visto).not.toBeNull()
    expect(visto!.origem).toEqual({ x: 60, y: 90 })
    expect(visto!.alvo).toEqual({ x: 100, y: 90 })
    expect(Object.values(visto!).some(v => v && typeof v === 'object' && 'abilityId' in (v as object))).toBe(false)
  })

  it('mesmo ms desenha a mesma coisa: o rng e semeado pelo id do efeito', () => {
    const sorteios: number[][] = []
    REGISTRO_SINGLE.FIRE = { 3: { desenhar: c => { sorteios.push([c.rng(), c.rng(), c.rng()]) }, duracao: { 3: 900 }, alcance: 30 } }
    desenharVfxDeGolpe({} as CanvasRenderingContext2D, efeito(), { pixelizar: semPixel })
    desenharVfxDeGolpe({} as CanvasRenderingContext2D, efeito(), { pixelizar: semPixel })
    desenharVfxDeGolpe({} as CanvasRenderingContext2D, efeito({ id: 'effect-43' }), { pixelizar: semPixel })
    expect(sorteios[0]).toEqual(sorteios[1])
    expect(sorteios[2]).not.toEqual(sorteios[0])
  })

  it('efeito procedural fora da janela da coreografia nao devolve pra tira', () => {
    // Senao a tira PNG apareceria no rabo de um efeito anime (3 s de vida do
    // efeito contra ~0,9 s de coreografia).
    let chamadas = 0
    REGISTRO_SINGLE.FIRE = { 3: { desenhar: () => { chamadas++ }, duracao: { 3: 900 }, alcance: 30 } }
    expect(desenharVfxDeGolpe({} as CanvasRenderingContext2D, efeito({ age: 2.5 }), { pixelizar: semPixel })).toBe(true)
    expect(desenharVfxDeGolpe({} as CanvasRenderingContext2D, efeito({ delay: 0.5, age: 0.2 }), { pixelizar: semPixel })).toBe(true)
    expect(chamadas).toBe(0)
  })

  it('tipo nao migrado devolve false e nao desenha', () => {
    expect(desenharVfxDeGolpe({} as CanvasRenderingContext2D, efeito(), { pixelizar: semPixel })).toBe(false)
  })
})
