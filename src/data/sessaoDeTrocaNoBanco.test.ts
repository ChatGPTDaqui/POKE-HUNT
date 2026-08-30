// PH-120, fatia 1 — a mesa de troca no banco bate com o que o TypeScript diz.
//
// Nada aqui executa SQL: o teste LE a migration e confere as decisoes que o
// projeto ja pagou caro pra aprender. E o mesmo mecanismo de
// `limiteDeSessaoInativa` (PH-277) e `gravarProgressoCobreOMapper` (PH-284).
//
// AS ARMADILHAS QUE ELE GUARDA, e todas ja aconteceram neste repositorio:
//
//   SESSAO DUPLA        `CLAUDE.md`: indice UNIQUE tem de ser PARCIAL no banco.
//                       Validacao de cliente nao impede duplo-clique — e o mesmo
//                       defeito que ja abriu duas sessoes de hunt.
//   `record IS NOT NULL` falso quando qualquer campo e nulo. Quebrou o escrow do
//                       leilao. Aqui todo teste de existencia usa `found`.
//   PAR PUBLIC/DEV      migration que so existe num schema deixa o outro sem a
//                       feature — e o gate de CI reprova a PR seguinte de
//                       qualquer um.
//   NUMERO EM DOIS      prazo no SQL e prazo no TS divergem em silencio: a tela
//   LUGARES             diz "faltam 15 min" numa mesa que o banco fecha aos 5.
import { describe, expect, it } from 'vitest'
import { TROCA_MINUTOS_ATE_EXPIRAR, ESTADOS_DE_TROCA, ESTADOS_VIVOS, trocaViva } from './troca'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

function migration(sufixo: string): string {
  const chave = Object.keys(MIGRATIONS).find((k) => k.endsWith(sufixo))
  if (!chave) throw new Error(`migration nao encontrada: ${sufixo}`)
  return MIGRATIONS[chave]
}

const PUBLICO = migration('_sessao_de_troca_public.sql')
const DEV = migration('_sessao_de_troca_dev.sql')

describe('a varredura enxergou as duas migrations (PH-120)', () => {
  it('o glob casou com os arquivos de verdade', () => {
    // Guarda anti-vacuo: com o glob quebrado, todo caso abaixo passaria medindo
    // string vazia.
    expect(PUBLICO).toContain('create table if not exists public.troca_sessao')
    expect(DEV).toContain('create table if not exists dev.troca_sessao')
  })

  it('o par nao compartilha carimbo', () => {
    // Mesmo prefixo = mesma versao pro CLI, e isso trava TODO deploy (PH-249).
    const nomes = Object.keys(MIGRATIONS)
      .filter((k) => k.includes('sessao_de_troca'))
      .map((k) => k.split('/').pop()!.split('_')[0])
    expect(new Set(nomes).size).toBe(2)
  })
})

describe('sessao dupla e impossivel no BANCO, nao so no cliente (PH-120)', () => {
  for (const [schema, sql] of [['public', PUBLICO], ['dev', DEV]] as const) {
    it(`${schema}: os dois indices parciais existem, um por papel`, () => {
      // Dois, e nao um: o mesmo jogador pode aparecer como anfitriao OU como
      // convidado, e um indice sobre uma coluna so nao alcanca a outra.
      expect(sql).toContain(`create unique index if not exists troca_sessao_anfitriao_viva`)
      expect(sql).toContain(`create unique index if not exists troca_sessao_convidado_viva`)
    })

    it(`${schema}: CADA indice unico e parcial, so sobre as vivas`, () => {
      // Sem o `where`, a primeira troca concluida impediria o jogador de trocar
      // de novo pra sempre.
      //
      // A conferencia e por INDICE, e nao "existe um `where` no arquivo": o
      // mesmo `where estado in (...)` aparece nas RPCs, entao contar ocorrencias
      // soltas deixaria passar um indice sem corte nenhum.
      const indices = [...sql.matchAll(/create unique index[\s\S]*?;/g)].map((m) => m[0])
      expect(indices.length, 'os dois indices unicos precisam existir').toBe(2)
      for (const indice of indices) {
        expect(indice, `indice sem corte de estado:\n${indice}`)
          .toContain("where estado in ('convidada', 'aberta')")
      }
    })

    it(`${schema}: ninguem troca consigo mesmo, e isso e constraint`, () => {
      expect(sql).toContain('check (anfitriao_id <> convidado_id)')
    })
  }
})

