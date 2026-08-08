// Runtime helpers around battleSpriteAnims.js's raw per-species animation
// metadata. Not every species has every animation (Shoot/Faint especially
// are missing for some low-tier sprites) — ANIM_FALLBACKS chains to the
// closest available substitute instead of drawing nothing.
import { BATTLE_SPRITE_ANIMS, type AnimName, type BattleSpriteAnimMeta } from './battleSpriteAnims'

// BUG REAL CORRIGIDO (relatado como "a animacao de ataque do Charmander nao
// funciona"): `Shoot` caia direto em `Idle`, e 15 das 227 especies com arte —
// Charmander, o inicial mais escolhido do jogo, entre elas — nao tem
// `Shoot-Anim.png` no disco. Resultado: elas atacavam com a pose de PARADO.
// Nao havia erro nenhum, so a ausencia de animacao. Charmander tem
// `Charge-Anim.png` (10 quadros) desde sempre, que E uma pose de ataque.
//
// A cadeia virou LISTA em vez de sucessor unico por dois motivos. Primeiro,
// `Shoot -> Charge` e `Charge -> Shoot` sao mutuamente dependentes: com um
// sucessor so, uma especie sem NENHUM dos dois entrava no ciclo, a guarda de
// visitados cortava o loop e a funcao devolvia `null` — o que joga a entidade
// no placeholder geometrico colorido. Segundo, a lista deixa o ultimo degrau
// (`Walk`, que toda especie com arte tem) explicito, entao nenhuma cadeia
// termina em nada.
const ANIM_FALLBACKS: Partial<Record<AnimName, AnimName[]>> = {
  Shoot: ['Charge', 'Idle', 'Walk'],
  Charge: ['Shoot', 'Idle', 'Walk'],
  Faint: ['Sleep', 'Idle', 'Walk'],
  Idle: ['Walk'],
  Sleep: ['Idle', 'Walk'],
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

  for (const name of [animName, ...(ANIM_FALLBACKS[animName] ?? [])]) {
    const meta = species[name]
    if (meta) return { name, url: battleSpriteUrl(speciesId, name, isShiny), ...meta }
  }
  return null
}

export function battleSpriteUrl(speciesId: string, animName: AnimName, isShiny = false): string {
  const suffix = isShiny ? '-Shiny' : ''
  return `assets/battle-sprites/${speciesId}/${animName}${suffix}-Anim.png`
}

export function hasBattleSprites(speciesId: string): boolean {
  return Boolean(BATTLE_SPRITE_ANIMS[speciesId])
}
