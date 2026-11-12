import { ENERGIAS_POR_GOLPE } from './energias'
import { testarFamilia } from './testeDeFamilia'

// Inscrita em REGISTRO_DE_STATUS (12/11).
testarFamilia('Energias', {
  ids: ['cosmic_power', 'stockpile', 'charge', 'magnetic_flux', 'barrier', 'tail_glow'],
  golpes: ENERGIAS_POR_GOLPE,
  inscrita: true,
  status: true,
})
