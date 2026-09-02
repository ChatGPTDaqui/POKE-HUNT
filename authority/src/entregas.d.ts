import { type Config } from './db.js';
import type { GameStateData } from '#engine';
export interface LinhaEntrega {
    id: string;
    user_id: string;
    gold: number;
    diamonds: number;
    item_id: string | null;
    quantity: number;
    motivo: string;
    created_at: string;
}
export interface NovaEntrega {
    userId: string;
    gold?: number;
    diamonds?: number;
    itemId?: string;
    quantity?: number;
    motivo: string;
}
export declare function enfileirarEntrega(cfg: Config, entrega: NovaEntrega): Promise<void>;
/**
 * Mesma coisa que `enfileirarEntrega`, mas em lote: um unico INSERT
 * multi-linha, atomico no Postgres (tudo ou nada). Usar sempre que mais de
 * uma entrega nasce do mesmo evento (ex: anexo de mensagem com varios itens)
 * pra nao correr risco de inserir a primeira metade e falhar no meio.
 */
export declare function enfileirarEntregas(cfg: Config, entregas: NovaEntrega[]): Promise<void>;
/**
 * Reivindica (de forma atomica) tudo que esta pendente pra este jogador.
 *
 * O `claimed_at=is.null` no FILTRO e o que torna isso atomico: dois requests
 * simultaneos do mesmo jogador nao podem reivindicar a mesma linha duas vezes,
 * porque o segundo PATCH nao encontra mais linha que case. A linha nao e
 * apagada — fica com carimbo, servindo de historico auditavel de "o jogo
 * realmente creditou isto".
 */
export declare function reivindicarEntregas(cfg: Config, userId: string): Promise<LinhaEntrega[]>;
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
export declare function devolverEntregas(cfg: Config, entregas: LinhaEntrega[]): Promise<void>;
/**
 * Aplica as entregas ao estado JA CARREGADO, antes de ele ser gravado.
 *
 * Muta `estado` direto (e nao pela store) de proposito: isto roda entre o
 * `carregarEstado` e o `criarEstadoDoJogador`, quando ainda nao existe store —
 * e sao somas simples em campos que o mapper ja sabe persistir.
 */
export declare function aplicarEntregasNoEstado(estado: GameStateData, entregas: LinhaEntrega[]): void;
