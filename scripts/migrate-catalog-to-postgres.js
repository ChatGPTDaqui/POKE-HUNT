// Popula as 8 tabelas de catalogo do Supabase a partir da planilha mestra.
//
// POR QUE ISTO EXISTE: as tabelas de progresso do jogador (pokemon_instances,
// player_items, player_pokedex, player_auto_catch_rules) tem FK pro catalogo.
// Com o catalogo vazio, qualquer insert de progresso morre com
// `23503: Key (species_id)=(charmander) is not present in table "species"`.
// Ou seja, o save na nuvem so funciona depois que isto rodar.
//
// ESCOPO: so popular. NAO substitui sync-planilha.js, nao aposenta o .xlsx,
// nao toca no jogo — isso e fase posterior (SPEC secao 6.5).
//
// O pipeline de leitura/curadoria e REUSADO de sync-planilha.js (require com
// SYNC_SKIP_WRITE=1, que desliga so a escrita dos *.generated.*). Duplicar a
// curadoria de hunts aqui seria garantia de divergencia futura.
//
// Idempotente: tudo via upsert (`Prefer: resolution=merge-duplicates`).
//
// Rodar com: node scripts/migrate-catalog-to-postgres.js
'use strict';

process.env.SYNC_SKIP_WRITE = '1';

const fs = require('fs');
const path = require('path');
const sync = require('./sync-planilha.js');
const { bloqueiaCatalogoAntigo } = require('./lib/guarda-catalogo-gen2.js');
const { resolverSchema, cabecalhosRest } = require('./lib/schema-alvo.cjs');

bloqueiaCatalogoAntigo(
  'npm run catalog:migrar',
  'Isto escreveria no Supabase o catalogo de Gen2 da planilha. A migracao para\n' +
  'Pokemon Ultra Sun nao passa pelo banco (decisao explicita do usuario): a fonte\n' +
  'de build agora e scripts/usum/catalog.json, versionado no repo.\n' +
  'O catalogo do banco (species/moves/species_moves) segue sendo o de Gen2 e so\n' +
  'existe como alvo de FK. As linhas que o progresso do jogador realmente aponta\n' +
  '— `items` — sao mantidas por migration (ver 20260814120100).'
);

const ROOT = path.join(__dirname, '..');

// species.spawn_tier (migration `spawn_tier_por_especie`) e NOT NULL e so
// aceita as chaves de `spawn_tiers` (fk); map_encounters.weight e o peso
// numerico do tier (30/20/10/5/1). O mesmo spawn-tiers.json que a migration
// usou pra gerar seus UPDATEs hardcoded e a fonte pros dois — throw se
// faltar, mesmo padrao de `especie sem spawn tier` do sync-planilha.js.
function loadSpawnTierData() {
  const arquivo = path.join(__dirname, 'spawn-tiers.json');
  const { tiers, especies } = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const pesoPorTier = Object.fromEntries(tiers.map((t) => [t.chave, t.peso]));
  const tierBySpecies = {};
  const weightBySpecies = {};
  for (const [id, info] of Object.entries(especies)) {
    const peso = pesoPorTier[info.tier];
    if (peso == null) throw new Error(`tier desconhecido em spawn-tiers.json: ${info.tier} (${id})`);
    tierBySpecies[id] = info.tier;
    weightBySpecies[id] = peso;
  }
  return { tierBySpecies, weightBySpecies };
}

// ---------------------------------------------------------------------------
// Credenciais (.env da raiz, gitignored). Nunca logar o valor da service_role.
// ---------------------------------------------------------------------------
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

const ENV = loadEnv();
const SCHEMA = resolverSchema({ envSchema: ENV.SUPABASE_SCHEMA });
console.log(`Banco: ${ENV.SUPABASE_URL}`);
console.log(`Schema: ${SCHEMA}`);

