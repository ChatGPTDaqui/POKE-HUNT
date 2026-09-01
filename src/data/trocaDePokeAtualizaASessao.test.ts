// PH-399 — trocar o POKE em campo tem que apontar a SESSAO pro POKE novo.
//
// POR QUE UM TESTE DE FONTE. A troca mora inteira em PL/pgSQL (`definir_ativo`) e
// a suite nao tem Postgres; um teste com mock de banco provaria que os mocks
// concordam entre si. O que da pra travar de graca e o que importa aqui: que a
// clausula que aponta a sessao NAO desapareca num `create or replace` futuro —
// que e exatamente como ela nunca existiu (a funcao foi reescrita tres vezes
// desde a abertura e ninguem notou que `game_sessions` ficou de fora).
//
// O CUSTO DE ELA FALTAR, medido no `dev` em 01/09: um Scizor Lv 1 MORTO simulado
// pelo servidor por 703 segundos, zero abates, zero ouro, zero XP, sala travada
// em "Preparando a próxima área..." por mais de dez minutos — enquanto o cliente
// jogava com um Entei Lv 106 e matava normalmente.
import { describe, expect, it } from 'vitest'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

function migration(sufixo: string): string {
  const chave = Object.keys(MIGRATIONS).find((c) => c.endsWith(sufixo))
  if (!chave) throw new Error(`migration nao encontrada: ${sufixo}`)
  return MIGRATIONS[chave]
}

/**
 * Sem comentario e sem espaco duplicado — o que o Postgres de fato le.
 *
 * `[^\n]` e nao `.`: em JavaScript o `.` de uma regex nao casa `\r`, e o repo nao
 * tem `.gitattributes` — o mesmo commit chega em LF no runner e em CRLF aqui
 * (PH-252). Sem isso, um `toContain` passa VERDE casando o comentario que
 * DESCREVE a clausula, sem a clausula existir no SQL.
 */
function semComentario(sql: string): string {
  return sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim()
}

const PAR = {
  public: {
    sql: semComentario(migration('20260901170000_troca_de_poke_atualiza_a_sessao_public.sql')),
    schema: 'public',
  },
  dev: {
    sql: semComentario(migration('20260901170001_troca_de_poke_atualiza_a_sessao_dev.sql')),
    schema: 'dev',
  },
}

describe('o removedor de comentario sustenta o resto (PH-252)', () => {
  it('remove comentario em CRLF — a regressao exata', () => {
    expect(semComentario('select 1;\r\n-- some daqui\r\nselect 2;')).toBe('select 1; select 2;')
  })
})

describe.each(Object.values(PAR))('definir_ativo no schema $schema (PH-399)', ({ sql, schema }) => {
  it('aponta a sessao ABERTA pro POKE que entrou em campo', () => {
    // A clausula inteira, e nao so `game_sessions`: o que conserta o bug e o
    // trio (tabela certa, coluna certa, valor = o POKE recem-escolhido).
    expect(sql).toContain(`update ${schema}.game_sessions set poke_uid = p_poke_id`)
  })

  it('so a sessao ABERTA, e so a do proprio jogador', () => {
    // `closed_at is null` mantem sessao encerrada fora — reescrever o
    // `poke_uid` dela mexeria na heranca de sala (PH-266 le a ultima sessao
    // fechada daquele mapa). `user_id` e a fronteira de dado entre jogadores, e
    // a funcao e SECURITY DEFINER: sem ele, um id de POKE forjado escreveria na
    // sessao de outra pessoa.
    const clausula = sql.slice(sql.indexOf(`update ${schema}.game_sessions`))
    expect(clausula).toMatch(/where user_id = v_user_id and closed_at is null/)
  })

  it('continua rotacionando a equipe e zerando o indice ativo', () => {
    // O invariante `team[0]` = POKE em campo (PH-382) nao pode ter sido perdido
    // ao reescrever a funcao: sem estas duas linhas, a troca de POKE volta a
    // deixar a reserva mostrando quem esta em campo.
    expect(sql).toContain(`update ${schema}.pokemon_instances set team_slot = 0`)
    expect(sql).toContain(`update ${schema}.players set active_team_index = 0`)
  })

  it('continua tomando o advisory lock por jogador ANTES de escrever', () => {
    // PH-67: sem o lock, a troca corre contra o flush do mesmo jogador. E ele
    // tem que vir antes — a garantia de que rotacionar a equipe e apontar a
    // sessao acontecem sem janela entre as duas e o lock, nao a transacao.
    const lock = sql.indexOf('pg_advisory_xact_lock')
    const escrita = sql.indexOf(`update ${schema}.pokemon_instances`)
    expect(lock).toBeGreaterThan(-1)
    expect(lock).toBeLessThan(escrita)
  })

  it('continua recusando POKE que nao esta na equipe', () => {
    expect(sql).toContain('indice fora da equipe')
  })
})

describe('o par de migration (PH-399)', () => {
  it('nao compartilha carimbo — prefixo igual e a mesma versao pro CLI', () => {
    const chaves = Object.keys(MIGRATIONS).filter((c) => c.includes('troca_de_poke_atualiza_a_sessao'))
    expect(chaves).toHaveLength(2)
    const carimbos = chaves.map((c) => (c.match(/(\d{14})/) ?? [])[1])
    expect(new Set(carimbos).size, 'os dois arquivos tem o mesmo carimbo').toBe(2)
  })

  it('cada arquivo mexe SO no proprio schema', () => {
    // Um `public.` que vaze pro arquivo do dev aplica a mudanca no schema errado
    // e o outro fica sem — e o gate de CI nao pega isso.
    expect(PAR.dev.sql).not.toMatch(/update public\.(game_sessions|players|pokemon_instances)/)
    expect(PAR.public.sql).not.toMatch(/update dev\./)
  })
})
