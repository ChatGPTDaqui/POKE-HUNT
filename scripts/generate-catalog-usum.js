// Gera os `src/data/generated/*.ts` a partir do catalogo de Pokemon Ultra Sun
// (`scripts/usum/catalog.json` + `scripts/usum/formulas.json`).
//
// Rodar com: npm run usum:gerar   (offline — nao toca em rede nem no Supabase)
//
// ---------------------------------------------------------------------------
// ESTE E O GERADOR ATUAL. Os dois anteriores estao aposentados:
//
//   scripts/sync-planilha.js       le o .xlsx (dado de Gen2)
//   scripts/generate-catalog.js    le o Postgres (o MESMO dado de Gen2)
//
// O modulo `sync-planilha.js` continua sendo carregado e REUSADO aqui: ele e o
// dono da curadoria de hunts (TYPE_BIOME_PLAN, buildTypeRoster,
// buildTypePoolQueues, buildTypeDrivenHunts) e do emissor (toJsLiteral/
// emitData). Duplicar aquilo garantiria divergencia no primeiro ajuste de
// balanceamento. O que este arquivo troca e so a FONTE do dado de Pokemon.
//
// ---------------------------------------------------------------------------
// O QUE VEM DE ONDE
//
//   Pokemon (stats, tipos, movesets, golpes, tabela de tipos)
//       -> scripts/usum/catalog.json (PokeAPI, resolvido para o Ultra Sun,
//          conferido contra a Bulbapedia por `npm run usum:conferir`)
//   Formulas (dano, EXP, captura, critico, curvas de crescimento)
//       -> scripts/usum/formulas.json (hand-authored, Gen VII)
//   Itens (precos de loja do Ultra Sun, curas de status)
//       -> scripts/usum/items.json (hand-authored). Antes vinha da aba 'Itens'
//          da planilha, com precos de geracoes antigas.
//   A GEOMETRIA das hunts (faixas de nivel dos brackets de Johto, hunt inicial)
//       -> a planilha, via sync-planilha.js. Nao ha equivalente disso nos
//          jogos: brackets e bounds sempre foram conceito deste idle. E a
//          UNICA coisa que ainda sai do .xlsx.
//   Taxa de aparicao (peso de spawn)
//       -> scripts/spawn-tiers.json (Gen1/Gen2). Ver o cabecalho de
//          fetch-usum-catalog.js para a medicao que sustenta essa escolha.
'use strict';

const fs = require('fs');
const path = require('path');
const sync = require('./sync-planilha.js');

const ROOT = path.join(__dirname, '..');
const USUM_DIR = path.join(__dirname, 'usum');

function lerJson(arquivo) {
  if (!fs.existsSync(arquivo)) {
    throw new Error(`${path.relative(ROOT, arquivo)} nao existe — rode "npm run usum:baixar" primeiro.`);
  }
  return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
}

// ---------------------------------------------------------------------------
// Catalogo -> forma de workbook
//
// As funcoes reusadas de sync-planilha.js leem por NOME DE COLUNA da planilha.
// Manter esses nomes (em vez de refatorar as duas pontas) e o que permite
// trocar a fonte sem tocar na curadoria.
// ---------------------------------------------------------------------------
function abaEspecies(catalogo) {
  return catalogo.especies.map((e) => ({
    'Chave': e.chave.toUpperCase(),
    'Nome': e.nome,
    'Nº Pokédex': e.dex,
    'Tipo 1': e.tipo1,
    'Tipo 2': e.tipo2 || '',
    'HP': e.base.hp,
    'Ataque': e.base.atkFis,
    'Ataque Especial': e.base.atkEsp,
    'Defesa': e.base.def,
    'Defesa Especial': e.base.defEsp,
    'Velocidade': e.base.speed,
    'EXP Base': e.baseExp,
    'Taxa de Captura (0-255)': e.catchRate,
    'Curva de Crescimento': e.curva,
    // Peso em hectogramas, direto da PokeAPI (ver fetch-usum-catalog.js).
    'Peso (hg)': e.pesoHg,
    'Evolui Para (chave)': e.evolvesTo ? e.evolvesTo.toUpperCase() : '',
    'Evolui no Nível': e.evolvesAtLevel || '',
  }));
}

function abaGolpes(catalogo) {
  return catalogo.golpes.map((g) => ({
    'Chave': g.chave.toUpperCase(),
    'Nome': g.nome,
    'Tipo': g.tipo,
    // A coluna da planilha so tinha 'físico'/'especial' (a Gen2 decidia a
    // categoria pelo TIPO do golpe). A partir da Gen4 e por GOLPE, e existe
    // uma terceira: status. `syncSpeciesAndMoves` mapeia as tres.
    'Categoria (informativo)': { physical: 'físico', special: 'especial', status: 'status' }[g.categoria],
    'Poder': g.poder,
    'Precisão': g.precisao,
    'PP': g.pp,
    'Alvo': g.alvo,
    // Efeitos. Sem eles todo golpe de status era inerte (184 dos 486 golpes do
    // catalogo anterior) e todo efeito secundario — queimar, paralisar,
    // drenar — simplesmente nao existia.
    'Status': g.status || '',
    'Chance de Status': g.chanceDeStatus,
    'Alvo do Efeito': g.alvoDoEfeito,
    'Mudancas de Stat': g.mudancasDeStat,
    'Chance de Stat': g.chanceDeStat,
    'Chance de Flinch': g.chanceDeFlinch,
    'Estagios de Critico': g.estagiosDeCritico,
    'Dreno %': g.drenoPercentual,
    'Cura %': g.curaPercentual,
  }));
}

