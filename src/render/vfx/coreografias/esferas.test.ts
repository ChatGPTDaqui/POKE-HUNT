import { ESFERAS_POR_GOLPE } from './esferas'
import { testarFamilia } from './testeDeFamilia'

testarFamilia('Esfera / bomba', {
  ids: ['energy_ball', 'aura_sphere', 'focus_blast', 'electro_ball', 'weather_ball', 'mist_ball', 'luster_purge',
    'seed_bomb', 'egg_bomb', 'mud_bomb', 'octazooka', 'vacuum_wave'],
  golpes: ESFERAS_POR_GOLPE,
  inscrita: true,
})
