// A traducao do save antigo existe DUAS VEZES, e nada obrigava as duas a
// concordarem (PH-429/440).
//
// Uma vive em TypeScript (`data/progressoDeBioma.ts#lerProgressoPorBioma`) e
// roda a cada carga, no cliente e na Edge Function. A outra vive em PL/pgSQL
// (as migrations de dado) e roda uma vez, no backfill. As duas leem o mesmo
// `{"faixa1": N, ...}` e tem que produzir o MESMO `{"marinho": E, ...}`.
//
// SE ELAS DIVERGIREM, o sintoma nao e um erro: e o progresso do jogador mudando
// sozinho. O backfill escreve um valor, a carga seguinte le e reescreve outro, e
// o gate de entrada responde uma coisa antes do primeiro flush e outra depois.
//
// Este teste nao executa o SQL — ele tranca os numeros de que a traducao
// depende, nos dois lados: a ordem congelada dos biomas, o estagio de cada
// faixa, o fato de o maximo ser 9 (o estagio 10 nunca e concedido) e, desde a
// PH-440, o passo que preserva o progresso ja em formato de bioma. Concordar na
// formula nao basta; e a tabela que precisa ser a mesma.
import { describe, expect, it } from 'vitest'

import { ORDEM_LEGADA_DOS_BIOMAS, lerProgressoPorBioma } from './progressoDeBioma'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

// As DUAS levas que traduzem progresso: a da PH-429 (conversao original) e a da
// PH-440 (conserto da linha mista). As duas implementam a MESMA tabela.
const PARES = Object.entries(MIGRATIONS)
  .filter(([c]) => c.includes('progresso_por_estagio') || c.includes('progresso_misto'))
  .map(([caminho, sql]) => [caminho.split('/').pop()!, sql] as const)
  .sort()

const DA_CONVERSAO = PARES.filter(([n]) => n.includes('progresso_por_estagio'))
const DO_MISTO = PARES.filter(([n]) => n.includes('progresso_misto'))

describe('a varredura achou os pares de migration', () => {
  it('existem os quatro arquivos, e nao um so', () => {
    // Guarda anti-vacuo: com o glob quebrado ou um arquivo renomeado, todo
    // teste abaixo passaria medindo lista vazia.
    expect(PARES.map(([nome]) => nome)).toEqual([
      '20260902120000_progresso_por_estagio_public.sql',
      '20260902120001_progresso_por_estagio_dev.sql',
      '20260902130000_progresso_misto_public.sql',
      '20260902130001_progresso_misto_dev.sql',
    ])
  })

  it('cada metade mexe SO no proprio schema', () => {
    // Um par que aponta pro mesmo schema aplica a mudanca duas vezes num lado e
    // nenhuma no outro, e nada estoura.
    for (const [nome, sql] of PARES) {
      const ehDev = nome.endsWith('_dev.sql')
      expect(sql.includes('dev.players'), nome).toBe(ehDev)
      expect(sql.includes('public.players'), nome).toBe(!ehDev)
    }
  })
})

