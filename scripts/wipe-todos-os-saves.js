// Apaga o progresso de TODOS os jogadores no banco de producao.
//
//   node scripts/wipe-todos-os-saves.js --confirmar=APAGAR-TUDO
//
// A regra de jogo (o que e "conta nova": ouro/itens/hunts iniciais) NAO vive
// aqui — vive na funcao `public.wipe_todos_os_saves()` (migration
// `20260808120000_rotina_de_wipe.sql`), que roda numa transacao so e reusa a
// mesma concessao inicial de `handle_new_user`. Este arquivo e so o gatilho:
// pede confirmacao, chama a RPC e imprime o que foi feito.
//
// A confirmacao e por FRASE EXATA e nao por `-y`: um `-y` no fim de uma linha de
// comando reaproveitada do historico apaga o banco sem ninguem ler o que estava
// escrito.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FRASE = 'APAGAR-TUDO';

// Mesmo leitor de .env dos outros scripts (generate-catalog.js) — o projeto nao
// usa dotenv de proposito, pra os scripts nao terem dependencia.
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) {
    console.error('.env nao encontrado na raiz. Copie .env.example para .env e preencha.');
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const i = trimmed.indexOf('=');
    env[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('.env precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  return env;
}

function confirmacaoDoArgv() {
  const arg = process.argv.slice(2).find((a) => a.startsWith('--confirmar='));
  return arg ? arg.slice('--confirmar='.length) : null;
}

async function main() {
  if (confirmacaoDoArgv() !== FRASE) {
    console.error('');
    console.error('  ATENCAO: isto apaga o progresso de TODOS os jogadores. Nao ha volta.');
    console.error('  Equipe, mochila, ouro, Pokedex e regras de auto de toda conta sao perdidos.');
    console.error('  O Mercado (ordens, anuncios, historico, entregas), o Chat Mundo, o Correio');
    console.error('  e as amizades tambem sao apagados. O NOME do treinador e preservado.');
    console.error('  As contas em si (login) continuam existindo — so o save volta ao inicio.');
    console.error('');
    console.error(`  Para executar de verdade:  node scripts/wipe-todos-os-saves.js --confirmar=${FRASE}`);
    console.error('');
    process.exit(1);
  }

  const env = loadEnv();
  // Deixa VISIVEL contra qual projeto vai rodar. Um wipe apontado pro banco
  // errado e o pior resultado possivel deste script.
  console.log(`Banco: ${env.SUPABASE_URL}`);

  const chamar = async (rpc) => {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    const texto = await res.text();
    if (res.status >= 400) {
      console.error(`falhou em ${rpc}: ${res.status} ${texto}`);
      console.error('Se a funcao nao existe, aplique as migrations: npx supabase db push');
      process.exit(1);
    }
    const linhas = JSON.parse(texto);
    return Array.isArray(linhas) ? linhas[0] : linhas;
  };

  // ORDEM OBRIGATORIA: o mundo social sai primeiro. `market_listings.poke_uid`
  // referencia `pokemon_instances` com `on delete restrict` (anuncio orfao seria
  // pior que a restricao), entao apagar os POKEs antes falharia com violacao de
  // chave estrangeira.
  const social = await chamar('wipe_mundo_social');
  const r = await chamar('wipe_todos_os_saves');

  console.log('Wipe concluido.');
  console.log(`  jogadores resetados: ${r.jogadores_resetados}`);
  console.log(`  POKEs apagados:      ${r.pokes_apagados}`);
  console.log(`  sessoes fechadas:    ${r.sessoes_fechadas}`);
  console.log('  mundo social:');
  console.log(`    ordens de item:    ${social.ordens}`);
  console.log(`    anuncios de POKE:  ${social.anuncios}`);
  console.log(`    negocios:          ${social.negocios}`);
  console.log(`    entregas pendentes:${social.entregas}`);
  console.log(`    mensagens:         ${social.mensagens}`);
  console.log(`    amizades:          ${social.amizades}`);
  console.log(`    linhas de chat:    ${social.chat}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
