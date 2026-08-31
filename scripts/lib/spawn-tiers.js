// A tabela de peso de spawn do jogo INTEIRO, lida dos dois arquivos que a
// compoem.
//
// ---------------------------------------------------------------------------
// POR QUE SAO DOIS ARQUIVOS, E POR QUE NAO FORAM FUNDIDOS NUM (PH-332)
// ---------------------------------------------------------------------------
// `spawn-tiers.json` (dex 1-251) sai de `derive-spawn-tiers.js`, que le TRES
// disassemblies em assembly de Game Boy (pret/pokecrystal, pokegold, pokered) e
// tem um parser de `.asm` por tipo de encontro. `spawn-tiers-gen3.json`
// (dex 252-386) sai de `derive-spawn-tiers-gen3.mjs`, porque o pret/pokeemerald
// publica os encontros em JSON estruturado — outra maquina, outro parser.
// Enfiar os dois no mesmo script seriam dois parsers sem nada em comum atras da
// mesma flag; a decisao de separar esta escrita em docs/17.
//
// O plano de ativacao dizia "fundir gen3 em spawn-tiers.json". Nao foi por aqui,
// e a razao esta no cabecalho dos dois arquivos: "Gerado por ... Nao editar a
// mao." Um terceiro arquivo, fundido a mao, seria o unico dos tres que nenhum
// script sabe regerar — e na primeira vez que um dos derivadores rodasse de novo,
// metade da fusao ficaria velha em silencio. Unir na LEITURA mantem cada arquivo
// com um dono.
//
// O QUE ESTA FUNCAO GARANTE, e cada uma dessas garantias e um jeito de o jogo
// ficar errado sem erro:
//
//   1. A ESCALA E A MESMA nos dois. Os tiers sao as vagas reais do jogo
//      (30/20/10/5/1) e as duas geracoes tem que ser comparaveis — divergir ali
//      nao daria erro, daria um jogo em que uma geracao inteira aparece mais que
//      a outra sem nada explicar. Comparado campo a campo.
//   2. NAO HA ESPECIE EM DOIS ARQUIVOS. Sobreposicao significaria que um dos
//      recortes vazou, e o vencedor dependeria da ordem de leitura.
//   3. NENHUM TIER DESCONHECIDO. Um `tier` que nao exista na escala viraria
//      `undefined` no peso e a especie cairia no fallback do gerador.
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..');
const ARQUIVO_BASE = 'spawn-tiers.json';
const ARQUIVO_GEN3 = 'spawn-tiers-gen3.json';

function ler(nome) {
  const caminho = path.join(DIR, nome);
  if (!fs.existsSync(caminho)) throw new Error(`falta ${nome} — rode o derivador correspondente`);
  return JSON.parse(fs.readFileSync(caminho, 'utf8'));
}

/**
 * `{ tiers, especies }` com as duas faixas juntas.
 *
 * `tiers` vem do arquivo base (ja conferido igual ao do gen3). `especies` e a
 * uniao das duas, com a origem de cada uma preservada no proprio registro
 * (`origem: 'gsc' | 'rby' | 'emerald' | 'regra'`).
 */
function lerSpawnTiers() {
  const base = ler(ARQUIVO_BASE);
  const gen3 = ler(ARQUIVO_GEN3);

  // (1) Escala identica. `JSON.stringify` sobre o array inteiro compara ordem,
  // chave, peso e `minChance` de uma vez — e a ordem importa, porque ela e a
  // ordem das vagas.
  if (JSON.stringify(base.tiers) !== JSON.stringify(gen3.tiers)) {
    throw new Error(
      `a escala de tiers de ${ARQUIVO_GEN3} divergiu de ${ARQUIVO_BASE}. `
      + 'As duas geracoes tem que usar as mesmas vagas (30/20/10/5/1), senao uma aparece '
      + 'mais que a outra sem nada explicar. Ver o cabecalho dos dois derivadores.'
    );
  }

  // (2) Sem sobreposicao.
  const repetidas = Object.keys(gen3.especies).filter((id) => id in base.especies);
  if (repetidas.length) {
    throw new Error(
      `${repetidas.length} especie(s) em ${ARQUIVO_BASE} E em ${ARQUIVO_GEN3}: `
      + `${repetidas.slice(0, 10).join(', ')}. Um dos recortes vazou.`
    );
  }

  const especies = { ...base.especies, ...gen3.especies };

  // (3) Todo tier existe na escala.
  const conhecidos = new Set(base.tiers.map((t) => t.chave));
  const desconhecidos = Object.entries(especies)
    .filter(([, info]) => !conhecidos.has(info.tier))
    .map(([id, info]) => `${id}=${info.tier}`);
  if (desconhecidos.length) {
    throw new Error(`tier desconhecido: ${desconhecidos.slice(0, 10).join(', ')}`);
  }

  return { tiers: base.tiers, especies };
}

/** So as chaves, pra quem valida identidade de especie e nao precisa do peso. */
function chavesComTier() {
  return new Set(Object.keys(lerSpawnTiers().especies));
}

module.exports = { lerSpawnTiers, chavesComTier, ARQUIVO_BASE, ARQUIVO_GEN3 };
