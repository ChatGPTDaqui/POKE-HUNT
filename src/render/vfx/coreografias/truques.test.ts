import { TRUQUES_POR_GOLPE } from './truques'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Truque sombrio', {
  ids: ['covet', 'thief', 'knock_off', 'punishment', 'payback', 'assurance', 'foul_play'],
  golpes: TRUQUES_POR_GOLPE,
  inscrita: true,
})
