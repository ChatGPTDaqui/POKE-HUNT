// Escreve `scripts/agua-refs/beach.png`: a arte de `beach` com AZUL PURO em cima
// da agua.
//
// POR QUE `beach` PODE SER DERIVADA E AS OUTRAS NAO
//
// O PH-113 mediu e fechou: derivar agua da cor NAO funciona neste acervo, porque
// agua e vegetacao coincidem em matiz, saturacao, luminancia e variancia. Isso
// vale pro acervo. Em `beach` o MAR e a excecao medida no proprio commit — ele
// separa por uma margem grande, e as amostras deste arquivo confirmam:
//
//   mar fundo    h=186 s=0.81      areia      h=42 s=0.98
//   mar raso     h=177 s=0.69      palmeiral  h=40 s=0.77
//   mar direita  h=177 s=0.76      grama      h=97 s=0.38
//                                  pedra      h=30 s=0.58
//                                  ilhota     h=42 s=0.98
//
// Nao ha nada de terra dentro de h 140..205 com s >= 0.45 nesta arte. O que cai
// no teste alem do mar sao as FLORES violeta do palmeiral — respingos de poucos
// pixels, que nao chegam aos 35% de cobertura de uma celula de ~25px e, se
// chegassem, cairiam no filtro de ilha (< 25 celulas).
//
// O QUE O TESTE DE COR NAO PEGA: AS DUAS POCAS
//
// A poca da areia e agua parada e esverdeada (h=73 s=0.64, medido no PH-113) —
// ela cai em cima do palmeiral no espaco de cor, e e exatamente por isso que a
// derivacao global falhou. Entao as duas pocas entram por GEOMETRIA, com centro
// e raio lidos da arte, e nao por cor.
const fs = require('fs')
const path = require('path')
const RAIZ = path.join(__dirname, '..')
const jpeg = require('jpeg-js')
const { encodePng } = require('./lib/png-encode')

const img = jpeg.decode(fs.readFileSync(path.join(RAIZ, 'assets/hunt-backgrounds/beach.jpg')), { useTArray: true })
const W = img.width, H = img.height

/** Pocas da areia, em fracao da arte: centro (u,v) e raios (ru,rv). */
const POCAS = [
  { u: 0.605, v: 0.640, ru: 0.046, rv: 0.026 },
  { u: 0.808, v: 0.478, ru: 0.040, rv: 0.019 },
]

function hsl(r, g, b) {
  const rr = r / 255, gg = g / 255, bb = b / 255
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0))
  else if (max === gg) h = (bb - rr) / d + 2
  else h = (rr - gg) / d + 4
  return { h: h * 60, s, l }
}

const saida = new Uint8Array(W * H * 4)
let pintados = 0
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    const c = hsl(img.data[i], img.data[i + 1], img.data[i + 2])
    const mar = c.h >= 140 && c.h <= 205 && c.s >= 0.45
    const poca = POCAS.some((p) => {
      const du = (x / W - p.u) / p.ru
      const dv = (y / H - p.v) / p.rv
      return du * du + dv * dv <= 1
    })
    if (mar || poca) {
      saida[i] = 0; saida[i + 1] = 0; saida[i + 2] = 255
      pintados++
    } else {
      saida[i] = img.data[i]; saida[i + 1] = img.data[i + 1]; saida[i + 2] = img.data[i + 2]
    }
    saida[i + 3] = 255
  }
}
const destino = path.join(RAIZ, 'scripts/agua-refs/beach.png')
fs.writeFileSync(destino, encodePng(W, H, saida))
console.log(`beach: ${((pintados / (W * H)) * 100).toFixed(1)}% de tinta -> ${path.relative(RAIZ, destino)}`)
