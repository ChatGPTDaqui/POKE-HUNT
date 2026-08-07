import { colorForType } from './typeColors'
import type { ElementType } from './generated/types'

// Real sprite art. The original 32 species' assets/sprites/*.png (+ shiny at
// assets/sprites-shiny/*.png) came from the community icon sheets
// assets/48056.png/48064.png (+ 48057/48065 for shiny). The other 58 —
// imported wholesale from a local checkout of the SpriteCollab repo — reuse
// their 40x40 PMD portrait for this "big icon" slot too, since no equivalent
// box-art crop exists for them; see faceIconUrl below, same source. Any
// species outside this set (none currently) falls back to the geometric
// placeholder shapes (render/Sprites.js).
export const SPECIES_WITH_ART: Set<string> = new Set([
  'bulbasaur', 'charmander', 'squirtle',
  'caterpie', 'weedle', 'pidgey', 'rattata', 'spearow', 'zubat', 'geodude',
  'sentret', 'hoppip', 'dunsparce',
  'ivysaur', 'venusaur', 'charmeleon', 'charizard', 'wartortle', 'blastoise',
  'metapod', 'butterfree', 'kakuna', 'beedrill', 'pidgeotto', 'pidgeot',
  'raticate', 'fearow', 'golbat', 'graveler', 'furret', 'skiploom', 'jumpluff',
  'bellsprout', 'unown', 'growlithe', 'sandshrew', 'onix', 'paras', 'ekans',
  'slowpoke', 'snubbull', 'abra', 'jigglypuff', 'ditto', 'nidoran_f',
  'nidoran_m', 'sunkern', 'yanma', 'machop', 'koffing', 'weezing',
  'magnemite', 'tauros', 'miltank', 'arbok', 'farfetch_d', 'natu', 'smeargle',
  'swinub', 'jynx', 'krabby', 'seel', 'tangela', 'lickitung', 'weepinbell',
  'ursaring', 'gligar', 'donphan', 'skarmory', 'machoke', 'larvitar',
  'pupitar', 'magmar', 'parasect', 'ponyta', 'rapidash', 'doduo', 'dodrio',
  'sandslash', 'slowbro', 'granbull', 'kadabra', 'nidorina', 'nidorino',
  'magneton', 'xatu', 'piloswine', 'kingler', 'dewgong', 'tyranitar',

  // Kanto/legendary species added with the "Novo Continente" hunts:
  'pichu', 'cleffa', 'igglybuff', 'togepi', 'pikachu', 'hoothoot', 'spinarak', 'ledyba', 'pineco', 'oddish', 'poliwag', 'diglett', 'voltorb', 'meowth', 'gastly', 'drowzee', 'magikarp', 'goldeen', 'horsea', 'tentacool', 'exeggcute', 'mareep', 'cyndaquil', 'chikorita', 'totodile', 'mankey', 'cubone', 'chinchou', 'shellder', 'staryu', 'grimer', 'venonat', 'psyduck', 'wooper', 'slugma', 'houndour', 'teddiursa', 'phanpy', 'remoraid', 'tyrogue', 'elekid', 'magby', 'smoochum', 'marill', 'sudowoodo', 'murkrow', 'aipom', 'qwilfish', 'corsola', 'sneasel', 'girafarig', 'stantler', 'misdreavus', 'delibird', 'sunflora', 'wobbuffet', 'mantine', 'rhyhorn', 'hitmonlee', 'hitmonchan', 'kangaskhan', 'lapras', 'porygon', 'eevee', 'scyther', 'pinsir', 'dratini', 'omanyte', 'kabuto', 'aerodactyl', 'snorlax', 'heracross', 'alakazam', 'gengar', 'machamp', 'victreebel', 'arcanine', 'nidoking', 'nidoqueen', 'steelix', 'gyarados', 'articuno', 'zapdos', 'moltres', 'raikou', 'entei', 'suicune', 'lugia', 'ho_oh', 'celebi', 'mewtwo', 'mew', 'noctowl', 'ariados', 'ledian', 'forretress', 'gloom', 'poliwhirl', 'dugtrio', 'electrode', 'persian', 'haunter', 'hypno', 'seaking', 'seadra', 'tentacruel', 'flaaffy', 'quilava', 'bayleef', 'croconaw', 'primeape', 'marowak', 'lanturn', 'muk', 'venomoth', 'golduck', 'quagsire', 'magcargo', 'houndoom', 'octillery', 'electabuzz', 'azumarill', 'rhydon', 'dragonair', 'omastar', 'kabutops', 'ampharos', 'typhlosion', 'meganium', 'feraligatr', 'dragonite',

  // Kanto/legendary species added with the "Novo Continente" hunts:
  'kingdra', 'politoed', 'golem', 'porygon2', 'scizor',
]);

export function spriteUrl(speciesId: string, isShiny = false): string | null {
  if (!SPECIES_WITH_ART.has(speciesId)) return null;
  const dir = isShiny ? 'sprites-shiny' : 'sprites';
  return `assets/${dir}/${speciesId}.png`;
}

// Small "face" icons for the colored-swatch spots in list rows (bag/team/shop
// pokemon lists, hospital, starter picker) — the "Normal" portrait pulled
// straight from PMD Sprite Collab's per-species portrait set
// (raw.githubusercontent.com/PMDCollab/SpriteCollab), a clean 40x40 PNG per
// species+color with no grid-position guessing needed (unlike the old
// assets/64891.png fan sheet this replaced). Shiny POKEs get the real Shiny
// portrait variant from the same source (assets/sprites-face-shiny/).
export function faceIconUrl(speciesId: string, isShiny = false): string | null {
  if (!SPECIES_WITH_ART.has(speciesId)) return null;
  const dir = isShiny ? 'sprites-face-shiny' : 'sprites-face';
  return `assets/${dir}/${speciesId}.png`;
}

// Item icons cropped from the community rip in
// assets/Nintendo Switch - Pokemon Scarlet _ Violet - UI Elements - Item Icons
// (index numbers looked up on Bulbapedia's Gen IX item index list). Fishing
// rods have no icon here — Scarlet/Violet has no rod items to rip art from,
// and rods aren't sellable/usable yet anyway (see CLAUDE.md).
const ITEM_ICON_IDS: Set<string> = new Set([
  'poke_ball', 'great_ball', 'ultra_ball', 'premier_ball',
  'potion', 'super_potion', 'hyper_potion', 'max_potion',
  'revive', 'max_revive',
]);

// Every "Pedra <TYPE>" (data/stones.js) shares one neutral gem icon (that
// pack's Moon Stone, assets/item-icons/type_stone.png) — there's no real
// per-elemental-type Pokemon item to rip 17 distinct icons from. The type is
// told apart via the colored badge border applied where this is rendered
// (see itemIconBorderColor below), same "tint by colorForType" language the
// rest of the UI already uses for ability slots/type chips/aura outlines.
export function itemIconUrl(itemId: string): string | null {
  if (itemId.startsWith('stone_')) return 'assets/item-icons/type_stone.png';
  if (!ITEM_ICON_IDS.has(itemId)) return null;
  return `assets/item-icons/${itemId}.png`;
}

export function itemIconBorderColor(itemId: string): string | null {
  if (!itemId.startsWith('stone_')) return null;
  const type = itemId.slice('stone_'.length).toUpperCase();
  return colorForType(type as ElementType);
}
