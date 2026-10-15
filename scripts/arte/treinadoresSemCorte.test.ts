// Skin de treinador "partida" (15/10/2026): quadros do Professor Carvalho e da
// Jessie apareciam cortados numa reta vertical. O importador prendia cada
// recorte a coluna fixa da folha original (largura / colunas), e num passo
// largo o boneco atravessa a divisa — Carvalho perdia 87 a 134 px de altura de
// casaco, Jessie 65 a 76.
//
// Detector: a coluna de pixels opacos mais a esquerda/direita de um quadro e,
// num corpo inteiro, uma ponta de braco ou casaco (poucas dezenas de pixels).
// Uma coluna com mais que o limite e um corte reto.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import quadros from '../../src/data/quadrosDoTreinador.json'

const RAIZ = join(__dirname, '..', '..')
// Folga acima do maior valor "natural" medido (35 px: braco estendido).
const LIMITE_DE_CORTE_RETO = 50

function cortesRetos(skin: string, anim: 'Walk' | 'Idle'): string[] {
  const { frameWidth: fw, frameHeight: fh } = quadros[skin as keyof typeof quadros]
  const p = PNG.sync.read(readFileSync(join(RAIZ, `assets/treinadores/campo/${skin}/${anim}-Anim.png`)))
  const colunas = Math.round(p.width / fw)
  const linhas = Math.round(p.height / fh)
  const achados: string[] = []
  for (let r = 0; r < linhas; r++) {
    for (let c = 0; c < colunas; c++) {
      const alturas: number[] = []
      for (let x = 0; x < fw; x++) {
        let n = 0
        for (let y = 0; y < fh; y++) if (p.data[((r * fh + y) * p.width + c * fw + x) * 4 + 3] > 200) n++
        alturas.push(n)
      }
      const ocupadas = alturas.map((n, i) => (n ? i : -1)).filter((i) => i >= 0)
      if (!ocupadas.length) { achados.push(`linha ${r} quadro ${c}: vazio`); continue }
      const esquerda = alturas[ocupadas[0]]
      const direita = alturas[ocupadas[ocupadas.length - 1]]
      if (esquerda >= LIMITE_DE_CORTE_RETO) achados.push(`linha ${r} quadro ${c}: corte reto na esquerda (${esquerda} px)`)
      if (direita >= LIMITE_DE_CORTE_RETO) achados.push(`linha ${r} quadro ${c}: corte reto na direita (${direita} px)`)
    }
  }
  return achados
}

describe('skins de treinador em campo', () => {
  for (const skin of Object.keys(quadros)) {
    for (const anim of ['Walk', 'Idle'] as const) {
      it(`${skin} ${anim}: nenhum quadro cortado em reta vertical`, () => {
        expect(cortesRetos(skin, anim)).toEqual([])
      })
    }
  }

  it('o detector enxerga o defeito de antes (guarda contra teste vazio)', () => {
    // Folha do Carvalho como estava na 8.12, guardada so em memoria: um bloco
    // opaco de 80 px de altura encostado na borda do quadro.
    const fw = 20, fh = 100
    const p = new PNG({ width: fw, height: fh })
    for (let y = 10; y < 90; y++) for (let x = 0; x < 6; x++) p.data[(y * fw + x) * 4 + 3] = 255
    const alturas: number[] = []
    for (let x = 0; x < fw; x++) {
      let n = 0
      for (let y = 0; y < fh; y++) if (p.data[(y * fw + x) * 4 + 3] > 200) n++
      alturas.push(n)
    }
    const primeira = alturas.findIndex((n) => n > 0)
    expect(alturas[primeira]).toBeGreaterThanOrEqual(LIMITE_DE_CORTE_RETO)
  })
})
