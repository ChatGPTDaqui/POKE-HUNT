// O treinador em campo: segue o POKE como GENTE, a 3 quadrados (09/10).
import { describe, expect, it } from 'vitest'
import { ESPACO_DO_TREINADOR, TreinadorEmCampo, lugarNoDuelo, pontoAtras } from './treinadorEmCampo'

const RAIO = 12
const DT = 1 / 60
/** Distancia de conforto entre os CENTROS (o pe do treinador fica 8 px abaixo). */
const CONFORTO = ESPACO_DO_TREINADOR + RAIO + 6
/** O POKE do jogador anda a 91 px/s (engine/entity.ts). */
const VEL_DO_POKE = 91

type P = { x: number; y: number }
const centro = (t: TreinadorEmCampo): P => ({ x: t.pe!.x, y: t.pe!.y - 8 })
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y)

/** Leva o POKE em linha reta de `de` ate `ate` na velocidade do jogo. Devolve os centros do treinador. */
function andar(t: TreinadorEmCampo, de: P, ate: P, bloqueado?: (x: number, y: number) => boolean): P[] {
  const passos = Math.max(1, Math.round(dist(de, ate) / (VEL_DO_POKE * DT)))
  const rastro: P[] = []
  for (let i = 1; i <= passos; i++) {
    const k = i / passos
    t.atualizar({ x: de.x + (ate.x - de.x) * k, y: de.y + (ate.y - de.y) * k, radius: RAIO, facing: { x: ate.x - de.x, y: ate.y - de.y } }, DT, bloqueado)
    rastro.push(centro(t))
  }
  return rastro
}

