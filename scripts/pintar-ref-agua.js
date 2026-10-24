// Referencia de AGUA gerada pela cor, POR ARTE (24/10/2026, vida nos mapas).
//
// Mesma ideia de `pintar-ref-beach.js`, generalizada: em algumas artes a agua
// e um azul saturado que nao divide espaco de cor com nada (rio de `forest`,
// lagos de `waterfall`). Ai a referencia pode ser GERADA em vez de pintada. Nas
// artes em que agua e vegetacao se confundem (ver o cabecalho de
// `build-agua-mask.js`) isto NAO serve, e a arte simplesmente nao entra aqui.
//
// Cada arte declara a faixa de cor e, quando precisa, retangulos a ignorar (ceu
// azul no topo, por exemplo) em fracao da arte (u0,v0,u1,v1). Toda referencia
// gerada e conferida no overlay do `build-agua-mask.js --debug` antes do commit.
//
//   node scripts/pintar-ref-agua.js forest      # escreve scripts/agua-refs/forest.png
//   node scripts/pintar-ref-agua.js --todas
const fs = require('fs')
const path = require('path')
const jpeg = require('jpeg-js')
const { encodePng } = require('./lib/png-encode')

const RAIZ = path.join(__dirname, '..')

/** Faixa de cor da agua em cada arte (h em graus, s/l de 0 a 1). */
const ARTES = {
  // Rio azul vivo. O ceu do canto superior direito tem o mesmo matiz: fora.
  forest: { h: [195, 225], s: 0.55, l: [0.35, 0.75], ignorar: [[0.55, 0, 1, 0.045]] },
  // Rio azul claro e lago mais escuro; nada mais da arte cai nesse azul.
  meadow: { h: [185, 222], s: 0.35, l: [0.28, 0.80] },
  // Rio azul forte e os dois laguinhos.
  plains: { h: [200, 228], s: 0.45, l: [0.28, 0.75] },
}

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

function pintar(nome) {
  const cfg = ARTES[nome]
  if (!cfg) throw new Error(`arte sem configuracao: ${nome}`)
  const img = jpeg.decode(fs.readFileSync(path.join(RAIZ, `assets/hunt-backgrounds/${nome}.jpg`)), { useTArray: true })
  const W = img.width, H = img.height
  const saida = new Uint8Array(W * H * 4)
  let pintados = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const c = hsl(img.data[i], img.data[i + 1], img.data[i + 2])
      const u = x / W, v = y / H
      const fora = (cfg.ignorar ?? []).some(([u0, v0, u1, v1]) => u >= u0 && u <= u1 && v >= v0 && v <= v1)
      const agua = !fora && c.h >= cfg.h[0] && c.h <= cfg.h[1] && c.s >= cfg.s && c.l >= cfg.l[0] && c.l <= cfg.l[1]
      if (agua) {
        saida[i] = 0; saida[i + 1] = 0; saida[i + 2] = 255
        pintados++
      } else {
        saida[i] = img.data[i]; saida[i + 1] = img.data[i + 1]; saida[i + 2] = img.data[i + 2]
      }
      saida[i + 3] = 255
    }
  }
  const destino = path.join(RAIZ, `scripts/agua-refs/${nome}.png`)
  fs.writeFileSync(destino, encodePng(W, H, saida))
  console.log(`${nome}: ${((pintados / (W * H)) * 100).toFixed(1)}% de tinta -> ${path.relative(RAIZ, destino)}`)
}

const alvo = process.argv[2]
for (const nome of alvo === '--todas' ? Object.keys(ARTES) : [alvo]) pintar(nome)
