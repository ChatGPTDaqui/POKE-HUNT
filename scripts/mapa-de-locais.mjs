// Onde cada LOCAL REAL dos jogos mora nos nossos 33 sub-biomas (PH-500).
//
// Entrada: os 410 pares `(geracao, local, terreno)` de
// `scripts/encontros-por-local.json`. Saida: o sub-bioma nosso.
//
// ESCRITO A MAO, E ISSO NAO E PREGUICA DE AUTOMATIZAR
// ---------------------------------------------------------------------------
// Medido com heuristica de padrao de nome: 17 dos 33 sub-biomas ficavam sem
// nenhum dado, e 82 especies caiam num balde "rota generica" sem distinguir
// Planicie, Relvado, Mato Alto, Campina, Ermos e Montanha — que e exatamente a
// distincao que da profundidade ao bioma. A heuristica serviu pra medir
// viabilidade e nao serve como dado.
//
// A CHAVE E `(local, terreno)`, E NAO SO O LOCAL
// ---------------------------------------------------------------------------
// O mesmo mapa da encontros diferentes por terreno, e eles moram em lugares
// diferentes do nosso mundo: `ROUTE119` na grama e mato alto de Hoenn, e no
// surf e o rio que corta a rota. Amarrar os dois no mesmo sub-bioma poria
// Tentacool no mato.
//
// AQUI E ONDE A PROFUNDIDADE E DECIDIDA, E ESSA E A REGRA QUE RESOLVE O
// CONFLITO ENTRE NIVEL REAL E CURVA DE PROFUNDIDADE
// ---------------------------------------------------------------------------
// `data/estagios.ts#PERFIL_POR_SUB_BIOMA` diz onde cada sub-bioma esta no auge:
// no Aridos, `badlands` e raso (0.1), `desert` e meio (0.5) e `wasteland` e o
// fundo (1.0). Essa ordem esta em producao desde 02/09 e o jogador a VE na
// trilha de estagios.
//
// O nivel real nem sempre concorda com o tema. `ROUTE113` e uma rota coberta de
// cinza vulcanica — leitura tematica de "terra devastada" — mas ela e Lv 14-16,
// comeco de jogo. Manda-la pro `wasteland` faria o fundo do Aridos ser o lugar
// mais fraco dele, e inverteria a progressao que o jogador ja conhece.
//
// Entao a regra e: O LOCAL VAI PRO SUB-BIOMA CUJA PROFUNDIDADE COMBINA COM O
// NIVEL REAL DELE. `ROUTE113` (Lv 14-16) e `badlands`; `DESERT_UNDERPASS`
// (Lv 35-45, debaixo do deserto) e `wasteland`. Dentro do Aridos isso da uma
// escada coerente: a rota de cinzas na entrada, o deserto no meio, o subterraneo
// no fundo.
//
// Consequencia pra PH-501: a profundidade derivada do dado e CONFERENCIA da
// curva escrita a mao, e nao substituicao dela. Quando as duas discordarem
// muito, quem se revisa e ESTE arquivo — a ordem dos sub-biomas dentro de um
// bioma e decisao de produto ja publicada, e a alocacao de local e a peca com
// escolha livre.
//
// OS 11 SUB-BIOMAS SEM ANALOGO REAL, DECLARADOS
// ---------------------------------------------------------------------------
// Gen I-III nao tem encontro selvagem urbano, nem industrial, nem cosmico. E as
// cidades dos tres jogos nao tem grama nenhuma — so agua de surf, que vai pra
// `beach` ou `lake` pelo terreno. Entao estes ficam de fora deste mapa e
// continuam vindo do pool do PokeRogue, por decisao do dono do projeto em
// 2026-09-04:
//
//   metropolis  slum  dojo  construction-site  factory   (urbano/industrial)
//   fairy-cave  abyss  space                             (sem paralelo nenhum)
//   jungle                                               (Hoenn tem mato alto,
//                                                         nao selva)
//   town                                                 (cidade sem grama)
//   snowy-forest                                         (floresta nevada e
//                                                         Gen IV pra frente)
//
// Sao ONZE e nao nove: `town` e `snowy-forest` entraram na lista depois de
// medir. A decisao do dono foi sobre o CRITERIO ("mantem PokeRogue onde nao ha
// analogo"), e o criterio se aplica aos dois.
export const SEM_ANALOGO_REAL = [
  'town', 'jungle', 'snowy-forest',
  'metropolis', 'slum', 'dojo', 'construction-site', 'factory',
  'fairy-cave', 'abyss', 'space',
]

