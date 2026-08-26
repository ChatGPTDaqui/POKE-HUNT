import fs from 'node:fs'
import path from 'node:path'
import type { Plugin, Connect } from 'vite'
// `vitest/config` e nao `vite`: e ele que conhece a chave `test`.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// A arte do jogo (~270MB: battle sprites, gen5ani, backgrounds, icones) vive
// em `assets/` na RAIZ do repo, fora de web/, e o codigo a referencia por
// caminho relativo (`assets/battle-sprites/...`, ver data/sprites.ts).
//
// Antes isso funcionava por uma JUNCAO do Windows em web/public/assets — o
// que quebrava de tres jeitos: so existe na maquina de quem a criou (some ao
// clonar), o git a segue e duplicaria 6.300 arquivos no repositorio, e no
// `vite build` o publicDir seria copiado inteiro pra dentro de dist/.
//
// Em vez disso, este plugin serve `/assets/*` direto da pasta original, tanto
// no dev server quanto no `vite preview`. Nada e copiado, nada depende de
// link de sistema de arquivos, e funciona igual em qualquer clone.
const GAME_ASSETS_DIR = path.resolve(import.meta.dirname, 'assets')

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

function gameAssetsMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = req.url || ''
    if (!url.startsWith('/assets/')) return next()

    // decodeURIComponent: varios arquivos tem espaco/acento no nome.
    let rel: string
    try {
      rel = decodeURIComponent(url.slice('/assets/'.length).split('?')[0])
    } catch {
      return next()
    }

    const filePath = path.join(GAME_ASSETS_DIR, rel)
    // Guarda de path traversal: o caminho resolvido precisa continuar dentro
    // de assets/ (mesma protecao do server.js do jogo vanilla).
    if (!filePath.startsWith(GAME_ASSETS_DIR)) {
      res.statusCode = 403
      return res.end('Forbidden')
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return next()

    res.setHeader('Content-Type', MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream')
    fs.createReadStream(filePath).pipe(res)
  }
}

function serveGameAssets(): Plugin {
  return {
    name: 'serve-game-assets',
    configureServer: (server) => {
      server.middlewares.use(gameAssetsMiddleware())
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(gameAssetsMiddleware())
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), serveGameAssets()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // Sem `environment` aqui de proposito: o padrao do Vitest ja e o ambiente
  // 'node', que serve pra quase todo teste deste projeto (motor e dado puro).
  // jsdom custa ~10x mais pra subir, entao so os testes de componente o pedem,
  // cada um no proprio arquivo com `// @vitest-environment jsdom`.
  test: {
    // `.claude/worktrees/*` sao worktrees do git de OUTRAS branches, criadas
    // por sessoes de agente. O vitest as varre por padrao e roda os testes
    // delas contra o codigo desta branch — resultado sem sentido (12 falhas
    // vindas de arquivos que nem estao nesta arvore) que esconde falha real.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**', 'authority/engine/**'],
    // Stubs das APIs de browser que o jsdom nao tem e que a HUD usa. Global de
    // proposito, e o motivo esta no proprio arquivo: um componente que passa a
    // usar `ResizeObserver` quebra os testes de QUEM O MONTA, que podem ser
    // arquivos sem nenhuma relacao com a mudanca (PH-190 quebrou PH-157 assim).
    // Custo em teste 'node': uma checagem de `in`.
    setupFiles: ['./src/testes/apiDoBrowserQueOJsdomNaoTem.ts'],
  },
  build: {
    // Por padrao o Vite emite os chunks em `dist/assets/`, que colidiria com
    // o `/assets/` da arte do jogo (mesmo prefixo de URL). Renomeado pra
    // `dist/build/` — assim `/assets/*` fica exclusivamente da arte, servida
    // pelo plugin acima (ou pelo servidor estatico em producao).
    assetsDir: 'build',
  },
})
