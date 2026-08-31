// PH-247 — os TIPOS de cada especie saem de uma fonte so, e ninguem pode
// divergir dela em silencio.
//
// POR QUE ISTO CUSTA CARO QUANDO QUEBRA
//
// A RPC `evoluir_poke` decide qual pedra o jogador precisa gastar com
// `coalesce(v_opcao.stone_type, v_species.type1)`, e a tela monta a exigencia
// com `stoneName(species.type)` do catalogo do CLIENTE. Enquanto os dois
// discordavam, Clefairy pedia Pedra de Fada na tela e Pedra Normal na RPC — o
// jogador farmava ~800 abates do tipo errado e a evolucao continuava recusada,
// sem erro que apontasse a causa.
//
// A MESMA divergencia ja tinha quebrado a PH-199 por outro caminho: a cadeia de
// missoes era derivada dos dois lados e discordava em 6 dos 18 tipos, com FAIRY
// logo na posicao 1.
//
// O QUE CADA BLOCO TRAVA
//
//  1. CLIENTE x catalog.json — o arquivo gerado nao pode ser editado a mao nem
//     ficar velho em relacao a sua propria fonte.
//  2. MIGRATION x catalog.json — o SQL que conserta o banco nao pode ter sido
//     escrito de cabeca. Ele so pode gravar o que o catalogo diz.
//
// O que este arquivo NAO consegue provar e o estado do banco REMOTO: vitest nao
// fala com o Postgres. Quem cobre isso e o gate `supabase-check`, e o
// argumento que fecha o buraco e estrutural — o banco so muda por migration
// (CLAUDE.local.md), entao travar a migration trava o valor que chega la.
import { describe, expect, it } from 'vitest'
import { SPECIES_DATA } from './generated/pokes.generated'
import catalogo from '../../scripts/usum/catalog.json'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

type EspecieDoCatalogo = { chave: string; tipo1: string; tipo2?: string | null }
const USUM = new Map<string, { t1: string; t2: string | null }>(
  (catalogo.especies as EspecieDoCatalogo[]).map((e) => [e.chave, { t1: e.tipo1, t2: e.tipo2 ?? null }]),
)

const PAR_DA_CORRECAO = Object.entries(MIGRATIONS)
  .filter(([nome]) => nome.includes('tipos_fairy_no_catalogo'))
  .sort(([a], [b]) => a.localeCompare(b))

