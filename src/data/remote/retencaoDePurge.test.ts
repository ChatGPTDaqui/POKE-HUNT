// PH-126 — os jobs de retencao rodam no banco, longe de qualquer teste de
// runtime. O que da pra travar aqui e a FORMA deles, e sao tres invariantes que
// falham em silencio se alguem escrever o proximo purge no piloto automatico:
//
//   1. purge sem `limit` — o cron do Postgres nao tem timeout proprio. Um
//      primeiro purge numa tabela que acumulou meses vira uma transacao gigante
//      segurando a conexao, e ninguem descobre isso no PR.
//   2. purge de `game_sessions` que so apaga — `meu_perfil()` somava
//      `simulated_seconds` de TODAS as sessoes. Apagar sem creditar o total em
//      `tempo_jogado_arquivado` faz o tempo jogado ENCOLHER na tela do jogador.
//   3. purge que pega sessao ABERTA — `closed_at is null` e a sessao que esta
//      acontecendo agora; apagar significa perder a hunt em andamento.
//
// E, de quebra, a janela de "encerrando..." do Mercado, que e um numero
// duplicado entre o cron do leilao e um comentario do cliente.
import { describe, expect, it } from 'vitest'

// `?raw` via `import.meta.glob`: `src/` nao tem os types de node — mesma razao
// documentada em `custoDaEvolucaoEspecial.test.ts`.
const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const TEMPO_DE_LEILAO = import.meta.glob('/src/features/mercado/tempoDeLeilao.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Ordem de aplicacao e a ordem do nome do arquivo (timestamp na frente). */
const ARQUIVOS = Object.keys(MIGRATIONS).sort()

type Job = { nome: string; agenda: string; corpo: string; arquivo: string }

/**
 * Todo `cron.schedule('nome', 'agenda', $$corpo$$)` do historico, na ordem de
 * aplicacao. Nome de job e unico no banco e o projeto reagenda por
 * `unschedule` + `schedule`, entao vale sempre a ULTIMA ocorrencia — ler a
 * primeira daria a agenda de uma versao morta.
 */
function jobsVigentes(): Map<string, Job> {
  const vigentes = new Map<string, Job>()
  for (const arquivo of ARQUIVOS) {
    // Comentario fora antes de casar: os arquivos explicam a agenda velha em
    // prosa, e `-- select cron.schedule(...)` num exemplo casaria a regex.
    const sql = MIGRATIONS[arquivo].replace(/--[^\n]*/g, '')
    const re = /cron\.schedule\(\s*'([a-z0-9-]+)'\s*,\s*'([^']*)'\s*,\s*\$\$([\s\S]*?)\$\$\s*\)/gi
    for (const m of sql.matchAll(re)) {
      vigentes.set(m[1], { nome: m[1], agenda: m[2], corpo: m[3], arquivo })
    }
  }
  return vigentes
}

const JOBS = jobsVigentes()

describe('jobs de retencao (PH-126)', () => {
  it('a varredura acha os jobs que sabidamente existem', () => {
    // Guarda anti-teste-vacuo: se a regex parar de casar (formatacao nova,
    // aspas diferentes), os `for` abaixo iterariam vazio e o arquivo inteiro
    // passaria verde sem verificar nada.
    for (const nome of [
      'log-puller',
      'audit-logs-purge',
      'audit-logs-purge-dev',
      'leiloes-encerrar',
      'leiloes-encerrar-dev',
      'game-sessions-purge',
      'game-sessions-purge-dev',
      'chat-messages-purge',
      'chat-messages-purge-dev',
    ]) {
      expect(JOBS.has(nome), `job \`${nome}\` nao foi encontrado por \`cron.schedule\``).toBe(true)
    }
  })

  for (const [nome, job] of JOBS) {
    if (!/\bdelete\s+from\b/i.test(job.corpo)) continue
    it(`\`${nome}\` apaga em lote, com limit`, () => {
      expect(
        /\blimit\s+\d+/i.test(job.corpo),
        `\`${nome}\` (${job.arquivo}) apaga sem \`limit\`. O cron do Postgres nao tem ` +
          'timeout proprio: o primeiro purge de uma tabela acumulada viraria uma transacao ' +
          'gigante segurando a conexao.',
      ).toBe(true)
    })
  }

  for (const schema of ['public', 'dev'] as const) {
    const nome = schema === 'public' ? 'game-sessions-purge' : 'game-sessions-purge-dev'

    it(`\`${nome}\` nunca toca em sessao aberta`, () => {
      const job = JOBS.get(nome)!
      expect(
        job.corpo.includes('closed_at is not null'),
        `\`${nome}\` nao filtra \`closed_at is not null\` — sessao ABERTA e a hunt que esta ` +
          'acontecendo agora.',
      ).toBe(true)
    })

    it(`\`${nome}\` credita o tempo jogado que apagou`, () => {
      const job = JOBS.get(nome)!
      // O `insert` tem que estar no MESMO comando do `delete` (CTE): apagar e
      // creditar em statements separados deixa a janela em que o purge morre
      // no meio e o tempo jogado some de vez.
      expect(
        new RegExp(`insert\\s+into\\s+${schema}\\.tempo_jogado_arquivado`, 'i').test(job.corpo),
        `\`${nome}\` apaga sessao sem somar \`simulated_seconds\` em ` +
          `${schema}.tempo_jogado_arquivado — o tempo jogado do perfil andaria pra tras.`,
      ).toBe(true)
    })
  }
})

