// Gera o sprite de campo do TREINADOR no mesmo formato das folhas dos POKE
// (PMD: 8 linhas de direcao x N quadros, quadro de tamanho fixo).
//
// POR QUE GERADO, e nao baixado: o acervo de treinadores que o jogo ja usa
// (retratos do Showdown, assets/treinadores/) e so ROSTO parado. O boneco que
// anda atras do POKE precisa de 8 direcoes e ciclo de caminhada.
//
// v2 (08/10, "faca algo bonito"): a v1 era montada com retangulos por parte do
// corpo e lia como bloco. Agora cada vista e DESENHADA PIXEL A PIXEL nos mapas
// abaixo (proporcao chibi: cabeca grande; luz de cima-esquerda em toda peca;
// franja, olhos 2x2, bochecha; bone com brilho e aba; colete aberto com ziper
// dourado). O codigo so anima (passo, balanco de braco, sobe-desce), espelha as
// direcoes da esquerda e poe o contorno escuro automatico das folhas do PMD.
//
// Saida: assets/treinadores/campo/<id>/{Walk,Idle}-Anim.png
// Linhas na ordem do PMD: 0 baixo, 1 baixo-dir, 2 dir, 3 cima-dir, 4 cima,
// 5 cima-esq, 6 esq, 7 baixo-esq (as "esq" sao espelho das "dir").
//
//   node scripts/gerar-sprite-do-treinador.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const QW = 32, QH = 40 // quadro
const PE = 37 // linha da sola dentro do quadro (o jogo ancora o pe nela)

// Paleta por letra. O primeiro treinador (pedido do dono): colete azul e bone vermelho.
const TREINADORES = {
  'colete-azul': {
    R: '#e03a3e', r: '#a8222f', Q: '#ff8f85', A: '#7e1824', // bone, sombra, brilho, aba
    W: '#f6f4ee', w: '#c9c6d2', // branco (logo, camisa) e sombra
    H: '#5a3825', h: '#3b2318', // cabelo
    S: '#f6cfa6', s: '#dca27c', e: '#2a2140', b: '#f2a39a', m: '#b75a4c', // pele, sombra, olho, bochecha, boca
    B: '#3a7ae0', v: '#2552a8', V: '#7cb0f7', Z: '#f2c14e', // colete, sombra, brilho, ziper
    P: '#3a3f58', p: '#262a3d', // calca
    K: '#e03a3e', k: '#a8222f', L: '#f6f4ee', // tenis e sola
    contorno: '#20182a',
  },
}

// ---- mapas (sem contorno; '.' = vazio). Linha 0 e o topo do bone. ----------
const FRENTE = [
  '.....RRRR.....',
  '...RRQQRRRR...',
  '..RRQWWRRRRr..',
  '..RRRWWRRRRr..',
  '..rRRRRRRRrr..',
  '.AAAAAAAAAAAA.',
  '.HHHhHHHHhHHH.',
  '.HSSSSSSSSSSH.',
  '.HSeeSSSSeeSH.',
  '.hSeeSSSSeeSh.',
  '..bSSSmmSSSb..',
  '...sSSSSSSs...',
  '.....ssss.....',
  '..WVBZWWZBvW..',
  '.SWVBZWWZBvWS.',
  '.SSVBZWwZBvSs.',
  '.SSBBZWwZBvSs.',
  '.ssvBBZZBBvss.',
  '...vvvvvvvv...',
]

// 3/4 de frente (olhando pra baixo-direita): rosto e ziper 1 px pro lado.
const FRENTE_LADO = [
  '.....RRRR.....',
  '...RRQQRRRR...',
  '..RRQRWWRRRr..',
  '..RRRRWWRRRr..',
  '..rRRRRRRRrrA.',
  '.AAAAAAAAAAAAA',
  '.HHHhHHHHhHHH.',
  '.HHSSSSSSSSSS.',
  '.HHSSeeSSSSee.',
  '.hhSSeeSSSSee.',
  '..hSbSSSmmSb..',
  '...sSSSSSSs...',
  '.....ssss.....',
  '..WVVBZWWZBW..',
  '.SWVVBZWWZBWS.',
  '.SSVVBZWwZBSs.',
  '.SSVBBZWwZBSs.',
  '.ssvBBBZZBvss.',
  '...vvvvvvvv...',
]

