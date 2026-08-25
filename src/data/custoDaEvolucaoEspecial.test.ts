// PH-136 — o custo da evolucao especial mora em DOIS lugares, e eles tem que
// concordar.
//
// Quem decide se a evolucao acontece e a RPC `evoluir_poke` (`v_stone_count`).
// `SPECIAL_EVOLUTION_STONE_COUNT` no cliente so ANTECIPA a resposta pra tela
// poder dizer "faltam N" antes de chamar. Divergir nao da erro de compilacao
// nem de teste unitario — da uma das duas coisas, as duas silenciosas:
//
//   cliente MAIOR que servidor -> quem tem estoque entre os dois numeros ve
//     "nao pode" e nunca tenta, mesmo com o servidor aceitando.
//   cliente MENOR que servidor -> a acao sai, o servidor recusa com P0001, e o
//     jogador leva erro no meio de uma acao que a tela dizia estar liberada.
//
// E o padrao "limite de negocio so no cliente" que ja e regra critica deste
// projeto (CLAUDE.md). Aqui ele tem teste.
import { describe, expect, it } from 'vitest'

import { SPECIAL_EVOLUTION_LEVEL, SPECIAL_EVOLUTION_STONE_COUNT } from './pokes'

// `?raw` via `import.meta.glob`: `src/` nao tem os types de node — mesma razao
// documentada em `render/ambiente.test.ts`.
const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Ordem de aplicacao e a ordem do nome do arquivo (timestamp na frente). */
const ARQUIVOS = Object.keys(MIGRATIONS).sort()

/**
 * A ULTIMA definicao de `evoluir_poke` de cada schema e a que vale — a funcao
 * foi redefinida varias vezes por `create or replace`, e ler a primeira daria
 * o valor de uma versao morta.
 */
function ultimoCustoNoServidor(schema: 'public' | 'dev'): { arquivo: string; custo: number } | null {
  let achado: { arquivo: string; custo: number } | null = null
  for (const arquivo of ARQUIVOS) {
    const sql = MIGRATIONS[arquivo].replace(/--[^\n]*/g, '')
    const re = new RegExp(`create or replace function\\s+${schema}\\.evoluir_poke[\\s\\S]*?\\$\\$;`, 'i')
    const corpo = sql.match(re)?.[0]
    if (!corpo) continue
    const custo = corpo.match(/v_stone_count\s+int\s*:=\s*(\d+)/i)?.[1]
    if (custo) achado = { arquivo, custo: Number(custo) }
  }
  return achado
}

describe('custo da evolucao especial (PH-136)', () => {
  it('o valor pretendido e 40 pedras no nivel 80', () => {
    // Literal de propósito: e a guarda contra mudanca acidental. Um teste que
    // comparasse a constante com ela mesma concordaria com qualquer valor.
    expect(SPECIAL_EVOLUTION_STONE_COUNT).toBe(40)
    expect(SPECIAL_EVOLUTION_LEVEL).toBe(80)
  })

  for (const schema of ['public', 'dev'] as const) {
    it(`o servidor cobra o MESMO que o cliente em ${schema}`, () => {
      const servidor = ultimoCustoNoServidor(schema)

      // Guarda anti-teste-vacuo: sem achar a funcao, a comparacao abaixo nunca
      // rodaria e o teste passaria dizendo nada.
      expect(
        servidor,
        `nao achei \`v_stone_count\` em nenhuma definicao de ${schema}.evoluir_poke — ` +
          'a funcao foi renomeada, ou a variavel mudou de nome',
      ).not.toBeNull()

      expect(
        servidor!.custo,
        `${schema}.evoluir_poke (em ${servidor!.arquivo}) cobra ${servidor!.custo} pedras e o cliente ` +
          `pede ${SPECIAL_EVOLUTION_STONE_COUNT} — mudar um sem o outro quebra a evolucao em silencio`,
      ).toBe(SPECIAL_EVOLUTION_STONE_COUNT)
    })
  }

  it('o par _public/_dev da ultima mudanca de custo existe', () => {
    // Esquecer um dos dois arquivos e o erro mais provavel no fluxo de schema
    // deste projeto, e ele reprova o gate de CI so DEPOIS do merge.
    const dePublic = ultimoCustoNoServidor('public')
    const deDev = ultimoCustoNoServidor('dev')
    expect(dePublic!.custo).toBe(deDev!.custo)
  })
})
