// Folha de contato das seis tiras de status (PH-416): quatro quadros de cada
// uma, escalados 4x, sobre TRES fundos — quase preto, cinza medio e quase
// branco.
//
// POR QUE OS TRES FUNDOS. A tira e desenhada sobre o corpo do POKE ou ao lado da
// cabeca dele, e "o fundo mais desfavoravel" nao e um: um glifo claro com
// contorno escuro desaparece de formas opostas sobre um Gengar e sobre um
// Lapras. Julgar sobre um fundo so aprova arte que so funciona naquele fundo.
//
// Ela NAO substitui `condicao-sobre-o-corpo.mjs`, que compoe sobre o corpo REAL
// com a tinta de status ja aplicada e no tamanho de jogo — essa e a bancada que
// decide se a condicao esta legivel. Esta aqui responde uma pergunta mais
// barata e anterior: o glifo esta desenhado certo, o ciclo fecha, o contorno
// existe nos quatro lados.
//
//   node scripts/harness/folha-de-status.mjs saida.png
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync, deflateSync } from 'node:zlib'

/**
 * Le o PNG que `scripts/gerar-status-vfx.mjs` escreve — RGBA8, sem filtro,
 * sem entrelacamento. Nao e um leitor de PNG geral de proposito: aceitar
 * qualquer PNG exigiria os cinco filtros e paleta, e o unico produtor deste
 * arquivo e um script deste repositorio.
 */
function lerPng(caminho) {
  const b = readFileSync(caminho)
  let p = 8; let w = 0; let h = 0
  const idat = []
  while (p < b.length) {
    const len = b.readUInt32BE(p)
    const tipo = b.toString('ascii', p + 4, p + 8)
    if (tipo === 'IHDR') { w = b.readUInt32BE(p + 8); h = b.readUInt32BE(p + 12) }
    if (tipo === 'IDAT') idat.push(b.subarray(p + 8, p + 8 + len))
    p += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * 4
  const px = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const filtro = raw[y * (stride + 1)]
    if (filtro !== 0) throw new Error(`${caminho}: filtro PNG ${filtro} nao suportado`)
    raw.copy(px, y * stride, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
  }
  return { w, h, px }
}

function png(width, height, rgba) {
  const bruto = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    bruto[y * (1 + width * 4)] = 0
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(bruto, y * (1 + width * 4) + 1)
  }
  const tabela = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabela[n] = c >>> 0
  }
  const crc = (b) => {
    let c = 0xffffffff
    for (const x of b) c = tabela[(c ^ x) & 0xff] ^ (c >>> 8)
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

const NOMES = ['veneno', 'queimadura', 'paralisia', 'congelamento', 'sono', 'confusao']
// Quatro quadros espacados em 1/4 de volta: o suficiente pra ver o anel girar e
// o glifo balancar, e pra o quadro 12 denunciar um ciclo que nao fecha.
const QUADROS_MOSTRA = [0, 4, 8, 12]
const ESCALA = 4
const FUNDOS = [[24, 24, 28], [128, 128, 128], [235, 235, 235]]
const CELULA = 48 * ESCALA

const saida = process.argv[2] ?? 'folha-de-status.png'
const largura = QUADROS_MOSTRA.length * FUNDOS.length * CELULA
const altura = NOMES.length * CELULA
const folha = new Uint8Array(largura * altura * 4)

NOMES.forEach((nome, fila) => {
  const { w, h, px } = lerPng(`assets/status-vfx/${nome}.png`)
  const lado = h
  let coluna = 0
  for (const fundo of FUNDOS) {
    for (const q of QUADROS_MOSTRA) {
      const ox = coluna * CELULA
      const oy = fila * CELULA
      for (let y = 0; y < CELULA; y++) {
        for (let x = 0; x < CELULA; x++) {
          // A celula tem sempre 48*ESCALA; a tira do badge tem lado 40. Escalar
          // pelo lado REAL, e nao pela celula, mantem as duas geometrias na
          // MESMA regua — que e o ponto de olhar as seis juntas.
          const sx = Math.floor((x / ESCALA) * (lado / 48))
          const sy = Math.floor((y / ESCALA) * (lado / 48))
          const dentro = sx < lado && sy < lado
          const i = (sy * w + q * lado + sx) * 4
          const a = dentro ? px[i + 3] / 255 : 0
          const o = ((oy + y) * largura + ox + x) * 4
          folha[o] = Math.round((dentro ? px[i] : 0) * a + fundo[0] * (1 - a))
          folha[o + 1] = Math.round((dentro ? px[i + 1] : 0) * a + fundo[1] * (1 - a))
          folha[o + 2] = Math.round((dentro ? px[i + 2] : 0) * a + fundo[2] * (1 - a))
          folha[o + 3] = 255
        }
      }
      coluna++
    }
  }
  console.log(`${nome.padEnd(13)} ${w / lado} quadros de ${lado}x${lado}`)
})

writeFileSync(saida, png(largura, altura, folha))
console.log(`\n${saida}: ${largura}x${altura} — linhas na ordem ${NOMES.join(', ')}`)
