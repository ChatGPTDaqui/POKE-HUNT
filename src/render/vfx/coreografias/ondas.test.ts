import { ONDAS_EM_AREA_POR_GOLPE, ONDAS_POR_GOLPE } from './ondas'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Tremor, onda e feixe', {
  ids: ['grass_knot', 'waterfall', 'freeze_dry', 'mirror_shot', 'aeroblast', 'zap_cannon', 'magnitude', 'muddy_water', 'origin_pulse'],
  golpes: ONDAS_POR_GOLPE,
  area: ONDAS_EM_AREA_POR_GOLPE,
  inscrita: true,
})
