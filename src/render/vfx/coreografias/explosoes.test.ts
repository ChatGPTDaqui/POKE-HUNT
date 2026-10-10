import { EXPLOSOES_EM_AREA_POR_GOLPE, EXPLOSOES_POR_GOLPE } from './explosoes'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Explosão', {
  ids: ['overheat', 'burn_up', 'inferno', 'self_destruct', 'lava_plume',
    'aoe50_fire', 'aoe50_water', 'aoe50_electric', 'aoe50_grass', 'aoe50_normal'],
  golpes: EXPLOSOES_POR_GOLPE,
  area: EXPLOSOES_EM_AREA_POR_GOLPE,
  inscrita: true,
})
