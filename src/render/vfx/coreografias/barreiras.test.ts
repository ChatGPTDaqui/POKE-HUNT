import { BARREIRAS_POR_GOLPE } from './barreiras'
import { testarFamilia } from './testeDeFamilia'

// Fora do registro até o dono aprovar a família no lab (trocar para
// `inscrita: true` junto da inscrição — que também pede o resolver aceitar
// golpe de status).
testarFamilia('Barreiras', {
  ids: ['protect', 'detect', 'endure', 'wide_guard', 'reflect', 'light_screen', 'safeguard', 'mist', 'lucky_chant', 'aurora_veil'],
  golpes: BARREIRAS_POR_GOLPE,
  inscrita: false,
  status: true,
})
