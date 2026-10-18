// Os 12 biomas do jogo e seus sub-biomas (65 desde a onda 1 de 16/10/2026).
//
// Este arquivo SUBSTITUI o desenho antigo de hunts ("1 tipo elemental = 1
// bioma", que vivia em scripts/sync-planilha.js#TYPE_BIOME_PLAN e produzia 69
// hunts recortadas por regiao). Ver data/huntSpawnOverrides.ts, que monta as
// hunts a partir daqui.
//
// A DIVISAO DE TRABALHO ENTRE OS TRES ARQUIVOS:
//
//   generated/subBiomas.generated.ts   QUEM aparece em cada sub-bioma
//                                      (derivado das pools do PokeRogue)
//   biomas.ts (este)                   COMO os sub-biomas se agrupam, com que
//                                      CHANCE a sala cai em cada um, que LOOT
//                                      cada um da, e a geometria/arte
//   huntSpawnOverrides.ts              monta as 31 hunts com os dois acima
//
// Escrito a mao de proposito: agrupamento tematico, peso e loot sao decisao de
// game design, nao dado derivavel. As listas de especie, que sao grandes e
// mudam com o roster, essas sim sao geradas.
import type { Continent, ElementType, MapItemDrop } from './generated/types'

// ---------------------------------------------------------------------------
// AS TRES FAIXAS DE NIVEL SAIRAM DAQUI NA PH-434
// ---------------------------------------------------------------------------
// `FAIXAS`, `FaixaDef`, `FaixaId` e `FAIXA_POR_ID` descreviam o mundo em tres
// degraus de 30 niveis, com teto em 90. O redesenho de 02/09 trocou isso por 10
// ESTAGIOS de 10 niveis por bioma, com teto em 100 (data/estagios.ts), e as
// pecas foram saindo issue a issue: as hunts (PH-426), o motor de salas
// (PH-427), o progresso (PH-429), o gate (PH-430) e o portao do Campeao Lance
// (PH-432). Esta issue apaga o que sobrou.
//
// Sairam junto `huntId(bioma, faixa)`, `biomaDoMapId` e `indiceDoBiomaNoMapId`:
// os tres liam ou montavam o mapId no formato `<bioma>_faixa<N>`, que nenhuma
// hunt usa mais.
//
// O QUE NAO SAIU, E POR QUE. A traducao do save antigo continua lendo
// `{faixa1, faixa2, faixa3}` e `<bioma>_faixa<N>` — ha linha no banco com os
// dois formatos convivendo (ver PH-440), e enquanto houver, ler o formato
// velho e obrigacao. Ela mora em data/progressoDeBioma.ts, isolada, com a
// ordem dos biomas CONGELADA junto dela (`ORDEM_LEGADA_DOS_BIOMAS`): save
// antigo se le com a regra antiga, e a regra antiga nao pode depender de uma
// constante viva que muda amanha.

/**
 * O grupo de gate das hunts que nascem abertas.
 *
 * ERAM AS DUAS PRIMEIRAS FAIXAS ATE A PH-432, e o encolhimento aqui e o fim da
 * ponte que a PH-426 tinha montado. O raciocinio: `continent` existe pra dizer
 * "este conteudo esta liberado?", e nas hunts de bioma essa pergunta passou a
 * ser respondida pelo ESTAGIO (PH-430 — o estagio 1 sempre aberto, o N pede o
 * N-1). Manter as faixas aqui era uma segunda trava que dizia a mesma coisa com
 * granularidade pior: ela barrava o estagio 7 inteiro atras do Campeao Lance
 * quando o gate de estagio ja o barra atras do estagio 6.
 *
 * O que `continent` ainda decide de verdade e UMA coisa: o Modo Pesadelo (e as
 * 11 hunts BOSS dentro dele) esta aberto? Isso continua sendo o premio do
 * Lance.
 */
export const GRUPOS_INICIAIS: Continent[] = ['biomas']

/**
 * O que derrotar o Campeao Lance libera.
 *
 * Encolheu de `['faixa3', 'nightmare']` pra so o Pesadelo na PH-432: a faixa3
 * deixou de existir como grupo, e o que era "a faixa III" agora sao os estagios
 * 7 a 10, liberados um a um pelo proprio progresso do bioma.
 */
export const GRUPOS_DO_LANCE: Continent[] = ['nightmare']

/**
 * Quantos estagios de CADA um dos 12 biomas o jogador precisa ter limpo pra
 * poder desafiar o Campeao Lance (PH-432).
 *
 * Cinco = a metade do modo normal, em toda parte do mapa. Era um gate por
 * grupo de faixa, que com os 12 biomas independentes deixou de significar
 * algo.
 *
 * COLISAO CONHECIDA E ACEITA: o estagio 5 cobre Lv 41-50, mas os estagios 6 a
 * 10 ficam abertos o tempo todo (o gate e por bioma, nao global), entao o
 * jogador tende a chegar ao Lance com o time em Lv 100 e o duelo — desenhado
 * pra Lv 55-65 — vira formalidade. Registrado no desenho de 02/09 como
 * consequencia aceita, e nao e escopo desta issue resolver.
 */
export const ESTAGIOS_PARA_O_LANCE = 5

// Grupos que existiam antes das faixas e que nenhuma hunt usa mais. Save
// antigo os carrega; sao traduzidos na carga, nunca propagados — 'kanto' vira
// o que o Lance libera hoje, 'johto' some (as faixas iniciais entram sempre).
//
// 'nightmare' SAIU DESTA LISTA em 2026-08-18, e a remocao E o conserto de um
// bug de progresso apagado. Ele estava aqui porque no esquema antigo nascia
// aberto pra todo mundo, e mante-lo daria de graca o conteudo que virou gate
// do Lance. Só que 'nightmare' TAMBEM e um dos dois grupos que o Lance
// concede hoje (GRUPOS_DO_LANCE logo acima) — e o filtro nao sabe distinguir
// "veio de graca do esquema velho" de "foi conquistado ontem". Resultado: o
// jogador derrotava o Lance, o Modo Pesadelo abria, o servidor gravava
// direitinho em `players.unlocked_continents`... e o merge da carga seguinte
// jogava fora, toda vez. Na tela: "Bloqueado — Derrote o Campeao Lance" em
// todas as 11 hunts, com a conquista registrada no banco e no Hall da Fama.
//
// Reproduzido ao vivo antes do fix, e o bug era INTERMITENTE de um jeito que
// atrasa o diagnostico: quando havia catch-up offline logo depois da carga, a
// resposta do servidor sobrescrevia a store com a lista correta e o Pesadelo
// "voltava" sozinho.
//
// Tirar daqui e seguro porque o esquema antigo ja foi limpo NO BANCO pela
// migration 20260814140000: ela reescreveu `unlocked_continents` de TODA linha
// (faixas iniciais + os dois grupos do Lance so pra quem tinha 'kanto'),
// entao nenhuma linha carrega mais o 'nightmare' gratuito que este filtro
// existia pra barrar. O unico 'nightmare' que chega aqui hoje foi conquistado.
// PH-434: as TRES FAIXAS entraram nesta lista. Save escrito antes do redesenho
// carrega `faixa1`/`faixa2`/`faixa3` em `unlocked_continents`, e nenhuma hunt
// tem mais esse `continent` — mante-las na lista do jogador nao quebra nada,
// mas deixa lixo que ninguem sabe se ainda importa, pra sempre. Descartar na
// carga e o mesmo tratamento que 'johto' levou.
//
// `faixa3` NAO precisa virar 'nightmare' no lugar: quem venceu o Lance ja tem
// 'nightmare' na lista (os dois eram concedidos juntos), entao o Pesadelo
// sobrevive por conta propria. Traduzir daria o Pesadelo de graca a quem nunca
// o venceu — o mesmo bug que a nota do 'nightmare' acima descreve.
export const GRUPOS_LEGADOS: ReadonlySet<string> = new Set([
  'johto', 'kanto', 'faixa1', 'faixa2', 'faixa3',
])

