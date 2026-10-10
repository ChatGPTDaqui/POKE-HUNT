import { PEDRAS_EM_AREA_POR_GOLPE, PEDRAS_POR_GOLPE } from './pedras'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Pedra e cristal', {
  ids: ['smack_down', 'ancient_power', 'avalanche', 'precipice_blades'],
  golpes: PEDRAS_POR_GOLPE,
  area: PEDRAS_EM_AREA_POR_GOLPE,
  inscrita: true,
})
