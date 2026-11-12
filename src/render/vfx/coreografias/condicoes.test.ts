import { CONDICOES_POR_GOLPE } from './condicoes'
import { testarFamilia } from './testeDeFamilia'

// Inscrita em REGISTRO_DE_STATUS (12/11).
testarFamilia('Condições', {
  ids: ['thunder_wave', 'stun_spore', 'glare', 'poison_powder', 'toxic', 'toxic_thread', 'will_o_wisp'],
  golpes: CONDICOES_POR_GOLPE,
  inscrita: true,
  status: true,
})
