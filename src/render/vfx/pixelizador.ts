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
 * Tabela de encaixe por paleta, indexada pelo RGB reduzido a 5 bits por canal
 * (32k celulas). Cada celula guarda a cor da paleta mais proxima do CENTRO da
 * celula, como `0x1RRGGBB` (o bit 24 marca "ja calculada"; 0 = ainda nao).
 *
 * Tabela tipada, e nao `Map` (02/10): o `Map.get` por pixel era o grosso do
 * laco. E pelo CENTRO, e nao pela primeira cor que caiu na celula: antes o
 * encaixe dependia da ORDEM em que as cores apareciam (duas cores da mesma
 * celula podiam ter vizinhas diferentes), e o mesmo quadro saia diferente
 * conforme o que tinha sido desenhado antes.
 */
const tabelas = new Map<string, Uint32Array>()

function tabelaDe(paleta: readonly string[]): Uint32Array {
  const chave = paleta.join()
  let t = tabelas.get(chave)
  if (!t) tabelas.set(chave, t = new Uint32Array(1 << 15))
  return t
}

/** Cor da paleta mais proxima da celula `k`, ja empacotada com o bit de "calculada". */
function encaixarCelula(cores: readonly Rgb[], k: number): number {
  const r = ((k >> 10) << 3) | 4, g = (((k >> 5) & 31) << 3) | 4, b = ((k & 31) << 3) | 4
  let melhor = cores[0]
  let menor = Infinity
  // Distancia ponderada por luminancia: o olho separa verde muito melhor que
  // azul, e sem o peso um laranja escuro encaixava no marrom do contorno.
  for (const c of cores) {
    const d = (c[0] - r) ** 2 * 0.3 + (c[1] - g) ** 2 * 0.59 + (c[2] - b) ** 2 * 0.11
    if (d < menor) { menor = d; melhor = c }
  }
  return 0x1000000 | (melhor[0] << 16) | (melhor[1] << 8) | melhor[2]
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
  const tabela = tabelaDe(paleta)
  let cores: Rgb[] | null = null
  for (let y = 0; y < altura; y++) {
    const linha = ((y + y0) & 3) * 4
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 4
      const a = dados[i + 3]
      if (a === 0) continue
      if (a < BAYER_4X4[linha + ((x + x0) & 3)]) { dados[i + 3] = 0; continue }
      const k = ((dados[i] >> 3) << 10) | ((dados[i + 1] >> 3) << 5) | (dados[i + 2] >> 3)
      let c = tabela[k]
      if (c === 0) tabela[k] = c = encaixarCelula(cores ??= paleta.map(hexParaRgb), k)
      dados[i] = (c >> 16) & 255; dados[i + 1] = (c >> 8) & 255; dados[i + 2] = c & 255; dados[i + 3] = 255
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
 * QUADRO GUARDADO por efeito (02/10, queda de desempenho com os golpes novos).
 *
 * A coreografia anda em passos de `CADENCIA` (ver desenharVfx.ts): entre um
 * passo e outro o desenho e o MESMO, e repintar + pixelizar de novo era custo
 * jogado fora — a 60 Hz, metade dos quadros; num monitor de 144 Hz, quase
 * todos. O efeito guarda o bitmap ja pixelizado e so repinta quando a `versao`
 * (passo da coreografia + posicoes) muda.
 *
 * Um canvas por efeito VIVO, devolvido a `sobra` quando o efeito nao e
 * desenhado por `ESQUECER_APOS` quadros — e reaproveitado pelo proximo efeito,
 * entao o total fica no numero de efeitos simultaneos, nao no de golpes.
 */
interface Guardado { canvas: HTMLCanvasElement; versao: string; x: number; y: number; w: number; h: number; visto: number }
const guardados = new Map<string, Guardado>()
const sobra: HTMLCanvasElement[] = []
const ESQUECER_APOS = 3
let quadroAtual = 0

/** Chamado uma vez por quadro (renderer): solta o que nao foi desenhado ha alguns quadros. */
export function novoQuadroDoPixelizador(): void {
  quadroAtual++
  for (const [id, g] of guardados) {
    if (quadroAtual - g.visto > ESQUECER_APOS) { sobra.push(g.canvas); guardados.delete(id) }
  }
}

/** Contadores pra bancada: quantas vezes repintou e quantas reaproveitou. */
export const estatisticasDoPixelizador = { repintados: 0, reaproveitados: 0, guardados: () => guardados.size }

function canvasPraGuardar(w: number, h: number): HTMLCanvasElement {
  let c = sobra.pop()
  if (!c) {
    c = document.createElement('canvas')
    // Na CPU, como o buffer: o bitmap chega por putImageData, e num canvas de
    // GPU cada putImageData era um upload sincrono (8 ms por quadro medidos).
    c.getContext('2d', { willReadFrequently: true })
  }
  if (c.width < w) c.width = w
  if (c.height < h) c.height = h
  return c
}

function carimbar(destino: CanvasRenderingContext2D, fonte: HTMLCanvasElement, x: number, y: number, w: number, h: number): void {
  const suavizar = destino.imageSmoothingEnabled
  destino.imageSmoothingEnabled = false
  destino.drawImage(fonte, 0, 0, w, h, x, y, w, h)
  destino.imageSmoothingEnabled = suavizar
}

/** Identidade do quadro guardado: de quem e, e o que ele mostra. */
export interface Guarda { id: string; versao: string }

/**
 * Desenha `pintar` pixelizado em `destino`. `ret` em unidades de mundo; e
 * arredondado pra grade inteira do mundo antes de tudo, pra o pixel do efeito
 * cair exatamente em cima do pixel do sprite.
 *
 * Com `guarda`, reaproveita o bitmap do quadro anterior do mesmo efeito quando
 * a versao nao mudou — sem chamar `pintar`.
 */
export function desenharPixelizado(
  destino: CanvasRenderingContext2D, ret: Retangulo, paleta: readonly string[],
  pintar: (ctx: CanvasRenderingContext2D) => void, guarda?: Guarda,
): boolean {
  const x = Math.floor(ret.x), y = Math.floor(ret.y)
  const w = Math.ceil(ret.x + ret.w) - x, h = Math.ceil(ret.y + ret.h) - y
  if (w <= 0 || h <= 0) return false
  const anterior = guarda && guardados.get(guarda.id)
  // Mesma versao e (quase) mesmo tamanho: carimba no `x, y` DE AGORA (o efeito
  // pode ter so transladado junto com quem ele segue). A folga de 2 e o
  // arredondamento: com posicao fracionaria, floor/ceil do retangulo variam 1
  // de um quadro pro outro, e exigir igualdade exata repintava a area toda.
  if (anterior && anterior.versao === guarda.versao && Math.abs(anterior.w - w) <= 2 && Math.abs(anterior.h - h) <= 2) {
    anterior.visto = quadroAtual
    estatisticasDoPixelizador.reaproveitados++
    carimbar(destino, anterior.canvas, x, y, anterior.w, anterior.h)
    return true
  }
  const ctx = bufferCom(w, h)
  if (!ctx) return false
  estatisticasDoPixelizador.repintados++
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  // save/restore em volta da coreografia: o buffer e UNICO entre efeitos, e
  // estado que uma coreografia deixasse no contexto (traco: lineCap, lineJoin,
  // miterLimit) vazava pro efeito seguinte — o mesmo golpe saia diferente
  // conforme quem tinha sido desenhado antes dele no quadro (02/10).
  //
  // O clip no retangulo do efeito, pelo mesmo motivo: o buffer so cresce, e
  // forma que passa da borda era rasterizada diferente conforme o tamanho
  // ATUAL dele — o pixel da borda dependia do maior golpe desenhado antes.
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()
  ctx.setTransform(1, 0, 0, 1, -x, -y)
  pintar(ctx)
  ctx.restore()
  const im = ctx.getImageData(0, 0, w, h)
  pixelizarDados(im.data, w, h, paleta, x, y)
  if (!guarda) {
    ctx.putImageData(im, 0, 0)
    carimbar(destino, buffer!, x, y, w, h)
    return true
  }
  // O bitmap vai direto pro canvas do efeito (putImageData substitui o
  // retangulo inteiro, alfa incluso — nao precisa limpar antes).
  const g = anterior || { canvas: canvasPraGuardar(w, h), versao: '', x, y, w, h, visto: 0 }
  if (g.canvas.width < w || g.canvas.height < h) { g.canvas.width = Math.max(w, g.canvas.width); g.canvas.height = Math.max(h, g.canvas.height) }
  g.canvas.getContext('2d')!.putImageData(im, 0, 0)
  Object.assign(g, { versao: guarda.versao, x, y, w, h, visto: quadroAtual })
  guardados.set(guarda.id, g)
  carimbar(destino, g.canvas, x, y, w, h)
  return true
}
