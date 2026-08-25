// PH-137 — a cobertura de face de emocao nao pode cair em silencio.
//
// `faceEmocaoUrl` cai na face NEUTRA quando a especie nao tem a expressao. Isso
// e proposital e esta certo — um `<img>` 404 deixaria um quadrado vazio no
// trilho, que e a unica superficie permanente da tela. O preco e que a falta de
// arte NAO tem sintoma: o jogador ve cara normal com o POKE envenenado a 20% de
// vida, e nada no console, no tipo ou no teste dizia nada.
//
// Este arquivo tranca as tres formas de a cobertura piorar sem ninguem notar:
//
//   1. o MAPA promete um arquivo que nao existe em disco -> 404, quadrado vazio
//      (o unico caso que produz sintoma visivel, e o pior)
//   2. o arquivo existe e o MAPA nao lista -> a face nunca aparece, de graca
//   3. arte sai do acervo e o mapa e regerado junto -> os dois concordam, e a
//      cobertura simplesmente encolheu
//
// O (3) e o que exige numero registrado: sem baseline, mapa e disco concordando
// e sempre "verde", inclusive com zero arte.
import { describe, expect, it } from 'vitest'

import { FACE_EMOCOES, FACE_EMOCOES_SHINY, type FaceEmocao } from './generated/faceEmocoes.generated'

// Somente as CHAVES: `eager: false` sem `import` nao carrega byte nenhum dos
// ~2.600 PNGs, so resolve os caminhos em tempo de build. E a unica forma de ler
// o disco daqui — `src/` nao tem os types de node (ver render/ambiente.test.ts).
const ARQUIVOS_NORMAIS = Object.keys(import.meta.glob('/assets/sprites-face/emo/*/*.png'))
const ARQUIVOS_SHINY = Object.keys(import.meta.glob('/assets/sprites-face-shiny/emo/*/*.png'))

/**
 * COBERTURA MINIMA POR EMOCAO. Medida em 2026-08-24, subida no mesmo dia.
 *
 * Nao e meta, e piso: o numero de hoje. Subir e livre; descer exige mexer aqui
 * e explicar por que, que e exatamente a conversa que este teste existe pra
 * forcar. As 245 especies tem face neutra; a diferenca e o que falta garimpar.
 *
 * `pain` e `dizzy` sao as que mais doem faltar — dano e confusao/KO.
 *
 * HISTORICO DOS NUMEROS, porque eles contam o que aconteceu:
 *
 *   192/185/184/184/184/184/182  (normal) — a primeira medicao, com 226
 *       especies e o mapeamento de 7 expressoes 1:1 com a origem.
 *   208/204/208/208/213/211/200  — depois de PH-145 (+19 especies) e da tabela
 *       de SUBSTITUTAS em `importar-faces-emocao.mjs`: o acervo tem 16
 *       expressoes e o script usava 7, entao parte do "nao existe arte" era o
 *       mapeamento ser estreito, nao a arte faltar.
 */
const PISO: Record<FaceEmocao, { normal: number; shiny: number }> = {
  pain: { normal: 208, shiny: 205 },
  worried: { normal: 204, shiny: 200 },
  dizzy: { normal: 208, shiny: 204 },
  stunned: { normal: 208, shiny: 204 },
  joyous: { normal: 213, shiny: 207 },
  determined: { normal: 211, shiny: 206 },
  sigh: { normal: 200, shiny: 197 },
}

const EMOCOES = Object.keys(PISO) as FaceEmocao[]

/** `/assets/sprites-face/emo/pain/abra.png` -> `pain:abra` */
function chave(caminho: string): string {
  const m = caminho.match(/\/emo\/([a-z]+)\/([a-z0-9_-]+)\.png$/)
  return m ? `${m[1]}:${m[2]}` : ''
}

function emDisco(arquivos: string[]): Set<string> {
  return new Set(arquivos.map(chave).filter(Boolean))
}

