// Transforma o desenho vetorial de uma coreografia em pixel art (decisao D1).
//
// COMO: a coreografia desenha num buffer onde 1 px = 1 unidade de mundo — a
// mesma grade do sprite PMD. Depois cada pixel passa por duas regras:
//
//   alfa   limiar pela matriz Bayer 4x4. Canvas 2D sempre suaviza borda, e um
//          pixel meio transparente ampliado vira borrao. Com o limiar ele vira
//          "aceso ou apagado", e o que era fade sai como dissolve pontilhado,
//          que e exatamente o fade de pixel art.
//   cor    encaixe na cor mais proxima da PALETA DO EFEITO (pele + neutros). A
//          suavizacao cria cores intermediarias entre camadas; sem o encaixe a
//          borda entre laranja e vermelho ganharia um marrom que nao existe na
//          pele.
//
// Paleta POR EFEITO, nao global: com uma lista unica, o azul de um golpe de
// agua podia encaixar no ciano do gelo. Ver o risco 4 do spec.
//
// So o retangulo do efeito passa por aqui, nunca a camera inteira — o custo do
// `getImageData` e proporcional a area, e o efeito ocupa uma fracao da tela.

const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => ((v + 0.5) / 16) * 255)

type Rgb = readonly [number, number, number]

export function hexParaRgb(hex: string): Rgb {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

/**
 * Cache de encaixe por paleta. A chave da cor e RGB reduzido a 5 bits por
 * canal (32k entradas no pior caso): diferenca menor que isso nunca muda a cor
 * mais proxima numa paleta de ~7 cores bem separadas.
 */
const caches = new Map<string, Map<number, Rgb>>()

function encaixador(paleta: readonly string[]): (r: number, g: number, b: number) => Rgb {
  const chave = paleta.join()
  let cache = caches.get(chave)
  if (!cache) caches.set(chave, cache = new Map())
  const cores = paleta.map(hexParaRgb)
  const memo = cache
  return (r, g, b) => {
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const achada = memo.get(k)
    if (achada) return achada
    let melhor = cores[0]
    let menor = Infinity
    // Distancia ponderada por luminancia: o olho separa verde muito melhor que
    // azul, e sem o peso um laranja escuro encaixava no marrom do contorno.
    for (const c of cores) {
      const d = (c[0] - r) ** 2 * 0.3 + (c[1] - g) ** 2 * 0.59 + (c[2] - b) ** 2 * 0.11
      if (d < menor) { menor = d; melhor = c }
    }
    memo.set(k, melhor)
    return melhor
  }
}

/**
 * Aplica limiar de alfa e encaixe de paleta NO LUGAR. Pura sobre o array —
 * testavel sem canvas. `x0`/`y0` sao a origem do buffer no mundo: a matriz
 * Bayer e ancorada no MUNDO, nao no buffer, senao o padrao do dither "andaria"
 * junto com o retangulo do efeito a cada quadro.
 */
export function pixelizarDados(
  dados: Uint8ClampedArray, largura: number, altura: number, paleta: readonly string[], x0 = 0, y0 = 0,
): void {
  const encaixar = encaixador(paleta)
  for (let y = 0; y < altura; y++) {
    const linha = ((y + y0) & 3) * 4
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 4
      const a = dados[i + 3]
      if (a === 0) continue
      if (a < BAYER_4X4[linha + ((x + x0) & 3)]) { dados[i + 3] = 0; continue }
      const c = encaixar(dados[i], dados[i + 1], dados[i + 2])
      dados[i] = c[0]; dados[i + 1] = c[1]; dados[i + 2] = c[2]; dados[i + 3] = 255
    }
  }
}

export interface Retangulo { x: number; y: number; w: number; h: number }

let buffer: HTMLCanvasElement | null = null

/**
 * Buffer UNICO reaproveitado entre efeitos: os efeitos sao desenhados um por
 * vez no mesmo quadro, e alocar canvas por efeito geraria lixo a cada golpe.
 * Nunca encolhe — so cresce ate o maior efeito ja visto.
 */
function bufferCom(w: number, h: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  if (!buffer) buffer = document.createElement('canvas')
  if (buffer.width < w) buffer.width = w
  if (buffer.height < h) buffer.height = h
  return buffer.getContext('2d', { willReadFrequently: true })
}

/**
 * Desenha `pintar` pixelizado em `destino`. `ret` em unidades de mundo; e
 * arredondado pra grade inteira do mundo antes de tudo, pra o pixel do efeito
 * cair exatamente em cima do pixel do sprite.
 */
export function desenharPixelizado(
  destino: CanvasRenderingContext2D, ret: Retangulo, paleta: readonly string[],
  pintar: (ctx: CanvasRenderingContext2D) => void,
): boolean {
  const x = Math.floor(ret.x), y = Math.floor(ret.y)
  const w = Math.ceil(ret.x + ret.w) - x, h = Math.ceil(ret.y + ret.h) - y
  if (w <= 0 || h <= 0) return false
  const ctx = bufferCom(w, h)
  if (!ctx) return false
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.setTransform(1, 0, 0, 1, -x, -y)
  pintar(ctx)
  const im = ctx.getImageData(0, 0, w, h)
  pixelizarDados(im.data, w, h, paleta, x, y)
  ctx.putImageData(im, 0, 0)
  const suavizar = destino.imageSmoothingEnabled
  destino.imageSmoothingEnabled = false
  destino.drawImage(buffer!, 0, 0, w, h, x, y, w, h)
  destino.imageSmoothingEnabled = suavizar
  return true
}
