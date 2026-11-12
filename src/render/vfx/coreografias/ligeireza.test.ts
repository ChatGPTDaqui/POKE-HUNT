import { LIGEIREZA_POR_GOLPE } from './ligeireza'
import { testarFamilia } from './testeDeFamilia'

// Inscrita em REGISTRO_DE_STATUS (12/11).
testarFamilia('Ligeireza', {
  ids: ['agility', 'rock_polish', 'autotomize', 'double_team', 'minimize'],
  golpes: LIGEIREZA_POR_GOLPE,
  inscrita: true,
  status: true,
})
