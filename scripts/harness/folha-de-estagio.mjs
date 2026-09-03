// Bancada: o selo de mudanca de atributo sobrevive ao tamanho de jogo? (PH-416,
// refeita na PH-480)
//
// O QUE MUDOU DA PH-416 PRA CA
// -----------------------------------------------------------------------------
// A peca era uma tira de 16 quadros de 48x48 desenhada no centro do corpo, e a
// folha mostrava tres quadros dela pra julgar o movimento dos motes. Desde a
// PH-480 a peca e um SELO de quadro unico, 40x24, desenhado acima da cabeca —
// nao ha quadro pra escolher, e o que precisa ser julgado e outra coisa:
//
//   1. o GLIFO ainda diz qual atributo, agora em escala 2 e nao 3;
//   2. a SETA ainda diz a direcao, e ela e o unico canal que sobrou pra isso;
//   3. os dois nao viram uma silhueta so quando os contornos se encostam.
//
// POR QUE ZOOM SOZINHO MENTE
// -----------------------------------------------------------------------------
// Pixel art parece otima ampliada e pode virar mancha quando encolhe. As duas
// leituras mentem sozinhas, em direcoes opostas:
//
//   ZOOM        mostra o desenho e ESCONDE que ele nao sobrevive a reducao. Foi
//               olhando so o zoom que a primeira passada da PH-416 aprovou dois
//               escudos ocos que se separavam por 2px.
//   ENCOLHIDO   mostra o que sobra e nao deixa avaliar o traco.
//
// Entao a folha tem as tres colunas: 4x, 1:1, e o selo reduzido a 70% e
// ampliado 4x de volta. A coluna da direita e a que decide.
//
// A COLUNA DA DIREITA E ESTRESSE, NAO "TAMANHO DE JOGO", e ela e CONSERVADORA
// DE PROPOSITO. O canvas da hunt nao tem zoom de camera — `GameCanvas` faz
// `canvas.width = canvas.clientWidth`, ou seja unidade de mundo E pixel de CSS
// —, entao o selo de 21x13 chega na tela como 21x13 e a reducao de 70% nao
// acontece em aparelho nenhum. Ela fica na folha como margem: arte que passa
// aqui passa em qualquer mudanca futura de escala; arte que falha aqui ainda
// pode estar aceitavel hoje.
//
// A PERGUNTA DE PROPORCAO NAO E DESTA FOLHA. "O selo e pequeno perto do POKE?"
// se responde em `selo-sobre-o-poke.mjs`, que compoe sobre o corpo real — e foi
// ela que escolheu a escala do pixel art.
//
// TRES FUNDOS, e nao um. Contraste sobre corpo colorido e o que derrubou glifo
// na PH-416 (o cranio sobre o Gengar roxo, a chama sobre o Charizard laranja), e
// esta arte e quase branca de proposito — sobre um Lapras claro ela precisa da
// borda escura pra existir. As faixas escura/laranja/clara cobrem os tres casos.
//
// O QUE ELA NAO JULGA: a TINTA. O selo sai quase branco e o desenho aplica a cor
// da direcao por `multiply` (verde sobe, vermelho desce). Isso e do jogo, nao da
// arte.
//
// A PAGINA IRMA FOI APAGADA, e o motivo e que a pergunta dela deixou de existir.
// `folha-de-estagio.html` tocava as tiras no ritmo do jogo porque a DIRECAO
// morava inteira no movimento dos motes ao longo de 16 quadros — quadro parado
// nao mostrava movimento, e so a pagina animada respondia "subiu ou desceu?".
// Com o selo de quadro unico da PH-480, a direcao mora na SETA, que e forma; a
// folha estatica abaixo ja responde. Manter a pagina seria manter uma bancada
// que anima um quadro so e nao mede nada — pior que nao ter, porque ela pareceria
// uma verificacao.
//
// COMO RODAR
//   node scripts/gerar-estagio-vfx.mjs
//   node scripts/harness/folha-de-estagio.mjs
//   (escreve scripts/harness/saida-estagio/folha-de-contato.png)
import { writeFileSync, mkdirSync } from 'node:fs'
import { png } from '../vfx/png.mjs'
import { selo, pecas, SELO_LARGURA, SELO_ALTURA } from '../gerar-estagio-vfx.mjs'

const ZOOM = 4
/** A fracao do estresse — ver a nota de cabecalho. */
const ESTRESSE = 0.7
const ESTRESSE_L = Math.round(SELO_LARGURA * ESTRESSE)
const ESTRESSE_A = Math.round(SELO_ALTURA * ESTRESSE)

/**
 * Reduz o selo por MEDIA DE AREA, que e o que o navegador faz ao desenhar a peca
 * menor do que ela e.
 *
 * Media ponderada pelo alpha, e nao media crua: com media crua, um pixel
 * transparente puxaria a cor pro preto e a borda sairia mais escura do que sai
 * de verdade — a folha reprovaria arte que passa.
 */
function reduzir(src, srcL, srcA, destL, destA) {
  const out = new Uint8Array(destL * destA * 4)
  const ex = srcL / destL
  const ey = srcA / destA
  for (let y = 0; y < destA; y++) {
    for (let x = 0; x < destL; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let oy = Math.floor(y * ey); oy < Math.min(srcA, Math.ceil((y + 1) * ey)); oy++) {
        for (let ox = Math.floor(x * ex); ox < Math.min(srcL, Math.ceil((x + 1) * ex)); ox++) {
          const i = (oy * srcL + ox) * 4
          const al = src[i + 3] / 255
          r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; a += src[i + 3]; n++
        }
      }
      const o = (y * destL + x) * 4
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
const COL_ZOOM = SELO_LARGURA * ZOOM
const COL_UM = SELO_LARGURA
const COL_ESTRESSE = ESTRESSE_L * ZOOM
const LINHA = SELO_ALTURA * ZOOM + 6
const LARGURA = 4 + COL_ZOOM + 8 + COL_UM + 8 + COL_ESTRESSE + 4
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

function compor(dx, dy, src, srcL, srcA, escala) {
  for (let y = 0; y < srcA; y++) {
    for (let x = 0; x < srcL; x++) {
      const s = (y * srcL + x) * 4
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
  const { buf } = selo(nome, direcao)
  const topo = 4 + linha * LINHA
  compor(4, topo, buf, SELO_LARGURA, SELO_ALTURA, ZOOM)
  compor(4 + COL_ZOOM + 8, topo, buf, SELO_LARGURA, SELO_ALTURA, 1)
  const pequeno = reduzir(buf, SELO_LARGURA, SELO_ALTURA, ESTRESSE_L, ESTRESSE_A)
  compor(4 + COL_ZOOM + 8 + COL_UM + 8, topo, pequeno, ESTRESSE_L, ESTRESSE_A, ZOOM)
})

mkdirSync('scripts/harness/saida-estagio', { recursive: true })
writeFileSync('scripts/harness/saida-estagio/folha-de-contato.png', png(LARGURA, ALTURA, folha))
console.log(
  `folha ${LARGURA}x${ALTURA}: selo ${SELO_LARGURA}x${SELO_ALTURA} em ${ZOOM}x, 1:1, `
  + `e reduzido a ${ESTRESSE_L}x${ESTRESSE_A} (${Math.round(ESTRESSE * 100)}%)`,
)
LISTA.forEach(([n, d], i) => console.log(`  linha ${i + 1}: ${n}-${d}`))