/** `{ abra: ['pain','dizzy'] }` -> `Set('pain:abra', 'dizzy:abra')` */
function noMapa(tabela: Record<string, FaceEmocao[]>): Set<string> {
  const fora = new Set<string>()
  for (const [especie, faces] of Object.entries(tabela)) {
    for (const face of faces) fora.add(`${face}:${especie}`)
  }
  return fora
}

const VARIANTES = [
  { nome: 'normal', arquivos: ARQUIVOS_NORMAIS, tabela: FACE_EMOCOES, campo: 'normal' as const },
  { nome: 'shiny', arquivos: ARQUIVOS_SHINY, tabela: FACE_EMOCOES_SHINY, campo: 'shiny' as const },
]

describe('cobertura de face de emocao (PH-137)', () => {
  // Guarda anti-teste-vacuo: se o glob mudar de caminho e vier vazio, TODA
  // comparacao abaixo passaria comparando conjuntos vazios.
  it('o glob achou a arte em disco', () => {
    expect(ARQUIVOS_NORMAIS.length).toBeGreaterThan(1000)
    expect(ARQUIVOS_SHINY.length).toBeGreaterThan(1000)
  })

  for (const { nome, arquivos, tabela, campo } of VARIANTES) {
    it(`${nome}: o mapa nao promete arquivo que nao existe`, () => {
      // O pior dos tres casos, e o unico com sintoma visivel: `faceEmocaoUrl`
      // devolve o caminho, o `<img>` da 404 e o trilho fica com um quadrado
      // vazio no lugar do POKE.
      const disco = emDisco(arquivos)
      const prometidos = [...noMapa(tabela as Record<string, FaceEmocao[]>)]
      const fantasmas = prometidos.filter((k) => !disco.has(k))
      expect(
        fantasmas,
        'o mapa gerado lista face que nao esta em disco — `<img>` 404 e quadrado vazio no trilho',
      ).toEqual([])
    })

    it(`${nome}: arte em disco nao fica de fora do mapa`, () => {
      // Sem sintoma nenhum: a face existe, funciona, e nunca e pedida. Rodar
      // `importar-faces-emocao.mjs` sem regerar o mapa produz exatamente isto.
      const disco = [...emDisco(arquivos)]
      const mapa = noMapa(tabela as Record<string, FaceEmocao[]>)
      const orfas = disco.filter((k) => !mapa.has(k))
      expect(
        orfas,
        'arte existe em disco e o mapa gerado nao lista — a face nunca vai aparecer. '
        + 'Rode o gerador do mapa de faces.',
      ).toEqual([])
    })

    for (const emocao of EMOCOES) {
      it(`${nome}: ${emocao} nao cai abaixo de ${PISO[emocao][campo]} especies`, () => {
        const quantas = arquivos.filter((a) => a.includes(`/emo/${emocao}/`)).length
        expect(
          quantas,
          `${emocao} (${nome}) caiu para ${quantas}, abaixo do piso de ${PISO[emocao][campo]}. `
          + 'Se a queda for intencional, mude o PISO aqui e diga por que — o fallback pra face '
          + 'neutra e silencioso, entao ninguem descobre isso olhando o jogo.',
        ).toBeGreaterThanOrEqual(PISO[emocao][campo])
      })
    }
  }

  it('o piso cobre todas as emocoes que o codigo pode escolher', () => {
    // Emocao nova em `faceEmotions.ts` sem entrada aqui entraria sem piso, e o
    // teste passaria feliz com um unico arquivo.
    const noPiso = new Set(EMOCOES)
    const noMapaGerado = new Set<string>()
    for (const faces of Object.values(FACE_EMOCOES)) for (const f of faces) noMapaGerado.add(f)
    const semPiso = [...noMapaGerado].filter((f) => !noPiso.has(f as FaceEmocao))
    expect(semPiso, 'emocao no mapa gerado sem piso declarado neste teste').toEqual([])
  })
})
