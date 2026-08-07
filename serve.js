// Servidor estatico zero-dependencia pro build de producao do app React.
// Equivalente ao server.js do jogo vanilla, com duas diferencas que a
// migracao exige:
//
// 1. Serve `web/dist/` (saida do `npm run build`), nao a raiz do repo.
// 2. Serve `/assets/*` direto de `assets/` na RAIZ do repo, sem copiar nada.
//    A arte tem ~270MB; duplica-la dentro de dist/ a cada build seria lento e
//    inutil. Mesma estrategia do plugin de dev/preview (web/vite.config.ts).
//
// 3. Fallback de SPA: qualquer rota desconhecida devolve index.html. Hoje o
//    jogo nao usa rotas de URL (a troca de tela e estado, ver uiStore), mas
//    isso evita um 404 se alguem recarregar numa URL qualquer.
//
// Uso:  node web/serve.js        (depois de `cd web && npm run build`)
//
// ESM (nao CommonJS): web/package.json tem "type": "module", entao todo .js
// aqui dentro e modulo ES — `require` nao existe neste escopo.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const HERE = import.meta.dirname;
const DIST = path.join(HERE, 'dist');
const GAME_ASSETS = path.join(HERE, 'assets');
const PORT = process.env.PORT || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.xml': 'application/xml; charset=utf-8',
};

if (!fs.existsSync(DIST)) {
  console.error('web/dist nao existe. Rode primeiro:  cd web && npm run build');
  process.exit(1);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let reqPath;
  try {
    reqPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400);
    return res.end('Bad Request');
  }

  // Arte do jogo, servida da pasta original na raiz.
  if (reqPath.startsWith('/assets/')) {
    const assetPath = path.normalize(path.join(GAME_ASSETS, reqPath.slice('/assets/'.length)));
    if (!assetPath.startsWith(GAME_ASSETS)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    return sendFile(res, assetPath);
  }

  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.normalize(path.join(DIST, reqPath));
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    // Rota desconhecida (sem extensao) cai no index.html; um arquivo
    // inexistente COM extensao continua 404 de verdade, pra nao mascarar
    // asset faltando com uma pagina HTML.
    if (err || !stat.isFile()) {
      if (path.extname(filePath)) return sendFile(res, filePath);
      return sendFile(res, path.join(DIST, 'index.html'));
    }
    sendFile(res, filePath);
  });
});

server.listen(PORT, () => {
  console.log(`NOVO POKE IDLE (React) rodando em http://localhost:${PORT}`);
});
