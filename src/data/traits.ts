// Trait = habilidade PASSIVA de especie (o que os jogos reais chamam de
// "Ability" no sentido de Pokemon). Nao pode se chamar "Ability" neste
// projeto: esse nome ja esta ocupado pelo GOLPE (`type Ability` em
// `engine/types.ts`, `abilities.generated.ts`, `pickAbility`). Pra nao colidir
// com esse vocabulario existente, a habilidade passiva de especie e sempre
// "Trait" no codigo.
//
// Mesmo padrao de camada pequena, escrita a mao, por cima do dado gerado
// (`typedAoeMoves.ts`, `abilityCategory.ts`): indexa por speciesId e nao mexe
// em nada do pipeline (`pokes.generated.ts`, `scripts/usum/*`). Existe fora do
// gerado porque trait de especie nao vem da planilha sincronizada — e
// conteudo novo deste projeto, decidido a mao.
//
// Cada especie tem NO MAXIMO 1 trait aqui, mesmo quando o jogo real atribui
// 2-3 possiveis por slot (normal + oculta). Onde uma especie desta leva tinha
// mais de uma trait pedida colidindo nela, a escolha favoreceu, nesta ordem:
// (1) a trait mais iconica/exclusiva daquela especie quando uma das duas era
// claramente uma marca registrada dela (ex: Politoed fica com `drizzle`, nao
// `water_absorb`, que e generica e sobra pra outras especies aquaticas); (2)
// quando nenhuma das duas era claramente mais iconica, a trait cujo grupo
// ficaria raso demais sem aquela especie venceu, pra manter as ~53 traits com
// alguma distribuicao de donos em vez de concentrar tudo em poucas (ex:
// Stantler fica com `sap_sipper` — sem ela sobrariam so Miltank e Girafarig —
// e Growlithe/Arcanine ficam com `flash_fire`, ja que `intimidate` continua
// com elenco solido sem eles: Arbok, Gyarados, Snubbull, Granbull, Qwilfish).
//
// Traits sem nenhuma especie Gen1/2 real atribuida (`storm_drain`,
// `motor_drive`, `iron_barbs`, `magma_armor`, `pure_power`, `marvel_scale`,
// `rough_skin`, `aftermath`, `drought`, `snow_warning`, `rain_dish`,
// `speed_boost`, `moxie`, `shed_skin`, `poison_heal`) continuam no union type
// — a mecanica de cada uma pode ser implementada normalmente — so nao tem
// nenhuma entrada no mapa ainda porque nao existe dono real nesta geracao do
// elenco. Isso fica resolvido sozinho quando o roster crescer.

export type TraitId =
  | 'levitate'
  | 'volt_absorb'
  | 'water_absorb'
  | 'flash_fire'
  | 'sap_sipper'
  | 'lightning_rod'
  | 'storm_drain'
  | 'motor_drive'
  | 'intimidate'
  | 'download'
  | 'static'
  | 'flame_body'
  | 'poison_point'
  | 'rough_skin'
  | 'aftermath'
  | 'effect_spore'
  | 'iron_barbs'
  | 'immunity'
  | 'limber'
  | 'insomnia'
  | 'vital_spirit'
  | 'water_veil'
  | 'magma_armor'
  | 'own_tempo'
  | 'inner_focus'
  | 'huge_power'
  | 'hustle'
  | 'guts'
  | 'quick_feet'
  | 'swift_swim'
  | 'chlorophyll'
  | 'sand_rush'
  | 'pure_power'
  | 'marvel_scale'
  | 'blaze'
  | 'torrent'
  | 'overgrow'
  | 'swarm'
  | 'drizzle'
  | 'sand_stream'
  | 'ice_body'
  | 'sand_veil'
  | 'snow_cloak'
  | 'drought'
  | 'snow_warning'
  | 'rain_dish'
  | 'sturdy'
  | 'speed_boost'
  | 'moxie'
  | 'shed_skin'
  | 'multiscale'
  | 'synchronize'
  | 'poison_heal'

