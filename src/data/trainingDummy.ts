// Treinamento: hunt-alvo pra medir a forca do time sem efeito nenhum na
// economia. Pedido do usuario ("hunt decoy... pra testar e medir a forca dos
// nossos pokemons"); design abaixo e uma decisao de jogo, nao dado sincronizado
// — mesmo padrao hand-authored do Campeao Lance em nightmareMaps.ts.
//
// Wobbuffet e a escolha tematica obvia de boneco de treino: e a UNICA
// especie do roster (com Metapod/Kakuna/Ditto/Smeargle/Abra, ver `pokes.ts`)
// sem NENHUM golpe de dano por nivel, e no jogo real e literalmente famoso
// por ser usado como parede/saco de pancada.
//
// `passiveEnemies: true` (ver huntTypes.ts e combatSystem.ts#executeEnemyAction)
// e quem garante "seguro pra qualquer time", nao o tema nem os IVs baixos de
// ataque. Tentativa anterior, medida AO VIVO: so os IVs (`TREINO_IVS` abaixo)
// desmaiou um Charmander Lv2 de 11 HP com o proprio Ataque Basico do
// Wobbuffet — o termo de NIVEL da formula de dano pesa mais que o ATK quase
// zerado, e um gap de 58 niveis ainda passava dano real. Travar o ataque no
// motor (o inimigo nunca ataca, so apanha) e a unica garantia que nao
// depende de acertar um numero de stat.
//
// `noRewards: true` (novo campo, ver huntTypes.ts e simulation.ts) e o que
// faz ela ser DE VERDADE um "decoy": zero ouro, XP, item ou captura por
// abate. Sem isso a hunt viraria a forma mais eficiente de grindar Wobbuffet
// pro Bestiario de graca, ou pior, um jeito de fazer XP/ouro de baixo risco
// se o nivel do boneco fosse generoso. O beneficio real fica só no numero que
// JA existe pra isso — "Mobs/h" do Hunt Analyzer — que sem ouro/XP disputando
// atencao vira exatamente um placar comparavel: quantos bonecos de treino seu
// time abate por hora.
import type { HuntMapDef, HuntEncounter } from './huntTypes'
import { GRUPOS_INICIAIS } from './biomas'

export const TRAINING_MAP_ID = 'treinamento'
const TRAINING_ENCOUNTER_ID = 'treinamento_wobbuffet'

// HP bem alto (IV de HP maxado), ataque e velocidade no minimo — o oposto do
// perfil de qualquer POKE selvagem de verdade, de proposito.
const TREINO_IVS = { hp: 31, atkFis: 0, atkEsp: 0, def: 15, defEsp: 15, speed: 0 }
// Nivel fixo (sem escalar pelo POKE do jogador — o motor nao tem esse
// conceito hoje, e adiciona-lo so pra isto seria desproporcional ao pedido).
// 60 e o teto da Faixa II, o mesmo nivel do time do Campeao Lance: alto o
// bastante pra dar HP de sobra num boneco que devia aguentar apanhar por um
// bom tempo, sem exigir ter vencido o Lance pra treinar.
const TREINO_LEVEL = 60

export const TRAINING_ENCOUNTER: HuntEncounter = {
  id: TRAINING_ENCOUNTER_ID,
  speciesId: 'wobbuffet',
  minLevel: TREINO_LEVEL,
  maxLevel: TREINO_LEVEL,
  aggroRadius: 260,
  wanderRadius: 15, // fica perto do proprio ponto de spawn, sem sair vagando pelo mapa pequeno
  weight: 1,
  rarity: 'comum', // sem selo de raridade chamativo — e um boneco, nao um spawn especial
  ivs: TREINO_IVS,
}

export const TRAINING_MAP: HuntMapDef = {
  id: TRAINING_MAP_ID,
  name: 'Treinamento',
  description: 'Um boneco de treino (Wobbuffet, nunca revida) pra testar a força do seu time com segurança. Sem ouro, XP, item ou captura — só pra medir: acompanhe "Mobs/h" no Hunt Analyzer.',
  levelRange: [TREINO_LEVEL, TREINO_LEVEL],
  unlockCost: null,
  // Nasce liberada pra qualquer conta, do primeiro POKE ao ultimo.
  continent: GRUPOS_INICIAIS[0],
  bounds: { width: 1000, height: 700 },
  playerSpawn: { x: 500, y: 470 },
  bg: { primary: '#2c2f3a', secondary: '#3a3f52', image: 'assets/hunt-backgrounds/dojo.jpg' },
  maxEnemies: 1,
  respawnDelay: 2, // religa rapido — testar nao pode parar pra esperar respawn
  spawnPoints: [{ x: 500, y: 280 }],
  enemyPool: [TRAINING_ENCOUNTER_ID],
  itemDrops: [],
  noCatch: true, // e um fixture de teste, nao um spawn de verdade
  noRewards: true,
  passiveEnemies: true, // nunca revida — ver a nota no topo do arquivo
}
