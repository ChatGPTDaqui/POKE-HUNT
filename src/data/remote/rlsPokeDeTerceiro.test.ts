// PH-105 -- POKE de terceiro nao volta pra leitura de quem nao e o dono.
//
// O defeito nao foi um erro de logica: foi uma premissa que envelheceu. Em
// 2026-08-12 a policy `pokemon leitura publica` liberou `pokemon_instances`
// inteira pra qualquer conta autenticada, com a justificativa (escrita na
// propria migration) de que a tabela "nao guarda nada privado alem do
// user_id". Depois disso ela ganhou os 6 IV, `nature`, `trait`, `locked` e
// `original_trainer`, e ninguem voltou pra reler aquela frase.
//
// Por isso o teste e sobre a CLASSE, nao sobre o caso: ele replaya as
// migrations na ordem e reprova se o ESTADO FINAL da RLS voltar a liberar a
// tabela -- por policy frouxa nova, ou por view `security_invoker` lendo a
// tabela (que e o mesmo vazamento com outro nome, porque view assim roda com a
// permissao de quem chama, e nao do dono).
//
// A recusa DE VERDADE, com dois tokens contra o banco, e verificacao de PR --
// nao da pra rodar no Vitest sem rede nem credencial. O que este teste guarda
// e o unico lugar onde a regra existe por escrito: o SQL versionado.
import { describe, expect, it } from 'vitest'

// `?raw` via `import.meta.glob`, e nao `readFileSync`: o projeto de `src/` NAO
// tem os types de node -- mesma razao documentada em `render/ambiente.test.ts`.
const MIGRATIONS = import.meta.glob('../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Ordem de aplicacao e a ordem do nome do arquivo (timestamp na frente). */
const ARQUIVOS = Object.keys(MIGRATIONS).sort()

/**
 * Comentario `--` sai ANTES de qualquer casamento. Sem isto o proprio
 * cabecalho da migration do PH-105 -- que cita a policy antiga pra explicar o
 * conserto -- seria lido como uma policy viva.
 */
function semComentario(sql: string): string {
  return sql.replace(/--[^\n]*/g, '')
}

const SQL = ARQUIVOS.map((f) => semComentario(MIGRATIONS[f])).join('\n')

const ALVO = 'pokemon_instances'

/**
 * Os quatro statements que decidem quem le POKE de quem, na ORDEM em que o
 * banco os aplica. Ordem e o ponto: `drop` seguido de `create` com o mesmo
 * nome e o jeito idiomatico de reescrever uma policy, e um replay que so
 * juntasse os `drop` num conjunto concluiria que ela nao existe.
 */
const RELEVANTE =
  /create policy\s+"[^"]+"\s+on\s+(?:(\w+)\.)?(\w+)[\s\S]*?;|drop policy[^;]*?on\s+(?:(\w+)\.)?(\w+)\s*;|create (?:or replace )?view\s+(\w+\.\w+)[\s\S]*?;|drop view\s+(?:if exists\s+)?(\w+\.\w+)\s*;/gi

/** Os dois schemas espelhados do projeto (docs/11-operacao.md). */
const SCHEMAS = ['public', 'dev'] as const

/**
 * Statement SEM schema na frente (`on pokemon_instances`) vale nos DOIS: o
 * schema `dev` e gerado das mesmas migrations por
 * `scripts/clone-schema-to-dev.js`, que troca a qualificacao e roda o resto com
 * `search_path` em `dev`. Tratar como so-public deixaria o `dev` sem guarda
 * nenhuma -- e foi exatamente no `dev` que o furo apareceu primeiro.
 */
function schemasDe(prefixo: string | undefined): readonly string[] {
  return prefixo ? [prefixo.toLowerCase()] : SCHEMAS
}

interface Estado {
  /** Policies vivas da tabela alvo, por `schema|nome`. */
  policies: Map<string, string>
  /** Views vivas, por nome qualificado. */
  views: Map<string, string>
}

