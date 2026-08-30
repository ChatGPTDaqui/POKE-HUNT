// PISO DE JANELA (PH-278): janela curta demais nao e simulada NEM descartada.
//
// O servidor reconstroi o mundo a cada flush, e isso cobra uma rampa por janela
// (o POKE volta pro ponto de entrada e anda ate o primeiro alvo). Medido em
// scripts/harness/custo-fixo-por-janela.mjs, a rampa e paga com folga a partir
// de 10s — de 10s pra cima o servidor rende MAIS que uma simulacao continua,
// porque a janela nova nasce com o campo cheio. Abaixo disso o quadro vira: 5s
// rende ~40% menos e 3s rende ~70% menos.
//
// Como TODO request do jogador dispara um flush, uma rajada de cliques produzia
// varias janelas de 2-5s seguidas, cada uma perto de zero — era o jogador mais
// ativo que pagava.
//
// O QUE ESTE ARQUIVO TRAVA, e que nao aparece em nenhum outro teste:
//
//  1. abaixo do piso, o claim REESCREVE A MESMA ANCORA. Se algum dia isso virar
//     `new Date(agora)` de novo, o tempo passa a ser DESCARTADO em vez de
//     represado — e o sintoma e o inverso do bug original (o jogador ativo
//     perde tempo em silencio, sem nenhum erro).
//  2. acima do piso, a ancora avanca — o comportamento de sempre. Um piso que
//     represasse tudo congelaria a hunt.
//  3. `ignorarPiso` (sessao fechando) nunca represa: ali nao ha proximo flush
//     pra herdar o tempo, entao represar seria descartar.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Config } from './db.js'
import type { LinhaSessao } from './progresso.js'

/** Corpo de cada PATCH com representacao, na ordem. */
const PATCHES: { caminho: string; patch: Record<string, unknown> }[] = []

/** Sentinela: para o flush logo depois do claim, sem simular o mundo. */
class ParouNaLeitura extends Error {}

vi.mock('./db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./db.js')>()
  return {
    ...real,
    atualizarRetornando: vi.fn(async (_cfg: unknown, caminho: string, patch: Record<string, unknown>) => {
      PATCHES.push({ caminho, patch })
      if (!caminho.startsWith('game_sessions')) return []
      return [{ id: 'sessao-1' }]
    }),
    atualizar: vi.fn(async () => {}),
    selecionar: vi.fn(async (_cfg: unknown, caminho: string) => { throw new ParouNaLeitura(caminho) }),
    selecionarTudo: vi.fn(async (_cfg: unknown, caminho: string) => { throw new ParouNaLeitura(caminho) }),
    chamarRpc: vi.fn(async () => ({ ok: true })),
    inserir: vi.fn(async () => []),
    apagar: vi.fn(async () => {}),
  }
})

const { aplicarFlush, PISO_DE_JANELA_SEGUNDOS } = await import('./progresso.js')
const cfg = {} as Config
const USER = 'jogador-1'

/** Sessao cuja ancora esta `segundosAtras` segundos no passado. */
function sessao(segundosAtras: number): LinhaSessao {
  return {
    id: 'sessao-1',
    user_id: USER,
    map_id: 'floresta',
    poke_uid: 'poke-1',
    seed: 1,
    rng_state: 1,
    rng_draws: 0,
    last_flush_at: new Date(Date.now() - segundosAtras * 1000).toISOString(),
    simulated_seconds: 0,
    closed_at: null,
    flushing_since: null,
    sequence_index: 0,
    sequence_cleared: false,
    sala_indice: 0,
    sala_chave: null,
    sala_abates: 0,
    ciclos: 0,
    sala_protetor: null,
  }
}

/** A ancora que o claim gravou. */
async function ancoraGravada(linha: LinhaSessao, opcoes = {}): Promise<string> {
  await aplicarFlush(cfg, USER, linha, opcoes).catch(() => {})
  const claims = PATCHES.filter((p) => p.caminho.startsWith('game_sessions'))
  expect(claims, 'nenhum PATCH de claim saiu — o teste rodaria no vacuo').toHaveLength(1)
  return String(claims[0]!.patch.last_flush_at)
}

beforeEach(() => {
  PATCHES.length = 0
  vi.clearAllMocks()
})

describe('piso de janela do flush (PH-278)', () => {
  it('o piso e de 10s — o ponto de virada medido, e nao um numero solto', () => {
    // Abaixo de 10s a bancada mede saldo negativo com lure em 4 (-3,7% em 8s,
    // -42,6% em 5s). Mexer aqui sem refazer scripts/harness/custo-fixo-por-janela.mjs
    // e chute.
    expect(PISO_DE_JANELA_SEGUNDOS).toBe(10)
  })

  it.each([0, 1, 5, 9])('janela de %ds NAO move a ancora — o tempo acumula', async (s) => {
    const linha = sessao(s)
    expect(
      await ancoraGravada(linha),
      'a ancora avancou numa janela abaixo do piso: o tempo foi DESCARTADO em vez de represado',
    ).toBe(linha.last_flush_at)
  })

  it.each([10, 11, 30, 300])('janela de %ds move a ancora, como sempre', async (s) => {
    const linha = sessao(s)
    expect(
      await ancoraGravada(linha),
      'a ancora ficou parada numa janela util — a hunt congelaria',
    ).not.toBe(linha.last_flush_at)
  })

  it('`ignorarPiso` (sessao fechando) nunca represa, nem numa janela de 1s', async () => {
    // Fechar a hunt nao tem "proximo flush": represar aqui vira descarte.
    const linha = sessao(1)
    expect(await ancoraGravada(linha, { ignorarPiso: true })).not.toBe(linha.last_flush_at)
  })

  it('intervalo NEGATIVO (relogio pra tras) continua re-ancorando', async () => {
    // Sem esta guarda, uma ancora no futuro deixaria todo flush seguinte
    // "abaixo do piso" e a hunt congelaria ate o relogio alcancar a ancora —
    // exatamente o oposto do que o piso quer.
    const linha = sessao(-3600)
    expect(
      await ancoraGravada(linha),
      'ancora no futuro ficou parada: a hunt congela ate o relogio alcancar',
    ).not.toBe(linha.last_flush_at)
  })

  it('o filtro do claim continua sendo o CAS, represado ou nao', async () => {
    // A ancora reescrita e a MESMA, mas o `last_flush_at=eq.<lido>` no filtro
    // nao pode sumir — e ele que serializa o flush de janela util.
    await aplicarFlush(cfg, USER, sessao(3)).catch(() => {})
    const claim = PATCHES.find((p) => p.caminho.startsWith('game_sessions'))!
    expect(claim.caminho).toContain('last_flush_at=eq.')
    expect(claim.caminho).toContain('closed_at=is.null')
    // `flushing_since` entra sempre: e ela que faz um /estado concorrente
    // esperar em vez de ler no meio da escrita.
    expect(claim.patch.flushing_since).toEqual(expect.any(String))
  })
})
