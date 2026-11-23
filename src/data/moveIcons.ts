// Icone ilustrado por GOLPE, num unico atlas WebP (assets/move-icons-atlas.webp,
// grade de 19x18 celulas de 128px).
//
// Atlas e nao um arquivo por golpe de proposito: o Cloudflare Pages aceita no
// maximo 20.000 arquivos por deploy e o build ja passa de 19.500 — 520 arquivos
// novos derrubaram o deploy. A ordem de ATLAS define a celula de cada golpe
// (indice i -> coluna i % COLUNAS, linha i / COLUNAS); so acrescente no FIM e
// regenere o atlas na mesma ordem (ver assets/NOTAS-move-icons.txt).
//
// Golpe sem arte (status e nomes divergentes do catalogo) devolve null e o slot
// cai no icone do TIPO (abilityIcons.ts).
export const ATLAS_URL = 'assets/move-icons-atlas.webp'
export const COLUNAS = 19
export const LINHAS = 18

const ATLAS: readonly string[] = [
  'absorb', 'acid', 'acid_spray', 'acrobatics', 'aerial_ace', 'aeroblast',
  'air_cutter', 'air_slash', 'ancient_power', 'aqua_jet', 'aqua_tail', 'arm_thrust',
  'assurance', 'astonish', 'aura_sphere', 'aurora_beam', 'avalanche', 'barrage',
  'beat_up', 'belch', 'bide', 'bind', 'bite', 'blaze_kick',
  'blizzard', 'body_slam', 'bone_club', 'bone_rush', 'bonemerang', 'boomburst',
  'bounce', 'brave_bird', 'brick_break', 'brine', 'bubble', 'bubble_beam',
  'bug_bite', 'bug_buzz', 'bulldoze', 'bullet_punch', 'bullet_seed', 'burn_up',
  'charge_beam', 'chip_away', 'circle_throw', 'clamp', 'clear_smog', 'close_combat',
  'comet_punch', 'confusion', 'constrict', 'counter', 'covet', 'crabhammer',
  'cross_chop', 'cross_poison', 'crunch', 'crush_claw', 'dark_pulse', 'dig',
  'disarming_voice', 'discharge', 'dive', 'dizzy_punch', 'doom_desire', 'double_edge',
  'double_hit', 'double_kick', 'double_slap', 'dragon_breath', 'dragon_claw', 'dragon_pulse',
  'dragon_rage', 'dragon_rush', 'dragon_tail', 'draining_kiss', 'dream_eater', 'drill_peck',
  'drill_run', 'dual_chop', 'dynamic_punch', 'earth_power', 'earthquake', 'echoed_voice',
  'egg_bomb', 'electro_ball', 'ember', 'endeavor', 'energy_ball', 'eruption',
  'explosion', 'extrasensory', 'extreme_speed', 'fairy_wind', 'fake_out', 'false_swipe',
  'feint', 'feint_attack', 'fell_stinger', 'final_gambit', 'fire_blast', 'fire_fang',
  'fire_punch', 'fire_spin', 'fissure', 'flail', 'flame_burst', 'flame_charge',
  'flame_wheel', 'flamethrower', 'flare_blitz', 'flash_cannon', 'fling', 'fly',
  'focus_punch', 'force_palm', 'foul_play', 'freeze_dry', 'frost_breath', 'fury_attack',
  'fury_cutter', 'fury_swipes', 'future_sight', 'giga_drain', 'giga_impact', 'guillotine',
  'gunk_shot', 'gust', 'gyro_ball', 'hammer_arm', 'head_smash', 'headbutt',
  'heart_stamp', 'heat_wave', 'heavy_slam', 'hex', 'hidden_power', 'high_horsepower',
  'high_jump_kick', 'horn_attack', 'horn_drill', 'hurricane', 'hydro_pump', 'hyper_beam',
  'hyper_fang', 'hyper_voice', 'ice_ball', 'ice_beam', 'ice_fang', 'ice_punch',
  'ice_shard', 'icicle_crash', 'icicle_spear', 'icy_wind', 'incinerate', 'inferno',
  'infestation', 'iron_head', 'iron_tail', 'jump_kick', 'karate_chop', 'knock_off',
  'last_resort', 'lava_plume', 'leaf_blade', 'leaf_storm', 'leaf_tornado', 'leech_life',
  'lick', 'low_kick', 'low_sweep', 'luster_purge', 'mach_punch', 'magical_leaf',
  'magnet_bomb', 'magnitude', 'mega_drain', 'mega_kick', 'mega_punch', 'megahorn',
  'metal_burst', 'metal_claw', 'meteor_mash', 'mirror_coat', 'mirror_shot', 'mist_ball',
  'moonblast', 'mud_bomb', 'mud_shot', 'mud_slap', 'muddy_water', 'natural_gift',
  'needle_arm', 'night_shade', 'night_slash', 'nuzzle', 'octazooka', 'ominous_wind',
  'origin_pulse', 'outrage', 'pay_day', 'payback', 'peck', 'petal_blizzard',
  'petal_dance', 'phantom_force', 'pin_missile', 'play_rough', 'pluck', 'poison_fang',
  'poison_jab', 'poison_sting', 'poison_tail', 'pound', 'powder_snow', 'power_gem',
  'power_whip', 'precipice_blades', 'present', 'psybeam', 'psychic', 'psycho_boost',
  'psycho_cut', 'psyshock', 'psystrike', 'psywave', 'punishment', 'pursuit',
  'quick_attack', 'rage', 'rapid_spin', 'razor_leaf', 'razor_shell', 'razor_wind',
  'retaliate', 'revenge', 'reversal', 'rock_blast', 'rock_slide', 'rock_throw',
  'rock_tomb', 'rolling_kick', 'rollout', 'round', 'sacred_fire', 'sand_tomb',
  'scratch', 'seed_bomb', 'seismic_toss', 'self_destruct', 'shadow_ball', 'shadow_claw',
  'shadow_punch', 'shadow_sneak', 'sheer_cold', 'shock_wave', 'signal_beam', 'silver_wind',
  'skull_bash', 'sky_attack', 'sky_drop', 'sky_uppercut', 'slam', 'slash',
  'sludge', 'sludge_bomb', 'sludge_wave', 'smack_down', 'smelling_salts', 'smog',
  'snarl', 'snore', 'solar_beam', 'sonic_boom', 'spark', 'spike_cannon',
  'spit_up', 'steamroller', 'steel_wing', 'stomp', 'stomping_tantrum', 'stone_edge',
  'stored_power', 'storm_throw', 'strength', 'struggle_bug', 'submission', 'sucker_punch',
  'super_fang', 'superpower', 'swift', 'synchronoise', 'tackle', 'take_down',
  'thief', 'thrash', 'thunder', 'thunder_fang', 'thunder_punch', 'thunder_shock',
  'thunderbolt', 'tri_attack', 'triple_kick', 'trump_card', 'twineedle', 'twister',
  'u_turn', 'uproar', 'vacuum_wave', 'venoshock', 'vine_whip', 'vital_throw',
  'wake_up_slap', 'water_gun', 'water_pulse', 'water_spout', 'waterfall', 'weather_ball',
  'whirlpool', 'wild_charge', 'wing_attack', 'wood_hammer', 'wrap', 'wring_out',
  'x_scissor', 'zap_cannon', 'zen_headbutt',
]