/**
 * O grupo de gate da hunt esta liberado pra este jogador?
 *
 * PH-447: GRUPO INICIAL E LIBERADO POR DEFINICAO, E NAO POR ESTAR NA LISTA DA
 * LINHA. Ate aqui as duas pontas perguntavam
 * `unlockedContinents.includes(grupo)` direto, e isso amarrou "o mundo esta
 * aberto?" ao CONTEUDO de `players.unlocked_continents` — uma coluna escrita
 * por saves antigos, com nome de grupo que o codigo ja renomeou duas vezes.
 *
 * O ESTRAGO REAL, medido em producao em 02/09: a PH-434 trocou
 * `GRUPOS_INICIAIS` de `['faixa1','faixa2']` pra `['biomas']`, nenhuma
 * migration reescreveu a coluna, e as 8 linhas do banco continuaram com
 * `faixa1`/`faixa2`. Resultado: `includes('biomas')` falso pra todo mundo, e
 * TODA hunt do jogo — a Rota 46 inicial e os 120 estagios de bioma — respondeu
 * "Derrote o Campeao Lance antes de acessar Mundo". O jogo inteiro trancado,
 * com deploy verde e 2977 testes passando.
 *
 * Por que a checagem por definicao e a resposta certa, e nao so a migration: o
 * grupo inicial NUNCA pode estar fechado. Ele e o que nasce aberto — e a
 * pergunta "o jogador desbloqueou o que nasce aberto?" nao tem resposta util,
 * so tem resposta errada. O que `continent` decide de verdade e uma coisa so
 * (o Modo Pesadelo, premio do Lance), e essa continua vindo da lista.
 *
 * Fica ao lado de `GRUPOS_INICIAIS` porque as duas pontas chamam a MESMA
 * funcao — o gate da autoridade (`appSessao.ts`) e o menu (`HuntMenu.tsx`).
 * Mesmo motivo de `bloqueioDoEstagio` morar em `progressoDeBioma.ts`: regra
 * calculada em dois lugares diverge, e o jogador ve hunt aberta que o servidor
 * recusa.
 */
export function grupoLiberado(grupo: string, liberados: readonly string[]): boolean {
  if ((GRUPOS_INICIAIS as readonly string[]).includes(grupo)) return true
  return liberados.includes(grupo)
}

/**
 * Traduz `unlocked_continents` de um save pro vocabulario de hoje.
 *
 * A FONTE UNICA DA TRADUCAO (PH-447). Ela existia SO no `merge` do `persist`
 * (`stores/gameStateStore.ts`), e o caminho remoto — `remote/playerMapper.ts`,
 * que e o que vale sob autoridade — repassava a coluna crua. Os dois caminhos
 * de carga discordavam sobre o que o jogador tem liberado, e o remoto era o
 * errado.
 *
 * Pior: `stores/gateDoLance.test.ts` COPIAVA esta formula em vez de importa-la
 * ("a mesma traducao que o merge aplica"), entao o teste provava a copia e
 * ninguem cobria o caminho remoto. E o modo de falha que
 * `docs/` chama de "concordar na formula nao basta".
 *
 * As tres regras, na ordem:
 *
 *  - `GRUPOS_INICIAIS` entram SEMPRE, mesmo em save que nao os tinha (e o caso
 *    de todo save escrito antes da PH-434);
 *  - `'kanto'` era o que o Lance liberava, entao vira o que ele libera hoje;
 *  - o resto de `GRUPOS_LEGADOS` (`'johto'`, `faixa1..3`) e DESCARTADO. Ver a
 *    nota de `GRUPOS_LEGADOS` acima pro porque `'nightmare'` nao esta la.
 */
export function traduzirGruposLiberados(gravados: readonly string[] | null | undefined): string[] {
  return [...new Set([
    ...GRUPOS_INICIAIS,
    ...(gravados ?? []).flatMap((c) => (
      c === 'kanto' ? GRUPOS_DO_LANCE : GRUPOS_LEGADOS.has(c) ? [] : [c]
    )),
  ])]
}

// ---------------------------------------------------------------------------
// Loot por sub-bioma
// ---------------------------------------------------------------------------
// Antes TODA hunt dropava exatamente `potion 15% / poke_ball 10%` — conferido
// no dado gerado, as 19 eram identicas. Aqui o loot passa a dizer alguma coisa
// sobre o lugar. Nao ha item novo: sao os mesmos 10 consumiveis reais.
//
// As Pedras (data/stones.ts) continuam FORA daqui — elas caem por um roll
// universal de 20% por abate, com o tipo primario do inimigo
// (economySystem#awardKillLoot), e nao por hunt.
export type PerfilDeLoot =
  | 'basico' | 'civilizado' | 'remoto' | 'profundo'
  // Onda 1 dos sub-biomas novos (16/10/2026): o perfil passa a dizer algo do
  // LUGAR, e nao so da distancia. Mesmos itens de sempre, nenhum item novo:
  // so que a cura de status certa aparece onde o perigo dela mora.
  | 'termal' | 'toxico' | 'ardente' | 'gelado' | 'portuario' | 'sucata' | 'sonolento' | 'vitoria'
  // Onda 2 (salas especiais).
  | 'safari' | 'cofre'

export const LOOT: Record<PerfilDeLoot, MapItemDrop[]> = {
  // O mesmo drop que todas as hunts tinham. Lugar comum, item comum.
  basico: [
    { itemId: 'potion', chance: 0.15 },
    { itemId: 'poke_ball', chance: 0.1 },
  ],
  // Perto de gente: sobra suprimento basico e aparece bola melhor.
  civilizado: [
    { itemId: 'potion', chance: 0.18 },
    { itemId: 'poke_ball', chance: 0.14 },
    { itemId: 'great_ball', chance: 0.05 },
  ],
  // Longe de tudo: menos volume, qualidade melhor.
  remoto: [
    { itemId: 'super_potion', chance: 0.1 },
    { itemId: 'great_ball', chance: 0.08 },
    { itemId: 'revive', chance: 0.03 },
  ],
  // Fundo do mapa: o loot mais raro do jogo.
  profundo: [
    { itemId: 'hyper_potion', chance: 0.06 },
    { itemId: 'ultra_ball', chance: 0.05 },
    { itemId: 'max_revive', chance: 0.015 },
  ],
  // Fontes Termais: o lugar de descanso. Mais pocao que qualquer outro
  // sub-bioma, inclusive Hiper Pocao fora do fundo do mapa.
  termal: [
    { itemId: 'potion', chance: 0.2 },
    { itemId: 'super_potion', chance: 0.12 },
    { itemId: 'hyper_potion', chance: 0.04 },
    { itemId: 'burn_heal', chance: 0.05 },
  ],
  // Esgoto, ciclovia dos motoqueiros (Koffing), clareira de esporos.
  toxico: [
    { itemId: 'potion', chance: 0.15 },
    { itemId: 'poke_ball', chance: 0.1 },
    { itemId: 'antidote', chance: 0.1 },
  ],
  // Tuneis de lava e torre queimada.
  ardente: [
    { itemId: 'potion', chance: 0.12 },
    { itemId: 'great_ball', chance: 0.06 },
    { itemId: 'burn_heal', chance: 0.08 },
  ],
  // Gelo: remoto, com Antigelo.
  gelado: [
    { itemId: 'super_potion', chance: 0.1 },
    { itemId: 'great_ball', chance: 0.08 },
    { itemId: 'ice_heal', chance: 0.08 },
    { itemId: 'revive', chance: 0.02 },
  ],
  // Cais do porto: carga de navio. A Premier Ball so cai aqui.
  portuario: [
    { itemId: 'potion', chance: 0.16 },
    { itemId: 'poke_ball', chance: 0.14 },
    { itemId: 'premier_ball', chance: 0.06 },
  ],
  // Ferro-velho: lixo toxico e fio desencapado.
  sucata: [
    { itemId: 'potion', chance: 0.15 },
    { itemId: 'poke_ball', chance: 0.1 },
    { itemId: 'antidote', chance: 0.06 },
    { itemId: 'paralyze_heal', chance: 0.06 },
  ],
  // Torre Broto: Gastly, Hypno e o incenso dos Sabios.
  sonolento: [
    { itemId: 'potion', chance: 0.15 },
    { itemId: 'poke_ball', chance: 0.1 },
    { itemId: 'awakening', chance: 0.08 },
  ],
  // Zona Safari: o lugar das bolas boas.
  safari: [
    { itemId: 'great_ball', chance: 0.12 },
    { itemId: 'ultra_ball', chance: 0.06 },
    { itemId: 'super_potion', chance: 0.08 },
  ],
  // Esconderijo Rocket: o cofre do cassino, bola em volume.
  cofre: [
    { itemId: 'poke_ball', chance: 0.2 },
    { itemId: 'great_ball', chance: 0.1 },
    { itemId: 'ultra_ball', chance: 0.04 },
    { itemId: 'antidote', chance: 0.06 },
  ],
  // Estrada da Vitoria: o teste final pede Revive.
  vitoria: [
    { itemId: 'hyper_potion', chance: 0.06 },
    { itemId: 'ultra_ball', chance: 0.05 },
    { itemId: 'revive', chance: 0.05 },
    { itemId: 'max_revive', chance: 0.02 },
  ],
}