describe('a tabela de traducao e a mesma nos dois lados', () => {
  it('a ordem congelada do SQL e, na ordem, a mesma do TypeScript', () => {
    for (const [nome, sql] of PARES) {
      // O array literal do `do $$` — a lista que o indice de `faixa1` percorre.
      const bloco = sql.match(/v_ordem text\[\] := array\[([\s\S]*?)\]/)
      expect(bloco, `${nome}: nao achei v_ordem`).toBeTruthy()
      const doSql = [...bloco![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
      expect(doSql, nome).toEqual([...ORDEM_LEGADA_DOS_BIOMAS])
    }
  })

  it('o estagio de cada faixa e o mesmo: 3, 6, 9', () => {
    for (const [nome, sql] of PARES) {
      const faixas = sql.match(/v_faixas text\[\] := array\[([\s\S]*?)\]/)
      const estagios = sql.match(/v_estagios int\[\] := array\[([\s\S]*?)\]/)
      expect(faixas, `${nome}: nao achei v_faixas`).toBeTruthy()
      expect(estagios, `${nome}: nao achei v_estagios`).toBeTruthy()
      expect([...faixas![1].matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1]), nome)
        .toEqual(['faixa1', 'faixa2', 'faixa3'])
      expect([...estagios![1].matchAll(/\d+/g)].map((m) => Number(m[0])), nome)
        .toEqual([3, 6, 9])
    }

    // E o TypeScript produz exatamente esses tres numeros pros mesmos casos.
    expect(lerProgressoPorBioma({ faixa1: 1, faixa2: 0, faixa3: 0 }).campo_aberto).toBe(3)
    expect(lerProgressoPorBioma({ faixa1: 0, faixa2: 1, faixa3: 0 }).campo_aberto).toBe(6)
    expect(lerProgressoPorBioma({ faixa1: 0, faixa2: 0, faixa3: 1 }).campo_aberto).toBe(9)
  })

  it('nenhum dos dois lados concede o estagio 10', () => {
    for (const [nome, sql] of PARES) {
      const estagios = [...sql.matchAll(/v_estagios int\[\] := array\[([\s\S]*?)\]/g)]
        .flatMap((m) => [...m[1].matchAll(/\d+/g)].map((n) => Number(n[0])))
      expect(Math.max(...estagios), nome).toBe(9)
    }
    expect(Math.max(...Object.values(
      lerProgressoPorBioma({ faixa1: 12, faixa2: 12, faixa3: 12 }),
    ))).toBe(9)
  })

  it('o default novo da coluna tem os 12 biomas em zero, e nenhuma faixa', () => {
    // So o par da PH-429 mexe no default; o da PH-440 e so correcao de dado.
    for (const [nome, sql] of DA_CONVERSAO) {
      const bloco = sql.match(/alter column bioma_progress set default\s*([\s\S]*?)::jsonb/)
      expect(bloco, `${nome}: nao achei o default novo`).toBeTruthy()
      const json = JSON.parse(bloco![1].trim().replace(/^'|'$/g, '')) as Record<string, number>
      expect(Object.keys(json).sort(), nome).toEqual([...ORDEM_LEGADA_DOS_BIOMAS].sort())
      expect(Object.values(json).every((v) => v === 0), nome).toBe(true)
      expect(json).not.toHaveProperty('faixa1')
    }
  })
})

describe('as migrations de dado cumprem a regra propria do projeto', () => {
  it('sao idempotentes pelo filtro, e dizem isso no arquivo', () => {
    for (const [nome, sql] of PARES) {
      // O filtro E a idempotencia: linha ja convertida nao tem chave de faixa,
      // entao o `where` nao a alcanca numa segunda execucao.
      expect(sql, nome).toContain("bioma_progress ?| array['faixa1', 'faixa2', 'faixa3']")
      expect(sql.toLowerCase(), nome).toContain('idempotente')
    }
  })

  it('tem o teto que impede ler fora do array de biomas', () => {
    // Uma linha real do banco tem `faixa2: 12`, o total de biomas. Sem o
    // `least`, o laco de 1..12 leria `v_ordem[13]` (null em PL/pgSQL) e
    // gravaria uma chave nula no jsonb.
    for (const [nome, sql] of PARES) {
      expect(sql, nome).toContain('least(greatest(v_quantos, 0), array_length(v_ordem, 1))')
    }
  })

  it('usam MAXIMO ao sobrepor faixas, e nao atribuicao', () => {
    // As tres faixas se sobrepoem nos primeiros biomas, e no dado real elas nao
    // vem em ordem crescente (`faixa1: 11` com `faixa2: 12`). Atribuir em vez
    // de maximizar deixaria o progresso na ultima faixa processada.
    for (const [nome, sql] of PARES) {
      expect(sql, nome).toContain('greatest(v_atual, v_estagios[j])')
    }
  })
})

// PH-440: o conserto da linha mista tem um passo que a PH-429 nao tinha, e e
// ele que impede a perda de progresso. Sem o PASSO 1, `v_novo` nasce zerado e a
// traducao das faixas escreve por cima do progresso de bioma que ja estava la.
describe('o conserto da linha mista preserva o que ja era bioma (PH-440)', () => {
  it('existe o par, e nao um so', () => {
    expect(DO_MISTO.length).toBe(2)
  })

  it('parte do valor que ja esta no banco, e nao de zero', () => {
    for (const [nome, sql] of DO_MISTO) {
      expect(sql, nome).toContain(
        'v_doBanco := coalesce((v_jogador.bioma_progress ->> v_bioma)::int, 0)',
      )
    }
  })

  it('apara o valor lido pra regua — 99 gravado por engano nao pode virar acesso', () => {
    for (const [nome, sql] of DO_MISTO) {
      expect(sql, nome).toContain('least(greatest(v_doBanco, 0), 10)')
    }
  })

  it('e o TypeScript preserva o mesmo objeto misto que o SQL preserva', () => {
    // Copia literal de uma linha de `public` em 02/09. Os dois lados leem esta
    // linha; se so um preservar, o outro a desfaz na leitura ou na escrita
    // seguinte.
    const doBanco = {
      mata: 9, igneo: 0, aridos: 0, gelido: 0, urbano: 3, marinho: 9,
      sagrado: 0, sombrio: 0, industrial: 9, subterraneo: 9, campo_aberto: 9,
      aguas_interiores: 6, faixa1: 0, faixa2: 0, faixa3: 0,
    }
    const lido = lerProgressoPorBioma(doBanco)
    expect(lido.mata).toBe(9)
    expect(lido.aguas_interiores).toBe(6)
    expect(lido.urbano).toBe(3)
    expect(lido).not.toHaveProperty('faixa1')
  })
})
