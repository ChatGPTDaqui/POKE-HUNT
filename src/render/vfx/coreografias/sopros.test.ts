import { SOPROS_POR_GOLPE } from './sopros'
import { NEVOAS_EM_AREA_POR_GOLPE, NEVOAS_POR_GOLPE } from './nevoas'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Jato e sopro', {
  ids: ['brine', 'frost_breath', 'acid_spray', 'belch', 'dragon_rage'],
  golpes: SOPROS_POR_GOLPE,
  inscrita: true,
})

testarFamilia('Nuvem, pó e assombração', {
  ids: ['smog', 'clear_smog', 'venoshock', 'astonish', 'hex', 'night_shade', 'ominous_wind', 'silver_wind', 'powder_snow'],
  golpes: NEVOAS_POR_GOLPE,
  area: NEVOAS_EM_AREA_POR_GOLPE,
  inscrita: true,
})
