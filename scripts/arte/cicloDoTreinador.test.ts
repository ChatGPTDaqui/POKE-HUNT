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