// ---------------------------------------------------------------------------
// Sub-biomas e biomas
// ---------------------------------------------------------------------------
export interface SubBiomaDef {
  /** Casa com a chave em `SUB_BIOMA_ESPECIES` (generated/subBiomas.generated.ts). */
  chave: string
  nome: string
  /**
   * Chance relativa de uma sala cair neste sub-bioma, dentro do bioma.
   * 10 = corriqueiro, 6 = incomum, 3 = o lugar raro do bioma.
   */
  peso: number
  loot: PerfilDeLoot
  /**
   * Fundo PROPRIO do sub-bioma, so quando difere do bioma-pai. Ausente = herda
   * `bioma.bg` (ver `backgroundParaSala`). Antes de 2026-08-15 nao existia —
   * as 33 sub-biomas de um bioma sempre mostravam a mesma imagem, mesmo com o
   * HUD ja anunciando "Mato Alto Lv18-21" a cada troca de sala.
   */
  bg?: { primary: string; secondary: string; image: string }
}

/**
 * SALA ESPECIAL (onda 2, 16/10/2026): lugar raro, tirado do anime e dos jogos
 * (Zona Safari, Monte Lua, Torre Pokemon...). NAO entra na curva de
 * profundidade nem na trilha do menu: `novaSala` tenta primeiro a sala
 * especial, com `CHANCE_DE_SALA_ESPECIAL`, e so cai no sorteio normal se ela
 * nao sair.
 *
 * `peso` e o peso ENTRE as especiais do mesmo bioma (hoje todas 1: sorteio
 * uniforme). E o UNICO lugar onde os iniciais de Kanto, Eevee e Porygon nascem.
 */
export interface SalaEspecialDef extends SubBiomaDef {
  /** A partir de que estagio do bioma ela pode aparecer. */
  estagioMinimo: number
  /** Pedra tematica: um sorteio EXTRA de Pedra deste tipo a cada abate na sala. */
  pedra?: ElementType
  /** Chance de shiny multiplicada para UMA especie nesta sala (Lago da Furia). */
  shiny?: { especie: string; multiplicador: number }
}

export interface BiomaDef {
  chave: string
  nome: string
  /** Tipo elemental dominante — decide so a cor do cartao no menu de hunts. */
  tipo: ElementType
  bg: { primary: string; secondary: string; image: string }
  subBiomas: SubBiomaDef[]
  /** Salas especiais do bioma (onda 2). Ausente = o bioma nao tem. */
  especiais?: SalaEspecialDef[]
}

/**
 * Chance de a PROXIMA sala virar uma sala especial do bioma.
 *
 * 5% DURANTE O BETA, por decisao do dono (16/10/2026); depois do beta cai pra
 * 1%. E UMA constante so, e de proposito: cliente e servidor rodam este mesmo
 * bundle, entao trocar aqui troca nos dois.
 */
export const CHANCE_DE_SALA_ESPECIAL = 0.05

/**
 * Chance do sorteio EXTRA da Pedra tematica numa sala especial. Igual a chance
 * de Pedra comum (`STONE_DROP_CHANCE`): na sala especial a Pedra cai em dobro,
 * e a metade extra e sempre do tipo do lugar.
 */
export const CHANCE_DA_PEDRA_TEMATICA = 0.05

/**
 * Teto do multiplicador de shiny de uma sala especial. O dono aprovou "com
 * teto" (16/10/2026): shiny alimenta o Mercado, e o teste do catalogo reprova
 * acima disto.
 */
export const MULTIPLICADOR_DE_SHINY_MAXIMO = 10

