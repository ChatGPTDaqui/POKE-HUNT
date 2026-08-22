// Causa raiz do item 1 (nao dava pra escolher os 4 golpes): dev.species e
// dev.moves ainda tem o catalogo Gen2 antigo (confirmado ao vivo: Cleffa/
// Togepi/Snubbull la ainda sao NORMAL, nao FAIRY; dev.moves so tem 251 dos
// 486 golpes reais). `evoluir_poke` e `escolher_starter` derivam
// `unlocked_abilities` de `species_moves`, que tem FK pra `moves`; a RPC
// `definir_golpes_ativos` valida a escolha do jogador contra essa coluna —
// tudo isso apontando pro catalogo errado.
//
// Este script GERA o SQL de resync (nao aplica sozinho — imprime pra stdout,
// redirecionado pra um arquivo, revisado, e so entao rodado via
// `npx supabase db query --linked -f`). So cobre o schema passado em
// --schema (default dev; recusa 'public' sem --confirmar-public, mesmo
// padrao de guarda ja usado em scripts destrutivos do projeto).
//
// Escopo deliberadamente estreito: so as colunas que as RPCs de evolucao/
// starter/golpes-ativos realmente leem (tipo, stats base, catchRate,
// baseExp, evolvesTo/At/isSpecialEvolution, e o learnset). growth_curve e
// height_m ficam de fora — growth_curve tem CHECK CONSTRAINT com os nomes
// ANTIGOS de curva (nao inclui ERRATIC/FLUCTUATING do Ultra Sun) e nenhuma
// RPC le esses dois campos hoje; mexer neles e escopo maior sem necessidade
// pra destravar o bug relatado.
'use strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const schemaArg = args.find((a) => a.startsWith('--schema='));
const schema = schemaArg ? schemaArg.split('=')[1] : 'dev';
if (schema === 'public' && !args.includes('--confirmar-public')) {
  console.error('Recusado: schema public exige --confirmar-public explicito (mexe em jogador real).');
  process.exit(1);
}

