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
  await enfileirarEntregas(cfg, [entrega])
}

/**
 * Mesma coisa que `enfileirarEntrega`, mas em lote: um unico INSERT
 * multi-linha, atomico no Postgres (tudo ou nada). Usar sempre que mais de
 * uma entrega nasce do mesmo evento (ex: anexo de mensagem com varios itens)
 * pra nao correr risco de inserir a primeira metade e falhar no meio.
 */
export async function enfileirarEntregas(cfg: Config, entregas: NovaEntrega[]): Promise<void> {
  if (entregas.length === 0) return
  await inserir(
    cfg,
    'market_deliveries',
    entregas.map((entrega) => ({
      user_id: entrega.userId,
      gold: entrega.gold ?? 0,
      diamonds: entrega.diamonds ?? 0,
      item_id: entrega.itemId ?? null,
      quantity: entrega.quantity ?? 0,
      motivo: entrega.motivo,
    })),
  )
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
 * Desfaz o claim: as entregas voltam pra fila.
 *
 * Existe por causa de um bug REAL de perda de progresso. O claim acontece no
 * `carregarEstadoParaEscrita`, ou seja, ANTES de a operacao rodar — e uma
 * operacao recusada (409 "Ouro insuficiente", item travado, POKE ja evoluido...)
 * nunca chega ao `gravarEstado`. As entregas ficavam carimbadas como aplicadas
 * sem terem sido aplicadas a lugar nenhum. Medido: uma venda de 500 de ouro no
 * Mercado sumiu porque o jogador, em seguida, tentou comprar algo que nao podia
 * pagar. Como 409 e o erro mais comum do jogo, isso acontecia o tempo todo.
 */
export async function devolverEntregas(cfg: Config, entregas: LinhaEntrega[]): Promise<void> {
  if (!entregas.length) return
  await atualizarRetornando(
    cfg,
    `market_deliveries?id=in.(${entregas.map((e) => e.id).join(',')})`,
    { claimed_at: null },
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
