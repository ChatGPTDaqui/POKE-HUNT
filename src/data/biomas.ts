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
// antigo (localStorage) e linha antiga de `players.unlocked_continents` os
// carregam; sao traduzidos na carga, nunca propagados — 'kanto' vira o que o
// Lance libera hoje, os outros dois somem. Nao basta ignorar: manter
// 'nightmare' daria de graca o conteudo que acabou de virar gate do Lance.
export const GRUPOS_LEGADOS: ReadonlySet<string> = new Set(['johto', 'kanto', 'nightmare'])

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
}

export interface BiomaDef {
  chave: string
  nome: string
  /** Tipo elemental dominante — decide so a cor do cartao no menu de hunts. */
  tipo: ElementType
  bg: { primary: string; secondary: string; image: string }
  subBiomas: SubBiomaDef[]
}

const ARTE = {
  floresta: 'assets/hunt-backgrounds/forest.png',
  agua: 'assets/hunt-backgrounds/water.png',
  caverna: 'assets/hunt-backgrounds/cave.png',
  fogo: 'assets/hunt-backgrounds/fire.png',
  dojo: 'assets/hunt-backgrounds/dojo.png',
  eletrico: 'assets/hunt-backgrounds/eletric.png',
  dragao: 'assets/hunt-backgrounds/dragon.png',
} as const

