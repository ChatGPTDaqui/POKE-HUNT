// Confere `scripts/usum/catalog.json` (PokeAPI) contra a BULBAPEDIA.
//
// Rodar com: npm run usum:conferir
//
// POR QUE ISTO EXISTE
//
// A PokeAPI e derivada dos jogos, mas nao e infalivel — e, principalmente, o
// endpoint `/pokemon` devolve o dado ATUAL, nao o do Ultra Sun. A resolucao
// por versao (scripts/lib/pokeapi.js) e a parte mais facil de errar em
// silencio da migracao inteira: um erro la nao lanca nada, so deixa o jogo com
// numero de outra geracao. Uma segunda fonte independente e a unica forma de
// pegar isso.
//
// As paginas sao lidas como WIKITEXTO CRU (`action=raw`), nao como HTML: os
// dados vivem em templates (`{{lop/base|...}}`, `{{ndex|...}}`), que sao
// estaveis e faceis de parsear, enquanto o HTML renderizado muda com o tema do
// wiki. Nenhuma pagina e escrita — so leitura.
//
// O que e conferido, e contra qual pagina:
//
//   base stats     List of Pokémon by base stats in Generation VII  (Gen7!)
//   tipos          List of Pokémon by National Pokédex number
//   catch rate     List of Pokémon by catch rate
//   curva de exp   List of Pokémon by experience type
//   type chart     Type  (a tabela "Generation VI onward")
//
// `base_experience` NAO e conferido: a Bulbapedia nao publica uma lista dessa
// coluna por geracao, so a ficha de cada especie. Fica registrado como lacuna
// conhecida em vez de uma conferencia falsa.
'use strict';

const fs = require('fs');
const path = require('path');

const CATALOGO = path.join(__dirname, 'usum', 'catalog.json');
const CACHE_DIR = path.join(__dirname, '.cache', 'bulbapedia');
const UA = 'novo-poke-idle catalog cross-check (uso pessoal, somente leitura)';

async function wikitexto(titulo) {
  const arquivo = path.join(CACHE_DIR, `${titulo.replace(/[^a-z0-9]+/gi, '_')}.wiki`);
  if (fs.existsSync(arquivo)) return fs.readFileSync(arquivo, 'utf8');
  const url = `https://bulbapedia.bulbagarden.net/w/index.php?title=${encodeURIComponent(titulo)}&action=raw`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status >= 400) throw new Error(`Bulbapedia ${titulo}: ${res.status}`);
  let texto = await res.text();
  const redirect = texto.match(/^#REDIRECT\s*\[\[([^\]]+)\]\]/i);
  if (redirect) return wikitexto(redirect[1].split('#')[0]);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(arquivo, texto);
  return texto;
}

// A ordem das linhas/colunas da tabela de tipos da Bulbapedia e a ordem DOS
// JOGOS (Normal, Lutador, Voador, ...), diferente da ordem do nosso catalogo.
// Escrita aqui explicitamente porque e ela que da sentido as 18 celulas de
// cada linha — derivar do cabecalho exigiria parsear os icones.
const ORDEM_BULBAPEDIA = [
  'NORMAL', 'FIGHTING', 'FLYING', 'POISON', 'GROUND', 'ROCK', 'BUG', 'GHOST',
  'STEEL', 'FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'PSYCHIC', 'ICE', 'DRAGON',
  'DARK', 'FAIRY',
];

const CURVA_BULBAPEDIA = {
  'Medium Fast': 'MEDIUM_FAST',
  'Medium Slow': 'MEDIUM_SLOW',
  Fast: 'FAST',
  Slow: 'SLOW',
  Erratic: 'ERRATIC',
  Fluctuating: 'FLUCTUATING',
};

