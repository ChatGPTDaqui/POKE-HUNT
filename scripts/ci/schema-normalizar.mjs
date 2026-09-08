import { readFileSync } from 'node:fs'
// Somente versão de infraestrutura e espaços finais/CRLF; conteúdo de schema intacto.
process.stdout.write(readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n')
  .replace(/PostgrestVersion: "[^"]*"/g, 'PostgrestVersion: "NORMALIZADO"').trimEnd() + '\n')