// As 7 imagens antigas (uma por bioma, compartilhada por todos os sub-biomas
// dele) saem de uso aqui, substituidas pela leva de 2026-08-15 — ficam no
// disco sem referencia, nada foi apagado. `dojo` e a UNICA que continua:
// segue exclusiva do sub-bioma "Dojo" (e da hunt de Treinamento, em
// trainingDummy.ts), preservada de proposito em vez de cair no fundo novo do
// bioma Urbano.
const ARTE = {
  dojo: 'assets/hunt-backgrounds/dojo.jpg',

  // Bioma-padrao (usado pelo bioma inteiro e por todo sub-bioma sem imagem
  // propria) + os sub-biomas com correspondencia EXATA de nome — ver o
  // mapeamento completo na mensagem que acompanhou esta leva.
  planicie: 'assets/hunt-backgrounds/plains.jpg',
  campina: 'assets/hunt-backgrounds/meadow.jpg',
  vilarejo: 'assets/hunt-backgrounds/town.jpg',
  vilarejoNoturno: 'assets/hunt-backgrounds/town-night.jpg',
  metropole: 'assets/hunt-backgrounds/metropolis.jpg',
  cortico: 'assets/hunt-backgrounds/slum.jpg',
  florestaPadrao: 'assets/hunt-backgrounds/forest.jpg',
  matoAlto: 'assets/hunt-backgrounds/tall-grass.jpg',
  selva: 'assets/hunt-backgrounds/jungle.jpg',
  ilha: 'assets/hunt-backgrounds/island.jpg',
  marAberto: 'assets/hunt-backgrounds/sea.jpg',
  praia: 'assets/hunt-backgrounds/beach.jpg',
  lago: 'assets/hunt-backgrounds/lake.jpg',
  pantano: 'assets/hunt-backgrounds/swamp.jpg',
  ermos: 'assets/hunt-backgrounds/badlands.jpg',
  deserto: 'assets/hunt-backgrounds/desert.jpg',
  terraDevastada: 'assets/hunt-backgrounds/wasteland.jpg',
  montanha: 'assets/hunt-backgrounds/mountain.jpg',
  cavernaVulcanica: 'assets/hunt-backgrounds/cave-volcanic.jpg',
  cavernaDeGelo: 'assets/hunt-backgrounds/ice-cave.jpg',
  montanhaDeGelo: 'assets/hunt-backgrounds/ice-mountain.jpg',
  vulcao: 'assets/hunt-backgrounds/volcano.jpg',
  obra: 'assets/hunt-backgrounds/construction-site.jpg',
  industrial: 'assets/hunt-backgrounds/industrial.jpg',
  ruinas: 'assets/hunt-backgrounds/ruins.jpg',
  temploMistico: 'assets/hunt-backgrounds/temple.jpg',
  grutaFeerica: 'assets/hunt-backgrounds/fairy-cave.jpg',
  florestaQueimada: 'assets/hunt-backgrounds/burnt-forest.jpg',
  abismo: 'assets/hunt-backgrounds/abyss.jpg',

  // Fundos proprios da onda 1 dos sub-biomas novos (17/10/2026), gerados pelo
  // dono; colisao pintada pelo chao andavel (scripts/body-block-refs).
  fundoFarm: 'assets/hunt-backgrounds/farm.jpg',
  fundoCyclingRoad: 'assets/hunt-backgrounds/cycling-road.jpg',
  fundoMushroomGlade: 'assets/hunt-backgrounds/mushroom-glade.jpg',
  fundoIlexForest: 'assets/hunt-backgrounds/ilex-forest.jpg',
  fundoTreetops: 'assets/hunt-backgrounds/treetops.jpg',
  fundoCoralReef: 'assets/hunt-backgrounds/coral-reef.jpg',
  fundoWhirlIslands: 'assets/hunt-backgrounds/whirl-islands.jpg',
  fundoLilyPond: 'assets/hunt-backgrounds/lily-pond.jpg',
  fundoRiver: 'assets/hunt-backgrounds/river.jpg',
  fundoWaterfall: 'assets/hunt-backgrounds/waterfall.jpg',
  fundoCanyon: 'assets/hunt-backgrounds/canyon.jpg',
  fundoOasis: 'assets/hunt-backgrounds/oasis.jpg',
  fundoRockTunnel: 'assets/hunt-backgrounds/rock-tunnel.jpg',
  fundoDarkCave: 'assets/hunt-backgrounds/dark-cave.jpg',
  fundoMeteorFalls: 'assets/hunt-backgrounds/meteor-falls.jpg',
  fundoVictoryRoad: 'assets/hunt-backgrounds/victory-road.jpg',
  fundoSeafoamIslands: 'assets/hunt-backgrounds/seafoam-islands.jpg',

  // Onda 2 dos fundos proprios (17/10/2026): sub-biomas que faltavam e as
  // salas especiais; mesma colisao pelo chao andavel.
  fundoAbandonedShip: 'assets/hunt-backgrounds/abandoned-ship.jpg',
  fundoAshField: 'assets/hunt-backgrounds/ash-field.jpg',
  fundoBurnedTower: 'assets/hunt-backgrounds/burned-tower.jpg',
  fundoDiglettsCave: 'assets/hunt-backgrounds/digletts-cave.jpg',
  fundoFieryPath: 'assets/hunt-backgrounds/fiery-path.jpg',
  fundoGrampaCanyon: 'assets/hunt-backgrounds/grampa-canyon.jpg',
  fundoHarbor: 'assets/hunt-backgrounds/harbor.jpg',
  fundoHotSprings: 'assets/hunt-backgrounds/hot-springs.jpg',
  fundoJunkyard: 'assets/hunt-backgrounds/junkyard.jpg',
  fundoLakeOfRage: 'assets/hunt-backgrounds/lake-of-rage.jpg',
  fundoMaidensPeak: 'assets/hunt-backgrounds/maidens-peak.jpg',
  fundoMeditationShrine: 'assets/hunt-backgrounds/meditation-shrine.jpg',
  fundoMtEmber: 'assets/hunt-backgrounds/mt-ember.jpg',
  fundoMtMoon: 'assets/hunt-backgrounds/mt-moon.jpg',
  fundoMtPyre: 'assets/hunt-backgrounds/mt-pyre.jpg',
  fundoMtSilverSummit: 'assets/hunt-backgrounds/mt-silver-summit.jpg',
  fundoMysteriousGarden: 'assets/hunt-backgrounds/mysterious-garden.jpg',
  fundoOrangeArchipelago: 'assets/hunt-backgrounds/orange-archipelago.jpg',
  fundoPikachuColony: 'assets/hunt-backgrounds/pikachu-colony.jpg',
  fundoRocketHideout: 'assets/hunt-backgrounds/rocket-hideout.jpg',
  fundoSafariZone: 'assets/hunt-backgrounds/safari-zone.jpg',
  fundoShoalCave: 'assets/hunt-backgrounds/shoal-cave.jpg',
  fundoSkyPillar: 'assets/hunt-backgrounds/sky-pillar.jpg',
  fundoSproutTower: 'assets/hunt-backgrounds/sprout-tower.jpg',
  fundoSquirtleSquad: 'assets/hunt-backgrounds/squirtle-squad.jpg',
  fundoStrayCharmander: 'assets/hunt-backgrounds/stray-charmander.jpg',
  fundoTundra: 'assets/hunt-backgrounds/tundra.jpg',
  fundoUnderground: 'assets/hunt-backgrounds/underground.jpg',

  // Onda 3 (17/10/2026): as 7 ultimas salas especiais.
  fundoBugContest: 'assets/hunt-backgrounds/bug-contest.jpg',
  fundoCeladonMansion: 'assets/hunt-backgrounds/celadon-mansion.jpg',
  fundoJynxHoliday: 'assets/hunt-backgrounds/jynx-holiday.jpg',
  fundoMirageIsland: 'assets/hunt-backgrounds/mirage-island.jpg',
  fundoPokemonMansion: 'assets/hunt-backgrounds/pokemon-mansion.jpg',
  fundoPokemonTower: 'assets/hunt-backgrounds/pokemon-tower.jpg',
  fundoSilphCo: 'assets/hunt-backgrounds/silph-co.jpg',
} as const

