import { ABILITIES } from '@/data/abilities'
import { describe, expect, it } from 'vitest'
import { ARMADILHAS_POR_GOLPE } from './armadilhas'
import { testarFamilia } from './testeDeFamilia'

// Fora do registro até o dono aprovar a família no lab (trocar para
// `inscrita: true` junto da inscrição em REGISTRO_DE_STATUS — que também pede
// o motor criar o efeito no plantio e o resolver NÃO ancorar em quem usou).
testarFamilia('Armadilhas', {
  ids: ['spikes', 'toxic_spikes', 'stealth_rock', 'sticky_web'],
  golpes: ARMADILHAS_POR_GOLPE,
  inscrita: false,
  status: true,
})

describe('Armadilhas cobre os golpes de armadilha do motor', () => {
  it('todo golpe com `hazard` tem plantio desenhado', () => {
    const doMotor = Object.values(ABILITIES).filter(a => a.hazard).map(a => a.id).sort()
    expect(Object.keys(ARMADILHAS_POR_GOLPE).sort()).toEqual(doMotor)
  })
})
