import { type Config } from './db.js';
import { type LinhaSessao, type LinhaSalaProtetor } from './progresso.js';
import { type BiomaProgress, type SalaAtiva } from '#engine';
export interface OpcoesApp extends Config {
    origensPermitidas: string[];
}
export declare function criarApp(cfg: OpcoesApp): (req: Request) => Promise<Response>;
/**
 * Sem flush ha mais que isto, a sessao esta ABANDONADA (PH-277).
 *
 * O cliente flusha a cada 30s e nunca deixa passar mais que
 * `INTERVALO_FLUSH_MAX_MS` (90s, autoridade.ts) enquanto a aba esta viva —
 * qualquer evento volta o intervalo pro piso, e `visibilitychange` dispara um
 * flush sozinho. Meia hora e 20x o teto: nao existe sessao viva desse lado.
 *
 * NAO E MAIS APERTADO DE PROPOSITO. O custo de fechar cedo demais e real e cai
 * no jogador: fechar a sessao perde a POSICAO NAS SALAS (`sala`, `ciclos`), e
 * quem voltar de um notebook que dormiu 10 minutos recomecaria no ciclo 1, sala
 * 1. 30 minutos deixa esse caso inteiro de fora e ainda pega o que a PH-277
 * mediu no banco: linhas paradas ha 4 horas e ha 1 dia e 6 horas.
 *
 * O tempo abandonado NAO E CREDITADO, e isso e o ponto — nao um efeito
 * colateral. Ele nunca foi simulado por ninguem, exatamente como a orfa que
 * `sessaoAberta` ja fechava sem creditar. Hoje `FARM_OFFLINE_PAUSADO` faria o
 * descarte de qualquer jeito; o dia em que ele voltar a `false` e o dia em que
 * a sessao esquecida viraria horas de credito retroativo, com a assimetria
 * injusta de premiar quem fecha a aba de qualquer jeito e nao quem sai pela
 * porta.
 *
 * O GEMEO DESTE NUMERO E SQL: `fechar_sessoes_inativas()` usa o mesmo limite
 * (migration `20260830010000`), porque o caminho de acesso so alcanca quem
 * volta — sessao de quem nunca mais aparece precisa do cron. `limiteDeSessao
 * Inativa.test.ts` reprova se os dois se separarem.
 */
export declare const SESSAO_INATIVA_SEGUNDOS: number;
/**
 * A sessao aberta do jogador — e no maximo UMA.
 *
 * O indice unico parcial `game_sessions_abertas` garante isso desde a migration
 * `20260809180000`. A varredura abaixo continua existindo como defesa em
 * profundidade e como conserto de dado legado: uma orfa nascida antes do indice
 * (ou num ambiente sem a migration) seria flushada mais tarde e creditaria de
 * novo um periodo que a sessao vencedora ja pagou — o exploit de duplicacao que
 * aquela migration descreve. Fechar sem creditar e o certo: o tempo dela ja foi
 * pago pela outra.
 *
 * PH-277: a MESMA regra passa a valer pra sessao ABANDONADA. Ela e devolvida
 * como `null`, e nao reaproveitada, entao o chamador abre uma nova — o que
 * significa que o intervalo esquecido nunca chega a `aplicarFlush`.
 */
declare function sessaoAberta(cfg: Config, userId: string): Promise<LinhaSessao | null>;
/** Passou de `SESSAO_INATIVA_SEGUNDOS` sem nenhum flush? */
export declare function sessaoAbandonada(sessao: Pick<LinhaSessao, 'last_flush_at'>, agora?: number): boolean;
/**
 * PH-227/236: mensagem de bloqueio (ou `null` se liberado) do gate
 * sequencial de bioma — vencer o Lord do bioma N libera o N+1 (PH-207/226).
 *
 * Pura de proposito: testavel isolada, sem precisar mockar `db.js`/HTTP
 * inteiro so pra exercitar uma regra de negocio. `biomaDoMapId` (PH-229)
 * e a MESMA funcao que HuntMenu usa pro selo/ordem/mensagem do menu — os
 * dois lados tem que concordar sobre "que bioma e esse mapId" E sobre o
 * texto exato da mensagem (`HuntMenu.tsx#bloqueioDeBiomaClient` espelha
 * esta string).
 */
export declare function bloqueioDeBiomaPendente(mapId: string, grupo: string, biomaProgress: BiomaProgress): string | null;
/**
 * A sala em que a hunt parou, quando esta abertura e uma REENTRADA (PH-266).
 *
 * O BUG: `/sessao/abrir` sempre gravava `sala_indice: 0, sala_abates: 0,
 * ciclos: 0` e sorteava uma sala inicial. Como o boot fecha a sessao pendente
 * antes de reentrar (bootDaSessao.ts), um F5 no meio da sala 7 devolvia o
 * jogador pra sala 1 do ciclo 1 — progresso de sala perdido por recarregar a
 * pagina.
 *
 * ISTO NAO AFROUXA O ANTI-REROLL. O que a nota do topo de salaSystem.ts protege
 * e o jogador RE-SORTEAR salas ate cair a que ele quer; herdar a sala em que ele
 * ja estava e o oposto disso — ele fica exatamente onde parou, sem sorteio novo.
 *
 * Tres condicoes, todas verificadas AQUI e nao no cliente:
 *  - a intencao veio marcada como reentrada (`retomando`);
 *  - a ultima sessao do jogador NESTE mapa (nao em qualquer um);
 *  - fechada ha menos de `JANELA_DE_HERANCA_DE_SALA_MS`.
 *
 * O protetor pendente vem junto de proposito. Sem ele, dar F5 no meio da luta
 * contra um Guardian herdaria a sala e APAGARIA o protetor — trocando a perda
 * de progresso por um jeito de se livrar do bicho, que e pior.
 */
export interface HerancaDeSala {
    sala: SalaAtiva;
    protetor: LinhaSalaProtetor | null;
}
/**
 * A REGRA, separada do acesso ao banco — mesmo motivo de
 * `bloqueioDeBiomaPendente` ser pura: da pra exercitar "sessao velha demais",
 * "sem sala" e "protetor junto" sem mockar db.js/HTTP inteiro.
 *
 * `agoraMs` entra por parametro pra o teste nao depender do relogio real.
 */
export declare function herancaDaLinha(ultima: LinhaSessao | undefined, agoraMs: number): HerancaDeSala | null;
/**
 * Ponte SO PRA TESTE de `sessaoAberta`.
 *
 * Ela e privada de proposito — quem precisa dela e o roteador logo acima, e
 * exporta-la de verdade convidaria outro modulo a pular o caminho do request.
 * O `__testes` deixa isso explicito no nome, em vez de promover a funcao a API
 * publica pra o teste alcancar (PH-277).
 */
export declare const __testes: {
    sessaoAberta: typeof sessaoAberta;
};
export {};
