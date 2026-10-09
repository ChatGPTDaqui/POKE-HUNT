import { APERTOS_POR_GOLPE } from './apertos'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Aperto e pinça', {
  ids: ['wrap', 'bind', 'constrict', 'wring_out', 'clamp', 'vice_grip', 'crabhammer'],
  golpes: APERTOS_POR_GOLPE,
  inscrita: true,
})
