import { VENTOS_EM_AREA_POR_GOLPE, VENTOS_POR_GOLPE } from './ventos'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Vento, vórtice e dreno', {
  ids: ['sonic_boom', 'hurricane', 'leaf_tornado', 'fire_spin', 'whirlpool', 'sand_tomb', 'infestation',
    'absorb', 'mega_drain', 'giga_drain', 'dream_eater', 'razor_wind'],
  golpes: VENTOS_POR_GOLPE,
  area: VENTOS_EM_AREA_POR_GOLPE,
  inscrita: true,
})
