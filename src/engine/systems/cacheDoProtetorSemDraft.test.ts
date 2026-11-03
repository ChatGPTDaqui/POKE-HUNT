import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { contextoDeSpawn, contextoDoProtetor } from './salaSystem'

// Bug real (02/11/2026): 2.774 "Cannot perform 'get' on a proxy that has been
// revoked" em 20 dias, todos em /jogo. Sala sem pool proprio usa o
// `enemyPool` da hunt como pool — e dentro do tick esse array e um DRAFT do
// immer. Sem chefe nenhum no sub-bioma, `contextoDoProtetor` guardava o
// contexto inteiro no cache do modulo; o `set` terminava, o immer revogava o
// proxy, e o proximo chefe daquela sala lia um array morto.
describe('cache do protetor nao guarda draft do immer', () => {
  it('o contexto cacheado continua legivel depois que o draft e revogado', () => {
    const sala = { indice: 0, chave: 'chave-sem-chefe-de-teste', abates: 0, ciclos: 0 }
    const mundo = { enemyPool: ['enc-a', 'enc-b'] }
    produce(mundo, (draft) => {
      const ctx = contextoDeSpawn('mapa-de-teste-sem-pool', [5, 10], sala, draft.enemyPool)
      contextoDoProtetor('mapa-de-teste-sem-pool', ctx, sala, 'guardian')
    })
    const depois = contextoDoProtetor(
      'mapa-de-teste-sem-pool',
      contextoDeSpawn('mapa-de-teste-sem-pool', [5, 10], sala, mundo.enemyPool),
      sala,
      'guardian',
    )
    expect(() => [...depois.pool]).not.toThrow()
    expect(depois.pool).toEqual(['enc-a', 'enc-b'])
  })
})
