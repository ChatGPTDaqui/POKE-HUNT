// Baixa e grava o dado das MAQUINAS (TM/HM) — PH-512.
//
// Saida: `scripts/usum/maquinas.json`, a FONTE de tudo que o sistema de
// Maquinas precisa saber sobre golpes. Nada aqui vira `.generated.ts` ainda:
// esta fatia existe pra decidir o ESCOPO da feature (quantas Maquinas o motor
// consegue honrar de verdade) antes de uma linha de schema.
//
// POR QUE UM SCRIPT PROPRIO, E NAO MAIS UM PEDACO DO `fetch-usum-catalog.js`
// -----------------------------------------------------------------------------
// Aquele script produz `catalog.json`, que alimenta `pokes.generated.ts` e
// `abilities.generated.ts` — o dado que vai pro BUNDLE do jogador e pro bundle
// da Edge. A matriz de compatibilidade de Maquina nao pertence a nenhum dos
// dois (ver o cabecalho de `golpesDeMaquinaNoVersionGroup`), e misturar as duas
// saidas faria toda mudanca aqui reemitir aquilo.
//
// AS DUAS FONTES, E POR QUE SAO DUAS
// -----------------------------------------------------------------------------
// TM sai do version group `ultra-sun-ultra-moon`, que e a regra pedida.
//
// HM NAO EXISTE NO ULTRA SUN. A Gen VII eliminou as HMs e as trocou pelo Poke
// Ride; das nove HMs de Gen I-III, tres sobreviveram la como TM numerada (Fly,
// Surf, Waterfall) e seis nao tem maquina nenhuma. Entao a compatibilidade das
// HMs sai de `emerald` (oito delas) e de `crystal` (Whirlpool, que so a Gen II
// tem). Sao dados de geracao diferente convivendo de proposito, e o `json`
// grava a fonte de cada um pra ninguem descobrir isso por acidente depois.
//
// A NUMERACAO DAS HMs E NOSSA, E ISSO NAO E PREGUICA
// -----------------------------------------------------------------------------
// Nao existe numeracao Gen I-III consistente: HM06 e Rock Smash em `emerald` e
// Whirlpool em `crystal` (conferido na API, nao suposto). Qualquer tentativa de
// "manter a numeracao original" tem que escolher uma geracao e mentir sobre a
// outra. Entao sao nove slots numerados aqui, na ordem canonica de Gen III com
// Whirlpool no fim, e o numero e nosso.
'use strict';

const fs = require('fs');
const path = require('path');
const api = require('./lib/pokeapi.js');

const OUT = path.join(__dirname, 'usum', 'maquinas.json');
const CATALOGO_DO_MOTOR = path.join(__dirname, '..', 'src', 'data', 'generated', 'abilities.generated.ts');

// O recorte do jogo. Espelha `DEX_MAX_PADRAO` de `fetch-usum-catalog.js`; nao e
// parametrizavel aqui de proposito, porque uma matriz com outro recorte nao
// serve pra nada neste repo.
const DEX_MAX = 386;

const VG_USUM = 'ultra-sun-ultra-moon';
const VG_HM_GEN3 = 'emerald';
const VG_HM_GEN2 = 'crystal';

/** As nove HMs de Gen I-III, na nossa numeracao. Ver o cabecalho. */
const HMS = [
  { n: 1, item: 'hm01', vg: VG_HM_GEN3 }, // cut
  { n: 2, item: 'hm02', vg: VG_HM_GEN3 }, // fly
  { n: 3, item: 'hm03', vg: VG_HM_GEN3 }, // surf
  { n: 4, item: 'hm04', vg: VG_HM_GEN3 }, // strength
  { n: 5, item: 'hm05', vg: VG_HM_GEN3 }, // flash
  { n: 6, item: 'hm06', vg: VG_HM_GEN3 }, // rock-smash
  { n: 7, item: 'hm07', vg: VG_HM_GEN3 }, // waterfall
  { n: 8, item: 'hm08', vg: VG_HM_GEN3 }, // dive
  { n: 9, item: 'hm06', vg: VG_HM_GEN2 }, // whirlpool — so a Gen II tem
];

