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

// ---------------------------------------------------------------------------
// PH-457 — isolamento por arquivo so onde ele e necessario.
//
// O isolamento (`isolate: true`, o padrao) recria o registro de modulos pra
// CADA arquivo de teste. Medido nesta arvore: com ele, a suite cheia leva 55s;
// sem ele, 45s — mas 3 arquivos passam a falhar por vazamento de estado global
// entre arquivos, e a contagem oscila conforme a ordem, que e o pior modo de
// falha que existe.
//
// Os tres sao exatamente os que chamam `vi.mock`, e a razao e estrutural: o
// `vi.mock` mexe no registro de modulos do worker, que sem isolamento e
// compartilhado com todo arquivo que rodar depois. Fora dele, ninguem mexe.
//
// Entao a divisao e por CONTEUDO, e nao por uma lista escrita na mao: um teste
// novo com `vi.mock` cai sozinho no projeto isolado, e um que perde o `vi.mock`
// migra sozinho pro rapido. Lista manual envelheceria em silencio, e o modo de
// falha dela seria intermitente e dependente de ordem.
//
// A VARREDURA SAI DE `process.cwd()`, e nao do diretorio desta config. Isto e
// deliberado e e o que mantem `authority/` funcionando: ele NAO tem config
// propria e `cd authority && npx vitest run` (o que o CI faz) sobe a arvore ate
// aqui. Com a varredura na raiz da CORRIDA, rodar da raiz classifica os testes
// da raiz e rodar de `authority/` classifica os de `authority/` — cada
// invocacao ve o proprio conjunto. Varrer o diretorio da config faria a
// invocacao de `authority/` tentar rodar a suite inteira.
const RAIZ_DA_CORRIDA = process.cwd()
// Por NOME de pasta, em qualquer profundidade.
const PASTAS_IGNORADAS = new Set(['node_modules', 'dist', '.git', '.claude'])
// Por CAMINHO, a partir da raiz da corrida. `engine` nao pode entrar na lista
// por nome: `src/engine/` e o motor do jogo e tem teste de verdade; quem sai e
// so `authority/engine/`, que e bundle gerado por `npm run build:engine`.
const CAMINHOS_IGNORADOS = new Set(['authority/engine'])
const PADRAO_DE_TESTE = /\.(test|spec)\.[cm]?[jt]sx?$/

function acharTestes(dir: string, saida: string[] = []): string[] {
  let entradas
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return saida
  }
  for (const e of entradas) {
    const cheio = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (PASTAS_IGNORADAS.has(e.name)) continue
      if (CAMINHOS_IGNORADOS.has(path.relative(RAIZ_DA_CORRIDA, cheio).split(path.sep).join('/'))) continue
      acharTestes(cheio, saida)
    } else if (PADRAO_DE_TESTE.test(e.name)) {
      saida.push(cheio)
    }
  }
  return saida
}

/**
 * `vi.mock` e `vi.doMock` sao os unicos que registram no grafo de modulos do
 * worker. `vi.fn`, `vi.spyOn` e `vi.clearAllMocks` nao — eles vivem dentro do
 * caso e nao vazam entre arquivos.
 */
const MEXE_NO_REGISTRO = /\bvi\s*\.\s*(mock|doMock)\s*\(/

const relativo = (p: string) => path.relative(RAIZ_DA_CORRIDA, p).split(path.sep).join('/')

const todosOsTestes = acharTestes(RAIZ_DA_CORRIDA)
const comMock: string[] = []
const semMock: string[] = []
for (const arq of todosOsTestes) {
  let fonte = ''
  try {
    fonte = fs.readFileSync(arq, 'utf8')
  } catch {
    // Ilegivel: vai pro lado seguro (isolado).
    comMock.push(relativo(arq))
    continue
  }
  ;(MEXE_NO_REGISTRO.test(fonte) ? comMock : semMock).push(relativo(arq))
}

const EXCLUIR = ['**/node_modules/**', '**/dist/**', '.claude/**', 'authority/engine/**']
const COMUM = {
  exclude: EXCLUIR,
  setupFiles: [path.resolve(import.meta.dirname, './src/testes/apiDoBrowserQueOJsdomNaoTem.ts')],
  testTimeout: 15000,
  pool: 'threads' as const,
}

// UMA definicao so, usada pela config da raiz E por cada projeto de teste.
//
// PROJETO NAO HERDA `plugins` NEM `resolve` DA RAIZ: cada um e um config de
// Vite proprio. Sem isto, 127 dos 279 arquivos reprovam de uma vez — o alias
// `@` nao resolve e o JSX nao e transformado. Foi assim que isto foi
// descoberto, e e por isso que o alias mora nesta constante em vez de aparecer
// escrito duas vezes: duas copias divergem, e a divergencia se manifesta como
// meia suite reprovando de uma vez.
const ALIAS = { '@': path.resolve(import.meta.dirname, './src') }

// Projeto com include vazio faz o vitest reprovar com "No test files found".
// Um conjunto sem nenhum arquivo mockado (ou sem nenhum puro) e estado
// possivel — `authority/` sozinho ja e quase isso —, entao o projeto so entra
// na lista se tiver arquivo.
const projetoDeTeste = (nome: string, include: string[], isolate: boolean) => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: ALIAS },
  test: { ...COMUM, name: nome, include, isolate },
})