const INDICE: ReadonlyMap<string, number> = new Map(ATLAS.map((id, i) => [id, i]))

export interface IconeDeGolpe {
  url: string
  /** Estilo CSS (background) que recorta a celula do golpe num elemento quadrado. */
  estilo: {
    backgroundImage: string
    backgroundSize: string
    backgroundPosition: string
    backgroundRepeat: 'no-repeat'
  }
}

/** Icone do golpe (pelo `id` do catalogo), ou `null` se nao tiver arte. */
export function moveIcon(idDoGolpe: string | null | undefined): IconeDeGolpe | null {
  if (!idDoGolpe) return null
  const i = INDICE.get(idDoGolpe)
  if (i === undefined) return null
  const col = i % COLUNAS
  const lin = Math.floor(i / COLUNAS)
  return {
    url: ATLAS_URL,
    estilo: {
      backgroundImage: `url(${ATLAS_URL})`,
      backgroundSize: `${COLUNAS * 100}% ${LINHAS * 100}%`,
      backgroundPosition: `${(col / (COLUNAS - 1)) * 100}% ${(lin / (LINHAS - 1)) * 100}%`,
      backgroundRepeat: 'no-repeat',
    },
  }
}

/** Ids com arte, na ordem do atlas — usado pelo teste. */
export function golpesComIcone(): readonly string[] {
  return ATLAS
}
