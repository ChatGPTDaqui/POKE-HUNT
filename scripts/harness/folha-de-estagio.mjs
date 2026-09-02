// Bancada: a arte de mudanca de atributo sobrevive ao tamanho de jogo? (PH-416)
//
// POR QUE ELA EXISTE, E POR QUE ZOOM SOZINHO MENTE
// -----------------------------------------------------------------------------
// Pixel art de 9x9 escalada 3x parece otima a 144px e pode virar mancha a 26px,
// que e a altura real do badge (`ALTURA_SIMBOLO_DE_STATUS`). As duas leituras
// mentem sozinhas, em direcoes opostas:
//
//   ZOOM              mostra o desenho e ESCONDE que ele nao sobrevive a
//                     reducao. Foi olhando so o zoom que a primeira passada
//                     aprovou dois escudos ocos que se separavam por 2px.
//   TAMANHO DE JOGO   mostra a verdade e nao deixa avaliar o traco.
//
// Entao a folha tem as duas: 3x do quadro original, e o MESMO quadro reduzido a
// 26px por media de area e ampliado 4x de volta. A coluna da direita e a que
// decide.
//
// TRES FUNDOS, e nao um. Contraste sobre corpo colorido e o que derrubou glifo
// na PH-416 (o cranio sobre o Gengar roxo, a chama sobre o Charizard laranja), e
// esta arte e quase branca de proposito — sobre um Lapras claro ela precisa da
// borda escura pra existir. As faixas escura/laranja/clara cobrem os tres casos.
//
// ESTA FOLHA NAO JULGA A ANIMACAO, e isso e limitacao conhecida: a direcao
// (subiu ou desceu) mora inteira no MOVIMENTO dos motes, e quadro parado nao
// mostra movimento. Pra esse lado existe `folha-de-estagio.html`, que toca as
// tiras no ritmo do jogo.
//
// COMO RODAR
//   node scripts/gerar-estagio-vfx.mjs
//   node scripts/harness/folha-de-estagio.mjs
//   (escreve scripts/harness/saida-estagio/folha-de-contato.png)
import { writeFileSync, mkdirSync } from 'node:fs'
import { png } from '../vfx/png.mjs'
import { tira, pecas } from '../gerar-estagio-vfx.mjs'

const LADO = 48
const ZOOM = 3
/** A altura real do badge no jogo. Ver `ALTURA_SIMBOLO_DE_STATUS`. */
const TAMANHO_DE_JOGO = 26
const ZOOM_PEQUENO = 4
const QUADROS_MOSTRADOS = [0, 5, 10]

/**
 * Reduz um quadro por MEDIA DE AREA, que e o que o navegador faz ao desenhar a
 * tira menor do que ela e.
 *
 * Media ponderada pelo alpha, e nao media crua: com media crua, um pixel
 * transparente puxaria a cor pro preto e a borda sairia mais escura do que sai
 * de verdade — a folha reprovaria arte que passa.
 */
function reduzir(src, srcL, sx, destino) {
  const out = new Uint8Array(destino * destino * 4)
  const escala = LADO / destino
  for (let y = 0; y < destino; y++) {
    for (let x = 0; x < destino; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let oy = Math.floor(y * escala); oy < Math.min(LADO, Math.ceil((y + 1) * escala)); oy++) {
        for (let ox = Math.floor(x * escala); ox < Math.min(LADO, Math.ceil((x + 1) * escala)); ox++) {
          const i = (oy * srcL + (sx + ox)) * 4
          const al = src[i + 3] / 255
          r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; a += src[i + 3]; n++
        }
      }
      const o = (y * destino + x) * 4
      const peso = a / 255
      out[o] = peso ? Math.round(r / peso) : 0
      out[o + 1] = peso ? Math.round(g / peso) : 0
      out[o + 2] = peso ? Math.round(b / peso) : 0
      out[o + 3] = Math.round(a / n)
    }
  }
  return out
}

const LISTA = pecas()
const CELULA = LADO * ZOOM
const LINHA = CELULA + 6
const LARGURA = QUADROS_MOSTRADOS.length * CELULA + QUADROS_MOSTRADOS.length * TAMANHO_DE_JOGO * ZOOM_PEQUENO + 16
const ALTURA = LISTA.length * LINHA + 8
const folha = new Uint8Array(LARGURA * ALTURA * 4)

const FUNDOS = [[0x2a, 0x1e, 0x3a], [0xd8, 0x6a, 0x1e], [0xdc, 0xe4, 0xee]]
for (let y = 0; y < ALTURA; y++) {
  for (let x = 0; x < LARGURA; x++) {
    const i = (y * LARGURA + x) * 4
    const cor = FUNDOS[Math.min(FUNDOS.length - 1, Math.floor(x / (LARGURA / FUNDOS.length)))]
    folha[i] = cor[0]; folha[i + 1] = cor[1]; folha[i + 2] = cor[2]; folha[i + 3] = 255
  }
}

function compor(dx, dy, src, srcL, sx, lado, escala) {
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const s = (y * srcL + (sx + x)) * 4
      const a = src[s + 3] / 255
      if (a === 0) continue
      for (let ey = 0; ey < escala; ey++) {
        for (let ex = 0; ex < escala; ex++) {
          const px = dx + x * escala + ex
          const py = dy + y * escala + ey
          if (px < 0 || py < 0 || px >= LARGURA || py >= ALTURA) continue
          const d = (py * LARGURA + px) * 4
          folha[d] = Math.round(folha[d] * (1 - a) + src[s] * a)
          folha[d + 1] = Math.round(folha[d + 1] * (1 - a) + src[s + 1] * a)
          folha[d + 2] = Math.round(folha[d + 2] * (1 - a) + src[s + 2] * a)
        }
      }
    }
  }
}

LISTA.forEach(([nome, direcao], linha) => {
  const { buf, largura } = tira(nome, direcao)
  const topo = 4 + linha * LINHA
  QUADROS_MOSTRADOS.forEach((f, k) => compor(4 + k * CELULA, topo, buf, largura, f * LADO, LADO, ZOOM))
  QUADROS_MOSTRADOS.forEach((f, k) => {
    const pequeno = reduzir(buf, largura, f * LADO, TAMANHO_DE_JOGO)
    const dx = 8 + QUADROS_MOSTRADOS.length * CELULA + k * TAMANHO_DE_JOGO * ZOOM_PEQUENO
    compor(dx, topo, pequeno, TAMANHO_DE_JOGO, 0, TAMANHO_DE_JOGO, ZOOM_PEQUENO)
  })
})

mkdirSync('scripts/harness/saida-estagio', { recursive: true })
writeFileSync('scripts/harness/saida-estagio/folha-de-contato.png', png(LARGURA, ALTURA, folha))
console.log(`folha ${LARGURA}x${ALTURA}: ${QUADROS_MOSTRADOS.length} quadros em ${ZOOM}x + os mesmos reduzidos a ${TAMANHO_DE_JOGO}px`)
LISTA.forEach(([n, d], i) => console.log(`  linha ${i + 1}: ${n}-${d}`))