// Perfil olhando pra DIREITA.
const LADO = [
  '....RRRRR.....',
  '...RQQRRRRR...',
  '..RQQRRRRRRr..',
  '..RRRRRRRRRr..',
  '..rRRRRRRRrAAA',
  '..HHHHHHSSSSA.',
  '.HHHhHHSSSSSS.',
  '.HhHHHSSSSeSS.',
  '.hHHHSSSSSeSS.',
  '..hHSSSSSSbSs.',
  '...hsSSSSSmS..',
  '....ssSSSSs...',
  '......sss.....',
  '.....WBBZW....',
  '....WVBBZWW...',
  '....VVBSSZW...',
  '....vVBSSZW...',
  '....vvBssBW...',
  '.....vvvvvv...',
]

const COSTAS = [
  '.....RRRR.....',
  '...RRRRRRRR...',
  '..RRQRRRRRRr..',
  '..RRRRRRRRRr..',
  '..rRRRWWRRrr..',
  '..rrAWWWWArr..',
  '.HHHHHHHHHHHH.',
  '.HHHhHHHHhHHH.',
  '.HHHHHHHHHHHH.',
  '.hHHHhHHhHHHh.',
  '..hHHHHHHHHh..',
  '...sssssssss..',
  '.....ssss.....',
  '..WBBBBBBBBW..',
  '.SWBBBBVBBBWS.',
  '.SSBBBBVBBBSs.',
  '.SSBBBBBBBBSs.',
  '.ssvBBBBBBvss.',
  '...vvvvvvvv...',
]

const COSTAS_LADO = [
  '.....RRRR.....',
  '...RRRRRRRR...',
  '..RRQRRRRRRr..',
  '..RRRRRRRRRr..',
  '..rRRRRWWRrrA.',
  '..rrrAWWWWArAA',
  '.HHHHHHHHHHHS.',
  '.HHHhHHHHhHHS.',
  '.HHHHHHHHHHHS.',
  '.hHHHhHHhHHHs.',
  '..hHHHHHHHHs..',
  '...ssssssss...',
  '.....ssss.....',
  '..WBBBBBBBBW..',
  '.SWBBBBBVBBWS.',
  '.SSBBBBBVBBSs.',
  '.SSBBBBBBBBSs.',
  '.ssvBBBBBBvss.',
  '...vvvvvvvv...',
]

// Pernas. Frente/costas: duas pernas; o passo ergue uma delas 1 px.
const PERNAS_FRENTE = [
  '...PPPP.PPPp..',
  '...PPPp.PPPp..',
  '...PPpp.PPpp..',
  '...KKKk.KKKk..',
  '..KKKKk.KKKKk.',
  '..LLLLL.LLLLL.',
]
// Perfil: junto (passando) e aberto (passo).
const PERNAS_LADO_JUNTAS = [
  '.....PPPPp....',
  '.....PPPpp....',
  '.....PPPpp....',
  '.....KKKKk....',
  '.....KKKKKk...',
  '.....LLLLLL...',
]
const PERNAS_LADO_ABERTAS = [
  '.....PPPPp....',
  '....PPp.PPp...',
  '...PPp...PPp..',
  '...KKk...KKKk.',
  '..KKKk...KKKKk',
  '..LLLL...LLLLL',
]

const LARGURA_DO_MAPA = 14
const ALTURA = FRENTE.length + PERNAS_FRENTE.length // 25
const X0 = Math.floor((QW - LARGURA_DO_MAPA) / 2) // 9
const Y0 = PE - ALTURA + 1 // topo do bone

function validar(nome, mapa, largura = LARGURA_DO_MAPA) {
  for (const [i, l] of mapa.entries()) {
    if (l.length !== largura) throw new Error(`${nome} linha ${i}: ${l.length} colunas (esperado ${largura})`)
  }
}
for (const [n, m] of Object.entries({ FRENTE, FRENTE_LADO, LADO, COSTAS, COSTAS_LADO })) validar(n, m)
for (const [n, m] of Object.entries({ PERNAS_FRENTE, PERNAS_LADO_JUNTAS, PERNAS_LADO_ABERTAS })) validar(n, m)

function grade(linhas) {
  return linhas.map((l) => l.split(''))
}

