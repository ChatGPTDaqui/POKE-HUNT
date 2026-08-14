// Cliente minimo da PokeAPI, com cache em disco e resolucao de valores por
// VERSAO DE JOGO.
//
// POR QUE ISTO EXISTE, E POR QUE E A PARTE DELICADA DA MIGRACAO
//
// `/pokemon/{id}` e `/move/{name}` devolvem o dado ATUAL (a geracao mais
// recente), nao o do Ultra Sun. Usar a resposta crua traria, por exemplo,
// Rapid Spin com 50 de poder (valor introduzido na Gen8) num jogo que declara
// usar dado da Gen7 (20). O historico esta em dois campos, e eles tem
// semanticas OPOSTAS — foi conferido a mao contra casos conhecidos:
//
//   `move.past_values[i].version_group`  = o version group em que o valor
//       MUDOU. Os valores listados sao os ANTIGOS, validos ATE (exclusive)
//       aquele version group.
//       Prova: Bite lista {version_group: 'gold-silver', type: 'normal'} e
//       Bite E Sombrio (dark) desde Gold/Silver — logo o 'normal' vale ANTES
//       de GS, nao durante.
//
//   `pokemon.past_types[i].generation`   = a ultima geracao em que aqueles
//       tipos valeram (INCLUSIVE).
//       Prova: Magnemite lista {generation: 'generation-i', types: [electric]}
//       e Magnemite E Eletrico/Aco desde a Gen2 — logo o 'electric' puro vale
//       DURANTE a Gen1.
//
// Misturar as duas semanticas erra por uma geracao inteira e nao produz erro
// nenhum: o jogo so fica com o numero errado. Dai as duas funcoes separadas
// abaixo, cada uma com o teste que a valida em `scripts/fetch-usum-catalog.js`.
'use strict';

const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', '.cache', 'pokeapi');
const BASE = 'https://pokeapi.co/api/v2';

// Ultra Sun/Ultra Moon. `order` vem de /version-group e e o que permite
// comparar "veio antes/depois" sem uma tabela de geracoes a mao.
const USUM_VERSION_GROUP = 'ultra-sun-ultra-moon';
const USUM_GENERATION = 'generation-vii';

function cachePath(url) {
  const safe = url.replace(BASE + '/', '').replace(/[^a-z0-9]+/gi, '_');
  return path.join(CACHE_DIR, `${safe}.json`);
}

let hits = 0;
let misses = 0;

async function getJson(url) {
  const file = cachePath(url);
  if (fs.existsSync(file)) {
    hits++;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  let ultimoErro = null;
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (res.status >= 400) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(json));
      misses++;
      return json;
    } catch (err) {
      ultimoErro = err;
      // Backoff curto: a PokeAPI e generosa, mas 800 requests seguidos de uma
      // rede domestica derrubam alguma conexao de vez em quando, e uma falha
      // isolada nao pode abortar um catalogo inteiro.
      await new Promise((r) => setTimeout(r, 250 * (tentativa + 1)));
    }
  }
  throw new Error(`GET ${url} falhou depois de 4 tentativas: ${ultimoErro && ultimoErro.message}`);
}

function estatisticasDeCache() {
  return { cache: hits, rede: misses };
}

