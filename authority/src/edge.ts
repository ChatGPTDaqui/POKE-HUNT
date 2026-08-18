// Entrada do servico quando ele roda como Supabase Edge Function.
//
// So reexporta o handler: `appSessao.ts` ja e um `fetch(Request) => Response`,
// que e exatamente a forma que Deno.serve espera. Aponta pro router MINIMO
// (so sessao) desde a migracao RPC-everything — ver _Architecture.md, secao
// "Sessao ao vivo". `app.ts` (28 rotas) fica orfa, apagada no corte final (#17).
export { criarApp } from './appSessao.js'
export type { OpcoesApp } from './appSessao.js'
