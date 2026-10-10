// Recompensas por nível de treinador (10/10/2026, decisão do dono).
//
// POR QUE EXISTE: subir de nível de treinador ganhava cartão de celebração a
// cada nível e não dava nada além da posição no Ranking. Agora há um marco a
// cada 5 níveis até o 100 e a cada 25 até o 1000, pago pelo servidor
// (`reivindicar_niveis_de_treinador`).
//
// POR QUE O OURO É QUADRÁTICO: medido em 10/10, os treinadores vão do Lv 1 ao
// 331, e quem está acima do 200 tem de 60 a 300 milhões de ouro. Ouro linear
// seria esmola no fim de jogo; `100×n + 5×n²` dá 625 no Lv 5 e 480 mil no Lv 300.
//
// A MESMA LISTA vive na migration (jsonb `v_marcos`); `recompensasDeNivel.test.ts`
// reprova se divergirem. Conta antiga coleta o retroativo (decisão do dono).
import type { RecompensaDoPasso } from './primeirosPassos'

export interface MarcoDeTreinador {
  nivel: number
  recompensa: RecompensaDoPasso
}

export const NIVEL_MAXIMO_DOS_MARCOS = 1000

function niveisDosMarcos(): number[] {
  const niveis: number[] = []
  for (let n = 5; n <= 100; n += 5) niveis.push(n)
  for (let n = 125; n <= NIVEL_MAXIMO_DOS_MARCOS; n += 25) niveis.push(n)
  return niveis
}

function recompensaDoNivel(n: number): RecompensaDoPasso {
  const bola = n <= 25 ? { itemId: 'great_ball', quantidade: 25 }
    : n <= 60 ? { itemId: 'ultra_ball', quantidade: 25 }
      : { itemId: 'ultra_ball', quantidade: 50 }
  const itens = [bola]
  if (n % 25 === 0) itens.push({ itemId: n <= 100 ? 'revive' : 'max_revive', quantidade: 3 })
  return { ouro: 100 * n + 5 * n * n, itens }
}

export const MARCOS_DE_TREINADOR: MarcoDeTreinador[] = niveisDosMarcos().map(nivel => ({ nivel, recompensa: recompensaDoNivel(nivel) }))

/** Chave em `recompensa_concedida` — a mesma que a RPC grava. */
export const chaveDoNivel = (nivel: number) => `nivel:${nivel}`

export interface SituacaoDosMarcos {
  /** Marcos alcançados e ainda não coletados. */
  pendentes: MarcoDeTreinador[]
  /** Próximo marco ainda não alcançado (`null` depois do Lv 1000). */
  proximo: MarcoDeTreinador | null
}

export function situacaoDosMarcos(nivelDoTreinador: number, coletados: ReadonlySet<number>): SituacaoDosMarcos {
  return {
    pendentes: MARCOS_DE_TREINADOR.filter(m => m.nivel <= nivelDoTreinador && !coletados.has(m.nivel)),
    proximo: MARCOS_DE_TREINADOR.find(m => m.nivel > nivelDoTreinador) ?? null,
  }
}

/** Soma de vários marcos, para o "Coletar tudo" dizer o total. */
export function somaDasRecompensas(marcos: MarcoDeTreinador[]): RecompensaDoPasso {
  const itens = new Map<string, number>()
  let ouro = 0
  for (const m of marcos) {
    ouro += m.recompensa.ouro
    for (const i of m.recompensa.itens) itens.set(i.itemId, (itens.get(i.itemId) ?? 0) + i.quantidade)
  }
  return { ouro, itens: [...itens].map(([itemId, quantidade]) => ({ itemId, quantidade })) }
}
