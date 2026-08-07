// Prova que trocar a fonte do catalogo (planilha -> Postgres) nao mudou o jogo.
//
//   node scripts/verify-catalog-diff.js
//
// Roda os dois geradores em sequencia e compara os 7 arquivos byte-a-byte.
// "Equivalente" nao serve: a ordem das chaves, o espacamento e o arredondamento
// tambem sao comportamento do jogo. Se um byte diverge, a saida aponta a
// primeira linha diferente — e o exit code e 1, pra isto poder virar gate de CI.
//
// Ordem importa: a planilha roda PRIMEIRO e o Postgres por ULTIMO, entao o que
// fica no disco no fim e a saida do novo gerador (que e a que vai ser commitada).
//
// Nem tudo no catalogo vem da planilha: o peso de spawn vem do tier derivado dos
// disassemblies pret/* (`scripts/spawn-tiers.json`, ver a migration
// `spawn_tier_por_especie`). Os dois lados leem esse tier de lugares diferentes —
// o gerador da planilha le o JSON, o do Postgres le a tabela `spawn_tiers` — e o
// banco foi semeado a partir do mesmo JSON. Entao esta comparacao tambem prova
// que o seed do banco continua batendo com o arquivo versionado: se alguem editar
// um tier so de um lado, o diff acusa.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

const BASES = ['formulas', 'typeChart', 'items', 'pokes', 'abilities', 'maps', 'enemies'];

// Os dois geradores emitem `.ts` pro app React e `.js` pro jogo vanilla
// enquanto os dois existirem (o `.js` se desliga sozinho quando `js/data/`
// sumir, no corte). Verificar so o `.ts` deixaria o fallback sem cobertura.
const ARQUIVOS = [
  ...BASES.map((b) => path.join('src', 'data', 'generated', `${b}.generated.ts`)),
  ...(fs.existsSync(path.join(ROOT, 'js', 'data'))
    ? BASES.map((b) => path.join('js', 'data', `${b}.generated.js`))
    : []),
];

function rodar(script) {
  console.log(`\n=== ${script} ===`);
  const res = spawnSync(process.execPath, [path.join(__dirname, script)], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    console.error(res.stdout || '');
    console.error(res.stderr || '');
    console.error(`\n${script} falhou (exit ${res.status}).`);
    process.exit(1);
  }
  // A saida completa dos dois e longa (cobertura por tipo, listas de hunt) e
  // nao e o que esta sendo verificado — so as ultimas linhas confirmam que
  // rodou ate o fim.
  const linhas = (res.stdout || '').trim().split('\n');
  console.log(linhas.slice(-3).join('\n'));
}

function snapshot() {
  const out = {};
  for (const nome of ARQUIVOS) {
    const p = path.join(ROOT, nome);
    if (!fs.existsSync(p)) {
      console.error(`arquivo esperado nao foi gerado: ${path.relative(ROOT, p)}`);
      process.exit(1);
    }
    out[nome] = fs.readFileSync(p);
  }
  return out;
}

// Primeira divergencia em forma legivel. Comparar buffer inteiro so diria
// "diferente"; o que ajuda a depurar e QUAL linha e o que mudou nela.
function primeiraDiferenca(a, b) {
  const la = a.toString('utf8').split('\n');
  const lb = b.toString('utf8').split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) {
      return {
        linha: i + 1,
        planilha: la[i] === undefined ? '(fim do arquivo)' : la[i],
        postgres: lb[i] === undefined ? '(fim do arquivo)' : lb[i],
        totalPlanilha: la.length,
        totalPostgres: lb.length,
      };
    }
  }
  return null;
}

rodar('sync-planilha.js');
const daPlanilha = snapshot();

rodar('generate-catalog.js');
const doPostgres = snapshot();

console.log('\n=== diff byte-a-byte ===');
let falhas = 0;
for (const nome of ARQUIVOS) {
  const a = daPlanilha[nome];
  const b = doPostgres[nome];
  if (a.equals(b)) {
    console.log(`  OK       ${nome} (${a.length} bytes)`);
    continue;
  }
  falhas++;
  const d = primeiraDiferenca(a, b);
  console.log(`  DIVERGE  ${nome} — planilha ${a.length} bytes, postgres ${b.length} bytes`);
  if (d) {
    console.log(`             linha ${d.linha} (${d.totalPlanilha} vs ${d.totalPostgres} linhas)`);
    console.log(`             planilha: ${d.planilha}`);
    console.log(`             postgres: ${d.postgres}`);
  }
}

if (falhas > 0) {
  console.log(`\n${falhas} de ${ARQUIVOS.length} arquivo(s) divergem. A planilha ainda NAO pode ser aposentada.`);
  process.exit(1);
}
console.log(`\nOs ${ARQUIVOS.length} arquivos sao identicos. Postgres reproduz a planilha (+ spawn-tiers.json) exatamente.`);
