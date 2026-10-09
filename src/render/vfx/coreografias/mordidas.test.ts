import { MORDIDAS_POR_GOLPE } from './mordidas'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Mordida', {
  ids: ['bite', 'crunch', 'hyper_fang', 'super_fang', 'thunder_fang', 'ice_fang', 'fire_fang', 'poison_fang', 'bug_bite', 'leech_life'],
  golpes: MORDIDAS_POR_GOLPE,
  inscrita: true,
})
