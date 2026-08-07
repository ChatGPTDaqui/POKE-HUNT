#!/usr/bin/env node
// Deriva o TIER DE SPAWN de cada especie a partir do dado real de encontro
// selvagem do Gen1/Gen2, e grava `scripts/spawn-tiers.json`.
//
// POR QUE ISTO EXISTE
// -------------------
// O peso de spawn do jogo era `species.catchRate` (CLAUDE.md, "Spawn ponderado
// por raridade"). Taxa de CAPTURA nao tem relacao com frequencia de APARICAO:
// Dunsparce e facil de capturar (catchRate 190) e ocupava 27% de uma hunt,
// quando no jogo real ele e a vaga de 1% — a mais rara do mapa. Foi escolhido
// na epoca por ser "um dado que a planilha ja tinha", nao por ser certo.
//
// POR QUE NAO USAR A PLANILHA
// ---------------------------
// A aba "Encontros" tem uma coluna `Slot`, o que sugeria dar pra derivar a
// chance real dela. Mas a planilha e uma RECONSTRUCAO, e no nivel de slot ela
// nao e fiel. Conferido especie a especie contra o disassembly:
//   TENTACOOL  planilha 30%   real 74%   (e a vaga de 60% da agua em quase todo lugar)
//   MAGIKARP   planilha 51%   real 69%
//   PSYDUCK    planilha 30%   real 90%
// 48 das 78 especies divergiam. Alem disso a planilha so cobre Johto no periodo
// `day`, o que deixaria 130 das 212 especies spawnaveis sem dado nenhum.
//
// FONTE
// -----
// Os disassemblies oficiais pret/pokecrystal, pret/pokegold (que cobre Gold e
// Silver) e pret/pokered (Red e Blue). E o dado do jogo, nao uma tabela de wiki
// transcrita a mao. Cobre as quatro formas de encontro selvagem do Gen2 —
// grama, surf, pesca e headbutt. Fossem so grama+surf, especies como
// Remoraid/Qwilfish/Heracross cairiam em "nunca selvagem", o que e falso.
//
// COMO RODAR
//   node scripts/derive-spawn-tiers.js
// Precisa de rede (baixa os .asm do GitHub). O resultado e COMMITADO, entao o
// build normal (`npm run catalog:gerar`) nunca depende de rede.
//
// O JSON gerado nao deve ser editado a mao — cada especie carrega `origem`
// (`gsc` / `rb` / `regra`) justamente pra ficar auditavel daqui a seis meses o
// que foi medido e o que foi decidido.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SAIDA = path.join(__dirname, 'spawn-tiers.json');
const CACHE = path.join(__dirname, '..', '.cache', 'pret');

const BASE_CRYSTAL = 'https://raw.githubusercontent.com/pret/pokecrystal/master';
const BASE_GOLD = 'https://raw.githubusercontent.com/pret/pokegold/master';
const BASE_RED = 'https://raw.githubusercontent.com/pret/pokered/master';

const ARQUIVOS = {
  'crystal-johto-grass.asm': `${BASE_CRYSTAL}/data/wild/johto_grass.asm`,
  'crystal-kanto-grass.asm': `${BASE_CRYSTAL}/data/wild/kanto_grass.asm`,
  'crystal-johto-water.asm': `${BASE_CRYSTAL}/data/wild/johto_water.asm`,
  'crystal-kanto-water.asm': `${BASE_CRYSTAL}/data/wild/kanto_water.asm`,
  'crystal-fish.asm': `${BASE_CRYSTAL}/data/wild/fish.asm`,
  'crystal-treemons.asm': `${BASE_CRYSTAL}/data/wild/treemons.asm`,
  'crystal-evos-attacks.asm': `${BASE_CRYSTAL}/data/pokemon/evos_attacks.asm`,
  'gold-johto-grass.asm': `${BASE_GOLD}/data/wild/johto_grass.asm`,
  'gold-kanto-grass.asm': `${BASE_GOLD}/data/wild/kanto_grass.asm`,
  'gold-johto-water.asm': `${BASE_GOLD}/data/wild/johto_water.asm`,
  'gold-kanto-water.asm': `${BASE_GOLD}/data/wild/kanto_water.asm`,
  'crystal-pokemon-constants.asm': `${BASE_CRYSTAL}/constants/pokemon_constants.asm`,
};