export const BIOMAS: BiomaDef[] = [
  {
    chave: 'campo_aberto',
    nome: 'Campo Aberto',
    tipo: 'NORMAL',
    bg: { primary: '#3f5a34', secondary: '#4a6a3d', image: ARTE.campina },
    subBiomas: [
      { chave: 'plains', nome: 'Planície', peso: 10, loot: 'basico', bg: { primary: '#3f5a34', secondary: '#4a6a3d', image: ARTE.planicie } },
      // Sem arte propria entre os 27 arquivos novos — herda o fundo do bioma.
      { chave: 'grass', nome: 'Relvado', peso: 10, loot: 'basico' },
      { chave: 'meadow', nome: 'Campina', peso: 6, loot: 'basico' },
      { chave: 'town', nome: 'Vilarejo', peso: 6, loot: 'civilizado', bg: { primary: '#3f5a34', secondary: '#4a6a3d', image: ARTE.vilarejo } },
      // Onda 1 (16/10/2026). Sem arte propria ainda: herdam o fundo do bioma ou
      // reaproveitam o fundo existente mais parecido (e a colisao dele, que e
      // propriedade da arte). Quando a arte propria chegar, troca so o `bg`.
      { chave: 'farm', nome: 'Fazenda MuuMuu', peso: 6, loot: 'civilizado', bg: { primary: '#3f5a34', secondary: '#4a6a3d', image: ARTE.fundoFarm } },
      { chave: 'cycling-road', nome: 'Estrada de Ciclismo', peso: 6, loot: 'toxico', bg: { primary: '#3f5a34', secondary: '#4a6a3d', image: ARTE.fundoCyclingRoad } },
    ],
    especiais: [
      { chave: 'safari-zone', nome: 'Zona Safári', peso: 1, loot: 'safari', estagioMinimo: 4, pedra: 'NORMAL', bg: { primary: '#3f5a34', secondary: '#4a6a3d', image: ARTE.fundoSafariZone } },
      { chave: 'stray-charmander', nome: 'Charmander na Chuva', peso: 1, loot: 'basico', estagioMinimo: 1, pedra: 'FIRE', bg: { primary: '#3f5a34', secondary: '#4a6a3d', image: ARTE.fundoStrayCharmander } },
    ],
  },
  {
    chave: 'mata',
    nome: 'Mata',
    tipo: 'GRASS',
    bg: { primary: '#284b3c', secondary: '#2e5544', image: ARTE.florestaPadrao },
    subBiomas: [
      { chave: 'forest', nome: 'Floresta', peso: 10, loot: 'basico' },
      { chave: 'tall-grass', nome: 'Mato Alto', peso: 10, loot: 'basico', bg: { primary: '#284b3c', secondary: '#2e5544', image: ARTE.matoAlto } },
      { chave: 'jungle', nome: 'Selva', peso: 6, loot: 'remoto', bg: { primary: '#284b3c', secondary: '#2e5544', image: ARTE.selva } },
      // Onda 1 (16/10/2026). Sem arte propria ainda: herdam o fundo do bioma ou
      // reaproveitam o fundo existente mais parecido (e a colisao dele, que e
      // propriedade da arte). Quando a arte propria chegar, troca so o `bg`.
      { chave: 'mushroom-glade', nome: 'Clareira dos Cogumelos', peso: 10, loot: 'toxico', bg: { primary: '#284b3c', secondary: '#2e5544', image: ARTE.fundoMushroomGlade } },
      { chave: 'ilex-forest', nome: 'Bosque de Ilex', peso: 6, loot: 'basico', bg: { primary: '#284b3c', secondary: '#2e5544', image: ARTE.fundoIlexForest } },
      { chave: 'treetops', nome: 'Copa das Árvores', peso: 6, loot: 'remoto', bg: { primary: '#284b3c', secondary: '#2e5544', image: ARTE.fundoTreetops } },
    ],
    especiais: [
      { chave: 'mysterious-garden', nome: 'Jardim Misterioso', peso: 1, loot: 'remoto', estagioMinimo: 1, pedra: 'GRASS', bg: { primary: '#284b3c', secondary: '#2e5544', image: ARTE.fundoMysteriousGarden } },
      { chave: 'pikachu-colony', nome: 'Colônia de Pikachu', peso: 1, loot: 'basico', estagioMinimo: 1, pedra: 'ELECTRIC', bg: { primary: '#284b3c', secondary: '#2e5544', image: ARTE.fundoPikachuColony } },
    ],
  },
  {
    chave: 'marinho',
    nome: 'Marinho',
    tipo: 'WATER',
    bg: { primary: '#1f3d52', secondary: '#27506b', image: ARTE.ilha },
    subBiomas: [
      { chave: 'sea', nome: 'Mar Aberto', peso: 10, loot: 'basico', bg: { primary: '#1f3d52', secondary: '#27506b', image: ARTE.marAberto } },
      { chave: 'beach', nome: 'Praia', peso: 6, loot: 'civilizado', bg: { primary: '#1f3d52', secondary: '#27506b', image: ARTE.praia } },
      // Sem arte propria — herda o fundo do bioma (a ilha).
      { chave: 'seabed', nome: 'Leito Oceanico', peso: 3, loot: 'profundo' },
      // Onda 1 (16/10/2026). Sem arte propria ainda: herdam o fundo do bioma ou
      // reaproveitam o fundo existente mais parecido (e a colisao dele, que e
      // propriedade da arte). Quando a arte propria chegar, troca so o `bg`.
      { chave: 'coral-reef', nome: 'Recife de Coral', peso: 6, loot: 'remoto', bg: { primary: '#1f3d52', secondary: '#27506b', image: ARTE.fundoCoralReef } },
      { chave: 'whirl-islands', nome: 'Ilhas Redemoinho', peso: 6, loot: 'remoto', bg: { primary: '#1f3d52', secondary: '#27506b', image: ARTE.fundoWhirlIslands } },
    ],
    especiais: [
      { chave: 'orange-archipelago', nome: 'Arquipélago Laranja', peso: 1, loot: 'remoto', estagioMinimo: 2, pedra: 'WATER', bg: { primary: '#1f3d52', secondary: '#27506b', image: ARTE.fundoOrangeArchipelago } },
      { chave: 'maidens-peak', nome: 'Pico da Donzela', peso: 1, loot: 'remoto', estagioMinimo: 2, pedra: 'GHOST', bg: { primary: '#1f3d52', secondary: '#27506b', image: ARTE.fundoMaidensPeak } },
    ],
  },
  {
    chave: 'aguas_interiores',
    nome: 'Águas Interiores',
    tipo: 'WATER',
    bg: { primary: '#24463f', secondary: '#2c5850', image: ARTE.lago },
    subBiomas: [
      { chave: 'lake', nome: 'Lago', peso: 10, loot: 'basico' },
      { chave: 'swamp', nome: 'Pantano', peso: 6, loot: 'remoto', bg: { primary: '#24463f', secondary: '#2c5850', image: ARTE.pantano } },
      // Onda 1 (16/10/2026). Sem arte propria ainda: herdam o fundo do bioma ou
      // reaproveitam o fundo existente mais parecido (e a colisao dele, que e
      // propriedade da arte). Quando a arte propria chegar, troca so o `bg`.
      { chave: 'lily-pond', nome: 'Lagoa das Vitórias-Régias', peso: 10, loot: 'basico', bg: { primary: '#24463f', secondary: '#2c5850', image: ARTE.fundoLilyPond } },
      { chave: 'river', nome: 'Rio e Corredeira', peso: 10, loot: 'basico', bg: { primary: '#24463f', secondary: '#2c5850', image: ARTE.fundoRiver } },
      { chave: 'waterfall', nome: 'Cachoeira de Tohjo', peso: 6, loot: 'remoto', bg: { primary: '#24463f', secondary: '#2c5850', image: ARTE.fundoWaterfall } },
    ],
    especiais: [
      { chave: 'lake-of-rage', nome: 'Lago da Fúria', peso: 1, loot: 'remoto', estagioMinimo: 2, pedra: 'WATER', shiny: { especie: 'gyarados', multiplicador: 10 }, bg: { primary: '#24463f', secondary: '#2c5850', image: ARTE.fundoLakeOfRage } },
      { chave: 'squirtle-squad', nome: 'Esquadrão Squirtle', peso: 1, loot: 'basico', estagioMinimo: 1, pedra: 'WATER', bg: { primary: '#24463f', secondary: '#2c5850', image: ARTE.fundoSquirtleSquad } },
    ],
  },
  {
    chave: 'aridos',
    nome: 'Aridos',
    tipo: 'GROUND',
    bg: { primary: '#5c4a30', secondary: '#6d5838', image: ARTE.ermos },
    subBiomas: [
      { chave: 'badlands', nome: 'Ermos', peso: 10, loot: 'basico' },
      { chave: 'desert', nome: 'Deserto', peso: 6, loot: 'remoto', bg: { primary: '#5c4a30', secondary: '#6d5838', image: ARTE.deserto } },
      { chave: 'wasteland', nome: 'Terra Devastada', peso: 3, loot: 'profundo', bg: { primary: '#5c4a30', secondary: '#6d5838', image: ARTE.terraDevastada } },
      // Onda 1 (16/10/2026). Sem arte propria ainda: herdam o fundo do bioma ou
      // reaproveitam o fundo existente mais parecido (e a colisao dele, que e
      // propriedade da arte). Quando a arte propria chegar, troca so o `bg`.
      { chave: 'canyon', nome: 'Cânion da Rota 45', peso: 6, loot: 'remoto', bg: { primary: '#5c4a30', secondary: '#6d5838', image: ARTE.fundoCanyon } },
      { chave: 'oasis', nome: 'Oásis', peso: 3, loot: 'remoto', bg: { primary: '#5c4a30', secondary: '#6d5838', image: ARTE.fundoOasis } },
    ],
    especiais: [
      { chave: 'grampa-canyon', nome: 'Cânion do Vovô', peso: 1, loot: 'profundo', estagioMinimo: 6, pedra: 'ROCK', bg: { primary: '#5c4a30', secondary: '#6d5838', image: ARTE.fundoGrampaCanyon } },
    ],
  },
  {
    chave: 'subterraneo',
    nome: 'Subterraneo',
    tipo: 'ROCK',
    bg: { primary: '#3a3340', secondary: '#463d4d', image: ARTE.montanha },
    subBiomas: [
      { chave: 'cave', nome: 'Caverna', peso: 10, loot: 'basico', bg: { primary: '#3a3340', secondary: '#463d4d', image: ARTE.cavernaVulcanica } },
      { chave: 'mountain', nome: 'Montanha', peso: 6, loot: 'remoto' },
      // Onda 1 (16/10/2026). Sem arte propria ainda: herdam o fundo do bioma ou
      // reaproveitam o fundo existente mais parecido (e a colisao dele, que e
      // propriedade da arte). Quando a arte propria chegar, troca so o `bg`.
      { chave: 'rock-tunnel', nome: 'Túnel de Pedra', peso: 10, loot: 'basico', bg: { primary: '#3a3340', secondary: '#463d4d', image: ARTE.fundoRockTunnel } },
      { chave: 'dark-cave', nome: 'Caverna Escura', peso: 6, loot: 'basico', bg: { primary: '#3a3340', secondary: '#463d4d', image: ARTE.fundoDarkCave } },
      { chave: 'meteor-falls', nome: 'Cataratas Meteoro', peso: 6, loot: 'remoto', bg: { primary: '#3a3340', secondary: '#463d4d', image: ARTE.fundoMeteorFalls } },
      { chave: 'victory-road', nome: 'Estrada da Vitória', peso: 3, loot: 'vitoria', bg: { primary: '#3a3340', secondary: '#463d4d', image: ARTE.fundoVictoryRoad } },
    ],
    especiais: [
      { chave: 'mt-moon', nome: 'Monte Lua', peso: 1, loot: 'remoto', estagioMinimo: 1, pedra: 'FAIRY', bg: { primary: '#3a3340', secondary: '#463d4d', image: ARTE.fundoMtMoon } },
      { chave: 'digletts-cave', nome: 'Caverna dos Diglett', peso: 1, loot: 'basico', estagioMinimo: 1, pedra: 'GROUND', bg: { primary: '#3a3340', secondary: '#463d4d', image: ARTE.fundoDiglettsCave } },
    ],
  },
  {
    chave: 'gelido',
    nome: 'Gelido',
    tipo: 'ICE',
    bg: { primary: '#33505e', secondary: '#3d6070', image: ARTE.montanhaDeGelo },
    subBiomas: [
      { chave: 'ice-cave', nome: 'Caverna de Gelo', peso: 10, loot: 'remoto', bg: { primary: '#33505e', secondary: '#3d6070', image: ARTE.cavernaDeGelo } },
      // Sem arte propria — herda o fundo do bioma (montanha de gelo).
      { chave: 'snowy-forest', nome: 'Floresta Nevada', peso: 6, loot: 'basico' },
      // Onda 1 (16/10/2026). Sem arte propria ainda: herdam o fundo do bioma ou
      // reaproveitam o fundo existente mais parecido (e a colisao dele, que e
      // propriedade da arte). Quando a arte propria chegar, troca so o `bg`.
      { chave: 'seafoam-islands', nome: 'Ilhas Espuma', peso: 10, loot: 'gelado', bg: { primary: '#33505e', secondary: '#3d6070', image: ARTE.fundoSeafoamIslands } },
      { chave: 'shoal-cave', nome: 'Gruta da Maré', peso: 6, loot: 'gelado', bg: { primary: '#33505e', secondary: '#3d6070', image: ARTE.fundoShoalCave } },
      { chave: 'tundra', nome: 'Tundra', peso: 10, loot: 'gelado', bg: { primary: '#33505e', secondary: '#3d6070', image: ARTE.fundoTundra } },
    ],
    especiais: [
      { chave: 'jynx-holiday', nome: 'Natal da Jynx', peso: 1, loot: 'gelado', estagioMinimo: 2, pedra: 'ICE', bg: { primary: '#33505e', secondary: '#3d6070', image: ARTE.fundoJynxHoliday } },
      { chave: 'mt-silver-summit', nome: 'Cume do Monte Prata', peso: 1, loot: 'vitoria', estagioMinimo: 10, pedra: 'DARK', bg: { primary: '#33505e', secondary: '#3d6070', image: ARTE.fundoMtSilverSummit } },
    ],
  },
  {
    chave: 'igneo',
    nome: 'Igneo',
    tipo: 'FIRE',
    bg: { primary: '#5a2a1e', secondary: '#6d3626', image: ARTE.vulcao },
    subBiomas: [
      { chave: 'volcano', nome: 'Vulcao', peso: 10, loot: 'remoto' },
      // Onda 1 (16/10/2026). Sem arte propria ainda: herdam o fundo do bioma ou
      // reaproveitam o fundo existente mais parecido (e a colisao dele, que e
      // propriedade da arte). Quando a arte propria chegar, troca so o `bg`.
      { chave: 'fiery-path', nome: 'Caminho Ardente', peso: 10, loot: 'ardente', bg: { primary: '#5a2a1e', secondary: '#6d3626', image: ARTE.fundoFieryPath } },
      { chave: 'mt-ember', nome: 'Encosta do Monte Brasa', peso: 10, loot: 'remoto', bg: { primary: '#5a2a1e', secondary: '#6d3626', image: ARTE.fundoMtEmber } },
      { chave: 'ash-field', nome: 'Campo de Cinzas', peso: 6, loot: 'basico', bg: { primary: '#5a2a1e', secondary: '#6d3626', image: ARTE.fundoAshField } },
      { chave: 'hot-springs', nome: 'Fontes Termais', peso: 6, loot: 'termal', bg: { primary: '#5a2a1e', secondary: '#6d3626', image: ARTE.fundoHotSprings } },
    ],
    especiais: [
      { chave: 'pokemon-mansion', nome: 'Mansão Pokémon', peso: 1, loot: 'profundo', estagioMinimo: 5, pedra: 'FIRE', bg: { primary: '#5a2a1e', secondary: '#6d3626', image: ARTE.fundoPokemonMansion } },
    ],
  },
  {
    chave: 'urbano',
    nome: 'Urbano',
    tipo: 'FIGHTING',
    bg: { primary: '#3d3a35', secondary: '#4a4640', image: ARTE.vilarejoNoturno },
    subBiomas: [
      // Arte propria importada na leva 2026-08-18, junto com o walk-block
      // pintado das duas. Antes herdavam o fundo do bioma (vilarejo noturno),
      // que e uma clareira de floresta — nada a ver com "metropole"/"cortico".
      { chave: 'metropolis', nome: 'Metropole', peso: 10, loot: 'civilizado', bg: { primary: '#3d3a35', secondary: '#4a4640', image: ARTE.metropole } },
      { chave: 'slum', nome: 'Cortico', peso: 6, loot: 'civilizado', bg: { primary: '#3d3a35', secondary: '#4a4640', image: ARTE.cortico } },
      // Dojo preserva a arte propria (ARTE.dojo) — nao herda o fundo novo do
      // bioma, de proposito (ver comentario no topo de ARTE).
      { chave: 'dojo', nome: 'Dojo', peso: 6, loot: 'basico', bg: { primary: '#3d3a35', secondary: '#4a4640', image: ARTE.dojo } },
      // Onda 1 (16/10/2026). Sem arte propria ainda: herdam o fundo do bioma ou
      // reaproveitam o fundo existente mais parecido (e a colisao dele, que e
      // propriedade da arte). Quando a arte propria chegar, troca so o `bg`.
      { chave: 'harbor', nome: 'Cais do Porto', peso: 10, loot: 'portuario', bg: { primary: '#3d3a35', secondary: '#4a4640', image: ARTE.fundoHarbor } },
      { chave: 'underground', nome: 'Galerias Subterrâneas', peso: 6, loot: 'toxico', bg: { primary: '#3d3a35', secondary: '#4a4640', image: ARTE.fundoUnderground } },
    ],
    especiais: [
      { chave: 'bug-contest', nome: 'Concurso de Insetos', peso: 1, loot: 'civilizado', estagioMinimo: 1, pedra: 'BUG', bg: { primary: '#3d3a35', secondary: '#4a4640', image: ARTE.fundoBugContest } },
      { chave: 'rocket-hideout', nome: 'Esconderijo Rocket', peso: 1, loot: 'cofre', estagioMinimo: 3, pedra: 'POISON', bg: { primary: '#3d3a35', secondary: '#4a4640', image: ARTE.fundoRocketHideout } },
      { chave: 'celadon-mansion', nome: 'Mansão Celadon', peso: 1, loot: 'civilizado', estagioMinimo: 2, pedra: 'NORMAL', bg: { primary: '#3d3a35', secondary: '#4a4640', image: ARTE.fundoCeladonMansion } },
    ],
  },
  {
    chave: 'industrial',
    nome: 'Industrial',
    tipo: 'ELECTRIC',
    bg: { primary: '#3b3f4a', secondary: '#474c59', image: ARTE.industrial },
    subBiomas: [
      { chave: 'construction-site', nome: 'Obra', peso: 10, loot: 'civilizado', bg: { primary: '#3b3f4a', secondary: '#474c59', image: ARTE.obra } },
      // factory/power-plant/laboratory sem arte propria — herdam o fundo do bioma.
      { chave: 'factory', nome: 'Fabrica', peso: 6, loot: 'civilizado' },
      { chave: 'power-plant', nome: 'Usina', peso: 6, loot: 'remoto' },
      { chave: 'laboratory', nome: 'Laboratório', peso: 3, loot: 'profundo' },
      // Onda 1 (16/10/2026). Sem arte propria ainda: herdam o fundo do bioma ou
      // reaproveitam o fundo existente mais parecido (e a colisao dele, que e
      // propriedade da arte). Quando a arte propria chegar, troca so o `bg`.
      { chave: 'junkyard', nome: 'Ferro-Velho', peso: 10, loot: 'sucata', bg: { primary: '#3b3f4a', secondary: '#474c59', image: ARTE.fundoJunkyard } },
    ],
    especiais: [
      { chave: 'silph-co', nome: 'Silph S.A.', peso: 1, loot: 'profundo', estagioMinimo: 3, pedra: 'ELECTRIC', bg: { primary: '#3b3f4a', secondary: '#474c59', image: ARTE.fundoSilphCo } },
    ],
  },
  {
    chave: 'sagrado',
    nome: 'Sagrado',
    tipo: 'PSYCHIC',
    bg: { primary: '#4a3a55', secondary: '#584565', image: ARTE.temploMistico },
    subBiomas: [
      { chave: 'ruins', nome: 'Ruinas', peso: 10, loot: 'remoto', bg: { primary: '#4a3a55', secondary: '#584565', image: ARTE.ruinas } },
      { chave: 'temple', nome: 'Templo', peso: 6, loot: 'remoto' },
      { chave: 'fairy-cave', nome: 'Gruta Feerica', peso: 3, loot: 'profundo', bg: { primary: '#4a3a55', secondary: '#584565', image: ARTE.grutaFeerica } },
      // Onda 1 (16/10/2026). Sem arte propria ainda: herdam o fundo do bioma ou
      // reaproveitam o fundo existente mais parecido (e a colisao dele, que e
      // propriedade da arte). Quando a arte propria chegar, troca so o `bg`.
      { chave: 'sprout-tower', nome: 'Torre Broto', peso: 10, loot: 'sonolento', bg: { primary: '#4a3a55', secondary: '#584565', image: ARTE.fundoSproutTower } },
      { chave: 'meditation-shrine', nome: 'Santuário de Meditação', peso: 6, loot: 'remoto', bg: { primary: '#4a3a55', secondary: '#584565', image: ARTE.fundoMeditationShrine } },
      { chave: 'sky-pillar', nome: 'Pilar Celeste', peso: 3, loot: 'profundo', bg: { primary: '#4a3a55', secondary: '#584565', image: ARTE.fundoSkyPillar } },
    ],
    especiais: [
      { chave: 'mirage-island', nome: 'Ilha Miragem', peso: 1, loot: 'remoto', estagioMinimo: 1, pedra: 'PSYCHIC', bg: { primary: '#4a3a55', secondary: '#584565', image: ARTE.fundoMirageIsland } },
    ],
  },
  {
    chave: 'sombrio',
    nome: 'Sombrio',
    tipo: 'GHOST',
    bg: { primary: '#2b2733', secondary: '#35303f', image: ARTE.florestaQueimada },
    subBiomas: [
      // Sem arte propria — herda o fundo do bioma (floresta queimada).
      { chave: 'graveyard', nome: 'Cemiterio', peso: 10, loot: 'remoto' },
      { chave: 'abyss', nome: 'Abismo', peso: 6, loot: 'profundo', bg: { primary: '#2b2733', secondary: '#35303f', image: ARTE.abismo } },
      // Reaproveita o Abismo: vazio/cosmico e o mais proximo dos 27 arquivos novos.
      { chave: 'space', nome: 'Espaço', peso: 3, loot: 'profundo', bg: { primary: '#2b2733', secondary: '#35303f', image: ARTE.abismo } },
      // Onda 1 (16/10/2026). Sem arte propria ainda: herdam o fundo do bioma ou
      // reaproveitam o fundo existente mais parecido (e a colisao dele, que e
      // propriedade da arte). Quando a arte propria chegar, troca so o `bg`.
      { chave: 'mt-pyre', nome: 'Monte Pira', peso: 10, loot: 'remoto', bg: { primary: '#2b2733', secondary: '#35303f', image: ARTE.fundoMtPyre } },
      { chave: 'burned-tower', nome: 'Torre Queimada', peso: 6, loot: 'ardente', bg: { primary: '#2b2733', secondary: '#35303f', image: ARTE.fundoBurnedTower } },
      { chave: 'abandoned-ship', nome: 'Navio Abandonado', peso: 3, loot: 'profundo', bg: { primary: '#2b2733', secondary: '#35303f', image: ARTE.fundoAbandonedShip } },
    ],
    especiais: [
      { chave: 'pokemon-tower', nome: 'Torre Pokémon', peso: 1, loot: 'sonolento', estagioMinimo: 1, pedra: 'GHOST', bg: { primary: '#2b2733', secondary: '#35303f', image: ARTE.fundoPokemonTower } },
    ],
  },
]

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------
// Valores identicos aos que as 19 hunts geradas usavam — conferido no
// maps.generated.ts antes de migrar. Nunca vieram da planilha (sao conceito
// nosso de idle-game); passaram a morar aqui porque o gerador de hunts deixou
// de consumir o dado gerado.
export const GEOMETRIA = {
  bounds: { width: 1400, height: 900 },
  playerSpawn: { x: 700, y: 450 },
  maxEnemies: 6,
  respawnDelay: 6,
  spawnPoints: [
    { x: 500, y: 320 }, { x: 900, y: 320 },
    { x: 500, y: 580 }, { x: 900, y: 580 },
    { x: 700, y: 250 }, { x: 700, y: 650 },
  ],
} as const

