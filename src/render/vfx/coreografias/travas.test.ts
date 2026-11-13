import { TRAVAS_POR_GOLPE } from './travas'
import { testarFamilia } from './testeDeFamilia'

// Inscrita em REGISTRO_DE_STATUS (13/11).
testarFamilia('Travas', {
  ids: ['disable', 'torment', 'spite', 'encore'],
  golpes: TRAVAS_POR_GOLPE,
  inscrita: true,
  status: true,
})