function abaMovesets(catalogo) {
  const linhas = [];
  for (const e of catalogo.especies) {
    for (const g of e.golpes) {
      linhas.push({
        'Espécie (chave)': e.chave.toUpperCase(),
        'Golpe (chave)': g.chave.toUpperCase(),
        'Nível': g.nivel,
      });
    }
  }
  return linhas;
}

function abaTabelaDeTipos(catalogo) {
  return catalogo.tipos.map((atk) => {
    const linha = { 'Ataca \\ Defende': atk };
    for (const def of catalogo.tipos) {
      const m = catalogo.tabelaDeTipos[atk] && catalogo.tabelaDeTipos[atk][def];
      if (m == null) throw new Error(`tabela de tipos sem a celula ${atk} x ${def}`);
      linha[def] = m;
    }
    return linha;
  });
}

function abaFormulas(tabela) {
  return tabela.formulas.map((f) => ({
    'Chave': f.chave,
    'Expressão': f.expressao,
    // `syncFormulas` re-divide por virgula e trata 'nenhuma' como vazio.
    'Variáveis disponíveis': f.variaveis && f.variaveis.length ? f.variaveis.join(', ') : 'nenhuma',
    'Descrição': f.descricao || '',
  }));
}

function abaItens(tabela) {
  return tabela.itens.map((i) => ({
    'Chave': i.chave.toUpperCase(),
    'Nome': i.nome,
    'Tipo (kind)': i.tipo,
    'Preço de Compra': i.precoDeCompra,
    'Multiplicador de Captura': i.multiplicadorDeCaptura,
    'Cura de HP': i.curaDeHp,
    'Cura % (revive)': i.curaPercentual,
    'Cura de Status': Array.isArray(i.cura) ? i.cura.join(', ') : '',
  }));
}

// ---------------------------------------------------------------------------
function pesosDeSpawn() {
  const { tiers, especies } = lerJson(path.join(__dirname, 'spawn-tiers.json'));
  const pesoPorTier = Object.fromEntries(tiers.map((t) => [t.chave, t.peso]));
  const pesos = {};
  for (const [id, info] of Object.entries(especies)) {
    const peso = pesoPorTier[info.tier];
    if (peso == null) throw new Error(`tier desconhecido em spawn-tiers.json: ${info.tier} (${id})`);
    pesos[id] = peso;
  }
  return pesos;
}

function main() {
  const catalogo = lerJson(path.join(USUM_DIR, 'catalog.json'));
  const formulas = lerJson(path.join(USUM_DIR, 'formulas.json'));
  const itens = lerJson(path.join(USUM_DIR, 'items.json'));
  const status = lerJson(path.join(USUM_DIR, 'status.json'));

  console.log(`Catalogo Ultra Sun: ${catalogo.especies.length} especies, ${catalogo.golpes.length} golpes, ${catalogo.tipos.length} tipos.\n`);

  if (!fs.existsSync(sync.XLSX_PATH)) {
    throw new Error(
      `A planilha (${path.relative(ROOT, sync.XLSX_PATH)}) ainda e necessaria para a GEOMETRIA das hunts ` +
      '(faixas de nivel dos brackets de Johto e hunt inicial) — nada de Pokemon vem dela.'
    );
  }
  const planilha = sync.readWorkbook(sync.XLSX_PATH);

  const workbook = {
    'Espécies': abaEspecies(catalogo),
    'Golpes': abaGolpes(catalogo),
    'Movesets': abaMovesets(catalogo),
    'Itens': abaItens(itens),
    'TabelaDeTipos': abaTabelaDeTipos(catalogo),
    'Fórmulas': abaFormulas(formulas),
    // Geometria: usadas so por pickTopHunts/computeJohtoBrackets.
    'Locais_Info': planilha['Locais_Info'],
    'Encontros': planilha['Encontros'],
  };

  sync.syncFormulas(workbook);
  sync.syncTypeChart(workbook);
  sync.syncItemsFull(workbook);
  sync.syncStatus(status);

  const { starter, brackets: johtoBrackets } = sync.computeJohtoBrackets(sync.pickTopHunts(workbook, sync.HUNT_COUNT));
  const brackets = [...johtoBrackets, ...sync.KANTO_BRACKETS];
  const roster = sync.buildTypeRoster(workbook);
  const hunts = [starter, ...sync.buildTypeDrivenHunts(brackets, roster)];

  sync.syncSpeciesAndMoves(workbook, hunts);
  // Depois de `syncSpeciesAndMoves` de proposito: so as especies que de fato
  // entraram no jogo (o elenco e menor que o dex 1-251 do catalogo) recebem
  // atribuicao de habilidade, senao o bundle carregaria linha para especie que
  // nao existe em lugar nenhum.
  sync.syncTraits(catalogo, new Set(Object.keys(
    JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'generated', 'pokes.generated.ts'), 'utf8')
      .replace(/^[\s\S]*?SPECIES_DATA: SpeciesData = /, '')
      .replace(/;\s*$/, ''))
  )));
  sync.syncMapsAndEncounters(hunts, pesosDeSpawn());
  sync.reportTypeCoverage(hunts, roster);

  console.log('\nCatalogo gerado a partir dos dados de Pokemon Ultra Sun.');
}

try {
  main();
} catch (err) {
  console.error(`\nFALHOU: ${err.message}`);
  process.exit(1);
}