// ---------------------------------------------------------------------------
// Tabelas de probabilidade por vaga (dos proprios disassemblies)
// ---------------------------------------------------------------------------
// pokecrystal data/wild/probabilities.asm
const GRASS_GSC = [30, 30, 20, 10, 5, 4, 1];
const WATER_GSC = [60, 30, 10];
// pokered data/wild/probabilities.asm — 10 vagas sobre 256
const SLOTS_RB = [51, 51, 39, 25, 25, 25, 13, 13, 11, 3].map((n) => (n / 256) * 100);
// A tabela `rare` de headbutt so e sorteada em arvore rara. Tratar as duas
// tabelas como iguais inflava quem so aparece na rare: Heracross saia
// `muito_comum` sendo o encontro dificil que e.
const PESO_ARVORE_RARA = 0.1;

// A escala espelha a GrassMonProbTable do Gen2 (30/30/20/10/5/4/1): os tiers
// SAO as vagas reais do jogo, nao numeros escolhidos a esmo. O `peso` alimenta
// o weightedPick do spawn.
const TIERS = [
  { chave: 'muito_comum', peso: 30, minChance: 25 },
  { chave: 'comum', peso: 20, minChance: 15 },
  { chave: 'incomum', peso: 10, minChance: 7.5 },
  { chave: 'raro', peso: 5, minChance: 3 },
  { chave: 'muito_raro', peso: 1, minChance: -Infinity },
];

const LEGENDARIOS = new Set([
  'articuno', 'zapdos', 'moltres', 'mewtwo', 'mew',
  'raikou', 'entei', 'suicune', 'lugia', 'ho_oh', 'celebi',
]);

// O disassembly usa o nome da constante (MR__MIME, NIDORAN_F, HO_OH) e o jogo
// usa a chave da planilha. Comparar so letras e digitos casa os dois sem
// precisar de tabela de excecao.
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------------------------------------------------------------------------
// Download (com cache em disco, pra rerodar sem bater na rede de novo)
// ---------------------------------------------------------------------------
async function baixarTudo() {
  fs.mkdirSync(CACHE, { recursive: true });
  const textos = {};
  for (const [nome, url] of Object.entries(ARQUIVOS)) {
    const local = path.join(CACHE, nome);
    if (fs.existsSync(local)) {
      textos[nome] = fs.readFileSync(local, 'utf8');
      continue;
    }
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`${resposta.status} ao baixar ${url}`);
    const texto = await resposta.text();
    fs.writeFileSync(local, texto);
    textos[nome] = texto;
    console.log(`  baixado ${nome}`);
  }
  return textos;
}

