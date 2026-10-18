// Qual pose do acervo PMD cada golpe toca (pedido do dono, 18/10/2026:
// "os pokemons que tem sprite de chute, podemos utilizar em golpes de chute").
//
// Cada golpe cai numa FAMILIA (chute, soco, mordida, cauda, som...) e a familia
// e uma lista de poses da mais fiel pra mais generica. A especie toca a
// primeira que TEM arte; sem nenhuma, a pose de sempre do modo (Shoot/Charge no
// livre, Attack no duelo). As poses especificas cobrem poucas especies (Chute
// 6/380, Soco 14/380); as genericas seguram o resto: Strike 274/380 pra golpe
// fisico de contato, SpAttack 81/380 pra especial de alvo unico.
//
// RODA NO SERVIDOR TAMBEM. A pose decide o apice e o impacto
// (engine/tempoDoGolpe.ts), e o servidor re-simula o golpe: as duas pontas
// precisam escolher a MESMA pose, entao a escolha depende so de especie, golpe e
// modo — nunca de imagem carregada ou de preferencia do navegador.
import { BATTLE_SPRITE_ANIMS, type AnimName } from '@/data/battleSpriteAnims'
import type { Ability } from '@/data/abilities'

export type FamiliaDePose =
  | 'chute' | 'soco' | 'golpe_de_mao' | 'mordida' | 'garra' | 'varios_golpes' | 'investida_rapida'
  | 'esmagar' | 'cabecada' | 'cauda_ou_asa' | 'lambida' | 'canto' | 'som' | 'gas' | 'choque'
  | 'chao' | 'giro' | 'danca' | 'defesa' | 'furia' | 'contato' | 'especial' | 'padrao'

/** Da mais fiel pra mais generica. `null` no fim = a pose de sempre do modo. */
export const POSES_DA_FAMILIA: Record<FamiliaDePose, readonly AnimName[]> = {
  chute: ['Kick', 'Stomp', 'Strike'],
  soco: ['Punch', 'Jab', 'Uppercut', 'Strike'],
  golpe_de_mao: ['Chop', 'Slice', 'Strike'],
  mordida: ['Bite', 'Strike'],
  garra: ['Scratch', 'MultiScratch', 'Slice', 'Strike'],
  varios_golpes: ['MultiStrike', 'Double', 'Strike'],
  investida_rapida: ['QuickStrike', 'Strike'],
  esmagar: ['Slam', 'Strike'],
  cabecada: ['Head', 'Strike'],
  cauda_ou_asa: ['Swing'],
  lambida: ['Lick', 'Strike'],
  canto: ['Sing', 'Sound'],
  som: ['Sound'],
  gas: ['Gas', 'SpAttack'],
  choque: ['Shock', 'SpAttack'],
  chao: ['HitGround', 'Stomp'],
  giro: ['Rotate', 'Twirl'],
  danca: ['Dance', 'Twirl'],
  defesa: ['Withdraw'],
  furia: ['Rumble', 'Strike'],
  contato: ['Strike'],
  especial: ['SpAttack'],
  padrao: [],
}

// Por id do golpe, na ordem: a primeira regra que casa vence (`stomp` e chute,
// nao chao; `mach_punch` e soco, nao investida rapida).
const REGRAS: readonly (readonly [FamiliaDePose, RegExp])[] = [
  ['chute', /kick|^stomp$|^trample$/],
  ['soco', /punch|^sky_uppercut$/],
  ['golpe_de_mao', /chop|^brick_break$/],
  ['mordida', /bite|fang|^crunch$/],
  ['garra', /scratch|claw|slash|^fury_swipes$|^cut$|^false_swipe$|^leaf_blade$|^x_scissor$|^fury_cutter$|^aerial_ace$/],
  ['varios_golpes', /^fury_attack$|^double_slap$|^twineedle$|^double_hit$|^arm_thrust$/],
  ['investida_rapida', /^quick_attack$|^extreme_speed$|^feint$|^feint_attack$|^aqua_jet$|^shadow_sneak$|^vacuum_wave$|^ice_shard$/],
  ['esmagar', /slam$|^body_press$|^heat_crash$/],
  ['cabecada', /^headbutt$|^head_smash$|^zen_headbutt$|^skull_bash$|^iron_head$|^horn_attack$|^horn_drill$|^megahorn$/],
  ['cauda_ou_asa', /tail|^wing_attack$|^steel_wing$|^drill_peck$|^peck$|^pluck$/],
  ['lambida', /lick/],
  ['canto', /^sing$|^perish_song$|^grass_whistle$/],
  ['som', /^growl$|^roar$|^screech$|^hyper_voice$|^uproar$|^snore$|^metal_sound$|^supersonic$|^echoed_voice$|^round$|^bug_buzz$|^boomburst$/],
  ['gas', /^smog$|^poison_gas$|^sludge|^toxic$|^poison_powder$|^spore$|^sleep_powder$|^stun_spore$|^sweet_scent$/],
  ['choque', /^thunder_shock$|^thunderbolt$|^thunder$|^spark$|^discharge$|^zap_cannon$|^shock_wave$|^charge_beam$/],
  ['chao', /^earthquake$|^magnitude$|^bulldoze$|^fissure$|^stomping_tantrum$|^earth_power$/],
  ['giro', /^rapid_spin$|^rollout$|^gyro_ball$|^ice_ball$|^twister$|^whirlwind$|^teeter_dance$|^leaf_tornado$/],
  ['danca', /dance$|^agility$|^double_team$|^minimize$/],
  ['defesa', /^withdraw$|^defense_curl$|^harden$|^iron_defense$|^protect$|^detect$|^endure$|^barrier$|^acid_armor$/],
  ['furia', /^outrage$|^thrash$|^rage$/],
]

