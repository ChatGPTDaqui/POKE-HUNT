import { type Config } from './db.js';
export interface Jogador {
    id: string;
    email: string | null;
}
export declare function autenticar(cfg: Config, req: Request): Promise<Jogador>;
/** Exposto so pra teste: o cache de chaves e estado de modulo e vaza entre casos. */
export declare function limparCacheDeChaves(): void;