// Roda `fn` sobre `itens` com no maximo `limite` requests simultaneos.
// Sequencial demora ~2 minutos pros ~800 recursos; 12 em paralelo cai pra
// poucos segundos sem chegar perto de irritar a API.
async function emParalelo(itens, limite, fn) {
  const saida = new Array(itens.length);
  let proximo = 0;
  async function worker() {
    for (;;) {
      const i = proximo++;
      if (i >= itens.length) return;
      saida[i] = await fn(itens[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, worker));
  return saida;
}

// ---------------------------------------------------------------------------
// Ordem dos version groups (para comparar "antes/depois do USUM")
// ---------------------------------------------------------------------------
let ordemVg = null;

async function carregarOrdemDeVersionGroups() {
  if (ordemVg) return ordemVg;
  const lista = await getJson(`${BASE}/version-group?limit=200`);
  const detalhes = await emParalelo(lista.results, 12, (r) => getJson(r.url));
  ordemVg = {};
  for (const d of detalhes) ordemVg[d.name] = d.order;
  if (ordemVg[USUM_VERSION_GROUP] == null) {
    throw new Error(`version group "${USUM_VERSION_GROUP}" nao existe na PokeAPI`);
  }
  return ordemVg;
}

// ---------------------------------------------------------------------------
// Resolucao de valores no Ultra Sun
// ---------------------------------------------------------------------------

/**
 * Poder/PP/tipo de um golpe COMO ERAM no Ultra Sun.
 *
 * `past_values` lista mudancas FUTURAS em relacao a um ponto do passado: cada
 * entrada diz "neste version group o valor mudou; antes dele era X". Entao o
 * valor valido no USUM e o da PRIMEIRA entrada cujo version group veio DEPOIS
 * do USUM; se nenhuma veio depois, nada mudou desde entao e o valor atual e o
 * valor do USUM.
 */
function valoresDeGolpeNoUsum(move, ordem) {
  const usum = ordem[USUM_VERSION_GROUP];
  const posteriores = (move.past_values || [])
    .filter((v) => ordem[v.version_group.name] != null && ordem[v.version_group.name] > usum)
    .sort((a, b) => ordem[a.version_group.name] - ordem[b.version_group.name]);

  let power = move.power;
  let pp = move.pp;
  let accuracy = move.accuracy;
  let type = move.type.name;

  // So a primeira mudanca posterior importa: ela carrega o valor que estava
  // valendo imediatamente antes dela — ou seja, no USUM. Entradas mais
  // adiante descrevem valores ainda mais recentes.
  if (posteriores.length) {
    const p = posteriores[0];
    if (p.power !== null && p.power !== undefined) power = p.power;
    if (p.pp !== null && p.pp !== undefined) pp = p.pp;
    if (p.accuracy !== null && p.accuracy !== undefined) accuracy = p.accuracy;
    if (p.type) type = p.type.name;
  }
  return { power, pp, accuracy, type };
}

const ORDEM_DE_GERACAO = {
  'generation-i': 1, 'generation-ii': 2, 'generation-iii': 3, 'generation-iv': 4,
  'generation-v': 5, 'generation-vi': 6, 'generation-vii': 7, 'generation-viii': 8,
  'generation-ix': 9,
};

/**
 * Tipos de uma especie COMO ERAM no Ultra Sun (Gen7).
 *
 * `past_types` e INCLUSIVO: a entrada {generation: 'generation-v', types: [...]}
 * significa "estes eram os tipos ATE O FIM da Gen5". Entao vale a primeira
 * entrada cuja geracao e >= 7; nenhuma, e os tipos atuais valem.
 */
function tiposNoUsum(pokemon) {
  const gen = ORDEM_DE_GERACAO[USUM_GENERATION];
  const candidatas = (pokemon.past_types || [])
    .filter((p) => (ORDEM_DE_GERACAO[p.generation.name] || 0) >= gen)
    .sort((a, b) => ORDEM_DE_GERACAO[a.generation.name] - ORDEM_DE_GERACAO[b.generation.name]);
  const fonte = candidatas.length ? candidatas[0].types : pokemon.types;
  return [...fonte].sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
}

/** Golpes aprendidos por NIVEL no Ultra Sun, ordenados por (nivel, nome). */
function golpesDeNivelNoUsum(pokemon) {
  const saida = [];
  for (const entrada of pokemon.moves) {
    for (const det of entrada.version_group_details) {
      if (det.version_group.name !== USUM_VERSION_GROUP) continue;
      if (det.move_learn_method.name !== 'level-up') continue;
      saida.push({ move: entrada.move.name, level: det.level_learned_at });
    }
  }
  // Nivel 0 existe no dado da PokeAPI para golpes de "evolucao" (aprendidos
  // ao evoluir). Aqui viram nivel 1: este jogo so tem "levelReq", e um
  // requisito 0 deixaria o golpe fora do filtro `levelReq <= level` de um
  // POKE nivel 1 em alguns pontos e dentro em outros.
  for (const g of saida) if (!g.level || g.level < 1) g.level = 1;
  saida.sort((a, b) => a.level - b.level || a.move.localeCompare(b.move));
  return saida;
}

module.exports = {
  BASE,
  USUM_VERSION_GROUP,
  USUM_GENERATION,
  getJson,
  emParalelo,
  carregarOrdemDeVersionGroups,
  valoresDeGolpeNoUsum,
  tiposNoUsum,
  golpesDeNivelNoUsum,
  estatisticasDeCache,
};
