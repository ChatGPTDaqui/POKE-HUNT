import { CABECADAS_POR_GOLPE, INVESTIDAS_ELEMENTAIS_POR_GOLPE } from './cargas'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Investida elemental', {
  ids: ['wild_charge', 'spark', 'volt_switch', 'flare_blitz', 'flame_charge', 'aqua_jet', 'dragon_rush'],
  golpes: INVESTIDAS_ELEMENTAIS_POR_GOLPE,
  inscrita: true,
})

testarFamilia('Cabeçada', {
  ids: ['skull_bash', 'zen_headbutt', 'iron_head', 'head_smash', 'wood_hammer'],
  golpes: CABECADAS_POR_GOLPE,
  inscrita: true,
})