export const BIOMAS: BiomaDef[] = [
  {
    chave: 'campo_aberto',
    nome: 'Campo Aberto',
    tipo: 'NORMAL',
    bg: { primary: '#3f5a34', secondary: '#4a6a3d', image: ARTE.floresta },
    subBiomas: [
      { chave: 'plains', nome: 'Planicie', peso: 10, loot: 'basico' },
      { chave: 'grass', nome: 'Relvado', peso: 10, loot: 'basico' },
      { chave: 'meadow', nome: 'Campina', peso: 6, loot: 'basico' },
      { chave: 'town', nome: 'Vilarejo', peso: 6, loot: 'civilizado' },
    ],
  },
  {
    chave: 'mata',
    nome: 'Mata',
    tipo: 'GRASS',
    bg: { primary: '#284b3c', secondary: '#2e5544', image: ARTE.floresta },
    subBiomas: [
      { chave: 'forest', nome: 'Floresta', peso: 10, loot: 'basico' },
      { chave: 'tall-grass', nome: 'Mato Alto', peso: 10, loot: 'basico' },
      { chave: 'jungle', nome: 'Selva', peso: 6, loot: 'remoto' },
    ],
  },
  {
    chave: 'marinho',
    nome: 'Marinho',
    tipo: 'WATER',
    bg: { primary: '#1f3d52', secondary: '#27506b', image: ARTE.agua },
    subBiomas: [
      { chave: 'sea', nome: 'Mar Aberto', peso: 10, loot: 'basico' },
      { chave: 'beach', nome: 'Praia', peso: 6, loot: 'civilizado' },
      { chave: 'seabed', nome: 'Leito Oceanico', peso: 3, loot: 'profundo' },
    ],
  },
  {
    chave: 'aguas_interiores',
    nome: 'Aguas Interiores',
    tipo: 'WATER',
    bg: { primary: '#24463f', secondary: '#2c5850', image: ARTE.agua },
    subBiomas: [
      { chave: 'lake', nome: 'Lago', peso: 10, loot: 'basico' },
      { chave: 'swamp', nome: 'Pantano', peso: 6, loot: 'remoto' },
    ],
  },
  {
    chave: 'aridos',
    nome: 'Aridos',
    tipo: 'GROUND',
    bg: { primary: '#5c4a30', secondary: '#6d5838', image: ARTE.caverna },
    subBiomas: [
      { chave: 'badlands', nome: 'Ermos', peso: 10, loot: 'basico' },
      { chave: 'desert', nome: 'Deserto', peso: 6, loot: 'remoto' },
      { chave: 'wasteland', nome: 'Terra Devastada', peso: 3, loot: 'profundo' },
    ],
  },
  {
    chave: 'subterraneo',
    nome: 'Subterraneo',
    tipo: 'ROCK',
    bg: { primary: '#3a3340', secondary: '#463d4d', image: ARTE.caverna },
    subBiomas: [
      { chave: 'cave', nome: 'Caverna', peso: 10, loot: 'basico' },
      { chave: 'mountain', nome: 'Montanha', peso: 6, loot: 'remoto' },
    ],
  },
  {
    chave: 'gelido',
    nome: 'Gelido',
    tipo: 'ICE',
    bg: { primary: '#33505e', secondary: '#3d6070', image: ARTE.caverna },
    subBiomas: [
      { chave: 'ice-cave', nome: 'Caverna de Gelo', peso: 10, loot: 'remoto' },
      { chave: 'snowy-forest', nome: 'Floresta Nevada', peso: 6, loot: 'basico' },
    ],
  },
  {
    chave: 'igneo',
    nome: 'Igneo',
    tipo: 'FIRE',
    bg: { primary: '#5a2a1e', secondary: '#6d3626', image: ARTE.fogo },
    subBiomas: [
      { chave: 'volcano', nome: 'Vulcao', peso: 10, loot: 'remoto' },
    ],
  },
  {
    chave: 'urbano',
    nome: 'Urbano',
    tipo: 'FIGHTING',
    bg: { primary: '#3d3a35', secondary: '#4a4640', image: ARTE.dojo },
    subBiomas: [
      { chave: 'metropolis', nome: 'Metropole', peso: 10, loot: 'civilizado' },
      { chave: 'slum', nome: 'Cortico', peso: 6, loot: 'civilizado' },
      { chave: 'dojo', nome: 'Dojo', peso: 6, loot: 'basico' },
    ],
  },
  {
    chave: 'industrial',
    nome: 'Industrial',
    tipo: 'ELECTRIC',
    bg: { primary: '#3b3f4a', secondary: '#474c59', image: ARTE.eletrico },
    subBiomas: [
      { chave: 'construction-site', nome: 'Obra', peso: 10, loot: 'civilizado' },
      { chave: 'factory', nome: 'Fabrica', peso: 6, loot: 'civilizado' },
      { chave: 'power-plant', nome: 'Usina', peso: 6, loot: 'remoto' },
      { chave: 'laboratory', nome: 'Laboratorio', peso: 3, loot: 'profundo' },
    ],
  },
  {
    chave: 'sagrado',
    nome: 'Sagrado',
    tipo: 'PSYCHIC',
    bg: { primary: '#4a3a55', secondary: '#584565', image: ARTE.dojo },
    subBiomas: [
      { chave: 'ruins', nome: 'Ruinas', peso: 10, loot: 'remoto' },
      { chave: 'temple', nome: 'Templo', peso: 6, loot: 'remoto' },
      { chave: 'fairy-cave', nome: 'Gruta Feerica', peso: 3, loot: 'profundo' },
    ],
  },
  {
    chave: 'sombrio',
    nome: 'Sombrio',
    tipo: 'GHOST',
    bg: { primary: '#2b2733', secondary: '#35303f', image: ARTE.caverna },
    subBiomas: [
      { chave: 'graveyard', nome: 'Cemiterio', peso: 10, loot: 'remoto' },
      { chave: 'abyss', nome: 'Abismo', peso: 6, loot: 'profundo' },
      { chave: 'space', nome: 'Espaco', peso: 3, loot: 'profundo' },
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
export const ABATES_POR_SALA = 12

export const BIOMA_POR_CHAVE: Record<string, BiomaDef> = Object.fromEntries(
  BIOMAS.map((b) => [b.chave, b])
)

export const FAIXA_POR_ID: Record<string, FaixaDef> = Object.fromEntries(
  FAIXAS.map((f) => [f.id, f])
)

/** Id da hunt de um bioma numa faixa. Estavel: e o que vai pro banco. */
export function huntId(bioma: string, faixa: FaixaId): string {
  return `${bioma}_${faixa}`
}

export const SUB_BIOMA_POR_CHAVE: Record<string, { sub: SubBiomaDef; bioma: BiomaDef }> =
  Object.fromEntries(
    BIOMAS.flatMap((bioma) => bioma.subBiomas.map((sub) => [sub.chave, { sub, bioma }]))
  )