/**
 * O golpe que uma maquina ensina, num version group.
 *
 * `/item/tm01` traz um array `machines` com uma entrada por version group; a
 * entrada aponta pra `/machine/N`, que e quem sabe o golpe. Sao 2 requests por
 * maquina, contra os 2.372 de varrer `/machine` inteiro procurando as do USUM.
 */
async function golpeDaMaquina(nomeDoItem, versionGroup) {
  const item = await api.getJson(`${api.BASE}/item/${nomeDoItem}`);
  if (!item) return null;
  const entrada = (item.machines || []).find((m) => m.version_group.name === versionGroup);
  if (!entrada) return null;
  const maquina = await api.getJson(entrada.machine.url);
  return maquina ? maquina.move.name : null;
}

/** As chaves de golpe que o motor ja sabe executar hoje. */
function golpesDoMotor() {
  const fonte = fs.readFileSync(CATALOGO_DO_MOTOR, 'utf8');
  return new Set([...fonte.matchAll(/^ {2}"([a-z0-9_]+)": \{/gm)].map((m) => m[1]));
}

async function main() {
  console.log(`Maquinas: recorte dex 1-${DEX_MAX}, TM de ${VG_USUM}, HM de ${VG_HM_GEN3}/${VG_HM_GEN2}.`);

  // --- 1. numero -> golpe -------------------------------------------------
  const numerosDeTm = Array.from({ length: 100 }, (_, i) => String(i + 1).padStart(2, '0'));
  const golpesDeTm = await api.emParalelo(numerosDeTm, 12, (nn) => golpeDaMaquina(`tm${nn}`, VG_USUM));
  const tms = [];
  numerosDeTm.forEach((nn, i) => {
    if (!golpesDeTm[i]) return;
    tms.push({ numero: i + 1, golpe: api.chaveDeGolpe(golpesDeTm[i]), api: golpesDeTm[i] });
  });
  if (tms.length !== 100) {
    throw new Error(`esperava 100 TMs no ${VG_USUM}, vieram ${tms.length} — a API mudou de forma`);
  }

  const golpesDeHm = await api.emParalelo(HMS, 6, (h) => golpeDaMaquina(h.item, h.vg));
  const hms = HMS.map((h, i) => {
    if (!golpesDeHm[i]) throw new Error(`HM ${h.n} (${h.item} em ${h.vg}) nao resolveu golpe`);
    return { numero: h.n, golpe: api.chaveDeGolpe(golpesDeHm[i]), api: golpesDeHm[i], fonte: h.vg, itemOriginal: h.item };
  });
  const golpesDeHmUnicos = new Set(hms.map((h) => h.golpe));
  if (golpesDeHmUnicos.size !== 9) {
    throw new Error(`esperava 9 golpes de HM distintos, vieram ${golpesDeHmUnicos.size}`);
  }

  // --- 2. compatibilidade por especie -------------------------------------
  const dexes = Array.from({ length: DEX_MAX }, (_, i) => i + 1);
  const pokemons = await api.emParalelo(dexes, 12, (n) => api.getJson(`${api.BASE}/pokemon/${n}`));
  // A CHAVE SAI DE `/pokemon-species`, E NAO DE `/pokemon`.
  //
  // `/pokemon/386` e a FORMA e se chama `deoxys-normal`; a especie se chama
  // `deoxys`, que e a chave que o jogo usa. Uma chave so, e ela nao produz erro
  // nenhum — a matriz simplesmente ficaria com um `deoxys_normal` que ninguem
  // consulta e o Deoxys sem Maquina nenhuma pra sempre. Pego por
  // `src/data/maquinasDoCatalogo.test.ts` na primeira execucao; `fetch-usum-
  // catalog.js` ja buscava os dois endpoints exatamente por isto.
  const especiesApi = await api.emParalelo(dexes, 12, (n) => api.getJson(`${api.BASE}/pokemon-species/${n}`));

  const golpePorNumeroTm = new Map(tms.map((t) => [t.golpe, t.numero]));
  const golpePorNumeroHm = new Map(hms.map((h) => [h.golpe, h.numero]));

  const especies = {};
  pokemons.forEach((p, i) => {
    if (!p) return;
    const especieApi = especiesApi[i];
    if (!especieApi) throw new Error(`dex ${dexes[i]}: /pokemon veio mas /pokemon-species nao`);
    const chave = api.chaveDeEspecie(especieApi.name);

    const porUsum = api.golpesDeMaquinaNoVersionGroup(p, VG_USUM).map(api.chaveDeGolpe);
    // HM: a uniao das duas fontes de Gen anterior, filtrada pelos nove golpes
    // que nos interessam. Uma especie que aprende Surf por maquina no `emerald`
    // conta, mesmo que no USUM ela aprenda o mesmo golpe como TM94 — sao
    // perguntas diferentes e as duas listas convivem.
    const porGen3 = api.golpesDeMaquinaNoVersionGroup(p, VG_HM_GEN3).map(api.chaveDeGolpe);
    const porGen2 = api.golpesDeMaquinaNoVersionGroup(p, VG_HM_GEN2).map(api.chaveDeGolpe);

    const tm = [...new Set(porUsum.map((g) => golpePorNumeroTm.get(g)).filter((n) => n != null))].sort((a, b) => a - b);
    const hm = [...new Set([...porGen3, ...porGen2].map((g) => golpePorNumeroHm.get(g)).filter((n) => n != null))].sort((a, b) => a - b);

    especies[chave] = { dex: p.id, tm, hm };
  });

  // --- 3. o relatorio que decide o escopo ---------------------------------
  const doMotor = golpesDoMotor();
  const tmSemGolpe = tms.filter((t) => !doMotor.has(t.golpe));
  const hmSemGolpe = hms.filter((h) => !doMotor.has(h.golpe));

  const chaves = Object.keys(especies);
  const paresTm = chaves.reduce((s, k) => s + especies[k].tm.length, 0);
  const paresHm = chaves.reduce((s, k) => s + especies[k].hm.length, 0);
  const semNenhuma = chaves.filter((k) => !especies[k].tm.length && !especies[k].hm.length);

  const saida = {
    _fonte: `PokeAPI v2. TM do version group "${VG_USUM}"; HM de "${VG_HM_GEN3}" e "${VG_HM_GEN2}".`,
    _regra: 'HM nao existe no Ultra Sun (a Gen VII a trocou pelo Poke Ride). A numeracao das nove HMs e NOSSA: HM06 e Rock Smash no emerald e Whirlpool no crystal, entao nao ha numeracao Gen I-III consistente pra herdar.',
    _gerador: 'npm run maquinas:gerar (scripts/gerar-maquinas.js)',
    _recorte: `dex 1-${DEX_MAX}`,
    tms,
    hms,
    especies,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(saida, null, 2) + '\n');

  const cache = api.estatisticasDeCache();
  console.log('');
  console.log(`  ${tms.length} TMs e ${hms.length} HMs resolvidas.`);
  console.log(`  ${chaves.length} especies, ${paresTm} pares TM e ${paresHm} pares HM.`);
  console.log(`  densidade TM: ${((paresTm / (chaves.length * tms.length)) * 100).toFixed(1)}%`);
  console.log('');
  console.log(`  GOLPES QUE O MOTOR JA TEM: ${tms.length - tmSemGolpe.length}/${tms.length} TM, ${hms.length - hmSemGolpe.length}/${hms.length} HM.`);
  if (tmSemGolpe.length) {
    console.log(`  TM sem golpe no motor (${tmSemGolpe.length}): ${tmSemGolpe.map((t) => `TM${t.numero} ${t.golpe}`).join(', ')}`);
  }
  if (hmSemGolpe.length) {
    console.log(`  HM sem golpe no motor (${hmSemGolpe.length}): ${hmSemGolpe.map((h) => `HM${h.numero} ${h.golpe}`).join(', ')}`);
  }
  if (semNenhuma.length) {
    console.log(`  especies sem NENHUMA maquina (${semNenhuma.length}): ${semNenhuma.join(', ')}`);
  }
  console.log('');
  console.log(`  cache: ${cache.cache} acertos, ${cache.rede} da rede`);
  console.log(`  escrito em ${path.relative(path.join(__dirname, '..'), OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