/**
 * Quantos inimigos ficam em campo ao mesmo tempo NA HUNT INICIAL.
 *
 * A hunt inicial existe pra um POKE recem-escolhido subir de nivel sem risco,
 * e ela tinha parado de cumprir isso — nao por causa do elenco (Sentret,
 * Hoothoot e Rattata, Lv1-2) nem do nivel, que continuam certos, mas porque um
 * inicial Lv1 tem 12 HP e enfrentava SEIS inimigos de uma vez. O combate ficou
 * mais duro quando entraram precisao, status e o cooldown unico de item do
 * Treinador (1,5s pra qualquer cura): seis fontes de dano somam mais rapido do
 * que uma pocao repoe, por mais pocao que haja na mochila.
 *
 * O numero foi escolhido MEDINDO CONTRA O SERVIDOR PUBLICADO, com contas
 * novas de verdade e flush de 30 em 30 segundos — nao no motor headless. Os
 * dois discordam por quase 6x aqui (o headless dava ~7% de morte onde a conta
 * real dava 40%), e quem manda e o jogo:
 *
 *   6 inimigos (era)  ->  o POKE morria no primeiro minuto, sem chegar ao Lv2
 *   2 inimigos        ->  4 de 10 contas ainda morriam no primeiro minuto
 *   1 inimigo (este)  ->  0 de 10 morreram; todas terminaram Lv3-4 com
 *                         106-120 abates em 20 minutos
 *
 * A morte, quando acontece, e sempre nos primeiros 30-60 segundos de vida da
 * conta: passada essa janela o POKE ja esta Lv2+ e atravessa os 20 minutos
 * inteiros. Nao existe meio-termo — ou morre logo, ou nao morre.
 *
 * O custo de um inimigo so, medido: o POKE upa um pouco mais devagar (Lv4.8
 * contra Lv5.0 em 30 minutos). E barato perto de perder o jogador no primeiro
 * minuto, e quem quiser ritmo tem as hunts de bioma logo ao lado.
 *
 * `respawnDelay` fica no valor comum de proposito: aumenta-lo piora o quadro
 * (medido: 14s -> 4/10 mortes contra 2/10 em 6s). Respawn lento significa
 * menos EXP por minuto, e o POKE passa mais tempo fraco, que e justamente
 * quando ele morre.
 */
