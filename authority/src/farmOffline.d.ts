import { type GameStateData, type GameStateStore, type OfflineSimSummary } from '#engine';
export declare const FRACAO_DO_PISO = 0.5;
export declare const AMOSTRA_MINIMA_SEGUNDOS = 300;
export declare const AMOSTRA_MINIMA_KILLS = 10;
export declare const NENHUM_PISO: ResultadoPiso;
export interface ResultadoPiso {
    aplicado: boolean;
    ouroAdicionado: number;
    xpAdicionado: number;
}
/**
 * Completa ouro/XP ate o piso, se a amostra permitir.
 *
 * O piso multiplica o tempo REALMENTE FARMADO (`simulatedSeconds`), nao o tempo
 * offline: se o POKE morreu aos 10 minutos por falta de pocao, o piso vale sobre
 * esses 10 minutos. Usar o tempo offline cheio anularia a regra de morte —
 * morrer renderia o mesmo que sobreviver.
 *
 * Captura, shiny e drop NAO entram: sao eventos, nao taxa. Nao existe "50% de um
 * shiny".
 */
export declare function aplicarPiso(store: GameStateStore, estado: GameStateData, resumo: OfflineSimSummary, agoraMs: number): ResultadoPiso;