async function baixarPokered() {
  const dir = path.join(CACHE, 'red');
  fs.mkdirSync(dir, { recursive: true });
  const existentes = fs.readdirSync(dir);
  if (existentes.length) {
    return Object.fromEntries(existentes.map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
  }
  const lista = await (await fetch('https://api.github.com/repos/pret/pokered/contents/data/wild/maps')).json();
  if (!Array.isArray(lista)) throw new Error(`listagem de pokered inesperada: ${JSON.stringify(lista).slice(0, 200)}`);
  const textos = {};
  for (const arquivo of lista) {
    const texto = await (await fetch(arquivo.download_url)).text();
    fs.writeFileSync(path.join(dir, arquivo.name), texto);
    textos[arquivo.name] = texto;
  }
  console.log(`  baixados ${lista.length} mapas de pokered`);
  return textos;
}

// ---------------------------------------------------------------------------
// Preprocessador das diretivas de versao
// ---------------------------------------------------------------------------
// Os .asm vem com IF DEF(_GOLD) / ELIF DEF(_SILVER) / ELSE / ENDC em MAIUSCULO.
// Sem resolver isso por versao, os dois ramos ficam no texto e cada mapa sai
// com 42 entradas (2x21) em vez de 21 — silenciosamente, porque o texto
// continua sintaticamente plausivel. Por isso o parser abaixo ABORTA quando a
// contagem de entradas nao bate, em vez de descartar o mapa.
function preprocessar(texto, defs) {
  const avaliar = (expr) => {
    const m = /DEF\(\s*(\w+)\s*\)/i.exec(expr);
    if (!m) throw new Error(`condicao nao reconhecida: ${expr}`);
    if (!(m[1] in defs)) throw new Error(`simbolo de versao nao reconhecido: ${m[1]}`);
    return defs[m[1]];
  };
  const saida = [];
  const pilha = [];
  for (const linha of texto.split('\n')) {
    const t = linha.trim();
    let m;
    if ((m = /^IF\s+(.+)$/i.exec(t))) {
      const v = avaliar(m[1]);
      pilha.push({ ativo: v, jaTomado: v });
      continue;
    }
    if ((m = /^ELIF\s+(.+)$/i.exec(t))) {
      const topo = pilha[pilha.length - 1];
      const v = !topo.jaTomado && avaliar(m[1]);
      topo.ativo = v;
      topo.jaTomado = topo.jaTomado || v;
      continue;
    }
    if (/^ELSE$/i.test(t)) {
      const topo = pilha[pilha.length - 1];
      topo.ativo = !topo.jaTomado;
      topo.jaTomado = true;
      continue;
    }
    if (/^ENDC$/i.test(t)) {
      pilha.pop();
      continue;
    }
    if (pilha.every((n) => n.ativo)) saida.push(linha);
  }
  if (pilha.length) throw new Error('IF sem ENDC');
  return saida.join('\n');
}

const especiesDaLista = (bloco) =>
  [...bloco.matchAll(/^\s*db\s+\d+\s*,\s*([A-Z0-9_]+)\s*$/gm)].map((x) => x[1]);

// ---------------------------------------------------------------------------
// Parsers por tipo de encontro
// ---------------------------------------------------------------------------

// Grama do Gen2: 3 periodos (morn/day/nite) x 7 vagas. O jogo NAO tem ciclo
// dia/noite, entao a chance do local e a media dos 3 periodos — quem so aparece
// de noite conta 1/3. Recortar so o `day` (que era o recorte da planilha) fazia
// Hoothoot, Ledyba e Spinarak sairem como "nunca selvagem", o que e falso.
function parseGramaGsc(src, rotulo) {
  const mapas = {};
  for (const m of src.matchAll(/def_grass_wildmons\s+(\w+)([\s\S]*?)end_grass_wildmons/g)) {
    const entradas = especiesDaLista(m[2]);
    if (entradas.length !== 21) throw new Error(`${rotulo} ${m[1]}: ${entradas.length} entradas, esperado 21`);
    const chances = {};
    for (let periodo = 0; periodo < 3; periodo++) {
      entradas.slice(periodo * 7, periodo * 7 + 7).forEach((mon, i) => {
        chances[mon] = (chances[mon] || 0) + GRASS_GSC[i] / 3;
      });
    }
    mapas[m[1]] = chances;
  }
  return mapas;
}

function parseAguaGsc(src, rotulo) {
  const mapas = {};
  for (const m of src.matchAll(/def_water_wildmons\s+(\w+)([\s\S]*?)end_water_wildmons/g)) {
    const entradas = especiesDaLista(m[2]);
    if (entradas.length !== 3) throw new Error(`${rotulo} ${m[1]}: ${entradas.length} entradas, esperado 3`);
    const chances = {};
    entradas.forEach((mon, i) => { chances[mon] = (chances[mon] || 0) + WATER_GSC[i]; });
    mapas[m[1]] = chances;
  }
  return mapas;
}

// Pesca: cada tabela de vara e uma lista de limiares CUMULATIVOS. Uma entrada
// pode ser um redirect `time_group N`, que aponta pra uma linha de
// TimeFishGroups com uma especie de dia e uma de noite.
function parsePesca(texto) {
  const bloco = /TimeFishGroups:([\s\S]*)$/.exec(texto);
  if (!bloco) throw new Error('TimeFishGroups nao encontrado em fish.asm');
  const timeGroups = [...bloco[1].matchAll(/^\s*db\s+([A-Z0-9_]+)\s*,\s*\d+\s*,\s*([A-Z0-9_]+)\s*,\s*\d+/gm)]
    .map((m) => [m[1], m[2]]);
  if (!timeGroups.length) throw new Error('TimeFishGroups vazio');

  const tabelas = {};
  for (const m of texto.slice(0, bloco.index).matchAll(/^\.(\w+):\n((?:\s*db .*\n)+)/gm)) {
    const chances = {};
    let anterior = 0;
    for (const linha of m[2].split('\n')) {
      const lim = /^\s*db\s+(\d+)\s+percent(?:\s*\+\s*1)?\s*,\s*(.+?)\s*$/.exec(linha);
      if (!lim) continue;
      const fatia = Number(lim[1]) - anterior;
      anterior = Number(lim[1]);
      const alvo = lim[2];
      const tg = /^time_group\s+(\d+)/.exec(alvo);
      if (tg) {
        // metade do tempo o jogo esta de dia, metade de noite
        const [dia, noite] = timeGroups[Number(tg[1])];
        chances[dia] = (chances[dia] || 0) + fatia / 2;
        chances[noite] = (chances[noite] || 0) + fatia / 2;
      } else {
        const mon = /^([A-Z0-9_]+)\s*,/.exec(alvo);
        if (!mon) throw new Error(`entrada de pesca nao reconhecida: ${linha}`);
        chances[mon[1]] = (chances[mon[1]] || 0) + fatia;
      }
    }
    if (Object.keys(chances).length) tabelas[m[1]] = chances;
  }
  return tabelas;
}

// Headbutt: cada conjunto tem uma tabela `common` e uma `rare`, ja em % que
// somam 100 cada, ponderadas por PESO_ARVORE_RARA.
function parseArvores(texto) {
  const tabelas = {};
  for (const m of texto.matchAll(/^(TreeMonSet_\w+):\n([\s\S]*?)(?=^TreeMonSet_|\Z)/gm)) {
    const partes = m[2].split(/^; (?:common|rare)\s*$/m).slice(1);
    if (!partes.length) continue;
    if (partes.length !== 2) throw new Error(`${m[1]}: ${partes.length} tabelas, esperado common+rare`);
    const chances = {};
    partes.forEach((tabela, i) => {
      const peso = i === 0 ? 1 - PESO_ARVORE_RARA : PESO_ARVORE_RARA;
      for (const e of tabela.matchAll(/^\s*db\s+(\d+)\s*,\s*([A-Z0-9_]+)\s*,/gm)) {
        chances[e[2]] = (chances[e[2]] || 0) + Number(e[1]) * peso;
      }
    });
    if (Object.keys(chances).length) tabelas[m[1]] = chances;
  }
  return tabelas;
}

// Gen1: 10 vagas, mesma tabela pra grama e agua. Taxa de encontro 0 = o mapa
// nao tem aquele tipo de encontro (e nao tem entradas).
function parseGen1(src, rotulo) {
  const locais = {};
  for (const tipo of ['grass', 'water']) {
    const re = tipo === 'grass'
      ? /def_grass_wildmons\s+(\d+)([\s\S]*?)end_grass_wildmons/g
      : /def_water_wildmons\s+(\d+)([\s\S]*?)end_water_wildmons/g;
    let i = 0;
    for (const m of src.matchAll(re)) {
      i += 1;
      const entradas = especiesDaLista(m[2]);
      if (Number(m[1]) === 0) {
        if (entradas.length) throw new Error(`${rotulo} ${tipo}: taxa 0 com ${entradas.length} entradas`);
        continue;
      }
      if (entradas.length !== 10) throw new Error(`${rotulo} ${tipo}#${i}: ${entradas.length} entradas, esperado 10`);
      const chances = {};
      entradas.forEach((mon, k) => { chances[mon] = (chances[mon] || 0) + SLOTS_RB[k]; });
      locais[`${tipo}:${rotulo}#${i}`] = chances;
    }
  }
  return locais;
}

// ---------------------------------------------------------------------------
// Agregacao
// ---------------------------------------------------------------------------
// Por local, a media entre as VERSOES em que aquele local existe (ausente = 0),
// pra nao inflar quem so aparece numa das versoes. Depois, por especie, a media
// entre os locais onde ela aparece: "quando existe encontro aqui, que fatia dele
// e essa especie".
function agregar(observacoes) {
  const porEspecie = {};
  for (const [local, porVersao] of Object.entries(observacoes)) {
    const versoes = Object.keys(porVersao);
    for (const mon of new Set(versoes.flatMap((v) => Object.keys(porVersao[v])))) {
      const soma = versoes.reduce((acc, v) => acc + (porVersao[v][mon] || 0), 0);
      (porEspecie[mon] = porEspecie[mon] || []).push({ local, chance: soma / versoes.length });
    }
  }
  const saida = {};
  for (const [mon, locais] of Object.entries(porEspecie)) {
    saida[norm(mon)] = {
      locais: locais.length,
      mediaChance: Number((locais.reduce((a, l) => a + l.chance, 0) / locais.length).toFixed(2)),
      categorias: [...new Set(locais.map((l) => l.local.split(':')[0]))].sort(),
    };
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Roster do jogo + grafo de evolucao
// ---------------------------------------------------------------------------
// O roster e o National Dex INTEIRO (#1-251), nao so as ~226 especies que hoje
// aparecem em alguma hunt: o catalogo no Postgres tem as 251, e `spawn_tier` e
// NOT NULL — derivar so as spawnaveis deixaria 25 linhas sem tier e a migration
// falharia (aconteceu de verdade na primeira tentativa).
//
// A chave do jogo e o nome da constante do disassembly em minusculo, sem
// nenhuma outra transformacao — inclusive `MR__MIME` -> `mr__mime`, com o
// underscore duplo (a planilha grafa assim e o banco herdou). Uma versao
// anterior "normalizava" `__` -> `_` e gerava `mr_mime`, um id que nao existe
// em lugar nenhum; a checagem contra o arquivo gerado nao pegou porque Mr. Mime
// nao esta entre as ~226 especies spawnaveis. Quem pegou foi o NOT NULL da
// migration.
function lerRoster(constantesAsm) {
  // O arquivo tem mais de um bloco `const_def 1`: depois do dex vem a lista das
  // 26 formas do Unown (UNOWN_A..UNOWN_Z). Sem cortar no `const_skip` que fecha
  // o dex, sairiam 277 "especies".
  const inicio = constantesAsm.indexOf('const_def 1');
  const fim = constantesAsm.indexOf('const_skip', inicio);
  if (inicio < 0 || fim < 0) throw new Error('bloco do dex nao encontrado em pokemon_constants.asm');
  const ids = [...constantesAsm.slice(inicio, fim).matchAll(/^\tconst\s+([A-Z][A-Z0-9_]*)\s*(?:;.*)?$/gm)]
    .map((m) => m[1].toLowerCase());
  const unicos = [...new Set(ids)].sort();
  if (unicos.length !== 251) throw new Error(`esperava 251 especies no dex, achei ${unicos.length}`);

  const gerado = path.join(ROOT, 'web', 'src', 'data', 'generated', 'pokes.generated.ts');
  const conhecidos = new Set([...fs.readFileSync(gerado, 'utf8').matchAll(/^\s{4}"id": "([a-z0-9_]+)"/gm)].map((m) => m[1]));
  const foraDoDex = [...conhecidos].filter((id) => !unicos.includes(id));
  if (foraDoDex.length) throw new Error(`ids do jogo que o dex nao produz: ${foraDoDex.join(', ')}`);
  return unicos;
}

// O grafo NAO pode vir de `SPECIES[].evolvesTo` do dado gerado: a planilha so
// preenche esse campo quando a evolucao e por nivel, entao pedra
// (Growlithe->Arcanine) e troca (Kadabra->Alakazam) ficam de fora e a especie
// final aparece como profundidade 0 — Alakazam sairia tao comum quanto um Pichu.
// evos_attacks.asm tem EVOLVE_LEVEL/ITEM/TRADE/HAPPINESS/STAT, todos.
function lerEvolucoes(asm) {
  const anterior = {};
  const podeEvoluir = new Set();
  for (const m of asm.matchAll(/^(\w+)EvosAttacks:\n((?:\s*db EVOLVE_.*\n)*)/gm)) {
    const de = norm(m[1]);
    for (const e of m[2].matchAll(/^\s*db\s+EVOLVE_\w+\s*,\s*[^,]+\s*,\s*([A-Z0-9_]+)/gm)) {
      anterior[norm(e[1])] = de;
      podeEvoluir.add(de);
    }
  }
  if (Object.keys(anterior).length < 100) {
    throw new Error(`grafo de evolucao suspeito: ${Object.keys(anterior).length} arestas`);
  }
  return { anterior, podeEvoluir };
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('Baixando disassemblies (cache em .cache/pret)...');
  const asm = await baixarTudo();
  const mapasRed = await baixarPokered();

  // --- Gen2 ---------------------------------------------------------------
  const observacoesGsc = {};
  const registrar = (categoria, versao, mapas) => {
    for (const [nome, chances] of Object.entries(mapas)) {
      const chave = `${categoria}:${nome}`;
      (observacoesGsc[chave] = observacoesGsc[chave] || {})[versao] = chances;
    }
  };
  const VERSOES_GSC = [
    { nome: 'crystal', prefixo: 'crystal', defs: { _GOLD: false, _SILVER: false, _CRYSTAL: true } },
    { nome: 'gold', prefixo: 'gold', defs: { _GOLD: true, _SILVER: false, _CRYSTAL: false } },
    { nome: 'silver', prefixo: 'gold', defs: { _GOLD: false, _SILVER: true, _CRYSTAL: false } },
  ];
  for (const v of VERSOES_GSC) {
    for (const regiao of ['johto', 'kanto']) {
      const rotulo = `${v.nome}/${regiao}`;
      registrar('grama', v.nome, parseGramaGsc(preprocessar(asm[`${v.prefixo}-${regiao}-grass.asm`], v.defs), rotulo));
      registrar('agua', v.nome, parseAguaGsc(preprocessar(asm[`${v.prefixo}-${regiao}-water.asm`], v.defs), rotulo));
    }
  }
  // Pesca e headbutt: so o Crystal. As tabelas sao praticamente iguais entre as
  // tres versoes; aqui elas servem pra dar COBERTURA a especies que nao
  // aparecem em grama nem surf, nao pra ranquear entre versoes.
  registrar('pesca', 'crystal', parsePesca(asm['crystal-fish.asm']));
  registrar('arvore', 'crystal', parseArvores(asm['crystal-treemons.asm']));
  const gsc = agregar(observacoesGsc);

  // --- Gen1 ---------------------------------------------------------------
  const observacoesRb = {};
  for (const versao of ['red', 'blue']) {
    const defs = { _RED: versao === 'red', _BLUE: versao === 'blue' };
    for (const [nome, texto] of Object.entries(mapasRed)) {
      for (const [local, chances] of Object.entries(parseGen1(preprocessar(texto, defs), nome))) {
        (observacoesRb[local] = observacoesRb[local] || {})[versao] = chances;
      }
    }
  }
  const rb = agregar(observacoesRb);

  // --- Tiers --------------------------------------------------------------
  const { anterior, podeEvoluir } = lerEvolucoes(asm['crystal-evos-attacks.asm']);
  const profundidade = (id) => {
    let n = 0;
    let atual = norm(id);
    while (anterior[atual] && n < 5) { atual = anterior[atual]; n += 1; }
    return n;
  };
  // Profundidade 0 junta dois grupos bem diferentes: bases que ainda evoluem
  // (Pichu, Togepi, Eevee, Omanyte) e encontros unicos que nunca evoluem
  // (Snorlax, Lapras, Aerodactyl, Sudowoodo, Hitmonlee/chan). Sem separar, um
  // Snorlax spawnaria tao facil quanto um Pichu. O criterio e estrutural — a
  // especie ainda evolui ou nao — nao um julgamento de forca.
  const tierPorRegra = (id) => {
    const p = profundidade(id);
    if (p >= 2) return 'muito_raro';
    if (p === 1) return 'raro';
    return podeEvoluir.has(norm(id)) ? 'incomum' : 'raro';
  };
  const tierPorChance = (c) => TIERS.find((t) => c >= t.minChance).chave;

  const especies = {};
  const contagem = { gsc: 0, rb: 0, regra: 0 };
  for (const id of lerRoster(asm['crystal-pokemon-constants.asm'])) {
    const n = norm(id);
    if (LEGENDARIOS.has(id)) {
      especies[id] = { tier: 'muito_raro', origem: 'regra', nota: 'lendario — so aparece em hunt BOSS' };
      contagem.regra += 1;
    } else if (gsc[n]) {
      const d = gsc[n];
      especies[id] = {
        tier: tierPorChance(d.mediaChance),
        origem: 'gsc',
        chanceMedia: d.mediaChance,
        locais: d.locais,
        nota: `Gen2: ${d.mediaChance}% medio em ${d.locais} local(is) (${d.categorias.join('/')})`,
      };
      contagem.gsc += 1;
    } else if (rb[n]) {
      const d = rb[n];
      especies[id] = {
        tier: tierPorChance(d.mediaChance),
        origem: 'rb',
        chanceMedia: d.mediaChance,
        locais: d.locais,
        nota: `sem encontro no Gen2; Gen1: ${d.mediaChance}% medio em ${d.locais} local(is)`,
      };
      contagem.rb += 1;
    } else {
      const p = profundidade(id);
      const terminal = p === 0 && !podeEvoluir.has(n);
      especies[id] = {
        tier: tierPorRegra(id),
        origem: 'regra',
        nota: `sem encontro selvagem em Gen1/Gen2; regra por estagio evolutivo (profundidade ${p}${terminal ? ', nao evolui' : ''})`,
      };
      contagem.regra += 1;
    }
  }

  fs.writeFileSync(SAIDA, `${JSON.stringify({
    _origem: 'Gerado por scripts/derive-spawn-tiers.js a partir dos disassemblies pret/pokecrystal, pret/pokegold e pret/pokered. Nao editar a mao.',
    _escala: 'O peso espelha a GrassMonProbTable do Gen2 (30/20/10/5/1) — os tiers sao as vagas reais do jogo.',
    tiers: TIERS.map((t) => ({ chave: t.chave, peso: t.peso, minChance: t.minChance === -Infinity ? null : t.minChance })),
    especies,
  }, null, 2)}\n`);

  const porTier = {};
  for (const v of Object.values(especies)) porTier[v.tier] = (porTier[v.tier] || 0) + 1;
  console.log(`\n${Object.keys(especies).length} especies`);
  console.log(`origem: gsc=${contagem.gsc} rb=${contagem.rb} regra=${contagem.regra}`);
  console.log(`tiers:  ${TIERS.map((t) => `${t.chave}=${porTier[t.chave] || 0}`).join(' ')}`);
  console.log(`\nGravado ${path.relative(ROOT, SAIDA)}`);
}

main().catch((err) => {
  console.error(`\nFALHOU: ${err.message}`);
  process.exit(1);
});
