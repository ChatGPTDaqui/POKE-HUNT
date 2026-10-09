import { CAUDAS_POR_GOLPE } from './caudas'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Cauda, asa e chicote', {
  ids: ['power_whip', 'slam', 'aqua_tail', 'poison_tail', 'dragon_tail', 'steel_wing', 'wing_attack', 'needle_arm'],
  golpes: CAUDAS_POR_GOLPE,
  inscrita: true,
})
