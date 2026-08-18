// Gera assets/status-vfx/sono.png — a tira do "Zzz" que fica sobre o POKE
// dormindo. Nao vem de banco de arte nenhum: o Z e desenhado aqui como pixel
// art, 5x5 por glifo, escalado em inteiro.
//
// POR QUE GERADO E NAO IMPORTADO: varri os 5691 efeitos do banco local e nao
// existe nenhum "zzz" — existe o "???" da confusao (usado em confusao.png),
// nao o do sono. Desenhar 3 letras e mais barato que procurar mais.
//
// Rode `node scripts/gerar-sprite-sono.mjs` pra regerar.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const QUADROS = 16
const LARGURA = 40
const ALTURA = 40
// Cada Z e um glifo 5x5; a lista guarda so os pixels acesos.
const Z = [
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
  [3, 1], [2, 2], [1, 3],
  [0, 4], [1, 4], [2, 4], [3, 4], [4, 4],
]
// Tres Z subindo em fases diferentes: o de baixo e o menor e mais novo.
const TRILHAS = [
  { x: 6, escala: 2, fase: 0.0, subida: 18 },
  { x: 15, escala: 3, fase: 0.33, subida: 22 },
  { x: 25, escala: 4, fase: 0.66, subida: 26 },
]

function pixels() {
  // tira HORIZONTAL: o quadro f ocupa as colunas [f*LARGURA, f*LARGURA+LARGURA)
  const TIRA = QUADROS * LARGURA
  const buf = new Uint8Array(TIRA * ALTURA * 4)
  const set = (f, x, y, a) => {
    if (x < 0 || y < 0 || x >= LARGURA || y >= ALTURA) return
    const i = (y * TIRA + f * LARGURA + x) * 4
    // branco levemente azulado: le como "sono" sobre qualquer fundo, e o
    // contorno preto abaixo garante contraste em fundo claro
    buf[i] = 235; buf[i + 1] = 240; buf[i + 2] = 255; buf[i + 3] = a
  }
  for (let f = 0; f < QUADROS; f++) {
    for (const t of TRILHAS) {
      const p = ((f / QUADROS) + t.fase) % 1        // 0 = nasce embaixo, 1 = some em cima
      const y0 = Math.round(ALTURA - 8 - p * t.subida)
      // aparece e some nas pontas pra o ciclo fechar sem estalo
      const alpha = Math.round(255 * Math.min(1, Math.min(p, 1 - p) * 4))
      if (alpha <= 0) continue
      for (const [gx, gy] of Z) {
        for (let sy = 0; sy < t.escala; sy++) {
          for (let sx = 0; sx < t.escala; sx++) {
            set(f, t.x + gx * t.escala + sx, y0 + gy * t.escala + sy, alpha)
          }
        }
      }
    }
  }
  return buf
}

// PNG minimo (RGBA8, sem filtro) — o repositorio nao tem dependencia de
// imagem e um encoder de 30 linhas evita adicionar uma.
function png(width, height, rgba) {
  const bruto = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    bruto[y * (1 + width * 4)] = 0
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(bruto, y * (1 + width * 4) + 1)
  }
  const crcTabela = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTabela[n] = c >>> 0
  }
  const crc = (b) => {
    let c = 0xffffffff
    for (const x of b) c = crcTabela[(c ^ x) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (tipo, dados) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(dados.length)
    const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(corpo))
    return Buffer.concat([len, corpo, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(bruto, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const saida = 'assets/status-vfx/sono.png'
writeFileSync(saida, png(QUADROS * LARGURA, ALTURA, pixels()))
console.log(`${saida}: ${QUADROS} quadros de ${LARGURA}x${ALTURA}`)
