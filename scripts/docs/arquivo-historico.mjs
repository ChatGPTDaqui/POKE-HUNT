import path from 'node:path';

export const BASE = '016f1240dcb09788c8c44eb52b1be8044e52f190';
export const ARCHIVE = 'docs/arquivo/2026-09-08/';

// Keep the historical body intact except for relative Markdown destinations.
// These links target the original tree, so moves cannot reinterpret their paths.
export function renderHistorical(originalPath, text) {
  const source = `https://github.com/ChatGPTDaqui/POKE-HUNT/blob/${BASE}/${originalPath}`;
  const body = text.replace(/\]\(([^\s)]+)\)/g, (match, destination) => {
    if (/^(?:[a-z]+:|#)/i.test(destination)) return match;
    const [target, fragment] = destination.split('#');
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(originalPath), target));
    return `](https://github.com/ChatGPTDaqui/POKE-HUNT/blob/${BASE}/${resolved}${fragment ? '#' + fragment : ''})`;
  });
  return `> Registro histórico de 08/09/2026. Não é procedimento vigente.\n> Datas, comandos e pendências descrevem a base antiga. [Original preservado no Git](${source}).\n> Consulte AGENTS.md e docs/PROCESSO.md na raiz atual para executar tarefas.\n\n${body}`;
}
