// Runtime helpers around battleSpriteAnims.js's raw per-species animation
// metadata. Not every species has every animation (Shoot/Faint especially
// are missing for some low-tier sprites) — ANIM_FALLBACKS chains to the
// closest available substitute instead of drawing nothing.
import { BATTLE_SPRITE_ANIMS, type AnimName, type BattleSpriteAnimMeta } from './battleSpriteAnims'

const ANIM_FALLBACKS: Partial<Record<AnimName, AnimName>> = {
  Shoot: 'Idle',
  Charge: 'Idle',
  Faint: 'Sleep',
  Idle: 'Walk',
}

export interface ResolvedBattleAnim extends BattleSpriteAnimMeta {
  name: AnimName
  url: string
}

// Resolves `animName` for `speciesId` to the closest animation that actually
// has art, following ANIM_FALLBACKS. Returns null if the species has no
// battle sprites at all (falls back to the geometric placeholder shape).
// `isShiny` picks the recolored variant fetched from PMD Sprite Collab
// (assets/battle-sprites/<species>/<Anim>-Shiny-Anim.png) — same frame
// layout/dimensions as the normal version, just a different palette, so all
// the frameWidth/frameHeight/durations metadata is shared.
export function resolveBattleAnim(speciesId: string, animName: AnimName, isShiny = false): ResolvedBattleAnim | null {
  const species = BATTLE_SPRITE_ANIMS[speciesId]
  if (!species) return null

  let name: AnimName | undefined = animName
  const seen = new Set<AnimName>()
  while (name && !species[name] && !seen.has(name)) {
    seen.add(name)
    name = ANIM_FALLBACKS[name]
  }
  if (!name || !species[name]) return null

  return { name, url: battleSpriteUrl(speciesId, name, isShiny), ...species[name]! }
}

export function battleSpriteUrl(speciesId: string, animName: AnimName, isShiny = false): string {
  const suffix = isShiny ? '-Shiny' : ''
  return `assets/battle-sprites/${speciesId}/${animName}${suffix}-Anim.png`
}

export function hasBattleSprites(speciesId: string): boolean {
  return Boolean(BATTLE_SPRITE_ANIMS[speciesId])
}
