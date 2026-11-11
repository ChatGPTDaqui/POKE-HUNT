// Ciclo de caminhada das skins (29/10/2026, "sensacao de movimento").
//
// Antes da estabilizacao, a cabeca pulava ate 13 px (de ~220) entre dois
// quadros seguidos — o passo "soluçava". O importador agora alinha cada quadro
// pelo centro de massa; este teste segura o pulo abaixo de 5% da altura do
// corpo em toda linha de toda skin.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import quadros from '../../src/data/quadrosDoTreinador.json'

const RAIZ = join(__dirname, '..', '..')

function topos(skin: string): number[][] {
  const g = quadros[skin as keyof typeof quadros]
  const p = PNG.sync.read(readFileSync(join(RAIZ, `assets/treinadores/campo/${skin}/Walk-Anim.png`)))
  const linhas: number[][] = []
  for (let r = 0; r < 8; r++) {
    const linha: number[] = []
    for (let q = 0; q < g.walkFrames; q++) {
      let topo = g.frameHeight
      for (let y = 0; y < g.frameHeight && topo === g.frameHeight; y++) {
        for (let x = 0; x < g.frameWidth; x++) {
          if (p.data[((r * g.frameHeight + y) * p.width + q * g.frameWidth + x) * 4 + 3] > 200) { topo = y; break }
        }
      }
      linha.push(topo)
    }
    linhas.push(linha)
  }
  return linhas
}

describe('ciclo de caminhada sem soluço', () => {
  for (const skin of Object.keys(quadros)) {
    it(`${skin}: a cabeça não pula mais que 5% da altura entre quadros seguidos`, () => {
      const g = quadros[skin as keyof typeof quadros]
      const limite = g.bodyHeight * 0.05
      for (const [r, linha] of topos(skin).entries()) {
        for (let q = 0; q < linha.length; q++) {
          const pulo = Math.abs(linha[q] - linha[(q + 1) % linha.length])
          expect(pulo, `${skin} linha ${r} quadros ${q}->${(q + 1) % linha.length}`).toBeLessThanOrEqual(limite)
        }
      }
    })
  }
})

// "Efeito de andar de verdade" (10/11/2026): na arte de origem as pernas quase
// nao mudavam entre os quadros e o boneco deslizava. O ciclo e gerado: tronco e
// cabeca identicos nos 4 quadros, e as pernas mudam de um quadro pro seguinte.
function diferenca(skin: string, r: number, a: number, b: number, deY: number, ateY: number, p: PNG): number {
  const g = quadros[skin as keyof typeof quadros]
  let n = 0
  for (let y = deY; y < ateY; y++) for (let x = 0; x < g.frameWidth; x++) {
    const i = ((r * g.frameHeight + y) * p.width + a * g.frameWidth + x) * 4
    const j = ((r * g.frameHeight + y) * p.width + b * g.frameWidth + x) * 4
    if ((p.data[i + 3] > 128) !== (p.data[j + 3] > 128)) n++
  }
  return n
}

describe('ciclo de caminhada com passo', () => {
  for (const skin of Object.keys(quadros)) {
    it(`${skin}: 4 quadros, tronco parado e pernas que alternam em toda direção`, () => {
      const g = quadros[skin as keyof typeof quadros]
      expect(g.walkFrames).toBe(4)
      const p = PNG.sync.read(readFileSync(join(RAIZ, `assets/treinadores/campo/${skin}/Walk-Anim.png`)))
      const quadril = Math.round(g.footY - g.bodyHeight * 0.32)
      // Um pe de ~1 px de mundo de largura por ~2 de altura, na resolucao da fonte.
      const minimo = (g.bodyHeight / 30) ** 2 * 2
      for (let r = 0; r < 8; r++) {
        for (let q = 1; q < 4; q++) expect(diferenca(skin, r, 0, q, 0, quadril, p), `${skin} linha ${r}: tronco mudou no quadro ${q}`).toBe(0)
        const mexe = [0, 1, 2, 3].filter((q) => diferenca(skin, r, q, (q + 1) % 4, quadril, g.frameHeight, p) > minimo)
        expect(mexe.length, `${skin} linha ${r}: pernas paradas`).toBeGreaterThanOrEqual(2)
      }
    })
  }
})