async function rest(pathname, init = {}) {
  const res = await fetch(`${ENV.SUPABASE_URL}/rest/v1/${pathname}`, {
    ...init,
    headers: cabecalhosRest(ENV.SUPABASE_SERVICE_ROLE_KEY, SCHEMA, init.headers),
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

// PostgREST tem limite pratico de payload; lotes evitam 413 e dao progresso
// visivel num dataset de ~1.6k linhas.
const CHUNK = 200;

async function upsert(table, rows, onConflict) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const qs = onConflict ? `?on_conflict=${onConflict}` : '';
    const res = await rest(`${table}${qs}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(slice),
    });
    if (res.status >= 400) {
      console.error(`\nFALHA em ${table} (lote ${i}-${i + slice.length}): ${res.status}`);
      console.error(JSON.stringify(res.body).slice(0, 600));
      console.error('primeira linha do lote:', JSON.stringify(slice[0]).slice(0, 400));
      process.exit(1);
    }
  }
  console.log(`  ${table}: ${rows.length} linhas`);
}

// A contagem vem no header Content-Range (`0-0/1865`), NAO no corpo — ler
// `body.length` devolveria 1 pra qualquer tabela nao-vazia (erro que este
// script ja cometeu).
async function count(table) {
  const res = await fetch(`${ENV.SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: cabecalhosRest(ENV.SUPABASE_SERVICE_ROLE_KEY, SCHEMA, {
      Prefer: 'count=exact',
      Range: '0-0',
    }),
  });
  const range = res.headers.get('content-range') || '';
  const total = range.split('/')[1];
  return total ? Number(total) : -1;
}

// ---------------------------------------------------------------------------
// Dados hand-authored que NAO vem da planilha. Estes arquivos sao TypeScript
// com ES modules, entao nao da pra `require` deles daqui (CommonJS) — sao
// extraidos por regex. Sao arquivos de dado simples e estaveis; se algum
// mudar de forma, o parse falha alto (contagem zero) em vez de silenciar.
// ---------------------------------------------------------------------------
const WEB_DATA = path.join(ROOT, 'src', 'data');
const readWebData = (f) => fs.readFileSync(path.join(WEB_DATA, f), 'utf8');

function parseLegendaries() {
  const src = readWebData('legendaries.ts');
  const block = src.slice(src.indexOf('LEGENDARY_SPECIES_IDS'));
  // Ancorar em `= [` e nao no primeiro `[`: a anotacao de tipo `string[]`
  // vem antes e casaria primeiro, devolvendo uma fatia vazia.
  const open = block.indexOf('= [') + 2;
  const arr = block.slice(open, block.indexOf(']', open));
  const ids = [...arr.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
  if (ids.length === 0) throw new Error('legendaries.ts: nenhum id extraido');
  return new Set(ids);
}

function parseSpecialEvolutions() {
  const src = readWebData('pokes.ts');
  const start = src.indexOf('const SPECIAL_EVOLUTIONS');
  const block = src.slice(src.indexOf('{', start), src.indexOf('}', start));
  const map = {};
  for (const m of block.matchAll(/(\w+):\s*'([a-z0-9_]+)'/g)) map[m[1]] = m[2];
  if (Object.keys(map).length === 0) throw new Error('pokes.ts: SPECIAL_EVOLUTIONS vazio');
  return map;
}

function parseHeights() {
  const src = readWebData('pokeHeights.ts');
  const start = src.indexOf('HEIGHT_M');
  const block = src.slice(start, src.indexOf('\n}', start));
  const map = {};
  for (const m of block.matchAll(/([a-z0-9_]+):\s*([\d.]+)/g)) map[m[1]] = Number(m[2]);
  if (Object.keys(map).length === 0) throw new Error('pokeHeights.ts: HEIGHT_M vazio');
  return map;
}

function parseTypeOrder() {
  const src = readWebData('typeColors.ts');
  const types = [...src.matchAll(/^ {2}([A-Z_]+):/gm)].map((m) => m[1]);
  if (types.length !== 17) throw new Error(`typeColors.ts: esperava 17 tipos, achei ${types.length}`);
  return types;
}

// AOE nao vem da planilha — e AOE_ABILITY_KEYS + AOE_RADIUS em
// web/src/data/abilities.ts. So os golpes REAIS da planilha entram aqui; os
// aoe50_* de typedAoeMoves.ts sao camada de runtime (ver nota no relatorio).
const AOE_SPREADSHEET_MOVES = new Set([
  'razor_leaf', 'bubble', 'earthquake', 'explosion', 'magnitude', 'selfdestruct',
]);
const AOE_RADIUS = 240;

// ---------------------------------------------------------------------------
// Construcao das linhas
// ---------------------------------------------------------------------------
function buildSpeciesRows(workbook, legendaries, specialEvos, heights, tierBySpecies) {
  const rows = [];
  for (const r of workbook['Espécies'] || []) {
    const id = String(r['Chave']).toLowerCase();
    const sheetEvolvesTo = r['Evolui Para (chave)'] ? String(r['Evolui Para (chave)']).toLowerCase() : null;
    const spawnTier = tierBySpecies[id];
    if (!spawnTier) throw new Error(`especie sem spawn tier: ${id}`);

    // Patch de evolucao especial (pokes.ts): as 9 especies que no Gen1/2
    // evoluiam por TROCA saem da planilha sem evolucao nenhuma. O jogo aplica
    // Nivel 80 + Stones em runtime, e so quando a planilha nao tem evolucao —
    // mesma guarda replicada aqui pra o banco descrever o estado final real.
    const special = !sheetEvolvesTo && specialEvos[id] ? specialEvos[id] : null;
    const evolvesTo = sheetEvolvesTo || special;
    const evolvesAtLevel = sheetEvolvesTo ? r['Evolui no Nível'] : (special ? 80 : null);

    rows.push({
      id,
      dex_number: r['Nº Pokédex'],
      name: r['Nome'],
      type1: r['Tipo 1'],
      type2: r['Tipo 2'] || null,
      base_hp: r['HP'],
      base_atk_fis: r['Ataque'],
      base_atk_esp: r['Ataque Especial'],
      base_def: r['Defesa'],
      base_def_esp: r['Defesa Especial'],
      base_speed: r['Velocidade'],
      base_exp: r['EXP Base'],
      catch_rate: r['Taxa de Captura (0-255)'],
      growth_curve: r['Curva de Crescimento'],
      spawn_tier: spawnTier,
      height_m: heights[id] ?? null,
      is_legendary: legendaries.has(id),
      is_special_evolution: Boolean(special),
      // evolves_to sai do 1o passe: e FK auto-referente, o alvo precisa existir.
      _evolves_to: evolvesTo,
      _evolves_at_level: evolvesAtLevel,
    });
  }
  return rows;
}

function buildMoveRows(workbook) {
  return (workbook['Golpes'] || []).map((r) => {
    const id = String(r['Chave']).toLowerCase();
    const isAoe = AOE_SPREADSHEET_MOVES.has(id);
    return {
      id,
      name: r['Nome'],
      type: r['Tipo'],
      // Planilha em portugues ('físico'/'especial') contra o enum do banco.
      category: r['Categoria (informativo)'] === 'especial' ? 'special' : 'physical',
      power: r['Poder'],
      accuracy: r['Precisão'],
      pp: r['PP'],
      target: isAoe ? 'aoe' : 'single',
      aoe_radius: isAoe ? AOE_RADIUS : null,
      always_hits: r['Sempre Acerta'] === 'sim',
      // O schema foi ajustado pra forma real do dado (migration
      // `moves_multihit_e_dano_fixo`): a planilha guarda MODO, nao numero.
      // `multi_hit_min/max` e `fixed_damage int` foram removidos justamente
      // porque preenche-los exigiria inventar o range do Gen2.
      multi_hit: r['Multi-hit'] === 'sim',
      fixed_damage_mode: r['Dano Fixo'] || null,
      recoil_fraction: r['Recoil (fração)'] ?? null,
      priority: r['Prioridade'] ?? 0,
    };
  });
}

// `sort_order` guarda a ordem das linhas na aba de origem. Ela e dado real:
// os *.generated.ts emitem as chaves nessa ordem, e nenhum criterio derivavel
// a reproduz (ver a migration `ordem_de_origem_do_catalogo`).
function buildItemRows(workbook, typeOrder) {
  const rows = [];
  const KIND_DESC = {
    ball: 'Item de captura.',
    potion: 'Restaura HP.',
    revive: 'Reanima um POKE desmaiado.',
    rod: 'Vara de pesca (mecanica ainda nao implementada).',
  };

  let ordem = 0;
  for (const r of workbook['Itens'] || []) {
    const kind = r['Tipo (kind)'];
    const heal = r['Cura de HP'];
    // 'infinito' (Max Potion) vira flag, nao sentinel: AutoSystem ordena
    // pocoes por healAmount e um -1/999999 escolheria a pocao errada.
    const healsFull = typeof heal === 'string' && heal.toLowerCase().includes('infinito');
    rows.push({
      id: String(r['Chave']).toLowerCase(),
      name: r['Nome'],
      kind,
      description: KIND_DESC[kind] || null,
      buy_price: r['Preço de Compra'] ?? null,
      capture_rate: kind === 'ball' ? r['Multiplicador de Captura'] : null,
      heal_amount: kind === 'potion' && !healsFull ? heal : null,
      heals_full: healsFull,
      revive_hp_percent: kind === 'revive' ? r['Cura % (revive)'] : null,
      stone_type: null,
      sort_order: ordem++,
    });
  }

  // As 17 Stones sao hand-authored (web/src/data/stones.ts) e precisam estar
  // no catalogo: o drop universal por kill (EconomySystem#awardKillLoot) grava
  // stone_<tipo> em player_items, que tem FK pra items.
  for (const type of typeOrder) {
    rows.push({
      id: `stone_${type.toLowerCase()}`,
      name: `Pedra ${type}`,
      kind: 'stone',
      description: `Usada para evoluir POKEs de tipo primario ${type} ao atingir o Nivel 80.`,
      buy_price: null,
      capture_rate: null,
      heal_amount: null,
      heals_full: false,
      revive_hp_percent: null,
      stone_type: type,
      sort_order: ordem++,
    });
  }
  return rows;
}

function buildTypeChartRows(chart) {
  const rows = [];
  for (const [atk, defs] of Object.entries(chart)) {
    for (const [def, mult] of Object.entries(defs)) {
      rows.push({ attacking_type: atk, defending_type: def, multiplier: mult });
    }
  }
  return rows;
}

function buildFormulaRows(workbook) {
  return (workbook['Fórmulas'] || [])
    .filter((r) => r['Chave'])
    .map((r, i) => {
      const varsRaw = r['Variáveis disponíveis'] || '';
      return {
        key: r['Chave'],
        expression: String(r['Expressão']),
        variables: varsRaw.includes('nenhuma')
          ? []
          : varsRaw.split(',').map((s) => s.trim()).filter(Boolean),
        description: r['Descrição'] || null,
        sort_order: i,
      };
    });
}

// Construido a partir de `hunts` (antes de syncMapsAndEncounters achatar),
// nao de mapsData: `hunt.bgTheme` e a constante do TYPE ('GRASS','BUG'...),
// que e o que o gerador precisa pra re-derivar cor E imagem. `mapsData[].bg`
// ja e o objeto DERIVADO — e a derivacao e lossy, varios tipos compartilham a
// mesma arte (GRASS/BUG/NORMAL -> forest.png), entao gravar o caminho da
// imagem tornaria impossivel saber que hunt e de que tipo.
function buildMapRows(hunts, mapsData) {
  return hunts
    .map((h) => ({ hunt: h, map: mapsData[h.key.toLowerCase()] }))
    .filter(({ map }) => map && (map.continent === 'johto' || map.continent === 'kanto'))
    .map(({ hunt, map }, i) => ({
      id: map.id,
      name: map.name,
      continent: map.continent,
      min_level: map.levelRange[0],
      max_level: map.levelRange[1],
      bg_theme: hunt.bgTheme,
      bounds_width: map.bounds.width,
      bounds_height: map.bounds.height,
      unlock_cost: map.unlockCost ?? null,
      // Ordem em que o pipeline cria as hunts — ver a migration
      // `ordem_de_origem_de_mapas_e_encontros`.
      sort_order: i,
    }));
}

// Tambem a partir de `hunts`: cada hunt ja carrega speciesLevels, entao o par
// (mapa, especie) e direto. Reconstruir isso quebrando o id do encontro
// (`${mapId}_${speciesId}`) por prefixo seria ambiguo — varios ids de especie
// tem underscore (nidoran_f, ho_oh, farfetch_d).
function buildMapEncounterRows(hunts, mapsData, encountersData) {
  const validMaps = new Set(buildMapRows(hunts, mapsData).map((m) => m.id));
  const rows = [];
  const seen = new Set();
  for (const hunt of hunts) {
    const mapId = hunt.key.toLowerCase();
    if (!validMaps.has(mapId)) continue;
    // `sort_order` reinicia por mapa: e a posicao dentro do enemyPool daquela
    // hunt, nao um indice global.
    let ordem = 0;
    for (const speciesSheetKey of Object.keys(hunt.speciesLevels)) {
      const speciesId = speciesSheetKey.toLowerCase();
      const pk = `${mapId}|${speciesId}`;
      if (seen.has(pk)) continue;
      seen.add(pk);
      const enc = encountersData[`${mapId}_${speciesId}`];
      if (!enc) continue;
      rows.push({
        map_id: mapId,
        species_id: speciesId,
        min_level: enc.minLevel,
        max_level: enc.maxLevel,
        weight: enc.weight,
        sort_order: ordem++,
      });
    }
  }
  return rows;
}

// `sort_order` = posicao no array `abilities` da especie, que ja vem ordenado
// por levelReq com os empates preservando a ordem da planilha (o sort do JS e
// estavel). Guardar o indice final, em vez do numero da linha na aba, torna a
// releitura trivial: ordenar so por sort_order reproduz o array exato.
function buildSpeciesMoveRows(speciesData, moveIds) {
  // Nenhuma deduplicacao: a chave e (especie, posicao), entao o array vai
  // inteiro, inclusive o mesmo golpe em dois niveis e a unica linha repetida
  // da planilha (SEAKING|TAIL_WHIP|1). Ver as duas migrations
  // `species_moves_*` — deduplicar aqui apagava 163 linhas reais.
  const rows = [];
  for (const sp of Object.values(speciesData)) {
    let ordem = 0;
    for (const ab of sp.abilities) {
      // aoe50_* sao camada de runtime (typedAoeMoves.ts), nao existem em
      // `moves` — mas tambem nao aparecem aqui, porque speciesData vem da aba
      // Movesets. O guard existe pra falhar visivelmente se isso mudar.
      if (!moveIds.has(ab.key)) continue;
      rows.push({ species_id: sp.id, move_id: ab.key, level_req: ab.levelReq, sort_order: ordem++ });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('Lendo planilha e rodando o pipeline de sync (sem regravar arquivos)...\n');
  const workbook = sync.readWorkbook(sync.XLSX_PATH);

  const formulas = sync.syncFormulas(workbook);
  const chart = sync.syncTypeChart(workbook);
  sync.syncItemsFull(workbook);
  const rawHunts = sync.pickTopHunts(workbook, sync.HUNT_COUNT);
  const { starter, brackets } = sync.computeJohtoBrackets(rawHunts);
  const roster = sync.buildTypeRoster(workbook);
  const typeHunts = sync.buildTypeDrivenHunts([...brackets, ...sync.KANTO_BRACKETS], roster);
  const hunts = [starter, ...typeHunts];
  const { tierBySpecies, weightBySpecies } = loadSpawnTierData();
  const { speciesData } = sync.syncSpeciesAndMoves(workbook, hunts);
  const { mapsData, encountersData } = sync.syncMapsAndEncounters(hunts, weightBySpecies);

  const legendaries = parseLegendaries();
  const specialEvos = parseSpecialEvolutions();
  const heights = parseHeights();
  const typeOrder = parseTypeOrder();
  console.log(`\nHand-authored: ${legendaries.size} lendarios, ${Object.keys(specialEvos).length} evolucoes especiais, ${Object.keys(heights).length} alturas, ${typeOrder.length} tipos`);

  const speciesRows = buildSpeciesRows(workbook, legendaries, specialEvos, heights, tierBySpecies);
  const moveRows = buildMoveRows(workbook);
  const moveIds = new Set(moveRows.map((m) => m.id));
  const itemRows = buildItemRows(workbook, typeOrder);
  const chartRows = buildTypeChartRows(chart);
  const formulaRows = buildFormulaRows(workbook);
  const mapRows = buildMapRows(hunts, mapsData);
  const encounterRows = buildMapEncounterRows(hunts, mapsData, encountersData);
  const speciesMoveRows = buildSpeciesMoveRows(speciesData, moveIds);

  console.log('\nEnviando ao Postgres:');

  // Passe 1: species SEM evolves_to. E FK auto-referente (species.evolves_to
  // -> species.id), entao inserir tudo de uma vez quebraria sempre que o alvo
  // ainda nao existisse.
  await upsert('species', speciesRows.map(({ _evolves_to, _evolves_at_level, ...s }) => s), 'id');
  await upsert('moves', moveRows, 'id');
  await upsert('items', itemRows, 'id');
  await upsert('type_chart', chartRows, 'attacking_type,defending_type');
  await upsert('formulas', formulaRows, 'key');
  await upsert('maps', mapRows, 'id');
  await upsert('species_moves', speciesMoveRows, 'species_id,sort_order');
  await upsert('map_encounters', encounterRows, 'map_id,species_id');

  // Passe 2: agora que todas as especies existem, liga as evolucoes.
  const evoRows = speciesRows
    .filter((s) => s._evolves_to)
    .map((s) => ({ id: s.id, evolves_to: s._evolves_to, evolves_at_level: s._evolves_at_level }));
  for (const row of evoRows) {
    const res = await rest(`species?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ evolves_to: row.evolves_to, evolves_at_level: row.evolves_at_level }),
    });
    if (res.status >= 400) {
      console.error(`FALHA ligando evolucao ${row.id} -> ${row.evolves_to}: ${res.status}`);
      console.error(JSON.stringify(res.body).slice(0, 300));
      process.exit(1);
    }
  }
  console.log(`  species.evolves_to: ${evoRows.length} ligacoes`);

  console.log('\nContagens no banco:');
  for (const t of ['species', 'moves', 'species_moves', 'items', 'type_chart', 'maps', 'map_encounters', 'formulas']) {
    console.log(`  ${t.padEnd(16)} ${await count(t)}`);
  }
  console.log('\nMigracao de catalogo concluida.');
}

main().catch((err) => {
  console.error('erro:', err.message);
  process.exit(1);
});
