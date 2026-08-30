// PH-187 — o alvo de `edge:publicar` sai de fonte VERSIONADA, nunca do link
// local do CLI.
//
// O que estes casos travam nao e a mecanica do deploy (isso o CLI faz), e sim a
// DECISAO de qual projeto recebe. A versao anterior do comando era
//
//   npm run build:edge && npx supabase functions deploy jogo
//
// sem `--project-ref`: o alvo vinha do link local e da conta logada, dois
// estados invisiveis. Em 26/08 isso deu um 403 que escondeu o risco real — a
// conta logada tinha um POKE-HUNT ANTERIOR, e se ele tivesse uma function
// chamada `jogo` o deploy teria acertado o projeto errado com sucesso e sem
// aviso.
//
// Por isso o caso "sem fonte nenhuma RECUSA" e o mais importante daqui: o
// default de um comando que publica nao pode ser "onde estiver linkado".
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { refDaUrl, resolverProjeto, resolverFuncao } from './publicar-edge.mjs'

const RAIZ = join(import.meta.dirname, '..')
const PKG = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'))
const FONTE = readFileSync(join(RAIZ, 'scripts/publicar-edge.mjs'), 'utf8')

describe('o alvo do deploy da Edge (PH-187)', () => {
  it('`edge:publicar` nao chama o CLI direto — passa pelo script que fixa o projeto', () => {
    // Guarda contra "voltaram a linha de uma linha". `functions deploy` no
    // package.json e exatamente o estado que a issue reprovou.
    const cmd = PKG.scripts['edge:publicar']
    expect(cmd).toContain('scripts/publicar-edge.mjs')
    expect(cmd, 'o CLI voltou a ser chamado direto do package.json, sem --project-ref')
      .not.toContain('functions deploy')
  })

  it('o deploy SEMPRE recebe --project-ref', () => {
    // A linha inteira desta issue. Um `functions deploy` sem ela publica no que
    // estiver linkado.
    expect(FONTE).toMatch(/'functions',\s*'deploy',\s*funcao,\s*'--project-ref',\s*ref/)
  })

  it('extrai o ref do host de uma URL do Supabase, e so dela', () => {
    expect(refDaUrl('https://uogmhqbyjgafjujbqdty.supabase.co')).toBe('uogmhqbyjgafjujbqdty')
    expect(refDaUrl('https://uogmhqbyjgafjujbqdty.supabase.co/')).toBe('uogmhqbyjgafjujbqdty')
    expect(refDaUrl('https://exemplo.com')).toBeNull()
    expect(refDaUrl('https://SEU-PROJETO.supabase.co'), 'o placeholder do .env.example nao pode virar alvo').toBeNull()
    expect(refDaUrl('')).toBeNull()
    expect(refDaUrl(undefined)).toBeNull()
  })

  it('o ambiente vence o .env — e o caminho do CI', () => {
    const r = resolverProjeto({ env: { SUPABASE_PROJECT_REF: 'refdoci' }, dotenv: { SUPABASE_URL: 'https://uogmhqbyjgafjujbqdty.supabase.co' } })
    expect(r.ref).toBe('refdoci')
  })

  it('sem ambiente, sai do SUPABASE_URL do .env — a mesma fonte de catalog:migrar e db:wipe', () => {
    const r = resolverProjeto({ env: {}, dotenv: { SUPABASE_URL: 'https://uogmhqbyjgafjujbqdty.supabase.co' } })
    expect(r.ref).toBe('uogmhqbyjgafjujbqdty')
    expect(r.origem).toContain('.env')
  })

  it('sem fonte nenhuma RECUSA, em vez de cair no projeto linkado', () => {
    expect(() => resolverProjeto({ env: {}, dotenv: {} })).toThrow(/nao consegui decidir o projeto alvo/)
    expect(() => resolverProjeto({ env: {}, dotenv: { SUPABASE_URL: 'nao-e-url' } })).toThrow()
  })

  it('publica `jogo` por padrao e aceita `--funcao=` pra staging', () => {
    expect(resolverFuncao([])).toBe('jogo')
    expect(resolverFuncao(['--funcao=jogo-dev'])).toBe('jogo-dev')
  })

  it('confere o acesso ANTES de subir byte', () => {
    // A ordem importa: `conferirAcesso` depois do `deploy` nao serviria de nada,
    // e o 403 generico do meio do upload foi o que atrasou o diagnostico em
    // 26/08.
    expect(FONTE.indexOf('conferirAcesso(ref)')).toBeLessThan(FONTE.indexOf("'functions', 'deploy'"))
  })
})
