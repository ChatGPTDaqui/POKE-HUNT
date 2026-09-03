// Bancada da PH-480: o selo de atributo, ACIMA DO CORPO REAL, no tamanho de
// jogo — e em duas escalas lado a lado, pra escolher qual delas e "bem pequeno".
//
// POR QUE ELA EXISTE, E O QUE A FOLHA DE CONTATO NAO RESPONDE
// -----------------------------------------------------------------------------
// `folha-de-estagio.mjs` julga a peca SOZINHA: os glifos se separam, a seta le,
// o contorno sobrevive. Tudo verdade, e nada disso responde a pergunta da issue,
// que e de PROPORCAO: o dono nao disse "o desenho esta ruim", disse que os
// efeitos de status "estao sendo aplicados como se fossem sprites de ataque".
//
// O numero que explica a queixa: a sprite de batalha aparece com ~34px de altura
// de MUNDO (`ALTURA_CORPO` em `condicao-sobre-o-corpo.mjs`, medido), e a peca
// anterior tinha 48x48 — ela era MAIOR que o POKE inteiro, e desenhada no meio
// dele. Nenhuma folha de contato mostra isso, porque nela a peca esta sozinha e
// parece do tamanho certo.
//
// O QUE ELA IMITA DO JOGO
// -----------------------------------------------------------------------------
// IMITA   a altura do corpo em unidade de mundo, o selo desenhado 1:1 (nunca
//         reescalado — ver `SELO_LARGURA` em data/estagioVfx.ts), a folga acima
//         do corpo (`SELO_VAO_LATERAL`) e a tinta por DIRECAO com o mesmo `multiply`
//         de `sprites.ts`.
// NAO IMITA  o fundo da hunt, o deslocamento ao longo da vida do efeito e a
//         coluna de numeros de dano. O fundo entra como duas faixas
//         (escura/clara) pra a borda ser julgada nos dois casos.
//
// COMO RODAR
//   node scripts/gerar-estagio-vfx.mjs
//   node scripts/harness/selo-sobre-o-poke.mjs pikachu
//   ESCALAS=1,2,3 ZOOM=6 node scripts/harness/selo-sobre-o-poke.mjs charizard
//   (escreve scripts/harness/saida-estagio/selo-sobre-o-poke.png, gitignored)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { png } from '../vfx/png.mjs'
import { selo, dimensoesDoSelo, pecas } from '../gerar-estagio-vfx.mjs'

const require = createRequire(import.meta.url)
const RAIZ = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const { decodePng } = require(join(RAIZ, 'scripts', 'lib', 'png.js'))

// KNOBS. Existem pelo motivo do `condicao-sobre-o-corpo.mjs`: sem eles cada
// pergunta nova custa editar o script, e a folha inteira num tamanho so obriga o
// visualizador a reduzir justo o que ela existe pra mostrar.
const ESCALAS = (process.env.ESCALAS ?? '1,2').split(',').map(Number)
const ZOOM = Number(process.env.ZOOM ?? 5)
/** Medido, nao chutado — ver `ALTURA_CORPO` em `condicao-sobre-o-corpo.mjs`. */
const ALTURA_CORPO = Number(process.env.ALTURA_CORPO ?? 34)
/**
 * Copia de `render/sprites.ts#SELO_VAO_LATERAL`: o vao entre o corpo e o selo.
 *
 * O selo mora no FLANCO desde a PH-485 — acima da cabeca ele caia em cima da
 * placa de nome. Esta bancada julga PROPORCAO (o selo e pequeno perto do POKE?),
 * e a proporcao nao muda com o lado; quem trava a posicao e
 * `seloDeEstagioForaDaPlaca.test.ts`, por coordenada.
 */
const VAO = Number(process.env.VAO ?? 2)

/** As duas cores de `sprites.ts` — a tinta e por DIRECAO desde a PH-480. */
const COR = { aumenta: [0x4a, 0xde, 0x80], diminui: [0xfb, 0x71, 0x85] }

