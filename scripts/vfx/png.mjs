// Encoder PNG minimo (RGBA8, sem filtro), compartilhado pelos geradores de VFX.
//
// POR QUE ELE MORA AQUI E NAO DENTRO DE UM GERADOR
// -----------------------------------------------------------------------------
// Ele nasceu em `gerar-sprite-sono.mjs`, migrou pra `gerar-status-vfx.mjs` na
// PH-416 quando aquele script morreu, e ia ser copiado uma TERCEIRA vez pelo
// gerador de estagio. Encoder duplicado nao e um problema estetico: o primeiro
// que ganhar uma correcao (um chunk de metadado, um nivel de deflate diferente,
// um ajuste de linha de filtro) deixa o outro para tras em silencio, e a arte
// dos dois conjuntos passa a sair com bytes diferentes sem ninguem notar.
//
// O repositorio nao tem dependencia de imagem e nao vai ganhar uma por isto —
// 30 linhas resolvem, e e a mesma troca que a PH-163 fez com os scripts de
// colisao: script versionado no lugar de ferramenta externa.
import { deflateSync } from 'node:zlib'

/** Uma tira/imagem RGBA em PNG. `rgba` e Uint8Array de `width * height * 4`. */
export function png(width, height, rgba) {
  const bruto = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    // Byte 0 de cada linha e o tipo de filtro; 0 = nenhum.
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
  ihdr[8] = 8   // 8 bits por canal
  ihdr[9] = 6   // truecolor com alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(bruto, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
