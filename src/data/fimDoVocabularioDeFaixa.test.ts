// PH-434 — a faixa saiu do codigo de producao, e este teste tranca isso.
//
// POR QUE UM TESTE, E NAO SO O GREP DE UMA VEZ. Vocabulario morto nao quebra
// nada: ele so fica, e o proximo a ler o codigo nao sabe dizer se `faixa2`
// ainda decide alguma coisa ou e resto. O redesenho levou dez issues pra tirar
// a faixa de cada lugar; sem uma guarda, a primeira linha nova que a
// reintroduzir passa em silencio e a limpeza recomeça.
//
// O QUE CONTINUA PERMITIDO, de proposito:
//
//   - a TRADUCAO do save antigo (data/progressoDeBioma.ts), que precisa ler o
//     formato velho enquanto houver linha com ele no banco;
//   - o TIPO `Continent`, que ainda aceita os tres nomes pelo mesmo motivo;
//   - patch note e migration antigos: historico nao se reescreve;
//   - COMENTARIO em qualquer lugar. Explicar o que a faixa era e como ela saiu
//     e justamente o que impede alguem de refazer o caminho.
import { describe, expect, it } from 'vitest'

import { GRUPOS_DO_LANCE, GRUPOS_INICIAIS, GRUPOS_LEGADOS } from './biomas'
import { TETO_DO_MODO_NORMAL } from './estagios'

const FONTES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

// Onde a faixa PODE aparecer em codigo, e por que.
const PERMITIDOS = [
  '/src/data/progressoDeBioma.ts',   // a traducao do save antigo
  '/src/data/generated/types.ts',    // o tipo Continent, pelo mesmo motivo
  '/src/data/biomas.ts',             // a lista de grupos legados a descartar
  '/src/data/patchNotes.ts',         // historico publicado
]

function ehTeste(caminho: string) {
  return caminho.includes('.test.')
}

/** Linhas de CODIGO (sem comentario) que citam faixa1/2/3. */
function linhasComFaixa(fonte: string): string[] {
  return fonte
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'))
    .filter((l) => /faixa[123]/.test(l))
}

describe('o vocabulario de faixa saiu do codigo', () => {
  it('a varredura enxergou o codigo de verdade', () => {
    // Guarda anti-vacuo: com o glob quebrado, o teste abaixo passa medindo
    // nada — e ele existe justamente pra achar o que ninguem procurou.
    expect(Object.keys(FONTES).length).toBeGreaterThan(200)
  })

  it('nenhum arquivo de producao cita faixa1/2/3 em codigo', () => {
    const achados: string[] = []
    for (const [caminho, fonte] of Object.entries(FONTES)) {
      if (ehTeste(caminho) || PERMITIDOS.includes(caminho)) continue
      for (const linha of linhasComFaixa(fonte)) achados.push(`${caminho}: ${linha}`)
    }
    expect(achados).toEqual([])
  })

  it('as constantes de faixa nao existem mais', () => {
    // `FAIXAS`, `FaixaId`, `FAIXA_POR_ID`, `huntId`, `biomaDoMapId`,
    // `indiceDoBiomaNoMapId` e `ORDEM_DOS_BIOMAS` saiam de `biomas.ts`. Um
    // `import` sobrevivente daria erro de compilacao, mas uma re-CRIACAO com o
    // mesmo nome nao — e e disso que este caso trata.
    const biomas = FONTES['/src/data/biomas.ts']
    expect(biomas).toBeTruthy()
    for (const nome of [
      'export const FAIXAS', 'export type FaixaId', 'export interface FaixaDef',
      'export const FAIXA_POR_ID', 'export function huntId',
      'export function biomaDoMapId', 'export function indiceDoBiomaNoMapId',
      'export const ORDEM_DOS_BIOMAS',
    ]) {
      expect(biomas.includes(nome), `${nome} voltou a existir`).toBe(false)
    }
  })

  it('os grupos de gate sao dois, e nenhum e faixa', () => {
    expect(GRUPOS_INICIAIS).toEqual(['biomas'])
    expect(GRUPOS_DO_LANCE).toEqual(['nightmare'])
  })

  it('as tres faixas viraram grupo LEGADO, descartado na carga', () => {
    // Save antigo carrega `faixa1` em `unlocked_continents`, e nenhuma hunt tem
    // mais esse `continent`. Sem o descarte a lista do jogador acumula chave
    // que nao decide nada — lixo que ninguem sabe se ainda importa.
    for (const faixa of ['faixa1', 'faixa2', 'faixa3']) {
      expect(GRUPOS_LEGADOS.has(faixa), faixa).toBe(true)
    }
  })

  it('o teto do modo normal e 100, e nao 90', () => {
    // O 90 era o fim da faixa III. Com 10 estagios de 10 niveis o teto e a
    // centena — e um 90 sobrevivente esconderia os estagios 10 do jogo inteiro.
    expect(TETO_DO_MODO_NORMAL).toBe(100)
  })
})

describe('nenhum texto de tela fala em faixa', () => {
  it('nao ha string visivel com "Faixa" nas telas', () => {
    // O jogador nunca deve ler uma palavra que nao descreve mais nada do jogo.
    // Busca so em `features/` e `components/`, que e onde a copy mora.
    const achados: string[] = []
    for (const [caminho, fonte] of Object.entries(FONTES)) {
      if (ehTeste(caminho)) continue
      if (!caminho.startsWith('/src/features/') && !caminho.startsWith('/src/components/')) continue
      for (const linha of fonte.split('\n')) {
        const limpo = linha.trim()
        if (limpo.startsWith('//') || limpo.startsWith('*')) continue
        if (/Faixa [IV]|Faixa \d/.test(limpo)) achados.push(`${caminho}: ${limpo}`)
      }
    }
    expect(achados).toEqual([])
  })
})