/** Desloca as celulas de `colunas` (indices do mapa) nas linhas [ini, fim] em `dy`. */
function deslocarColunas(g, colunas, ini, fim, dy) {
  if (!dy) return
  const copia = g.map((l) => l.slice())
  for (const c of colunas) {
    for (let y = ini; y <= fim; y++) g[y][c] = '.'
    for (let y = ini; y <= fim; y++) {
      const ny = y + dy
      if (ny >= ini - 1 && ny <= fim + 1 && ny >= 0 && ny < g.length) g[ny][c] = copia[y][c]
    }
  }
}

/**
 * Monta um quadro (grade de letras do tamanho do mapa, ALTURA linhas). `passo`
 * 0..3 na caminhada (0 e 2 = passo, 1 e 3 = passando, corpo 1 px acima);
 * `respira` 1 = corpo 1 px abaixo no idle.
 */
function montar(vista, { passo = -1, respira = 0 } = {}) {
  const andando = passo >= 0
  const passando = andando && (passo === 1 || passo === 3)
  const corpo = { frente: FRENTE, 'frente-lado': FRENTE_LADO, lado: LADO, costas: COSTAS, 'costas-lado': COSTAS_LADO }[vista]
  const lado = vista === 'lado'
  let pernas
  if (lado) pernas = andando && !passando ? PERNAS_LADO_ABERTAS : PERNAS_LADO_JUNTAS
  else pernas = PERNAS_FRENTE

  const g = grade([...corpo, ...pernas])
  const topoPernas = corpo.length
  if (!lado && andando && !passando) {
    // Ergue a perna que avanca: esquerda (colunas 2-6) no passo 0, direita (8-12) no 2.
    const cols = passo === 0 ? [2, 3, 4, 5, 6] : [8, 9, 10, 11, 12]
    deslocarColunas(g, cols, topoPernas, ALTURA - 1, -1)
  }
  if (!lado && andando && !passando) {
    // Braco oposto a perna balanca pra frente (1 px pra baixo na vista frontal).
    const braco = passo === 0 ? [11, 12] : [1, 2]
    deslocarColunas(g, braco, 14, 17, 1)
  }
  // Corpo sobe 1 px quando a perna passa (caminhada) ou desce 1 px (respiracao).
  const dyCorpo = passando ? -1 : respira
  return { g, dyCorpo, topoPernas }
}

function quadroVazio() {
  return Array.from({ length: QH }, () => new Array(QW).fill(null))
}

function pintarQuadro(p, vista, opcoes, espelho = false) {
  const { g, dyCorpo, topoPernas } = montar(vista, opcoes)
  const q = quadroVazio()
  for (let y = 0; y < g.length; y++) {
    const dy = y < topoPernas ? dyCorpo : 0
    for (let x = 0; x < g[y].length; x++) {
      const letra = g[y][x]
      if (letra === '.') continue
      const cor = p[letra]
      if (!cor) throw new Error(`letra sem cor: ${letra}`)
      const xx = espelho ? X0 + LARGURA_DO_MAPA - 1 - x : X0 + x
      const yy = Y0 + y + dy
      if (yy >= 0 && yy < QH) q[yy][xx] = cor
    }
  }
  return contornar(q, p.contorno)
}

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

/** As 8 linhas na ordem do PMD. */
function linhas(p, opcoes) {
  return [
    pintarQuadro(p, 'frente', opcoes),
    pintarQuadro(p, 'frente-lado', opcoes),
    pintarQuadro(p, 'lado', opcoes),
    pintarQuadro(p, 'costas-lado', opcoes),
    pintarQuadro(p, 'costas', opcoes),
    pintarQuadro(p, 'costas-lado', opcoes, true),
    pintarQuadro(p, 'lado', opcoes, true),
    pintarQuadro(p, 'frente-lado', opcoes, true),
  ]
}

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255]
}

function folha(p, quadros) {
  const colunas = quadros.map((o) => linhas(p, o))
  const W = QW * colunas.length, H = QH * 8
  const rgba = Buffer.alloc(W * H * 4)
  colunas.forEach((col, c) => col.forEach((q, r) => {
    for (let y = 0; y < QH; y++) for (let x = 0; x < QW; x++) {
      const cor = q[y][x]
      if (!cor) continue
      rgba.set(hex(cor), ((r * QH + y) * W + c * QW + x) * 4)
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
