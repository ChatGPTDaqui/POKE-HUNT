// Os 12 biomas do jogo, seus sub-biomas e as 3 faixas de nivel.
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
import type { ElementType, MapItemDrop } from './generated/types'

// ---------------------------------------------------------------------------
// Faixas de nivel
// ---------------------------------------------------------------------------
// Sao 3, e nao as 9 zonas de 10 niveis do desenho antigo, porque o elenco nao
// da pra mais: medido nas 209 especies alocadas, a zona 2 fica VAZIA em 11 dos
// 12 biomas. Nove degraus sobre esse dado produziam hunts de 1 especie.
//
// O teto continua Lv90 — acima disso e Modo Pesadelo (+100, piso 150) e as
// hunts BOSS (Lv300).
export type FaixaId = 'faixa1' | 'faixa2' | 'faixa3'

export interface FaixaDef {
  id: FaixaId
  nome: string
  /** Faixa fechada de nivel; o cartao, o nome e o spawn saem toda daqui. */
  niveis: [number, number]
  /**
   * Zona maxima de `spawnStrength.zonaMinimaDaEspecie` que cabe nesta faixa.
   * A especie entra na hunt cuja faixa alcanca a zona minima dela — e o eixo
   * de FORCA que impede Tyranitar de nascer na primeira hunt.
   */
  zonaMaxima: number
}

export const FAIXAS: FaixaDef[] = [
  { id: 'faixa1', nome: 'I', niveis: [1, 30], zonaMaxima: 2 },
  { id: 'faixa2', nome: 'II', niveis: [31, 60], zonaMaxima: 5 },
  { id: 'faixa3', nome: 'III', niveis: [61, 90], zonaMaxima: 8 },
]

// As faixas que um jogador novo ja pode entrar. A faixa3 e o Modo Pesadelo
// (com as 11 hunts BOSS dentro dele) sao liberados por derrotar o Campeao
// Lance, cujo time e Lv55-65 — exatamente o fim da faixa2.
export const FAIXAS_INICIAIS: string[] = ['faixa1', 'faixa2']
export const GRUPOS_DO_LANCE: string[] = ['faixa3', 'nightmare']

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
export const GRUPOS_LEGADOS: ReadonlySet<string> = new Set(['johto', 'kanto'])

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
export type PerfilDeLoot = 'basico' | 'civilizado' | 'remoto' | 'profundo'

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

export interface BiomaDef {
  chave: string
  nome: string
  /** Tipo elemental dominante — decide so a cor do cartao no menu de hunts. */
  tipo: ElementType
  bg: { primary: string; secondary: string; image: string }
  subBiomas: SubBiomaDef[]
}

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
} as const

