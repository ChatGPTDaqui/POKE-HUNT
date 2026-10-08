// Gera o sprite de campo do TREINADOR no mesmo formato das folhas dos POKE
// (PMD: 8 linhas de direcao x N quadros, quadro de tamanho fixo).
//
// POR QUE GERADO, e nao baixado: o acervo de treinadores que o jogo ja usa
// (retratos do Showdown, assets/treinadores/) e so ROSTO parado. O boneco que
// anda atras do POKE precisa de 8 direcoes e ciclo de caminhada, e o pedido do
// dono foi "gere o treinador da mesma forma que as sprites dos pokemons". Aqui
// ele e desenhado por primitivas (retangulos por parte do corpo) e ganha o
// contorno escuro automatico que as folhas do PMD tem.
//
// Saida: assets/treinadores/campo/<id>/{Walk,Idle}-Anim.png
// Linhas na ordem do PMD: 0 baixo, 1 baixo-dir, 2 dir, 3 cima-dir, 4 cima,
// 5 cima-esq, 6 esq, 7 baixo-esq (as "esq" sao espelho das "dir").
//
//   node scripts/gerar-sprite-do-treinador.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const QW = 32, QH = 40 // quadro
const PE = 37 // linha do pe dentro do quadro
const CX = 16 // centro horizontal

// O primeiro treinador (pedido do dono, 08/10): colete azul e bone vermelho.
const TREINADORES = {
  'colete-azul': {
    bone: '#d8323c', boneEscuro: '#9e1f2a', boneClaro: '#f26b6b', logo: '#f4f4f4',
    cabelo: '#4a2f1f', pele: '#f1c39b', peleEscura: '#d49a72', olho: '#1b1b2a',
    colete: '#2f6fd0', coleteEscuro: '#1f4c99', coleteClaro: '#5b93ea',
    camisa: '#f4f4f4', camisaEscura: '#c9ccd6',
    calca: '#3b3f55', calcaEscura: '#2a2d3e', tenis: '#d8323c', sola: '#f4f4f4',
    contorno: '#1b1b2a',
  },
}

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255]
}

function quadroVazio() {
  return Array.from({ length: QH }, () => new Array(QW).fill(null))
}

function ret(q, x, y, w, h, cor) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    if (yy >= 0 && yy < QH && xx >= 0 && xx < QW) q[yy][xx] = cor
  }
}

function px(q, x, y, cor) { ret(q, x, y, 1, 1, cor) }

/** Contorno de 1 px em volta de tudo que e opaco — o acabamento das folhas do PMD. */
function contornar(q, cor) {
  const novo = q.map((l) => l.slice())
  for (let y = 0; y < QH; y++) for (let x = 0; x < QW; x++) {
    if (q[y][x]) continue
    const viz = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => q[y + dy]?.[x + dx])
    if (viz) novo[y][x] = cor
  }
  return novo
}

function espelhar(q) {
  return q.map((l) => l.slice().reverse())
}

/**
 * Pose de um quadro. `passo` 0..3 na caminhada (0 e 2 = pernas abertas, 1 e 3
 * = passando, corpo 1 px acima); `parado` = respiracao (0 normal, 1 corpo 1 px
 * abaixo). `vista`: 'frente' | 'frente-lado' | 'lado' | 'costas-lado' | 'costas'.
 */
