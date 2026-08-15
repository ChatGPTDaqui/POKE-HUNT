// Confere os LEARNSETS de `scripts/usum/catalog.json` (PokeAPI) contra a
// BULBAPEDIA.
//
// Rodar com: npm run usum:learnsets
//
// POR QUE ESTE ARQUIVO EXISTE SEPARADO DE verify-usum-bulbapedia.js
//
// Aquele confere base stats, tipos, catch rate, curva de exp e tabela de tipos
// — tudo que cabe numa LISTA unica da Bulbapedia. Learnset nao cabe: e uma
// pagina por especie. Sao 251 buscas, entao vive num comando proprio, com cache
// em disco, pra nao pesar no `usum:conferir` do dia a dia.
//
// E foi exatamente a lacuna que deixou passar o relato "Typhlosion tem golpes
// fortes demais no nivel 1". A conferencia mostrou que o CATALOGO esta certo
// (Eruption no nivel 1 e real no Ultra Sun, e um bloco de golpes rememoraveis);
// o defeito estava em como o jogo escolhia os 4 golpes. Sem esta verificacao
// nao daria pra separar as duas coisas com confianca.
//
// As paginas sao lidas como WIKITEXTO CRU (`action=raw`), no mesmo molde do
// outro verificador: os dados vivem em `{{learnlist/level7|NIVEL|Golpe|...}}`,
// que e estavel, enquanto o HTML renderizado muda com o tema do wiki. Nenhuma
// pagina e escrita — so leitura.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CATALOGO = path.join(__dirname, 'usum', 'catalog.json');
const CACHE_DIR = path.join(__dirname, '.cache', 'bulbapedia-learnsets');
const UA = 'novo-poke-idle catalog cross-check (uso pessoal, somente leitura)';

// Intervalo entre buscas NAO cacheadas. A Bulbapedia e um wiki comunitario sem
// CDN pesado; 251 requisicoes em rajada seriam abuso. Com cache em disco, o
// custo so existe na primeira execucao.
const ESPERA_MS = 350;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function wikitexto(titulo) {
  // O hash NAO e decoracao: "Nidoran♀" e "Nidoran♂" colapsam no mesmo nome de
  // arquivo quando se troca todo caractere fora de [a-z0-9] por "_". Sem ele, a
  // primeira das duas era cacheada e a segunda lia a pagina da outra — o
  // verificador acusava o learnset inteiro do macho como divergente, e a causa
  // era o cache, nao o catalogo.
  const hash = crypto.createHash('sha1').update(titulo).digest('hex').slice(0, 8);
  const arquivo = path.join(CACHE_DIR, `${titulo.replace(/[^a-z0-9]+/gi, '_')}-${hash}.wiki`);
  if (fs.existsSync(arquivo)) return fs.readFileSync(arquivo, 'utf8');

  await dormir(ESPERA_MS);
  const url = `https://bulbapedia.bulbagarden.net/w/index.php?title=${encodeURIComponent(titulo)}&action=raw`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 404) return null;
  if (res.status >= 400) throw new Error(`Bulbapedia ${titulo}: ${res.status}`);
  const texto = await res.text();
  const redirect = texto.match(/^#REDIRECT\s*\[\[([^\]]+)\]\]/i);
  if (redirect) return wikitexto(redirect[1].split('#')[0]);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(arquivo, texto);
  return texto;
}

// Comparacao por nome NORMALIZADO, nao por chave. A PokeAPI usa hifen
// (`double-edge`, `will-o-wisp`) e a Bulbapedia usa a grafia do jogo
// (`Double-Edge`, `Will-O-Wisp`); e ha casos historicos de espacamento
// (`AncientPower` virou `Ancient Power`). Jogar fora tudo que nao e letra ou
// digito faz os dois lados caírem no mesmo texto sem tabela de excecoes.
const normalizar = (nome) => nome.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Os golpes de nivel da secao "By leveling up" da pagina de Gen VII.
 *
 * So o PRIMEIRO bloco (`learnlist/levelh/7` ate `learnlist/levelf/7`) e lido.
 * Isso importa: especies com forma de Alola (Raichu, Vulpix, Marowak...) trazem
 * um segundo bloco na mesma pagina, e o catalogo do jogo usa a forma padrao.
 * Ler a pagina inteira misturaria as duas.
 */
