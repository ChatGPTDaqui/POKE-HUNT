// Entrega de ouro/diamante/item vindo do Mercado.
//
// POR QUE UMA CAIXA DE ENTREGAS, E NAO UM UPDATE DIRETO NA LINHA DO VENDEDOR:
// o servidor grava progresso reescrevendo o SNAPSHOT inteiro do jogador
// (`gravarEstado`). Se A compra de B e o credito de B for um `update players
// set gold = gold + 500`, o proximo flush de B — que pode estar cacando nesse
// exato segundo — grava o ouro que ELE tinha em memoria por cima. O vendedor
// simplesmente nao receberia, sem erro nenhum em lugar nenhum. Foi por essa
// mesma classe de bug (escrita fora do snapshot) que `player_items` e
// `player_pokedex` ja precisaram de correcao neste projeto.
//
// Aqui o credito vira LINHA. Ela e reivindicada dentro do proximo request do
// proprio B (claim atomico) e aplicada ao estado que aquele request ja vai
// gravar de qualquer jeito. Nao existe janela entre creditar e persistir.
import { atualizarRetornando, inserir, type Config } from './db.js'
import type { GameStateData } from '#engine'

export interface LinhaEntrega {
  id: string
  user_id: string
  gold: number
  diamonds: number
  item_id: string | null
  quantity: number
  motivo: string
  created_at: string
}

export interface NovaEntrega {
  userId: string
  gold?: number
  diamonds?: number
  itemId?: string
  quantity?: number
  motivo: string
}

export async function enfileirarEntrega(cfg: Config, entrega: NovaEntrega): Promise<void> {
  await inserir(cfg, 'market_deliveries', {
    user_id: entrega.userId,
    gold: entrega.gold ?? 0,
    diamonds: entrega.diamonds ?? 0,
    item_id: entrega.itemId ?? null,
    quantity: entrega.quantity ?? 0,
    motivo: entrega.motivo,
  })
}

/**
 * Reivindica (de forma atomica) tudo que esta pendente pra este jogador.
 *
 * O `claimed_at=is.null` no FILTRO e o que torna isso atomico: dois requests
 * simultaneos do mesmo jogador nao podem reivindicar a mesma linha duas vezes,
 * porque o segundo PATCH nao encontra mais linha que case. A linha nao e
 * apagada — fica com carimbo, servindo de historico auditavel de "o jogo
 * realmente creditou isto".
 */
export async function reivindicarEntregas(cfg: Config, userId: string): Promise<LinhaEntrega[]> {
  return atualizarRetornando<LinhaEntrega>(
    cfg,
    `market_deliveries?user_id=eq.${userId}&claimed_at=is.null`,
    { claimed_at: new Date().toISOString() },
  )
}

/**
 * Aplica as entregas ao estado JA CARREGADO, antes de ele ser gravado.
 *
 * Muta `estado` direto (e nao pela store) de proposito: isto roda entre o
 * `carregarEstado` e o `criarEstadoDoJogador`, quando ainda nao existe store —
 * e sao somas simples em campos que o mapper ja sabe persistir.
 */
export function aplicarEntregasNoEstado(estado: GameStateData, entregas: LinhaEntrega[]): void {
  for (const e of entregas) {
    if (e.gold) estado.wallet.gold += e.gold
    if (e.diamonds) estado.wallet.diamonds += e.diamonds
    if (e.item_id && e.quantity > 0) {
      estado.items[e.item_id] = (estado.items[e.item_id] ?? 0) + e.quantity
    }
  }
}