/** POKE parado em `p` por `seg` segundos. */
function esperar(t: TreinadorEmCampo, p: P, seg: number, bloqueado?: (x: number, y: number) => boolean): void {
  for (let i = 0; i < Math.round(seg / DT); i++) t.atualizar({ ...p, radius: RAIO }, DT, bloqueado)
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

describe('TreinadorEmCampo: seguidor de gente (09/10)', () => {
  it('3 quadrados de espaco: ao parar, alcanca e fica na distancia de conforto', () => {
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 100 }, { x: 400, y: 100 })
    esperar(t, { x: 400, y: 100 }, 3)
    const d = dist(centro(t), { x: 400, y: 100 })
    expect(d).toBeGreaterThanOrEqual(CONFORTO - 1)
    expect(d).toBeLessThanOrEqual(CONFORTO + ESPACO_DO_TREINADOR / 3 + 1)
    expect(t.animacao).toBe('Idle')
  })

  it('andando junto, nao fica pra tras: aperta o passo e o atraso para de crescer', () => {
    const t = new TreinadorEmCampo()
    const centros = andar(t, { x: 0, y: 100 }, { x: 900, y: 100 })
    // Depois do arranque, o atraso estabiliza (velocidade cresce com o atraso).
    const pokeX = (i: number) => (900 * (i + 1)) / centros.length
    const atrasoMeio = pokeX(centros.length / 2) - centros[centros.length / 2 | 0].x
    const atrasoFim = 900 - centros[centros.length - 1].x
    expect(atrasoFim).toBeLessThan(CONFORTO + 40)
    expect(Math.abs(atrasoFim - atrasoMeio)).toBeLessThan(6)
  })

  it('POKE indo e voltando perto (combate): o treinador fica parado, olhando, sem copiar o vaivem', () => {
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 100 }, { x: 300, y: 100 })
    esperar(t, { x: 300, y: 100 }, 3)
    const antes = { ...t.pe! }
    for (let k = 0; k < 6; k++) {
      andar(t, { x: 300, y: 100 }, { x: 310, y: 112 })
      andar(t, { x: 310, y: 112 }, { x: 300, y: 100 })
    }
    expect(t.pe).toEqual(antes)
    expect(t.animacao).toBe('Idle')
  })

  it('parado, vira pra olhar o POKE', () => {
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 100 }, { x: 300, y: 100 })
    esperar(t, { x: 300, y: 100 }, 2)
    // POKE da a volta pro lado de cima do treinador, ainda dentro da folga.
    const c = centro(t)
    andar(t, { x: 300, y: 100 }, { x: c.x + 10, y: c.y - CONFORTO })
    esperar(t, { x: c.x + 10, y: c.y - CONFORTO }, 2)
    expect(t.animacao).toBe('Idle')
  })

  it('no aberto corta caminho: na curva do L nao refaz o canto do POKE', () => {
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 500 }, { x: 0, y: 100 })
    const centros = andar(t, { x: 0, y: 100 }, { x: 300, y: 100 })
    // Algum ponto do caminho dele fica fora das duas pernas do L (diagonal).
    expect(centros.some((p) => p.x > 2 && p.y > 102)).toBe(true)
  })

  it('com parede, contorna pelo caminho do POKE e nunca pisa na parede', () => {
    // Parede: o quadrado x 20..300, y 120..500 (o POKE sobe por x=0 e vira a direita em y=100).
    const parede = (x: number, y: number) => x > 20 && x < 300 && y > 120 && y < 500
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 500 }, { x: 0, y: 100 }, parede)
    const centros = andar(t, { x: 0, y: 100 }, { x: 400, y: 100 }, parede)
    centros.push(...(() => { esperar(t, { x: 400, y: 100 }, 3, parede); return [centro(t)] })())
    for (const p of centros) expect(parede(p.x, p.y), `${p.x.toFixed(1)},${p.y.toFixed(1)}`).toBe(false)
    expect(dist(centro(t), { x: 400, y: 100 })).toBeLessThan(CONFORTO + ESPACO_DO_TREINADOR)
  })

  it('salto grande (troca de sala) reposiciona atras do POKE sem atravessar o mapa', () => {
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 100 }, { x: 200, y: 100 })
    t.atualizar({ x: 900, y: 600, radius: RAIO, facing: { x: 0, y: 1 } }, DT)
    const pe = t.pe!
    expect(Math.hypot(pe.x - 900, pe.y - 600)).toBeLessThan(CONFORTO + 20)
    // Olhando pra baixo, ele fica ATRAS (acima).
    expect(pe.y).toBeLessThan(600)
  })

  it('sem POKE em campo o treinador some', () => {
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 100 }, { x: 200, y: 100 })
    t.atualizar(null, DT)
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

  it('caminhada no ciclo do PMD: um quadro a cada ~10 px andados pelo TREINADOR', () => {
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 100 }, { x: 300, y: 100 })
    let andado = 0, trocas = 0
    let antes = centro(t), q = t.quadro
    const vistos = new Set<number>()
    let x = 300
    while (andado < 160) {
      x += VEL_DO_POKE * DT
      t.atualizar({ x, y: 100, radius: RAIO, facing: { x: 1, y: 0 } }, DT)
      andado += dist(centro(t), antes)
      antes = centro(t)
      if (t.quadro !== q) { trocas++; q = t.quadro }
      vistos.add(t.quadro)
    }
    // 160 px a 40 px por volta (9/11/9/11) = 16 trocas (±1 pelo arredondamento).
    expect(Math.abs(trocas - 16)).toBeLessThanOrEqual(1)
    expect(vistos).toEqual(new Set([0, 1, 2, 3]))
  })

  it('parando no meio do passo, fecha as pernas no quadro neutro', () => {
    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 100 }, { x: 300, y: 100 })
    let x = 300
    while (t.quadro % 2 === 0 || t.animacao !== 'Walk') { x += 1.5; t.atualizar({ x, y: 100, radius: RAIO, facing: { x: 1, y: 0 } }, DT) }
    // POKE para: o treinador ainda anda ate o conforto, mas nunca congela de perna aberta.
    for (let i = 0; i < 120; i++) {
      const pe = { ...t.pe! }
      t.atualizar({ x, y: 100, radius: RAIO }, DT)
      // (No Idle o quadro 1 e a respiracao, nao passo.)
      if (t.animacao === 'Walk' && t.pe!.x === pe.x && t.pe!.y === pe.y) expect(t.quadro % 2).toBe(0)
    }
  })

  it('duelo de PvP: atras da bola do proprio lado, olhando pro rival, parado e respirando', () => {
    const meu = lugarNoDuelo({ x: 330, y: 1330 }, { x: 590, y: 1330 })
    const dele = lugarNoDuelo({ x: 590, y: 1330 }, { x: 330, y: 1330 })
    // No duelo o recuo continua de 2 quadrados (borda do tatame).
    expect(meu.pe.x).toBe(330 - 40)
    expect(dele.pe.x).toBe(590 + 40)
    expect(meu.olhando).toEqual({ x: 1, y: 0 })
    expect(dele.olhando).toEqual({ x: -1, y: 0 })

    const t = new TreinadorEmCampo()
    andar(t, { x: 0, y: 100 }, { x: 200, y: 100 })
    for (let i = 0; i < 200; i++) t.parado(meu.pe, meu.olhando, DT)
    expect(t.pe).toEqual(meu.pe)
    expect(t.animacao).toBe('Idle')
    // Saindo do duelo, volta pra tras do POKE em vez de atravessar o mapa andando.
    t.atualizar({ x: 1000, y: 100, radius: RAIO, facing: { x: 1, y: 0 } }, DT)
    expect(1000 - t.pe!.x).toBeCloseTo(CONFORTO, 0)
  })
})