describe('as duas metades do par dizem a mesma coisa (PH-120)', () => {
  it('o SQL de dev e o de public so diferem no schema e no nome do job', () => {
    // A primeira linha sai fora: e o titulo, e o do espelho diz que e espelho.
    // O resto tem de ser identico byte a byte depois de trocar o schema — e
    // dessa igualdade que sai a garantia de que os dois ambientes se comportam
    // igual, que e o que o gate `check` cobra na PR seguinte de qualquer um.
    const normalizar = (s: string) => s
      .split('\n').slice(1).join('\n')
      .replace(/\bdev\./g, 'public.')
      .replace(/'dev'/g, "'public'")
      .replace(/-dev'/g, "'")
    expect(normalizar(DEV)).toBe(normalizar(PUBLICO))
  })

  it('o job do cron tem nome PROPRIO em cada schema', () => {
    // Mesmo nome nos dois faria o segundo `cron.schedule` sobrescrever o
    // primeiro: um dos schemas ficaria sem varredura de expiracao, em silencio.
    expect(PUBLICO).toContain("'trocas-expirar'")
    expect(DEV).toContain("'trocas-expirar-dev'")
  })
})

describe('o prazo e o mesmo dos dois lados (PH-120)', () => {
  it(`o SQL usa ${TROCA_MINUTOS_ATE_EXPIRAR} minutos, como o TypeScript`, () => {
    const esperado = `interval '${TROCA_MINUTOS_ATE_EXPIRAR} minutes'`
    expect(PUBLICO).toContain(esperado)
    expect(DEV).toContain(esperado)
  })

  it('o prazo aparece nos DOIS momentos: no convite e no aceite', () => {
    // O relogio reinicia no aceite. Herdar o resto do convite daria dois minutos
    // pra fazer a troca inteira.
    const esperado = `interval '${TROCA_MINUTOS_ATE_EXPIRAR} minutes'`
    const ocorrencias = PUBLICO.split(esperado).length - 1
    expect(ocorrencias).toBeGreaterThanOrEqual(2)
  })
})

describe('os estados do TS sao os estados do CHECK (PH-120)', () => {
  it('a lista e a mesma, sem sobra dos dois lados', () => {
    const bloco = PUBLICO.match(/check \(estado in \(([^)]*)\)\)/)
    expect(bloco, 'o CHECK de estado sumiu do SQL').toBeTruthy()
    const noBanco = [...bloco![1].matchAll(/'([a-z]+)'/g)].map((m) => m[1])
    expect(noBanco.sort()).toEqual([...ESTADOS_DE_TROCA].sort())
  })

  it('so `convidada` e `aberta` contam como vivas, e o SQL concorda', () => {
    expect([...ESTADOS_VIVOS].sort()).toEqual(['aberta', 'convidada'])
    for (const estado of ESTADOS_DE_TROCA) {
      expect(trocaViva(estado)).toBe(ESTADOS_VIVOS.includes(estado))
    }
  })
})

describe('as armadilhas de PL/pgSQL que este repo ja pagou (PH-120)', () => {
  it('nenhum `record IS NOT NULL` — o escrow do leilao morreu disso', () => {
    // Em PL/pgSQL um record com QUALQUER campo nulo compara falso. `encerrada_em`
    // e nulo em toda sessao viva, entao o erro daria aqui na primeira leitura.
    for (const sql of [PUBLICO, DEV]) {
      expect(sql).not.toMatch(/\bis not null\s*then/i)
    }
    expect(PUBLICO).toContain('if not found then')
  })

  it('o aceite trava a linha antes de mudar o estado', () => {
    // Sem `for update`, duplo-clique le duas vezes 'convidada' e escreve duas
    // vezes 'aberta' — e na fatia 3 isso vira duas execucoes da mesma troca.
    expect(PUBLICO).toContain('for update')
  })

  it('so o convidado aceita, e so quem esta na mesa encerra', () => {
    expect(PUBLICO).toContain('So quem foi convidado pode aceitar.')
    expect(PUBLICO).toContain('Voce nao esta nesta troca.')
  })

  it('encerrar o que ja acabou e no-op, e nao erro', () => {
    // Duplo-clique em "cancelar" nao pode virar mensagem vermelha.
    expect(PUBLICO).toMatch(/if v_sessao\.estado not in \('convidada', 'aberta'\) then\s*\n\s*return v_sessao;/)
  })

  it('bloqueio usa a funcao que ja existe, nos dois sentidos', () => {
    // Repetir a consulta criaria uma segunda definicao de "bloqueado" pra
    // divergir da do Correio.
    expect(PUBLICO).toContain('public.bloqueio_entre(v_eu, p_convidado_id)')
    expect(DEV).toContain('dev.bloqueio_entre(v_eu, p_convidado_id)')
  })
})

describe('a escrita passa so pelas RPCs (PH-120)', () => {
  it('o cliente le a propria mesa e nao escreve nela', () => {
    expect(PUBLICO).toContain('grant select on public.troca_sessao to authenticated')
    // Um grant de escrita abriria rota paralela sem nenhuma das regras.
    expect(PUBLICO).not.toMatch(/grant[^;]*insert[^;]*on public\.troca_sessao to authenticated/)
    expect(PUBLICO).not.toMatch(/grant[^;]*update[^;]*on public\.troca_sessao to authenticated/)
  })

  it('a RLS limita a leitura a quem esta na mesa', () => {
    expect(PUBLICO).toContain('anfitriao_id = auth.uid() or convidado_id = auth.uid()')
    expect(PUBLICO).toContain('enable row level security')
  })

  it('a varredura global NAO e exposta ao cliente', () => {
    // `expirar_trocas` varre a tabela inteira; um cliente chamando em loop e um
    // ataque barato. `abrir_troca` a usa por dentro, que e o unico caminho de
    // cliente que precisa dela.
    expect(PUBLICO).toContain('grant execute on function public.expirar_trocas() to service_role')
    expect(PUBLICO).not.toContain('grant execute on function public.expirar_trocas() to authenticated')
  })

  it('a expiracao tem os DOIS caminhos: quem volta e quem nunca volta', () => {
    // So o cron deixaria o jogador lendo "voce ja esta numa troca" sobre uma
    // mesa vencida; so o acesso deixaria mesa vencida ocupando o indice de quem
    // nunca mais abrir o jogo (e, da fatia 2, POKE reservado junto).
    expect(PUBLICO).toContain('perform public.expirar_trocas();')
    expect(PUBLICO).toContain("cron.schedule('trocas-expirar'")
  })
})
