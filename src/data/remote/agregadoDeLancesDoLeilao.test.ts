// PH-128 — agregar `market_offers` numa view `security_invoker` devolve numero
// diferente para cada jogador.
//
// `security_invoker = true` faz a view rodar com a permissao de QUEM CHAMA. A
// RLS de `market_offers` (correta, e que fica como esta) so libera a oferta de
// quem a fez e a recebida por quem vende. Um `count(*)` ali dentro conta o
// subconjunto visivel e apresenta como total: no leilao reproduzido em `dev`, o
// vendedor via 1 oferta, quem foi coberto via 0, e um espectador via 0.
//
// O defeito NASCEU e RENASCEU do mesmo jeito: a view foi criada com
// `security_invoker = true` em `20260811235800` e recriada com a mesma opcao em
// `20260823070000`, quando o leilao a reescreveu a partir do texto antigo.
// Copiar o `create view` de uma migration anterior e o caminho normal de
// trabalho aqui — entao a guarda tem que estar no teste, nao na lembranca.
//
// A verificacao de verdade (tres tokens contra o banco, comparando com a
// contagem por `service_role`) e de deploy: nao roda no Vitest sem rede nem
// credencial. Isto tranca o que da pra trancar — o SQL versionado.
import { describe, expect, it } from 'vitest'

// `?raw` via `import.meta.glob`: `src/` nao tem os types de node, mesma razao
// documentada em `render/ambiente.test.ts`.
const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Ordem de aplicacao e a ordem do nome do arquivo (timestamp na frente). */
const ARQUIVOS = Object.keys(MIGRATIONS).sort()

/** Comentario `--` sai antes de qualquer casamento — este arquivo cita SQL. */
const SQL = ARQUIVOS.map((f) => MIGRATIONS[f].replace(/--[^\n]*/g, '')).join('\n')

const SCHEMAS = ['public', 'dev'] as const

/**
 * Replay de `create view` / `drop view` na ordem, porque `drop` seguido de
 * `create` do mesmo nome e o jeito idiomatico de reescrever uma view — juntar os
 * `drop` num conjunto concluiria que ela nao existe.
 */
function viewsVivas(): Map<string, string> {
  const vivas = new Map<string, string>()
  const re = /create (?:or replace )?view\s+(\w+\.\w+)[\s\S]*?;|drop view\s+(?:if exists\s+)?(\w+\.\w+)\s*;/gi
  for (const m of SQL.matchAll(re)) {
    const statement = m[0].replace(/\s+/g, ' ').trim()
    if (m[1] !== undefined) vivas.set(m[1].toLowerCase(), statement)
    else vivas.delete((m[2] ?? '').toLowerCase())
  }
  return vivas
}

const VIVAS = viewsVivas()
const TABELA_COM_RLS_RESTRITIVA = 'market_offers'

describe('agregado de lances do leilao (PH-128)', () => {
  // Guarda anti-teste-vacuo: sem view viva, ou sem nenhuma que toque
  // `market_offers`, a assercao abaixo passaria olhando um conjunto vazio.
  it('o replay achou as views do Mercado', () => {
    expect(ARQUIVOS.length).toBeGreaterThan(50)
    for (const schema of SCHEMAS) {
      expect(
        [...VIVAS.keys()],
        `${schema}.mercado_anuncios_ativos nao esta viva — a vitrine sumiu do SQL?`,
      ).toContain(`${schema}.mercado_anuncios_ativos`)
    }
  })

  it('nenhuma view viva agrega market_offers com a permissao de quem chama', () => {
    const queTocam = [...VIVAS.entries()].filter(([, s]) => s.includes(TABELA_COM_RLS_RESTRITIVA))

    expect(
      queTocam.map(([nome]) => nome),
      'nenhuma view le market_offers — o replay quebrou?',
    ).toContain('public.mercado_anuncios_ativos')

    const comInvoker = queTocam
      .filter(([, s]) => /security_invoker\s*=\s*true/i.test(s))
      .map(([nome]) => nome)

    // `mercado_ofertas_recebidas` e a excecao legitima: ela ENTREGA a linha da
    // oferta pro vendedor, e depender da RLS dele e justamente o desenho. Uma
    // view que so devolve `count`/`max` nao tem essa desculpa.
    const excecoes = new Set(SCHEMAS.map((s) => `${s}.mercado_ofertas_recebidas`))
    const proibidas = comInvoker.filter((nome) => !excecoes.has(nome))

    expect(
      proibidas,
      'view `security_invoker` agregando market_offers: o numero vai sair diferente para cada ' +
        'jogador, porque a RLS da tabela so mostra a oferta propria e a recebida',
    ).toEqual([])
  })
})
