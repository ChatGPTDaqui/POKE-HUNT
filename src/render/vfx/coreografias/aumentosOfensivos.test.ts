import { AUMENTOS_OFENSIVOS_POR_GOLPE } from './aumentosOfensivos'
import { testarFamilia } from './testeDeFamilia'

// Inscrita em REGISTRO_DE_STATUS (12/11).
testarFamilia('Aumentos ofensivos', {
  ids: ['swords_dance', 'howl', 'sharpen', 'meditate', 'hone_claws', 'work_up', 'nasty_plot'],
  golpes: AUMENTOS_OFENSIVOS_POR_GOLPE,
  inscrita: true,
  status: true,
})
