import { PRAGAS_POR_GOLPE } from './pragas'
import { testarFamilia } from './testeDeFamilia'

// Inscrita em REGISTRO_DE_STATUS (13/11). O motor marca quem recebe o desenho
// (`statusRecebeuEm`) em cada ramo por id — ver suporteTemEfeito.test.ts.
testarFamilia('Pragas', {
  ids: ['leech_seed', 'nightmare', 'curse', 'embargo', 'quash', 'roar', 'yawn', 'soak', 'lock_on', 'mind_reader', 'psycho_shift', 'guard_swap', 'power_swap'],
  golpes: PRAGAS_POR_GOLPE,
  inscrita: true,
  status: true,
})
