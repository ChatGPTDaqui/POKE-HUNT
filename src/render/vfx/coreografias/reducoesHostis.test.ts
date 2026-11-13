import { REDUCOES_HOSTIS_POR_GOLPE } from './reducoesHostis'
import { testarFamilia } from './testeDeFamilia'

// Inscrita em REGISTRO_DE_STATUS (12/11).
testarFamilia('Reduções hostis', {
  ids: ['scary_face', 'screech', 'metal_sound', 'eerie_impulse', 'smokescreen', 'sand_attack', 'kinesis', 'feather_dance'],
  golpes: REDUCOES_HOSTIS_POR_GOLPE,
  inscrita: true,
  status: true,
})
