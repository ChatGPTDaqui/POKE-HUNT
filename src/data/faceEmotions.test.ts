// O que estes testes impedem é falha SILENCIOSA (docs/10-invariantes-e-testes.md):
// uma face que aponta pra um PNG que nao existe nao lanca erro nenhum — deixa um
// quadrado vazio no trilho — e uma prioridade invertida faz o retrato mentir
// sobre o estado do POKE sem nada no console.
import { describe, expect, it } from 'vitest'
import { escolherFace, faceEmocaoUrl, faceUrlsDaEspecie, FACE_NEUTRA, HP_BAIXO, HP_CRITICO } from './faceEmotions'
import { FACE_EMOCOES, FACE_EMOCOES_SHINY } from './generated/faceEmocoes.generated'
import { SPECIES_WITH_ART } from './sprites'
import type { EstadoDaFace } from './faceEmotions'

const SAUDAVEL: EstadoDaFace = {
  hpFrac: 1,
  fainted: false,
  status: null,
  statusVolatil: null,
  emCombate: false,
  festejando: false,
}

describe('escolherFace', () => {
  it('POKE inteiro e parado mostra a face neutra', () => {
    expect(escolherFace(SAUDAVEL)).toBe(FACE_NEUTRA)
  })

  it('KO ganha de tudo — inclusive de comemoracao e de status', () => {
    expect(escolherFace({
      ...SAUDAVEL,
      fainted: true,
      festejando: true,
      status: { tipo: 'burn', turnosRestantes: 3 },
      hpFrac: 0,
    })).toBe('dizzy')
  })

  it('level-up ganha de HP critico (a festa dura 2s, a dor volta depois)', () => {
    expect(escolherFace({ ...SAUDAVEL, festejando: true, hpFrac: 0.05 })).toBe('joyous')
  })

  it('HP critico ganha de status: a 20% de vida a noticia e a vida', () => {
    expect(escolherFace({
      ...SAUDAVEL,
      hpFrac: HP_CRITICO - 0.01,
      status: { tipo: 'sleep', turnosRestantes: 2 },
    })).toBe('pain')
  })

  it('status ganha de HP baixo: a 50% de vida a noticia e o status', () => {
    expect(escolherFace({
      ...SAUDAVEL,
      hpFrac: HP_BAIXO - 0.01,
      status: { tipo: 'sleep', turnosRestantes: 2 },
    })).toBe('sigh')
  })

  it('confusao (volatil) ganha do status nao-volatil — ela e a informacao nova', () => {
    expect(escolherFace({
      ...SAUDAVEL,
      status: { tipo: 'poison', turnosRestantes: null },
      statusVolatil: { tipo: 'confusion', turnosRestantes: 2 },
    })).toBe('dizzy')
  })

  it('cada status tem face propria', () => {
    const faces = (['poison', 'burn', 'paralysis', 'freeze', 'sleep', 'confusion'] as const)
      .map((tipo) => escolherFace({ ...SAUDAVEL, status: { tipo, turnosRestantes: 2 } }))
    expect(faces).toEqual(['pain', 'pain', 'stunned', 'stunned', 'sigh', 'dizzy'])
  })

  it('HP baixo vira preocupacao, e lutar inteiro vira determinacao', () => {
    expect(escolherFace({ ...SAUDAVEL, hpFrac: HP_BAIXO - 0.01 })).toBe('worried')
    expect(escolherFace({ ...SAUDAVEL, emCombate: true })).toBe('determined')
    // Combate perde de qualquer sinal de dano: perseguir com 40% de vida mostra
    // preocupacao, nao determinacao.
    expect(escolherFace({ ...SAUDAVEL, emCombate: true, hpFrac: 0.4 })).toBe('worried')
  })

  it('hpFrac fora de [0,1] nao escapa pela borda', () => {
    expect(escolherFace({ ...SAUDAVEL, hpFrac: -1 })).toBe('pain')
    expect(escolherFace({ ...SAUDAVEL, hpFrac: 4 })).toBe(FACE_NEUTRA)
  })
})

describe('faceEmocaoUrl', () => {
  it('devolve a face de emocao quando a especie tem', () => {
    expect(faceEmocaoUrl('entei', false, 'pain')).toBe('assets/sprites-face/emo/pain/entei.png')
    expect(faceEmocaoUrl('entei', true, 'pain')).toBe('assets/sprites-face-shiny/emo/pain/entei.png')
  })

  it('cai na face neutra quando a especie NAO tem aquela expressao', () => {
    // Aerodactyl e uma das ~40 especies que a origem so cobre em parte.
    expect(FACE_EMOCOES.aerodactyl).not.toContain('sigh')
    expect(faceEmocaoUrl('aerodactyl', false, 'sigh')).toBe('assets/sprites-face/aerodactyl.png')
  })

  it('especie sem arte nenhuma devolve null em vez de um caminho inventado', () => {
    expect(faceEmocaoUrl('especie_que_nao_existe', false, 'pain')).toBeNull()
  })

  it('a face neutra continua sendo o arquivo de sempre', () => {
    expect(faceEmocaoUrl('charmander', false, FACE_NEUTRA)).toBe('assets/sprites-face/charmander.png')
  })
})

describe('o mapa gerado bate com o disco', () => {
  // Este e o teste que pega o erro de verdade: o mapa e gerado por script e o
  // codigo confia nele pra NAO pedir 404. Um arquivo prometido e ausente
  // (download parcial, arte apagada) nao quebra nada em teste de unidade — so
  // aparece como retrato vazio no jogo de quem tem aquela especie em campo.
  // `import.meta.glob` e nao `node:fs`, pelo mesmo motivo de vfxTiras.test.ts:
  // confere contra o que o Vite realmente empacota, nao contra o disco cru.
  const arquivos = new Set(Object.keys(import.meta.glob('/assets/sprites-face*/emo/**/*.png')))

  it('todo arquivo prometido pelo mapa existe em assets/', () => {
    const faltando: string[] = []
    for (const [tabela, isShiny] of [[FACE_EMOCOES, false], [FACE_EMOCOES_SHINY, true]] as const) {
      for (const [speciesId, faces] of Object.entries(tabela)) {
        for (const face of faces) {
          const url = faceEmocaoUrl(speciesId, isShiny, face)
          if (url == null || !arquivos.has(`/${url}`)) faltando.push(`${speciesId}/${face}/${isShiny}`)
        }
      }
    }
    expect(faltando).toEqual([])
  })

  it('so lista especie que o jogo desenha', () => {
    const estranhas = [...Object.keys(FACE_EMOCOES), ...Object.keys(FACE_EMOCOES_SHINY)]
      .filter((id) => !SPECIES_WITH_ART.has(id))
    expect(estranhas).toEqual([])
  })

  it('faceUrlsDaEspecie devolve a neutra mais uma URL por emocao disponivel', () => {
    const urls = faceUrlsDaEspecie('entei', false)
    expect(urls[0]).toBe('assets/sprites-face/entei.png')
    expect(urls).toHaveLength(1 + FACE_EMOCOES.entei.length)
    expect(new Set(urls).size).toBe(urls.length)
  })
})
