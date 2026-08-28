// Mede, por especie e por animacao, a que altura do quadro comeca o PRIMEIRO
// PIXEL OPACO da sprite de batalha (PH-189).
//
// POR QUE EXISTE:
//
// `render/sprites.ts#visualTopOffset` ancorava o rotulo (nome, nivel, barra de
// HP, coluna de texto de combate) no topo da MOLDURA do quadro PMD, nao no
// desenho. Quadros do Sprite Collab carregam padding vazio pra animacao de
// bounce, e o padding varia por especie: medido no harness da PH-189, o vao
// entre a cabeca e o rotulo era de 20px no Charmeleon e 9px no Rattata — 11px
// de amplitude. Esse vao vazio e justamente a faixa que o texto do POKE vizinho
// invade, e a variacao por especie faz o mesmo layout ler bem numa cena e mal
// na seguinte.
//
// Com a fracao medida aqui o vao fica CONSTANTE entre especies, que e o
// criterio de aceite da issue.
//
// COMO MEDE, e por que assim:
//
// Um numero por (especie, animacao, FILEIRA DE DIRECAO): o menor y opaco entre
// todos os QUADROS daquela fileira. As duas escolhas sao medidas, nao gosto —
// ver `scripts/harness/vao-do-rotulo.mjs`, que roda a bancada:
//
//   - por quadro NAO: a folha Idle e uma animacao de respiro, e seguir o topo
//     quadro a quadro faria o rotulo pulsar junto. O bounce e enfeite; a altura
//     da cabeca nao muda de verdade.
//   - por direcao SIM: a silhueta muda mesmo quando o POKE vira (medido: 2px na
//     mediana, 10px no pior caso). Ancorar no pior caso da animacao inteira
//     deixaria 10px de amplitude entre especies — praticamente os mesmos 11px
//     que a issue reclama. So a fileira que esta na tela zera o vao vazio.
//
// Por ANIMACAO e nao so por especie porque `frameHeight` MUDA por animacao
// (charmeleon: 32 no Walk, 48 no Shoot) e a fracao e relativa a ele — uma
// fracao unica por especie erraria em toda animacao de tamanho diferente.
//
// ALFA > 0 conta como opaco. Nao ha meio-termo util: PMD usa alfa binario nas
// bordas e o anti-alias que existe e raro o suficiente pra nao mover o minimo.
//
// Rodar com: npm run sprites:topo
import { createRequire } from 'node:module'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { decodePng } = require('./lib/png.js')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const DIR_SPRITES = join(RAIZ, 'assets', 'battle-sprites')
const SAIDA = join(RAIZ, 'src', 'data', 'generated', 'spriteTopOffsets.generated.ts')

/**
 * Geometria declarada de cada animacao, lida do fonte TS.
 *
 * `battleSpriteAnims.ts` e um objeto JSON puro depois do `=`, entao da pra
 * recortar e dar `JSON.parse` sem transpilar nada. Importar o modulo exigiria
 * um passo de build so pra este script; a suite `geometriaDosSprites.test.mjs`
 * ja faz o mesmo recorte pelo mesmo motivo.
 */
function lerGeometrias() {
  const fonte = readFileSync(join(RAIZ, 'src', 'data', 'battleSpriteAnims.ts'), 'utf8')
  const inicio = fonte.indexOf('{', fonte.indexOf('BATTLE_SPRITE_ANIMS'))
  const fim = fonte.lastIndexOf('}')
  return JSON.parse(fonte.slice(inicio, fim + 1))
}

/**
 * Menor y opaco (em px do quadro) de CADA fileira da folha.
 *
 * Fileira inteiramente transparente vira `null` e o chamador substitui pelo
 * pior caso das outras — a folha existe, entao gravar 0 ali colaria o rotulo no
 * topo da moldura so naquela direcao.
 */