export const MAX_INIMIGOS_HUNT_INICIAL = 1

// ---------------------------------------------------------------------------
// Salas
// ---------------------------------------------------------------------------
/** Quantas salas o jogador limpa antes de o ciclo reiniciar. */
export const SALAS_POR_HUNT = 10

/**
 * Quantos abates limpam uma sala.
 *
 * E QUOTA DE ABATES, e nao "matar todos os inimigos em campo", por uma razao
 * estrutural: o servidor simula por JANELAS e reconstroi o mundo a cada flush
 * (ver server/src/progresso.ts), entao o inimigo em campo nao sobrevive de uma
 * janela pra outra. Um contador sobrevive.
 */
export const ABATES_POR_SALA = 30

/**
 * Dos 30, quantos sao SELVAGEM COMUM numa sala que tem protetor (PH-473).
 *
 * O PROTETOR E O 30o, e nao o 31o. Ate aqui a quota eram 30 comuns e o Guardian
 * (ou o Lord, na ultima sala) nascia DEPOIS dela — o abate dele era um 31o que
 * a barra do HUD nao tinha onde contar. O que o jogador via era a barra em
 * 30/30 e a sala parada: ele lia "completei a sala e ela travou".
 *
 * Com o protetor DENTRO da conta, a barra chega a 29/30 com a quota de comuns
 * fechada, e o 30o abate — o dele — fecha a sala no mesmo instante.
 *
 * SALA SEM PROTETOR CONTINUA EM 30 COMUNS: hunt sem estagio (a inicial, as
 * BOSS, o Campeao Lance) e estagio ja limpo, onde o protetor nao e reposto
 * (PH-428). Quem decide qual dos dois vale e `quotaDeAbatesDaSala`, em
 * `engine/systems/salaSystem.ts` — nao dividir essa decisao entre os seis
 * pontos que comparam com a quota e o ponto de ela ser uma funcao.
 */