function golpesDeNivel(wiki) {
  const inicio = wiki.indexOf('{{learnlist/levelh/7');
  if (inicio < 0) return null;
  const fim = wiki.indexOf('{{learnlist/levelf/7', inicio);
  // A celula de nivel pode ser um template com pipes dentro
  // (`{{tt|Evo.|Learned upon evolving}}`), que quebraria o split por pipe e
  // faria "Evo." ser lido como NOME de golpe. Desembrulha antes.
  const bloco = wiki
    .slice(inicio, fim < 0 ? wiki.length : fim)
    .replace(/\{\{tt\|([^|}]*)\|[^}]*\}\}/g, '$1');

  const golpes = [];

  // Formato de UMA coluna de nivel: a especie tem o mesmo learnset em SM e
  // USUM. `{{learnlist/level7|NIVEL|Golpe|...}}`.
  for (const m of bloco.matchAll(/\{\{learnlist\/level7\|([^|]*)\|([^|]*)\|/g)) {
    const nivelCru = m[1].trim();
    // Alguns golpes vem com nivel em texto (`Evo.`, `—`). Tratados como 1, que
    // e o que o proprio catalogo faz com o nivel 0 da PokeAPI.
    const nivel = /^\d+$/.test(nivelCru) ? Number(nivelCru) : 1;
    const campos = m[0].split('|');
    golpes.push({ nome: normalizar(m[2]), nivel, poder: numero(campos[5]), precisao: numero(campos[6]) });
  }
  if (golpes.length) return golpes;

  // Formato de DUAS colunas: a especie APRENDE DIFERENTE em Sun/Moon e em Ultra
  // Sun/Ultra Moon, e a tabela traz as duas. `{{learnlist/levelVII|SM|USUM|Golpe|...}}`,
  // com o cabecalho declarando a ordem das colunas no fim: `...|SM|USUM}}`.
  //
  // Ler a coluna errada aqui seria pior que nao conferir nada: daria um "tudo
  // certo" com os niveis do jogo errado. Por isso a coluna e descoberta pelo
  // cabecalho, nao fixada em 2.
  const cabecalho = bloco.match(/\{\{learnlist\/levelh\/7\|([^}]*)\}\}/);
  const versoes = (cabecalho ? cabecalho[1].split('|').map((p) => p.trim()) : [])
    .filter((p) => /^(SM|USUM)$/i.test(p));
  const coluna = versoes.findIndex((v) => /^USUM$/i.test(v));
  if (coluna < 0) return null;

  for (const m of bloco.matchAll(/\{\{learnlist\/levelVII\|([^}]*)\}\}/g)) {
    const partes = m[1].split('|').map((p) => p.trim());
    const nivelCru = partes[coluna];
    const nome = partes[versoes.length];
    // `N/A` = a especie NAO aprende esse golpe por nivel neste jogo. E o ponto
    // inteiro de existirem duas colunas.
    if (!nome || /^N\/A$/i.test(nivelCru)) continue;
    golpes.push({
      nome: normalizar(nome),
      nivel: /^\d+$/.test(nivelCru) ? Number(nivelCru) : 1,
      poder: numero(partes[versoes.length + 3]),
      precisao: numero(partes[versoes.length + 4]),
    });
  }
  return golpes;
}

/**
 * Celula numerica da tabela.
 *
 * O travessao (`—`) aparece em duas situacoes DIFERENTES e nao da pra separar
 * pela celula sozinha: poder variavel (Gyro Ball, Seismic Toss) e "nunca erra"
 * (Swift, Aerial Ace). Nos dois a comparacao e pulada — `null` aqui significa
 * "a wiki nao publica um numero", nao "zero".
 */