// ---------------------------------------------------------------------------
// Descartados, com o motivo
// ---------------------------------------------------------------------------
// Local que existe no dado mas nao no jogo jogavel. Descartar em silencio seria
// pior que incluir: ninguem saberia que a decisao foi tomada.
export const DESCARTADOS = {
  // QUEBRA-PEDRA INTEIRO SAI, e a decisao e por MEDICAO e nao por tema.
  //
  // Sao 7 encontros em 5 tabelas de Hoenn, com 3 especies. Geodude e 100% de
  // TRES dessas tabelas, e como quebra-pedra e o unico metodo de encontro das
  // rotas 111 e 114 abaixo de Lv 14 (a grama delas comeca em Lv 14-19), ele
  // virava a unica linha real dos estagios 1 e 2 do Deserto e dos Ermos:
  // medido, Geodude com 90,9% da tabela nos quatro pares.
  //
  // A `encounter_rate` da fonte NAO resolve isso, e conferir isso valeu a pena:
  // quebra-pedra tem taxa 20-25 contra mediana 10 da grama no proprio Emerald,
  // porque a taxa e condicional a voce quebrar a pedra — ela nao mede o quanto
  // o metodo e ambiente, que e a pergunta aqui. So existem 6 mapas com
  // quebra-pedra em Hoenn inteira, com poucas pedras cada.
  //
  // O custo de descartar e quase nulo: Geodude tem 32 outros locais reais e
  // Graveler 17. Nosepass perde o unico local real dele e passa a vir do pool
  // do PokeRogue (`cave`, `construction-site`), como toda especie sem encontro
  // real — nao sai do jogo.
  'pedra': 'metodo secundario: 7 encontros em 5 tabelas, e Geodude e 100% de tres delas',

  'emerald|MAP_CAVE_OF_ORIGIN_UNUSED_RUBY_SAPPHIRE_MAP1': 'mapa marcado UNUSED no proprio pokeemerald: inalcancavel no jogo',
  'emerald|MAP_CAVE_OF_ORIGIN_UNUSED_RUBY_SAPPHIRE_MAP2': 'idem',
  'emerald|MAP_CAVE_OF_ORIGIN_UNUSED_RUBY_SAPPHIRE_MAP3': 'idem',
  'emerald|MAP_ALTERING_CAVE': 'conteudo de evento e-Reader; sem o evento a tabela e Zubat em todas as vagas',
  'emerald|MAP_ROUTE130|grama': 'Ilha Miragem — aparece 1 dia em 65.536 conforme a ID do treinador. A AGUA da rota fica (e mar de verdade).',
}