function replay(): Estado {
  const policies = new Map<string, string>()
  const views = new Map<string, string>()

  for (const m of SQL.matchAll(RELEVANTE)) {
    const statement = m[0].replace(/\s+/g, ' ').trim()
    const nome = (statement.match(/"([^"]+)"/)?.[1] ?? '').toLowerCase()
    const criaPolicy = m[2] !== undefined
    const derrubaPolicy = m[4] !== undefined

    if (criaPolicy || derrubaPolicy) {
      if ((m[2] ?? m[4] ?? '').toLowerCase() !== ALVO) continue
      for (const schema of schemasDe(m[1] ?? m[3])) {
        if (criaPolicy) policies.set(`${schema}|${nome}`, statement)
        else policies.delete(`${schema}|${nome}`)
      }
      continue
    }

    const view = (m[5] ?? m[6] ?? '').toLowerCase()
    if (m[5] !== undefined) views.set(view, statement)
    else views.delete(view)
  }

  return { policies, views }
}

const { policies, views } = replay()

/** As policies vivas de um schema so. */
function policiesDe(schema: string): string[] {
  return [...policies.entries()].filter(([k]) => k.startsWith(`${schema}|`)).map(([, s]) => s)
}

describe('RLS de pokemon_instances (PH-105)', () => {
  // Guarda anti-teste-vacuo: se o glob mudar de caminho ou o replay parar de
  // reconhecer os statements, TODAS as assercoes abaixo passariam sem ler uma
  // linha de SQL.
  it('as migrations foram lidas e o replay reconheceu o SQL', () => {
    expect(ARQUIVOS.length).toBeGreaterThan(50)
    expect(SQL).toContain(ALVO)
    expect(policies.size, 'nenhuma policy viva em pokemon_instances — replay quebrado?').toBeGreaterThan(0)
    expect(views.size, 'nenhuma view viva — replay quebrado?').toBeGreaterThan(0)
  })

  // Os dois schemas separados, e nao um so: o par `_public.sql`/`_dev.sql` e
  // manual, entao esquecer um dos dois arquivos e o erro mais provavel aqui --
  // e o que reprova nele tem que dizer QUAL faltou.
  for (const schema of SCHEMAS) {
    it(`nenhuma policy viva libera a tabela inteira em ${schema}`, () => {
      const frouxas = policiesDe(schema).filter((s) => /using\s*\(\s*true\s*\)/i.test(s))

      expect(
        frouxas,
        `policy viva com \`using (true)\` em ${schema}.pokemon_instances — o furo do PH-105 voltou`,
      ).toEqual([])
    })

    it(`o dono continua lendo os proprios POKE em ${schema}`, () => {
      // O contrapeso do teste acima: fechar demais quebraria o jogo inteiro, e
      // um teste que so proibe nao veria isso.
      expect(
        policiesDe(schema).some((s) => /auth\.uid\(\)\s*\)?\s*=\s*user_id/i.test(s)),
        `nenhuma policy restringe a leitura ao dono em ${schema} — o jogador nao le os proprios POKE`,
      ).toBe(true)
    })
  }

  it('nenhuma view viva le a tabela com a permissao de quem chama', () => {
    const lendoOAlvo = [...views.entries()].filter(([, s]) => s.includes(ALVO))

    // Guarda anti-teste-vacuo desta assercao: sem o ranking na lista, o filtro
    // abaixo estaria olhando um conjunto vazio e aprovando tudo.
    for (const schema of SCHEMAS) {
      expect(
        lendoOAlvo.map(([nome]) => nome),
        `nenhuma view de ${schema} le pokemon_instances — o ranking sumiu do SQL?`,
      ).toContain(`${schema}.ranking_pokemon`)
    }

    const comInvoker = lendoOAlvo
      .filter(([, s]) => /security_invoker\s*=\s*true/i.test(s))
      .map(([nome]) => nome)
    expect(
      comInvoker,
      'view `security_invoker` lendo pokemon_instances: ela roda com a permissao de quem chama, ' +
        'entao ou o ranking volta vazio, ou a tabela voltou a ser publica',
    ).toEqual([])
  })
})
