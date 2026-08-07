// Entrada do servico quando ele roda como Supabase Edge Function.
//
// So reexporta o handler: `app.ts` ja e um `fetch(Request) => Response`, que e
// exatamente a forma que Deno.serve espera. Era pra isso que o servico foi
// escrito sem framework — trocar Node por Deno nao mexe em regra nenhuma.
export { criarApp } from './app.js'
export type { OpcoesApp } from './app.js'