// ---------------------------------------------------------------------------
// O mapa
// ---------------------------------------------------------------------------
// Valor `string` vale pra TODO terreno daquele local. Objeto recorta por
// terreno. Terreno presente no dado e ausente do objeto e erro, e o teste
// reprova — nao ha default silencioso.
//
// Regra geral de agua, pra nao repetir em 150 linhas:
//   surf/pesca de rota oceanica ........ sea
//   surf/pesca de cidade costeira ...... beach   (e a orla, nao o mar aberto)
//   surf/pesca de cidade/rota interior . lake
//   surf/pesca dentro de caverna ....... lake    (rio e poco subterraneo)
//   surf debaixo d'agua ................ seabed
//   surf/pesca de Zona Safari .......... swamp   (o pantano da Zona Safari e o
//                                                 unico dado real de pantano
//                                                 que existe nos tres jogos)
export const MAPA_DE_LOCAIS = {
  // =========================================================================
  // Gen 1 — Kanto (pret/pokered)
  // =========================================================================
  rb: {
    // --- rotas de campo -----------------------------------------------------
    Route1: 'plains',
    Route2: 'plains',
    Route22: 'plains',
    // Ciclovia e as rotas de oeste: campo aberto de verdade, com Doduo e
    // Ponyta correndo solto.
    Route16: 'plains',
    Route17: 'plains',
    Route18: 'plains',
    Route5: 'grass',
    Route6: 'grass',
    Route7: 'grass',
    Route8: 'grass',
    Route11: 'grass',
    Route12: 'grass',
    Route13: 'grass',
    Route14: 'grass',
    Route15: 'grass',
    Route24: 'grass',
    Route25: 'grass',
    // Rota 21 e a travessia a nado de Pallet a Cinnabar: grama de ilha na
    // parte de cima, mar aberto embaixo.
    Route21: { grama: 'grass', surf: 'sea' },

    // --- montanha e caverna -------------------------------------------------
    // A DIVISAO `mountain` x `cave` E POR DENTRO/FORA, e ela vale nos tres
    // jogos: `mountain` (profundidade 0.15) e o rochoso a ceu aberto, na
    // entrada do bioma; `cave` (0.85) e o interior, no fundo dele.
    Route3: 'mountain',
    Route4: 'mountain',
    Route9: 'mountain',
    Route10: 'mountain',
    Route23: 'mountain',
    MtMoon1F: 'cave',
    MtMoonB1F: 'cave',
    MtMoonB2F: 'cave',
    RockTunnel1F: 'cave',
    RockTunnelB1F: 'cave',
    DiglettsCave: 'cave',
    VictoryRoad1F: 'cave',
    VictoryRoad2F: 'cave',
    VictoryRoad3F: 'cave',
    // Caverna Cerulean e o Lv 46-67 mais alto do Gen1 inteiro — o fundo do
    // `cave` por nivel, o que casa com a profundidade 0.85 dele.
    CeruleanCave1F: 'cave',
    CeruleanCave2F: 'cave',
    CeruleanCaveB1F: 'cave',

    // --- gelo ---------------------------------------------------------------
    SeafoamIslands1F: 'ice-cave',
    SeafoamIslandsB1F: 'ice-cave',
    SeafoamIslandsB2F: 'ice-cave',
    SeafoamIslandsB3F: 'ice-cave',
    SeafoamIslandsB4F: 'ice-cave',

    // --- floresta e campina -------------------------------------------------
    ViridianForest: 'forest',
    // A Zona Safari e o unico lugar dos tres jogos com pantano de verdade, e o
    // elenco dela (Nidoran, Exeggcute, Rhyhorn, Chansey, Tauros) e de campina
    // aberta. A grama vai pra `meadow` e a agua, quando ha, pro `swamp`.
    SafariZoneCenter: 'meadow',
    SafariZoneEast: 'meadow',
    SafariZoneNorth: 'meadow',
    SafariZoneWest: 'meadow',

    // --- construido ---------------------------------------------------------
    // Torre Pokemon e o cemiterio de Lavender: Gastly, Haunter, Cubone.
    PokemonTower3F: 'graveyard',
    PokemonTower4F: 'graveyard',
    PokemonTower5F: 'graveyard',
    PokemonTower6F: 'graveyard',
    PokemonTower7F: 'graveyard',
    // Mansao Pokemon e o laboratorio abandonado onde o Mewtwo foi criado — os
    // diarios de pesquisa estao la dentro. Magmar, Ditto, Grimer, Muk, Koffing
    // e Weezing num laboratorio le certo; num vulcao, nao.
    PokemonMansion1F: 'laboratory',
    PokemonMansion2F: 'laboratory',
    PokemonMansion3F: 'laboratory',
    PokemonMansionB1F: 'laboratory',
    PowerPlant: 'power-plant',

    // --- mar ----------------------------------------------------------------
    // `SeaRoutes` e um rotulo unico do pokered compartilhado pelas rotas de
    // agua do sul (19, 20, 21): Tentacool em todas as vagas.
    SeaRoutes: 'sea',
  },

  // =========================================================================
  // Gen 2 — Johto e Kanto (pret/pokecrystal)
  // =========================================================================
  gsc: {
    // --- Johto, rotas de campo ---------------------------------------------
    ROUTE_29: 'plains',
    ROUTE_30: { grama: 'plains', surf: 'lake' },
    ROUTE_31: { grama: 'plains', surf: 'lake' },
    ROUTE_32: { grama: 'plains', surf: 'lake' },
    ROUTE_33: 'plains',
    ROUTE_36: 'plains',
    ROUTE_34: { grama: 'grass', surf: 'lake' },
    ROUTE_35: { grama: 'grass', surf: 'lake' },
    ROUTE_37: 'grass',
    ROUTE_38: 'grass',
    ROUTE_39: 'grass',
    ROUTE_42: { grama: 'grass', surf: 'lake' },
    ROUTE_43: { grama: 'grass', surf: 'lake' },
    ROUTE_44: { grama: 'grass', surf: 'lake' },
    ROUTE_26: { grama: 'grass', surf: 'lake' },
    ROUTE_27: { grama: 'grass', surf: 'lake' },
    // Rota 46 e a ribanceira de Geodude e Spearow logo depois de Cherrygrove —
    // rochoso a ceu aberto em Lv 2-3, que e exatamente a entrada do
    // Subterraneo (`mountain`, profundidade 0.15).
    ROUTE_46: 'mountain',
    ROUTE_45: { grama: 'mountain', surf: 'lake' },
    // Rota 28 e a subida pro Mt. Silver: Lv 39-43, o mais alto do Gen2 fora
    // das cavernas.
    ROUTE_28: { grama: 'mountain', surf: 'lake' },

    // --- Kanto no Gen2 (mesmas rotas, outra tabela) ------------------------
    ROUTE_1: 'plains',
    ROUTE_2: 'plains',
    ROUTE_22: { grama: 'plains', surf: 'lake' },
    ROUTE_16: 'plains',
    ROUTE_17: 'plains',
    ROUTE_18: 'plains',
    ROUTE_5: 'grass',
    ROUTE_6: { grama: 'grass', surf: 'lake' },
    ROUTE_7: 'grass',
    ROUTE_8: 'grass',
    ROUTE_11: 'grass',
    ROUTE_13: { grama: 'grass', surf: 'lake' },
    ROUTE_14: 'grass',
    ROUTE_15: 'grass',
    ROUTE_24: { grama: 'grass', surf: 'lake' },
    ROUTE_25: { grama: 'grass', surf: 'lake' },
    ROUTE_12: { surf: 'lake' },
    ROUTE_21: { grama: 'grass', surf: 'sea' },
    ROUTE_3: 'mountain',
    ROUTE_4: { grama: 'mountain', surf: 'lake' },
    ROUTE_9: { grama: 'mountain', surf: 'lake' },
    ROUTE_10_NORTH: { grama: 'mountain', surf: 'lake' },

    // --- caverna ------------------------------------------------------------
    MOUNT_MOON: 'cave',
    ROCK_TUNNEL_1F: 'cave',
    ROCK_TUNNEL_B1F: 'cave',
    DIGLETTS_CAVE: 'cave',
    DARK_CAVE_VIOLET_ENTRANCE: { grama: 'cave', surf: 'lake' },
    DARK_CAVE_BLACKTHORN_ENTRANCE: { grama: 'cave', surf: 'lake' },
    UNION_CAVE_1F: { grama: 'cave', surf: 'lake' },
    UNION_CAVE_B1F: { grama: 'cave', surf: 'lake' },
    UNION_CAVE_B2F: { grama: 'cave', surf: 'lake' },
    SLOWPOKE_WELL_B1F: { grama: 'cave', surf: 'lake' },
    SLOWPOKE_WELL_B2F: { grama: 'cave', surf: 'lake' },
    MOUNT_MORTAR_1F_INSIDE: 'cave',
    MOUNT_MORTAR_2F_INSIDE: { grama: 'cave', surf: 'lake' },
    MOUNT_MORTAR_B1F: { grama: 'cave', surf: 'lake' },
    // A unica parte do Mt. Mortar que e a ceu aberto.
    MOUNT_MORTAR_1F_OUTSIDE: { grama: 'mountain', surf: 'lake' },
    TOHJO_FALLS: { grama: 'cave', surf: 'lake' },
    VICTORY_ROAD: 'cave',
    DRAGONS_DEN_B1F: { surf: 'lake' },
    // As Ilhas Redemoinho sao um labirinto de caverna marinha; a grama e
    // interior de caverna e a agua e o poco dentro dela.
    WHIRL_ISLAND_NE: 'cave',
    WHIRL_ISLAND_NW: 'cave',
    WHIRL_ISLAND_SE: 'cave',
    WHIRL_ISLAND_SW: { grama: 'cave', surf: 'lake' },
    WHIRL_ISLAND_CAVE: 'cave',
    WHIRL_ISLAND_B1F: 'cave',
    WHIRL_ISLAND_B2F: { grama: 'cave', surf: 'lake' },
    WHIRL_ISLAND_LUGIA_CHAMBER: { grama: 'cave', surf: 'lake' },
    // Mt. Silver: o lado de fora e montanha, os quartos internos sao o fundo
    // do `cave` — Lv 45-53, o mais alto do Gen2.
    SILVER_CAVE_OUTSIDE: { grama: 'mountain', surf: 'lake' },
    SILVER_CAVE_ROOM_1: 'cave',
    SILVER_CAVE_ROOM_2: { grama: 'cave', surf: 'lake' },
    SILVER_CAVE_ROOM_3: 'cave',
    SILVER_CAVE_ITEM_ROOMS: 'cave',

    // --- gelo ---------------------------------------------------------------
    ICE_PATH_1F: 'ice-cave',
    ICE_PATH_B1F: 'ice-cave',
    ICE_PATH_B2F_BLACKTHORN_SIDE: 'ice-cave',
    ICE_PATH_B2F_MAHOGANY_SIDE: 'ice-cave',
    ICE_PATH_B3F: 'ice-cave',

    // --- floresta e campina -------------------------------------------------
    ILEX_FOREST: { grama: 'forest', surf: 'lake' },
    // Parque Nacional e campo cercado com flores e caca de insetos, nao mata
    // fechada: Caterpie, Pidgey, Sunkern, Hoothoot, Venonat.
    NATIONAL_PARK: 'meadow',

    // --- construido e sagrado ----------------------------------------------
    // Torre Latao e a torre sagrada do Ho-Oh; Torre Broto e o templo dos
    // Bellsprout. As duas sao `temple`, do bioma Sagrado.
    SPROUT_TOWER_2F: 'temple',
    SPROUT_TOWER_3F: 'temple',
    TIN_TOWER_2F: 'temple',
    TIN_TOWER_3F: 'temple',
    TIN_TOWER_4F: 'temple',
    TIN_TOWER_5F: 'temple',
    TIN_TOWER_6F: 'temple',
    TIN_TOWER_7F: 'temple',
    TIN_TOWER_8F: 'temple',
    TIN_TOWER_9F: 'temple',
    // A Torre Queimada e a ruina ao lado da Torre Latao — chao desabado,
    // Koffing e Magmar no subsolo. Cemiterio, nao templo.
    BURNED_TOWER_1F: 'graveyard',
    BURNED_TOWER_B1F: 'graveyard',
    RUINS_OF_ALPH_OUTSIDE: { grama: 'ruins', surf: 'lake' },
    RUINS_OF_ALPH_INNER_CHAMBER: 'ruins',

    // --- agua de cidade -----------------------------------------------------
    // Costeira -> `beach` (e a orla). Interior -> `lake`.
    NEW_BARK_TOWN: { surf: 'beach' },
    CHERRYGROVE_CITY: { surf: 'beach' },
    OLIVINE_CITY: { surf: 'beach' },
    OLIVINE_PORT: { surf: 'beach' },
    CIANWOOD_CITY: { surf: 'beach' },
    VERMILION_CITY: { surf: 'beach' },
    VERMILION_PORT: { surf: 'beach' },
    PALLET_TOWN: { surf: 'beach' },
    CINNABAR_ISLAND: { surf: 'beach' },
    FUCHSIA_CITY: { surf: 'beach' },
    VIOLET_CITY: { surf: 'lake' },
    ECRUTEAK_CITY: { surf: 'lake' },
    BLACKTHORN_CITY: { surf: 'lake' },
    CELADON_CITY: { surf: 'lake' },
    CERULEAN_CITY: { surf: 'lake' },
    VIRIDIAN_CITY: { surf: 'lake' },
    LAKE_OF_RAGE: { surf: 'lake' },

    // --- mar ----------------------------------------------------------------
    ROUTE_19: { surf: 'sea' },
    ROUTE_20: { surf: 'sea' },
    ROUTE_40: { surf: 'sea' },
    ROUTE_41: { surf: 'sea' },
  },

  // =========================================================================
  // Gen 3 — Hoenn (pret/pokeemerald)
  // =========================================================================
  emerald: {
    // --- rotas de campo -----------------------------------------------------
    MAP_ROUTE101: 'plains',
    MAP_ROUTE102: { grama: 'plains', surf: 'lake', pesca: 'lake' },
    MAP_ROUTE103: { grama: 'plains', surf: 'lake', pesca: 'lake' },
    // Rota 104 tem os dois lados da ponte: grama ao norte, praia ao sul.
    MAP_ROUTE104: { grama: 'plains', surf: 'beach', pesca: 'beach' },
    MAP_ROUTE116: 'plains',
    MAP_ROUTE110: { grama: 'grass', surf: 'lake', pesca: 'lake' },
    MAP_ROUTE117: { grama: 'grass', surf: 'lake', pesca: 'lake' },
    MAP_ROUTE118: { grama: 'grass', surf: 'lake', pesca: 'lake' },
    // As rotas de capim comprido de Hoenn — a grama alta que esconde o
    // jogador inteiro. E o unico analogo real de `tall-grass`.
    MAP_ROUTE119: { grama: 'tall-grass', surf: 'lake', pesca: 'lake' },
    MAP_ROUTE120: { grama: 'tall-grass', surf: 'lake', pesca: 'lake' },
    MAP_ROUTE121: { grama: 'tall-grass', surf: 'sea', pesca: 'sea' },
    MAP_ROUTE123: { grama: 'tall-grass', surf: 'sea', pesca: 'sea' },

    // --- arido --------------------------------------------------------------
    // Rota 111 e a unica com deserto de verdade nos tres jogos: Trapinch,
    // Sandshrew, Cacnea, Baltoy, tempestade de areia permanente.
    MAP_ROUTE111: { grama: 'desert', pedra: 'desert', surf: 'lake', pesca: 'lake' },
    // Rota 113 e a chuva de cinza do Mt. Chimney. Tema de terra devastada,
    // mas Lv 14-16: vai pro raso do Aridos (`badlands`), e nao pro fundo
    // (`wasteland`) — ver a regra de profundidade no topo deste arquivo.
    MAP_ROUTE113: 'badlands',
    MAP_ROUTE114: { grama: 'badlands', pedra: 'badlands', surf: 'lake', pesca: 'lake' },
    // O tunel sob o deserto: Lv 35-45, o mais fundo do Aridos por nivel.
    MAP_DESERT_UNDERPASS: 'wasteland',
    // Torre Miragem e a torre antiga que aparece e desaparece na areia, com os
    // dois fosseis dentro. Ruina, e nao deserto.
    MAP_MIRAGE_TOWER_1F: 'ruins',
    MAP_MIRAGE_TOWER_2F: 'ruins',
    MAP_MIRAGE_TOWER_3F: 'ruins',
    MAP_MIRAGE_TOWER_4F: 'ruins',

    // --- montanha e caverna -------------------------------------------------
    MAP_ROUTE115: { grama: 'mountain', surf: 'sea', pesca: 'sea' },
    MAP_GRANITE_CAVE_1F: 'cave',
    MAP_GRANITE_CAVE_B1F: 'cave',
    MAP_GRANITE_CAVE_B2F: { grama: 'cave', pedra: 'cave' },
    MAP_GRANITE_CAVE_STEVENS_ROOM: 'cave',
    MAP_RUSTURF_TUNNEL: 'cave',
    MAP_METEOR_FALLS_1F_1R: { grama: 'cave', surf: 'lake', pesca: 'lake' },
    MAP_METEOR_FALLS_1F_2R: { grama: 'cave', surf: 'lake', pesca: 'lake' },
    MAP_METEOR_FALLS_B1F_1R: { grama: 'cave', surf: 'lake', pesca: 'lake' },
    MAP_METEOR_FALLS_B1F_2R: { grama: 'cave', surf: 'lake', pesca: 'lake' },
    MAP_METEOR_FALLS_STEVENS_CAVE: 'cave',
    MAP_CAVE_OF_ORIGIN_ENTRANCE: 'cave',
    MAP_CAVE_OF_ORIGIN_1F: 'cave',
    // Caverna do Artesao: Lv 40-50 de Smeargle, so pos-jogo.
    MAP_ARTISAN_CAVE_1F: 'cave',
    MAP_ARTISAN_CAVE_B1F: 'cave',
    MAP_VICTORY_ROAD_1F: 'cave',
    MAP_VICTORY_ROAD_B1F: { grama: 'cave', pedra: 'cave' },
    MAP_VICTORY_ROAD_B2F: { grama: 'cave', surf: 'lake', pesca: 'lake' },

    // --- igneo --------------------------------------------------------------
    MAP_ROUTE112: 'volcano',
    MAP_FIERY_PATH: 'volcano',
    MAP_JAGGED_PASS: 'volcano',
    MAP_MAGMA_HIDEOUT_1F: 'volcano',
    MAP_MAGMA_HIDEOUT_2F_1R: 'volcano',
    MAP_MAGMA_HIDEOUT_2F_2R: 'volcano',
    MAP_MAGMA_HIDEOUT_2F_3R: 'volcano',
    MAP_MAGMA_HIDEOUT_3F_1R: 'volcano',
    MAP_MAGMA_HIDEOUT_3F_2R: 'volcano',
    MAP_MAGMA_HIDEOUT_3F_3R: 'volcano',
    MAP_MAGMA_HIDEOUT_4F: 'volcano',

    // --- gelo ---------------------------------------------------------------
    // Caverna Cardume e a caverna de mare de Hoenn: Spheal e Snorunt dentro,
    // e a sala de gelo no fundo. O bioma Gelido inteiro sai daqui no dado real.
    MAP_SHOAL_CAVE_LOW_TIDE_ENTRANCE_ROOM: { grama: 'ice-cave', surf: 'sea', pesca: 'sea' },
    MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM: { grama: 'ice-cave', surf: 'sea', pesca: 'sea' },
    MAP_SHOAL_CAVE_LOW_TIDE_STAIRS_ROOM: 'ice-cave',
    MAP_SHOAL_CAVE_LOW_TIDE_LOWER_ROOM: 'ice-cave',
    MAP_SHOAL_CAVE_LOW_TIDE_ICE_ROOM: 'ice-cave',

    // --- sombrio e sagrado --------------------------------------------------
    // Monte Pira e o cemiterio de Hoenn: Shuppet, Duskull, Vulpix.
    MAP_MT_PYRE_1F: 'graveyard',
    MAP_MT_PYRE_2F: 'graveyard',
    MAP_MT_PYRE_3F: 'graveyard',
    MAP_MT_PYRE_4F: 'graveyard',
    MAP_MT_PYRE_5F: 'graveyard',
    MAP_MT_PYRE_6F: 'graveyard',
    MAP_MT_PYRE_EXTERIOR: 'graveyard',
    MAP_MT_PYRE_SUMMIT: 'graveyard',
    // Pilar do Ceu e o templo do Rayquaza.
    MAP_SKY_PILLAR_1F: 'temple',
    MAP_SKY_PILLAR_3F: 'temple',
    MAP_SKY_PILLAR_5F: 'temple',

    // --- industrial ---------------------------------------------------------
    MAP_NEW_MAUVILLE_ENTRANCE: 'power-plant',
    MAP_NEW_MAUVILLE_INSIDE: 'power-plant',

    // --- floresta e pantano -------------------------------------------------
    MAP_PETALBURG_WOODS: 'forest',
    // Zona Safari de Hoenn: campina cercada na grama, pantano na agua. A agua
    // daqui e o unico dado real de `swamp` dos tres jogos.
    MAP_SAFARI_ZONE_SOUTH: 'meadow',
    // A grama da Zona Safari e campina; o QUEBRA-PEDRA dela nao e — sao Geodude
    // e Nosepass em Lv 5-30, saindo de pedra. Manda-los pra `meadow` fazia o
    // estagio 1 da Campina ser 80% Geodude, porque a grama da Safari e Lv 22-40
    // e nao alcanca o estagio 1: a unica tabela real que sobrava la era a de
    // pedra. Quebra-pedra vai pro rochoso raso, que e `mountain`.
    MAP_SAFARI_ZONE_NORTH: { grama: 'meadow', pedra: 'mountain' },
    MAP_SAFARI_ZONE_NORTHEAST: 'meadow',
    MAP_SAFARI_ZONE_SOUTHEAST: { grama: 'meadow', surf: 'swamp', pesca: 'swamp' },
    MAP_SAFARI_ZONE_NORTHWEST: { grama: 'meadow', surf: 'swamp', pesca: 'swamp' },
    MAP_SAFARI_ZONE_SOUTHWEST: { grama: 'meadow', surf: 'swamp', pesca: 'swamp' },

    // --- fundo do mar -------------------------------------------------------
    MAP_UNDERWATER_ROUTE124: { surf: 'seabed' },
    MAP_UNDERWATER_ROUTE126: { surf: 'seabed' },
    // O Navio Abandonado esta afundado, e a Caverna do Leito Marinho e o
    // esconderijo da Equipe Aqua no fundo do mar.
    MAP_ABANDONED_SHIP_ROOMS_B1F: { surf: 'seabed', pesca: 'seabed' },
    MAP_ABANDONED_SHIP_HIDDEN_FLOOR_CORRIDORS: { surf: 'seabed', pesca: 'seabed' },
    MAP_SEAFLOOR_CAVERN_ENTRANCE: { surf: 'seabed', pesca: 'seabed' },
    MAP_SEAFLOOR_CAVERN_ROOM1: 'seabed',
    MAP_SEAFLOOR_CAVERN_ROOM2: 'seabed',
    MAP_SEAFLOOR_CAVERN_ROOM3: 'seabed',
    MAP_SEAFLOOR_CAVERN_ROOM4: 'seabed',
    MAP_SEAFLOOR_CAVERN_ROOM5: 'seabed',
    MAP_SEAFLOOR_CAVERN_ROOM6: { grama: 'seabed', surf: 'seabed', pesca: 'seabed' },
    MAP_SEAFLOOR_CAVERN_ROOM7: { grama: 'seabed', surf: 'seabed', pesca: 'seabed' },
    MAP_SEAFLOOR_CAVERN_ROOM8: 'seabed',

    // --- mar aberto ---------------------------------------------------------
    MAP_ROUTE105: { surf: 'sea', pesca: 'sea' },
    MAP_ROUTE106: { surf: 'sea', pesca: 'sea' },
    MAP_ROUTE107: { surf: 'sea', pesca: 'sea' },
    MAP_ROUTE108: { surf: 'sea', pesca: 'sea' },
    MAP_ROUTE109: { surf: 'sea', pesca: 'sea' },
    MAP_ROUTE122: { surf: 'sea', pesca: 'sea' },
    MAP_ROUTE124: { surf: 'sea', pesca: 'sea' },
    MAP_ROUTE125: { surf: 'sea', pesca: 'sea' },
    MAP_ROUTE126: { surf: 'sea', pesca: 'sea' },
    MAP_ROUTE127: { surf: 'sea', pesca: 'sea' },
    MAP_ROUTE128: { surf: 'sea', pesca: 'sea' },
    MAP_ROUTE129: { surf: 'sea', pesca: 'sea' },
    MAP_ROUTE130: { surf: 'sea', pesca: 'sea' },
    MAP_ROUTE131: { surf: 'sea', pesca: 'sea' },
    MAP_ROUTE132: { surf: 'sea', pesca: 'sea' },
    MAP_ROUTE133: { surf: 'sea', pesca: 'sea' },
    MAP_ROUTE134: { surf: 'sea', pesca: 'sea' },

    // --- agua de cidade -----------------------------------------------------
    MAP_DEWFORD_TOWN: { surf: 'beach', pesca: 'beach' },
    MAP_SLATEPORT_CITY: { surf: 'beach', pesca: 'beach' },
    MAP_LILYCOVE_CITY: { surf: 'beach', pesca: 'beach' },
    MAP_MOSSDEEP_CITY: { surf: 'beach', pesca: 'beach' },
    MAP_PACIFIDLOG_TOWN: { surf: 'beach', pesca: 'beach' },
    MAP_EVER_GRANDE_CITY: { surf: 'beach', pesca: 'beach' },
    MAP_PETALBURG_CITY: { surf: 'lake', pesca: 'lake' },
    // Sootopolis e a cratera fechada no meio do mar — agua parada, nao orla.
    MAP_SOOTOPOLIS_CITY: { surf: 'lake', pesca: 'lake' },
  },
}

