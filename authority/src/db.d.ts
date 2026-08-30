export interface Config {
    supabaseUrl: string;
    serviceRoleKey: string;
    schema?: string;
    jwksJson?: string;
}
export declare class ErroHttp extends Error {
    status: number;
    constructor(status: number, message: string);
}
export declare function selecionar<T>(cfg: Config, caminho: string): Promise<T[]>;
/**
 * PostgREST corta em 1000 linhas por request SEM ERRO NENHUM (200 OK com dado
 * mutilado). Este projeto ja levou essa mordida no catalogo — ver "Gotchas
 * conhecidos" no CLAUDE.md. Aqui a defesa e a mesma: paginar por `Range` e
 * conferir o total contra o `Content-Range` que o servidor devolve.
 */
export declare function selecionarTudo<T>(cfg: Config, caminho: string, pagina?: number): Promise<T[]>;
/**
 * Quantas linhas casam com o filtro — sem trazer nenhuma.
 *
 * Existe porque `selecionar(...).length` MENTE: o PostgREST corta em 1000 linhas
 * em silencio (o gotcha que este projeto ja documentou no catalogo). O Perfil
 * contava jogadores assim, entao a partir do jogador 1001 o total e a posicao no
 * ranking congelariam — e nada no jogo denunciaria isso, porque o numero
 * continua parecendo plausivel.
 *
 * `Range: 0-0` + `count=exact` traz UMA linha e o total no `Content-Range`.
 */
export declare function contar(cfg: Config, caminho: string): Promise<number>;
export declare function inserir<T>(cfg: Config, tabela: string, linhas: unknown, opcoes?: {
    retornar?: boolean;
    upsert?: string;
}): Promise<T[]>;
export declare function atualizar(cfg: Config, caminho: string, patch: unknown): Promise<void>;
/**
 * PATCH que devolve as linhas afetadas — e a base de todo compare-and-swap
 * deste servico.
 *
 * O servico e serverless: nao ha transacao aberta entre duas chamadas ao
 * PostgREST, entao "ler a ordem, decidir, gravar" e uma corrida sempre que dois
 * jogadores tocam o mesmo livro de ofertas. O padrao usado no Mercado e mandar
 * o valor ANTIGO no filtro (`&remaining=eq.7`) junto do novo no corpo: se
 * outra requisicao chegou primeiro, o filtro nao casa, a resposta volta VAZIA e
 * quem chamou sabe que perdeu a corrida — em vez de sobrescrever em silencio.
 *
 * Com `return=minimal` isso seria indistinguivel de sucesso, que e exatamente
 * o modo de falha que este helper existe pra evitar.
 */
export declare function atualizarRetornando<T>(cfg: Config, caminho: string, patch: unknown): Promise<T[]>;
/**
 * Reivindica uma linha por CAS (via `atualizarRetornando`) e roda `fn` com
 * ela. Se a corrida for perdida (claim veio vazio), lanca `ErroHttp(409, ...)`
 * antes de chamar `fn`. Se `fn` lancar, desfaz o claim (aplica
 * `patchDesfazer` na mesma linha, por id) e repropaga o erro ORIGINAL — pra
 * "reivindicado mas nunca processado" nunca virar perda silenciosa.
 *
 * Generaliza o padrao "PATCH+filtro, vazio=corrida perdida, desfazer se o
 * downstream falhar" usado em `coletarAnexo` (PH-21). NAO cobre:
 * - `casar()` (mercado.ts, PH-3): perde a corrida e RETENTA com um delta
 *   recalculado sobre saldo divisivel — estrategia diferente, nao um claim
 *   marcador com undo.
 * - `evolvePoke` (PH-12): nao e CAS de banco nenhum, e client-side
 *   (confirm-then-apply — so debita a Stone depois do servidor confirmar).
 * - `playerRepository.ts` (PH-17/PH-18): roda no cliente via supabase-js
 *   (`.eq()` chaining), transporte diferente deste `db.ts` baseado em fetch.
 * - `aplicarFlush`/`gravarEstado` (PH-5, progresso.ts): `gravarEstado` faz o
 *   CAS na escrita final inteira, nao ha nada a desfazer se falhar (ja lanca
 *   409 direto); `aplicarFlush` decide de proposito NAO reverter
 *   `last_flush_at` quando o downstream falha, pra sessao quebrada nao
 *   entrar em loop de retry — contrato oposto ao deste helper.
 *
 * Ver PH-1 (epic) para o raciocinio completo de por que esses 5 ficam fora.
 */
export declare function comClaimAtomico<L extends object, T>(cfg: Config, tabela: string, filtroClaim: string, patchClaim: Record<string, unknown>, patchDesfazer: Record<string, unknown>, fn: (linhaClaimada: L) => Promise<T>, opcoes?: {
    idCampo?: string;
    mensagemCorridaPerdida?: string;
}): Promise<T>;
/**
 * Chama uma funcao do Postgres via `POST /rest/v1/rpc/<nome>`.
 *
 * Usado onde a pergunta e do BANCO e nao cabe num filtro: o unico caso hoje e
 * "este nome de treinador esta livre?", que compara por `lower(trainer_name)`.
 * Fazer isso com `ilike` daria falso positivo — `_` e curinga de uma letra em
 * LIKE, e `_` e um caractere valido de nick, entao "ash_1" apareceria como
 * ocupado por causa de um "ashX1" de outra pessoa.
 */
export declare function chamarRpc<T>(cfg: Config, nome: string, argumentos: unknown): Promise<T>;
export declare function apagar(cfg: Config, caminho: string): Promise<void>;
