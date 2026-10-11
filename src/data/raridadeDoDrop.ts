// Quao raro e um item que caiu do POKE derrotado — decide o BRILHO dele no chao
// (render/itemNoChao.ts). Pedido do dono (11/10): item raro tem que ter algo
// visual "que gere dopamina ao ver".
//
// FIXO POR ITEM, e nao pela chance da sala em que caiu: uma Potion e comum na
// sala que da 15% e na que da 18%. Os degraus seguem as chances reais de drop
// (data/biomas.ts#LOOT, STONE_DROP_CHANCE 5%, CHANCE_DROP_TM 0,1%):
//   comum     >= 10%   Potion, Poke Ball, Super Potion
//   incomum   5-10%    Great Ball, Hyper Potion, Ultra Ball, Pedras (5%)
//   raro      1-5%     Revive (3%), Max Revive (1,5%)
//   lendario  < 1%     TM (0,1%)
// Item que nao estiver aqui (novo no catalogo) cai como comum — nunca some.
//
// As cores sao as da raridade de POKE (data/rarity.ts): o jogador ja aprendeu
// que verde < azul < dourado, e o drop fala a mesma lingua.
import { RARITIES, type RarityKey } from './rarity'

export type RaridadeDoDrop = 'comum' | 'incomum' | 'raro' | 'lendario'

const POR_ITEM: Record<string, RaridadeDoDrop> = {
  great_ball: 'incomum',
  hyper_potion: 'incomum',
  ultra_ball: 'incomum',
  max_potion: 'incomum',
  full_heal: 'incomum',
  revive: 'raro',
  max_revive: 'raro',
  premier_ball: 'raro',
}

export function raridadeDoDrop(itemId: string): RaridadeDoDrop {
  if (/^tm_\d{2,3}$/.test(itemId)) return 'lendario'
  if (itemId.startsWith('stone_')) return 'incomum'
  return POR_ITEM[itemId] ?? 'comum'
}

const COR_DA_RARIDADE_DE_POKE: Record<RaridadeDoDrop, RarityKey> = {
  comum: 'comum',
  incomum: 'incomum',
  raro: 'raro',
  lendario: 'legendary',
}

/** Cor do brilho, a mesma da raridade de POKE correspondente. */
export function corDoDrop(raridade: RaridadeDoDrop): string {
  return RARITIES[COR_DA_RARIDADE_DE_POKE[raridade]].color
}