/**
 * O sub-bioma de um par `(geracao, local, terreno)`, ou `null` se ele foi
 * descartado de proposito. ABORTA quando o par nao esta declarado em lugar
 * nenhum — par novo tem que ser decidido, e nao cair num default.
 */
export function subBiomaDoLocal(geracao, local, terreno) {
  // Terreno descartado inteiro vem primeiro: ele vale pros tres jogos.
  for (const chave of [terreno, `${geracao}|${local}|${terreno}`, `${geracao}|${local}`]) {
    if (chave in DESCARTADOS) return null
  }
  const entrada = MAPA_DE_LOCAIS[geracao]?.[local]
  if (entrada == null) {
    throw new Error(
      `local sem destino: ${geracao}|${local} (terreno ${terreno}).\n` +
      'Todo par (local, terreno) precisa de sub-bioma declarado em ' +
      'scripts/mapa-de-locais.mjs, ou entrada em DESCARTADOS com o motivo. ' +
      'Cair num default aqui alocaria uma rota inteira no lugar errado sem aviso.',
    )
  }
  if (typeof entrada === 'string') return entrada
  const alvo = entrada[terreno]
  if (alvo == null) {
    throw new Error(
      `terreno sem destino: ${geracao}|${local}|${terreno}.\n` +
      `O local esta declarado, mas so pros terrenos ${Object.keys(entrada).join(', ')}.`,
    )
  }
  return alvo
}