describe('a bancada le alguma coisa', () => {
  it('catalogo, cliente e o par de migrations foram carregados', () => {
    // Sem isto, um glob quebrado ou um import vazio deixaria todo o resto
    // passando contra o nada.
    // 386 desde a PH-332 (Kanto + Johto + Hoenn). Era 251. Este numero e um
    // guarda anti-vacuo: ele existe pra o arquivo reprovar se o import vier
    // vazio, e nao pra congelar o tamanho do catalogo — mas atualiza-lo tem que
    // ser uma linha ESCRITA, do mesmo jeito que em `recorteDaPokedex.test.ts`.
    expect(USUM.size).toBe(386)
    expect(Object.keys(SPECIES_DATA).length).toBeGreaterThan(200)
    expect(PAR_DA_CORRECAO.map(([n]) => n.replace(/.*\//, ''))).toEqual([
      '20260830020000_tipos_fairy_no_catalogo_public.sql',
      '20260830020001_tipos_fairy_no_catalogo_dev.sql',
    ])
  })
})

describe('o catalogo do cliente nao diverge da fonte dele (PH-247)', () => {
  it('toda especie do elenco existe em catalog.json', () => {
    // O elenco (380) e um SUBCONJUNTO do catalogo (386) por construcao — ver
    // `sync-planilha.js#syncSpeciesAndMoves`. Uma especie no elenco e fora do
    // catalogo seria edicao a mao do arquivo gerado.
    const orfas = Object.keys(SPECIES_DATA).filter((id) => !USUM.has(id))
    expect(orfas, `especies no elenco que nao existem em catalog.json: ${orfas.join(', ')}`).toEqual([])
  })

  it('e concorda com ela em type1/type2, especie por especie', () => {
    const divergentes = Object.entries(SPECIES_DATA)
      .filter(([id, e]) => {
        const u = USUM.get(id)
        return u != null && (u.t1 !== e.type || u.t2 !== (e.type2 ?? null))
      })
      .map(([id, e]) => `${id}: cliente ${e.type}/${e.type2 ?? '-'} x catalog.json ${USUM.get(id)!.t1}/${USUM.get(id)!.t2 ?? '-'}`)
    expect(divergentes, divergentes.join('\n')).toEqual([])
  })
})

describe('a migration de tipos so grava o que catalog.json diz (PH-247)', () => {
  /** `update <schema>.species set type1 = 'X' where id in ('a','b') and ...` */
  function atribuicoes(sql: string): { coluna: string; valor: string; ids: string[] }[] {
    const re = /update\s+\w+\.species\s+set\s+(type1|type2)\s*=\s*'([A-Z]+)'\s*where\s+id\s*(?:=\s*'([a-z0-9_]+)'|in\s*\(([^)]+)\))/gi
    return [...sql.matchAll(re)].map((m) => ({
      coluna: m[1].toLowerCase(),
      valor: m[2],
      ids: m[3] ? [m[3]] : [...m[4].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]),
    }))
  }

  it.each(PAR_DA_CORRECAO)('%s grava o tipo que o catalogo tem', (nome, sql) => {
    const alvos = atribuicoes(sql)
    expect(alvos.length, `${nome}: nao achei nenhum UPDATE de tipo — o teste rodaria no vacuo`).toBeGreaterThan(0)
    for (const { coluna, valor, ids } of alvos) {
      for (const id of ids) {
        const u = USUM.get(id)
        expect(u, `${nome}: ${id} nao existe em catalog.json`).toBeDefined()
        const esperado = coluna === 'type1' ? u!.t1 : u!.t2
        expect(
          valor,
          `${nome}: grava ${coluna}='${valor}' em ${id}, mas catalog.json diz '${esperado}'. `
          + 'A migration nao pode inventar tipo — ela so propaga o catalogo.',
        ).toBe(esperado)
      }
    }
  })

  it.each(PAR_DA_CORRECAO)('%s e idempotente: todo UPDATE exige o valor ANTIGO no where', (nome, sql) => {
    // Sem o `and type1 = ...`/`type2 is null`, rodar de novo (ou rodar depois de
    // alguem corrigir a mao) reescreveria por cima. `db push` nao reaplica
    // migration ja registrada, mas migration de dado que so e segura porque o
    // CLI nao a repete e uma garantia de fora, nao do arquivo.
    for (const linha of sql.split(/;\s*/).filter((s) => /^\s*update/im.test(s))) {
      expect(
        linha,
        `${nome}: UPDATE sem guarda do valor antigo:\n${linha.trim()}`,
      ).toMatch(/where[\s\S]*\b(type1|type2)\s*(=|is)\s*/i)
    }
  })

  it('as duas migrations do par corrigem exatamente as mesmas especies', () => {
    // Par `_public`/`_dev` que diverge deixa staging e producao com catalogos
    // diferentes — a mesma classe de bug que esta issue veio fechar.
    const ids = PAR_DA_CORRECAO.map(([, sql]) =>
      [...new Set(atribuicoes(sql).flatMap((a) => a.ids))].sort().join(','))
    expect(ids[0]).toBe(ids[1])
  })

  it('corrige as 5 medidas, e Clefairy esta entre elas', () => {
    // Guarda contra "alguem simplificou e tirou uma". Clefairy e a unica cuja
    // divergencia quebra uma EVOLUCAO (as outras quatro nao evoluem por pedra,
    // ou divergem so no type2, que a RPC nao le).
    const ids = new Set(atribuicoes(PAR_DA_CORRECAO[0][1]).flatMap((a) => a.ids))
    expect([...ids].sort()).toEqual(['clefable', 'clefairy', 'mr__mime', 'togetic', 'wigglytuff'])
  })
})
