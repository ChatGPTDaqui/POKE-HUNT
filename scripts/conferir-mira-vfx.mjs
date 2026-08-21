// Desenha cada tira de efeito COM A ROTACAO QUE O JOGO APLICA, com o alvo em
// varias direcoes em volta do atacante.
//
// POR QUE MAIS UM CONFERIDOR. Os dois que existem nao respondem a pergunta
// "o golpe mira no alvo?":
//   `conferir-direcao-vfx.mjs`  mede a arte (alongamento, eixo, assimetria) e
//                               diz se ELA tem lado. Nao desenha nada.
//   `conferir-vfx-visual.mjs`   desenha no tamanho de jogo, mas SEM girar e com
//                               o alvo sempre no mesmo lugar — ou seja, mostra
//                               exatamente o que a rotacao nao faz.
//
// Este replica a geometria de `render/sprites.ts#drawQuadroDeTira` +
// `#encostoNoAlvo` + `data/vfxTiras.ts#orientacaoDaTira` e varia o angulo do
// alvo. Cada linha e uma arte, cada coluna um angulo. O disco cinza e o
// atacante, o branco e o alvo: a pergunta que a imagem responde e "a ponta do
// desenho encosta no disco branco, vindo do cinza?".
//
//   node scripts/conferir-mira-vfx.mjs                 tudo (3 camadas)
//   node scripts/conferir-mira-vfx.mjs fire psychic     so essas
//   node scripts/conferir-mira-vfx.mjs --camada golpe   so a camada por golpe
//
// A geometria e LIDA do codigo (constantes e cadastro), nunca copiada: numero
// copiado envelhece calado, e esse erro ja aconteceu neste projeto — a escala
// base mudou de 1.6 pra 1.05 e o conferidor continuou medindo 1.6.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { decodePng } = require('./lib/png.js')
const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const SAIDA = join(RAIZ, 'scripts', 'body-block-refs', '_conferencia', 'vfx-mira')
const LINHA = String.fromCharCode(10)

function constanteDoDesenho(nome, padrao) {
  const src = readFileSync(join(RAIZ, 'src', 'render', 'sprites.ts'), 'utf8')
  const m = new RegExp('const ' + nome + '\\s*=\\s*([\\d.]+)').exec(src)
  return m ? Number(m[1]) : padrao
}
const IMPACT_BASE_SIZE = constanteDoDesenho('IMPACT_BASE_SIZE', 44)
const ESCALA_VFX_SINGLE = constanteDoDesenho('ESCALA_VFX_SINGLE', 1.05)
const ESCALA_VFX_AOE = constanteDoDesenho('ESCALA_VFX_AOE', 1)
const RECUO_DO_IMPACTO = constanteDoDesenho('RECUO_DO_IMPACTO', 8)

const POKE_RAIO = 14.5
const ALCANCE = 39            // raio 14 + raio 15 + padding 10
const ZOOM = 3
// Quatro direcoes bastam pra decidir: direita e o caso em que a arte que "nasce
// apontando pra direita" nao gira nada, esquerda e onde o espelho entra, e as
// duas verticais sao onde arte deitada aparece de pe (e vice-versa).
const ANGULOS = [
  { nome: 'dir', rad: 0 },
  { nome: 'baixo', rad: Math.PI / 2 },
  { nome: 'esq', rad: Math.PI },
  { nome: 'cima', rad: -Math.PI / 2 },
]

// ---------------------------------------------------------------------------
// cadastro
// ---------------------------------------------------------------------------
function semComentario(corpo) {
  return (corpo ?? '').split(LINHA).filter((l) => !l.trim().startsWith('//')).join(LINHA)
}

