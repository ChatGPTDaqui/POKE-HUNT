// Limpeza pontual de `scripts/usum/catalog.json`: 48 especies tinham golpe
// literalmente duplicado (mesma chave, mesmo nivel — sempre nivel 1),
// bug de `golpesDeNivelNoUsum` (scripts/lib/pokeapi.js, ja corrigido pra
// nao reproduzir isso num re-fetch). Este script so limpa o JSON ja
// commitado, sem tocar na rede: `npm run usum:baixar` de novo bateria PokeAPI
// e poderia trazer outras diferencas (dado muda com o tempo), o que nao e o
// objetivo aqui — so tirar a duplicata.
//
// Roda uma vez: `node scripts/dedupe-catalog-golpes.js`. Idempotente (rodar
// de novo sem duplicata nenhuma nao muda o arquivo).
'use strict';
const fs = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, 'usum', 'catalog.json');
const catalogo = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));

let removidos = 0;
for (const especie of catalogo.especies) {
  const vistos = new Set();
  const limpo = especie.golpes.filter((g) => {
    const chave = `${g.chave}@${g.nivel}`;
    if (vistos.has(chave)) { removidos++; return false; }
    vistos.add(chave);
    return true;
  });
  especie.golpes = limpo;
}

fs.writeFileSync(ARQUIVO, JSON.stringify(catalogo, null, 1) + '\n');
console.log(`removidas ${removidos} linhas duplicadas de especies[].golpes`);
