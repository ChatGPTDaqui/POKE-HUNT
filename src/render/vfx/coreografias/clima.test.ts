import { CLIMA_DO_GOLPE } from '@/data/abilities'
import { describe, expect, it } from 'vitest'
import { CLIMA_POR_GOLPE } from './clima'
import { testarFamilia } from './testeDeFamilia'

// Inscrita em REGISTRO_DE_STATUS (12/11, aprovada pelo dono no lab).
testarFamilia('Clima', {
  ids: ['rain_dance', 'sunny_day', 'hail', 'sandstorm'],
  golpes: CLIMA_POR_GOLPE,
  inscrita: true,
  status: true,
})

describe('Clima cobre os golpes de clima do motor', () => {
  it('todo golpe de CLIMA_DO_GOLPE tem invocação desenhada', () => {
    expect(Object.keys(CLIMA_POR_GOLPE).sort()).toEqual(Object.keys(CLIMA_DO_GOLPE).sort())
  })
})
