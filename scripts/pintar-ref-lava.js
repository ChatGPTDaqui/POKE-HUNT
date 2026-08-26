// Escreve `scripts/lava-refs/<arte>.png`: a arte com AZUL PURO em cima da
// LAVA, mesma convencao dos `agua-refs` (PH-113) e do `pintar-ref-beach.js`.
//
// POR QUE SO `volcano`, E NAO TAMBEM `cave-volcanic`
//
// O PH-113 mediu e fechou: agua e vegetacao coincidem em matiz, saturacao,
// luminancia e textura neste acervo — por isso a mascara de agua e pintada a
// mao na maioria das artes. `volcano` e um caso como `beach`: o nucleo da
// lava cai num cluster BEM separado do resto (medido por componente conexo,
// blocos de 8px, limiar h<=20 s>=0.6 l 0.3-0.6):
//
//   4 maiores componentes (a lava de verdade): 2927, 1213, 890, 520 blocos
//   os 125 componentes seguintes, somados:      394 blocos (ruido: cristal,
//                                                 tocha — cai no filtro de
//                                                 `build-lava-mask.js`)
//
// `cave-volcanic` NAO separa: os cristais ali sao grandes, numerosos, e o
// NUCLEO deles cai no MESMO ponto de cor da lava (medido: h 0-20, s ate 0.9,
// l ate 0.5 — praticamente identico). O maior componente conexo da mascara
// crua nao e a lava, e um aglomerado de cristal (1217 blocos, bbox no meio do
// mapa, longe do rio). Forcar um limiar mais apertado so troca qual cristal
// vaza, nunca isola so o rio — a mesma classe de falha que a agua tem no
// acervo inteiro. Por isso esta arte fica SEM referencia aqui: `brasa` nela
// continua sem mascara (comportamento de antes desta leva), ate alguem pintar
// a mao, se um dia isso valer a pena.
const fs = require('fs')
const path = require('path')
const RAIZ = path.join(__dirname, '..')
const jpeg = require('jpeg-js')
const { encodePng } = require('./lib/png-encode')

/** Limiar calibrado por histograma e conferido por componente conexo. */
const LAVA_HUE_MAX = 20
const LAVA_SAT_MIN = 0.6
const LAVA_LUM_MIN = 0.3
const LAVA_LUM_MAX = 0.6

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

function ehLava(r, g, b) {
  const c = hsl(r, g, b)
  return c.h <= LAVA_HUE_MAX && c.s >= LAVA_SAT_MIN && c.l >= LAVA_LUM_MIN && c.l <= LAVA_LUM_MAX
}

// So `volcano` — ver o cabecalho pra por que `cave-volcanic` fica de fora.
const ARTES = ['volcano']
fs.mkdirSync(path.join(RAIZ, 'scripts/lava-refs'), { recursive: true })

for (const nome of ARTES) {
  const origem = path.join(RAIZ, `assets/hunt-backgrounds/${nome}.jpg`)
  const img = jpeg.decode(fs.readFileSync(origem), { useTArray: true })
  const W = img.width, H = img.height
  const saida = new Uint8Array(W * H * 4)
  let pintados = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      if (ehLava(img.data[i], img.data[i + 1], img.data[i + 2])) {
        saida[i] = 0; saida[i + 1] = 0; saida[i + 2] = 255
        pintados++
      } else {
        saida[i] = img.data[i]; saida[i + 1] = img.data[i + 1]; saida[i + 2] = img.data[i + 2]
      }
      saida[i + 3] = 255
    }
  }
  const destino = path.join(RAIZ, `scripts/lava-refs/${nome}.png`)
  fs.writeFileSync(destino, encodePng(W, H, saida))
  console.log(`${nome}: ${((pintados / (W * H)) * 100).toFixed(1)}% de tinta -> ${path.relative(RAIZ, destino)}`)
}
