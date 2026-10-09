import { INVESTIDAS_POR_GOLPE } from './investidas'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Investida', {
  ids: ['tackle', 'quick_attack', 'extreme_speed', 'take_down', 'double_edge', 'body_slam', 'giga_impact',
    'high_horsepower', 'last_resort', 'retaliate', 'chip_away', 'facade', 'return', 'frustration', 'strength',
    'heavy_slam', 'u_turn', 'acrobatics'],
  golpes: INVESTIDAS_POR_GOLPE,
  inscrita: true,
})