/** A ULTIMA definicao de uma funcao e a que vale (`create or replace`). */
function ultimaDefinicao(schema: 'public' | 'dev', funcao: string): { arquivo: string; corpo: string } | null {
  let achado: { arquivo: string; corpo: string } | null = null
  for (const arquivo of ARQUIVOS) {
    const sql = MIGRATIONS[arquivo].replace(/--[^\n]*/g, '')
    // `\$\$` e `\$function\$` : o historico deste projeto usa os dois
    // delimitadores, e o dump do PH-67 trouxe `CREATE` em maiusculas.
    const re = new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+${schema}\\.${funcao}\\s*\\([\\s\\S]*?\\$(function)?\\$;`,
      'i',
    )
    const corpo = sql.match(re)?.[0]
    if (corpo) achado = { arquivo, corpo }
  }
  return achado
}

describe('o tempo jogado sobrevive a retencao (PH-126)', () => {
  for (const schema of ['public', 'dev'] as const) {
    it(`${schema}.meu_perfil soma o arquivado`, () => {
      const def = ultimaDefinicao(schema, 'meu_perfil')
      expect(def, `nao achei nenhuma definicao de ${schema}.meu_perfil`).not.toBeNull()
      expect(
        def!.corpo.includes(`${schema}.tempo_jogado_arquivado`),
        `${schema}.meu_perfil (em ${def!.arquivo}) devolve so a soma das sessoes vivas — ` +
          'o que o purge ja apagou sumiria do perfil.',
      ).toBe(true)
    })

    it(`${schema}.reiniciar_jogo apaga o arquivado junto com as sessoes`, () => {
      const def = ultimaDefinicao(schema, 'reiniciar_jogo')
      expect(def, `nao achei nenhuma definicao de ${schema}.reiniciar_jogo`).not.toBeNull()
      expect(
        new RegExp(`delete\\s+from\\s+${schema}\\.tempo_jogado_arquivado`, 'i').test(def!.corpo),
        `${schema}.reiniciar_jogo (em ${def!.arquivo}) apaga as sessoes mas nao o arquivado — ` +
          'conta resetada apareceria com horas jogadas que nao existem mais.',
      ).toBe(true)
    })
  }
})

describe('janela de "encerrando..." do leilao (PH-126)', () => {
  it('o cliente anuncia a MESMA janela que o cron de public entrega', () => {
    // Numero duplicado entre banco e cliente, igual ao custo da evolucao
    // especial: o cron define o atraso real, o comentario do cliente explica
    // pro proximo leitor por que o tempo fica negativo. Divergir nao quebra
    // nada em execucao — so deixa a explicacao mentindo.
    const agenda = JOBS.get('leiloes-encerrar')!.agenda
    const minutos = agenda.match(/^\*\/(\d+) \* \* \* \*$/)?.[1]
    expect(minutos, `agenda inesperada em \`leiloes-encerrar\`: "${agenda}"`).toBeDefined()

    const fonte = Object.values(TEMPO_DE_LEILAO)[0]
    expect(fonte, 'nao consegui ler tempoDeLeilao.ts').toBeDefined()
    expect(
      fonte.includes(`~${minutos}min`),
      `o cron encerra leilao de ${minutos} em ${minutos} minutos, mas tempoDeLeilao.ts nao ` +
        `menciona uma janela de ~${minutos}min.`,
    ).toBe(true)
  })
})