function topoPorFileira(rgba, largura, altura, frameHeight) {
  const fileiras = Math.max(1, Math.round(altura / frameHeight))
  const saida = []
  for (let fileira = 0; fileira < fileiras; fileira++) {
    const base = fileira * frameHeight
    let melhor = null
    for (let dy = 0; dy < frameHeight; dy++) {
      const y = base + dy
      if (y >= altura) break
      let opaco = false
      for (let x = 0; x < largura; x++) {
        if (rgba[(y * largura + x) * 4 + 3] > 0) { opaco = true; break }
      }
      if (opaco) { melhor = dy; break }
    }
    saida.push(melhor)
  }
  return saida
}

function main() {
  const geometrias = lerGeometrias()
  const especies = readdirSync(DIR_SPRITES, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

  const tabela = {}
  const semGeometria = []
  let folhas = 0

  for (const especie of especies) {
    const anims = geometrias[especie]
    if (!anims) { semGeometria.push(especie); continue }
    const porAnim = {}
    for (const [anim, meta] of Object.entries(anims)) {
      const arquivo = join(DIR_SPRITES, especie, `${anim}-Anim.png`)
      let png
      try {
        png = decodePng(readFileSync(arquivo))
      } catch {
        continue // animacao declarada sem PNG no disco: `resolveBattleAnim` ja cai no fallback
      }
      folhas++
      const tops = topoPorFileira(png.rgba, png.width, png.height, meta.frameHeight)
      const validos = tops.filter((v) => v !== null)
      if (validos.length === 0) {
        console.warn(`  ! ${especie}/${anim}: folha inteira transparente, pulada`)
        continue
      }
      const piorCaso = Math.min(...validos)
      // 3 casas: com frameHeight de 16 a 96, o passo de 0,001 vale menos de
      // 0,1px em qualquer folha do acervo. Mais casas so engordariam o arquivo.
      porAnim[anim] = tops.map((v) => Number(((v ?? piorCaso) / meta.frameHeight).toFixed(3)))
    }
    if (Object.keys(porAnim).length > 0) tabela[especie] = porAnim
  }

  const linhas = Object.entries(tabela).map(([especie, porAnim]) => {
    const pares = Object.entries(porAnim).map(([anim, v]) => `${anim}: [${v.join(',')}]`).join(', ')
    return `  ${especie}: { ${pares} },`
  })

  const conteudo = `// AUTO-GENERATED por \`npm run sprites:topo\` (scripts/gerar-topo-dos-sprites.mjs).
// Nao editar a mao — o proximo run do script sobrescreve.
//
// Fracao de \`frameHeight\` entre o TOPO DA MOLDURA do quadro e o primeiro pixel
// opaco da sprite. 0 significa que o desenho encosta na borda de cima; 0,25
// significa que um quarto do quadro e padding vazio.
//
// A chave e a especie, depois a animacao, e o valor e um numero POR FILEIRA DE
// DIRECAO (indice = a fileira que \`directionRowFromFacing\` escolhe). Dentro de
// uma fileira o valor e o menor y opaco entre todos os quadros dela: a altura da
// cabeca nao muda de verdade durante o respiro do Idle, entao seguir quadro a
// quadro so faria o rotulo pulsar.
//
// Quem consome: \`render/sprites.ts#visualTopOffset\`, que ancora nome, nivel,
// barra de HP e a coluna de texto de combate. Com isto o vao entre a cabeca e o
// rotulo fica CONSTANTE entre especies (PH-189); antes variava 11px — medido em
// \`scripts/harness/vao-do-rotulo.mjs\`.

export const TOPO_OPACO_POR_ANIM: Record<string, Record<string, number[]>> = {
${linhas.join('\n')}
}
`

  writeFileSync(SAIDA, conteudo, 'utf8')
  console.log(`${folhas} folhas medidas, ${Object.keys(tabela).length} especies gravadas em ${SAIDA}`)
  if (semGeometria.length > 0) {
    console.log(`sem geometria declarada (ignoradas): ${semGeometria.join(', ')}`)
  }
}

main()
