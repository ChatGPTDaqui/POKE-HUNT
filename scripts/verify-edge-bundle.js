// Falha se supabase/functions/jogo/servidor.js estiver desatualizado em
// relacao a server/src — reconstroi o bundle e compara contra o que esta
// commitado. Sem isso, alguem podia editar server/src, esquecer de rodar
// `npm run build:edge`, e um `supabase functions deploy jogo` direto
// publicaria codigo velho sem erro visivel (PH-6).
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BUNDLE = 'supabase/functions/jogo/servidor.js';

execSync('npm run build:edge', { cwd: ROOT, stdio: 'inherit' });

const diff = execSync(`git diff --name-only -- ${BUNDLE}`, { cwd: ROOT }).toString().trim();

if (diff) {
  console.error(
    `\nFAIL — ${BUNDLE} estava desatualizado em relacao a server/src.\n` +
      'O bundle foi regenerado agora (rodei npm run build:edge). Revise o diff e ' +
      'commite junto com a mudanca em server/src:\n\n' +
      `  git diff -- ${BUNDLE}\n`,
  );
  process.exit(1);
}

console.log(`PASS — ${BUNDLE} esta em sincronia com server/src.`);
