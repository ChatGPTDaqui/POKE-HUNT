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
import path from 'node:path';
import { config } from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const args = process.argv.slice(2);
const schemaArg = args.find((a) => a.startsWith('--schema='));
const schema = schemaArg ? schemaArg.split('=')[1] : 'dev';
if (schema === 'public' && !args.includes('--confirmar-public')) {
  console.error('Recusado: schema public exige --confirmar-public explicito (mexe em dado de jogador real).');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes em .env');

const { SPECIES, ehGolpeAoeDeNivel50 } = await import(
  pathToFileURL(path.join(ROOT, 'authority/engine/headless.js')).href
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
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          'Accept-Profile': schema,
          Range: `${offset}-${offset + PAGINA - 1}`,
        },
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

// PH-57: NAO `process.exit(0)` aqui (nem em lugar nenhum deste script) —
// medido ao vivo, 100% reproduzivel: process.exit(0) logo apos o loop de
// fetches paginados de buscarTodasInstancias() (undici, varias chamadas
// sequenciais) crasha com "Assertion failed:
// !(handle->flags & UV_HANDLE_CLOSING), file ...\deps\uv\src\win\async.c"
// no Windows — o handle do fetch ainda fecha quando o exit forcado interrompe
// o processo, e o assert do libuv dispara antes do OS matar o processo, que
// sai com codigo 127 em vez de 0 mesmo tendo rodado tudo certo. 5/5 rodadas
// isoladas (so o loop de fetch + exit) reproduziram; 5/5 sem o exit saíram
// limpo, codigo 0. Deixar o event loop esvaziar sozinho evita o handle ainda
// em transicao no momento do exit.
if (!mudancas.length) {
  console.error('-- nada a fazer, sem SQL gerado');
} else {
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
}
