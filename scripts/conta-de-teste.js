// A conta de teste do agente — uma so, reusada sempre.
//
//   node scripts/conta-de-teste.js            # status: quem existe hoje
//   node scripts/conta-de-teste.js --criar    # cria a canonica se faltar (idempotente)
//   node scripts/conta-de-teste.js --limpar   # apaga as descartaveis, poupa a canonica
//
// POR QUE ISTO EXISTE: em 8 dias o projeto acumulou 72 contas de teste contra 5
// jogadores reais. Nenhuma foi criada de ma fe — cada sessao escrevia um script
// proprio (`jogavel_<timestamp>@...`, `smoke52-...`, `t54akz...`), usava uma vez
// e ia embora. O lixo nao vinha de esquecimento, vinha de nao existir um lugar
// combinado pra criar e pra limpar.
//
// A REGRA, e por que ela e verificavel e nao so uma promessa:
//
//  1. reusar a conta canonica (CONTA_TESTE_EMAIL no .env). Toda vez.
//  2. se o teste exige uma segunda conta de verdade (cadastro, troca, correio
//     entre dois jogadores), ela PRECISA nascer no dominio reservado
//     `@teste.pokehunt.local`;
//  3. `--limpar` apaga tudo naquele dominio menos a canonica.
//
// O dominio reservado e o que torna a limpeza SEGURA: jogador de verdade nunca
// vai ter email nele, entao o delete nao consegue alcancar ninguem, mesmo rodado
// distraido. E por isso que o filtro e por dominio e nao por uma lista de quem
// fica — a lista de emails reais nao pode viver num arquivo versionado, e um
// filtro do tipo "dominio parece de teste" ja falhou na pratica: das contas
// apagadas em 2026-08-14, duas estavam em `gmail.com`.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DOMINIO = '@teste.pokehunt.local';
const EMAIL_PADRAO = `claude${DOMINIO}`;
const NOME_PADRAO = 'ClaudeTeste';

