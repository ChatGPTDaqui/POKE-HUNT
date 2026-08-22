// Resolve o schema alvo dos scripts que falam com o PostgREST e monta os
// cabecalhos da chamada.
//
// POR QUE ISTO EXISTE: sem `Accept-Profile`/`Content-Profile` o PostgREST
// resolve no schema padrao, `public`. Seis dos sete scripts que usam `rest/v1`
// nunca mandavam esse header e nunca liam `SUPABASE_SCHEMA`, entao rodavam
// contra PRODUCAO mesmo com `SUPABASE_SCHEMA=dev` no `.env`. O pior caso era o
// `db:wipe`: ele chama `wipe_mundo_social` e `wipe_todos_os_saves` por nome
// puro, e as duas funcoes existem em `public` E em `dev` — a chamada caia na de
// `public` e apagava o save dos jogadores reais sem erro nenhum, porque a
// funcao existe e roda. Acertar o `.env` nao protegia: o schema nunca era
// enviado.
//
// A REGRA, na ordem de precedencia:
//
//   1. `--schema=<nome>` no argv, que vence sempre;
//   2. `SUPABASE_SCHEMA` do `.env`;
//   3. `dev` por omissao.
//
// E `public` exige `--confirmar-public` explicito, venha de onde vier — do
// argv ou do `.env`. O default seguro de um script que escreve nao e escolher
// producao em silencio, e sim recusar. Mesmo raciocinio que
// `scripts/strip-golpes-recordador-instances.mjs` ja aplicava sozinho; aqui ele
// passa a valer pra todos.
//
// Arquivo `.cjs` de proposito: metade destes scripts e CommonJS (`.js` com
// `require`) e metade e ESM (`.mjs`). CJS e o formato que os dois lados
// carregam sem ginastica.
'use strict';

const PUBLICO = 'public';
const PADRAO = 'dev';
const FLAG_PUBLIC = '--confirmar-public';

/**
 * Decide contra qual schema o script vai rodar. Sai do processo se o alvo for
 * `public` sem confirmacao explicita.
 *
 * @param {object} opcoes
 * @param {string[]} [opcoes.argv] argumentos ja sem `node` e sem o script
 * @param {string} [opcoes.envSchema] valor de `SUPABASE_SCHEMA` lido do `.env`
 * @returns {string} nome do schema
 */
function resolverSchema({ argv = process.argv.slice(2), envSchema } = {}) {
  const arg = argv.find((a) => a.startsWith('--schema='));
  const doArgv = arg ? arg.slice('--schema='.length).trim() : '';
  const doEnv = (envSchema || '').trim();
  const schema = doArgv || doEnv || PADRAO;

  if (schema === PUBLICO && !argv.includes(FLAG_PUBLIC)) {
    const origem = doArgv ? '--schema=public' : 'SUPABASE_SCHEMA=public no .env';
    console.error('');
    console.error(`  RECUSADO: alvo e o schema ${PUBLICO} (${origem}).`);
    console.error(`  ${PUBLICO} e o dado dos jogadores reais. Para mexer nele de verdade,`);
    console.error(`  repita o comando com ${FLAG_PUBLIC} no fim.`);
    console.error('');
    process.exit(1);
  }
  return schema;
}

/**
 * Cabecalhos de uma chamada ao PostgREST com o schema fixado. Manda os dois
 * profiles: `Accept-Profile` vale pra leitura, `Content-Profile` pra escrita e
 * pra RPC — mandar ambos cobre qualquer verbo sem o call-site precisar saber.
 *
 * @param {string} chave service_role key
 * @param {string} schema saida de `resolverSchema`
 * @param {object} [extra] cabecalhos adicionais (Prefer, Range, ...)
 */
function cabecalhosRest(chave, schema, extra = {}) {
  return {
    apikey: chave,
    Authorization: `Bearer ${chave}`,
    'content-type': 'application/json',
    'Accept-Profile': schema,
    'Content-Profile': schema,
    ...extra,
  };
}

exports.resolverSchema = resolverSchema;
exports.cabecalhosRest = cabecalhosRest;
exports.SCHEMA_PADRAO = PADRAO;