const especie = process.argv[2] || 'pikachu'
const idle = decodePng(readFileSync(join(RAIZ, 'assets', 'battle-sprites', especie, 'Idle-Anim.png')))

/**
 * O tamanho do QUADRO, lido de `src/data/battleSpriteAnims.ts`.
 *
 * NAO da pra deduzir da folha: ela e uma grade de 8 fileiras (uma por direcao)
 * por N quadros, e N varia por especie — Pikachu tem 6, entao 240x448 sao
 * quadros de 40x56, e nao de 56x56. Deduzir a largura pela altura (que e o que a
 * primeira versao desta bancada fazia) recorta o quadro vizinho junto e a folha
 * sai com dois POKE colados, o que e obvio na imagem e nao no codigo.
 *
 * Lido por regex do fonte porque este arquivo e `.mjs` puro e o cadastro e `.ts`
 * — o mesmo motivo de `folha-de-estagio.mjs` importar o gerador em vez do modulo
 * do jogo.
 */
function quadroDaEspecie(id) {
  const fonte = readFileSync(join(RAIZ, 'src', 'data', 'battleSpriteAnims.ts'), 'utf8')
  const bloco = fonte.slice(fonte.indexOf(`"${id}": {`))
  const l = /"frameWidth": (\d+)/.exec(bloco)
  const a = /"frameHeight": (\d+)/.exec(bloco)
  if (!l || !a) throw new Error(`sem frameWidth/frameHeight pra ${id}`)
  return { largura: Number(l[1]), altura: Number(a[1]) }
}

const QUADRO = quadroDaEspecie(especie)

// As 15 linhas a ZOOM 6 dao 6660px de altura, e nesse tamanho todo visualizador
// reduz a imagem — a pergunta "o selo e pequeno perto do POKE?" deixa de ser
// respondivel justo na bancada que existe pra responder ela. Mesmo motivo dos
// knobs de `condicao-sobre-o-corpo.mjs`.
//
//   PECAS=atkFis-aumenta,speed-diminui,condicao node scripts/harness/selo-sobre-o-poke.mjs
const FILTRO = process.env.PECAS?.split(',').map((s) => s.trim())
const LISTA = pecas().filter(([nome, direcao]) => (
  !FILTRO || FILTRO.includes(nome) || FILTRO.includes(`${nome}-${direcao}`)
))
if (LISTA.length === 0) throw new Error(`PECAS=${process.env.PECAS} nao casou com nenhuma peca`)
// 96 e nao 64: com o selo no FLANCO ESQUERDO (PH-485) a peca sai 35px a
// esquerda do centro do corpo, e numa celula de 64 ela era cortada pela borda —
// a bancada mostrava meio selo e ninguem descobria pelo codigo.
const CELULA_L = 96
const CELULA_A = ALTURA_CORPO + 24
const L = CELULA_L * ESCALAS.length * ZOOM
const A = CELULA_A * LISTA.length * ZOOM
const folha = new Uint8Array(L * A * 4)

// Duas faixas de fundo: a borda escura do selo precisa ser julgada sobre claro,
// e o miolo quase branco sobre escuro.
for (let y = 0; y < A; y++) {
  for (let x = 0; x < L; x++) {
    const i = (y * L + x) * 4
    const claro = y % (CELULA_A * ZOOM * 2) >= CELULA_A * ZOOM
    const c = claro ? [0xc8, 0xd2, 0xdc] : [0x21, 0x1c, 0x2e]
    folha[i] = c[0]; folha[i + 1] = c[1]; folha[i + 2] = c[2]; folha[i + 3] = 255
  }
}