function campos(corpo) {
  const limpo = semComentario(corpo)
  const base = /anguloBaseGraus:\s*(-?[\d.]+)/.exec(limpo)
  return {
    escala: Number((/escala:\s*([\d.]+)/.exec(limpo) ?? [])[1] ?? 1),
    anguloBase: base ? Number(base[1]) : null,
    recorteX: Number((/recorteX:\s*([\d.]+)/.exec(limpo) ?? [])[1] ?? 1),
    ancoraX: Number((/ancoraX:\s*([\d.]+)/.exec(limpo) ?? [])[1] ?? 0.5),
  }
}

function tirasDeVfxTiras() {
  const src = readFileSync(join(RAIZ, 'src', 'data', 'vfxTiras.ts'), 'utf8')
  const saida = []
  const re = /(\w+):\s*\{\s*url:\s*`\$\{(RAIZ|RAIZ_AOE)\}\/([\w-]+\.png)`,\s*quadros:\s*(\d+)([^}]*)/g
  for (const m of src.matchAll(re)) {
    const camada = m[2] === 'RAIZ' ? 'tipo' : 'area'
    const pasta = camada === 'tipo'
      ? join('assets', 'move-vfx', 'tiras')
      : join('assets', 'move-vfx', 'tiras-aoe')
    saida.push({
      nome: m[1], camada, arquivo: join(pasta, m[3]), quadros: Number(m[4]), ...campos(m[5]),
    })
  }
  return saida
}

function tirasDeGolpe() {
  const src = readFileSync(join(RAIZ, 'src', 'data', 'moveVfx.ts'), 'utf8')
  const saida = []
  // `single: tira('nome', N, { ... })` — o bloco de opcoes e opcional.
  const re = /single:\s*tira\('([\w]+)',\s*(\d+)(?:,\s*\{([\s\S]*?)\}\))?/g
  for (const m of src.matchAll(re)) {
    saida.push({
      nome: m[1], camada: 'golpe',
      arquivo: join('assets', 'move-vfx', 'golpes', `${m[1]}.png`),
      quadros: Number(m[2]), ...campos(m[3]),
    })
  }
  return saida
}

// ---------------------------------------------------------------------------
// a MESMA conta de orientacaoDaTira, replicada de proposito
// ---------------------------------------------------------------------------
// Replicada e nao importada porque este script e Node puro e o modulo e TS do
// cliente. O risco de divergir e real, e e por isso que `vfxTiras.test.ts`
// tranca a versao de producao: se as duas discordarem, quem esta errado e este
// arquivo, e o teste continua sendo a fonte.
function orientacao(tira, angulo) {
  if (tira.anguloBase == null) {
    return { giroParaOAlvo: 0, giroDaBase: 0, espelharY: false, ancoraX: 0.5, recorteX: 1 }
  }
  const recorteX = Math.min(1, Math.max(0.05, tira.recorteX))
  const inicioDaFatia = 1 - recorteX
  const ancoraX = recorteX >= 1
    ? tira.ancoraX
    : Math.min(1, Math.max(0, (tira.ancoraX - inicioDaFatia) / recorteX))
  return {
    giroParaOAlvo: angulo,
    giroDaBase: -(tira.anguloBase * Math.PI) / 180,
    espelharY: Math.abs(angulo) > Math.PI / 2,
    ancoraX,
    recorteX,
  }
}

// ---------------------------------------------------------------------------
// PNG e composicao
// ---------------------------------------------------------------------------
function png(width, height, rgba) {
  const bruto = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    bruto[y * (width * 4 + 1)] = 0
    rgba.copy(bruto, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
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
    const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length)
    const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(corpo))
    return Buffer.concat([tam, corpo, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(bruto, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}

function fundoDeHunt(buf, W, H) {
  for (let i = 0; i < W * H; i++) {
    const y = Math.floor(i / W)
    const t = (y / H) * 18
    buf[i * 4] = 24 + t; buf[i * 4 + 1] = 28 + t; buf[i * 4 + 2] = 22 + t; buf[i * 4 + 3] = 255
  }
}

function disco(dst, W, H, cx, cy, r, cor, alpha = 1) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue
      const X = Math.round(cx + x), Y = Math.round(cy + y)
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue
      const i = (Y * W + X) * 4
      for (let c = 0; c < 3; c++) dst[i + c] = Math.round(dst[i + c] * (1 - alpha) + cor[c] * alpha)
    }
  }
}

