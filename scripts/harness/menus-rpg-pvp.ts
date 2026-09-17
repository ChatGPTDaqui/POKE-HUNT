// Respostas fictícias exclusivamente para a bancada configurada em menus-rpg.vite.mts.
export * from '../../src/data/remote/pvpRpc'
let pokemonIds = ['preview-0', 'preview-1', 'preview-2']
export async function meuTimePvp() { return { pokemonIds, atualizadoEm: '2026-09-16' } }
export async function salvarTimePvp(ids: string[]) { pokemonIds = [...ids]; return meuTimePvp() }
export async function meuPvpVivo() { return null }
export async function historicoPvp() { return [] }
