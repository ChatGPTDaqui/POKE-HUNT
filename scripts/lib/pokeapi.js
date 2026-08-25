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
      // Nivel 0 cru da PokeAPI = golpe GANHO AO EVOLUIR (ex.: Metapod nasce
      // sabendo Harden). Guardado ANTES da normalizacao abaixo, porque depois
      // dela fica identico, byte a byte, a uma linha do bloco de Recordador
      // de Golpes (que tambem normaliza pra nivel 1) — sem esta marca,
      // `removerGolpesDeRecordador` nao teria como distinguir "golpe real de
      // evolucao" de "so acessivel via Recordador" e removeria os dois iguais
      // (achado ao vivo: Metapod/Kakuna ficavam com ZERO golpes).
      saida.push({ move: entrada.move.name, level: det.level_learned_at, evolucao: det.level_learned_at === 0 });
    }
  }
  // Nivel 0 vira nivel 1: este jogo so tem "levelReq", e um requisito 0
  // deixaria o golpe fora do filtro `levelReq <= level` de um POKE nivel 1
  // em alguns pontos e dentro em outros.
  for (const g of saida) if (!g.level || g.level < 1) g.level = 1;
  // A PokeAPI as vezes repete a MESMA linha de `version_group_details` pro
  // version_group ja resolvido (visto em ~48 especies, sempre no nivel 1
  // pos-normalizacao acima — plausivel efeito colateral de Ultra Sun/Ultra
  // Moon serem dois jogos fundidos num version_group so). Golpe repetido no
  // MESMO nivel nunca e dado real (diferente do caso legitimo de reaprender
  // em outro nivel, que este dedupe preserva: so remove match exato de
  // move+level). Achado rodando um dedupe-check contra o catalogo gerado.
  const vistos = new Map();
  const semDuplicata = [];
  for (const g of saida) {
    const chave = `${g.move}@${g.level}`;
    const existente = vistos.get(chave);
    if (existente) { existente.evolucao = existente.evolucao || g.evolucao; continue; }
    vistos.set(chave, g);
    semDuplicata.push(g);
  }
  semDuplicata.sort((a, b) => a.level - b.level || a.move.localeCompare(b.move));
  return semDuplicata;
}

/**
 * Remove do learnset de cada especie o que NAO e golpe aprendido por NIVEL
 * pela propria especie — so o Recordador de Golpes entrega.
 *
 * DECISAO DE JOGO (pedido explicito do usuario, ciente da perda de conteudo):
 * um POKE so aprende golpe que TEM nivel real na SUA propria linha evolutiva.
 * Sem Recordador. Quem quiser um golpe de nivel mais alto evolui/sobe de
 * nivel ate la — nao ha mais atalho.
 *
 * Contra ~251 especies do dex 1-251, o bloco de nivel 1 de uma especie
 * evoluida (a lista do Recordador, ver `golpesDeNivelNoUsum`) mistura DOIS
 * tipos de linha:
 *
 *  1. golpe no nivel 1 E num nivel maior (mesma especie) -> mantido, so no
 *     nivel maior (a linha 1 e a entrada do Recordador do MESMO golpe).
 *  2. golpe SO no nivel 1, marcado `evolucao` (era nivel 0 cru na PokeAPI,
 *     "aprendido ao evoluir") -> mantido, exigindo o nivel em que a especie
 *     PASSA A EXISTIR (o de evolucao). Nao e Recordador: Metapod nasce
 *     sabendo Harden, nao precisa ir atras de ninguem pra reaprender.
 *  3. golpe SO no nivel 1, sem a marca -> Recordador puro. Removido, sem
 *     substituto — o jogo original so entrega isso via Recordador, esteja
 *     ele tambem na linha do ancestral (Tackle do Cyndaquil, no bloco do
 *     Typhlosion) ou em especie nenhuma.
 *
 * Base stage (sem evolucao anterior) nunca perde golpe de nivel 1: ali
 * "nivel 1" e o kit inicial de verdade, nao bloco de Recordador.
 *
 * Muta `especies` in-place (mesmo padrao de `golpesDeNivelNoUsum`, que ja
 * dedupe linha exata antes disto rodar).
 */
// Poder a partir do qual um golpe restaurado NAO volta pro nivel 1 — ver o
// escape dentro da funcao. Espelha o piso do teste
// src/data/activeAbilities.test.ts#"nenhuma especie EVOLUIDA entrega golpe de
// poder >= 100 no nivel 1".
const PODER_QUE_NAO_VOLTA_PRO_NIVEL_1 = 100;

