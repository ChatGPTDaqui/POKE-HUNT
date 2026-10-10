import { SONS_EM_AREA_POR_GOLPE, SONS_POR_GOLPE } from './sons'
import { MENTES_POR_GOLPE } from './mentes'
import { LUZES_EM_AREA_POR_GOLPE, LUZES_POR_GOLPE } from './luzes'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Som', {
  ids: ['uproar', 'echoed_voice', 'snore', 'round', 'bug_buzz', 'boomburst'],
  golpes: SONS_POR_GOLPE, area: SONS_EM_AREA_POR_GOLPE, inscrita: true,
})

testarFamilia('Força mental', {
  ids: ['extrasensory', 'psyshock', 'psywave', 'psycho_boost', 'future_sight', 'stored_power', 'heart_stamp', 'mirror_coat', 'doom_desire'],
  golpes: MENTES_POR_GOLPE, inscrita: true,
})

testarFamilia('Luz e brilho', {
  ids: ['nuzzle', 'tri_attack', 'sacred_fire', 'dazzling_gleam'],
  golpes: LUZES_POR_GOLPE, area: LUZES_EM_AREA_POR_GOLPE, inscrita: true,
})
