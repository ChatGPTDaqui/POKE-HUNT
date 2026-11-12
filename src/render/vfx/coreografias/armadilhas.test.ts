import { ABILITIES } from '@/data/abilities'
import { describe, expect, it } from 'vitest'
import { ARMADILHAS_POR_GOLPE } from './armadilhas'
import { testarFamilia } from './testeDeFamilia'

// Inscrita em REGISTRO_DE_STATUS (12/11, aprovada pelo dono no lab).
testarFamilia('Armadilhas', {
  ids: ['spikes', 'toxic_spikes', 'stealth_rock', 'sticky_web'],
  golpes: ARMADILHAS_POR_GOLPE,
  inscrita: true,
  status: true,
})

describe('Armadilhas cobre os golpes de armadilha do motor', () => {
  it('todo golpe com `hazard` tem plantio desenhado', () => {
    const doMotor = Object.values(ABILITIES).filter(a => a.hazard).map(a => a.id).sort()
    expect(Object.keys(ARMADILHAS_POR_GOLPE).sort()).toEqual(doMotor)
  })
})
