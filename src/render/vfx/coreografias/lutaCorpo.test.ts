import { LUTA_EM_AREA_POR_GOLPE, LUTA_POR_GOLPE } from './lutaCorpo'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Luta corporal', {
  ids: ['double_slap', 'wake_up_slap', 'smelling_salts', 'arm_thrust', 'brick_break', 'revenge', 'counter', 'reversal',
    'endeavor', 'flail', 'vital_throw', 'circle_throw', 'storm_throw', 'seismic_toss', 'submission', 'superpower',
    'close_combat', 'fake_out', 'double_hit', 'rage', 'final_gambit', 'brutal_swing'],
  golpes: LUTA_POR_GOLPE,
  area: LUTA_EM_AREA_POR_GOLPE,
  inscrita: true,
})
