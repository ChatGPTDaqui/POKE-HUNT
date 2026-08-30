import type { GameStateData, GameStateStore } from '#engine';
export interface EstadoDoJogador {
    /** O que o motor recebe onde o navegador passaria a store. */
    store: GameStateStore;
    /** O dado cru, pra gravar no banco depois da simulacao. */
    dados: GameStateData;
}
export declare function criarEstadoDoJogador(dados: GameStateData): EstadoDoJogador;
