// PH-149 — a geometria declarada de cada battle-sprite bate com o PNG.
//
// `src/data/battleSpriteAnims.ts` diz `frameWidth`, `frameHeight` e `durations`
// de cada animacao, e o renderer usa esses numeros pra recortar a folha (8
// fileiras de direcao x N quadros). Se eles discordarem da imagem, o recorte
// sai deslocado: o POKE aparece cortado, com pedaco do quadro vizinho, ou
// piscando entre os dois.
//
// Nada verificava isso. `npm run especies:importar` le a geometria do
// `AnimData.xml` da origem e copia o PNG — se os dois discordarem la, o erro
// entra no repositorio e so aparece quando alguem encontrar aquela especie numa
// hunt.
//
// A guarda nasce VERDE (1.266 animacoes, 0 problemas) e o momento de escreve-la
// e agora: PH-145 trouxe 19 especies e PH-146 traz 135 quando a geracao III for
// ligada.
//
// Mora em `scripts/` porque ler PNG exige `node:fs`, e `src/` nao tem os types
// de node — mesmo motivo de `scripts/lib/animdata.test.mjs`.
import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
/**
 * Largura e altura de um PNG, lidas SO do cabecalho IHDR.
 *
 * `scripts/lib/png.js#decodePng` existe e serve, mas descomprime a imagem
 * inteira: 1.266 folhas custavam 17s e estouravam o `testTimeout` de 5s. Aqui
 * nao se olha um pixel — a geometria e aritmetica de recorte, e ela cabe nos
 * primeiros 24 bytes.
 *
 * Layout: 8 de assinatura, 4 de tamanho do bloco, 4 do literal "IHDR", 4 de
 * largura e 4 de altura, big-endian.
 *
 * Le os 24 bytes pelo descritor, e nao com `readFileSync`. Sao 1.266 folhas, e
 * algumas passam de 1 MB: trazer a imagem inteira pra memoria pra olhar o
 * cabecalho e desperdicio que a assinatura da funcao nem denuncia — quem lesse
 * `dimensoesDePng(readFileSync(caminho))` ia supor que o custo era o do
 * cabecalho.
 */
function dimensoesDePng(caminho) {
  const fd = openSync(caminho, 'r')
  try {
    const buffer = Buffer.alloc(24)
    const lidos = readSync(fd, buffer, 0, 24, 0)
    if (lidos < 24) throw new Error(`arquivo curto demais pra ser PNG: ${caminho}`)
    if (buffer.readUInt32BE(12) !== 0x49484452) throw new Error(`primeiro bloco nao e IHDR: ${caminho}`)
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  } finally {
    closeSync(fd)
  }
}

/** `BATTLE_SPRITE_ANIMS` e um literal JSON puro no fim do arquivo. */
function lerAnimacoes() {
  const texto = readFileSync(join(RAIZ, 'src', 'data', 'battleSpriteAnims.ts'), 'utf8')
  const m = texto.match(/BATTLE_SPRITE_ANIMS: Record<string, BattleSpriteAnimSet> = ([\s\S]*)$/)
  if (!m) throw new Error('nao achei BATTLE_SPRITE_ANIMS em battleSpriteAnims.ts')
  return JSON.parse(m[1].trim())
}

const ANIMS = lerAnimacoes()

const entradas = []
for (const [id, anims] of Object.entries(ANIMS)) {
  for (const [nome, meta] of Object.entries(anims)) entradas.push({ id, nome, meta })
}

describe('a geometria dos battle-sprites (PH-149)', () => {
  it('leu o mapa e ele nao esta vazio', () => {
    // Guarda anti-vacuo: um regex que deixasse de casar faria todo `it.each`
    // abaixo rodar sobre zero casos e a suite ficar verde sem olhar nada.
    expect(Object.keys(ANIMS).length).toBeGreaterThan(200)
    expect(entradas.length).toBeGreaterThan(1000)
  })

  it('todo PNG declarado existe em disco', () => {
    const faltando = entradas
      .filter(({ id, nome }) => !existsSync(join(RAIZ, 'assets', 'battle-sprites', id, `${nome}-Anim.png`)))
      .map(({ id, nome }) => `${id}/${nome}`)
    expect(
      faltando,
      'battleSpriteAnims.ts declara animacao cujo PNG nao esta em disco — o renderer pede uma '
      + 'imagem que da 404 e o POKE fica sem desenho.',
    ).toEqual([])
  })

  it('a folha e um numero inteiro de quadros, e ha quadro pra cada duracao', () => {
    const problemas = []
    for (const { id, nome, meta } of entradas) {
      const caminho = join(RAIZ, 'assets', 'battle-sprites', id, `${nome}-Anim.png`)
      if (!existsSync(caminho)) continue // ja reportado no caso acima
      const { width, height } = dimensoesDePng(caminho)

      if (height % meta.frameHeight !== 0) {
        problemas.push(`${id}/${nome}: altura ${height} nao e multiplo de frameHeight ${meta.frameHeight}`)
        continue
      }
      if (width % meta.frameWidth !== 0) {
        problemas.push(`${id}/${nome}: largura ${width} nao e multiplo de frameWidth ${meta.frameWidth}`)
        continue
      }
      const quadros = width / meta.frameWidth
      // So a FALTA e erro, e a assimetria e deliberada: quadro sobrando na folha
      // e comum (a origem exporta a linha inteira mesmo quando a animacao usa
      // menos), enquanto duracao sem quadro faz o renderer recortar fora da
      // imagem. Se um dia sobra virar sintoma de `frameWidth` menor do que
      // deveria, o caso pra abrir e outro — este aqui nao promete pegar.
      if (quadros < meta.durations.length) {
        problemas.push(`${id}/${nome}: ${meta.durations.length} duracoes declaradas mas a folha so tem ${quadros} quadro(s)`)
      }
    }
    // Truncado porque 1.266 animacoes quebradas seriam ilegiveis — mas o TOTAL
    // vai junto: 21 problemas e uma regressao pontual, 900 e geometria trocada
    // no importador, e sao diagnosticos diferentes.
    const amostra = problemas.slice(0, 20)
    expect(
      amostra,
      `${problemas.length} problema(s) de geometria, mostrando ate 20. A geometria declarada nao `
      + 'bate com o PNG. O renderer recorta pelos numeros de battleSpriteAnims.ts, entao o sintoma '
      + 'e sprite cortado ou com pedaco do quadro vizinho — visivel na tela e dificil de rastrear '
      + 'ate aqui.',
    ).toEqual([])
  })
})