/**
 * Golpe FISICO que nao encosta: arremesso, projetil, pedra caindo. Strike e uma
 * estocada de contato — num Razor Leaf ela leria como o POKE correndo ate o
 * alvo. Estes ficam na pose de sempre (Shoot no livre).
 */
const FISICO_A_DISTANCIA = new Set([
  'razor_leaf', 'rock_throw', 'rock_slide', 'rock_tomb', 'rock_blast', 'stone_edge', 'seed_bomb', 'bullet_seed',
  'icicle_spear', 'icicle_crash', 'pin_missile', 'poison_sting', 'egg_bomb', 'barrage', 'bone_club', 'bonemerang',
  'bone_rush', 'gunk_shot', 'avalanche', 'sand_tomb', 'spike_cannon', 'leaf_storm', 'sky_attack', 'present',
  'mud_slap', 'dig', 'bulldoze', 'magnitude', 'earthquake', 'fissure', 'ancient_power', 'rock_wrecker', 'seismic_toss',
  'self_destruct', 'explosion', 'fling', 'natural_gift', 'beat_up', 'magnet_bomb', 'gyro_ball', 'ice_ball', 'rollout',
])

export function familiaDoGolpe(ability: Pick<Ability, 'id' | 'category' | 'target'>): FamiliaDePose {
  for (const [familia, re] of REGRAS) if (re.test(ability.id)) return familia
  if (ability.category === 'physical') return FISICO_A_DISTANCIA.has(ability.id) ? 'padrao' : 'contato'
  // Especial em area continua no Charge (canalizar), que ja e a leitura certa.
  if (ability.category === 'special' && ability.target !== 'aoe') return 'especial'
  return 'padrao'
}

/** A pose de sempre do modo: Attack no duelo, Charge em area, Shoot no resto. */
export function poseBaseDoModo(isAoe: boolean, duelo: boolean): AnimName {
  return duelo ? 'Attack' : isAoe ? 'Charge' : 'Shoot'
}

/** A pose que esta especie toca com este golpe. Deterministica (ver o topo). */
export function poseDoGolpe(
  speciesId: string, ability: Pick<Ability, 'id' | 'category' | 'target'>, duelo: boolean,
): AnimName {
  const arte = BATTLE_SPRITE_ANIMS[speciesId]
  if (arte) {
    for (const pose of POSES_DA_FAMILIA[familiaDoGolpe(ability)]) if (arte[pose]) return pose
  }
  return poseBaseDoModo(ability.target === 'aoe', duelo)
}

/** Toda pose que so existe pra golpe — a que nao esta aqui e pose de estado (Idle, Walk, Sleep...). */
export const POSES_SO_DE_GOLPE: ReadonlySet<AnimName> = new Set(
  Object.values(POSES_DA_FAMILIA).flat().filter((p) => p !== 'Swing'),
)

/**
 * As poses de golpe que esta especie pode tocar, dado o que ela pode aprender
 * (por nivel e por TM). Serve ao preload: baixar so o que tem chance de
 * aparecer, em vez das ~25 folhas de pose que algumas especies tem.
 */
export function posesDeGolpeDaEspecie(
  speciesId: string, golpes: readonly Pick<Ability, 'id' | 'category' | 'target'>[],
): AnimName[] {
  const usadas = new Set<AnimName>()
  for (const duelo of [false, true]) for (const g of golpes) usadas.add(poseDoGolpe(speciesId, g, duelo))
  return [...usadas].filter((p) => POSES_SO_DE_GOLPE.has(p))
}