function numero(celula) {
  const t = (celula || '').trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

// Titulo da pagina a partir do nome em ingles do catalogo. Nidoran vem com o
// simbolo de genero na Bulbapedia; o resto e literal.
function tituloDaPagina(nome) {
  return `${nomeDeArtigo(nome)} (Pokémon)/Generation VII learnset`;
}

function tituloDaFicha(nome) {
  return `${nomeDeArtigo(nome)} (Pokémon)`;
}

function nomeDeArtigo(nome) {
  const especial = { 'Nidoran-f': 'Nidoran♀', 'Nidoran-m': 'Nidoran♂' };
  // A PokeAPI devolve "Farfetch’d" com apostrofo tipografico (U+2019); a
  // Bulbapedia titula com o apostrofo reto. Sem isto a pagina da 404 e a
  // especie sai da conferencia em silencio.
  return (especial[nome] || nome).replace(/’/g, "'");
}

// Uma diferenca de nivel so conta se mudar QUANDO o golpe fica disponivel. Um
// golpe listado nos dois lados com o mesmo conjunto de niveis esta certo,
// independente da ordem em que aparece.
function comparar(catalogo, wiki) {
  const porNome = (lista) => {
    const m = new Map();
    for (const g of lista) {
      const chave = g.nome;
      if (!m.has(chave)) m.set(chave, new Set());
      m.get(chave).add(g.nivel);
    }
    return m;
  };
  const a = porNome(catalogo);
  const b = porNome(wiki);
  const problemas = [];

  for (const [nome, niveis] of a) {
    if (!b.has(nome)) { problemas.push(`sobrando no catalogo: ${nome} (niveis ${[...niveis].join(',')})`); continue; }
    const outros = b.get(nome);
    const soA = [...niveis].filter((n) => !outros.has(n));
    const soB = [...outros].filter((n) => !niveis.has(n));
    if (soA.length || soB.length) {
      problemas.push(`${nome}: catalogo ${[...niveis].sort((x, y) => x - y).join(',')} vs bulbapedia ${[...outros].sort((x, y) => x - y).join(',')}`);
    }
  }
  for (const nome of b.keys()) {
    if (!a.has(nome)) problemas.push(`faltando no catalogo: ${nome} (niveis ${[...b.get(nome)].join(',')})`);
  }
  return problemas;
}

async function main() {
  const catalogo = JSON.parse(fs.readFileSync(CATALOGO, 'utf8'));
  const nomeDoGolpe = Object.fromEntries(catalogo.golpes.map((g) => [g.chave, normalizar(g.nome)]));

  const soEspecie = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const especies = soEspecie.length
    ? catalogo.especies.filter((e) => soEspecie.includes(e.chave))
    : catalogo.especies;

  // Poder e precisao sao propriedade do GOLPE, nao da especie: o mesmo golpe
  // aparece na tabela de dezenas de Pokemon. Coletados num mapa e conferidos uma
  // vez so no fim, senao o mesmo erro seria reportado 40 vezes.
  const daWikiPorGolpe = new Map();
  const doCatalogoPorNome = new Map(
    catalogo.golpes.map((g) => [normalizar(g.nome), { chave: g.chave, poder: g.poder, precisao: g.precisao }]),
  );

  let ok = 0;
  const semPagina = [];
  const divergentes = [];

  for (const especie of especies) {
    const titulo = tituloDaPagina(especie.nome);
    const wiki = await wikitexto(titulo);
    if (!wiki) { semPagina.push(especie.chave); continue; }

    const daWiki = golpesDeNivel(wiki);
    if (!daWiki) { semPagina.push(`${especie.chave} (sem bloco de nivel)`); continue; }

    for (const g of daWiki) if (!daWikiPorGolpe.has(g.nome)) daWikiPorGolpe.set(g.nome, g);

    const doCatalogo = especie.golpes.map((g) => ({ nome: nomeDoGolpe[g.chave] || normalizar(g.chave), nivel: g.nivel }));
    const problemas = comparar(doCatalogo, daWiki);
    if (problemas.length) divergentes.push({ especie: especie.chave, problemas });
    else ok++;
  }

  // BASE EXP — a lacuna que verify-usum-bulbapedia.js declara explicitamente
  // ("a Bulbapedia nao publica uma lista dessa coluna por geracao, so a ficha de
  // cada especie"). Aqui ja se busca uma pagina por especie, entao buscar a
  // ficha junto e barato — e este numero e a entrada direta da formula de XP por
  // abate (`EXP_GAIN`, progressionSystem.ts). Errado aqui, todo o XP do jogo sai
  // errado sem nenhum sintoma alem de "parece lento demais".
  //
  // A ficha da Bulbapedia traz o valor ATUAL, nao o da Gen VII — mesmo problema
  // do nome "Vise Grip". Onde os dois discordam por isso, a excecao fica aqui
  // com a citacao, em vez de o verificador ficar vermelho pra sempre ou o
  // catalogo ser "corrigido" pra um numero de outro jogo.
  const EXP_ATUAL_DIFERE_DA_GEN_VII = {
    // "As of Generation VIII, its base experience yield is 635" (a propria
    // ficha da Bulbapedia). Na Gen V-VII o valor e 608, que e o do catalogo.
    blissey: 635,
  };
  const expErrados = [];
  for (const especie of especies) {
    const ficha = await wikitexto(tituloDaFicha(especie.nome));
    if (!ficha) { expErrados.push(`${especie.chave}: ficha nao encontrada`); continue; }
    const m = ficha.match(/\|\s*expyield\s*=\s*(\d+)/i);
    if (!m) { expErrados.push(`${especie.chave}: ficha sem expyield`); continue; }
    if (Number(m[1]) === EXP_ATUAL_DIFERE_DA_GEN_VII[especie.chave]) continue;
    if (Number(m[1]) !== especie.baseExp) {
      expErrados.push(`${especie.chave}: baseExp ${especie.baseExp} no catalogo, ${m[1]} na bulbapedia`);
    }
  }

  const golpesErrados = [];
  for (const [nome, daWiki] of daWikiPorGolpe) {
    const doCatalogo = doCatalogoPorNome.get(nome);
    if (!doCatalogo) continue;
    if (daWiki.poder != null && doCatalogo.poder !== daWiki.poder) {
      golpesErrados.push(`${doCatalogo.chave}: poder ${doCatalogo.poder} no catalogo, ${daWiki.poder} na bulbapedia`);
    }
    // Precisao nao publicada (`—`) e "nunca erra". O catalogo guarda 100, que da
    // no mesmo em combate (`golpeErrou` so sorteia abaixo de 100), entao nao e
    // divergencia — por isso a comparacao so roda quando a wiki traz numero.
    if (daWiki.precisao != null && doCatalogo.precisao !== daWiki.precisao) {
      golpesErrados.push(`${doCatalogo.chave}: precisao ${doCatalogo.precisao} no catalogo, ${daWiki.precisao} na bulbapedia`);
    }
  }

  console.log(`\nlearnsets — conferidos: ${especies.length}   iguais: ${ok}   divergentes: ${divergentes.length}   sem pagina: ${semPagina.length}`);
  console.log(`poder/precisao — golpes conferidos: ${daWikiPorGolpe.size}   divergentes: ${golpesErrados.length}`);
  console.log(`base exp — especies conferidas: ${especies.length}   divergentes: ${expErrados.length}`);
  for (const e of expErrados) console.log(`  ${e}`);
  if (semPagina.length) console.log(`sem pagina: ${semPagina.join(', ')}`);

  for (const d of divergentes) {
    console.log(`\n${d.especie}:`);
    for (const p of d.problemas) console.log(`  ${p}`);
  }
  if (golpesErrados.length) {
    console.log('\npoder/precisao divergentes:');
    for (const g of golpesErrados) console.log(`  ${g}`);
  }

  process.exit(divergentes.length || golpesErrados.length || expErrados.length ? 1 : 0);
}

main().catch((erro) => { console.error(erro); process.exit(1); });