/** Compoe `src` (RGBA) na folha, com nearest-neighbor e escala inteira. */
function compor(dx, dy, src, srcL, srcA, escala, tinta) {
  for (let y = 0; y < srcA; y++) {
    for (let x = 0; x < srcL; x++) {
      const s = (y * srcL + x) * 4
      const a = src[s + 3] / 255
      if (a <= 0.02) continue
      // `multiply` igual ao do desenho: branco x cor = cor, contorno x cor =
      // contorno. Pintar por cima daria outra coisa e a bancada mentiria.
      const rgb = tinta
        ? [0, 1, 2].map((c) => (src[s + c] * tinta[c]) / 255)
        : [src[s], src[s + 1], src[s + 2]]
      for (let ey = 0; ey < escala; ey++) {
        for (let ex = 0; ex < escala; ex++) {
          const X = dx + x * escala + ex
          const Y = dy + y * escala + ey
          if (X < 0 || Y < 0 || X >= L || Y >= A) continue
          const d = (Y * L + X) * 4
          for (let c = 0; c < 3; c++) folha[d + c] = Math.round(folha[d + c] * (1 - a) + rgb[c] * a)
        }
      }
    }
  }
}

/**
 * O corpo, reduzido pra `ALTURA_CORPO` mantendo a proporcao do quadro.
 *
 * Quadro 0,0 da folha: parado, virado pra frente — o unico de que esta bancada
 * precisa.
 */
function corpoNoTamanhoDeJogo() {
  const largura = Math.max(1, Math.round((QUADRO.largura / QUADRO.altura) * ALTURA_CORPO))
  const out = new Uint8Array(largura * ALTURA_CORPO * 4)
  for (let y = 0; y < ALTURA_CORPO; y++) {
    for (let x = 0; x < largura; x++) {
      const sx = Math.floor((x / largura) * QUADRO.largura)
      const sy = Math.floor((y / ALTURA_CORPO) * QUADRO.altura)
      const s = (sy * idle.width + sx) * 4
      const o = (y * largura + x) * 4
      out[o] = idle.rgba[s]; out[o + 1] = idle.rgba[s + 1]
      out[o + 2] = idle.rgba[s + 2]; out[o + 3] = idle.rgba[s + 3]
    }
  }
  return { buf: out, largura, altura: ALTURA_CORPO }
}

const corpo = corpoNoTamanhoDeJogo()

LISTA.forEach(([nome, direcao], linha) => {
  const topoDaLinha = linha * CELULA_A * ZOOM
  ESCALAS.forEach((escala, coluna) => {
    const { largura: sl, altura: sa } = dimensoesDoSelo(escala)
    const { buf } = selo(nome, direcao, escala)
    const centroX = coluna * CELULA_L * ZOOM + (CELULA_L * ZOOM) / 2
    // O corpo pousa na base da celula; o selo, no flanco esquerdo dele.
    const corpoTopo = topoDaLinha + (CELULA_A - ALTURA_CORPO - 2) * ZOOM
    compor(
      Math.round(centroX - (corpo.largura * ZOOM) / 2), corpoTopo,
      corpo.buf, corpo.largura, corpo.altura, ZOOM, null,
    )
    compor(
      Math.round(centroX - (corpo.largura / 2 + VAO + sl) * ZOOM), corpoTopo + 4 * ZOOM,
      buf, sl, sa, ZOOM, COR[direcao] ?? COR.diminui,
    )
  })
})

mkdirSync('scripts/harness/saida-estagio', { recursive: true })
writeFileSync('scripts/harness/saida-estagio/selo-sobre-o-poke.png', png(L, A, folha))
console.log(
  `${especie}: corpo a ${ALTURA_CORPO}px de mundo, selo 1:1 nas escalas `
  + ESCALAS.map((e) => {
    const d = dimensoesDoSelo(e)
    return `${e} (${d.largura}x${d.altura}, ${Math.round((d.altura / ALTURA_CORPO) * 100)}% do corpo)`
  }).join(' e '),
)
console.log('  scripts/harness/saida-estagio/selo-sobre-o-poke.png')