function desenhar(p, vista, { passo = -1, respira = 0 } = {}) {
  const q = quadroVazio()
  const andando = passo >= 0
  const sobe = andando && (passo === 1 || passo === 3) ? -1 : 0
  const dy = sobe + respira
  // Perna que avanca: 0 = esquerda (do boneco), 1 = direita; -1 = nenhuma.
  const avanca = !andando ? -1 : passo === 0 ? 0 : passo === 2 ? 1 : -1
  const lado = vista === 'lado'
  const costas = vista === 'costas' || vista === 'costas-lado'
  const desloc = vista === 'frente-lado' || vista === 'costas-lado' ? 1 : 0

  // ---- pernas e tenis (nao sobem com a respiracao: o pe fica no chao)
  if (lado) {
    // De perfil as pernas abrem na direcao do passo; a de tras e mais escura.
    const abre = avanca >= 0 ? 2 : 0
    const tras = { x: CX - 2 - abre, cor: p.calcaEscura }
    const frente = { x: CX - 1 + abre, cor: p.calca }
    for (const perna of [tras, frente]) {
      ret(q, perna.x, PE - 7 + sobe, 3, 6 - sobe, perna.cor)
      ret(q, perna.x, PE - 1, 4, 1, p.tenis)
      px(q, perna.x + 3, PE - 1, p.tenis)
      ret(q, perna.x, PE, 4, 1, p.sola)
    }
  } else {
    for (const [i, x] of [[0, CX - 4], [1, CX + 1]]) {
      const ergue = avanca === i ? 1 : 0
      ret(q, x, PE - 7 + sobe, 3, 6 - ergue - sobe, i === 1 ? p.calcaEscura : p.calca)
      ret(q, x, PE - 1 - ergue, 3, 1, p.tenis)
      ret(q, x, PE - ergue, 3, 1, p.sola)
    }
  }

  // ---- tronco: colete por cima da camisa
  const tw = lado ? 7 : 10
  const tx = CX - Math.floor(tw / 2) + (lado ? 0 : desloc)
  const ty = PE - 15 + dy
  ret(q, tx, ty, tw, 8, p.colete)
  ret(q, tx + tw - 1, ty, 1, 8, p.coleteEscuro)
  ret(q, tx, ty, 1, 8, p.coleteClaro)
  ret(q, tx, ty + 7, tw, 1, p.coleteEscuro)
  if (!costas && !lado) {
    // Colete ABERTO na frente: faixa da camisa no meio.
    const mx = CX - 1 + desloc
    ret(q, mx, ty, 2, 7, p.camisa)
    px(q, mx + 1, ty + 3, p.camisaEscura)
  } else if (lado) {
    ret(q, tx + tw - 2, ty, 1, 7, p.camisa) // abertura do colete na frente do perfil
  }
  // Ombros da camisa (manga curta branca saindo do colete).
  if (!lado) {
    ret(q, tx - 1, ty, 1, 2, p.camisa)
    ret(q, tx + tw, ty, 1, 2, p.camisa)
  }

  // ---- bracos: balancam ao contrario das pernas
  const balanco = avanca === 0 ? 1 : avanca === 1 ? -1 : 0
  if (lado) {
    ret(q, CX - 1 + balanco, ty + 1, 2, 6, p.pele)
    px(q, CX + balanco, ty + 6, p.peleEscura)
  } else {
    ret(q, tx - 2, ty + 1 + Math.max(0, balanco), 2, 6, p.pele)
    ret(q, tx + tw, ty + 1 + Math.max(0, -balanco), 2, 6, p.peleEscura)
  }

  // ---- cabeca
  const hw = lado ? 8 : 10
  const hx = CX - Math.floor(hw / 2) + (lado ? 0 : desloc)
  const hy = PE - 23 + dy
  ret(q, hx, hy, hw, 7, p.pele)
  ret(q, hx, hy + 6, hw, 1, p.peleEscura)
  if (costas) {
    ret(q, hx, hy, hw, 6, p.cabelo)
  } else if (lado) {
    ret(q, hx, hy, 3, 6, p.cabelo) // nuca
    px(q, hx + hw - 2, hy + 3, p.olho)
    px(q, hx + hw, hy + 4, p.pele) // nariz
  } else {
    ret(q, hx, hy, 1, 5, p.cabelo)
    ret(q, hx + hw - 1, hy, 1, 5, p.cabelo)
    const ex = vista === 'frente-lado' ? 1 : 0
    px(q, hx + 2 + ex, hy + 3, p.olho)
    px(q, hx + hw - 3 + ex, hy + 3, p.olho)
  }

  // ---- bone
  const bx = hx - (lado ? 0 : 0)
  const by = hy - 4
  ret(q, bx, by, hw, 4, p.bone)
  ret(q, bx + 1, by, hw - 3, 1, p.boneClaro)
  ret(q, bx + hw - 1, by + 1, 1, 3, p.boneEscuro)
  if (lado) {
    ret(q, bx + hw - 1, by + 3, 4, 1, p.boneEscuro) // aba pra frente
    px(q, bx + 2, by + 3, p.boneEscuro)
  } else if (costas) {
    ret(q, bx + 2, by + 3, hw - 4, 1, p.boneEscuro) // regulagem de tras
    px(q, CX + desloc, by + 3, p.logo)
  } else {
    ret(q, bx - 1, by + 3, hw + 2, 1, p.boneEscuro) // aba de frente
    ret(q, CX - 1 + desloc, by + 1, 2, 2, p.logo)
  }
  return contornar(q, p.contorno)
}

/** As 8 linhas na ordem do PMD. */
function linhas(p, opcoes) {
  const baixo = desenhar(p, 'frente', opcoes)
  const baixoDir = desenhar(p, 'frente-lado', opcoes)
  const dir = desenhar(p, 'lado', opcoes)
  const cimaDir = desenhar(p, 'costas-lado', opcoes)
  const cima = desenhar(p, 'costas', opcoes)
  return [baixo, baixoDir, dir, cimaDir, cima, espelhar(cimaDir), espelhar(dir), espelhar(baixoDir)]
}

function folha(p, quadros) {
  // quadros: array (colunas) de opcoes; cada coluna gera as 8 linhas.
  const colunas = quadros.map((o) => linhas(p, o))
  const W = QW * colunas.length, H = QH * 8
  const rgba = Buffer.alloc(W * H * 4)
  colunas.forEach((col, c) => col.forEach((q, r) => {
    for (let y = 0; y < QH; y++) for (let x = 0; x < QW; x++) {
      const cor = q[y][x]
      if (!cor) continue
      const i = ((r * QH + y) * W + c * QW + x) * 4
      rgba.set(hex(cor), i)
    }
  }))
  return png(W, H, rgba)
}

// --- PNG minimo (RGBA 8 bits, sem filtro) ----------------------------------
const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function bloco(tipo, dados) {
  const t = Buffer.from(tipo, 'ascii')
  const len = Buffer.alloc(4); len.writeUInt32BE(dados.length)
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, dados])))
  return Buffer.concat([len, t, dados, crc])
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const cru = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) rgba.copy(cru, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr), bloco('IDAT', deflateSync(cru)), bloco('IEND', Buffer.alloc(0)),
  ])
}

for (const [id, paleta] of Object.entries(TREINADORES)) {
  const dir = `assets/treinadores/campo/${id}`
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/Walk-Anim.png`, folha(paleta, [0, 1, 2, 3].map((passo) => ({ passo }))))
  writeFileSync(`${dir}/Idle-Anim.png`, folha(paleta, [{ respira: 0 }, { respira: 1 }]))
  console.log(`${dir}: Walk 4x8, Idle 2x8 (quadro ${QW}x${QH})`)
}
