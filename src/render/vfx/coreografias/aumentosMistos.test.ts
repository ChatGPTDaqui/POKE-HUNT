import { AUMENTOS_MISTOS_POR_GOLPE } from './aumentosMistos'
import { testarFamilia } from './testeDeFamilia'

// Inscrita em REGISTRO_DE_STATUS (12/11).
testarFamilia('Aumentos mistos', {
  ids: ['dragon_dance', 'quiver_dance', 'calm_mind', 'bulk_up', 'coil', 'growth', 'shell_smash'],
  golpes: AUMENTOS_MISTOS_POR_GOLPE,
  inscrita: true,
  status: true,
})
