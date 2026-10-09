import { PUNHOS_PESADOS_POR_GOLPE } from './punhosPesados'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Soco (Hammer Arm e Meteor Mash)', {
  ids: ['hammer_arm', 'meteor_mash'],
  golpes: PUNHOS_PESADOS_POR_GOLPE,
  inscrita: true,
})
