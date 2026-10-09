import { PERFURAR_POR_GOLPE } from './perfurar'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Chifre, ferrão e bico', {
  ids: ['horn_attack', 'fury_attack', 'peck', 'pluck', 'drill_run', 'poison_jab', 'twineedle', 'fell_stinger', 'smart_strike'],
  golpes: PERFURAR_POR_GOLPE,
  inscrita: true,
})