export const SPECIES_TRAIT: Partial<Record<string, TraitId>> = {
  // levitate
  gastly: 'levitate',
  haunter: 'levitate',
  gengar: 'levitate',
  koffing: 'levitate',
  weezing: 'levitate',
  misdreavus: 'levitate',
  unown: 'levitate',

  // volt_absorb
  chinchou: 'volt_absorb',
  lanturn: 'volt_absorb',

  // water_absorb
  lapras: 'water_absorb',
  quagsire: 'water_absorb',
  wooper: 'water_absorb',
  poliwag: 'water_absorb',
  poliwhirl: 'water_absorb',
  mantine: 'water_absorb',

  // flash_fire
  growlithe: 'flash_fire',
  arcanine: 'flash_fire',
  houndour: 'flash_fire',
  houndoom: 'flash_fire',
  ponyta: 'flash_fire',
  rapidash: 'flash_fire',

  // sap_sipper
  miltank: 'sap_sipper',
  girafarig: 'sap_sipper',
  stantler: 'sap_sipper',

  // lightning_rod
  rhyhorn: 'lightning_rod',
  rhydon: 'lightning_rod',

  // intimidate
  arbok: 'intimidate',
  gyarados: 'intimidate',
  snubbull: 'intimidate',
  granbull: 'intimidate',
  qwilfish: 'intimidate',

  // download
  porygon: 'download',
  porygon2: 'download',

  // static
  pikachu: 'static',
  voltorb: 'static',
  electrode: 'static',
  electabuzz: 'static',
  elekid: 'static',
  mareep: 'static',
  flaaffy: 'static',
  ampharos: 'static',
  zapdos: 'static',

  // flame_body
  magmar: 'flame_body',
  magby: 'flame_body',
  slugma: 'flame_body',
  magcargo: 'flame_body',

  // poison_point
  nidoran_f: 'poison_point',
  nidorina: 'poison_point',
  nidoqueen: 'poison_point',
  nidoran_m: 'poison_point',
  nidorino: 'poison_point',
  nidoking: 'poison_point',

  // effect_spore
  paras: 'effect_spore',
  parasect: 'effect_spore',

  // immunity
  snorlax: 'immunity',

  // limber
  ditto: 'limber',
  meowth: 'limber',
  persian: 'limber',

  // insomnia
  murkrow: 'insomnia',
  spinarak: 'insomnia',
  ariados: 'insomnia',

  // vital_spirit
  mankey: 'vital_spirit',
  primeape: 'vital_spirit',
  delibird: 'vital_spirit',

  // water_veil
  goldeen: 'water_veil',
  seaking: 'water_veil',

  // own_tempo
  slowpoke: 'own_tempo',
  slowbro: 'own_tempo',
  smeargle: 'own_tempo',

  // inner_focus
  zubat: 'inner_focus',
  golbat: 'inner_focus',
  sneasel: 'inner_focus',
  drowzee: 'inner_focus',
  hypno: 'inner_focus',

  // huge_power
  marill: 'huge_power',
  azumarill: 'huge_power',

  // hustle
  corsola: 'hustle',

  // guts
  machop: 'guts',
  machoke: 'guts',
  machamp: 'guts',
  heracross: 'guts',
  tyrogue: 'guts',
  ursaring: 'guts',

  // quick_feet
  teddiursa: 'quick_feet',

  // swift_swim
  horsea: 'swift_swim',
  seadra: 'swift_swim',
  kingdra: 'swift_swim',
  magikarp: 'swift_swim',
  psyduck: 'swift_swim',
  golduck: 'swift_swim',
  omanyte: 'swift_swim',
  omastar: 'swift_swim',
  kabuto: 'swift_swim',
  kabutops: 'swift_swim',

  // chlorophyll
  oddish: 'chlorophyll',
  gloom: 'chlorophyll',
  bellsprout: 'chlorophyll',
  weepinbell: 'chlorophyll',
  victreebel: 'chlorophyll',
  exeggcute: 'chlorophyll',
  tangela: 'chlorophyll',
  hoppip: 'chlorophyll',
  skiploom: 'chlorophyll',
  jumpluff: 'chlorophyll',
  sunkern: 'chlorophyll',
  sunflora: 'chlorophyll',

  // sand_rush
  sandshrew: 'sand_rush',
  sandslash: 'sand_rush',

  // blaze
  charmander: 'blaze',
  charmeleon: 'blaze',
  charizard: 'blaze',
  cyndaquil: 'blaze',
  quilava: 'blaze',
  typhlosion: 'blaze',

  // torrent
  squirtle: 'torrent',
  wartortle: 'torrent',
  blastoise: 'torrent',
  totodile: 'torrent',
  croconaw: 'torrent',
  feraligatr: 'torrent',

  // overgrow
  bulbasaur: 'overgrow',
  ivysaur: 'overgrow',
  venusaur: 'overgrow',
  chikorita: 'overgrow',
  bayleef: 'overgrow',
  meganium: 'overgrow',

  // swarm
  beedrill: 'swarm',
  scyther: 'swarm',
  scizor: 'swarm',
  ledyba: 'swarm',
  ledian: 'swarm',

  // drizzle
  politoed: 'drizzle',

  // sand_stream
  tyranitar: 'sand_stream',

  // ice_body
  seel: 'ice_body',
  dewgong: 'ice_body',

  // sand_veil
  diglett: 'sand_veil',
  dugtrio: 'sand_veil',
  gligar: 'sand_veil',
  larvitar: 'sand_veil',
  pupitar: 'sand_veil',
  phanpy: 'sand_veil',
  donphan: 'sand_veil',

  // snow_cloak
  swinub: 'snow_cloak',
  piloswine: 'snow_cloak',
  articuno: 'snow_cloak',

  // sturdy
  geodude: 'sturdy',
  graveler: 'sturdy',
  golem: 'sturdy',
  steelix: 'sturdy',

  // multiscale
  dragonite: 'multiscale',
  lugia: 'multiscale',

  // synchronize
  abra: 'synchronize',
  kadabra: 'synchronize',
  alakazam: 'synchronize',
  natu: 'synchronize',
  xatu: 'synchronize',
  mew: 'synchronize',
}

export function traitOf(speciesId: string): TraitId | null {
  return SPECIES_TRAIT[speciesId] ?? null
}
