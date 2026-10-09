// O treinador anda atras do POKE, 2 quadrados de espaco, pelo RASTRO (08/10).
import { describe, expect, it } from 'vitest'
import { ESPACO_DO_TREINADOR, TreinadorEmCampo, pontoAtras } from './treinadorEmCampo'

const RAIO = 12

/** Leva o POKE em linha reta de `de` ate `ate`, quadro a quadro. */
function andar(t: TreinadorEmCampo, de: { x: number; y: number }, ate: { x: number; y: number }, passos = 60) {
  for (let i = 1; i <= passos; i++) {
    const k = i / passos
    t.atualizar({ x: de.x + (ate.x - de.x) * k, y: de.y + (ate.y - de.y) * k, radius: RAIO, facing: { x: ate.x - de.x, y: ate.y - de.y } }, 1 / 60)
  }
}

describe('pontoAtras', () => {
  it('mede ao longo do caminho, nao em linha reta', () => {
    // L: sobe 30 e vira 30 pra direita. 40 px atras do fim = 10 px antes da curva.
    const rastro = [{ x: 0, y: 30 }, { x: 0, y: 0 }, { x: 30, y: 0 }]
    expect(pontoAtras(rastro, 40)).toEqual({ x: 0, y: 10 })
  })

  it('rastro curto devolve null', () => {
    expect(pontoAtras([{ x: 0, y: 0 }, { x: 5, y: 0 }], 40)).toBeNull()
  })
})

describe('TreinadorEmCampo', () => {
  it('em linha reta fica 2 quadrados ATRAS do POKE (espaco entre os corpos)', () => {
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 100 }, { x: 200, y: 100 })
    const pe = t.pe!
    expect(pe.x).toBeLessThan(200)
    // Distancia horizontal = espaco + raio do POKE + meia largura do boneco.
    expect(200 - pe.x).toBeCloseTo(ESPACO_DO_TREINADOR + RAIO + 6, 0)
    expect(t.animacao).toBe('Walk')
  })

  it('POKE parado: treinador para e respira (Idle)', () => {
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 100 }, { x: 200, y: 100 })
    const antes = t.pe!
    for (let i = 0; i < 30; i++) t.atualizar({ x: 200, y: 100, radius: RAIO }, 1 / 60)
    expect(t.pe).toEqual(antes)
    expect(t.animacao).toBe('Idle')
  })

  it('segue o caminho na curva em vez de cortar caminho', () => {
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 300 }, { x: 0, y: 100 })
    andar(t, { x: 0, y: 100 }, { x: 30, y: 100 }, 20)
    // Ainda na perna vertical do L (x = 0), nao na diagonal.
    expect(t.pe!.x).toBeCloseTo(0, 5)
  })

  it('salto grande (troca de sala) reposiciona atras do POKE sem atravessar o mapa', () => {
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 100 }, { x: 200, y: 100 })
    t.atualizar({ x: 900, y: 600, radius: RAIO, facing: { x: 0, y: 1 } }, 1 / 60)
    const pe = t.pe!
    expect(Math.hypot(pe.x - 900, pe.y - 600)).toBeLessThan(ESPACO_DO_TREINADOR + RAIO + 20)
    // Olhando pra baixo, ele fica ATRAS (acima).
    expect(pe.y).toBeLessThan(600)
  })

  it('sem POKE em campo o treinador some', () => {
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 100 }, { x: 200, y: 100 })
    t.atualizar(null, 1 / 60)
    expect(t.pe).toBeNull()
  })

  it('desenha o nome do treinador em cima do boneco; sem nome, nenhum texto', () => {
    const textos: { texto: string; y: number }[] = []
    const ctx = {
      save() {}, restore() {}, beginPath() {}, ellipse() {}, fill() {}, drawImage() {},
      strokeText() {}, fillText(texto: string, _x: number, y: number) { textos.push({ texto, y }) },
    } as unknown as CanvasRenderingContext2D
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 100 }, { x: 200, y: 100 })
    t.desenhar(ctx)
    expect(textos).toEqual([])
    t.nome = 'Ash'
    t.desenhar(ctx)
    expect(textos).toHaveLength(1)
    expect(textos[0].texto).toBe('Ash')
    expect(textos[0].y).toBeLessThan(t.pe!.y - 30)
  })

  it('caminhada no ciclo do PMD: um quadro a cada ~10 px, volta inteira em 40 px', () => {
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 100 }, { x: 200, y: 100 })
    // Comeca a contar do zero a partir daqui: reposiciona e anda 1 px por quadro.
    const quadros: number[] = []
    let x = 200
    for (let i = 0; i < 80; i++) {
      x += 1
      t.atualizar({ x, y: 100, radius: RAIO, facing: { x: 1, y: 0 } }, 1 / 60)
      quadros.push(t.quadro)
    }
    // Troca de quadro: 4 trocas por 40 px (9/11/9/11), e nao 8 (era 5 px cada).
    const trocas = quadros.filter((q, i) => i > 0 && q !== quadros[i - 1]).length
    expect(trocas).toBe(8)
    expect(new Set(quadros)).toEqual(new Set([0, 1, 2, 3]))
  })

  it('parando no meio do passo, fecha as pernas no quadro neutro', () => {
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 100 }, { x: 200, y: 100 })
    let x = 200
    while (t.quadro % 2 === 0) { x += 1; t.atualizar({ x, y: 100, radius: RAIO, facing: { x: 1, y: 0 } }, 1 / 60) }
    t.atualizar({ x, y: 100, radius: RAIO, facing: { x: 1, y: 0 } }, 1 / 60)
    expect(t.animacao).toBe('Walk')
    expect(t.quadro % 2).toBe(0)
  })
})
