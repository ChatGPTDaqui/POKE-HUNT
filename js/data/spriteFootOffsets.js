// Where each species' battle sprite actually stands within its animation
// frame, as a fraction of frameHeight measured down from the frame's
// vertical center (entity.y) — e.g. 0.125 means the feet sit an eighth of a
// frame-height below center. PMD Sprite Collab frames carry a lot of empty
// bounce/motion padding, so this is NOT a fixed 0.5 (frame bottom edge) —
// that was the bug that made the shadow float far below the actual feet.
// Measured once per species from its Idle (or Walk fallback) animation's
// Down-facing, frame-0 pose — see scratchpad measurement script from the
// "revisão de sprites" round. Flying species (Zubat/Golbat/Butterfree) come
// out at ~0 or slightly negative, which is correct: they hover rather than
// plant feet on the ground.
const FOOT_OFFSET_FRACTION = {
  charmander: 0.125, squirtle: 0.125, bulbasaur: 0.15,
  geodude: 0.25, spearow: 0.15, rattata: 0.188, pidgey: 0.15,
  sentret: 0.056, hoppip: 0.071, zubat: -0.036, dunsparce: 0.417,
  caterpie: 0.156, weedle: 0.1,
  charmeleon: 0.089, wartortle: 0.125, ivysaur: 0.219,
  graveler: 0.104, fearow: 0.083, raticate: 0.104, pidgeotto: 0.104,
  furret: 0.1, skiploom: 0.156, golbat: 0, metapod: 0.175, kakuna: 0.075,
  charizard: 0.104, blastoise: 0.1, venusaur: 0.281, pidgeot: 0.104,
  jumpluff: 0.125, butterfree: 0, beedrill: 0.042,

  // The ~58 species added when the full SpriteCollab repo was imported —
  // same measurement method as above, run once over the local repo instead
  // of the network zips.
  bellsprout: 0.156, unown: 0, growlithe: 0.104, sandshrew: 0.125,
  onix: 0.038, paras: 0.25, ekans: 0.146, slowpoke: 0.219, snubbull: 0.1,
  abra: 0.021, jigglypuff: 0.156, ditto: 0.188, nidoran_f: 0.15,
  nidoran_m: 0.167, sunkern: 0.094, yanma: 0.05, machop: 0.1, koffing: 0,
  weezing: 0.094, magnemite: 0.031, tauros: 0.125, miltank: 0.104,
  arbok: 0.125, farfetch_d: 0.188, natu: 0.188, smeargle: 0.125,
  swinub: 0.25, jynx: 0.175, krabby: 0.1, seel: 0.156, tangela: 0.125,
  lickitung: 0.146, weepinbell: 0.219, ursaring: 0.107, gligar: 0.018,
  donphan: 0.125, skarmory: 0.109, machoke: 0.104, larvitar: 0.104,
  pupitar: 0.054, magmar: 0.125, parasect: 0.219, ponyta: 0.15,
  rapidash: 0.143, doduo: 0.15, dodrio: 0.125, sandslash: 0.15,
  slowbro: 0.15, granbull: 0.125, kadabra: -0.018, nidorina: 0.15,
  nidorino: 0.175, magneton: 0.1, xatu: 0.125, piloswine: 0.188,
  kingler: 0.125, dewgong: 0.125, tyranitar: 0.104,

  // The ~130 Kanto/legendary species added when the "Novo Continente" hunts
  // were introduced — same auto-measurement idea, just computed by script
  // (scripts/import-kanto-sprites.js) instead of eyeballed given the volume.
  pichu: 0.083, cleffa: 0.156, igglybuff: 0.208, togepi: 0.156, pikachu: 0.071, hoothoot: 0.156, spinarak: 0.333, ledyba: 0.021, pineco: 0.125, oddish: 0.125, poliwag: 0.104, diglett: 0.333, voltorb: 0.125, meowth: 0.125, gastly: 0.018, drowzee: 0.1, magikarp: 0.313, goldeen: 0.125, horsea: 0, tentacool: 0.063, exeggcute: 0.225, mareep: 0.15, cyndaquil: 0.094, chikorita: 0.104, totodile: 0.104, mankey: 0.071, cubone: 0.15, chinchou: 0.15, shellder: 0.219, staryu: 0.125, grimer: 0.188, venonat: 0.125, psyduck: 0.125, wooper: 0.156, slugma: 0.2, houndour: 0.167, teddiursa: 0.156, phanpy: 0.15, remoraid: 0.05, tyrogue: 0.083, elekid: 0.071, magby: 0.104, smoochum: 0.1, marill: 0.125, sudowoodo: 0.1, murkrow: 0.125, aipom: 0.125, qwilfish: 0.05, corsola: 0.125, sneasel: 0.089, girafarig: 0.125, stantler: 0.146, misdreavus: 0.021, delibird: 0.15, sunflora: 0.089, wobbuffet: 0.15, mantine: 0.056, rhyhorn: 0.219, hitmonlee: 0.125, hitmonchan: 0.071, kangaskhan: 0.089, lapras: 0.161, porygon: 0.125, eevee: 0.156, scyther: 0.104, pinsir: 0.104, dratini: 0.15, omanyte: 0.188, kabuto: 0.25, aerodactyl: 0.016, snorlax: 0.078, heracross: 0.071, alakazam: 0.083, gengar: 0.125, machamp: 0.104, victreebel: 0.071, arcanine: 0.125, nidoking: 0.083, nidoqueen: 0.125, steelix: 0.009, gyarados: 0, articuno: -0.011, zapdos: 0.01, moltres: -0.031, raikou: 0.146, entei: 0.125, suicune: 0.167, lugia: 0.073, ho_oh: 0.054, celebi: 0, mewtwo: 0.078, mew: 0.018, noctowl: 0.078, ariados: 0.175, ledian: -0.018, forretress: 0.025, gloom: 0.156, poliwhirl: 0.125, dugtrio: 0.344, electrode: 0.156, persian: 0.146, haunter: 0.036, hypno: 0.104, seaking: 0.063, seadra: 0.016, tentacruel: 0.083, flaaffy: 0.083, quilava: 0.375, bayleef: 0.107, croconaw: 0.083, primeape: 0.107, marowak: 0.104, lanturn: 0.071, muk: 0.15, venomoth: 0.018, golduck: 0.175, quagsire: 0.071, magcargo: 0.225, houndoom: 0.141, octillery: 0.281, electabuzz: 0.071, azumarill: 0.104, rhydon: 0.104, dragonair: 0.161, omastar: 0.125, kabutops: 0.104, ampharos: 0.078, typhlosion: 0.071, meganium: 0.107, feraligatr: 0.089, dragonite: 0.078,

  // The ~130 Kanto/legendary species added when the "Novo Continente" hunts
  // were introduced — same auto-measurement idea, just computed by script
  // (scripts/import-kanto-sprites.js) instead of eyeballed given the volume.
  kingdra: -0.028, politoed: 0.078, golem: 0.125, porygon2: 0.125, scizor: 0.125,
};

const DEFAULT_FRACTION = 0.15; // rough roster average, used only if a species is somehow missing above

export function footOffsetFraction(speciesId) {
  const fraction = FOOT_OFFSET_FRACTION[speciesId];
  return fraction == null ? DEFAULT_FRACTION : fraction;
}
