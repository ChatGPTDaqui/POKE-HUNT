import { CONFUSAO_POR_GOLPE } from './confusao'
import { testarFamilia } from './testeDeFamilia'

// Inscrita em REGISTRO_DE_STATUS (12/11).
testarFamilia('Confusão', {
  ids: ['supersonic', 'confuse_ray', 'sweet_kiss', 'swagger', 'flatter'],
  golpes: CONFUSAO_POR_GOLPE,
  inscrita: true,
  status: true,
})
