// Gera os web/src/data/generated/*.ts a partir do POSTGRES, no lugar de
// scripts/sync-planilha.js (que le do .xlsx).
//
// Rodar com: npm run catalog:gerar
//
// ---------------------------------------------------------------------------
// COMO ISTO GARANTE QUE O JOGO NAO MUDA
//
// O criterio de aceitacao e byte-a-byte: o que sai daqui tem que ser identico
// ao que a planilha produz. Nao "equivalente" — o mesmo arquivo. E a unica
// prova de que trocar a FONTE nao mudou o JOGO. Roda com
// `node scripts/verify-catalog-diff.js`.
//
// Pra isso, este script NAO reimplementa a curadoria de hunts (quais especies
// aparecem em qual bioma, em que ordem, com que nivel). Ele monta um objeto
// com a MESMA FORMA de um workbook — mesmos nomes de aba e de coluna — e o
// entrega pras funcoes de `sync-planilha.js`, reusadas sem alteracao.
// Duplicar aquela logica seria garantia de divergencia no primeiro ajuste de
// balanceamento.
//
// ---------------------------------------------------------------------------
// O QUE NAO VEM DAS 8 TABELAS DE CATALOGO, E POR QUE
//
// 1. `Locais_Info`/`Encontros` (os 99 locais reais de Johto). Existem no
//    schema (locations/location_encounters) mas nao foram populados. O
//    pipeline so extrai duas coisas delas — a hunt inicial e as 5 faixas de
//    nivel de Johto — e as duas ja estao em `maps`/`map_encounters`, entao
//    sao lidas de la. `pickTopHunts`/`computeJohtoBrackets` nao rodam aqui.
//
// 2. A ordem dos 17 tipos (linhas e colunas do type_chart) vem de
//    `web/src/data/typeColors.ts`, arquivo hand-authored do jogo — conferido,
//    bate exatamente com a ordem da aba. Guardar de novo no banco criaria
//    duas fontes de verdade pra mesma coisa.
//
// 3. Modo Pesadelo e hunts BOSS continuam derivados em runtime por
//    `web/src/data/nightmareMaps.ts` — nunca foram materializados no banco.
'use strict';

const fs = require('fs');
const path = require('path');
const sync = require('./sync-planilha.js');

const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// Credenciais (.env da raiz, gitignored). Nunca logar a service_role.
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

// PostgREST corta em 1000 linhas por request, em silencio. Ler `species_moves`
// (1865) sem paginar perderia 865 linhas sem erro nenhum — por isso a leitura
// pagina sempre e confere o total contra o Content-Range.
const PAGE = 1000;

