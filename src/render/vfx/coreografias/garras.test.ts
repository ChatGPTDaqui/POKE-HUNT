import { GARRAS_POR_GOLPE } from './garras'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Garra', {
  ids: ['scratch', 'fury_swipes', 'crush_claw', 'metal_claw', 'shadow_claw', 'dragon_claw', 'false_swipe'],
  golpes: GARRAS_POR_GOLPE,
  inscrita: true,
})
