import { CHUTES_POR_GOLPE } from './chutes'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Chute e pisão', {
  ids: ['jump_kick', 'high_jump_kick', 'rolling_kick', 'triple_kick', 'low_kick', 'low_sweep', 'mega_kick', 'blaze_kick', 'stomp', 'stomping_tantrum'],
  golpes: CHUTES_POR_GOLPE,
  inscrita: true,
})
