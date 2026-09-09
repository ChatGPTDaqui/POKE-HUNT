// PH-512. Complementa o catálogo por nível sem mudar learnsets de espécies.
const fs = require('fs');
const path = require('path');
const api = require('./lib/pokeapi.js');
const maquinas = require('./usum/maquinas.json');
const catalogo = require('./usum/catalog.json');
const stats = { attack: 'atkFis', 'special-attack': 'atkEsp', defense: 'def', 'special-defense': 'defEsp', speed: 'speed', accuracy: 'accuracy', evasion: 'evasion' };
async function main() {
  const existentes = new Set(catalogo.golpes.map(g => g.chave));
  const saida = {};
  for (const tm of maquinas.tms) {
    if (existentes.has(tm.golpe)) continue;
    const m = await api.getJson(`https://pokeapi.co/api/v2/move/${tm.api}/`);
    if (!m) throw new Error(`Sem dado de ${tm.api}`);
    const entrada = {
      id: tm.golpe, name: m.names.find(n => n.language.name === 'en').name,
      type: m.type.name.toUpperCase(), category: m.damage_class.name,
      power: m.power ?? 0, accuracy: m.accuracy ?? 100, pp: m.pp,
      target: ['all-opponents', 'all-other-pokemon', 'all-pokemon'].includes(m.target.name) ? 'aoe' : 'single',
    };
    if (m.stat_changes.length) {
      entrada.statChanges = m.stat_changes.map(s => ({ stat: stats[s.stat.name], estagios: s.change }));
      entrada.statChance = m.meta.stat_chance || 100;
      if (m.meta.category.name === 'damage-raise') entrada.statTarget = 'self';
    }
    if (m.meta.ailment.name === 'burn') { entrada.status = 'burn'; entrada.statusChance = m.meta.ailment_chance; }
    saida[tm.golpe] = entrada;
  }
  fs.writeFileSync(path.join(__dirname, '../src/data/generated/golpesTm.generated.ts'),
    '// Gerado por node scripts/gerar-golpes-tm.js. Fonte: PokeAPI.\nimport type { AbilityDataEntry } from "./types"\nexport const GOLPES_TM: Record<string, AbilityDataEntry> = ' + JSON.stringify(saida, null, 2) + '\n');
  console.log(`${Object.keys(saida).length} golpes complementares gerados.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
