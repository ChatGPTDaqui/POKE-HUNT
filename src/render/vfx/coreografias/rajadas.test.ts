import { RAJADAS_POR_GOLPE } from './rajadas'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Rajada de projéteis', {
  ids: ['bullet_seed', 'rock_blast', 'spike_cannon', 'icicle_spear', 'barrage', 'bone_rush', 'fling', 'present',
    'hidden_power', 'pay_day', 'bonemerang', 'bone_club'],
  golpes: RAJADAS_POR_GOLPE,
  inscrita: true,
})