async function fetchAll(table, order) {
  const rows = [];
  let from = 0;
  let total = null;
  for (;;) {
    const qs = `${table}?select=*${order ? `&order=${order}` : ''}`;
    const res = await fetch(`${ENV.SUPABASE_URL}/rest/v1/${qs}`, {
      headers: {
        apikey: ENV.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'count=exact',
        Range: `${from}-${from + PAGE - 1}`,
      },
    });
    if (res.status >= 400) throw new Error(`lendo ${table}: ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    total = Number((res.headers.get('content-range') || '').split('/')[1]);
    if (page.length === 0 || rows.length >= total) break;
    from += PAGE;
  }
  if (Number.isFinite(total) && rows.length !== total) {
    throw new Error(`li ${rows.length} de ${total} linhas em ${table} — paginacao incompleta`);
  }
  return rows;
}

// PostgREST devolve `numeric` como string JSON ("0.5"), nunca como numero —
// o tipo nao cabe num double sem risco de perda, entao o driver preserva o
// texto. Sem esta conversao, `capture_rate` viraria a string "1.5" no arquivo
// gerado e o type chart sairia com aspas em todo multiplicador.
function num(value) {
  return value == null ? null : Number(value);
}

// ---------------------------------------------------------------------------
// Ordem canonica dos 17 tipos, de typeColors.ts (ver nota 2 do cabecalho).
// ---------------------------------------------------------------------------
function readTypeOrder() {
  const src = fs.readFileSync(path.join(ROOT, 'web', 'src', 'data', 'typeColors.ts'), 'utf8');
  const types = [...src.matchAll(/^ {2}([A-Z_]+):/gm)].map((m) => m[1]);
  if (types.length !== 17) throw new Error(`typeColors.ts: esperava 17 tipos, achei ${types.length}`);
  return types;
}

// ---------------------------------------------------------------------------
// Banco -> forma de workbook
//
// Cada funcao devolve linhas com os MESMOS nomes de coluna que a aba
// correspondente tem, porque e isso que as funcoes reusadas leem.
// ---------------------------------------------------------------------------
function speciesSheet(species) {
  return species.map((s) => ({
    'Chave': s.id.toUpperCase(),
    'Nome': s.name,
    'Nº Pokédex': s.dex_number,
    'Tipo 1': s.type1,
    'Tipo 2': s.type2 || '',
    'HP': s.base_hp,
    'Ataque': s.base_atk_fis,
    'Ataque Especial': s.base_atk_esp,
    'Defesa': s.base_def,
    'Defesa Especial': s.base_def_esp,
    'Velocidade': s.base_speed,
    'EXP Base': s.base_exp,
    'Taxa de Captura (0-255)': s.catch_rate,
    'Curva de Crescimento': s.growth_curve,
    // As 9 evolucoes "especiais" (ex-troca: Kadabra->Alakazam etc.) sao um
    // patch de runtime em web/src/data/pokes.ts, e a planilha nunca as teve —
    // o banco guarda o estado final, entao aqui elas sao desfeitas pra o
    // arquivo gerado continuar sendo o mesmo. `is_special_evolution` marca
    // exatamente essas 9.
    'Evolui Para (chave)': s.is_special_evolution || !s.evolves_to ? '' : s.evolves_to.toUpperCase(),
    'Evolui no Nível': s.is_special_evolution ? '' : s.evolves_at_level,
  }));
}

function movesSheet(moves) {
  return moves.map((m) => ({
    'Chave': m.id.toUpperCase(),
    'Nome': m.name,
    'Tipo': m.type,
    'Categoria (informativo)': m.category === 'special' ? 'especial' : 'físico',
    'Poder': m.power,
    'Precisão': m.accuracy,
    'PP': m.pp,
  }));
}

// Ordenado por (especie, sort_order): `sort_order` e a posicao final dentro do
// moveset da especie, ja com os empates de nivel resolvidos na ordem da
// planilha (ver a migration `ordem_de_origem_do_catalogo`).
function movesetsSheet(speciesMoves) {
  return speciesMoves.map((sm) => ({
    'Espécie (chave)': sm.species_id.toUpperCase(),
    'Golpe (chave)': sm.move_id.toUpperCase(),
    'Nível': sm.level_req,
  }));
}

function itemsSheet(items) {
  // Stones sao hand-authored (web/src/data/stones.ts) e nao aparecem em
  // items.generated.ts — o jogo as mescla em runtime.
  return items
    .filter((i) => i.kind !== 'stone')
    .map((i) => ({
      'Chave': i.id.toUpperCase(),
      'Nome': i.name,
      'Tipo (kind)': i.kind,
      'Preço de Compra': i.buy_price,
      'Multiplicador de Captura': num(i.capture_rate),
      'Cura de HP': i.heals_full ? 'infinito' : i.heal_amount,
      'Cura % (revive)': num(i.revive_hp_percent),
    }));
}

function typeChartSheet(typeChart, typeOrder) {
  const byPair = new Map();
  for (const row of typeChart) {
    byPair.set(`${row.attacking_type}|${row.defending_type}`, num(row.multiplier));
  }
  return typeOrder.map((atk) => {
    const row = { 'Ataca \\ Defende': atk };
    for (const def of typeOrder) {
      const m = byPair.get(`${atk}|${def}`);
      if (m == null) throw new Error(`type_chart sem a celula ${atk} x ${def}`);
      row[def] = m;
    }
    return row;
  });
}

function formulasSheet(formulas) {
  return formulas.map((f) => ({
    'Chave': f.key,
    'Expressão': f.expression,
    // `syncFormulas` re-divide a string por virgula e trata a palavra
    // 'nenhuma' como "sem variaveis" — que e como a planilha grafa o vazio.
    'Variáveis disponíveis': f.variables && f.variables.length ? f.variables.join(', ') : 'nenhuma',
    'Descrição': f.description || '',
  }));
}

// ---------------------------------------------------------------------------
// Hunts: `starter` + `brackets` reconstruidos de maps/map_encounters, no lugar
// de pickTopHunts/computeJohtoBrackets (ver nota 1 do cabecalho).
// ---------------------------------------------------------------------------
const STARTER_MAP_ID = 'route_46';

// `map.id` = `${keyPrefix}_${slug(bioma)}` e `map.name` = `${label} (${bioma})`.
// O bioma pode ter mais de uma palavra ("Torre Mistica" -> "torre_mistica"),
// entao cortar o id pelo ultimo "_" erraria — o sufixo e derivado do nome do
// bioma, que esta explicito no `name`, e a checagem abaixo falha alto se as
// duas convencoes deixarem de bater.
function keyPrefixDoMapa(map) {
  const bioma = map.name.slice(map.name.lastIndexOf('(') + 1, map.name.lastIndexOf(')'));
  const slug = bioma.toLowerCase().replace(/\s+/g, '_');
  if (!map.id.endsWith(`_${slug}`)) {
    throw new Error(`id "${map.id}" nao termina com o bioma "${slug}" do nome "${map.name}"`);
  }
  return map.id.slice(0, map.id.length - slug.length - 1);
}

function rebuildStarterHunt(maps, encounters) {
  const map = maps.find((m) => m.id === STARTER_MAP_ID);
  if (!map) throw new Error(`hunt inicial "${STARTER_MAP_ID}" nao encontrada em maps`);

  const speciesLevels = {};
  for (const enc of encounters.filter((e) => e.map_id === STARTER_MAP_ID)) {
    speciesLevels[enc.species_id.toUpperCase()] = { min: enc.min_level, max: enc.max_level };
  }
  if (Object.keys(speciesLevels).length === 0) {
    throw new Error(`hunt inicial "${STARTER_MAP_ID}" sem nenhum encontro`);
  }

  return {
    key: map.id,
    name: map.name,
    avgLevel: (map.min_level + map.max_level) / 2, // so alimenta o log
    minLevel: map.min_level,
    maxLevel: map.max_level,
    speciesLevels,
    bgTheme: map.bg_theme,
    continent: map.continent,
    unlockCost: map.unlock_cost ?? null,
  };
}

// Os 9 brackets (5 Johto + 4 Kanto). Cada um tem 2 mapas (um por bioma) que
// compartilham keyPrefix, label e faixa de nivel — entao o bracket sai do
// primeiro mapa de cada grupo, e a ordem sai de `sort_order`.
function rebuildBrackets(maps) {
  const porPrefixo = new Map();
  for (const map of maps) {
    if (map.id === STARTER_MAP_ID) continue;
    const keyPrefix = keyPrefixDoMapa(map);
    if (porPrefixo.has(keyPrefix)) continue;
    porPrefixo.set(keyPrefix, {
      keyPrefix,
      label: map.name.slice(0, map.name.lastIndexOf('(')).trim(),
      minLevel: map.min_level,
      maxLevel: map.max_level,
      continent: map.continent,
      unlockCost: map.unlock_cost ?? null,
    });
  }
  return [...porPrefixo.values()];
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('Lendo catalogo do Postgres...\n');

  const [species, moves, speciesMoves, items, typeChart, maps, mapEncounters, formulas] = await Promise.all([
    fetchAll('species', 'dex_number.asc'),
    fetchAll('moves', 'id.asc'),
    fetchAll('species_moves', 'species_id.asc,sort_order.asc'),
    fetchAll('items', 'sort_order.asc'),
    fetchAll('type_chart', 'attacking_type.asc,defending_type.asc'),
    fetchAll('maps', 'sort_order.asc'),
    fetchAll('map_encounters', 'map_id.asc,sort_order.asc'),
    fetchAll('formulas', 'sort_order.asc'),
  ]);

  console.log(`  species ${species.length} | moves ${moves.length} | species_moves ${speciesMoves.length}`);
  console.log(`  items ${items.length} | type_chart ${typeChart.length} | maps ${maps.length}`);
  console.log(`  map_encounters ${mapEncounters.length} | formulas ${formulas.length}\n`);

  const workbook = {
    'Espécies': speciesSheet(species),
    'Golpes': movesSheet(moves),
    'Movesets': movesetsSheet(speciesMoves),
    'Itens': itemsSheet(items),
    'TabelaDeTipos': typeChartSheet(typeChart, readTypeOrder()),
    'Fórmulas': formulasSheet(formulas),
  };

  sync.syncFormulas(workbook);
  sync.syncTypeChart(workbook);
  sync.syncItemsFull(workbook);

  const starter = rebuildStarterHunt(maps, mapEncounters);
  const brackets = rebuildBrackets(maps);
  const roster = sync.buildTypeRoster(workbook);
  const hunts = [starter, ...sync.buildTypeDrivenHunts(brackets, roster)];

  const { speciesData } = sync.syncSpeciesAndMoves(workbook, hunts);
  sync.syncMapsAndEncounters(hunts, speciesData);

  console.log('\nCatalogo gerado a partir do Postgres.');
}

main().catch((err) => {
  console.error(`\nFALHOU: ${err.message}`);
  process.exit(1);
});