// Mesmo leitor de .env dos outros scripts (wipe-todos-os-saves.js,
// generate-catalog.js) — o projeto nao usa dotenv de proposito, pra os scripts
// nao terem dependencia.
function lerEnv() {
  const arquivo = path.join(ROOT, '.env');
  if (!fs.existsSync(arquivo)) {
    console.error('.env nao encontrado na raiz. Copie .env.example para .env e preencha.');
    process.exit(1);
  }
  const env = {};
  for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
    const t = linha.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('.env precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  return env;
}

/**
 * Grava a senha gerada no proprio .env.
 *
 * Preferido a imprimir na tela e pedir pra colar: senha em scrollback de
 * terminal fica em log, em screenshot e em historico de sessao de agente. O
 * .env ja e gitignored e ja guarda a service_role, que e um segredo bem maior.
 */
function gravarNoEnv(chave, valor) {
  const arquivo = path.join(ROOT, '.env');
  const atual = fs.readFileSync(arquivo, 'utf8');
  const sufixo = atual.endsWith('\n') || atual === '' ? '' : '\n';
  fs.appendFileSync(arquivo, `${sufixo}${chave}=${valor}\n`);
}

function api(env, caminho, init = {}) {
  return fetch(`${env.SUPABASE_URL}/auth/v1/admin${caminho}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

// Pagina de verdade em vez de pedir uma pagina gigante: a API tem teto proprio
// de `per_page`, e "veio menos que o pedido" e o unico fim de lista confiavel.
async function listarUsuarios(env) {
  const todos = [];
  for (let pagina = 1; ; pagina++) {
    const res = await api(env, `/users?page=${pagina}&per_page=200`);
    if (!res.ok) {
      console.error(`falha ao listar usuarios: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    const { users } = await res.json();
    todos.push(...users);
    if (users.length < 200) return todos;
  }
}

const ehDescartavel = (u) => (u.email || '').toLowerCase().endsWith(DOMINIO);

async function status(env, emailCanonica) {
  const usuarios = await listarUsuarios(env);
  const descartaveis = usuarios.filter(ehDescartavel);
  const canonica = usuarios.find((u) => (u.email || '').toLowerCase() === emailCanonica.toLowerCase());

  console.log(`Banco: ${env.SUPABASE_URL}`);
  console.log(`Contas no total:        ${usuarios.length}`);
  console.log(`Canonica (${emailCanonica}): ${canonica ? 'existe' : 'NAO existe — rode --criar'}`);
  console.log(`Descartaveis em ${DOMINIO}: ${descartaveis.length - (canonica ? 1 : 0)}`);
  for (const u of descartaveis) {
    if (canonica && u.id === canonica.id) continue;
    console.log(`  ${u.email}  (criada em ${u.created_at})`);
  }
  return { usuarios, canonica, descartaveis };
}

async function criar(env, emailCanonica) {
  const { canonica } = await status(env, emailCanonica);
  if (canonica) {
    console.log('\nNada a fazer: a conta canonica ja existe. Use ela.');
    return;
  }

  let senha = env.CONTA_TESTE_SENHA;
  let gerada = false;
  if (!senha) {
    // 24 bytes em base64url + digito: o projeto exige 8+ caracteres com letra E
    // numero (`password_requirements = "letters_digits"` no config.toml), e
    // base64 aleatorio pode sair sem nenhum digito.
    senha = `${crypto.randomBytes(24).toString('base64url')}7`;
    gerada = true;
  }

  const res = await api(env, '/users', {
    method: 'POST',
    body: JSON.stringify({
      email: emailCanonica,
      password: senha,
      // Sem isto a conta nasce pendente de confirmacao e nao consegue logar —
      // e nao ha caixa de entrada num dominio `.local`.
      email_confirm: true,
      // Lido pelo trigger `handle_new_user`, que cria a linha em `players` na
      // MESMA transacao. Sem o nome aqui o treinador nasce como "Treinador#xxxx".
      user_metadata: { trainer_name: NOME_PADRAO },
    }),
  });
  if (!res.ok) {
    console.error(`falha ao criar: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  if (gerada) {
    gravarNoEnv('CONTA_TESTE_SENHA', senha);
    console.log('\nSenha gerada e gravada em .env (CONTA_TESTE_SENHA). Nao foi impressa aqui de proposito.');
  }
  console.log(`Conta canonica criada: ${emailCanonica}`);
}

async function limpar(env, emailCanonica) {
  const { canonica, descartaveis } = await status(env, emailCanonica);
  const alvos = descartaveis.filter((u) => !canonica || u.id !== canonica.id);
  if (!alvos.length) {
    console.log('\nNada a limpar.');
    return;
  }

  console.log('');
  for (const u of alvos) {
    const res = await api(env, `/users/${u.id}`, { method: 'DELETE' });
    // Nao aborta no primeiro erro: uma conta presa nao pode impedir a limpeza
    // das outras, e o resumo no fim diz exatamente o que sobrou.
    console.log(res.ok ? `apagada: ${u.email}` : `FALHOU (${res.status}): ${u.email}`);
  }
}

async function main() {
  const env = lerEnv();
  const emailCanonica = env.CONTA_TESTE_EMAIL || EMAIL_PADRAO;

  if (!emailCanonica.toLowerCase().endsWith(DOMINIO)) {
    console.error(`CONTA_TESTE_EMAIL precisa terminar em ${DOMINIO} — e o dominio que a limpeza`);
    console.error('conhece. Fora dele, a conta vira lixo permanente que ninguem acha depois.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  if (args.includes('--criar')) return criar(env, emailCanonica);
  if (args.includes('--limpar')) return limpar(env, emailCanonica);
  await status(env, emailCanonica);
  console.log('\n--criar para provisionar a canonica, --limpar para apagar as descartaveis.');
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
