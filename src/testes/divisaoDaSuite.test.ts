// PH-457 — a trava da divisao da suite em `puro` e `mockado`.
//
// POR QUE ESTE TESTE EXISTE
// ---------------------------------------------------------------------------
// A suite roda em dois projetos: `puro` (sem isolamento por arquivo, mais
// rapido) e `mockado` (isolado, pros arquivos que chamam `vi.mock`). A divisao
// e feita por varredura de conteudo dentro do `vite.config.ts`.
//
// O modo de falha que este arquivo existe pra impedir NAO e "um arquivo caiu no
// projeto errado" — a classificacao e automatica, entao isso quase nao acontece.
// E o outro, muito pior: **um arquivo de teste sair dos DOIS projetos e parar
// de rodar sem ninguem notar.** Uma pasta nova, um sufixo diferente, um filtro
// mexido, e a suite continua verde com menos teste dentro. Verde a menos e
// invisivel; e o unico tipo de regressao que nao se anuncia.
//
// Por isso este arquivo ENUMERA OS TESTES POR CONTA PROPRIA, com um caminhar de
// diretorio proprio, e compara com o que a config montou. Duas implementacoes
// independentes chegando no mesmo conjunto e o que da valor a comparacao —
// reusar a funcao da config aqui seria a funcao concordando consigo mesma.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import config from '../../vite.config'

const RAIZ = process.cwd()

/** Caminhar proprio, de proposito diferente do da config. */
function enumerarTestes(dir: string, achados: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const cheio = path.join(dir, e.name)
    const rel = path.relative(RAIZ, cheio).split(path.sep).join('/')
    if (e.isDirectory()) {
      if (/^(node_modules|dist|\.git|\.claude)$/.test(e.name)) continue
      if (rel === 'authority/engine') continue
      enumerarTestes(cheio, achados)
    } else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(e.name)) {
      achados.push(rel)
    }
  }
  return achados
}

type ProjetoDeTeste = { test: { name: string; include: string[]; isolate: boolean } }

const projetos = (config as unknown as { test: { projects: ProjetoDeTeste[] } }).test.projects
const porNome = (nome: string) => projetos.find((p) => p.test.name === nome)

describe('divisao da suite em puro e mockado', () => {
  it('a config monta os dois projetos, com o isolamento certo em cada um', () => {
    expect(projetos.map((p) => p.test.name).sort()).toEqual(['mockado', 'puro'])
    expect(porNome('puro')!.test.isolate).toBe(false)
    expect(porNome('mockado')!.test.isolate).toBe(true)
  })

  it('NENHUM arquivo de teste fica de fora dos dois projetos', () => {
    const naConfig = new Set(projetos.flatMap((p) => p.test.include))
    const noDisco = enumerarTestes(RAIZ)

    // A mensagem lista os arquivos, e nao so a contagem: quem quebrar isto
    // precisa saber QUAL teste parou de rodar, nao que "sobrou um".
    const foraDaConfig = noDisco.filter((f) => !naConfig.has(f))
    expect(foraDaConfig, `arquivos de teste que nao rodariam: ${foraDaConfig.join(', ')}`).toEqual([])

    // O contrario tambem: include apontando pra arquivo que nao existe mais
    // faz o vitest reprovar com "No test files found" no pior momento.
    const noDiscoSet = new Set(noDisco)
    const fantasmas = [...naConfig].filter((f) => !noDiscoSet.has(f))
    expect(fantasmas, `include aponta pra arquivo inexistente: ${fantasmas.join(', ')}`).toEqual([])
  })

  it('nenhum arquivo do projeto sem isolamento chama vi.mock', () => {
    const suspeitos = porNome('puro')!.test.include.filter((rel) => {
      const fonte = fs.readFileSync(path.join(RAIZ, rel), 'utf8')
      return /\bvi\s*\.\s*(mock|doMock)\s*\(/.test(fonte)
    })
    expect(
      suspeitos,
      `estes usam vi.mock e rodariam sem isolamento (vazamento entre arquivos): ${suspeitos.join(', ')}`,
    ).toEqual([])
  })

  it('a divisao continua valendo a pena — os dois lados tem arquivo', () => {
    // Projeto vazio faz o vitest reprovar com "No test files found", e um
    // `puro` vazio significaria que a otimizacao inteira virou custo puro.
    expect(porNome('puro')!.test.include.length).toBeGreaterThan(0)
    expect(porNome('mockado')!.test.include.length).toBeGreaterThan(0)
  })
})
