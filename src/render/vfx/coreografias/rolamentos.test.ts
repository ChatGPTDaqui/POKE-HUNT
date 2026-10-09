import { FURIAS_POR_GOLPE } from './furias'
import { ROLAMENTOS_POR_GOLPE } from './rolamentos'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Rolamento', {
  ids: ['rollout', 'ice_ball', 'rapid_spin', 'gyro_ball', 'steamroller', 'flame_wheel'],
  golpes: ROLAMENTOS_POR_GOLPE,
  inscrita: true,
})

testarFamilia('Fúria', {
  ids: ['thrash', 'petal_dance'],
  golpes: FURIAS_POR_GOLPE,
  inscrita: true,
})
