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
      { chave: 'plains', nome: 'Planície', peso: 10, loot: 'basico', bg: { primary: '#3f5a34', secondary: '#4a6a3d', image: ARTE.planicie } },
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
    nome: 'Águas Interiores',
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
      { chave: 'laboratory', nome: 'Laboratório', peso: 3, loot: 'profundo' },
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
      { chave: 'space', nome: 'Espaço', peso: 3, loot: 'profundo', bg: { primary: '#2b2733', secondary: '#35303f', image: ARTE.abismo } },
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

export const SUB_BIOMA_POR_CHAVE: Record<string, { sub: SubBiomaDef; bioma: BiomaDef }> =
  Object.fromEntries(
    BIOMAS.flatMap((bioma) => bioma.subBiomas.map((sub) => [sub.chave, { sub, bioma }]))
  )
