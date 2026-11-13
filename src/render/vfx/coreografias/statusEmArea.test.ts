import { ABILITIES, isDamagingAbility } from '@/data/abilities'
import { describe, expect, it } from 'vitest'
import { STATUS_EM_AREA_POR_GOLPE } from './statusEmArea'
import { testarFamilia } from './testeDeFamilia'

// Inscrita em REGISTRO_DE_STATUS_DE_AREA (13/11).
testarFamilia('Status em área', {
  ids: ['growl', 'leer', 'tail_whip', 'sweet_scent', 'cotton_spore', 'string_shot', 'captivate', 'poison_gas', 'venom_drench', 'teeter_dance', 'heal_block'],
  golpes: {},
  area: STATUS_EM_AREA_POR_GOLPE,
  inscrita: true,
  status: true,
})

describe('Status em área cobre o catálogo', () => {
  it('todo golpe de status com alvo em área tem efeito próprio', () => {
    const doCatalogo = Object.values(ABILITIES).filter(a => !isDamagingAbility(a) && a.target === 'aoe').map(a => a.id).sort()
    expect(Object.keys(STATUS_EM_AREA_POR_GOLPE).sort()).toEqual(doCatalogo)
  })
})