/**
 * Desenha o quadro `indice` da tira como o canvas desenharia: rotacao em volta
 * do ponto de impacto, espelho em Y depois do giro, ancora horizontal e recorte
 * da fatia do impacto.
 *
 * Feito por MAPEAMENTO INVERSO (para cada pixel de destino, de onde ele vem) em
 * vez de "desenhar e girar": girar pra frente deixa buraco entre pixels, e o
 * buraco apareceria como listra na arte fina — que e justo a arte cuja mira
 * estamos julgando.
 */
function desenharTira(dst, W, H, img, tira, indice, alvoPx, alvoPy, alturaMundo, ori) {
  const sw = img.width / tira.quadros
  const sh = img.height
  const larguraMundo = alturaMundo * (sw / sh)
  const larguraFonte = sw * ori.recorteX
  const inicioFonte = indice * sw + (sw - larguraFonte)
  const larguraDestino = larguraMundo * ori.recorteX

  // Caixa de busca: o maior raio possivel do desenho girado, em px de imagem.
  const raio = Math.ceil((Math.hypot(larguraDestino, alturaMundo) / 2 + larguraDestino) * ZOOM)
  // Inverso da mesma cadeia que o canvas aplica: desfaz o giro do alvo, depois o
  // espelho, depois o giro da base.
  const cosAlvo = Math.cos(-ori.giroParaOAlvo), senAlvo = Math.sin(-ori.giroParaOAlvo)
  const cosBase = Math.cos(-ori.giroDaBase), senBase = Math.sin(-ori.giroDaBase)

  for (let py = alvoPy - raio; py <= alvoPy + raio; py++) {
    for (let px = alvoPx - raio; px <= alvoPx + raio; px++) {
      if (px < 0 || py < 0 || px >= W || py >= H) continue
      // px de imagem -> mundo, relativo ao ponto de impacto
      const wx = (px - alvoPx) / ZOOM
      const wy = (py - alvoPy) / ZOOM
      // desfaz o giro; o espelho vem DEPOIS do giro no canvas, entao aqui ele
      // vem antes de sair do espaco local
      let rx = wx * cosAlvo - wy * senAlvo
      let ry = wx * senAlvo + wy * cosAlvo
      if (ori.espelharY) ry = -ry
      const lx = rx * cosBase - ry * senBase
      const ly = rx * senBase + ry * cosBase
      const u = (lx + larguraDestino * ori.ancoraX) / larguraDestino
      const v = (ly + alturaMundo / 2) / alturaMundo
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue
      const sx = Math.floor(inicioFonte + u * larguraFonte)
      const sy = Math.floor(v * sh)
      const si = (sy * img.width + sx) * 4
      const a = img.rgba[si + 3] / 255
      if (a <= 0.02) continue
      const di = (py * W + px) * 4
      for (let c = 0; c < 3; c++) {
        dst[di + c] = Math.round(dst[di + c] * (1 - a) + img.rgba[si + c] * a)
      }
    }
  }
}

