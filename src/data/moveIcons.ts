// Icone ilustrado por GOLPE (128x128 WebP em assets/move-icons/<id>.webp).
//
// O slot de golpe mostra este icone quando o golpe tem arte; sem ele, cai no
// icone do TIPO (abilityIcons.ts). Golpes de status e alguns nomes divergentes
// do catalogo nao tem arte propria. A lista abaixo e o que existe em disco —
// ela evita um 404 por golpe sem arte; moveIcons.test.ts confere lista x disco.
const RAIZ = 'assets/move-icons'

const COM_ICONE: ReadonlySet<string> = new Set([
  'absorb', 'accelerock', 'acid', 'acid_spray', 'acrobatics', 'aerial_ace',
  'aeroblast', 'air_cutter', 'air_slash', 'anchor_shot', 'ancient_power', 'apple_acid',
  'aqua_jet', 'aqua_tail', 'arm_thrust', 'assurance', 'astonish', 'astral_barrage',
  'attack_order', 'aura_sphere', 'aura_wheel', 'aurora_beam', 'avalanche', 'baddy_bad',
  'barb_barrage', 'barrage', 'beak_blast', 'beat_up', 'behemoth_bash', 'behemoth_blade',
  'belch', 'bide', 'bind', 'bite', 'bitter_malice', 'blast_burn',
  'blaze_kick', 'bleakwind_storm', 'blizzard', 'blue_flare', 'body_press', 'body_slam',
  'bolt_beak', 'bolt_strike', 'bone_club', 'bone_rush', 'bonemerang', 'boomburst',
  'bounce', 'bouncy_bubble', 'branch_poke', 'brave_bird', 'breaking_swipe', 'brick_break',
  'brine', 'brutal_swing', 'bubble', 'bubble_beam', 'bug_bite', 'bug_buzz',
  'bulldoze', 'bullet_punch', 'bullet_seed', 'burn_up', 'burning_jealousy', 'buzzy_buzz',
  'ceaseless_edge', 'charge_beam', 'chatter', 'chip_away', 'chloroblast', 'circle_throw',
  'clamp', 'clanging_scales', 'clear_smog', 'close_combat', 'comet_punch', 'confusion',
  'constrict', 'core_enforcer', 'counter', 'covet', 'crabhammer', 'cross_chop',
  'cross_poison', 'crunch', 'crush_claw', 'crush_grip', 'cut', 'dark_pulse',
  'darkest_lariat', 'dazzling_gleam', 'diamond_storm', 'dig', 'dire_claw', 'disarming_voice',
  'discharge', 'dive', 'dizzy_punch', 'doom_desire', 'double_edge', 'double_hit',
  'double_iron_bash', 'double_kick', 'double_slap', 'draco_meteor', 'dragon_ascent', 'dragon_breath',
  'dragon_claw', 'dragon_darts', 'dragon_energy', 'dragon_hammer', 'dragon_pulse', 'dragon_rage',
  'dragon_rush', 'dragon_tail', 'drain_punch', 'draining_kiss', 'dream_eater', 'drill_peck',
  'drill_run', 'drum_beating', 'dual_chop', 'dual_wingbeat', 'dynamax_cannon', 'dynamic_punch',
  'earth_power', 'earthquake', 'echoed_voice', 'eerie_spell', 'egg_bomb', 'electro_ball',
  'electroweb', 'ember', 'endeavor', 'energy_ball', 'eruption', 'esper_wing',
  'eternabeam', 'expanding_force', 'explosion', 'extrasensory', 'extreme_speed', 'facade',
  'fairy_wind', 'fake_out', 'false_surrender', 'false_swipe', 'feint', 'feint_attack',
  'fell_stinger', 'fiery_dance', 'fiery_wrath', 'final_gambit', 'fire_blast', 'fire_fang',
  'fire_lash', 'fire_pledge', 'fire_punch', 'fire_spin', 'first_impression', 'fishious_rend',
  'fissure', 'flail', 'flame_burst', 'flame_charge', 'flame_wheel', 'flamethrower',
  'flare_blitz', 'flash_cannon', 'fleur_cannon', 'fling', 'flip_turn', 'floaty_fall',
  'fly', 'flying_press', 'focus_blast', 'focus_punch', 'force_palm', 'foul_play',
  'freeze_dry', 'freeze_shock', 'freezing_glare', 'freezy_frost', 'frenzy_plant', 'frost_breath',
  'frustration', 'fury_attack', 'fury_cutter', 'fury_swipes', 'fusion_bolt', 'fusion_flare',
  'future_sight', 'gear_grind', 'giga_drain', 'giga_impact', 'glacial_lance', 'glaciate',
  'glitzy_glow', 'grass_knot', 'grass_pledge', 'grassy_glide', 'grav_apple', 'guillotine',
  'gunk_shot', 'gust', 'gyro_ball', 'hammer_arm', 'head_charge', 'head_smash',
  'headbutt', 'headlong_rush', 'heart_stamp', 'heat_crash', 'heat_wave', 'heavy_slam',
  'hex', 'hidden_power', 'high_horsepower', 'high_jump_kick', 'hold_back', 'horn_attack',
  'horn_drill', 'horn_leech', 'hurricane', 'hydro_cannon', 'hydro_pump', 'hyper_beam',
  'hyper_fang', 'hyper_voice', 'hyperspace_fury', 'hyperspace_hole', 'ice_ball', 'ice_beam',
  'ice_burn', 'ice_fang', 'ice_hammer', 'ice_punch', 'ice_shard', 'icicle_crash',
  'icicle_spear', 'icy_wind', 'incinerate', 'infernal_parade', 'inferno', 'infestation',
  'iron_head', 'iron_tail', 'jaw_lock', 'judgment', 'jump_kick', 'karate_chop',
  'knock_off', 'land_s_wrath', 'lash_out', 'last_resort', 'lava_plume', 'leaf_blade',
  'leaf_storm', 'leaf_tornado', 'leafage', 'leech_life', 'lick', 'light_of_ruin',
  'liquidation', 'low_kick', 'low_sweep', 'lunge', 'luster_purge', 'mach_punch',
  'magical_leaf', 'magma_storm', 'magnet_bomb', 'magnitude', 'mega_drain', 'mega_kick',
  'mega_punch', 'megahorn', 'metal_burst', 'metal_claw', 'meteor_assault', 'meteor_beam',
  'meteor_mash', 'mind_blown', 'mirror_coat', 'mirror_shot', 'mist_ball', 'misty_explosion',
  'moonblast', 'moongeist_beam', 'mountain_gale', 'mud_bomb', 'mud_shot', 'mud_slap',
  'muddy_water', 'multi_attack', 'mystical_fire', 'mystical_power', 'natural_gift', 'nature_s_madness',
  'needle_arm', 'night_daze', 'night_shade', 'night_slash', 'nuzzle', 'oblivion_wing',
  'octazooka', 'ominous_wind', 'origin_pulse', 'outrage', 'overdrive', 'overheat',
  'parabolic_charge', 'pay_day', 'payback', 'peck', 'petal_blizzard', 'petal_dance',
  'phantom_force', 'photon_geyser', 'pika_papow', 'pin_missile', 'plasma_fists', 'play_rough',
  'pluck', 'poison_fang', 'poison_jab', 'poison_sting', 'poison_tail', 'pollen_puff',
  'poltergeist', 'pound', 'powder_snow', 'power_gem', 'power_trip', 'power_up_punch',
  'power_whip', 'precipice_blades', 'present', 'prismatic_laser', 'psybeam', 'psychic',
  'psychic_fangs', 'psycho_boost', 'psycho_cut', 'psyshield_bash', 'psyshock', 'psystrike',
  'psywave', 'punishment', 'pursuit', 'pyro_ball', 'quick_attack', 'rage',
  'raging_fury', 'rapid_spin', 'razor_leaf', 'razor_shell', 'razor_wind', 'relic_song',
  'retaliate', 'return', 'revelation_dance', 'revenge', 'reversal', 'rising_voltage',
  'roar_of_time', 'rock_blast', 'rock_climb', 'rock_slide', 'rock_smash', 'rock_throw',
  'rock_tomb', 'rock_wrecker', 'rolling_kick', 'rollout', 'round', 'sacred_fire',
  'sacred_sword', 'sand_tomb', 'sandsear_storm', 'sappy_seed', 'scald', 'scale_shot',
  'scorching_sands', 'scratch', 'searing_shot', 'secret_power', 'secret_sword', 'seed_bomb',
  'seed_flare', 'seismic_toss', 'self_destruct', 'shadow_ball', 'shadow_bone', 'shadow_claw',
  'shadow_force', 'shadow_punch', 'shadow_sneak', 'sheer_cold', 'shell_side_arm', 'shell_trap',
  'shock_wave', 'signal_beam', 'silver_wind', 'sizzly_slide', 'skitter_smack', 'skull_bash',
  'sky_attack', 'sky_drop', 'sky_uppercut', 'slam', 'slash', 'sludge',
  'sludge_bomb', 'sludge_wave', 'smack_down', 'smart_strike', 'smelling_salts', 'smog',
  'snap_trap', 'snarl', 'snipe_shot', 'snore', 'solar_beam', 'solar_blade',
  'sonic_boom', 'spacial_rend', 'spark', 'sparkling_aria', 'sparkly_swirl', 'spectral_thief',
  'spike_cannon', 'spirit_break', 'spirit_shackle', 'spit_up', 'splishy_splash', 'springtide_storm',
  'steam_eruption', 'steamroller', 'steel_beam', 'steel_roller', 'steel_wing', 'stomp',
  'stomping_tantrum', 'stone_axe', 'stone_edge', 'stored_power', 'storm_throw', 'strange_steam',
  'strength', 'struggle', 'struggle_bug', 'submission', 'sucker_punch', 'sunsteel_strike',
  'super_fang', 'superpower', 'surf', 'surging_strikes', 'swift', 'synchronoise',
  'tackle', 'tail_slap', 'take_down', 'techno_blast', 'terrain_pulse', 'thief',
  'thousand_arrows', 'thousand_waves', 'thrash', 'throat_chop', 'thunder', 'thunder_cage',
  'thunder_fang', 'thunder_punch', 'thunder_shock', 'thunderbolt', 'thunderous_kick', 'tri_attack',
  'triple_arrows', 'triple_axel', 'triple_kick', 'trop_kick', 'trump_card', 'twineedle',
  'twister', 'u_turn', 'uproar', 'v_create', 'vacuum_wave', 'veevee_volley',
  'venoshock', 'vine_whip', 'vise_grip', 'vital_throw', 'volt_switch', 'volt_tackle',
  'wake_up_slap', 'water_gun', 'water_pledge', 'water_pulse', 'water_shuriken', 'water_spout',
  'waterfall', 'wave_crash', 'weather_ball', 'whirlpool', 'wicked_blow', 'wild_charge',
  'wildbolt_storm', 'wing_attack', 'wood_hammer', 'wrap', 'wring_out', 'x_scissor',
  'zap_cannon', 'zen_headbutt', 'zing_zap', 'zippy_zap',
])

/** URL do icone do golpe (pelo `id` do catalogo), ou `null` se nao tiver arte. */
export function moveIconUrl(idDoGolpe: string | null | undefined): string | null {
  if (!idDoGolpe || !COM_ICONE.has(idDoGolpe)) return null
  return `${RAIZ}/${idDoGolpe}.webp`
}

/** Ids com arte — usado pelo teste. */
export function golpesComIcone(): string[] {
  return [...COM_ICONE]
}