function removerGolpesDeRecordador(especies, poderPorGolpe = {}) {
  const paiDe = new Map();
  for (const e of especies) {
    if (!e.evolvesTo || !e.evolvesAtLevel) continue;
    const atual = paiDe.get(e.evolvesTo);
    if (!atual || e.evolvesAtLevel < atual.nivel) paiDe.set(e.evolvesTo, { id: e.chave, nivel: e.evolvesAtLevel });
  }

  let removidos = 0;
  const restaurados = [];
  for (const especie of especies) {
    const descartados = [];
    const porGolpe = new Map();
    for (const g of especie.golpes) {
      const info = porGolpe.get(g.chave);
      if (info) { info.niveis.push(g.nivel); info.evolucao = info.evolucao || (g.nivel === 1 && !!g.evolucao); }
      else porGolpe.set(g.chave, { niveis: [g.nivel], evolucao: g.nivel === 1 && !!g.evolucao });
    }

    const pai = paiDe.get(especie.chave);
    const golpesNovos = [];
    for (const [golpe, info] of porGolpe) {
      const acimaDeUm = info.niveis.filter((n) => n > 1);
      if (acimaDeUm.length) {
        golpesNovos.push({ chave: golpe, nivel: Math.min(...acimaDeUm) });
        removidos += info.niveis.length - 1;
        continue;
      }
      // So sobrou nivel 1. Base stage: kit inicial real, mantido.
      if (!pai) { golpesNovos.push({ chave: golpe, nivel: info.niveis[0] }); continue; }
      // Especie evoluida, golpe SO no nivel 1: golpe de evolucao de verdade
      // (marca preservada por golpesDeNivelNoUsum) fica, exigindo o nivel em
      // que a especie evoluiu pra existir; o resto e bloco de Recordador puro.
      if (info.evolucao) { golpesNovos.push({ chave: golpe, nivel: pai.nivel }); continue; }
      descartados.push(golpe);
      removidos += info.niveis.length;
    }

    // ESCAPE: especie cujo bloco de nivel 1 era o moveset INTEIRO.
    //
    // A regra acima pressupoe que a especie evoluida tem golpe de nivel proprio
    // e que o bloco de nivel 1 e so o Recordador repetindo o que ela ja
    // aprende. Isso vale pra evolucao por nivel e NAO vale pra evolucao por
    // pedra: no jogo original Raichu, Wigglytuff, Clefable, Arcanine e Starmie
    // nao aprendem quase nada subindo de nivel — o kit todo mora no bloco de
    // nivel 1. Aplicar a regra ali deixava Raichu, Wigglytuff e Clefable com
    // ZERO golpes e Arcanine com um so, a partir do nivel 34.
    //
    // Ate PH-145 isso nao aparecia porque essas especies nao tinham pai:
    // evolucao por pedra nem existia no catalogo, entao elas passavam por
    // `base stage` e ficavam com o bloco. Nao e regressao daquela mudanca — e
    // um buraco da regra que so ficou alcancavel agora.
    //
    // O criterio e o TAMANHO do que sobrou, em toda a vida da especie: menos de
    // MAX_ACTIVE_ABILITIES golpes e o bloco volta inteiro.
    //
    // Quatro e o numero de slots ativos do jogo
    // (`src/data/activeAbilities.ts#MAX_ACTIVE_ABILITIES`): abaixo disso o POKE
    // entra em combate com slot preenchido por Ataque Basico, que e o sintoma
    // que este escape existe pra evitar. Charizard tem treze e nao entra;
    // Raichu, Wigglytuff e Clefable tinham ZERO, Arcanine e Starmie um.
    //
    // Nao usar "quantos golpes ate o nivel em que a especie surge": Charizard
    // so aprende acima do nivel 1 a partir do 36, o mesmo nivel em que ele
    // evolui, e o criterio dispararia pra 88 especies — devolvendo justamente o
    // Recordador que a v6.8 tirou.
    const SLOTS_ATIVOS = 4;
    if (descartados.length && golpesNovos.length < SLOTS_ATIVOS) {
      for (const golpe of descartados) {
        // Golpe FORTE nao volta pro nivel 1 — vai pro nivel em que a especie
        // surge. O bloco do Cloyster tem Hydro Pump (110 de poder); devolver
        // aquilo no nivel 1 daria a um Cloyster selvagem Lv5 o golpe mais forte
        // do jogo, e e exatamente o que o teste
        // "nenhuma especie EVOLUIDA entrega golpe de poder >= 100 no nivel 1"
        // guarda. O resto do bloco fica no 1: e o kit que faz a especie ter o
        // que jogar.
        const forte = (poderPorGolpe[golpe] ?? 0) >= PODER_QUE_NAO_VOLTA_PRO_NIVEL_1;
        golpesNovos.push({ chave: golpe, nivel: forte ? pai.nivel : 1 });
        removidos -= porGolpe.get(golpe).niveis.length;
      }
      restaurados.push(especie.chave);
    }

    golpesNovos.sort((a, b) => a.nivel - b.nivel || a.chave.localeCompare(b.chave));
    especie.golpes = golpesNovos;
  }
  if (restaurados.length) {
    console.log(`  bloco de nivel 1 devolvido a ${restaurados.length} especie(s) que ficariam sem golpe: ${restaurados.join(', ')}`);
  }
  return removidos;
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
  removerGolpesDeRecordador,
  estatisticasDeCache,
};
