// PH-433 — nenhuma bancada aponta pra uma hunt que nao existe.
//
// O QUE ISTO PEGOU. O redesenho trocou os ids de hunt de `<bioma>_faixa<N>` pra
// `<bioma>_e<N>` (PH-426). Oito bancadas em `scripts/harness/` continuaram
// pedindo o id velho, e todas as oito estouravam com
//
//   Error: Mapa desconhecido: mata_faixa1
//
// na primeira linha. Entre elas estao as que produziram os numeros que hoje
// justificam constantes do jogo — `custo-fixo-por-janela.mjs` (a janela minima
// de flush), `divergencia-de-quota.mjs` (os 120s de espera pela autoridade),
// `prazo-do-estagio.mjs` (o prazo de buff).
//
// POR QUE ISSO E PIOR QUE PARECE. Bancada quebrada nao reprova nada: ela nao
// roda em CI, nao tem teste, e ninguem a executa ate precisar refazer uma
// medicao. Quando precisar, o numero antigo ja estara na nota de uma constante
// como se fosse reproduzivel, e nao sera — e o proximo a mexer vai ter que
// escolher entre confiar num numero que nao consegue refazer ou refazer a
// investigacao inteira. A regra do projeto ("protótipo vai pro git") existe
// justamente pra isso; ela so cumpre o proposito se o protótipo AINDA RODA.
import { describe, expect, it } from 'vitest'

import { MAPS } from './huntSpawnOverrides'

const BANCADAS = import.meta.glob('/scripts/harness/*.{mjs,js}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/**
 * Um mapId citado como string literal numa bancada.
 *
 * A busca e pelo FORMATO de mapId de hunt de bioma (`<chave>_e<N>` ou o antigo
 * `<chave>_faixa<N>`), e nao por toda string: uma bancada cita dezenas de
 * chaves de sub-bioma, id de especie e nome de arquivo, e nenhum deles precisa
 * existir em `MAPS`.
 */
const PADRAO = /'([a-z_]+_(?:e\d+|faixa\d))'/g

describe('as bancadas apontam pra hunts que existem', () => {
  it('a varredura achou o diretorio de bancadas', () => {
    // Guarda anti-vacuo: sem isto, um glob quebrado faria o teste abaixo passar
    // verde sem olhar nada — que e exatamente o modo de falha que ele existe
    // pra pegar.
    expect(Object.keys(BANCADAS).length).toBeGreaterThan(10)
  })

  it('nenhum mapId citado ficou pra tras no formato antigo', () => {
    const mortos: string[] = []
    for (const [caminho, fonte] of Object.entries(BANCADAS)) {
      for (const linha of fonte.split('\n')) {
        const limpo = linha.trim()
        // Comentario pode citar o id antigo — explicar o que mudou e util.
        if (limpo.startsWith('//') || limpo.startsWith('*')) continue
        for (const [, mapId] of limpo.matchAll(PADRAO)) {
          if (!MAPS[mapId]) mortos.push(`${caminho}: ${mapId}`)
        }
      }
    }
    expect(mortos, 'bancada pedindo hunt que nao existe').toEqual([])
  })
})