export const ABATES_COMUNS_POR_SALA = ABATES_POR_SALA - 1

export const BIOMA_POR_CHAVE: Record<string, BiomaDef> = Object.fromEntries(
  BIOMAS.map((b) => [b.chave, b])
)

// A ORDEM CANONICA DOS 12 BIOMAS SAIU DAQUI NA PH-434.
//
// Ela existia pro gate SEQUENCIAL (PH-223/226/227): vencer o Lord do bioma N
// liberava o N+1. Esse eixo morreu na PH-430 — os 12 nascem abertos e o
// progresso e por bioma, independente.
//
// A LISTA NAO SUMIU, ELA MUDOU DE DONO. O unico lugar que ainda precisa dela e
// a traducao do save antigo, onde o numero gravado em `faixa1` e um INDICE
// nessa sequencia. La ela vive CONGELADA
// (data/progressoDeBioma.ts#ORDEM_LEGADA_DOS_BIOMAS), e isso e o ponto: uma
// constante viva mudaria amanha e faria a traducao de um save de ontem apontar
// pro bioma errado, sem erro nenhum.

// O TIPO `BiomaProgress` E O `biomaProgressDefault()` SAIRAM DAQUI NA PH-429.
//
// Eles descreviam o formato de tres inteiros por faixa ("quantos biomas da
// ORDEM o jogador venceu naquela faixa"), que deixou de existir: o progresso
// agora e um numero por BIOMA, "maior estagio ja limpo". A forma nova, o
// default, a traducao do save antigo e o gate moram em
// `data/progressoDeBioma.ts`.
//
// FORAM APAGADOS, E NAO MANTIDOS COMO ALIAS, de propósito. As duas formas sao
// objetos de numeros e conviveriam sem o compilador reclamar — quem lesse
// `progresso.faixa1` no formato novo receberia `undefined`, viraria zero, e o
// gate trancaria o jogo inteiro sem nenhum erro. Apagar transforma cada leitura
// remanescente em erro de compilacao.
//
// A traducao do formato antigo continua existindo (ela precisa, ha save no
// banco), mas com a ordem dos biomas CONGELADA junto dela — ver
// `ORDEM_LEGADA_DOS_BIOMAS`.

// As salas especiais entram aqui tambem: nome, loot, arte, clima e protetor
// se resolvem pela chave igual a de um sub-bioma comum.
export const SUB_BIOMA_POR_CHAVE: Record<string, { sub: SubBiomaDef; bioma: BiomaDef }> =
  Object.fromEntries(
    BIOMAS.flatMap((bioma) => [...bioma.subBiomas, ...(bioma.especiais ?? [])].map((sub) => [sub.chave, { sub, bioma }]))
  )

/** A sala especial desta chave, ou undefined se a chave e de sub-bioma comum. */
export const SALA_ESPECIAL_POR_CHAVE: Record<string, SalaEspecialDef> = Object.fromEntries(
  BIOMAS.flatMap((bioma) => (bioma.especiais ?? []).map((e) => [e.chave, e])),
)
