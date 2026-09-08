import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BASE, ARCHIVE, renderHistorical } from './arquivo-historico.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const archive = ARCHIVE;
const base = BASE;
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const hash = s => createHash('sha256').update(s).digest('hex');
const slug = s => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replaceAll(' ', '-');
const failures = [];
const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => {
  const p = path.posix.join(dir, e.name);
  return e.isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
});
const active = ['AGENTS.md', 'CLAUDE.md', 'README.md', ...walk('docs').filter(p => !p.startsWith(archive))];
const anchors = p => {
  const s = read(p), found = new Set(), counts = new Map();
  for (const m of s.matchAll(/^#{1,6} (.+)$/gm)) {
    const id = slug(m[1]), n = counts.get(id) || 0;
    found.add(n ? `${id}-${n}` : id); counts.set(id, n + 1);
  }
  for (const m of s.matchAll(/<a id="([^"]+)"/g)) found.add(m[1]);
  return found;
};
let links = 0;
for (const p of active) {
  for (const m of read(p).matchAll(/\]\(([^\s)]+)\)/g)) {
    if (/^[a-z]+:/i.test(m[1])) continue;
    const [target, fragment] = m[1].split('#');
    const resolved = target ? path.posix.normalize(path.posix.join(path.posix.dirname(p), target)) : p;
    links++;
    if (!fs.existsSync(path.join(root, resolved))) failures.push(`${p}: destino ausente ${m[1]}`);
    else if (fragment && resolved.endsWith('.md') && !anchors(resolved).has(decodeURIComponent(fragment))) failures.push(`${p}: âncora ausente ${m[1]}`);
  }
}
const baseline = { 'AGENTS.md':283, 'CLAUDE.md':4558, 'docs/PROCESSO.md':6310, 'docs/README.md':6569 };
const budgets = { 'AGENTS.md':2500, 'CLAUDE.md':250, 'docs/README.md':2000 };
for (const [p, max] of Object.entries(budgets)) if (read(p).length > max) failures.push(`${p}: ${read(p).length} > ${max} caracteres`);
const originalFiles = execFileSync('git', ['ls-tree','-r','--name-only',base], {cwd:root,encoding:'utf8'}).trim().split('\n').filter(p => p.endsWith('.md'));
for (const p of originalFiles) {
  const saved = archive + (['AGENTS.md','CLAUDE.md'].includes(p) ? p + '.txt' : p);
  const old = execFileSync('git',['show',`${base}:${p}`],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024}).replace(/\r\n/g,'\n');
  if (hash(renderHistorical(p, old)) !== hash(read(saved))) failures.push(`Snapshot alterado: ${p}`);
}
// Routing acceptance is structural; semantic review is recorded in the decision document.
const scenarios = {
  consulta: ['AGENTS.md','CLAUDE.md','docs/README.md','docs/arquitetura.md'],
  interface: ['AGENTS.md','CLAUDE.md','docs/README.md','docs/PROCESSO.md','docs/dominios/interface.md','docs/operacao/verificacao.md'],
  authority: ['AGENTS.md','CLAUDE.md','docs/README.md','docs/PROCESSO.md','docs/dominios/autoridade.md','docs/operacao/verificacao.md'],
  schema: ['AGENTS.md','CLAUDE.md','docs/README.md','docs/PROCESSO.md','docs/operacao/banco.md','docs/operacao/verificacao.md'],
  publicacao: ['AGENTS.md','CLAUDE.md','docs/README.md','docs/PROCESSO.md','docs/operacao/publicacao.md'],
};
const before = Object.values(baseline).reduce((a,b)=>a+b,0);
const initial = ['AGENTS.md','CLAUDE.md','docs/README.md'].reduce((n,p)=>n+read(p).length,0);
console.log(JSON.stringify({baseline:before,initial,reductionPercent:Number((100*(1-initial/before)).toFixed(1)),links,snapshots:originalFiles.length,scenarios:Object.fromEntries(Object.entries(scenarios).map(([k,ps])=>[k,ps.reduce((n,p)=>n+read(p).length,0)])),failures},null,2));
process.exitCode = failures.length ? 1 : 0;
