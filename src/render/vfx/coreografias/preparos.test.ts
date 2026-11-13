import { PREPAROS_POR_GOLPE } from './preparos'
import { testarFamilia } from './testeDeFamilia'

// Inscrita em REGISTRO_DE_STATUS (13/11). O motor marca quem recebe o desenho
// (`statusRecebeuEm`) em cada ramo por id — ver suporteTemEfeito.test.ts.
testarFamilia('Preparos', {
  ids: ['substitute', 'focus_energy', 'laser_focus', 'magnet_rise', 'ingrain', 'aqua_ring', 'belly_drum', 'acupressure', 'destiny_bond',
    'psych_up', 'aromatherapy', 'heal_bell', 'trick_room', 'haze', 'perish_song'],
  golpes: PREPAROS_POR_GOLPE,
  inscrita: true,
  status: true,
})