const projetos = [
  semMock.length ? projetoDeTeste('puro', semMock, false) : null,
  comMock.length ? projetoDeTeste('mockado', comMock, true) : null,
].filter((p) => p !== null)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), serveGameAssets()],
  resolve: { alias: ALIAS },
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
    //
    // CAMINHO ABSOLUTO, e nao `./src/testes/...`. `authority/` NAO tem config de
    // vitest propria: rodar `cd authority && npx vitest run` (o que o CI faz)
    // sobe a arvore, acha ESTE arquivo e resolve o caminho relativo contra
    // `authority/` — onde `src/testes/` nao existe. Resultado no CI: as 6 suites
    // de authority falhando com "Cannot find module", sem nenhum teste rodar.
    // `import.meta.dirname` e o diretorio DESTA config, entao aponta pro arquivo
    // certo de onde quer que o vitest seja invocado.
    setupFiles: [path.resolve(import.meta.dirname, './src/testes/apiDoBrowserQueOJsdomNaoTem.ts')],
    // 15s, e nao os 5s padrao (PH-411). O que estourava os 5s NAO era logica
    // lenta: era `await import(...)` de modulo pesado escrito DENTRO do primeiro
    // caso de um arquivo. O modulo fica em cache depois da primeira vez, entao o
    // grafo inteiro cai no orcamento de quem chegou primeiro — e `import` e o
    // item mais caro da suite com folga (1.953s de uma corrida de 214s de
    // relogio, com os workers em paralelo).
    //
    // Ja aconteceu TRES vezes, em tres arquivos diferentes: `controller.test.ts`
    // (PH-322), `reordenarReservas.test.ts` (PH-404) e
    // `confirmacaoDaTrocaNoCliente.test.ts` (esta). Sao 20 arquivos com esse
    // formato hoje; remendar um por um significa redescobrir a causa do zero a
    // cada vez, sempre numa maquina ocupada, sempre parecendo falha de logica.
    //
    // 15s continua curto pra pegar teste travado de verdade — o caso mais lento
    // daqui faz menos de 2s de trabalho real — e nao substitui os `beforeAll` de
    // aquecimento das duas issues anteriores, que continuam protegendo o runner
    // do CI (mais lento e compartilhado). Timeout individual por caso continua
    // proibido: ele mascara logica lenta junto com import lento.
    testTimeout: 15000,
    // `threads` (worker_threads) e nao o padrao `forks` (um processo filho por
    // worker). O que domina a suite NAO e rodar teste: numa corrida cheia o
    // proprio vitest reporta `import` como o item mais caro com folga (578s
    // somados entre workers, contra 79s de `tests`). Thread compartilha o
    // processo, entao o custo de partida do runtime e do resolvedor de modulo e
    // pago uma vez por worker em vez de uma vez por processo.
    //
    // O isolamento por arquivo nao sumiu: ele passou a valer so onde e
    // necessario, pela divisao em `projects` montada logo acima deste
    // `defineConfig` (PH-457).
    pool: 'threads',
    projects: projetos,
  },
  build: {
    // Por padrao o Vite emite os chunks em `dist/assets/`, que colidiria com
    // o `/assets/` da arte do jogo (mesmo prefixo de URL). Renomeado pra
    // `dist/build/` — assim `/assets/*` fica exclusivamente da arte, servida
    // pelo plugin acima (ou pelo servidor estatico em producao).
    assetsDir: 'build',
  },
})