export const BIOMAS: BiomaDef[] = [
  {
    chave: 'campo_aberto',
    nome: 'Campo Aberto',
    tipo: 'NORMAL',
    bg: { primary: '#3f5a34', secondary: '#4a6a3d', image: ARTE.campina },
    subBiomas: [
      { chave: 'plains', nome: 'Planicie', peso: 10, loot: 'basico', bg: { primary: '#3f5a34', secondary: '#4a6a3d', image: ARTE.planicie } },
      // Sem arte propria entre os 27 arquivos novos — herda o fundo do bioma.
      { chave: 'grass', nome: 'Relvado', peso: 10, loot: 'basico' },
      { chave: 'meadow', nome: 'Campina', peso: 6, loot: 'basico' },
      { chave: 'town', nome: 'Vilarejo', peso: 6, loot: 'civilizado', bg: { primary: '#3f5a34', secondary: '#4a6a3d', image: ARTE.vilarejo } },
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
    ],
  },
  {
    chave: 'aguas_interiores',
    nome: 'Aguas Interiores',
    tipo: 'WATER',
    bg: { primary: '#24463f', secondary: '#2c5850', image: ARTE.lago },
    subBiomas: [
      { chave: 'lake', nome: 'Lago', peso: 10, loot: 'basico' },
      { chave: 'swamp', nome: 'Pantano', peso: 6, loot: 'remoto', bg: { primary: '#24463f', secondary: '#2c5850', image: ARTE.pantano } },
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
    ],
  },
  {
    chave: 'igneo',
    nome: 'Igneo',
    tipo: 'FIRE',
    bg: { primary: '#5a2a1e', secondary: '#6d3626', image: ARTE.vulcao },
    subBiomas: [
      { chave: 'volcano', nome: 'Vulcao', peso: 10, loot: 'remoto' },
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
      { chave: 'laboratory', nome: 'Laboratorio', peso: 3, loot: 'profundo' },
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
      { chave: 'space', nome: 'Espaco', peso: 3, loot: 'profundo', bg: { primary: '#2b2733', secondary: '#35303f', image: ARTE.abismo } },
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

export const BIOMA_POR_CHAVE: Record<string, BiomaDef> = Object.fromEntries(
  BIOMAS.map((b) => [b.chave, b])
)

/**
 * PH-223: ordem canonica dos 12 biomas pro gate sequencial (PH-226/227) —
 * vencer o Lord do bioma N libera o bioma N+1. So existia como
 * tabela no vault (`_Architecture.md`, brainstorm 16/08, referencia: sequencia
 * de ginasios Kanto+Johto) — `BIOMAS` acima esta em ordem ARBITRARIA de
 * insercao (campo_aberto, mata, marinho, ...), que NAO bate com esta ordem.
 * Nao usar `BIOMAS.map(b => b.chave)` no lugar disto — e exatamente o furo que
 * esta constante fecha.
 */
export const ORDEM_DOS_BIOMAS: readonly string[] = [
  'campo_aberto',
  'subterraneo',
  'marinho',
  'industrial',
  'mata',
  'aguas_interiores',
  'urbano',
  'gelido',
  'aridos',
  'sagrado',
  'sombrio',
  'igneo',
]

/**
 * PH-224: `players.bioma_progress` (migration PH-200) — indice de quantos
 * biomas da FAIXA o jogador ja venceu (posicao em `ORDEM_DOS_BIOMAS`), nao
 * lista de biomas liberados. Uma faixa por chave porque o gate e independente
 * entre as 3 (a Faixa II reinicia do zero, mesma decisao do brainstorm 16/08).
 */
export interface BiomaProgress {
  faixa1: number
  faixa2: number
  faixa3: number
}

export function biomaProgressDefault(): BiomaProgress {
  return { faixa1: 0, faixa2: 0, faixa3: 0 }
}

export const FAIXA_POR_ID: Record<string, FaixaDef> = Object.fromEntries(
  FAIXAS.map((f) => [f.id, f])
)

/** Id da hunt de um bioma numa faixa. Estavel: e o que vai pro banco. */
export function huntId(bioma: string, faixa: FaixaId): string {
  return `${bioma}_${faixa}`
}

/**
 * Inverso de `huntId` — o bioma embutido no mapId de uma hunt de bioma, ou
 * `null` se o mapId nao segue esse padrao (BOSS/Nightmare/hunt inicial nao
 * tem bioma). PH-227/229: mesma logica usada pelo gate server-side
 * (abrirSessao) E pelo menu (HuntMenu) — nao duplicar, os dois precisam
 * concordar sobre "que bioma e esse mapId" sempre.
 */
export function biomaDoMapId(mapId: string, faixa: string): string | null {
  return mapId.endsWith(`_${faixa}`) ? mapId.slice(0, -(faixa.length + 1)) : null
}

/**
 * Indice do bioma embutido no mapId dentro de `ORDEM_DOS_BIOMAS`, ou `-1` se
 * o mapId nao tem bioma (hunt inicial/BOSS/Nightmare) ou o bioma nao esta na
 * ordem (nao deveria acontecer com os 12 habilitados, PH-225 — defesa em
 * profundidade). Usado pelo gate server-side (PH-227) E pelo sort/selo do
 * menu (PH-229).
 */
export function indiceDoBiomaNoMapId(mapId: string, faixa: string): number {
  const bioma = biomaDoMapId(mapId, faixa)
  return bioma ? ORDEM_DOS_BIOMAS.indexOf(bioma) : -1
}

export const SUB_BIOMA_POR_CHAVE: Record<string, { sub: SubBiomaDef; bioma: BiomaDef }> =
  Object.fromEntries(
    BIOMAS.flatMap((bioma) => bioma.subBiomas.map((sub) => [sub.chave, { sub, bioma }]))
  )
