// Animated "Pokemon Showdown"-style Gen5 front-sprite GIFs (assets/gen5ani/ +
// assets/gen5ani-shiny/, user-provided) used as the big hero art in the POKE
// profile modal (see PokeProfileModal.js / PokeStatDetail.js#buildProfileHero)
// — these animate natively via a plain <img>, no manual frame-slicing needed
// (unlike the PMD battle sprites in battleSpriteAnims.js). Flat folders, one
// gif per species, filenames are just the species name with every non a-z0-9
// character stripped (no underscores/apostrophes/periods) — e.g. `farfetch_d`
// -> `farfetchd.gif`, `nidoran_f` -> `nidoranf.gif`, `ho_oh` -> `hooh.gif`.
// Verified this plain normalize covers all 221 current species with zero
// alias table needed, in BOTH folders (gen5ani-shiny mirrors the same naming).
const DIR = 'assets/gen5ani';
const SHINY_DIR = 'assets/gen5ani-shiny';

function normalize(speciesId) {
  return speciesId.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function gen5SpriteUrl(speciesId, isShiny = false) {
  const dir = isShiny ? SHINY_DIR : DIR;
  return `${dir}/${normalize(speciesId)}.gif`;
}
