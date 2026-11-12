import { BARREIRAS_POR_GOLPE } from './barreiras'
import { testarFamilia } from './testeDeFamilia'

// Inscrita em REGISTRO_DE_STATUS (12/11, aprovada pelo dono no lab).
testarFamilia('Barreiras', {
  ids: ['protect', 'detect', 'endure', 'wide_guard', 'reflect', 'light_screen', 'safeguard', 'mist', 'lucky_chant', 'aurora_veil'],
  golpes: BARREIRAS_POR_GOLPE,
  inscrita: true,
  status: true,
})
