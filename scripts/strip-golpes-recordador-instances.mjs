// Consequencia direta de `removerGolpesDeRecordador` (scripts/lib/pokeapi.js):
// POKE que evoluiu ou foi capturado ANTES deste fix pode ter, gravado em
// `pokemon_instances`, um golpe de Recordador que o catalogo novo nao
// reconhece mais (ex.: Air Slash/Dragon Claw num Charizard). Sem limpar isso,
// o fix nao vale pra quem ja jogava: `golpesUtilizaveis` (activeAbilities.ts)
// so recompoe slot quando ha DIVERGENCIA entre `active_abilities` e
// `unlocked_abilities` — se os dois ainda concordam (os dois com o golpe
// velho), o golpe continua utilizavel em combate normalmente.
//
// Este script GERA o SQL de limpeza (nao aplica sozinho — mesmo padrao de
// seed-species-moves-usum.mjs: imprime pra stdout, revisado, so entao rodado
// via `npx supabase db query --linked -f`). So cobre o schema passado em
// --schema (default dev; recusa 'public' sem --confirmar-public).
//
// Regra, por instancia:
//  - `unlocked_abilities`: mantem so chave que ainda existe no learnset da
//    especie (catalogo fresco) OU e o golpe de area do Nivel 50 (sintetico,
//    nunca fez parte do catalogo, nao afetado por este fix).
//  - `active_abilities`: mantem so chave que sobrou em `unlocked_abilities`
//    apos o filtro acima — nunca ESCOLHE golpe novo pro jogador, so remove o
//    que deixou de ser valido. Igualzinho ao que `golpesUtilizaveis` ja faz
//    em runtime, so que PERSISTIDO em vez de recalculado a cada leitura.
// Linha sem mudanca nenhuma nao entra no UPDATE.
'use strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import { resolverSchema, cabecalhosRest } from './lib/schema-alvo.cjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

// A regra de alvo (--schema= > SUPABASE_SCHEMA > dev, e `public` so com
// --confirmar-public) nasceu aqui e agora vive em lib/schema-alvo.cjs, aplicada
// a todos os scripts. Duas copias da mesma regra e exatamente como os outros
// seis passaram a escrever em `public` sem ninguem notar.
const args = process.argv.slice(2);
const schema = resolverSchema({ argv: args, envSchema: process.env.SUPABASE_SCHEMA });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes em .env');

const ENGINE_BUNDLE = path.join(ROOT, 'authority/engine/headless.js');
if (!existsSync(ENGINE_BUNDLE)) {
  console.error(`${ENGINE_BUNDLE} nao existe. Rode: npm run build:engine`);
  process.exit(1);
}
const { SPECIES, ehGolpeAoeDeNivel50 } = await import(
  pathToFileURL(ENGINE_BUNDLE).href
);

const golpesValidosPorEspecie = new Map(
  Object.values(SPECIES).map((sp) => [sp.id, new Set(sp.abilities.map((a) => a.key))]),
);

function golpeValido(speciesId, chave) {
  if (ehGolpeAoeDeNivel50(chave)) return true;
  const validos = golpesValidosPorEspecie.get(speciesId);
  return validos ? validos.has(chave) : false;
}

// Paginado: PostgREST limita por padrao, e a tabela cobre TODOS os POKEs de
// TODOS os jogadores (time + mochila) — nao so os "7.184 com golpes
// escolhidos" medidos antes, que eram so o subconjunto com active_abilities
// preenchido.
async function buscarTodasInstancias() {
  const linhas = [];
  const PAGINA = 1000;
  for (let offset = 0; ; offset += PAGINA) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pokemon_instances?select=id,species_id,unlocked_abilities,active_abilities`,
      {
        headers: cabecalhosRest(SERVICE_ROLE, schema, {
          Range: `${offset}-${offset + PAGINA - 1}`,
        }),
      },
    );
    if (!res.ok) throw new Error(`GET pokemon_instances (offset ${offset}): ${res.status} ${await res.text()}`);
    const pagina = await res.json();
    linhas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return linhas;
}

function sqlArrayDeTexto(arr) {
  return `ARRAY[${arr.map((s) => `'${s.replace(/'/g, "''")}'`).join(',')}]::text[]`;
}

const todas = await buscarTodasInstancias();
console.error(`-- ${todas.length} instancias lidas de ${schema}.pokemon_instances`);

const mudancas = [];
let semEspecieConhecida = 0;
for (const row of todas) {
  const validos = golpesValidosPorEspecie.get(row.species_id);
  if (!validos) { semEspecieConhecida++; continue; } // especie fora do elenco atual (nao deveria existir; so pula, nao apaga nada)

  const unlockedNovo = (row.unlocked_abilities || []).filter((k) => golpeValido(row.species_id, k));
  const unlockedMudou = unlockedNovo.length !== (row.unlocked_abilities || []).length;

  const activeAtual = row.active_abilities; // pode ser null (nunca escolheu)
  const activeNovo = activeAtual ? activeAtual.filter((k) => unlockedNovo.includes(k)) : activeAtual;
  const activeMudou = activeAtual != null && activeNovo.length !== activeAtual.length;

  if (unlockedMudou || activeMudou) {
    mudancas.push({ id: row.id, unlockedNovo, activeNovo: activeAtual == null ? null : activeNovo });
  }
}

console.error(`-- ${mudancas.length} instancias com golpe de recordador pra remover (${semEspecieConhecida} ignoradas por especie desconhecida)`);

if (!mudancas.length) {
  console.error('-- nada a fazer, sem SQL gerado');
  process.exit(0);
}

console.log('begin;');
// UPDATE em lote via VALUES, mesmo padrao de seed-species-moves-usum.mjs —
// uma linha SQL por instancia mudada, nao uma query por linha.
console.log(`update ${schema}.pokemon_instances as p set`);
console.log('  unlocked_abilities = v.unlocked_abilities,');
console.log('  active_abilities = v.active_abilities');
console.log('from (values');
console.log(
  mudancas
    .map((m) => `  ('${m.id}'::uuid, ${sqlArrayDeTexto(m.unlockedNovo)}, ${m.activeNovo == null ? 'null::text[]' : sqlArrayDeTexto(m.activeNovo)})`)
    .join(',\n'),
);
console.log(') as v(id, unlocked_abilities, active_abilities)');
console.log('where p.id = v.id;');
console.log('commit;');
