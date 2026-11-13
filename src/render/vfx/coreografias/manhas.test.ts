import { MANHAS_POR_GOLPE } from './manhas'
import { testarFamilia } from './testeDeFamilia'

// Inscrita em REGISTRO_DE_STATUS (12/11).
testarFamilia('Manhas', {
  ids: ['confide', 'memento', 'tickle', 'play_nice', 'baby_doll_eyes', 'fake_tears', 'tearful_look'],
  golpes: MANHAS_POR_GOLPE,
  inscrita: true,
  status: true,
})
