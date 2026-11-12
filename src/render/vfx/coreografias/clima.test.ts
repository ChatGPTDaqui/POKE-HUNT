import { CLIMA_DO_GOLPE } from '@/data/abilities'
import { describe, expect, it } from 'vitest'
import { CLIMA_POR_GOLPE } from './clima'
import { testarFamilia } from './testeDeFamilia'

// Fora do registro até o dono aprovar a família no lab (trocar para
// `inscrita: true` junto da inscrição em REGISTRO_DE_STATUS — que também pede
// o motor criar o efeito em quem invocou o clima).
testarFamilia('Clima', {
  ids: ['rain_dance', 'sunny_day', 'hail', 'sandstorm'],
  golpes: CLIMA_POR_GOLPE,
  inscrita: false,
  status: true,
})

describe('Clima cobre os golpes de clima do motor', () => {
  it('todo golpe de CLIMA_DO_GOLPE tem invocação desenhada', () => {
    expect(Object.keys(CLIMA_POR_GOLPE).sort()).toEqual(Object.keys(CLIMA_DO_GOLPE).sort())
  })
})
