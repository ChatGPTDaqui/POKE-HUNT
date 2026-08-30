// Toda coluna que `gameStateToPlayerRow` monta e de fato GRAVADA pela RPC
// `gravar_progresso`.
//
// POR QUE ESTE TESTE EXISTE (PH-284)
//
// A RPC escreve `players` com uma lista fixa de colunas escrita a mao em SQL, e
// o patch chega como `jsonb` — ou seja, chave a mais no patch nao e erro de
// nada: nao quebra o type-check (o TS nunca ve a funcao), nao quebra o
// PostgREST (jsonb aceita qualquer objeto) e nao vira log. A coluna
// `bioma_progress` ficou 2 dias sendo mandada em todo flush e descartada em
// silencio, e o unico sintoma visivel foi o menu de hunt dizendo "Bloqueado"
// pra sempre depois de o jogador fechar o ciclo de 10 salas cinco vezes.
//
// A alternativa "lembrar de atualizar a RPC" ja falhou uma vez, e falha do
// jeito mais caro possivel: a coluna nova e sempre de uma feature nova, entao
// quem paga e a feature que acabou de subir.
//
// `?raw` via `import.meta.glob`: `src/` nao tem os types de node, mesmo padrao
// de src/data/custoDeEspecialidade.test.ts e vizinhos.
import { describe, expect, it } from 'vitest'
import { gameStateToPlayerRow } from './remote/playerMapper'
import { defaultGameStateData } from '@/stores/gameStateDefaults'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const USER = '00000000-0000-4000-8000-000000000001'

/**
 * A definicao VIGENTE de `gravar_progresso` num schema: a ultima migration, em
 * ordem de carimbo, que a (re)cria. Nao serve procurar pela funcao pelo nome do
 * arquivo — o nome muda a cada correcao, e e exatamente por isso que este teste
 * varre o diretorio em vez de apontar pra um arquivo fixo.
 */
function definicaoVigente(schema: 'public' | 'dev'): { arquivo: string; sql: string } {
  const marca = new RegExp(`create\\s+or\\s+replace\\s+function\\s+${schema}\\.gravar_progresso\\b`, 'i')
  const achados = Object.entries(MIGRATIONS)
    .filter(([, sql]) => marca.test(sql))
    .sort(([a], [b]) => a.localeCompare(b))
  const ultimo = achados[achados.length - 1]
  expect(ultimo, `nenhuma migration cria ${schema}.gravar_progresso`).toBeDefined()
  return { arquivo: ultimo[0], sql: ultimo[1] }
}

/** As colunas atribuidas no `update <schema>.players set ... where`. */
function colunasAtribuidas(sql: string, schema: 'public' | 'dev'): Set<string> {
  const inicio = sql.search(new RegExp(`update\\s+${schema}\\.players\\s+set`, 'i'))
  expect(inicio, `nao achei o UPDATE de ${schema}.players`).toBeGreaterThanOrEqual(0)
  const resto = sql.slice(inicio)
  const fim = resto.search(/\n\s*where\s/i)
  expect(fim, 'nao achei o WHERE que fecha o UPDATE').toBeGreaterThan(0)
  const corpo = resto.slice(0, fim)
  // So o inicio de linha conta: `updated_at = p_updated_at_esperado` mora no
  // WHERE (ja cortado) e `array_agg(x)` nao tem `=`, entao nada de dentro das
  // subqueries entra por acidente.
  return new Set([...corpo.matchAll(/^\s*([a-z_]+)\s*=/gim)].map((m) => m[1].toLowerCase()))
}

const CHAVES_DO_MAPPER = Object.keys(gameStateToPlayerRow(USER, defaultGameStateData()))
  // `user_id` identifica a linha no WHERE — nunca e coluna do SET.
  .filter((k) => k !== 'user_id')

describe('a bancada le alguma coisa', () => {
  it('as migrations foram varridas e o mapper produziu colunas', () => {
    expect(Object.keys(MIGRATIONS).length).toBeGreaterThan(10)
    expect(CHAVES_DO_MAPPER.length).toBeGreaterThan(10)
  })
})

describe.each(['public', 'dev'] as const)('gravar_progresso no schema %s', (schema) => {
  it('grava TODA coluna que `gameStateToPlayerRow` manda no patch', () => {
    const { arquivo, sql } = definicaoVigente(schema)
    const gravadas = colunasAtribuidas(sql, schema)
    const esquecidas = CHAVES_DO_MAPPER.filter((c) => !gravadas.has(c))
    expect(
      esquecidas,
      `${arquivo}: \`gameStateToPlayerRow\` manda ${esquecidas.join(', ')} no patch, e o UPDATE de `
      + `${schema}.players nao atribui essa(s) coluna(s). O flush descarta o valor em silencio — foi `
      + 'assim que `bioma_progress` ficou preso em 0 (PH-284).',
    ).toEqual([])
  })

  it('nao atribui coluna que o mapper nao manda — patch mudo apagaria o valor', () => {
    const { arquivo, sql } = definicaoVigente(schema)
    // Colunas de `players` que tem OUTRA dona (RPC propria chamada pela tela) e
    // que o flush nunca pode reescrever. `auto_lure_config` e o caso nomeado em
    // playerMapper.ts: quem escreve e `configurar_auto`, e manda-la no flush
    // criaria a corrida "o flush grava a config velha por cima da que o jogador
    // acabou de escolher".
    const sobrando = [...colunasAtribuidas(sql, schema)].filter((c) => !CHAVES_DO_MAPPER.includes(c))
    expect(
      sobrando,
      `${arquivo}: o UPDATE atribui ${sobrando.join(', ')}, que \`gameStateToPlayerRow\` nao monta. `
      + 'Com a chave ausente do patch, o `->` devolve NULL e o flush apaga a coluna a cada janela.',
    ).toEqual([])
  })
})