// SPECIES vem do bundle do motor ja existente (authority/engine/headless.js,
// gerado por `npm run build:engine`, commitado). ABILITIES/BASIC_ATTACK NAO
// sao exportados por ele — precisam de um bundle proprio, pequeno, porque
// `data/abilities.ts` usa o alias `@/` que so o Vite resolve. Construido aqui
// mesmo, num diretorio temporario, toda vez que o script roda: nada de
// caminho de sessao hardcoded que quebraria na proxima pessoa que rodar isto.
function buildAbilitiesBundle() {
  // DENTRO do projeto (nao no temp do SO): o `vite build --config` resolve
  // `import 'vite'` relativo a pasta do arquivo de config, entao precisa
  // enxergar este `node_modules`. `.seed-tmp-` prefixado e gitignorado
  // (ver .gitignore) e apagado no fim mesmo assim.
  const tmpDir = mkdtempSync(path.join(ROOT, '.seed-tmp-'));
  const entryPath = path.join(tmpDir, 'entry.ts');
  const configPath = path.join(tmpDir, 'vite.config.ts');
  const outDir = path.join(tmpDir, 'out');
  writeFileSync(entryPath, `export { ABILITIES, BASIC_ATTACK } from '@/data/abilities'\n`);
  writeFileSync(configPath, `
import { defineConfig } from 'vite';
import path from 'node:path';
export default defineConfig({
  publicDir: false,
  ssr: { noExternal: true },
  resolve: { alias: { '@': ${JSON.stringify(path.join(ROOT, 'src'))} } },
  build: {
    ssr: ${JSON.stringify(entryPath)},
    outDir: ${JSON.stringify(outDir)},
    emptyOutDir: true,
    target: 'es2023',
  },
});
`);
  // stdout deste script E o SQL gerado (redirecionado pra arquivo por quem
  // chama) — o log de build do Vite tem que ir so pro stderr, senao
  // contamina o SQL com "building ssr environment..." no meio.
  //
  // Nem `execFileSync` puro (sem shell) nem com `shell:true` + array de args
  // funcionam aqui: o primeiro nao sabe achar `npx.cmd` no Windows (EINVAL,
  // spawnSync exige shell pra .cmd/.bat), o segundo reparte o caminho do
  // projeto ("NOVO POKE IDLE" tem espaco) em argumentos separados porque
  // `shell:true` + array NAO re-escapa cada item. `execSync` com uma STRING
  // ja montada, cada pedaco entre aspas por mim, funciona nos dois SOs.
  execSync(`npx vite build --config "${configPath}"`, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  const bundlePath = path.join(outDir, 'entry.js');
  return { bundlePath, cleanup: () => rmSync(tmpDir, { recursive: true, force: true }) };
}

const { bundlePath: SEED_BUNDLE, cleanup: cleanupAbilitiesBundle } = buildAbilitiesBundle();

const ENGINE_BUNDLE = path.join(ROOT, 'authority/engine/headless.js');
if (!existsSync(ENGINE_BUNDLE)) {
  console.error(`${ENGINE_BUNDLE} nao existe. Rode: npm run build:engine`);
  process.exit(1);
}
const { SPECIES } = await import(pathToFileURL(ENGINE_BUNDLE).href);
const { ABILITIES, BASIC_ATTACK } = await import(pathToFileURL(SEED_BUNDLE).href);

const DEX_RE = /Nº\s*(\d+)/;
function sqlStr(v) {
  if (v == null) return 'null';
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sqlNum(v) {
  return v == null ? 'null' : String(v);
}
function sqlBool(v) {
  return v ? 'true' : 'false';
}

// --- species: UPDATE em lote, so as colunas no escopo (ver cabecalho) ---
const speciesRows = Object.values(SPECIES).map((sp) => {
  const dexMatch = sp.description.match(DEX_RE);
  if (!dexMatch) throw new Error(`especie sem numero de Pokedex na descricao: ${sp.id}`);
  return `(${sqlStr(sp.id)}, ${sqlNum(dexMatch[1])}, ${sqlStr(sp.name)}, ${sqlStr(sp.type)}, ${sqlStr(sp.type2)}, ` +
    `${sqlNum(sp.base.hp)}, ${sqlNum(sp.base.atkFis)}, ${sqlNum(sp.base.atkEsp)}, ${sqlNum(sp.base.def)}, ${sqlNum(sp.base.defEsp)}, ${sqlNum(sp.base.speed)}, ` +
    `${sqlNum(sp.catchRate)}, ${sqlNum(sp.baseExp)}, ${sqlStr(sp.evolvesTo)}, ${sqlNum(sp.evolvesAtLevel)}, ${sqlBool(!!sp.isSpecialEvolution)})`;
});

const speciesSql = `
update ${schema}.species as s set
  dex_number = v.dex_number,
  name = v.name,
  type1 = v.type1::${schema}.element_type,
  type2 = v.type2::${schema}.element_type,
  base_hp = v.base_hp, base_atk_fis = v.base_atk_fis, base_atk_esp = v.base_atk_esp,
  base_def = v.base_def, base_def_esp = v.base_def_esp, base_speed = v.base_speed,
  catch_rate = v.catch_rate, base_exp = v.base_exp,
  evolves_to = v.evolves_to, evolves_at_level = v.evolves_at_level,
  is_special_evolution = v.is_special_evolution
from (values
${speciesRows.join(',\n')}
) as v(id, dex_number, name, type1, type2, base_hp, base_atk_fis, base_atk_esp, base_def, base_def_esp, base_speed, catch_rate, base_exp, evolves_to, evolves_at_level, is_special_evolution)
where s.id = v.id;`;

// --- moves: UPSERT, cobre os 486 golpes reais + Ataque Basico ---
// `category`/`target` sao enum no banco sem 'status'/'dynamic' — cosmetic
// only aqui (nenhuma RPC le esta coluna pra calculo, so a FK de
// species_moves.move_id existe), entao os dois caem em 'physical'/'single'
// como valor de preenchimento, documentado, nao escondido.
const allMoves = { ...ABILITIES, basic_attack: BASIC_ATTACK };
const moveRows = Object.values(allMoves).map((a) => {
  const categoriaDb = a.category === 'special' ? 'special' : 'physical';
  const targetDb = a.target === 'aoe' ? 'aoe' : 'single';
  return `(${sqlStr(a.id)}, ${sqlStr(a.name)}, ${sqlStr(a.type)}, ${sqlStr(categoriaDb)}, ${sqlNum(a.power)}, ${sqlNum(a.accuracy)}, ${sqlNum(a.pp)}, ${sqlStr(targetDb)}, ${sqlNum(a.radius ?? null)})`;
});

const movesSql = `
insert into ${schema}.moves (id, name, type, category, power, accuracy, pp, target, aoe_radius) values
${moveRows.join(',\n')}
on conflict (id) do update set
  name = excluded.name, type = excluded.type, category = excluded.category,
  power = excluded.power, accuracy = excluded.accuracy, pp = excluded.pp,
  target = excluded.target, aoe_radius = excluded.aoe_radius;`;

// --- species_moves: DELETE+INSERT (chave real e species_id+sort_order,
// posicao na lista = identidade da linha, mesma regra do pipeline antigo).
// O golpe sintetico de area do Nivel 50 (prefixo aoe50_) NAO entra: ele e
// injetado em tempo de execucao por pokes.ts, nunca fez parte do catalogo
// real nem da tabela species_moves historicamente.
const smRows = [];
for (const sp of Object.values(SPECIES)) {
  sp.abilities
    .filter((entry) => !entry.key.startsWith('aoe50_'))
    .forEach((entry, i) => {
      smRows.push(`(${sqlStr(sp.id)}, ${sqlStr(entry.key)}, ${sqlNum(entry.levelReq)}, ${i})`);
    });
}
const speciesMovesSql = `
delete from ${schema}.species_moves where species_id in (${Object.keys(SPECIES).map(sqlStr).join(', ')});
insert into ${schema}.species_moves (species_id, move_id, level_req, sort_order) values
${smRows.join(',\n')};`;

console.log('begin;');
console.log(movesSql); // moves primeiro: species_moves tem FK pra ela
console.log(speciesSql);
console.log(speciesMovesSql);
console.log('commit;');
console.error(`-- gerado: ${Object.keys(SPECIES).length} especies, ${moveRows.length} golpes, ${smRows.length} linhas de learnset, schema=${schema}`);
cleanupAbilitiesBundle();
