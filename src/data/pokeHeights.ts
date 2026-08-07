// Official Pokedex height (meters) for the species currently in the game —
// used to scale battle-field sprites so bigger POKE actually read as bigger.
const HEIGHT_M: Record<string, number> = {
  bulbasaur: 0.7, ivysaur: 1.0, venusaur: 2.0,
  charmander: 0.6, charmeleon: 1.1, charizard: 1.7,
  squirtle: 0.5, wartortle: 1.0, blastoise: 1.6,
  caterpie: 0.3, metapod: 0.7, butterfree: 1.1,
  weedle: 0.3, kakuna: 0.6, beedrill: 1.0,
  pidgey: 0.3, pidgeotto: 1.1, pidgeot: 1.5,
  rattata: 0.3, raticate: 0.7,
  spearow: 0.3, fearow: 1.2,
  zubat: 0.8, golbat: 1.6,
  geodude: 0.4, graveler: 1.0,
  sentret: 0.8, furret: 1.8,
  hoppip: 0.4, skiploom: 0.6, jumpluff: 0.8,
  dunsparce: 1.5,

  // The ~58 species added when the full SpriteCollab repo was imported.
  ekans: 2.0, arbok: 3.5,
  sandshrew: 0.6, sandslash: 1.0,
  nidoran_f: 0.4, nidorina: 0.8, nidoran_m: 0.5, nidorino: 0.9,
  growlithe: 0.7,
  onix: 8.8,
  abra: 0.9, kadabra: 1.3,
  machop: 0.8, machoke: 1.5,
  bellsprout: 0.7, weepinbell: 1.0,
  slowpoke: 1.2, slowbro: 1.6,
  magnemite: 0.3, magneton: 1.0,
  farfetch_d: 0.8,
  doduo: 1.4, dodrio: 1.8,
  seel: 1.1, dewgong: 1.7,
  koffing: 0.6, weezing: 1.2,
  tangela: 1.0, kingler: 1.3, lickitung: 1.2,
  tauros: 1.4, jynx: 1.4, krabby: 0.4,
  paras: 0.3, parasect: 0.6,
  ditto: 0.3, jigglypuff: 0.5,
  ponyta: 1.0, rapidash: 1.7, magmar: 1.3,
  xatu: 1.5, natu: 0.2,
  miltank: 1.2, snubbull: 0.6, granbull: 1.4,
  piloswine: 1.1, swinub: 0.4,
  ursaring: 1.8, skarmory: 1.7, donphan: 1.1,
  larvitar: 0.6, pupitar: 1.2, tyranitar: 2.0,
  gligar: 1.1, smeargle: 1.2, sunkern: 0.3, unown: 0.5, yanma: 1.2,

  // The ~130 Kanto/legendary species added with the "Novo Continente" hunts —
  // real Pokedex heights, not sourced from the spreadsheet (it has no height
  // column) same as the ~58 batch above.
  pichu: 0.3, cleffa: 0.3, igglybuff: 0.3, togepi: 0.3, togetic: 0.6,
  pikachu: 0.4, raichu: 0.8, hoothoot: 0.7, noctowl: 1.6,
  spinarak: 0.5, ariados: 1.1, ledyba: 1.0, ledian: 1.4,
  pineco: 0.6, forretress: 1.2, oddish: 0.5, gloom: 0.8, vileplume: 1.2, bellossom: 0.4,
  poliwag: 0.6, poliwhirl: 1.0, poliwrath: 1.3, politoed: 1.1,
  diglett: 0.2, dugtrio: 0.7, voltorb: 0.5, electrode: 1.2,
  meowth: 0.4, persian: 1.0, gastly: 1.3, haunter: 1.6, gengar: 1.5,
  drowzee: 1.0, hypno: 1.6, magikarp: 0.9, gyarados: 6.5,
  goldeen: 0.6, seaking: 1.3, horsea: 0.4, seadra: 1.2, kingdra: 1.8,
  tentacool: 0.9, tentacruel: 1.6, exeggcute: 0.4, exeggutor: 2.0,
  mareep: 0.6, flaaffy: 0.8, ampharos: 1.4,
  cyndaquil: 0.5, quilava: 0.9, typhlosion: 1.7,
  chikorita: 0.9, bayleef: 1.2, meganium: 1.8,
  totodile: 0.6, croconaw: 0.9, feraligatr: 2.3,
  mankey: 0.5, primeape: 0.8, cubone: 0.4, marowak: 1.0,
  chinchou: 0.5, lanturn: 1.2, shellder: 0.3, cloyster: 1.5,
  staryu: 0.8, starmie: 1.1, grimer: 0.9, muk: 1.2,
  venonat: 1.0, venomoth: 1.5, psyduck: 0.8, golduck: 1.7,
  wooper: 0.4, quagsire: 1.4, slugma: 0.7, magcargo: 0.8,
  houndour: 0.6, houndoom: 1.4, teddiursa: 0.6, phanpy: 0.5,
  remoraid: 0.5, octillery: 0.9, tyrogue: 0.7, hitmonlee: 1.5, hitmonchan: 1.4,
  hitmontop: 1.4, elekid: 0.6, electabuzz: 1.1, magby: 0.7,
  smoochum: 0.4, marill: 0.4, azumarill: 0.8,
  sudowoodo: 1.2, murkrow: 0.5, aipom: 0.8, qwilfish: 0.5, corsola: 0.6,
  sneasel: 0.9, girafarig: 1.5, stantler: 1.4, misdreavus: 0.7, delibird: 0.9,
  sunflora: 0.8, wobbuffet: 1.3, mantine: 2.1,
  rhyhorn: 1.0, rhydon: 1.9, kangaskhan: 2.2,
  lapras: 2.5, porygon: 0.8, porygon2: 0.6, eevee: 0.3,
  vaporeon: 1.0, jolteon: 0.8, flareon: 0.9,
  omanyte: 0.4, omastar: 1.0, kabuto: 0.5, kabutops: 1.3, aerodactyl: 1.8,
  snorlax: 2.1, dratini: 1.8, dragonair: 4.0, dragonite: 2.2,
  scyther: 1.5, scizor: 1.8, pinsir: 1.5, heracross: 1.5,
  alakazam: 1.5, machamp: 1.6, victreebel: 1.7, arcanine: 1.9,
  nidoking: 1.4, nidoqueen: 1.3, steelix: 9.2,
  articuno: 1.7, zapdos: 1.6, moltres: 2.0,
  raikou: 1.9, entei: 2.1, suicune: 2.0,
  lugia: 5.2, ho_oh: 3.8, celebi: 0.6, mewtwo: 2.0, mew: 0.4,
}

// Explicit user request: replace the old "1.6x/2.0x cap above a fixed 1m
// reference" scheme with a straight linear interpolation across the WHOLE
// roster's real height range — the single shortest species in HEIGHT_M gets
// exactly MIN_SCALE, the single tallest gets exactly MAX_SCALE, and every
// other species lands proportionally in between (no separate legendary
// bonus anymore — a legendary's size now comes purely from its real height,
// same rule as everyone else). Species with no height data default to
// MIN_SCALE (no real-size info to scale up from).
const MIN_SCALE = 1
const MAX_SCALE = 3
const HEIGHT_VALUES = Object.values(HEIGHT_M)
const MIN_HEIGHT = Math.min(...HEIGHT_VALUES)
const MAX_HEIGHT = Math.max(...HEIGHT_VALUES)

export function scaleForSpecies(speciesId: string): number {
  const height = HEIGHT_M[speciesId]
  if (!height) return MIN_SCALE
  const ratio = (height - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT)
  return MIN_SCALE + ratio * (MAX_SCALE - MIN_SCALE)
}