/** Quadro com mais pixel opaco — o "pico" da animacao, que e o que se julga. */
function quadroDePico(img, quadros) {
  const sw = Math.floor(img.width / quadros)
  let melhor = 0, melhorN = -1
  for (let q = 0; q < quadros; q++) {
    let n = 0
    for (let y = 0; y < img.height; y += 2) {
      for (let x = 0; x < sw; x += 2) {
        if (img.rgba[((y * img.width) + q * sw + x) * 4 + 3] > 20) n++
      }
    }
    if (n > melhorN) { melhorN = n; melhor = q }
  }
  return melhor
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const filtroCamada = args.includes('--camada') ? args[args.indexOf('--camada') + 1] : null
const nomes = args.filter((a) => !a.startsWith('--') && a !== filtroCamada).map((s) => s.toLowerCase())

let tiras = [...tirasDeVfxTiras(), ...tirasDeGolpe()]
if (filtroCamada) tiras = tiras.filter((t) => t.camada === filtroCamada)
if (nomes.length) tiras = tiras.filter((t) => nomes.includes(t.nome.toLowerCase()))
if (tiras.length === 0) {
  console.error('nenhuma tira casou com o filtro')
  process.exit(1)
}

// Celula generosa no eixo X: arte com rastro comprido (o jato de fogo mede 85px
// de mundo) tem que caber inteira, senao o corte esconde justo o defeito.
const CELULA = 120 * ZOOM
const ROTULO = 0
const POR_FOLHA = 6

mkdirSync(SAIDA, { recursive: true })
const folhas = []
for (let i = 0; i < tiras.length; i += POR_FOLHA) folhas.push(tiras.slice(i, i + POR_FOLHA))

for (const [n, folha] of folhas.entries()) {
  const W = CELULA * ANGULOS.length
  const H = CELULA * folha.length + ROTULO
  const buf = Buffer.alloc(W * H * 4)
  fundoDeHunt(buf, W, H)

  for (const [linha, tira] of folha.entries()) {
    let img
    try {
      img = decodePng(readFileSync(join(RAIZ, tira.arquivo)))
    } catch {
      console.error(`  ${tira.nome}: arquivo ausente (${tira.arquivo})`)
      continue
    }
    const indice = quadroDePico(img, tira.quadros)
    const base = tira.camada === 'area' ? ESCALA_VFX_AOE : ESCALA_VFX_SINGLE
    const altura = IMPACT_BASE_SIZE * base * tira.escala

    for (const [col, ang] of ANGULOS.entries()) {
      const cx = col * CELULA + CELULA / 2
      const cy = linha * CELULA + CELULA / 2 + ROTULO
      // atacante no centro da celula, alvo a ALCANCE na direcao do angulo
      const ax = cx, ay = cy
      const tx = cx + Math.cos(ang.rad) * ALCANCE * ZOOM
      const ty = cy + Math.sin(ang.rad) * ALCANCE * ZOOM
      disco(buf, W, H, ax, ay, POKE_RAIO * ZOOM, [90, 96, 104], 0.9)
      disco(buf, W, H, tx, ty, POKE_RAIO * ZOOM, [225, 228, 232], 0.9)

      const ori = orientacao(tira, ang.rad)
      // `encostoNoAlvo`: so a arte que NAO gira recua na direcao do atacante.
      const recuo = tira.anguloBase == null ? RECUO_DO_IMPACTO : 0
      const ex = tx - Math.cos(ang.rad) * recuo * ZOOM
      const ey = ty - Math.sin(ang.rad) * recuo * ZOOM
      desenharTira(buf, W, H, img, tira, indice, Math.round(ex), Math.round(ey), altura, ori)
    }
  }

  // Prefixo diferente quando ha filtro: rodar com filtro sobrescrevia a folha 01
  // do lote completo, e a comparacao "antes x depois" passava a ser entre duas
  // imagens que nao eram as que eu pensava.
  const prefixo = nomes.length || filtroCamada ? 'sel' : 'folha'
  const nomeArquivo = folha.length === 1
    ? `mira-${folha[0].camada}-${folha[0].nome}.png`
    : `mira-${prefixo}-${String(n + 1).padStart(2, '0')}.png`
  writeFileSync(join(SAIDA, nomeArquivo), png(W, H, buf))
  console.log(`${nomeArquivo}  ${folha.map((t) => `${t.nome}${t.anguloBase == null ? '' : `(gira ${t.anguloBase}°)`}`).join(' | ')}`)
}
console.log(`${LINHA}colunas: ${ANGULOS.map((a) => a.nome).join(' | ')}   (cinza = atacante, branco = alvo)`)
console.log(`saida: ${SAIDA}`)
