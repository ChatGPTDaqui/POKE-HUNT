import { LAMINAS_POR_GOLPE } from './laminas'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Lâmina', {
  ids: ['slash', 'night_slash', 'karate_chop', 'cross_chop', 'psycho_cut', 'aerial_ace', 'razor_shell', 'fury_cutter', 'cross_poison'],
  golpes: LAMINAS_POR_GOLPE,
  inscrita: true,
})