async function main() {
  const catalogo = JSON.parse(fs.readFileSync(CATALOGO, 'utf8'));
  const porDex = new Map(catalogo.especies.map((e) => [e.dex, e]));
  const problemas = [];
  const conferidos = { stats: 0, tipos: 0, catchRate: 0, curva: 0, chart: 0 };

  // --- base stats (pagina especifica da Gen VII) --------------------------
  {
    const txt = await wikitexto('List of Pokémon by base stats in Generation VII');
    const re = /\{\{lop\/base\|game=7\|(\d+)\|([^|}]+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)\}\}/g;
    for (const m of txt.matchAll(re)) {
      const dex = Number(m[1]);
      const esp = porDex.get(dex);
      if (!esp) continue;
      const esperado = {
        hp: Number(m[3]), atkFis: Number(m[4]), def: Number(m[5]),
        atkEsp: Number(m[6]), defEsp: Number(m[7]), speed: Number(m[8]),
      };
      for (const [k, v] of Object.entries(esperado)) {
        if (esp.base[k] !== v) problemas.push(`${esp.chave}: base.${k} = ${esp.base[k]}, Bulbapedia (Gen7) diz ${v}`);
      }
      conferidos.stats++;
    }
  }

  // --- tipos --------------------------------------------------------------
  {
    const txt = await wikitexto('List of Pokémon by National Pokédex number');
    // `|forms=N` aparece em toda especie que ganhou forma regional depois
    // (Rattata, Raichu, Vulpix, ...). So o template `{{ndex|...}}` (forma
    // base) e lido; `{{ndex/form|...}}` — a linha da forma de Alola, que tem
    // OUTROS tipos — e ignorado de proposito: este jogo nao tem formas
    // regionais, e casar com ela trocaria o tipo da especie base.
    const re = /\{\{ndex\|(\d{4})\|([^|}]+)\|([A-Za-z]+)(?:\|([A-Za-z]+))?(?:\|forms=\d+)?\}\}/g;
    for (const m of txt.matchAll(re)) {
      const dex = Number(m[1]);
      const esp = porDex.get(dex);
      if (!esp) continue;
      const t1 = m[3].toUpperCase();
      const t2 = m[4] ? m[4].toUpperCase() : null;
      if (esp.tipo1 !== t1 || esp.tipo2 !== t2) {
        problemas.push(`${esp.chave}: tipos ${esp.tipo1}/${esp.tipo2}, Bulbapedia diz ${t1}/${t2}`);
      }
      conferidos.tipos++;
    }
  }

  // --- catch rate ---------------------------------------------------------
  {
    const txt = await wikitexto('List of Pokémon by catch rate');
    const re = /\|style="font-family:monospace,monospace" \| (\d{4})\n\| class="c" \| \{\{ArtP\|\d+\|[^}]+\}\}\n\| \{\{p\|([^}|]+)(?:\|[^}]*)?\}\}\n\| class="r" \| (\d+)/g;
    for (const m of txt.matchAll(re)) {
      const dex = Number(m[1]);
      const esp = porDex.get(dex);
      if (!esp) continue;
      const valor = Number(m[3]);
      if (esp.catchRate !== valor) {
        problemas.push(`${esp.chave}: catchRate ${esp.catchRate}, Bulbapedia diz ${valor}`);
      }
      conferidos.catchRate++;
    }
  }

  // --- curva de experiencia ----------------------------------------------
  {
    const txt = await wikitexto('List of Pokémon by experience type');
    const re = /\| (\d{4})\n\| \{\{ArtP\|\d+\|[^}]+\}\}\n\| \{\{p\|([^}|]+)(?:\|[^}]*)?\}\}\n\|[^\n]*\{\{DL\|Experience\|([^}|]+)/g;
    for (const m of txt.matchAll(re)) {
      const dex = Number(m[1]);
      const esp = porDex.get(dex);
      if (!esp) continue;
      const curva = CURVA_BULBAPEDIA[m[3].trim()];
      if (!curva) { problemas.push(`curva desconhecida na Bulbapedia: "${m[3]}"`); continue; }
      if (esp.curva !== curva) problemas.push(`${esp.chave}: curva ${esp.curva}, Bulbapedia diz ${curva}`);
      conferidos.curva++;
    }
  }

  // --- tabela de tipos ----------------------------------------------------
  {
    const txt = await wikitexto('Type');
    const inicio = txt.indexOf('Attacking&nbsp;type');
    if (inicio < 0) throw new Error('nao achei a tabela de tipos na pagina "Type"');
    const trecho = txt.slice(inicio, txt.indexOf('|}', inicio));
    // Cada linha comeca com o nome do tipo atacante em {{color2|fff|X (type)|X}}
    // e e seguida por 18 celulas "1×" / "½×" / "2×" / "0×".
    const linhas = trecho.split(/\{\{color2\|fff\|([A-Za-z]+) \(type\)\|/).slice(1);
    for (let i = 0; i < linhas.length; i += 2) {
      const atacante = linhas[i].toUpperCase();
      const corpo = linhas[i + 1];
      const celulas = [...corpo.matchAll(/\|\s*(?:[^|\n]*\|\s*)?(0|1|2|½)×/g)].map((m) => m[1]);
      if (celulas.length !== 18) {
        problemas.push(`type chart: linha ${atacante} veio com ${celulas.length} celulas (esperado 18)`);
        continue;
      }
      for (let j = 0; j < 18; j++) {
        const defensor = ORDEM_BULBAPEDIA[j];
        const esperado = celulas[j] === '½' ? 0.5 : Number(celulas[j]);
        const nosso = catalogo.tabelaDeTipos[atacante] && catalogo.tabelaDeTipos[atacante][defensor];
        if (nosso !== esperado) {
          problemas.push(`type chart ${atacante} x ${defensor}: nosso ${nosso}, Bulbapedia ${esperado}`);
        }
        conferidos.chart++;
      }
    }
  }

  console.log('Conferencia PokeAPI x Bulbapedia');
  console.log(`  base stats (Gen VII): ${conferidos.stats} especies`);
  console.log(`  tipos:                ${conferidos.tipos} especies`);
  console.log(`  catch rate:           ${conferidos.catchRate} especies`);
  console.log(`  curva de experiencia: ${conferidos.curva} especies`);
  console.log(`  tabela de tipos:      ${conferidos.chart} celulas`);

  // Uma cobertura baixa significa que o parser deixou de casar com a pagina
  // (ela mudou de formato) — e uma conferencia que nao confere nada passaria
  // como sucesso. Por isso o piso e explicito.
  const minimo = 245;
  for (const [nome, n] of Object.entries(conferidos)) {
    const piso = nome === 'chart' ? 18 * 18 : minimo;
    if (n < piso) problemas.push(`cobertura insuficiente em "${nome}": ${n} < ${piso} — o parser provavelmente parou de casar com a pagina`);
  }

  if (problemas.length) {
    console.error(`\n${problemas.length} DIVERGENCIA(S):`);
    for (const p of problemas) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log('\nTudo bate.');
}

main().catch((err) => {
  console.error(`\nFALHOU: ${err.message}`);
  process.exit(1);
});
