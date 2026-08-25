// Onde mora o bundle do motor, num lugar só.
//
// POR QUE ESTE ARQUIVO EXISTE
//
// O caminho do bundle estava repetido, como string montada à mão, em quatro
// scripts diferentes. Quando a pasta `server/` virou `authority/`, os quatro
// quebraram de uma vez — e o rename custou três rodadas de correção justamente
// porque cada lugar tinha que ser achado e trocado separadamente (PH-51).
//
// Nada aqui detecta o caminho: quem define o destino é `vite.engine.config.ts`,
// no `outDir`. Este módulo só é a única cópia da resposta, para o próximo
// rename ser um arquivo em vez de uma caçada.
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Raiz do repositório, a partir de `scripts/lib/`. */
export const RAIZ_DO_REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

/** Bundle headless do motor. Gerado por `npm run build:engine`, gitignored. */
export const CAMINHO_DO_MOTOR = join(RAIZ_DO_REPO, 'authority', 'engine', 'headless.js')

/**
 * Importa o motor, ou sai com uma mensagem que diz o que fazer.
 *
 * O bundle é gerado e gitignored, então "não existe" é o estado NORMAL de um
 * clone novo ou de quem acabou de trocar de branch — não é corrupção. O
 * `ERR_MODULE_NOT_FOUND` cru do Node não menciona `build:engine` em lugar
 * nenhum, e era com ele que os scripts morriam.
 *
 * `pathToFileURL` é obrigatório no Windows: o `import()` dinâmico interpreta
 * "C:\..." como um esquema de URL chamado "c:" e recusa.
 */
export async function carregarMotor() {
  if (!existsSync(CAMINHO_DO_MOTOR)) {
    console.error(`Bundle do motor ausente em ${CAMINHO_DO_MOTOR}.`)
    console.error('Rode `npm run build:engine` na raiz e tente de novo.')
    process.exit(1)
  }
  return import(pathToFileURL(CAMINHO_DO_MOTOR).href)
}
