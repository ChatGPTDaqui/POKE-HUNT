// Diário (10/10/2026): metas do dia e login do mês. Decisões do dono.
//
// Metas: 3 degraus de abates contados desde a primeira abertura do dia (o
// servidor anota a base em `abrir_dia()`; o cliente não consegue forjar).
// Farm offline NÃO existe (quarentena): só conta o que o jogo caçou aberto.
// Login: um prêmio por dia em que o jogador coleta, contando DIAS COLETADOS no
// mês — perder um dia não zera, só atrasa. Dias 7/14/21/28 são especiais.
//
// Os mesmos números estão na migration `..._diario_*.sql`; `diario.test.ts`
// reprova se divergirem. O ouro usa a base dos marcos de treinador,
// `100×Lv + 5×Lv²`, com piso para o começo do jogo.
import type { RecompensaDoPasso } from './primeirosPassos'

export type ItemDoDiario = 'login' | 'meta_100' | 'meta_300' | 'meta_1000'

export const METAS_DO_DIA = [
  { id: 'meta_100', alvo: 100 },
  { id: 'meta_300', alvo: 300 },
  { id: 'meta_1000', alvo: 1000 },
] as const satisfies readonly { id: ItemDoDiario; alvo: number }[]

/** Dias do login que dão prêmio especial. */
export const DIAS_ESPECIAIS = [7, 14, 21, 28] as const

const ouroBase = (nivel: number) => 100 * nivel + 5 * nivel * nivel
// `Math.floor` porque o SQL divide bigint por int (trunca).
const parte = (nivel: number, divisor: number, piso: number) => Math.max(piso, Math.floor(ouroBase(nivel) / divisor))

/** Prêmio do k-ésimo login coletado no mês. */
export function recompensaDoLogin(k: number, nivel: number): RecompensaDoPasso {
  switch (k) {
    case 7: return { ouro: parte(nivel, 4, 2000), itens: [{ itemId: 'ultra_ball', quantidade: 30 }, { itemId: 'revive', quantidade: 3 }] }
    case 14: return { ouro: parte(nivel, 3, 4000), itens: [{ itemId: 'ultra_ball', quantidade: 40 }, { itemId: 'revive', quantidade: 5 }] }
    case 21: return { ouro: parte(nivel, 2, 6000), itens: [{ itemId: 'ultra_ball', quantidade: 50 }, { itemId: 'max_revive', quantidade: 3 }] }
    case 28: return { ouro: parte(nivel, 1, 10000), itens: [{ itemId: 'ultra_ball', quantidade: 100 }, { itemId: 'max_revive', quantidade: 5 }] }
    default: return { ouro: parte(nivel, 20, 300), itens: [{ itemId: 'great_ball', quantidade: 15 }, { itemId: 'super_potion', quantidade: 5 }] }
  }
}

export function recompensaDaMeta(id: (typeof METAS_DO_DIA)[number]['id'], nivel: number): RecompensaDoPasso {
  switch (id) {
    case 'meta_100': return { ouro: parte(nivel, 10, 500), itens: [{ itemId: 'great_ball', quantidade: 20 }, { itemId: 'super_potion', quantidade: 10 }] }
    case 'meta_300': return { ouro: parte(nivel, 5, 1000), itens: [{ itemId: 'ultra_ball', quantidade: 25 }] }
    case 'meta_1000': return { ouro: parte(nivel, 2, 2500), itens: [{ itemId: 'ultra_ball', quantidade: 50 }, { itemId: 'revive', quantidade: 3 }] }
  }
}

/** O dia de Brasília (mesma conta de `_dia_do_diario()` no banco), `YYYY-MM-DD`. */
export function diaDeBrasilia(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
}
