import { AUMENTOS_DEFENSIVOS_POR_GOLPE } from './aumentosDefensivos'
import { testarFamilia } from './testeDeFamilia'

// Inscrita em REGISTRO_DE_STATUS (12/11).
testarFamilia('Aumentos defensivos', {
  ids: ['harden', 'withdraw', 'defense_curl', 'iron_defense', 'acid_armor', 'cotton_guard', 'amnesia'],
  golpes: AUMENTOS_DEFENSIVOS_POR_GOLPE,
  inscrita: true,
  status: true,
})
